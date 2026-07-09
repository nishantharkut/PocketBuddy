import datetime as dt
import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.wellness import (  # noqa: E402
    INDIA_STANDARD_TIME_OFFSET_MINUTES,
    average_meal_gap_hours,
    build_wellness_summary,
    current_meal_gap_hours,
    is_debit_transaction,
    is_late_night_activity,
    is_meal_checkin,
    meal_signal_events,
)


class WellnessSignalTests(unittest.TestCase):
    def test_late_night_activity_uses_clear_11pm_to_5am_window(self):
        day = dt.datetime(2026, 7, 9)

        self.assertTrue(is_late_night_activity(day.replace(hour=23, minute=10)))
        self.assertTrue(is_late_night_activity(day.replace(hour=4, minute=59)))
        self.assertFalse(is_late_night_activity(day.replace(hour=5, minute=0)))
        self.assertFalse(is_late_night_activity(day.replace(hour=22, minute=59)))

    def test_late_night_activity_can_use_campus_timezone_offset(self):
        day = dt.datetime(2026, 7, 9)

        self.assertTrue(is_late_night_activity(
            day.replace(hour=18, minute=0),
            timezone_offset_minutes=INDIA_STANDARD_TIME_OFFSET_MINUTES,
        ))
        self.assertFalse(is_late_night_activity(
            day.replace(hour=11, minute=0),
            timezone_offset_minutes=INDIA_STANDARD_TIME_OFFSET_MINUTES,
        ))

    def test_meal_checkin_counts_without_creating_transaction(self):
        now = dt.datetime(2026, 7, 9, 15, 0)
        transactions = [
            {"category": "food", "created_at": now - dt.timedelta(hours=12)},
        ]
        checkins = [
            {
                "response": "meal_logged",
                "meal_source": "mess",
                "created_at": now - dt.timedelta(hours=2),
            }
        ]

        events = meal_signal_events(transactions, checkins)

        self.assertEqual(len(events), 2)
        self.assertEqual(events[-1]["source"], "checkin")
        self.assertEqual(current_meal_gap_hours(now, events), 2)

    def test_skipped_meal_context_does_not_reset_gap(self):
        now = dt.datetime(2026, 7, 9, 15, 0)
        transactions = [
            {"category": "food", "created_at": now - dt.timedelta(hours=9)},
        ]
        checkins = [
            {
                "response": "meal_skipped",
                "created_at": now - dt.timedelta(hours=1),
            }
        ]

        events = meal_signal_events(transactions, checkins)

        self.assertFalse(is_meal_checkin(checkins[0]))
        self.assertEqual(len(events), 1)
        self.assertEqual(current_meal_gap_hours(now, events), 9)

    def test_meal_source_is_enough_for_forward_compatible_meal_logs(self):
        checkin = {
            "response": "new_meal_label",
            "meal_source": "cooked",
            "created_at": dt.datetime(2026, 7, 9, 13, 0),
        }

        self.assertTrue(is_meal_checkin(checkin))

    def test_average_meal_gap_includes_current_gap(self):
        now = dt.datetime(2026, 7, 9, 18, 0)
        events = meal_signal_events(
            [
                {"category": "food", "created_at": now - dt.timedelta(hours=10)},
                {"category": "food", "created_at": now - dt.timedelta(hours=4)},
            ],
            [],
        )

        self.assertEqual(average_meal_gap_hours(now, events), 5)

    def test_credit_transactions_are_not_treated_as_debits(self):
        self.assertFalse(is_debit_transaction({"direction": "credit", "amount": 1000}))
        self.assertTrue(is_debit_transaction({"direction": "debit", "amount": 1000}))
        self.assertTrue(is_debit_transaction({"amount": 1000}))

    def test_missing_meal_signal_requests_checkin_without_marking_attention(self):
        summary = build_wellness_summary(
            meal_events_count_7d=0,
            current_food_gap_hours=None,
            avg_food_gap_hours_7d=None,
            late_night_activity_7d=0,
            runway_days=15,
            safe_daily_limit_rs=220,
            spend_velocity=1.0,
            in_exam_period=False,
        )

        self.assertEqual(summary["status"], "watch")
        self.assertEqual(summary["primary_action"]["key"], "meal_checkin")
        self.assertEqual(summary["signals"][0]["state"], "missing")
        self.assertEqual(summary["signals"][0]["value"], "Missing")

    def test_exam_window_only_changes_context_when_other_signals_are_stable(self):
        baseline = build_wellness_summary(
            meal_events_count_7d=4,
            current_food_gap_hours=4,
            avg_food_gap_hours_7d=5,
            late_night_activity_7d=0,
            runway_days=16,
            safe_daily_limit_rs=250,
            spend_velocity=1.0,
            in_exam_period=False,
        )
        exam = build_wellness_summary(
            meal_events_count_7d=4,
            current_food_gap_hours=4,
            avg_food_gap_hours_7d=5,
            late_night_activity_7d=0,
            runway_days=16,
            safe_daily_limit_rs=250,
            spend_velocity=1.0,
            in_exam_period=True,
        )

        self.assertEqual(baseline["score"], exam["score"])
        self.assertEqual(exam["status"], "steady")
        self.assertEqual(exam["signals"][-1]["severity"], "watch")

    def test_exam_period_prefers_meal_action_when_meal_signal_is_stale(self):
        summary = build_wellness_summary(
            meal_events_count_7d=2,
            current_food_gap_hours=13,
            avg_food_gap_hours_7d=11,
            late_night_activity_7d=0,
            runway_days=14,
            safe_daily_limit_rs=180,
            spend_velocity=1.0,
            in_exam_period=True,
        )

        self.assertEqual(summary["primary_action"]["key"], "meal_checkin")
        self.assertEqual(summary["signals"][0]["severity"], "attention")
        self.assertIn("exam-day meal", summary["primary_action"]["title"].lower())

    def test_runway_attention_message_and_action_are_not_duplicate_copy(self):
        summary = build_wellness_summary(
            meal_events_count_7d=3,
            current_food_gap_hours=4,
            avg_food_gap_hours_7d=5,
            late_night_activity_7d=0,
            runway_days=0,
            safe_daily_limit_rs=0,
            spend_velocity=1.6,
            in_exam_period=False,
        )

        self.assertEqual(summary["primary_action"]["key"], "review_runway")
        self.assertIn("effectively exhausted", summary["primary_action"]["detail"].lower())
        self.assertNotEqual(summary["message"], summary["primary_action"]["detail"])


if __name__ == "__main__":
    unittest.main()
