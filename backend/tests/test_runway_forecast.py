import datetime as dt
import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.runway import build_runway_forecast, derive_pool_obligations  # noqa: E402


NOW = dt.datetime(2026, 7, 8, 12, 0, 0)


def txn(
    amount: int,
    *,
    days_ago: int = 1,
    direction: str = "debit",
    category: str = "food",
    merchant: str = "Campus Canteen",
    status: str = "posted",
):
    return {
        "_id": f"txn-{amount}-{days_ago}-{direction}-{status}",
        "amount": amount,
        "direction": direction,
        "category": category,
        "mapped_merchant_name": merchant,
        "raw_merchant_string": merchant,
        "status": status,
        "created_at": NOW - dt.timedelta(days=days_ago),
    }


class RunwayForecastTests(unittest.TestCase):
    def test_missing_allowance_returns_setup_required_not_healthy(self):
        forecast = build_runway_forecast(
            profile={},
            transactions=[],
            subscriptions=[],
            now=NOW,
        )

        self.assertEqual(forecast["status"], "setup_required")
        self.assertTrue(forecast["setup_required"])
        self.assertEqual(forecast["projection"]["ask_home_amount"], 0)
        self.assertEqual(forecast["action"]["type"], "complete_setup")

    def test_no_spend_history_uses_temporary_cap_and_low_confidence(self):
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=[],
            subscriptions=[],
            now=NOW,
        )

        self.assertEqual(forecast["status"], "healthy")
        self.assertEqual(forecast["action"]["type"], "calibrate_pace")
        self.assertEqual(forecast["confidence"]["level"], "low")
        self.assertEqual(forecast["projection"]["pace_source"], "no_recent_history")
        self.assertGreater(forecast["projection"]["safe_daily_spend"], 0)

    def test_zero_safe_daily_pauses_flexible_spend_without_fake_budget(self):
        forecast = build_runway_forecast(
            profile={
                "monthly_allowance": 100_000,
                "cycle_start_day": 1,
                "mess_enrolled": True,
                "mess_billing_model": "monthly",
                "mess_monthly_cost": 100_000,
            },
            transactions=[],
            subscriptions=[],
            now=NOW,
        )

        self.assertEqual(forecast["status"], "watch")
        self.assertEqual(forecast["action"]["type"], "pause_flexible")
        self.assertEqual(forecast["projection"]["safe_daily_spend"], 0)
        self.assertIn("No flexible spend", forecast["decision_engine"]["summary"])

    def test_subscription_due_before_reset_reduces_safe_daily(self):
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=[txn(10_000, days_ago=1)],
            subscriptions=[
                {
                    "service_name": "Music",
                    "amount": 99_00,
                    "is_active": True,
                    "billing_cycle": "monthly",
                    "next_debit_date": NOW + dt.timedelta(days=2),
                }
            ],
            now=NOW,
        )

        self.assertEqual(forecast["commitments"]["by_kind"]["subscription"], 99_00)
        self.assertLess(
            forecast["projection"]["safe_daily_spend"],
            forecast["current_cycle"]["remaining"] // max(1, forecast["current_cycle"]["days_left"]),
        )

    def test_inactive_subscription_is_ignored(self):
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=[txn(10_000, days_ago=1)],
            subscriptions=[
                {
                    "service_name": "Paused",
                    "amount": 499_00,
                    "is_active": False,
                    "next_debit_date": NOW + dt.timedelta(days=2),
                }
            ],
            now=NOW,
        )

        self.assertEqual(forecast["commitments"]["by_kind"].get("subscription", 0), 0)

    def test_possible_subscription_is_review_only_not_committed_spend(self):
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=[txn(10_000, days_ago=1)],
            subscriptions=[
                {
                    "service_name": "Maybe Cloud Storage",
                    "amount_paise": 299_00,
                    "is_active": True,
                    "status": "possible",
                    "billing_cycle": "monthly",
                    "next_debit_date": NOW + dt.timedelta(days=2),
                }
            ],
            now=NOW,
        )

        self.assertEqual(forecast["commitments"]["by_kind"].get("subscription", 0), 0)
        self.assertEqual(forecast["commitments"]["possible_commitments_total"], 299_00)
        self.assertEqual(forecast["commitments"]["possible_commitments"][0]["status"], "possible")

    def test_confirmed_subscription_accepts_amount_paise(self):
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=[txn(10_000, days_ago=1)],
            subscriptions=[
                {
                    "service_name": "Confirmed Cloud Storage",
                    "amount_paise": 199_00,
                    "is_active": True,
                    "status": "confirmed",
                    "billing_cycle": "monthly",
                    "next_debit_date": NOW + dt.timedelta(days=2),
                }
            ],
            now=NOW,
        )

        self.assertEqual(forecast["commitments"]["by_kind"]["subscription"], 199_00)

    def test_next_best_action_prefers_controllable_subscription_before_ask_home(self):
        transactions = [txn(45_000, days_ago=day, category="food") for day in range(1, 12)]

        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=transactions,
            subscriptions=[
                {
                    "service_name": "Premium Storage",
                    "amount": 350_000,
                    "is_active": True,
                    "status": "confirmed",
                    "billing_cycle": "monthly",
                    "next_debit_date": NOW + dt.timedelta(days=2),
                }
            ],
            now=NOW,
        )

        self.assertEqual(forecast["action"]["type"], "ask_home")
        self.assertEqual(forecast["decision_engine"]["next_best_action"]["type"], "review_subscription")

    def test_long_horizon_outputs_are_marked_as_scenarios(self):
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=[txn(10_000, days_ago=day, category="food") for day in range(1, 8)],
            subscriptions=[],
            now=NOW,
        )

        self.assertTrue(forecast["horizons"])
        self.assertTrue(all(item["mode"] == "scenario" for item in forecast["horizons"]))
        self.assertTrue(all("recent pace" in item["basis"] for item in forecast["horizons"]))

    def test_exam_buffer_is_reserved_only_during_overlap(self):
        with_overlap = build_runway_forecast(
            profile={
                "monthly_allowance": 1_000_000,
                "cycle_start_day": 1,
                "exam_start_date": "2026-07-10",
                "exam_end_date": "2026-07-15",
                "exam_safety_buffer": 75_000,
            },
            transactions=[txn(10_000, days_ago=1)],
            subscriptions=[],
            now=NOW,
        )
        without_overlap = build_runway_forecast(
            profile={
                "monthly_allowance": 1_000_000,
                "cycle_start_day": 1,
                "exam_start_date": "2026-08-10",
                "exam_end_date": "2026-08-15",
                "exam_safety_buffer": 75_000,
            },
            transactions=[txn(10_000, days_ago=1)],
            subscriptions=[],
            now=NOW,
        )

        self.assertEqual(with_overlap["commitments"]["by_kind"]["exam_buffer"], 75_000)
        self.assertEqual(without_overlap["commitments"]["by_kind"].get("exam_buffer", 0), 0)

    def test_per_meal_mess_commitment_uses_days_left(self):
        forecast = build_runway_forecast(
            profile={
                "monthly_allowance": 1_000_000,
                "cycle_start_day": 1,
                "mess_enrolled": True,
                "mess_billing_model": "per_meal",
                "mess_per_meal_cost": 5_000,
                "mess_meals_per_day": 2,
            },
            transactions=[txn(10_000, days_ago=1)],
            subscriptions=[],
            now=NOW,
        )

        self.assertEqual(
            forecast["commitments"]["by_kind"]["mess"],
            forecast["current_cycle"]["days_left"] * 10_000,
        )

    def test_pool_obligations_match_user_id_before_legacy_name(self):
        pools = [
            {
                "_id": "pool-1",
                "status": "closed",
                "host_id": "host-1",
                "platform": "food_delivery",
                "delivery_fee": 6_000,
            }
        ]
        items = [
            {"pool_id": "pool-1", "added_by_user_id": "user-1", "added_by_name": "Same Name", "estimated_price": 40_000, "is_purchased": True},
            {"pool_id": "pool-1", "added_by_user_id": "user-2", "added_by_name": "Same Name", "estimated_price": 50_000, "is_purchased": True},
        ]

        obligations = derive_pool_obligations(pools, items, user_id="user-1", user_name="Same Name", now=NOW)

        self.assertEqual(len(obligations), 1)
        self.assertEqual(obligations[0]["amount"], 43_000)

    def test_verified_completed_pool_payment_removes_obligation(self):
        pools = [
            {
                "_id": "pool-1",
                "status": "completed",
                "host_id": "host-1",
                "payments": [{"user_id": "user-1", "status": "verified"}],
            }
        ]
        items = [
            {"pool_id": "pool-1", "added_by_user_id": "user-1", "added_by_name": "Student", "estimated_price": 40_000, "is_purchased": True},
        ]

        obligations = derive_pool_obligations(pools, items, user_id="user-1", user_name="Student", now=NOW)

        self.assertEqual(obligations, [])

    def test_duplicates_refunds_and_allowance_credit_are_not_double_counted(self):
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=[
                txn(1_000_000, days_ago=1, direction="credit", category="income", merchant="Allowance from home"),
                txn(10_000, days_ago=1, category="food"),
                txn(90_000, days_ago=1, category="food", status="duplicate"),
                txn(80_000, days_ago=1, category="food", status="refunded"),
            ],
            subscriptions=[],
            now=NOW,
        )

        self.assertEqual(forecast["current_cycle"]["available_funding"], 1_000_000)
        self.assertEqual(forecast["current_cycle"]["spent"], 10_000)

    def test_profile_routine_explicitly_supports_pg_day_scholar_and_mixed(self):
        for routine in ("pg_cooking", "day_scholar", "mixed"):
            forecast = build_runway_forecast(
                profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1, "meal_routine": routine},
                transactions=[txn(10_000, days_ago=1)],
                subscriptions=[],
                now=NOW,
            )
            self.assertEqual(forecast["food_routine"]["type"], routine)

    def test_empirical_stress_band_uses_high_spend_days(self):
        transactions = [txn(10_000, days_ago=day, category="food") for day in range(1, 8)]
        transactions.append(txn(90_000, days_ago=2, category="shopping", merchant="Mall"))

        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_000_000, "cycle_start_day": 1},
            transactions=transactions,
            subscriptions=[],
            now=NOW,
        )

        band = forecast["projection"]["stress_band"]
        self.assertGreaterEqual(band["stress"]["daily_spend"], band["expected"]["daily_spend"])
        self.assertLessEqual(band["stress"]["days_until_broke"], band["expected"]["days_until_broke"])
        self.assertIn("empirical_stress_probability", band["risk_sources"])
        self.assertTrue(any(driver["kind"] == "high_spend_day" for driver in forecast["drivers"]))

    def test_subscription_pressure_gets_single_priority_action(self):
        transactions = [txn(30_000, days_ago=day, category="food") for day in range(1, 10)]
        transactions.append(txn(90_000, days_ago=2, category="shopping", merchant="Mall"))

        forecast = build_runway_forecast(
            profile={"monthly_allowance": 1_500_000, "cycle_start_day": 1},
            transactions=transactions,
            subscriptions=[
                {
                    "service_name": "Cloud Storage",
                    "amount": 300_000,
                    "is_active": True,
                    "billing_cycle": "monthly",
                    "next_debit_date": NOW + dt.timedelta(days=2),
                }
            ],
            now=NOW,
        )

        self.assertEqual(forecast["decision_engine"]["next_best_action"]["type"], "review_subscription")
        self.assertTrue(any(driver["kind"] == "subscriptions" for driver in forecast["drivers"]))


if __name__ == "__main__":
    unittest.main()
