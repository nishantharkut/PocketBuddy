import datetime as dt
import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.wellness import (  # noqa: E402
    INDIA_STANDARD_TIME_OFFSET_MINUTES,
    average_meal_gap_hours,
    current_meal_gap_hours,
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


if __name__ == "__main__":
    unittest.main()
