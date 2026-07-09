import asyncio
import datetime
import os
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.api.statement_import import (
    StatementVendorCategoryReq,
    apply_statement_vendor_category,
    StatementCommitReq,
    StatementCommitRow,
    commit_statement_import,
    rollback_statement_import,
)
from app.services.statement_import import (
    parse_statement_csv,
    parse_statement_file,
    statement_row_signature,
    statement_vendor_group_key,
)


class FakeCursor:
    def __init__(self, docs):
        self.docs = deepcopy(docs)

    def sort(self, key, direction):
        reverse = direction < 0
        self.docs = sorted(self.docs, key=lambda doc: doc.get(key) or datetime.datetime.min, reverse=reverse)
        return self

    async def to_list(self, length=100):
        return deepcopy(self.docs[:length])


class FakeDeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = deepcopy(docs or [])

    def _matches(self, doc, query):
        for key, expected in (query or {}).items():
            actual = doc.get(key)
            if isinstance(expected, dict):
                if "$gte" in expected and not (actual >= expected["$gte"]):
                    return False
                if "$lt" in expected and not (actual < expected["$lt"]):
                    return False
                if "$in" in expected and actual not in expected["$in"]:
                    return False
            elif actual != expected:
                return False
        return True

    def find(self, query=None):
        return FakeCursor([doc for doc in self.docs if self._matches(doc, query or {})])

    async def find_one(self, query):
        for doc in self.docs:
            if self._matches(doc, query):
                return deepcopy(doc)
        return None

    async def insert_one(self, doc):
        self.docs.append(deepcopy(doc))
        return SimpleNamespace(inserted_id=doc.get("_id"))

    async def update_one(self, query, update, upsert=False):
        for index, doc in enumerate(self.docs):
            if self._matches(doc, query):
                updated = deepcopy(doc)
                updated.update(update.get("$set", {}))
                self.docs[index] = updated
                return SimpleNamespace(matched_count=1, modified_count=1)
        if upsert:
            new_doc = {key: value for key, value in query.items() if not isinstance(value, dict)}
            new_doc.update(update.get("$setOnInsert", {}))
            new_doc.update(update.get("$set", {}))
            self.docs.append(new_doc)
            return SimpleNamespace(matched_count=0, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, query, update):
        matched = 0
        for index, doc in enumerate(self.docs):
            if self._matches(doc, query):
                updated = deepcopy(doc)
                updated.update(update.get("$set", {}))
                self.docs[index] = updated
                matched += 1
        return SimpleNamespace(matched_count=matched, modified_count=matched)

    async def delete_many(self, query):
        kept = [doc for doc in self.docs if not self._matches(doc, query)]
        deleted = len(self.docs) - len(kept)
        self.docs = kept
        return FakeDeleteResult(deleted)


class FakeDB:
    def __init__(self, transactions=None):
        self.transactions = FakeCollection(transactions)
        self.statement_import_batches = FakeCollection()
        self.subscriptions = FakeCollection()
        self.candidate_subscriptions = FakeCollection()
        self.profiles = FakeCollection([{"_id": "u1", "college_name": "ABV-IIITM Gwalior"}])
        self.merchant_category_mappings = FakeCollection()


class StatementImportTests(unittest.TestCase):
    def test_csv_parser_handles_common_bank_columns(self):
        csv_text = (
            "Txn Date,Narration,Debit,Credit,Balance\n"
            "08/07/2026,BH-2 Night Canteen UPI Ref 123456789012,45.00,,1200.00\n"
            "09/07/2026,Allowance from home,,7000.00,8200.00\n"
        )

        rows = parse_statement_csv(csv_text)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].direction, "debit")
        self.assertEqual(rows[0].amount_paise, 4500)
        self.assertEqual(rows[0].category, "food")
        self.assertEqual(rows[0].reference, "123456789012")
        self.assertEqual(rows[1].direction, "credit")
        self.assertEqual(rows[1].category, "allowance")

    def test_csv_parser_handles_amt_and_reference_columns(self):
        csv_text = (
            "Value Date,Transaction Remarks,Withdrawal Amt.,Deposit Amt.,Cheque/Ref No.\n"
            "08-Jul-2026,CAMPUS STORE,154.00,,UTR154\n"
        )

        rows = parse_statement_csv(csv_text)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].amount_paise, 15400)
        self.assertEqual(rows[0].direction, "debit")
        self.assertEqual(rows[0].reference, "UTR154")

    def test_csv_parser_handles_hdfc_style_columns_with_metadata_prefix(self):
        csv_text = (
            "Statement of Account\n"
            "Account Number,XXXX1234\n"
            "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"
            "08/07/26,UPI-BH2 CANTEEN-205912,0000205912123456,08/07/26,45.00,,\"1,200.00\"\n"
            "09/07/26,BY TRANSFER-FAMILY ALLOWANCE,0000206012123456,09/07/26,,7000.00,\"8,200.00\"\n"
        )

        rows = parse_statement_csv(csv_text)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].direction, "debit")
        self.assertEqual(rows[0].amount_paise, 4500)
        self.assertEqual(rows[0].reference, "0000205912123456")
        self.assertEqual(rows[1].direction, "credit")
        self.assertEqual(rows[1].amount_paise, 700000)

    def test_csv_parser_handles_sbi_icici_style_columns(self):
        csv_text = (
            "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance\n"
            "08 Jul 2026,08 Jul 2026,TO TRANSFER-UPI-ZEPTO,UTR205912345678,199.00,,5001.00\n"
            "09 Jul 2026,09 Jul 2026,BY TRANSFER-ALLOWANCE,UTR205912345679,,5000.00,10001.00\n"
        )

        rows = parse_statement_csv(csv_text)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].category, "shopping")
        self.assertEqual(rows[0].reference, "UTR205912345678")
        self.assertEqual(rows[1].direction, "credit")
        self.assertEqual(rows[1].category, "allowance")

    def test_csv_parser_handles_kotak_seven_column_statement(self):
        csv_text = (
            "#,Date,Description,Chq/Ref. No.,Withdrawal (Dr.),Deposit (Cr.),Balance\n"
            "1,08/07/2026,UPI/BH-2 Night Canteen,UTR205912345678,45.00,,1200.00\n"
            "2,09/07/2026,BY TRANSFER FAMILY ALLOWANCE,UTR205912345679,,7000.00,8200.00\n"
        )

        rows = parse_statement_csv(csv_text)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].direction, "debit")
        self.assertEqual(rows[0].amount_paise, 4500)
        self.assertEqual(rows[0].reference, "UTR205912345678")
        self.assertEqual(rows[1].direction, "credit")
        self.assertEqual(rows[1].amount_paise, 700000)

    def test_csv_parser_skips_ambiguous_single_amount_without_direction(self):
        csv_text = "Date,Description,Amount\n08/07/2026,Unknown bank row,45.00\n"

        rows = parse_statement_csv(csv_text)

        self.assertEqual(rows, [])

    def test_plain_text_parser_supports_reviewable_rows(self):
        text = "08/07/2026 UPI BH-2 Canteen Ref 123456789012 Rs.45.00 DR"

        rows = parse_statement_file("statement.txt", text.encode("utf-8"))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].confidence, "medium")
        self.assertEqual(rows[0].direction, "debit")
        self.assertEqual(rows[0].amount_paise, 4500)

    def test_plain_text_parser_uses_transaction_amount_not_running_balance(self):
        text = "\n".join(
            [
                "08-Jul-2026 TO TRANSFER UPI BH-2 Night Canteen 45.00 1,200.00",
                "09-Jul-2026 BY TRANSFER Family allowance 7,000.00 8,200.00",
            ]
        )

        rows = parse_statement_file("statement.txt", text.encode("utf-8"))

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].direction, "debit")
        self.assertEqual(rows[0].amount_paise, 4500)
        self.assertEqual(rows[1].direction, "credit")
        self.assertEqual(rows[1].amount_paise, 700000)

    def test_plain_text_parser_stitches_wrapped_multipage_pdf_rows(self):
        text = "\n".join(
            [
                "Statement of Account",
                "Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance",
                "08/07/26 UPI-BH2 CANTEEN-UPI",
                "0000205912123456 08/07/26 45.00 1,200.00",
                "205912-REQUEST FROM BH2",
                "Page 1 of 2",
                "Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance",
                "09/07/26 BY TRANSFER-FAMILY ALLOWANCE",
                "0000206012123456 09/07/26 7,000.00 8,200.00",
            ]
        )

        rows = parse_statement_file("statement.txt", text.encode("utf-8"))

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].direction, "debit")
        self.assertEqual(rows[0].amount_paise, 4500)
        self.assertEqual(rows[0].reference, "0000205912123456")
        self.assertEqual(rows[1].direction, "credit")
        self.assertEqual(rows[1].amount_paise, 700000)

    def test_statement_row_signature_is_stable(self):
        row = parse_statement_csv(
            "Date,Description,Amount,Type\n08-07-2026,BH2 Canteen,45,DR\n"
        )[0]

        self.assertEqual(statement_row_signature(row), statement_row_signature(row.to_preview_dict()))

    def test_vendor_group_key_ignores_generic_payment_rails(self):
        self.assertEqual(statement_vendor_group_key("UPI REF 123456789012"), "")
        self.assertEqual(statement_vendor_group_key("PhonePe UPI TXN 345678"), "")
        self.assertEqual(statement_vendor_group_key("UPI SHARMA TEA STALL 204777"), "sharma tea stall")
        self.assertEqual(
            statement_vendor_group_key("UPI/P2M/426215991203/SHARMA TEA STALL/OKSBI/YESBANK"),
            "sharma tea stall",
        )

    def test_commit_skips_duplicate_without_storing_raw_file_or_password(self):
        existing_date = datetime.datetime(2026, 7, 8, 10, 0, 0)
        db = FakeDB(
            transactions=[
                {
                    "_id": "existing",
                    "user_id": "u1",
                    "amount": 4500,
                    "direction": "debit",
                    "mapped_merchant_name": "BH-2 Night Canteen",
                    "raw_merchant_string": "BH-2 Night Canteen",
                    "created_at": existing_date,
                }
            ]
        )
        req = StatementCommitReq(
            file_name="sbi-july.csv",
            bank_name="State Bank of India",
            rows=[
                StatementCommitRow(
                    row_id="row-dup",
                    posted_at=datetime.datetime(2026, 7, 8, 12, 0, 0),
                    description="BH-2 Night Canteen",
                    amount_paise=4500,
                    direction="debit",
                    category="food",
                    confidence="high",
                ),
                StatementCommitRow(
                    row_id="row-new",
                    posted_at=datetime.datetime(2026, 7, 9, 12, 0, 0),
                    description="Campus Stationery",
                    amount_paise=12000,
                    direction="debit",
                    category="stationery",
                    confidence="high",
                ),
            ],
        )

        with patch("app.api.statement_import.get_db", return_value=db):
            result = asyncio.run(commit_statement_import(req, user_id="u1"))

        self.assertEqual(result["inserted_count"], 1)
        self.assertEqual(result["duplicate_count"], 1)
        imported = [doc for doc in db.transactions.docs if doc.get("source") == "statement_import"]
        self.assertEqual(len(imported), 1)
        self.assertEqual(imported[0]["data_origin"], "bank_statement_upload")
        self.assertFalse(imported[0]["raw_payload_received"])
        batch = db.statement_import_batches.docs[0]
        self.assertFalse(batch["raw_file_stored"])
        self.assertFalse(batch["password_stored"])
        self.assertEqual(batch["inserted_count"], 1)

    def test_commit_flags_frequent_unknown_statement_vendor_for_review(self):
        db = FakeDB()
        req = StatementCommitReq(
            file_name="kotak-july.csv",
            bank_name="Kotak Mahindra Bank",
            rows=[
                StatementCommitRow(
                    row_id="tea-1",
                    posted_at=datetime.datetime(2026, 7, 1, 12, 0, 0),
                    description="UPI/SHARMA TEA STALL/AXIS/204501",
                    amount_paise=1000,
                    direction="debit",
                    category="other",
                    confidence="high",
                ),
                StatementCommitRow(
                    row_id="tea-2",
                    posted_at=datetime.datetime(2026, 7, 2, 12, 0, 0),
                    description="UPI SHARMA TEA STALL 204777",
                    amount_paise=1000,
                    direction="debit",
                    category="other",
                    confidence="high",
                ),
            ],
        )

        with patch("app.api.statement_import.get_db", return_value=db):
            result = asyncio.run(commit_statement_import(req, user_id="u1"))

        self.assertEqual(result["inserted_count"], 2)
        self.assertEqual(len(result["vendor_review_prompts"]), 1)
        prompt = result["vendor_review_prompts"][0]
        self.assertEqual(prompt["count"], 2)
        self.assertEqual(prompt["weekly_count"], 2)
        self.assertEqual(prompt["category"], "other")
        imported = [doc for doc in db.transactions.docs if doc.get("source") == "statement_import"]
        self.assertTrue(all(doc.get("needs_category_review") for doc in imported))
        self.assertEqual({doc.get("statement_vendor_key") for doc in imported}, {prompt["group_key"]})

    def test_commit_does_not_prompt_for_sparse_unknown_vendor(self):
        db = FakeDB()
        req = StatementCommitReq(
            file_name="kotak-july.csv",
            rows=[
                StatementCommitRow(
                    row_id="tea-old",
                    posted_at=datetime.datetime(2026, 7, 1, 12, 0, 0),
                    description="UPI SHARMA TEA STALL 204501",
                    amount_paise=1000,
                    direction="debit",
                    category="other",
                    confidence="high",
                ),
                StatementCommitRow(
                    row_id="tea-later",
                    posted_at=datetime.datetime(2026, 8, 15, 12, 0, 0),
                    description="UPI SHARMA TEA STALL 204777",
                    amount_paise=1000,
                    direction="debit",
                    category="other",
                    confidence="high",
                ),
            ],
        )

        with patch("app.api.statement_import.get_db", return_value=db):
            result = asyncio.run(commit_statement_import(req, user_id="u1"))

        self.assertEqual(result["inserted_count"], 2)
        self.assertEqual(result["vendor_review_prompts"], [])

    def test_vendor_category_answer_updates_rows_and_future_imports(self):
        db = FakeDB()
        first_req = StatementCommitReq(
            file_name="kotak-july.csv",
            rows=[
                StatementCommitRow(
                    row_id=f"tea-{index}",
                    posted_at=datetime.datetime(2026, 7, index, 12, 0, 0),
                    description=f"UPI SHARMA TEA STALL 204{index}",
                    amount_paise=1000,
                    direction="debit",
                    category="other",
                    confidence="high",
                )
                for index in (1, 2, 3)
            ],
        )

        with patch("app.api.statement_import.get_db", return_value=db):
            result = asyncio.run(commit_statement_import(first_req, user_id="u1"))
            group_key = result["vendor_review_prompts"][0]["group_key"]
            apply_result = asyncio.run(
                apply_statement_vendor_category(
                    StatementVendorCategoryReq(
                        group_key=group_key,
                        category="food",
                        display_name="Sharma Tea Stall",
                    ),
                    user_id="u1",
                )
            )

        self.assertEqual(apply_result["updated_count"], 3)
        self.assertEqual(db.merchant_category_mappings.docs[0]["category"], "food")
        self.assertTrue(all(doc["category"] == "food" for doc in db.transactions.docs if doc.get("statement_vendor_key") == group_key))
        self.assertTrue(all(not doc.get("needs_category_review") for doc in db.transactions.docs if doc.get("statement_vendor_key") == group_key))

        future_req = StatementCommitReq(
            file_name="kotak-next.csv",
            rows=[
                StatementCommitRow(
                    row_id="tea-4",
                    posted_at=datetime.datetime(2026, 7, 10, 12, 0, 0),
                    description="UPI/SHARMA TEA STALL/205000",
                    amount_paise=1000,
                    direction="debit",
                    category="other",
                    confidence="high",
                )
            ],
        )
        with patch("app.api.statement_import.get_db", return_value=db):
            future_result = asyncio.run(commit_statement_import(future_req, user_id="u1"))

        self.assertEqual(future_result["vendor_review_prompts"], [])
        future_txn = next(doc for doc in db.transactions.docs if doc.get("statement_row_id") == "tea-4")
        self.assertEqual(future_txn["category"], "food")
        self.assertEqual(future_txn["mapped_merchant_name"], "Sharma Tea Stall")
        self.assertEqual(future_txn["category_review_status"], "mapped")

    def test_rollback_deletes_only_imported_rows_for_batch(self):
        db = FakeDB()
        batch_id = "batch-1"
        db.statement_import_batches.docs.append({"_id": batch_id, "user_id": "u1", "status": "completed"})
        db.transactions.docs.extend(
            [
                {"_id": "imported", "user_id": "u1", "source": "statement_import", "statement_import_batch_id": batch_id},
                {"_id": "manual", "user_id": "u1", "source": "manual"},
                {"_id": "other-user", "user_id": "u2", "source": "statement_import", "statement_import_batch_id": batch_id},
            ]
        )

        with patch("app.api.statement_import.get_db", return_value=db):
            result = asyncio.run(rollback_statement_import(batch_id, user_id="u1"))

        self.assertEqual(result["deleted_count"], 1)
        self.assertEqual({doc["_id"] for doc in db.transactions.docs}, {"manual", "other-user"})
        self.assertEqual(db.statement_import_batches.docs[0]["status"], "rolled_back")


if __name__ == "__main__":
    unittest.main()
