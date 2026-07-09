import datetime
import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.api.travel import (  # noqa: E402
    _normalize_ai_coach_response,
    _travel_safety_advice,
    build_fare_explanation,
    build_ride_pool_safety_context,
    build_travel_report_candidate,
    build_travel_runway_impact,
    build_travel_ai_prompt,
    build_travel_trust_metadata,
    compute_travel_verification_threshold,
    _normalize_travel_time_context,
    _public_split_suggestion,
    _robust_fare_range,
    _travel_time_fare_factor,
    _trusted_fare_reports,
)


def _report(user_id: str, amount: float, days_ago: int = 1, **extra):
    created_at = datetime.datetime.utcnow() - datetime.timedelta(days=days_ago)
    return {
        "user_id": user_id,
        "final_amount": amount,
        "created_at": created_at,
        "upvotes": [],
        "downvotes": [],
        **extra,
    }


class TravelGuardTrustTests(unittest.TestCase):
    def test_travel_threshold_never_uses_tiny_three_report_count(self):
        threshold = compute_travel_verification_threshold(active_reporters=8)

        self.assertGreaterEqual(threshold, 5)

    def test_travel_threshold_scales_with_route_reporter_population(self):
        small_campus = compute_travel_verification_threshold(active_reporters=20)
        large_campus = compute_travel_verification_threshold(active_reporters=1200)

        self.assertGreater(large_campus, small_campus)
        self.assertLessEqual(large_campus, 25)

    def test_repeated_reports_from_same_user_count_once_for_fare_model(self):
        reports = [
            _report("u1", 160, days_ago=4),
            _report("u1", 900, days_ago=1),
            _report("u2", 165),
            _report("u3", 170),
            _report("u4", 175),
            _report("u5", 180),
        ]

        trusted = _trusted_fare_reports(reports)
        reporter_ids = [r["user_id"] for r in trusted]

        self.assertEqual(reporter_ids.count("u1"), 1)
        self.assertEqual(len(set(reporter_ids)), len(reporter_ids))
        self.assertIn(900, [r["final_amount"] for r in trusted])
        self.assertNotIn(160, [r["final_amount"] for r in trusted])

    def test_three_student_reports_do_not_override_distance_model(self):
        reports = [
            _report("u1", 150),
            _report("u2", 160),
            _report("u3", 170),
        ]

        trusted = _trusted_fare_reports(reports)
        robust = _robust_fare_range([r["final_amount"] for r in trusted])

        self.assertIsNone(robust)

    def test_five_distinct_recent_reports_can_create_student_anchor(self):
        reports = [
            _report("u1", 150),
            _report("u2", 155),
            _report("u3", 160),
            _report("u4", 165),
            _report("u5", 1000),
        ]

        trusted = _trusted_fare_reports(reports)
        robust = _robust_fare_range([r["final_amount"] for r in trusted])

        self.assertIsNotNone(robust)
        self.assertEqual(robust["sample_size"], 5)
        self.assertLess(robust["median_fare"], 200)

    def test_travel_trust_metadata_marks_learning_before_threshold(self):
        metadata = build_travel_trust_metadata({
            "fare_source": "distance_model",
            "report_sample_size": 3,
            "report_threshold": 5,
        })

        self.assertEqual(metadata["trust_stage"], "learning")
        self.assertEqual(metadata["trust_badge"], "Learning")
        self.assertIn("3/5", metadata["trust_reason"])

    def test_travel_trust_metadata_marks_student_verified_after_threshold(self):
        metadata = build_travel_trust_metadata({
            "fare_source": "student_reports",
            "report_sample_size": 5,
            "report_threshold": 5,
        })

        self.assertEqual(metadata["trust_stage"], "student_verified")
        self.assertEqual(metadata["trust_badge"], "Student verified")
        self.assertGreaterEqual(metadata["trust_score"], 80)

    def test_travel_trust_metadata_keeps_empty_routes_as_model_estimates(self):
        metadata = build_travel_trust_metadata({
            "fare_source": "distance_model",
            "report_sample_size": 0,
            "report_threshold": 5,
        })

        self.assertEqual(metadata["trust_stage"], "model_estimate")
        self.assertEqual(metadata["trust_badge"], "Model estimate")
        self.assertIn("distance", metadata["trust_reason"].lower())

    def test_nova_prompt_forbids_invented_fares_and_live_app_claims(self):
        prompt = build_travel_ai_prompt(
            college="ABV-IIITM Gwalior",
            region="Gwalior, Madhya Pradesh",
            route_name="Gwalior Railway Station to ABV-IIITM",
            distance_km=12.0,
            mode="Auto",
            min_fare=140,
            max_fare=180,
            median_fare=160,
            fare_anchor=165,
            fare_anchor_label="5 distinct student reports",
            report_count=5,
            surge_context="",
            user_situation="late night with luggage",
            dialect="friendly student Hindi",
        )

        self.assertIn("Never invent fare numbers", prompt)
        self.assertIn("Do not imply live Ola, Uber, Rapido", prompt)
        self.assertIn("Selected travel timing", prompt)
        self.assertIn("Output ONLY valid JSON", prompt)

    def test_travel_ai_coach_falls_back_when_bedrock_invents_fare_numbers(self):
        fallback_response = {
            "script": "Bhaiya, ABV-IIITM Gate 1 chalo na. Regular student rate Rs 165 hai.",
            "tactics": [
                "Compare the quote with the Rs 165 anchor before agreeing.",
                "Walk 100 meters away from the station stand before negotiating.",
                "Stay within the Rs 140 to Rs 180 campus range.",
            ],
            "safety": "Use a busy pickup point, confirm the vehicle, and share your trip details if you feel rushed.",
            "surge_factor": 1.0,
            "community_median": 165,
            "fare_anchor": 165,
            "fare_anchor_source": "student_reports",
            "fare_anchor_label": "5 distinct student reports",
            "report_count": 5,
        }

        response = _normalize_ai_coach_response(
            {
                "script": "Bhaiya, Rs 320 final kar lo.",
                "tactics": [
                    "Use the live Uber fare as the real benchmark.",
                    "Tell the driver student reports say Rs 320 is normal.",
                    "Accept anything under Rs 300 at night.",
                ],
                "safety": "The CCTV coverage keeps this route guaranteed safe.",
            },
            fallback_response,
            surge_factor=1.0,
            fare_anchor=165,
            fare_anchor_source="student_reports",
            fare_anchor_label="5 distinct student reports",
            report_count=5,
            min_fare=140,
            max_fare=180,
            median_fare=160,
            route_name="Gwalior Railway Station to ABV-IIITM",
            mode="Auto",
            travel_time_context="evening",
            app_quote=None,
            facts_used=["route=Gwalior Railway Station to ABV-IIITM", "fare_anchor_rs=165"],
        )

        self.assertEqual(response["source"], "local_fallback")
        self.assertEqual(response["script"], fallback_response["script"])
        self.assertEqual(response["bedrock_error"], "ungrounded_response")
        self.assertTrue(response["grounding"]["fallback_used"])

    def test_travel_ai_coach_keeps_grounded_backend_numbers(self):
        fallback_response = {
            "script": "fallback script",
            "tactics": ["fallback one", "fallback two", "fallback three"],
            "safety": "fallback safety",
            "surge_factor": 1.18,
            "community_median": 165,
            "fare_anchor": 165,
            "fare_anchor_source": "student_reports",
            "fare_anchor_label": "5 distinct student reports",
            "report_count": 5,
        }

        response = _normalize_ai_coach_response(
            {
                "script": "Bhaiya, regular student rate Rs 165 hai. Rs 165 final?",
                "tactics": [
                    "Compare any app quote with Rs 165 before agreeing.",
                    "If the quote stays above Rs 180, step away from the stand and ask the next driver.",
                    "Use the Rs 140 to Rs 180 campus range as the counter-anchor.",
                ],
                "safety": "Use a busy pickup point and share your trip details before leaving.",
            },
            fallback_response,
            surge_factor=1.18,
            fare_anchor=165,
            fare_anchor_source="student_reports",
            fare_anchor_label="5 distinct student reports",
            report_count=5,
            min_fare=140,
            max_fare=180,
            median_fare=160,
            route_name="Gwalior Railway Station to ABV-IIITM",
            mode="Auto",
            travel_time_context="evening",
            app_quote=195,
            facts_used=["route=Gwalior Railway Station to ABV-IIITM", "fare_anchor_rs=165"],
        )

        self.assertEqual(response["source"], "bedrock")
        self.assertEqual(len(response["tactics"]), 3)
        self.assertIn("Rs 165", response["script"])
        self.assertEqual(response["grounding"]["status"], "grounded")

    def test_travel_safety_advice_stays_actionable_when_day_score_is_only_a_label(self):
        advice = _travel_safety_advice(
            {
                "safety_score_day": "High Safety",
                "safety_score_night": "Avoid shared routes after 9:00 PM. Prefer pre-booked cabs.",
            },
            "afternoon",
        )

        self.assertIn("busy pickup point", advice.lower())
        self.assertNotEqual(advice, "High Safety")

    def test_travel_time_context_normalizes_user_selected_periods(self):
        self.assertEqual(_normalize_travel_time_context("Morning"), "morning")
        self.assertEqual(_normalize_travel_time_context("evening_rush"), "evening")
        self.assertEqual(_normalize_travel_time_context("late night"), "late_night")
        self.assertEqual(_normalize_travel_time_context("unknown"), "now")
        self.assertGreater(_travel_time_fare_factor("evening"), _travel_time_fare_factor("afternoon"))

    def test_split_suggestion_is_suppressed_for_late_night_or_luggage(self):
        suggestion = _public_split_suggestion(
            origin="ABV-IIITM Gate 1",
            destination="Gwalior Railway Station",
            campus_city="Gwalior",
            distance_km=10.5,
            modes=[
                {"mode": "Auto", "median_fare": 180},
                {"mode": "Shared Auto", "median_fare": 45},
            ],
            geometry=[[26.2514, 78.1685], [26.2162, 78.1826]],
            lat1=26.2514,
            lon1=78.1685,
            lat2=26.2162,
            lon2=78.1826,
            time_context="late_night",
            has_luggage=True,
        )

        self.assertTrue(suggestion["available"])
        self.assertFalse(suggestion["recommended"])
        self.assertIn("direct", suggestion["reason"].lower())
        self.assertIn("late night", " ".join(suggestion["avoid_when"]).lower())

    def test_split_suggestion_uses_curated_public_transfer_language(self):
        suggestion = _public_split_suggestion(
            origin="ABV-IIITM Gate 1",
            destination="Gwalior Railway Station",
            campus_city="Gwalior",
            distance_km=10.5,
            modes=[
                {"mode": "Auto", "median_fare": 180},
                {"mode": "Shared Auto", "median_fare": 45},
            ],
            geometry=[[26.2514, 78.1685], [26.2162, 78.1826]],
            lat1=26.2514,
            lon1=78.1685,
            lat2=26.2162,
            lon2=78.1826,
            time_context="morning",
            has_luggage=False,
        )

        self.assertTrue(suggestion["available"])
        self.assertEqual(suggestion["source"], "curated_public_landmark")
        self.assertIn("curated", suggestion["reason"].lower())
        self.assertNotIn("Split near", suggestion["reason"])

    def test_split_suggestion_returns_backend_owned_strategy_numbers(self):
        suggestion = _public_split_suggestion(
            origin="ABV-IIITM Gate 1",
            destination="Gwalior Railway Station",
            campus_city="Gwalior",
            distance_km=10.5,
            modes=[
                {"mode": "Auto", "median_fare": 180},
                {"mode": "Shared Auto", "median_fare": 45},
            ],
            geometry=[[26.2514, 78.1685], [26.2162, 78.1826]],
            lat1=26.2514,
            lon1=78.1685,
            lat2=26.2162,
            lon2=78.1826,
            time_context="morning",
            has_luggage=False,
        )

        self.assertIn("direct_strategy", suggestion)
        self.assertIn("split_strategy", suggestion)
        self.assertEqual(suggestion["direct_strategy"]["total_fare"], 180)
        self.assertEqual(suggestion["split_strategy"]["total_fare"], 45)
        self.assertEqual(len(suggestion["split_strategy"]["legs"]), 3)
        self.assertIn("Transfer", suggestion["split_strategy"]["legs"][1]["label"])

    def test_fare_explanation_makes_source_and_trust_visible_without_live_app_claim(self):
        explanation = build_fare_explanation(
            mode_doc={
                "mode": "Auto",
                "min_fare": 150,
                "max_fare": 190,
                "median_fare": 170,
                "fare_source": "student_reports",
                "fare_basis": "7 distinct recent student fare reports",
                "report_sample_size": 7,
                "report_threshold": 5,
                "trust_stage": "student_verified",
                "trust_badge": "Student verified",
                "trust_reason": "7 distinct student fare reports confirm this route and mode.",
            },
            route_source="osrm_route",
            price_basis="Mapped road distance plus campus-local fare rules. These are not ride-app API prices.",
            eta_basis="Mapped driving ETA without live traffic.",
            time_context="evening",
            routing_cache_hit=True,
        )

        self.assertEqual(explanation["route_source_label"], "Mapped road route, cached")
        self.assertEqual(explanation["fare_source_label"], "Student verified")
        self.assertEqual(explanation["reports_label"], "7/5 trusted reports")
        self.assertIn("evening rush", explanation["timing_label"])
        self.assertIn("not live ride-app pricing", explanation["pricing_disclaimer"].lower())

    def test_runway_impact_translates_fare_into_safe_day_budget(self):
        impact = build_travel_runway_impact(
            fare_rs=175,
            runway_context={
                "safe_daily_budget_rs": 250,
                "days_until_reset": 12,
                "remaining_allowance_rs": 3000,
            },
        )

        self.assertEqual(impact["safe_daily_budget_rs"], 250)
        self.assertEqual(impact["safe_day_share"], 0.7)
        self.assertIn("safe-day", impact["summary"])

    def test_ride_pool_safety_blocks_late_night_shared_hosting(self):
        departure = datetime.datetime.utcnow().replace(hour=23, minute=30, second=0, microsecond=0)
        if departure < datetime.datetime.utcnow():
            departure += datetime.timedelta(days=1)

        safety = build_ride_pool_safety_context(
            profile={"college_name": "ABV-IIITM Gwalior", "wing_label": "BH-2 Wing B"},
            departure_time=departure,
            mode="Shared Auto",
            max_passengers=4,
            host_phone="9876543210",
        )

        self.assertFalse(safety["can_create"])
        self.assertIn("late-night shared", safety["blocking_reason"].lower())

    def test_ride_pool_safety_requires_host_contact_for_accountability(self):
        departure = datetime.datetime.utcnow() + datetime.timedelta(hours=3)

        safety = build_ride_pool_safety_context(
            profile={"college_name": "ABV-IIITM Gwalior", "wing_label": "BH-2 Wing B"},
            departure_time=departure,
            mode="Auto",
            max_passengers=3,
            host_phone="",
        )

        self.assertFalse(safety["can_create"])
        self.assertIn("phone", safety["blocking_reason"].lower())

    def test_travel_report_candidate_uses_recent_payment_and_matching_fare_band(self):
        candidate = build_travel_report_candidate(
            transaction={
                "_id": "txn-1",
                "amount": 17500,
                "direction": "debit",
                "category": "travel",
                "mapped_merchant_name": "Auto Driver",
                "created_at": datetime.datetime.utcnow(),
            },
            routes=[
                {
                    "_id": "route-1",
                    "name": "Gwalior Railway Station to ABV-IIITM",
                    "modes": [
                        {"mode": "Auto", "min_fare": 140, "max_fare": 190, "median_fare": 165},
                        {"mode": "Cab", "min_fare": 250, "max_fare": 330, "median_fare": 290},
                    ],
                }
            ],
        )

        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["transaction_id"], "txn-1")
        self.assertEqual(candidate["route_id"], "route-1")
        self.assertEqual(candidate["mode"], "Auto")
        self.assertEqual(candidate["amount_paid"], 175)
        self.assertIn("confirm", candidate["action_label"].lower())


if __name__ == "__main__":
    unittest.main()
