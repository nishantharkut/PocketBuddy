import os
import unittest
import datetime

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.subscriptions import (
    classify_cadence,
    is_bad_merchant,
    subscription_name_for_merchant,
    canonical_merchant,
    next_future_debit,
)

class RecurringCommitmentsTests(unittest.TestCase):
    def test_classify_cadence(self):
        # Weekly: range 5-9
        self.assertEqual(classify_cadence([7])[0], "weekly")
        self.assertEqual(classify_cadence([6])[0], "weekly")

        # Biweekly: range 12-16
        self.assertEqual(classify_cadence([14])[0], "biweekly")

        # Prepaid 28 days: range 27-29
        self.assertEqual(classify_cadence([28])[0], "cycle_28")

        # Monthly: range 25-35
        self.assertEqual(classify_cadence([30])[0], "monthly")
        self.assertEqual(classify_cadence([31])[0], "monthly")

        # Quarterly: range 80-100
        self.assertEqual(classify_cadence([90])[0], "quarterly")

        # Custom gap
        self.assertEqual(classify_cadence([45])[0], "custom")

    def test_is_bad_merchant_habit_filtering(self):
        # Regular food/canteen habits should be flagged as bad
        self.assertTrue(is_bad_merchant("BH2 Canteen"))
        self.assertTrue(is_bad_merchant("Zomato Delivery"))
        self.assertTrue(is_bad_merchant("Uber Auto"))
        self.assertTrue(is_bad_merchant("Tapri Chai"))

        # Explicit passes, clubs or subscription plans should exempt from habit flags
        self.assertFalse(is_bad_merchant("Zepto Pass"))
        self.assertFalse(is_bad_merchant("Swiggy One"))
        self.assertFalse(is_bad_merchant("Blinkit Club"))

    def test_subscription_name_for_merchant(self):
        # Known subscription services
        self.assertEqual(subscription_name_for_merchant("Spotify Premium"), "Spotify")
        self.assertEqual(subscription_name_for_merchant("Netflix, Inc."), "Netflix")
        self.assertEqual(subscription_name_for_merchant("YT Premium"), "YouTube Premium")
        self.assertEqual(subscription_name_for_merchant("Google One 100GB"), "Google One")
        self.assertEqual(subscription_name_for_merchant("Zepto Pass"), "Zepto Pass")
        
        # Unknown services
        self.assertIsNone(subscription_name_for_merchant("Unknown Coffee Shop"))

    def test_next_future_debit_calculation(self):
        observed = datetime.datetime(2026, 6, 1)
        # Assuming now is after June 1, 2026
        next_debit = next_future_debit(observed, 30)
        self.assertGreater(next_debit, observed)
        self.assertEqual((next_debit - observed).days % 30, 0)

if __name__ == "__main__":
    unittest.main()
