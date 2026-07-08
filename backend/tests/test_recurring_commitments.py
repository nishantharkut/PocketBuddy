import os
import unittest
import datetime
import re
from copy import deepcopy

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.subscriptions import (
    classify_cadence,
    detect_recurring_subscriptions,
    is_bad_merchant,
    subscription_name_for_merchant,
    next_future_debit,
    upsert_subscription,
    upsert_subscription_for_transaction,
)
from app.services.runway import build_runway_forecast


def utc_days_ago(days: int) -> datetime.datetime:
    return datetime.datetime.utcnow() - datetime.timedelta(days=days)


def txn(
    *,
    merchant: str,
    amount: int,
    days_ago: int,
    user_id: str = "u1",
    category: str = "other",
) -> dict:
    return {
        "_id": f"{merchant}-{days_ago}",
        "user_id": user_id,
        "amount": amount,
        "direction": "debit",
        "category": category,
        "mapped_merchant_name": merchant,
        "raw_merchant_string": merchant,
        "created_at": utc_days_ago(days_ago),
    }


class FakeCursor:
    def __init__(self, docs: list[dict]):
        self.docs = docs

    def sort(self, key: str, direction: int):
        reverse = direction < 0
        self.docs = sorted(self.docs, key=lambda doc: doc.get(key) or datetime.datetime.min, reverse=reverse)
        return self

    async def to_list(self, length: int):
        return deepcopy(self.docs[:length])


class FakeCollection:
    def __init__(self, docs: list[dict] | None = None):
        self.docs = deepcopy(docs or [])

    def _matches(self, doc: dict, query: dict) -> bool:
        for key, expected in query.items():
            if key == "$or":
                if not any(self._matches(doc, branch) for branch in expected):
                    return False
                continue
            actual = doc.get(key)
            if isinstance(expected, re.Pattern):
                if not isinstance(actual, str) or not expected.search(actual):
                    return False
            elif isinstance(expected, dict):
                if "$gte" in expected and not (actual >= expected["$gte"]):
                    return False
                if "$in" in expected and actual not in expected["$in"]:
                    return False
                if "$ne" in expected and actual == expected["$ne"]:
                    return False
            elif actual != expected:
                return False
        return True

    def find(self, query: dict | None = None):
        query = query or {}
        return FakeCursor([doc for doc in self.docs if self._matches(doc, query)])

    async def find_one(self, query: dict):
        for doc in self.docs:
            if self._matches(doc, query):
                return deepcopy(doc)
        return None

    async def insert_one(self, doc: dict):
        self.docs.append(deepcopy(doc))

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        for index, doc in enumerate(self.docs):
            if self._matches(doc, query):
                updated = deepcopy(doc)
                updated.update(update.get("$set", {}))
                for key, value in update.get("$addToSet", {}).items():
                    items = list(updated.get(key, []))
                    if value not in items:
                        items.append(value)
                    updated[key] = items
                self.docs[index] = updated
                return
        if upsert:
            new_doc = {key: value for key, value in query.items() if not isinstance(value, dict)}
            new_doc.update(update.get("$setOnInsert", {}))
            new_doc.update(update.get("$set", {}))
            for key, value in update.get("$addToSet", {}).items():
                new_doc[key] = [value]
            self.docs.append(new_doc)


class FakeDB:
    def __init__(
        self,
        *,
        transactions: list[dict] | None = None,
        subscriptions: list[dict] | None = None,
        profiles: list[dict] | None = None,
        candidate_subscriptions: list[dict] | None = None,
    ):
        self.transactions = FakeCollection(transactions)
        self.subscriptions = FakeCollection(subscriptions)
        self.profiles = FakeCollection(profiles)
        self.candidate_subscriptions = FakeCollection(candidate_subscriptions)

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
        self.assertTrue(is_bad_merchant("One Tapri Canteen"))
        self.assertTrue(is_bad_merchant("Library Cafe"))
        self.assertTrue(is_bad_merchant("Campus Stationery Wallet"))

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
        self.assertEqual(subscription_name_for_merchant("Amazon Prime Membership"), "Amazon Prime")
        self.assertEqual(subscription_name_for_merchant("Airtel Postpaid Bill"), "Airtel Thanks")

        # Unknown services and campus merchants that contain broad brand-like words
        self.assertIsNone(subscription_name_for_merchant("Unknown Coffee Shop"))
        self.assertIsNone(subscription_name_for_merchant("Prime Canteen"))
        self.assertIsNone(subscription_name_for_merchant("Airtel Cafe"))
        self.assertIsNone(subscription_name_for_merchant("Spotify Cafe"))
        self.assertIsNone(subscription_name_for_merchant("Steam Canteen"))
        self.assertIsNone(subscription_name_for_merchant("Notion Stationery"))
        self.assertIsNone(subscription_name_for_merchant("Campus Prime Snacks"))

    def test_next_future_debit_calculation(self):
        observed = datetime.datetime(2026, 6, 1)
        # Assuming now is after June 1, 2026
        next_debit = next_future_debit(observed, 30)
        self.assertGreater(next_debit, observed)
        self.assertEqual((next_debit - observed).days % 30, 0)


class RecurringDetectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_unknown_stable_merchant_stays_possible_until_user_confirms(self):
        db = FakeDB(
            transactions=[
                txn(merchant="Design Tool Workspace", amount=9900, days_ago=61),
                txn(merchant="Design Tool Workspace", amount=9900, days_ago=31),
                txn(merchant="Design Tool Workspace", amount=9900, days_ago=1),
            ],
            profiles=[{"_id": "u1", "college_name": "ABV-IIITM Gwalior"}],
        )

        subs = await detect_recurring_subscriptions(db, "u1")

        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]["status"], "possible")
        self.assertTrue(subs[0]["is_active"])

    async def test_habitual_local_merchant_does_not_pollute_community_candidates(self):
        db = FakeDB(
            transactions=[
                txn(merchant="Campus Stationery Wallet", amount=9900, days_ago=61),
                txn(merchant="Campus Stationery Wallet", amount=9900, days_ago=31),
                txn(merchant="Campus Stationery Wallet", amount=9900, days_ago=1),
            ],
            profiles=[{"_id": "u1", "college_name": "ABV-IIITM Gwalior"}],
        )

        subs = await detect_recurring_subscriptions(db, "u1")

        self.assertEqual(subs, [])
        self.assertEqual(db.candidate_subscriptions.docs, [])

    async def test_known_subscription_brand_is_confirmed(self):
        db = FakeDB(
            transactions=[
                txn(merchant="Spotify Premium", amount=5900, days_ago=61),
                txn(merchant="Spotify Premium", amount=5900, days_ago=31),
                txn(merchant="Spotify Premium", amount=5900, days_ago=1),
            ],
            profiles=[{"_id": "u1", "college_name": "ABV-IIITM Gwalior"}],
        )

        subs = await detect_recurring_subscriptions(db, "u1")

        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]["service_name"], "Spotify")
        self.assertEqual(subs[0]["status"], "confirmed")

    async def test_ignored_subscription_is_not_reactivated_by_detection(self):
        db = FakeDB(
            transactions=[
                txn(merchant="Spotify Premium", amount=5900, days_ago=61),
                txn(merchant="Spotify Premium", amount=5900, days_ago=31),
                txn(merchant="Spotify Premium", amount=5900, days_ago=1),
            ],
            subscriptions=[
                {
                    "_id": "sub-spotify",
                    "user_id": "u1",
                    "service_name": "Spotify",
                    "name": "Spotify",
                    "amount": 5900,
                    "status": "ignored",
                    "is_active": False,
                    "next_debit_date": utc_days_ago(-29),
                }
            ],
            profiles=[{"_id": "u1", "college_name": "ABV-IIITM Gwalior"}],
        )

        subs = await detect_recurring_subscriptions(db, "u1")

        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]["status"], "ignored")
        self.assertFalse(subs[0]["is_active"])

    async def test_manually_disabled_subscription_is_not_reactivated_by_detection(self):
        db = FakeDB(
            transactions=[
                txn(merchant="Spotify Premium", amount=5900, days_ago=61),
                txn(merchant="Spotify Premium", amount=5900, days_ago=31),
                txn(merchant="Spotify Premium", amount=5900, days_ago=1),
            ],
            subscriptions=[
                {
                    "_id": "sub-spotify",
                    "user_id": "u1",
                    "service_name": "Spotify",
                    "name": "Spotify",
                    "amount": 5900,
                    "status": "confirmed",
                    "is_active": False,
                    "next_debit_date": utc_days_ago(-29),
                }
            ],
            profiles=[{"_id": "u1", "college_name": "ABV-IIITM Gwalior"}],
        )

        subs = await detect_recurring_subscriptions(db, "u1")

        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]["status"], "confirmed")
        self.assertFalse(subs[0]["is_active"])

    async def test_manual_readd_overrides_previous_ignore(self):
        db = FakeDB(
            subscriptions=[
                {
                    "_id": "sub-spotify",
                    "user_id": "u1",
                    "service_name": "Spotify",
                    "name": "Spotify",
                    "amount": 5900,
                    "status": "ignored",
                    "is_active": False,
                    "next_debit_date": utc_days_ago(-29),
                }
            ],
        )

        sub = await upsert_subscription(
            db,
            user_id="u1",
            service_name="Spotify",
            amount_paise=5900,
            next_debit_date=utc_days_ago(-29),
            detected_from="manual",
        )

        self.assertEqual(sub["_id"], "sub-spotify")
        self.assertEqual(sub["status"], "confirmed")
        self.assertTrue(sub["is_active"])

    async def test_manual_transaction_subscription_overrides_previous_ignore(self):
        db = FakeDB(
            subscriptions=[
                {
                    "_id": "sub-spotify",
                    "user_id": "u1",
                    "service_name": "Spotify",
                    "name": "Spotify",
                    "amount": 5900,
                    "status": "ignored",
                    "is_active": False,
                    "next_debit_date": utc_days_ago(-29),
                }
            ],
        )

        sub = await upsert_subscription(
            db,
            user_id="u1",
            service_name="Spotify",
            amount_paise=5900,
            next_debit_date=utc_days_ago(-29),
            detected_from="manual_transaction",
        )

        self.assertEqual(sub["_id"], "sub-spotify")
        self.assertEqual(sub["status"], "confirmed")
        self.assertTrue(sub["is_active"])

    async def test_known_service_normalization_updates_existing_detected_row(self):
        db = FakeDB(
            transactions=[
                txn(merchant="Spotify Premium", amount=5900, days_ago=61),
                txn(merchant="Spotify Premium", amount=5900, days_ago=31),
                txn(merchant="Spotify Premium", amount=5900, days_ago=1),
            ],
            subscriptions=[
                {
                    "_id": "sub-spotify-premium",
                    "user_id": "u1",
                    "service_name": "Spotify Premium",
                    "name": "Spotify Premium",
                    "amount": 5900,
                    "status": "possible",
                    "is_active": True,
                    "next_debit_date": utc_days_ago(-29),
                }
            ],
            profiles=[{"_id": "u1", "college_name": "ABV-IIITM Gwalior"}],
        )

        subs = await detect_recurring_subscriptions(db, "u1")

        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]["_id"], "sub-spotify-premium")
        self.assertEqual(subs[0]["service_name"], "Spotify")
        self.assertEqual(subs[0]["status"], "confirmed")

    async def test_single_passive_known_brand_event_stays_review_candidate(self):
        db = FakeDB()

        sub = await upsert_subscription_for_transaction(
            db,
            user_id="u1",
            merchant="Spotify Premium",
            amount_paise=5900,
            observed_at=utc_days_ago(0),
            detected_from="auto_detected",
        )

        self.assertIsNotNone(sub)
        self.assertEqual(sub["status"], "possible")
        self.assertEqual(sub["confidence"], 60.0)
        self.assertTrue(sub["is_active"])

    async def test_single_passive_event_does_not_downgrade_confirmed_commitment(self):
        db = FakeDB(
            subscriptions=[
                {
                    "_id": "sub-spotify",
                    "user_id": "u1",
                    "service_name": "Spotify",
                    "name": "Spotify",
                    "amount": 5900,
                    "status": "confirmed",
                    "is_active": True,
                    "next_debit_date": utc_days_ago(-29),
                }
            ],
        )

        sub = await upsert_subscription_for_transaction(
            db,
            user_id="u1",
            merchant="Spotify Premium",
            amount_paise=5900,
            observed_at=utc_days_ago(0),
            detected_from="auto_detected",
        )

        self.assertEqual(sub["_id"], "sub-spotify")
        self.assertEqual(sub["status"], "confirmed")
        self.assertTrue(sub["is_active"])

    def test_legacy_amount_paise_subscriptions_still_feed_runway(self):
        now = datetime.datetime(2026, 7, 9, 12, 0, 0)
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 700000, "cycle_start_day": 1},
            transactions=[],
            subscriptions=[
                {
                    "_id": "legacy-sub",
                    "service_name": "Spotify",
                    "amount_paise": 5900,
                    "billing_cycle": "monthly",
                    "next_debit_date": datetime.datetime(2026, 7, 15),
                    "status": "confirmed",
                    "is_active": True,
                }
            ],
            now=now,
        )

        self.assertEqual(forecast["commitments"]["total"], 5900)

    def test_possible_subscriptions_are_visible_but_do_not_shrink_safe_daily(self):
        now = datetime.datetime(2026, 7, 9, 12, 0, 0)
        forecast = build_runway_forecast(
            profile={"monthly_allowance": 700000, "cycle_start_day": 1},
            transactions=[],
            subscriptions=[
                {
                    "_id": "possible-sub",
                    "service_name": "Campus Stationery Wallet",
                    "amount": 9900,
                    "billing_cycle": "monthly",
                    "next_debit_date": datetime.datetime(2026, 7, 15),
                    "status": "possible",
                    "is_active": True,
                }
            ],
            now=now,
        )

        self.assertEqual(forecast["commitments"]["total"], 0)
        self.assertEqual(forecast["possible_commitments_total"], 9900)

if __name__ == "__main__":
    unittest.main()
