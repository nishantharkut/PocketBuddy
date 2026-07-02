from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import datetime
import jwt
import re
import uuid
import logging

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.subscriptions import (
    subscription_name_for_merchant,
    upsert_subscription_for_transaction,
)

router = APIRouter()
logger = logging.getLogger("app.api.webhook")


class WebhookReq(BaseModel):
    # Legacy webhook shape.
    user_id: Optional[str] = None
    pairing_code: Optional[str] = None
    body: Optional[str] = None
    source: Optional[str] = None
    type: Optional[str] = None
    device_name: Optional[str] = None

    # Android connector shape.
    packageName: Optional[str] = None
    text: Optional[str] = None
    timestamp: Optional[int] = None
    sourceApp: Optional[str] = None
    captureSource: Optional[str] = None
    deviceId: Optional[str] = None
    userId: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    direction: Optional[str] = None
    merchant: Optional[str] = None
    transactionId: Optional[str] = None
    detectedAtDeviceMillis: Optional[int] = None


def parse_amount(text: str) -> Optional[int]:
    amount_match = re.search(
        r"(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        text,
        re.IGNORECASE,
    )
    if not amount_match:
        return None
    return int(round(float(amount_match.group(1).replace(",", "")) * 100))


def parse_merchant(text: str) -> Optional[str]:
    to_match = re.search(
        r"(?:sent\s+)?(?:to|at)\s+(.+?)(?:\s+on\s+\d|\.|,|$)",
        text,
        re.IGNORECASE,
    )
    if to_match:
        return normalize_merchant(to_match.group(1))

    upi_match = re.search(r"UPI/([A-Z0-9_\-]+)", text, re.IGNORECASE)
    if upi_match:
        return normalize_merchant(upi_match.group(1))

    return None


def parse_transaction_id(text: str) -> Optional[str]:
    patterns = [
        r"(?:upi\s*ref(?:erence)?\s*(?:no\.?|number)?|upi\s*txn(?:\s*id)?|upi\s*transaction(?:\s*id)?|utr|txn\s*id)\s*[:.\-]?\s*([A-Z0-9]{6,})",
        r"UPI/([A-Z0-9_\-]{6,})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def normalize_merchant(merchant: Optional[str]) -> Optional[str]:
    if not merchant:
        return None
    
    cleaned = re.sub(r"\s+", " ", merchant).strip()
    
    # 1. Remove balance info (e.g. "Bal INR 13015.82", "Bal Rs 100", etc.)
    cleaned = re.sub(
        r"\b(?:avail(?:able)?\s+)?bal(?:ance)?\b.*?(?:rs\.?|inr|₹)?\s*\d+(?:\.\d{1,2})?",
        "",
        cleaned,
        flags=re.IGNORECASE
    )
    
    # 2. Remove standard safety alerts / SMS instructions (e.g. "Not u?...", "Fwd this SMS...")
    cleaned = re.sub(
        r"\b(?:not\s+u\??|not\s+you\??|fwd\s+this\s+sms\s+to|fwd\s+to).*?$",
        "",
        cleaned,
        flags=re.IGNORECASE
    )
    
    # 3. Remove numeric IDs / references (e.g., 10-12 digit mobile or reference numbers)
    cleaned = re.sub(r"\b\d{10,12}\b", "", cleaned)
    
    # 4. Remove generic transaction connectors ("thru/via/using UPI")
    cleaned = re.sub(r"\b(?:thru|via|using)\s+upi\b[:\-]?\s*", "", cleaned, flags=re.IGNORECASE)
    
    # 5. Clean up spaces, colons, slashes, trailing periods, commas, hyphens
    normalized = re.sub(r"\s+", " ", cleaned).strip(" .,-/:")
    
    return normalized[:120] if normalized else None



def mask_notification_text(text: str) -> str:
    preview = re.sub(r"\s+", " ", text).strip()
    preview = re.sub(r"https?://\S+", "[link]", preview, flags=re.IGNORECASE)
    preview = re.sub(
        r"([A-Z]{2,}-[A-Z0-9]{2,}-?[A-Z0-9]*\s*)",
        "",
        preview,
        flags=re.IGNORECASE,
    )
    preview = re.sub(
        r"((?:upi\s*ref(?:erence)?\s*(?:no\.?|number)?|utr|txn\s*id)\s*[:.\-]?\s*)[A-Z0-9]{4,}",
        r"\1[ref]",
        preview,
        flags=re.IGNORECASE,
    )
    preview = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email]", preview, flags=re.IGNORECASE)
    preview = re.sub(r"(?<!\d)\d{4,}(?!\d)", "[digits]", preview)
    return preview[:180]


def user_id_from_authorization(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload.get("userId")
    except jwt.PyJWTError:
        return None


def millis_to_utc_datetime(value: Optional[int]) -> Optional[datetime.datetime]:
    if value is None:
        return None
    try:
        return datetime.datetime.utcfromtimestamp(value / 1000)
    except (OverflowError, OSError, ValueError):
        return None


async def update_profile_sync_state(db, user_id: str, req: WebhookReq, now: datetime.datetime, device_id: Optional[str] = None):
    device_name = (
        req.device_name
        or req.sourceApp
        or req.packageName
        or "PocketBuddy Android Connector"
    )
    update = {
        "$set": {
            "companion_paired": True,
            "companion_device_name": device_name,
            "companion_last_sync": now,
        }
    }
    if device_id:
        update["$set"]["companion_device_id"] = device_id
    if req.sourceApp:
        update["$addToSet"] = {"upi_apps_used": req.sourceApp}

    await db.profiles.update_one({"_id": user_id}, update)

    if device_id:
        # Cascade-unpair any other user registered with this same physical device ID
        await db.profiles.update_many(
            {"_id": {"$ne": user_id}, "companion_device_id": device_id},
            {
                "$set": {
                    "companion_paired": False,
                    "companion_device_name": None,
                    "companion_last_sync": None,
                    "companion_device_id": None
                }
            }
        )


async def mark_sync_log(
    db,
    log_id: str,
    status: str,
    amount_paise: Optional[int] = None,
    merchant: Optional[str] = None,
    txn_id: Optional[str] = None,
):
    await db.companion_sync_log.update_one(
        {"_id": log_id},
        {
            "$set": {
                "processing_status": status,
                "parsed_amount": amount_paise / 100 if amount_paise is not None else None,
                "parsed_merchant": merchant,
                "transaction_id": txn_id,
                "updated_at": datetime.datetime.utcnow(),
            }
        },
    )


async def try_auto_verify_pool_payment(db, user_id: str, text: str, amount_from_req: Optional[float] = None, utr_from_req: Optional[str] = None) -> bool:
    # Look for credit keywords
    text_lower = text.lower()
    credit_keywords = ["received", "credited", "deposit", "added", "plus", "credited to a/c"]
    is_credit = any(kw in text_lower for kw in credit_keywords) or (amount_from_req is not None and "credit" in text_lower)

    if not is_credit:
        return False

    utr = utr_from_req or parse_transaction_id(text)
    if not utr:
        return False

    # Find completed pool hosted by this user with a pending payment matching this UTR
    pool = await db.cart_pools.find_one({
        "host_id": user_id,
        "status": "completed",
        "payments": {
            "$elemMatch": {
                "utr": utr,
                "status": "pending"
            }
        }
    })

    if pool:
        # Mark roommate status to verified
        res = await db.cart_pools.update_one(
            {"_id": pool["_id"], "payments.utr": utr},
            {"$set": {"payments.$.status": "verified"}}
        )
        if res.modified_count > 0:
            return True

    return False


@router.post("/")
@router.post("/notification")
async def ingest_notification(
    req: WebhookReq,
    authorization: Optional[str] = Header(None),
    x_pocketbuddy_user_id: Optional[str] = Header(None, alias="X-PocketBuddy-User-Id"),
    x_pocketbuddy_device_id: Optional[str] = Header(None, alias="X-PocketBuddy-Device-Id"),
):
    db = get_db()
    now = datetime.datetime.utcnow()
    user_id = user_id_from_authorization(authorization) or x_pocketbuddy_user_id or req.userId or req.user_id

    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user binding")

    profile = await db.profiles.find_one({"_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    # Extract token from authorization header if present
    provided_token = None
    if authorization and authorization.startswith("Bearer "):
        provided_token = authorization.split(" ", 1)[1].strip()

    client_pairing_code = provided_token or req.pairing_code

    if profile.get("pairing_code"):
        if not client_pairing_code or profile["pairing_code"] != client_pairing_code:
            raise HTTPException(status_code=403, detail="Invalid pairing code")

    if req.type == "unpair" or req.source == "unpair":
        await db.profiles.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "companion_paired": False,
                    "companion_device_name": None,
                    "companion_last_sync": None,
                    "companion_device_id": None
                }
            }
        )
        return {"status": "ok", "message": "unpaired_successfully"}

    raw_body = req.text or req.body or ""
    notification_preview = mask_notification_text(raw_body)
    notification_source = req.captureSource or req.type or req.source or "unknown"
    device_id = req.deviceId or x_pocketbuddy_device_id
    log_id = str(uuid.uuid4())

    sync_enabled = profile.get("companion_sync_enabled", True)
    initial_status = "pending" if sync_enabled else "paused"

    await db.companion_sync_log.insert_one(
        {
            "_id": log_id,
            "user_id": user_id,
            "device_id": device_id,
            "device_name": req.device_name or req.sourceApp or req.packageName,
            "notification_source": notification_source,
            "notification_preview": notification_preview,
            "processing_status": initial_status,
            "package_name": req.packageName,
            "source_app": req.sourceApp,
            "transaction_reference": req.transactionId,
            "created_at": now,
        }
    )

    if not sync_enabled:
        await update_profile_sync_state(db, user_id, req, now, device_id)
        return {"status": "paused", "reason": "sync_disabled_by_user"}

    # Intercept roommate split payments sent to the host via UPI
    is_auto_verified = await try_auto_verify_pool_payment(
        db,
        user_id,
        raw_body,
        amount_from_req=req.amount,
        utr_from_req=req.transactionId
    )
    if is_auto_verified:
        await db.companion_sync_log.update_one(
            {"_id": log_id},
            {
                "$set": {
                    "processing_status": "auto_verified",
                    "updated_at": datetime.datetime.utcnow(),
                }
            }
        )
        await update_profile_sync_state(db, user_id, req, now, device_id)
        return {"status": "auto_verified", "reason": "verified_pool_payment"}

    direction = (req.direction or "debit").lower()
    amount_paise = int(round(req.amount * 100)) if req.amount is not None else parse_amount(raw_body)
    merchant = normalize_merchant(req.merchant) or parse_merchant(raw_body)
    if not merchant and direction == "credit":
        from_match = re.search(
            r"from\s+(.+?)(?:\s+on\s+\d|\.|,|$)",
            raw_body,
            re.IGNORECASE,
        )
        if from_match:
            merchant = normalize_merchant(from_match.group(1))
        else:
            merchant = "UPI Credit"

    transaction_reference = req.transactionId or parse_transaction_id(raw_body)

    if not raw_body or not amount_paise or not merchant:
        await mark_sync_log(db, log_id, "incomplete", amount_paise, merchant, transaction_reference)
        await update_profile_sync_state(db, user_id, req, now, device_id)
        return {"status": "incomplete", "reason": "missing_amount_or_merchant"}

    duplicate_filter = None
    if transaction_reference:
        duplicate_filter = {
            "user_id": user_id,
            "transaction_reference": transaction_reference,
        }
    else:
        duplicate_filter = {
            "user_id": user_id,
            "amount": amount_paise,
            "raw_merchant_string": merchant,
            "created_at": {"$gte": now - datetime.timedelta(minutes=3)},
        }

    existing_txn = await db.transactions.find_one(duplicate_filter)
    if existing_txn:
        await mark_sync_log(db, log_id, "duplicate", amount_paise, merchant, existing_txn["_id"])
        await update_profile_sync_state(db, user_id, req, now, device_id)
        return {"status": "duplicate", "transaction_id": existing_txn["_id"]}

    merchant_doc = await db.merchant_directory.find_one({"raw_string": merchant})
    sub_name = subscription_name_for_merchant(merchant)
    mapped_merchant_name = merchant_doc["display_name"] if merchant_doc else sub_name
    category = merchant_doc["category"] if merchant_doc else ("subscription" if sub_name else None)

    if direction == "credit" and not category:
        category = "income"

    # --- Parser Feedback Loop: Confidence Scoring ---
    # If amount/merchant came from the Android app's pre-parsed data, confidence is high.
    # If we had to regex-parse from raw text, confidence is lower.
    parsing_confidence = "high"
    needs_verification = False
    if req.amount is not None and req.merchant:
        parsing_confidence = "high"  # Pre-parsed by Android app
    elif amount_paise and merchant:
        parsing_confidence = "medium"  # Regex-parsed successfully
    else:
        parsing_confidence = "low"
        needs_verification = True

    # If merchant is unmapped and not a known subscription, flag for verification
    if not merchant_doc and not sub_name and direction == "debit":
        needs_verification = True
        if parsing_confidence == "high":
            parsing_confidence = "medium"

    source = "companion_sms" if "sms" in notification_source.lower() else "companion_notification"
    txn_id = str(uuid.uuid4())
    new_txn = {
        "_id": txn_id,
        "user_id": user_id,
        "amount": amount_paise,
        "currency": req.currency or "INR",
        "direction": direction,
        "raw_merchant_string": merchant,
        "mapped_merchant_name": mapped_merchant_name or merchant,
        "category": category or "other",
        "is_mapped": bool(merchant_doc or sub_name),
        "source": source,
        "notification_preview": notification_preview,
        "transaction_reference": transaction_reference,
        "device_id": device_id,
        "package_name": req.packageName,
        "source_app": req.sourceApp,
        "capture_source": notification_source,
        "detected_at_device": millis_to_utc_datetime(req.detectedAtDeviceMillis or req.timestamp),
        "parsing_confidence": parsing_confidence,
        "needs_verification": needs_verification,
        "created_at": now,
    }

    await db.transactions.insert_one(new_txn)
    log_status = "received" if direction == "credit" else "parsed"
    await mark_sync_log(db, log_id, log_status, amount_paise, merchant, txn_id)
    await update_profile_sync_state(db, user_id, req, now, device_id)

    if sub_name and direction == "debit":
        await upsert_subscription_for_transaction(
            db,
            user_id=user_id,
            merchant=merchant,
            amount_paise=amount_paise,
            observed_at=now,
            detected_from="auto_detected",
        )

    return {"status": "ok", "transaction_id": txn_id, "parsing_confidence": parsing_confidence, "needs_verification": needs_verification}


# ---------------------------------------------------------------------------
# Strategy 5: Parser Feedback Loop – Correction Logging
# ---------------------------------------------------------------------------

class CorrectionReq(BaseModel):
    transaction_id: str
    corrected_amount: Optional[int] = None     # in paise
    corrected_merchant: Optional[str] = None
    corrected_category: Optional[str] = None
    corrected_direction: Optional[str] = None


@router.post("/correction")
async def log_parser_correction(
    req: CorrectionReq,
    authorization: Optional[str] = Header(None),
    x_pocketbuddy_user_id: Optional[str] = Header(None, alias="X-PocketBuddy-User-Id"),
):
    """
    When a user manually corrects a parsed transaction (amount, merchant, or category),
    log the correction pair (original vs corrected) into parser_corrections.

    This telemetry collection is the input for future parser heuristic improvements.
    The raw notification text is stored in masked form only (privacy-safe).
    """
    db = get_db()
    user_id = user_id_from_authorization(authorization) or x_pocketbuddy_user_id
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user binding")

    txn = await db.transactions.find_one({"_id": req.transaction_id, "user_id": user_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    corrected_direction = None
    if req.corrected_direction is not None:
        corrected_direction = req.corrected_direction.lower().strip()
        if corrected_direction not in ("debit", "credit"):
            raise HTTPException(status_code=400, detail="Direction must be 'debit' or 'credit'")

    now = datetime.datetime.utcnow()
    correction_doc = {
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "transaction_id": req.transaction_id,
        "original_amount": txn.get("amount"),
        "original_merchant": txn.get("raw_merchant_string"),
        "original_category": txn.get("category"),
        "original_direction": txn.get("direction"),
        "corrected_amount": req.corrected_amount,
        "corrected_merchant": req.corrected_merchant,
        "corrected_category": req.corrected_category,
        "corrected_direction": corrected_direction,
        # Store masked notification preview only (privacy-safe, no raw SMS)
        "notification_preview": txn.get("notification_preview", ""),
        "source_app": txn.get("source_app"),
        "package_name": txn.get("package_name"),
        "parsing_confidence": txn.get("parsing_confidence"),
        "created_at": now,
    }

    await db.parser_corrections.insert_one(correction_doc)

    # Apply the correction to the transaction itself
    update_fields = {"needs_verification": False, "user_corrected": True}
    if req.corrected_amount is not None:
        update_fields["amount"] = req.corrected_amount
    if req.corrected_merchant is not None:
        update_fields["mapped_merchant_name"] = req.corrected_merchant
        update_fields["is_mapped"] = True
    if req.corrected_category is not None:
        update_fields["category"] = req.corrected_category
    if corrected_direction is not None:
        update_fields["direction"] = corrected_direction

    await db.transactions.update_one(
        {"_id": req.transaction_id, "user_id": user_id},
        {"$set": update_fields},
    )

    logger.info(
        "Parser correction logged for txn %s by user %s (confidence was: %s)",
        req.transaction_id, user_id, txn.get("parsing_confidence"),
    )

    return {"status": "ok", "correction_id": correction_doc["_id"]}


@router.get("/parser-stats")
async def get_parser_stats(
    authorization: Optional[str] = Header(None),
    x_pocketbuddy_user_id: Optional[str] = Header(None, alias="X-PocketBuddy-User-Id"),
):
    """
    Parser health telemetry: how many transactions needed verification,
    how many were corrected, and the distribution of parsing confidence levels.
    Useful for monitoring parser drift as SMS formats change.
    """
    db = get_db()
    user_id = user_id_from_authorization(authorization) or x_pocketbuddy_user_id
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user binding")

    total_txns = await db.transactions.count_documents({"user_id": user_id})
    needs_verification = await db.transactions.count_documents(
        {"user_id": user_id, "needs_verification": True}
    )
    total_corrections = await db.parser_corrections.count_documents({"user_id": user_id})

    # Confidence distribution
    high = await db.transactions.count_documents({"user_id": user_id, "parsing_confidence": "high"})
    medium = await db.transactions.count_documents({"user_id": user_id, "parsing_confidence": "medium"})
    low = await db.transactions.count_documents({"user_id": user_id, "parsing_confidence": "low"})

    return {
        "total_transactions": total_txns,
        "needs_verification": needs_verification,
        "total_corrections": total_corrections,
        "confidence_distribution": {
            "high": high,
            "medium": medium,
            "low": low,
        },
    }
