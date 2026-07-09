import datetime
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import get_current_user, map_docs
from app.services.statement_import import (
    MAX_PREVIEW_ROWS,
    StatementImportError,
    guess_category,
    normalize_statement_description,
    parse_statement_file,
    statement_vendor_display_name,
    statement_vendor_group_key,
)
from app.services.subscriptions import (
    clean_merchant_name,
    next_future_debit,
    subscription_name_for_merchant,
    upsert_subscription,
    upsert_subscription_for_transaction,
)


router = APIRouter()
REPEAT_VENDOR_WEEKLY_THRESHOLD = 2
REPEAT_VENDOR_MONTHLY_THRESHOLD = 5
MAX_VENDOR_REVIEW_PROMPTS = 4


class StatementCommitRow(BaseModel):
    row_id: str
    posted_at: datetime.datetime
    description: str = Field(min_length=1, max_length=120)
    amount_paise: int = Field(gt=0, le=50_000_000)
    direction: str = "debit"
    category: str = "other"
    confidence: str = "medium"
    reference: Optional[str] = Field(default=None, max_length=32)
    balance_paise: Optional[int] = None
    selected: bool = True


class StatementCommitReq(BaseModel):
    file_name: str = Field(default="statement", max_length=160)
    bank_name: Optional[str] = Field(default=None, max_length=80)
    account_label: Optional[str] = Field(default=None, max_length=80)
    rows: list[StatementCommitRow] = Field(default_factory=list, max_length=MAX_PREVIEW_ROWS)
    skip_duplicates: bool = True


class StatementVendorCategoryReq(BaseModel):
    group_key: str = Field(min_length=3, max_length=80)
    category: str = Field(min_length=2, max_length=40)
    display_name: Optional[str] = Field(default=None, max_length=80)


def _safe_text(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).strip().split())
    if not cleaned:
        return None
    return cleaned[:max_length]


def _clean_direction(value: str) -> str:
    direction = (value or "debit").strip().lower()
    if direction not in {"debit", "credit"}:
        raise HTTPException(status_code=400, detail="Statement row direction must be debit or credit")
    return direction


def _clean_confidence(value: str) -> str:
    confidence = (value or "medium").strip().lower()
    if confidence not in {"high", "medium", "low"}:
        return "medium"
    return confidence


def _clean_category(value: str | None) -> str:
    category = _safe_text(value, 40) or "other"
    return category.strip().lower() or "other"


def _clean_display_name(value: str | None, fallback: str) -> str:
    display = _safe_text(value, 80) or _safe_text(fallback, 80) or "Statement vendor"
    return display


async def _known_vendor_mapping(db, user_id: str, group_key: str) -> dict | None:
    if not group_key:
        return None
    return await db.merchant_category_mappings.find_one(
        {
            "user_id": user_id,
            "source": "statement_import",
            "statement_vendor_key": group_key,
        }
    )


async def _duplicate_reason(db, user_id: str, row: StatementCommitRow) -> str | None:
    start = row.posted_at.replace(tzinfo=None) - datetime.timedelta(days=1)
    end = row.posted_at.replace(tzinfo=None) + datetime.timedelta(days=1)
    candidates = await db.transactions.find(
        {
            "user_id": user_id,
            "amount": row.amount_paise,
            "direction": _clean_direction(row.direction),
            "created_at": {"$gte": start, "$lt": end},
        }
    ).to_list(length=25)

    row_desc = normalize_statement_description(row.description)
    row_ref = (row.reference or "").upper()
    for candidate in candidates:
        candidate_ref = str(candidate.get("transaction_reference") or "").upper()
        if row_ref and candidate_ref and row_ref == candidate_ref:
            return "same reference"
        candidate_desc = normalize_statement_description(
            candidate.get("mapped_merchant_name") or candidate.get("raw_merchant_string") or ""
        )
        if row_desc and candidate_desc and (row_desc == candidate_desc or row_desc in candidate_desc or candidate_desc in row_desc):
            return "same date, amount, direction and merchant"
    return None


async def _maybe_detect_subscription(db, user_id: str, txn: dict) -> None:
    if txn.get("direction") != "debit":
        return
    merchant = txn.get("mapped_merchant_name") or txn.get("raw_merchant_string") or ""
    service_name = subscription_name_for_merchant(merchant)
    if txn.get("category") == "subscription":
        service_name = service_name or clean_merchant_name(merchant)
        if service_name:
            await upsert_subscription(
                db,
                user_id=user_id,
                service_name=service_name,
                amount_paise=txn["amount"],
                next_debit_date=next_future_debit(txn["created_at"], 30),
                detected_from="statement_import",
                observed_at=txn["created_at"],
                observed_interval_days=30,
            )
    elif service_name:
        await upsert_subscription_for_transaction(
            db,
            user_id=user_id,
            merchant=merchant,
            amount_paise=txn["amount"],
            observed_at=txn["created_at"],
            detected_from="statement_import",
        )


def _window_count(dates: list[datetime.datetime], days: int) -> int:
    if not dates:
        return 0
    ordered = sorted(date.replace(tzinfo=None) for date in dates)
    best = 1
    left = 0
    for right, current in enumerate(ordered):
        while current - ordered[left] > datetime.timedelta(days=days):
            left += 1
        best = max(best, right - left + 1)
    return best


async def _build_and_mark_vendor_review_prompts(db, user_id: str, imported_ids: list[str], now: datetime.datetime) -> list[dict]:
    if not imported_ids:
        return []
    imported_rows = await db.transactions.find({"user_id": user_id, "_id": {"$in": imported_ids}}).to_list(length=MAX_PREVIEW_ROWS)
    candidate_keys = {
        row.get("statement_vendor_key")
        for row in imported_rows
        if row.get("direction") == "debit"
        and row.get("statement_vendor_key")
        and (row.get("category") in {None, "", "other", "general"} or row.get("parsing_confidence") != "high")
        and row.get("category_review_status") != "mapped"
    }
    prompts: list[dict] = []
    for group_key in sorted(candidate_keys):
        mapping = await _known_vendor_mapping(db, user_id, group_key)
        if mapping:
            continue
        all_group_rows = await db.transactions.find(
            {
                "user_id": user_id,
                "statement_vendor_key": group_key,
                "direction": "debit",
            }
        ).to_list(length=500)
        review_rows = [
            row
            for row in all_group_rows
            if row.get("category") in {None, "", "other", "general"} or row.get("parsing_confidence") != "high"
        ]
        review_dates = [
            row.get("created_at")
            for row in review_rows
            if isinstance(row.get("created_at"), datetime.datetime)
        ]
        weekly_count = _window_count(review_dates, 7)
        monthly_count = _window_count(review_dates, 30)
        if weekly_count < REPEAT_VENDOR_WEEKLY_THRESHOLD and monthly_count < REPEAT_VENDOR_MONTHLY_THRESHOLD:
            continue
        display_name = statement_vendor_display_name(
            str(review_rows[0].get("mapped_merchant_name") or review_rows[0].get("raw_merchant_string") or group_key)
        )
        total_paise = sum(int(row.get("amount") or 0) for row in review_rows)
        await db.transactions.update_many(
            {
                "user_id": user_id,
                "_id": {"$in": [row["_id"] for row in review_rows if row.get("_id")]},
            },
            {
                "$set": {
                    "needs_category_review": True,
                    "category_review_status": "pending",
                    "category_review_count": len(review_rows),
                    "category_review_prompted_at": now,
                }
            },
        )
        prompts.append(
            {
                "group_key": group_key,
                "display_name": display_name,
                "category": "other",
                "count": len(review_rows),
                "weekly_count": weekly_count,
                "monthly_count": monthly_count,
                "total_paise": total_paise,
                "reason": "repeated_unknown_statement_vendor",
            }
        )
    return sorted(prompts, key=lambda item: (item["weekly_count"], item["monthly_count"], item["total_paise"]), reverse=True)[
        :MAX_VENDOR_REVIEW_PROMPTS
    ]


@router.post("/preview")
async def preview_statement_import(
    file: UploadFile = File(...),
    password: Optional[str] = Form(default=None),
    bank_name: Optional[str] = Form(default=None),
    user_id: str = Depends(get_current_user),
):
    filename = file.filename or "statement"
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if suffix not in {"csv", "tsv", "txt", "pdf"}:
        raise HTTPException(status_code=400, detail="Upload CSV, TSV, TXT, or a text-based PDF statement.")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Statement file is too large. Keep uploads under 8 MB.")
    try:
        rows = parse_statement_file(filename, content, password=password)
    except StatementImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db = get_db()
    preview_rows = []
    for row in rows:
        row_dict = row.to_preview_dict()
        duplicate_reason = await _duplicate_reason(
            db,
            user_id,
            StatementCommitRow(
                row_id=row.row_id,
                posted_at=row.posted_at,
                description=row.description,
                amount_paise=row.amount_paise,
                direction=row.direction,
                category=row.category,
                confidence=row.confidence,
                reference=row.reference,
                balance_paise=row.balance_paise,
            ),
        )
        row_dict["duplicate_candidate"] = bool(duplicate_reason)
        row_dict["duplicate_reason"] = duplicate_reason
        preview_rows.append(row_dict)

    return {
        "file_name": filename,
        "bank_name": _safe_text(bank_name, 80),
        "row_count": len(rows),
        "rows": preview_rows,
        "privacy": {
            "raw_file_stored": False,
            "password_stored": False,
            "review_required": True,
            "note": "PocketBuddy previews rows first and stores only selected normalized transactions.",
        },
        "limits": {
            "max_preview_rows": MAX_PREVIEW_ROWS,
            "best_format": "CSV exported from bank portal",
        },
    }


@router.post("/commit")
async def commit_statement_import(req: StatementCommitReq, user_id: str = Depends(get_current_user)):
    selected_rows = [row for row in req.rows if row.selected]
    if not selected_rows:
        raise HTTPException(status_code=400, detail="Select at least one statement row to import.")

    db = get_db()
    now = datetime.datetime.utcnow()
    batch_id = str(uuid.uuid4())
    inserted = 0
    duplicates = []
    imported_ids = []
    imported_dates = []

    batch_doc = {
        "_id": batch_id,
        "user_id": user_id,
        "source": "statement_import",
        "file_name": _safe_text(req.file_name, 160) or "statement",
        "bank_name": _safe_text(req.bank_name, 80),
        "account_label": _safe_text(req.account_label, 80),
        "raw_file_stored": False,
        "password_stored": False,
        "status": "importing",
        "created_at": now,
        "updated_at": now,
        "selected_count": len(selected_rows),
        "inserted_count": 0,
        "duplicate_count": 0,
    }
    await db.statement_import_batches.insert_one(batch_doc)

    for row in selected_rows:
        row_direction = _clean_direction(row.direction)
        confidence = _clean_confidence(row.confidence)
        row_category = _clean_category(row.category) or guess_category(row.description, row_direction)
        row_description = _safe_text(row.description, 120) or "Statement entry"
        duplicate_reason = await _duplicate_reason(db, user_id, row)
        if duplicate_reason and req.skip_duplicates:
            duplicates.append({"row_id": row.row_id, "reason": duplicate_reason})
            continue

        created_at = row.posted_at.replace(tzinfo=None)
        vendor_key = statement_vendor_group_key(row_description) if row_direction == "debit" else ""
        known_mapping = await _known_vendor_mapping(db, user_id, vendor_key)
        mapped_merchant_name = row_description
        category_review_status = "not_needed"
        if known_mapping:
            row_category = _clean_category(known_mapping.get("category"))
            mapped_merchant_name = _clean_display_name(known_mapping.get("display_name"), row_description)
            category_review_status = "mapped"
        txn = {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": row.amount_paise,
            "raw_merchant_string": row_description,
            "mapped_merchant_name": mapped_merchant_name,
            "category": row_category.strip().lower(),
            "source": "statement_import",
            "is_mapped": bool(known_mapping) or confidence != "low",
            "direction": row_direction,
            "data_origin": "bank_statement_upload",
            "privacy_mode": "statement_reviewed_import",
            "raw_payload_received": False,
            "verification_status": "user_reviewed" if confidence != "low" else "needs_review",
            "parsing_confidence": confidence,
            "needs_verification": confidence == "low",
            "statement_import_batch_id": batch_id,
            "statement_row_id": row.row_id,
            "statement_vendor_key": vendor_key or None,
            "needs_category_review": False,
            "category_review_status": category_review_status,
            "transaction_reference": _safe_text(row.reference, 32),
            "statement_balance_paise": row.balance_paise,
            "duplicate_warning": duplicate_reason,
            "created_at": created_at,
            "imported_at": now,
        }
        await db.transactions.insert_one(txn)
        await _maybe_detect_subscription(db, user_id, txn)
        inserted += 1
        imported_ids.append(txn["_id"])
        imported_dates.append(created_at)

    vendor_review_prompts = await _build_and_mark_vendor_review_prompts(db, user_id, imported_ids, now)

    update = {
        "status": "completed",
        "updated_at": datetime.datetime.utcnow(),
        "inserted_count": inserted,
        "duplicate_count": len(duplicates),
        "imported_transaction_ids": imported_ids,
        "vendor_review_prompt_count": len(vendor_review_prompts),
    }
    if imported_dates:
        update["date_start"] = min(imported_dates)
        update["date_end"] = max(imported_dates)
    await db.statement_import_batches.update_one({"_id": batch_id, "user_id": user_id}, {"$set": update})

    return {
        "status": "ok",
        "batch_id": batch_id,
        "inserted_count": inserted,
        "duplicate_count": len(duplicates),
        "duplicates": duplicates,
        "vendor_review_prompts": vendor_review_prompts,
        "raw_file_stored": False,
        "password_stored": False,
    }


@router.post("/vendor-category")
async def apply_statement_vendor_category(req: StatementVendorCategoryReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    now = datetime.datetime.utcnow()
    group_key = statement_vendor_group_key(req.group_key)
    category = _clean_category(req.category)
    display_name = _clean_display_name(req.display_name, statement_vendor_display_name(group_key))
    if category in {"", "other", "general"}:
        raise HTTPException(status_code=400, detail="Choose a specific category for this repeated vendor.")
    matching_rows = await db.transactions.find(
        {
            "user_id": user_id,
            "statement_vendor_key": group_key,
            "direction": "debit",
        }
    ).to_list(length=500)
    if not matching_rows:
        raise HTTPException(status_code=404, detail="Repeated statement vendor not found.")

    await db.merchant_category_mappings.update_one(
        {
            "user_id": user_id,
            "source": "statement_import",
            "statement_vendor_key": group_key,
        },
        {
            "$set": {
                "user_id": user_id,
                "source": "statement_import",
                "statement_vendor_key": group_key,
                "display_name": display_name,
                "category": category,
                "match_count": len(matching_rows),
                "updated_at": now,
            },
            "$setOnInsert": {
                "_id": str(uuid.uuid4()),
                "created_at": now,
            },
        },
        upsert=True,
    )
    result = await db.transactions.update_many(
        {
            "user_id": user_id,
            "statement_vendor_key": group_key,
            "direction": "debit",
        },
        {
            "$set": {
                "mapped_merchant_name": display_name,
                "category": category,
                "is_mapped": True,
                "needs_category_review": False,
                "category_review_status": "mapped",
                "category_review_resolved_at": now,
                "needs_verification": False,
                "verification_status": "user_reviewed",
                "user_confirmed_at": now,
            }
        },
    )
    return {
        "status": "ok",
        "group_key": group_key,
        "display_name": display_name,
        "category": category,
        "updated_count": result.modified_count,
    }


@router.get("/batches")
async def list_statement_import_batches(user_id: str = Depends(get_current_user)):
    db = get_db()
    batches = await db.statement_import_batches.find({"user_id": user_id}).sort("created_at", -1).to_list(length=50)
    return map_docs(batches)


@router.post("/batches/{batch_id}/rollback")
async def rollback_statement_import(batch_id: str, user_id: str = Depends(get_current_user)):
    db = get_db()
    batch = await db.statement_import_batches.find_one({"_id": batch_id, "user_id": user_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")
    if batch.get("status") == "rolled_back":
        return {"status": "ok", "deleted_count": 0, "message": "Import batch was already rolled back."}

    result = await db.transactions.delete_many(
        {
            "user_id": user_id,
            "source": "statement_import",
            "statement_import_batch_id": batch_id,
        }
    )
    await db.statement_import_batches.update_one(
        {"_id": batch_id, "user_id": user_id},
        {
            "$set": {
                "status": "rolled_back",
                "rolled_back_at": datetime.datetime.utcnow(),
                "updated_at": datetime.datetime.utcnow(),
                "rolled_back_count": result.deleted_count,
            }
        },
    )
    return {"status": "ok", "deleted_count": result.deleted_count}
