import asyncio
import datetime
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.api.pools import PaymentConfirmReq, build_payment_state, payment_confirm
from app.api.webhook import try_auto_verify_pool_payment


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=100):
        return list(self.docs[:length])


class FakeCartPools:
    def __init__(self, pools):
        self.pools = pools

    def find(self, query):
        docs = []
        completed_after = (query.get("completed_at") or {}).get("$gte")
        for pool in self.pools:
            if query.get("host_id") and pool.get("host_id") != query["host_id"]:
                continue
            if query.get("status") and pool.get("status") != query["status"]:
                continue
            if completed_after and pool.get("completed_at") < completed_after:
                continue
            docs.append(pool)
        return FakeCursor(docs)

    async def find_one(self, query):
        for pool in self.pools:
            if "_id" in query:
                expected_id = query["_id"]
                if isinstance(expected_id, dict):
                    if "$ne" in expected_id and pool.get("_id") == expected_id["$ne"]:
                        continue
                elif pool.get("_id") != expected_id:
                    continue
            if query.get("host_id") and pool.get("host_id") != query["host_id"]:
                continue
            payment_query = query.get("payments", {}).get("$elemMatch")
            if payment_query:
                utr = payment_query.get("utr")
                statuses = set(payment_query.get("status", {}).get("$in", []))
                if not any(
                    payment.get("utr") == utr and payment.get("status") in statuses
                    for payment in pool.get("payments", [])
                ):
                    continue
            return pool
        return None

    async def update_one(self, query, update):
        pool = next((p for p in self.pools if p.get("_id") == query.get("_id")), None)
        if not pool:
            return SimpleNamespace(matched_count=0, modified_count=0)

        if "$pull" in update:
            payment_filter = update["$pull"].get("payments")
            if payment_filter and "name" in payment_filter:
                pool["payments"] = [
                    payment for payment in pool.get("payments", [])
                    if payment.get("name") != payment_filter["name"]
                ]

        if "$push" in update:
            pool.setdefault("payments", []).append(update["$push"]["payments"])

        if "$set" in update:
            for key, value in update["$set"].items():
                pool[key] = value

        return SimpleNamespace(matched_count=1, modified_count=1)


class FakeCartPoolItems:
    def __init__(self, items):
        self.items = items

    def find(self, query):
        return FakeCursor([item for item in self.items if item.get("pool_id") == query.get("pool_id")])


class FakeUsers:
    async def find_one(self, query):
        return None

    def find(self, query):
        return FakeCursor([])


class FakeProfiles:
    async def find_one(self, query):
        return None

    def find(self, query):
        return FakeCursor([])


def make_db(pool, items):
    return SimpleNamespace(
        cart_pools=FakeCartPools([pool]),
        cart_pool_items=FakeCartPoolItems(items),
        users=FakeUsers(),
        profiles=FakeProfiles(),
    )


def make_completed_pool(payments=None):
    return {
        "_id": "pool-1",
        "host_id": "host-1",
        "status": "completed",
        "created_by_name": "Host",
        "completed_at": datetime.datetime.utcnow() - datetime.timedelta(hours=2),
        "final_overhead": 0,
        "final_discount": 0,
        "payments": payments or [],
    }


def make_items():
    return [
        {
            "_id": "item-1",
            "pool_id": "pool-1",
            "added_by_name": "Asha",
            "estimated_price": 10000,
            "is_purchased": True,
        }
    ]


class PoolingHardeningTests(unittest.TestCase):
    def test_amount_only_host_credit_goes_to_review_not_verified(self):
        pool = make_completed_pool()
        db = make_db(pool, make_items())

        result = asyncio.run(
            try_auto_verify_pool_payment(
                db,
                "host-1",
                "",
                amount_from_req=100.0,
                direction_from_req="credit",
            )
        )

        self.assertEqual(result["payment_status"], "needs_review")
        self.assertEqual(pool["payments"][0]["status"], "needs_review")
        self.assertEqual(pool["payments"][0]["verification_source"], "auto_host_credit_review")
        self.assertIn("Amount-only", result["reason"])

    def test_sender_and_amount_match_auto_verifies_split(self):
        pool = make_completed_pool()
        db = make_db(pool, make_items())

        result = asyncio.run(
            try_auto_verify_pool_payment(
                db,
                "host-1",
                "Received from Asha via UPI Ref 123456789012",
                amount_from_req=100.0,
                direction_from_req="credit",
            )
        )

        self.assertEqual(result["payment_status"], "verified")
        self.assertEqual(pool["payments"][0]["status"], "verified")
        self.assertEqual(pool["payments"][0]["verification_source"], "auto_host_credit")

    def test_submitted_utr_requires_matching_amount(self):
        pool = make_completed_pool([
            {
                "name": "Asha",
                "utr": "123456789012",
                "status": "pending",
                "submitted_at": datetime.datetime.utcnow().isoformat(),
            }
        ])
        db = make_db(pool, make_items())

        result = asyncio.run(
            try_auto_verify_pool_payment(
                db,
                "host-1",
                "",
                amount_from_req=90.0,
                utr_from_req="123456789012",
                direction_from_req="credit",
            )
        )

        self.assertEqual(result["payment_status"], "needs_review")
        self.assertEqual(pool["payments"][0]["status"], "needs_review")
        self.assertIn("amount does not match", pool["payments"][0]["review_reason"])

    def test_roommate_cannot_replace_already_verified_payment(self):
        pool = make_completed_pool([
            {
                "name": "Asha",
                "utr": "123456789012",
                "status": "verified",
                "submitted_at": datetime.datetime.utcnow().isoformat(),
                "expected_amount": 10000,
            }
        ])
        db = make_db(pool, make_items())

        with patch("app.api.pools.get_db", return_value=db):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(payment_confirm(
                    "pool-1",
                    PaymentConfirmReq(roommate_name="Asha", utr="987654321098"),
                ))

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(pool["payments"][0]["status"], "verified")
        self.assertEqual(pool["payments"][0]["utr"], "123456789012")

    def test_refund_credit_is_not_treated_as_pool_payment(self):
        pool = make_completed_pool()
        db = make_db(pool, make_items())

        result = asyncio.run(
            try_auto_verify_pool_payment(
                db,
                "host-1",
                "Refund credited Rs 100 UPI Ref 123456789012",
                amount_from_req=100.0,
                direction_from_req="credit",
            )
        )

        self.assertIsNone(result)
        self.assertEqual(pool["payments"], [])

    def test_unpaid_split_after_checkout_is_overdue(self):
        pool = {
            "created_by_name": "Host",
            "completed_at": datetime.datetime.utcnow() - datetime.timedelta(hours=30),
        }

        state = build_payment_state(pool, "Asha", None, 10000)

        self.assertEqual(state["status"], "unpaid")
        self.assertTrue(state["is_overdue"])
        self.assertEqual(state["label"], "Overdue")


if __name__ == "__main__":
    unittest.main()
