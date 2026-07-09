import os
import unittest
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.api import checkins  # noqa: E402


class FakeCheckinLogs:
    def __init__(self):
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)
        return {"inserted_id": doc["_id"]}


class FakeDb:
    def __init__(self):
        self.checkin_logs = FakeCheckinLogs()


class CheckinApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_meal_checkin_normalizes_source_and_context_note(self):
        db = FakeDb()
        req = checkins.CheckinReq(
            response=" Meal_Logged ",
            food_gap_hours=9.5,
            meal_source="MESS",
            context_note="x" * 520,
            suggestion_given="meal_gap_checkin",
        )

        with patch("app.api.checkins.get_db", return_value=db):
            result = await checkins.insert_checkin(req, user_id="user-1")

        self.assertEqual(result["status"], "ok")
        doc = db.checkin_logs.inserted[0]
        self.assertEqual(doc["user_id"], "user-1")
        self.assertEqual(doc["response"], "meal_logged")
        self.assertEqual(doc["meal_source"], "mess")
        self.assertTrue(doc["is_meal_signal"])
        self.assertEqual(doc["gap_hours"], 9.5)
        self.assertEqual(doc["food_gap_hours"], 9.5)
        self.assertEqual(len(doc["context_note"]), 500)
        self.assertEqual(doc["stress_note"], doc["context_note"])

    async def test_skipped_meal_uses_legacy_note_but_does_not_reset_meal_signal(self):
        db = FakeDb()
        req = checkins.CheckinReq(
            response="meal_skipped",
            food_gap_hours=11,
            meal_source="outside_cash",
            stress_note="mess closed",
        )

        with patch("app.api.checkins.get_db", return_value=db):
            await checkins.insert_checkin(req, user_id="user-2")

        doc = db.checkin_logs.inserted[0]
        self.assertEqual(doc["response"], "meal_skipped")
        self.assertEqual(doc["context_note"], "mess closed")
        self.assertEqual(doc["stress_note"], "mess closed")
        self.assertEqual(doc["meal_source"], "outside_cash")
        self.assertFalse(doc["is_meal_signal"])


if __name__ == "__main__":
    unittest.main()
