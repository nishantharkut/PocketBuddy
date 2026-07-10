import asyncio
import datetime
import os
import re
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.api.pools import (
    JoinDecisionReq,
    PaymentConfirmReq,
    PoolItemReq,
    RoommateAmznPayReq,
    approve_pool_join_request,
    build_payment_state,
    enrich_pool_document,
    get_cart_pools,
    insert_pool_item,
    payment_confirm,
    process_amazon_roommate_payment,
    request_pool_join,
    sanitize_pool_item_for_viewer,
)
from app.api.webhook import try_auto_verify_pool_payment


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *args, **kwargs):
        return self

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

    async def update_many(self, query, update):
        modified = 0
        cutoff = (query.get("expires_at") or {}).get("$lt")
        for pool in self.pools:
            if query.get("wing_label") and pool.get("wing_label") != query["wing_label"]:
                continue
            if query.get("status") and pool.get("status") != query["status"]:
                continue
            if cutoff and pool.get("expires_at") and pool.get("expires_at") >= cutoff:
                continue
            if "$set" in update:
                pool.update(update["$set"])
                modified += 1
        return SimpleNamespace(matched_count=modified, modified_count=modified)


class FakeCartPoolItems:
    def __init__(self, items):
        self.items = items

    def find(self, query):
        return FakeCursor([item for item in self.items if item.get("pool_id") == query.get("pool_id")])

    async def insert_one(self, doc):
        self.items.append(doc)
        return SimpleNamespace(inserted_id=doc.get("_id"))


class FakeUsers:
    def __init__(self, users=None):
        self.users = users or []

    async def find_one(self, query):
        if "_id" in query:
            for user in self.users:
                if user.get("_id") == query["_id"]:
                    return user
            return None

        full_name_query = query.get("full_name")
        if isinstance(full_name_query, dict) and "$regex" in full_name_query:
            pattern = re.compile(full_name_query["$regex"], re.IGNORECASE)
            for user in self.users:
                if pattern.match(user.get("full_name", "")):
                    return user
        return None

    def find(self, query):
        ids = set(query.get("_id", {}).get("$in", []))
        if ids:
            return FakeCursor([user for user in self.users if user.get("_id") in ids])
        return FakeCursor(self.users)


class FakeProfiles:
    def __init__(self, profiles=None):
        self.profiles = profiles or []

    async def find_one(self, query):
        if "_id" in query:
            for profile in self.profiles:
                if profile.get("_id") == query["_id"]:
                    return profile
        return None

    def find(self, query):
        docs = self.profiles
        if "wing_label" in query:
            docs = [profile for profile in docs if profile.get("wing_label") == query["wing_label"]]
        if "_id" in query and isinstance(query["_id"], dict):
            ids = set(query["_id"].get("$in", []))
            docs = [profile for profile in docs if profile.get("_id") in ids]
        return FakeCursor(docs)


class FakeTransactions:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=doc.get("_id"))


def make_db(pool, items, users=None, profiles=None):
    pools = pool if isinstance(pool, list) else [pool]
    return SimpleNamespace(
        cart_pools=FakeCartPools(pools),
        cart_pool_items=FakeCartPoolItems(items),
        users=FakeUsers(users),
        profiles=FakeProfiles(profiles),
        transactions=FakeTransactions(),
    )


def make_completed_pool(payments=None, pool_id="pool-1"):
    return {
        "_id": pool_id,
        "host_id": "host-1",
        "status": "completed",
        "created_by_name": "Host",
        "wing_label": "BH-2 Wing B",
        "completed_at": datetime.datetime.utcnow() - datetime.timedelta(hours=2),
        "final_overhead": 0,
        "final_discount": 0,
        "payments": payments or [],
    }


def make_items(pool_id="pool-1", price=10000, user_id="asha-right"):
    return [
        {
            "_id": "item-1",
            "pool_id": pool_id,
            "added_by_name": "Asha",
            "added_by_user_id": user_id,
            "estimated_price": price,
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

    def test_sender_amount_match_across_multiple_pools_requires_review(self):
        pool_one = make_completed_pool(pool_id="pool-1")
        pool_two = make_completed_pool(pool_id="pool-2")
        db = make_db(
            [pool_one, pool_two],
            make_items(pool_id="pool-1") + make_items(pool_id="pool-2"),
        )

        result = asyncio.run(
            try_auto_verify_pool_payment(
                db,
                "host-1",
                "Received from Asha via UPI Ref 123456789012",
                amount_from_req=100.0,
                direction_from_req="credit",
            )
        )

        self.assertEqual(result["payment_status"], "needs_review")
        self.assertIn("multiple unsettled splits", result["reason"])
        self.assertEqual(pool_one["payments"], [])
        self.assertEqual(pool_two["payments"], [])

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
                    user_id="asha-right",
                ))

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(pool["payments"][0]["status"], "verified")
        self.assertEqual(pool["payments"][0]["utr"], "123456789012")

    def test_anonymous_user_cannot_submit_pool_utr(self):
        pool = make_completed_pool()
        db = make_db(pool, make_items())

        with patch("app.api.pools.get_db", return_value=db):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(payment_confirm(
                    "pool-1",
                    PaymentConfirmReq(roommate_name="Asha", utr="123456789012"),
                    user_id=None,
                ))

        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(pool["payments"], [])

    def test_roommate_cannot_submit_utr_for_another_participant(self):
        pool = make_completed_pool()
        items = make_items() + [{
            "_id": "item-2",
            "pool_id": "pool-1",
            "added_by_name": "Rohan",
            "added_by_user_id": "rohan-id",
            "estimated_price": 12000,
            "is_purchased": True,
        }]
        db = make_db(
            pool,
            items,
            users=[
                {"_id": "asha-right", "full_name": "Asha"},
                {"_id": "rohan-id", "full_name": "Rohan"},
            ],
        )

        with patch("app.api.pools.get_db", return_value=db):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(payment_confirm(
                    "pool-1",
                    PaymentConfirmReq(roommate_name="Rohan", utr="123456789012"),
                    user_id="asha-right",
                ))

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(pool["payments"], [])

    def test_roommate_can_submit_utr_only_for_own_split(self):
        pool = make_completed_pool()
        db = make_db(
            pool,
            make_items(),
            users=[
                {"_id": "asha-right", "full_name": "Asha"},
            ],
        )

        with patch("app.api.pools.get_db", return_value=db):
            updated = asyncio.run(payment_confirm(
                "pool-1",
                PaymentConfirmReq(roommate_name="Asha", utr="123456789012"),
                user_id="asha-right",
            ))

        self.assertEqual(pool["payments"][0]["status"], "pending")
        self.assertEqual(pool["payments"][0]["utr"], "123456789012")

    @patch("app.api.pools.get_db")
    def test_roommate_cannot_sandbox_settle_another_participant(self, mock_get_db):
        pool = make_completed_pool()
        items = make_items() + [
            {
                "_id": "item-rohan",
                "pool_id": "pool-1",
                "added_by_name": "Rohan",
                "added_by_user_id": "rohan-id",
                "estimated_price": 7000,
                "is_purchased": True,
            }
        ]
        db = make_db(
            pool,
            items,
            users=[
                {"_id": "asha-right", "full_name": "Asha"},
                {"_id": "rohan-id", "full_name": "Rohan"},
            ],
        )
        mock_get_db.return_value = db

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(process_amazon_roommate_payment(
                "pool-1",
                RoommateAmznPayReq(roommate_name="Asha", amount=10000),
                user_id="rohan-id",
            ))

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(pool["payments"], [])

    @patch("app.api.pools.get_db")
    def test_roommate_can_sandbox_settle_only_own_split(self, mock_get_db):
        pool = make_completed_pool()
        db = make_db(
            pool,
            make_items(),
            users=[{"_id": "asha-right", "full_name": "Asha"}],
        )
        mock_get_db.return_value = db

        response = asyncio.run(process_amazon_roommate_payment(
            "pool-1",
            RoommateAmznPayReq(roommate_name="Asha", amount=10000),
            user_id="asha-right",
        ))

        self.assertEqual(response["chargePermissionStatus"]["state"], "Chargeable")
        self.assertEqual(pool["payments"][0]["status"], "verified")
        self.assertEqual(pool["payments"][0]["settlement_mode"], "amazon_pay_sandbox")
        self.assertTrue(pool["payments"][0]["utr"].startswith("B01-"))
        self.assertEqual(db.transactions.docs[0]["user_id"], "asha-right")

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

    def test_public_pool_enrichment_hides_private_settlement_fields(self):
        pool = make_completed_pool([
            {
                "name": "Asha",
                "utr": "123456789012",
                "status": "pending",
                "expected_amount": 10000,
                "verification_source": "manual_utr",
            }
        ])
        pool.update({
            "upi_id": "host@upi",
            "checkout_notes": "Collect before 10 PM",
            "final_overhead": 1200,
            "final_discount": 300,
            "auto_nudge_enabled": True,
            "nudge_interval_hours": 8,
        })
        db = make_db(
            pool,
            make_items(),
            users=[
                {"_id": "host-1", "full_name": "Host", "phone_number": "9876543210", "email": "host@example.com"},
                {"_id": "asha-right", "full_name": "Asha", "phone_number": "9999999999", "email": "asha@example.com"},
            ],
            profiles=[
                {"_id": "host-1", "wing_label": "BH-2 Wing B", "companion_paired": True},
                {"_id": "asha-right", "wing_label": "BH-2 Wing B"},
            ],
        )

        enriched = asyncio.run(enrich_pool_document(db, dict(pool), current_user_id=None))

        self.assertEqual(enriched["host_phone"], "")
        self.assertEqual(enriched["payments"], [])
        self.assertEqual(enriched["reliability_scores"], {})
        self.assertEqual(enriched["settlement_summary"], {})
        self.assertEqual(enriched["wing_members"], [])
        self.assertEqual(enriched["split_breakdown"], {})
        self.assertNotIn("host_id", enriched)
        self.assertNotIn("upi_id", enriched)
        self.assertNotIn("checkout_notes", enriched)
        self.assertNotIn("final_overhead", enriched)
        self.assertNotIn("final_discount", enriched)
        self.assertNotIn("auto_nudge_enabled", enriched)
        self.assertNotIn("nudge_interval_hours", enriched)

    def test_pool_list_sanitizes_items_for_non_host_participant(self):
        pool = make_completed_pool(pool_id="pool-1")
        pool["status"] = "open"
        pool["expires_at"] = datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        items = make_items(pool_id="pool-1", user_id="asha-right") + [{
            "_id": "item-rohan",
            "pool_id": "pool-1",
            "added_by_name": "Rohan",
            "added_by_user_id": "rohan-id",
            "item_description": "Chips",
            "estimated_price": 5000,
            "is_purchased": True,
            "item_updated_by": "host-1",
            "cart_status_updated_by": "host-1",
        }]
        db = make_db(
            pool,
            items,
            profiles=[{"_id": "asha-right", "wing_label": "BH-2 Wing B"}],
        )

        with patch("app.api.pools.get_db", return_value=db):
            pools = asyncio.run(get_cart_pools(user_id="asha-right"))

        self.assertEqual(len(pools), 1)
        rohan_item = next(item for item in pools[0]["items"] if item["added_by_name"] == "Rohan")
        self.assertNotIn("added_by_user_id", rohan_item)
        self.assertNotIn("item_updated_by", rohan_item)
        self.assertNotIn("cart_status_updated_by", rohan_item)

    def test_host_pool_enrichment_uses_pool_user_id_for_participant_contact(self):
        pool = make_completed_pool([
            {
                "name": "Asha",
                "utr": "123456789012",
                "status": "pending",
                "expected_amount": 10000,
                "verification_source": "manual_utr",
            }
        ])
        db = make_db(
            pool,
            make_items(),
            users=[
                {"_id": "asha-wrong", "full_name": "Asha", "phone_number": "1111111111", "email": "wrong-wing@example.com"},
                {"_id": "host-1", "full_name": "Host", "phone_number": "9876543210", "email": "host@example.com"},
                {"_id": "asha-right", "full_name": "Asha", "phone_number": "9999999999", "email": "asha@example.com"},
            ],
            profiles=[
                {"_id": "host-1", "wing_label": "BH-2 Wing B", "companion_paired": True},
                {"_id": "asha-right", "wing_label": "BH-2 Wing B"},
                {"_id": "asha-wrong", "wing_label": "Other Wing"},
            ],
        )

        enriched = asyncio.run(enrich_pool_document(db, dict(pool), current_user_id="host-1"))

        self.assertEqual(enriched["host_phone"], "9876543210")
        self.assertEqual(enriched["payments"][0]["utr"], "123456789012")
        self.assertEqual(enriched["split_breakdown"]["Asha"]["email"], "asha@example.com")
        self.assertEqual(enriched["split_breakdown"]["Asha"]["utr"], "123456789012")

    def test_public_pool_item_response_hides_internal_user_id(self):
        item = {
            "_id": "item-1",
            "pool_id": "pool-1",
            "added_by_name": "Asha",
            "added_by_user_id": "asha-right",
            "item_description": "Tea",
            "estimated_price": 1000,
            "item_updated_by": "roommate",
        }

        sanitized = sanitize_pool_item_for_viewer(item, current_user_id=None, host_id="host-1")

        self.assertEqual(sanitized["added_by_name"], "Asha")
        self.assertEqual(sanitized["item_description"], "Tea")
        self.assertNotIn("added_by_user_id", sanitized)
        self.assertNotIn("item_updated_by", sanitized)

    def test_non_participant_gets_request_state_without_private_pool_contents(self):
        pool = {
            "_id": "pool-1",
            "host_id": "host-1",
            "status": "open",
            "created_by_name": "Host",
            "wing_label": "BH-2 Wing B",
            "payments": [
                {"name": "Asha", "utr": "123456789012", "status": "pending"},
            ],
            "join_requests": [],
        }
        db = make_db(
            pool,
            make_items(user_id="asha-right"),
            users=[
                {"_id": "host-1", "full_name": "Host", "phone_number": "9876543210"},
                {"_id": "visitor-1", "full_name": "Rohan", "email": "rohan@example.com"},
            ],
            profiles=[
                {"_id": "host-1", "wing_label": "BH-2 Wing B"},
                {"_id": "visitor-1", "wing_label": "BH-2 Wing B"},
            ],
        )

        enriched = asyncio.run(enrich_pool_document(db, dict(pool), current_user_id="visitor-1"))

        self.assertEqual(enriched["viewer_access"]["state"], "request_required")
        self.assertFalse(enriched["viewer_access"]["can_view_pool"])
        self.assertEqual(enriched["host_phone"], "")
        self.assertEqual(enriched["payments"], [])
        self.assertEqual(enriched["split_breakdown"], {})
        self.assertEqual(enriched["wing_members"], [])
        self.assertEqual(enriched["join_requests"], [])

    def test_pending_join_request_cannot_add_items_until_host_approves(self):
        pool = {
            "_id": "pool-1",
            "host_id": "host-1",
            "status": "open",
            "created_by_name": "Host",
            "wing_label": "BH-2 Wing B",
            "min_cart_value": 50000,
            "delivery_fee": 2000,
            "payments": [],
            "join_requests": [
                {
                    "user_id": "visitor-1",
                    "name": "Rohan",
                    "email": "rohan@example.com",
                    "status": "pending",
                    "requested_at": datetime.datetime.utcnow().isoformat(),
                }
            ],
        }
        db = make_db(
            pool,
            [],
            users=[{"_id": "visitor-1", "full_name": "Rohan", "email": "rohan@example.com"}],
            profiles=[{"_id": "visitor-1", "wing_label": "BH-2 Wing B"}],
        )

        with patch("app.api.pools.get_db", return_value=db):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(insert_pool_item(
                    "pool-1",
                    PoolItemReq(
                        added_by_name="Rohan",
                        item_description="Chips",
                        estimated_price=5000,
                        quantity=1,
                    ),
                    user_id="visitor-1",
                ))

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(db.cart_pool_items.items, [])

    def test_host_approval_unlocks_pool_item_add_for_requester(self):
        pool = {
            "_id": "pool-1",
            "host_id": "host-1",
            "status": "open",
            "created_by_name": "Host",
            "wing_label": "BH-2 Wing B",
            "min_cart_value": 50000,
            "delivery_fee": 2000,
            "payments": [],
            "join_requests": [
                {
                    "user_id": "visitor-1",
                    "name": "Rohan",
                    "email": "rohan@example.com",
                    "status": "pending",
                    "requested_at": datetime.datetime.utcnow().isoformat(),
                }
            ],
        }
        db = make_db(
            pool,
            [],
            users=[
                {"_id": "host-1", "full_name": "Host"},
                {"_id": "visitor-1", "full_name": "Rohan", "email": "rohan@example.com"},
            ],
            profiles=[
                {"_id": "host-1", "wing_label": "BH-2 Wing B"},
                {"_id": "visitor-1", "wing_label": "BH-2 Wing B"},
            ],
        )

        with patch("app.api.pools.get_db", return_value=db):
            asyncio.run(approve_pool_join_request(
                "pool-1",
                JoinDecisionReq(user_id="visitor-1"),
                user_id="host-1",
            ))
            asyncio.run(insert_pool_item(
                "pool-1",
                PoolItemReq(
                    added_by_name="Rohan",
                    item_description="Chips",
                    estimated_price=5000,
                    quantity=1,
                ),
                user_id="visitor-1",
            ))

        self.assertEqual(pool["join_requests"][0]["status"], "approved")
        self.assertEqual(db.cart_pool_items.items[0]["added_by_user_id"], "visitor-1")
        self.assertEqual(db.cart_pool_items.items[0]["added_by_name"], "Rohan")

    def test_request_pool_join_is_idempotent_for_pending_user(self):
        pool = {
            "_id": "pool-1",
            "host_id": "host-1",
            "status": "open",
            "created_by_name": "Host",
            "wing_label": "BH-2 Wing B",
            "payments": [],
            "join_requests": [],
        }
        db = make_db(
            pool,
            [],
            users=[{"_id": "visitor-1", "full_name": "Rohan", "email": "rohan@example.com"}],
            profiles=[{"_id": "visitor-1", "wing_label": "BH-2 Wing B"}],
        )

        with patch("app.api.pools.get_db", return_value=db):
            first = asyncio.run(request_pool_join("pool-1", user_id="visitor-1"))
            second = asyncio.run(request_pool_join("pool-1", user_id="visitor-1"))

        self.assertEqual(len(pool["join_requests"]), 1)
        self.assertEqual(first["viewer_access"]["state"], "pending")
        self.assertEqual(second["viewer_access"]["state"], "pending")

    def test_host_cannot_approve_join_request_after_pool_closes(self):
        pool = {
            "_id": "pool-1",
            "host_id": "host-1",
            "status": "closed",
            "created_by_name": "Host",
            "wing_label": "BH-2 Wing B",
            "payments": [],
            "join_requests": [
                {
                    "user_id": "visitor-1",
                    "name": "Rohan",
                    "email": "rohan@example.com",
                    "status": "pending",
                    "requested_at": datetime.datetime.utcnow().isoformat(),
                }
            ],
        }
        db = make_db(pool, [])

        with patch("app.api.pools.get_db", return_value=db):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(approve_pool_join_request(
                    "pool-1",
                    JoinDecisionReq(user_id="visitor-1"),
                    user_id="host-1",
                ))

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(pool["join_requests"][0]["status"], "pending")


if __name__ == "__main__":
    unittest.main()
