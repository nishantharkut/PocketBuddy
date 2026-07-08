import datetime
import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.campus_food import (  # noqa: E402
    apply_food_context_metadata,
    build_price_matched_food_options,
    build_food_trust_metadata,
    build_food_recommendations,
    compute_food_verification_threshold,
    food_effective_verification_threshold,
)


class CampusFoodTrustMetadataTests(unittest.TestCase):
    def test_menu_scan_threshold_never_uses_tiny_fixed_vote_count(self):
        threshold = compute_food_verification_threshold(
            "menu_scan_pending",
            active_reviewers=8,
        )

        self.assertGreaterEqual(threshold, 5)

    def test_threshold_scales_with_campus_reviewer_population(self):
        small_campus = compute_food_verification_threshold(
            "menu_scan_pending",
            active_reviewers=20,
        )
        large_campus = compute_food_verification_threshold(
            "menu_scan_pending",
            active_reviewers=1200,
        )

        self.assertGreater(large_campus, small_campus)
        self.assertLessEqual(large_campus, 25)

    def test_price_changes_need_more_confirmations_than_new_items(self):
        new_item = compute_food_verification_threshold(
            "menu_scan_pending",
            active_reviewers=120,
        )
        price_change = compute_food_verification_threshold(
            "price_change_review",
            active_reviewers=120,
        )

        self.assertGreater(price_change, new_item)

    def test_legacy_three_vote_threshold_is_upgraded_for_review_items(self):
        item = {
            "status": "pending_verification",
            "source": "ocr_menu_scan",
            "verification_threshold": 3,
        }

        threshold = food_effective_verification_threshold(
            item,
            source_type="menu_scan_pending",
            active_reviewers=20,
        )

        self.assertGreaterEqual(threshold, 5)
        self.assertNotEqual(threshold, 3)

    def test_disputed_items_are_excluded_from_recommendations(self):
        now = datetime.datetime(2026, 7, 7, 21, 0, 0)
        items = [
            {
                "_id": "disputed",
                "venue_name": "BH-2 Night Canteen",
                "item_name": "Disputed Maggi",
                "price": 3000,
                "status": "disputed_hidden",
                "source": "ocr_menu_scan",
                "available_from": "20:00",
                "available_until": "02:00",
            },
            {
                "_id": "active-meal",
                "venue_name": "BH-2 Night Canteen",
                "item_name": "Egg Paratha",
                "price": 4500,
                "status": "active",
                "source": "community_item_quiz",
                "verification_votes": 4,
                "available_from": "20:00",
                "available_until": "02:00",
            },
        ]

        recs = build_food_recommendations(
            items,
            now=now,
            safe_food_budget_paise=5000,
            meal_gap_hours=12,
            limit=10,
        )

        self.assertEqual([item["item_name"] for item in recs], ["Egg Paratha"])

    def test_ocr_menu_candidates_are_pending_and_low_trust(self):
        now = datetime.datetime(2026, 7, 7, 12, 0, 0)
        item = {
            "status": "pending_verification",
            "source": "ocr_menu_scan",
            "verification_votes": 1,
            "price": 4500,
        }

        metadata = build_food_trust_metadata(item, now)

        self.assertEqual(metadata["source_type"], "menu_scan_pending")
        self.assertEqual(metadata["trust_badge"], "Needs review")
        self.assertLess(metadata["trust_score"], 50)
        self.assertIn("Menu scan", metadata["trust_reason"])

    def test_student_confirmed_items_are_trusted_with_vote_context(self):
        now = datetime.datetime(2026, 7, 7, 12, 0, 0)
        item = {
            "status": "active",
            "source": "community_item_quiz",
            "verification_votes": 4,
            "price": 3000,
            "price_history": [
                {"price": 3000, "changed_at": "2026-07-06T12:00:00"},
            ],
        }

        metadata = build_food_trust_metadata(item, now)

        self.assertEqual(metadata["source_type"], "student_confirmed")
        self.assertGreaterEqual(metadata["trust_score"], 80)
        self.assertIn("4 student confirmations", metadata["trust_reason"])
        self.assertEqual(metadata["last_seen_label"], "24 hours ago")

    def test_food_context_marks_items_against_budget_and_meal_gap(self):
        item = {"price": 7000}

        apply_food_context_metadata(
            item,
            safe_food_budget_paise=5000,
            meal_gap_hours=17,
        )

        self.assertEqual(item["budget_fit"], "avoid_today")
        self.assertEqual(item["budget_fit_reason"], "Above today's safe food spend")
        self.assertEqual(item["meal_gap_context"]["state"], "meal_gap_checkin")
        self.assertIn("17h", item["meal_gap_context"]["message"])

    def test_recommendations_prioritize_trusted_available_budget_fit_items(self):
        now = datetime.datetime(2026, 7, 7, 21, 0, 0)
        items = [
            {
                "_id": "ocr-magggi",
                "venue_name": "Unknown Menu Scan",
                "item_name": "Paneer Meal",
                "price": 4000,
                "status": "pending_verification",
                "source": "ocr_menu_scan",
                "verification_votes": 1,
                "available_from": "08:00",
                "available_until": "22:00",
            },
            {
                "_id": "baseline-samosa",
                "venue_name": "Library Cafe",
                "item_name": "Samosa",
                "price": 1500,
                "status": "active",
                "verification_votes": 0,
                "available_from": "10:00",
                "available_until": "19:00",
            },
            {
                "_id": "bh2-egg-paratha",
                "venue_name": "BH-2 Night Canteen",
                "item_name": "Egg Paratha",
                "price": 4500,
                "status": "active",
                "source": "community_item_quiz",
                "verification_votes": 5,
                "available_from": "20:00",
                "available_until": "02:00",
                "price_history": [{"price": 4500, "changed_at": "2026-07-07T18:00:00"}],
            },
        ]

        recs = build_food_recommendations(
            items,
            now=now,
            safe_food_budget_paise=5000,
            meal_gap_hours=17,
            limit=2,
        )

        self.assertEqual(recs[0]["item_name"], "Egg Paratha")
        self.assertEqual(recs[0]["budget_fit"], "safe")
        self.assertEqual(recs[0]["trust_badge"], "Student confirmed")
        self.assertIn("available now", recs[0]["why"].lower())
        self.assertTrue(any("student confirmations" in item for item in recs[0]["evidence"]))
        self.assertNotEqual(recs[1]["item_name"], "Paneer Meal")

    def test_recommendations_never_return_review_or_invalid_items(self):
        now = datetime.datetime(2026, 7, 7, 21, 0, 0)
        items = [
            {
                "_id": "pending-scan",
                "venue_name": "Unknown Scan",
                "item_name": "OCR Candidate",
                "price": 3000,
                "status": "pending_verification",
                "source": "ocr_menu_scan",
                "available_from": "08:00",
                "available_until": "22:00",
            },
            {
                "_id": "zero-price",
                "venue_name": "Bad Import",
                "item_name": "Broken Price",
                "price": 0,
                "status": "active",
                "available_from": "08:00",
                "available_until": "22:00",
            },
            {
                "_id": "active-meal",
                "venue_name": "BH-2 Night Canteen",
                "item_name": "Egg Paratha",
                "price": 4500,
                "status": "active",
                "source": "community_item_quiz",
                "verification_votes": 4,
                "available_from": "20:00",
                "available_until": "02:00",
            },
        ]

        recs = build_food_recommendations(
            items,
            now=now,
            safe_food_budget_paise=5000,
            meal_gap_hours=12,
            limit=10,
        )

        self.assertEqual([item["item_name"] for item in recs], ["Egg Paratha"])

    def test_food_signal_options_are_derived_from_nearby_trusted_menu_items(self):
        options = build_price_matched_food_options(
            [
                {"item_name": "Ginger Tea", "price": 1200, "status": "active"},
                {"item_name": "Samosa", "price": 1500, "status": "active"},
                {"item_name": "Paneer Thali", "price": 8500, "status": "active"},
                {"item_name": "Pending Maggi", "price": 1500, "status": "pending_verification"},
            ],
            amount_paise=1500,
        )

        self.assertEqual(options, ["Samosa", "Ginger Tea"])

    def test_food_signal_options_return_empty_when_menu_has_no_price_evidence(self):
        options = build_price_matched_food_options(
            [
                {"item_name": "Paneer Thali", "price": 8500, "status": "active"},
                {"item_name": "Cold Coffee", "price": 4500, "status": "active"},
            ],
            amount_paise=1000,
        )

        self.assertEqual(options, [])

    def test_pending_manual_menu_submission_is_not_marked_trusted(self):
        now = datetime.datetime(2026, 7, 7, 21, 0, 0)
        metadata = build_food_trust_metadata(
            {
                "item_name": "Ginger Tea",
                "price": 1200,
                "status": "pending_verification",
                "source": "manual_menu_add",
                "confirmation_count": 1,
            },
            now,
        )

        self.assertEqual(metadata["trust_badge"], "Needs review")
        self.assertEqual(metadata["source_type"], "student_menu_submission")


if __name__ == "__main__":
    unittest.main()
