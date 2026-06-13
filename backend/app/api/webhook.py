from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import datetime
import jwt
import re
import uuid

from app.core.config import settings
from app.core.database import get_db

router = APIRouter()


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
    normalized = re.sub(r"\s+", " ", merchant).strip(" .,-")
    return normalized[:120] if normalized else None


def detect_subscription(merchant: Optional[str]) -> Optional[str]:
    if not merchant:
        return None

    subscriptions_map = {
        "spotify": "Spotify",
        "netflix": "Netflix",
        "youtube": "YouTube Premium",
        "prime": "Amazon Prime",
        "hotstar": "Disney+ Hotstar",
        "zee5": "Zee5",
        "sonyliv": "SonyLIV",
        "jio": "JioFiber",
        "airtel": "Airtel Thanks",
        "vi ": "Vi Postpaid",
        "xbox": "Xbox Game Pass",
        "playstation": "PlayStation Plus",
        "nintendo": "Nintendo Switch Online",
        "steam": "Steam",
        "adobe": "Adobe Creative Cloud",
        "canva": "Canva Pro",
        "chatgpt": "ChatGPT Plus",
        "midjourney": "Midjourney",
        "github": "GitHub Copilot",
        "icloud": "Apple iCloud",
        "googleone": "Google One",
        "google one": "Google One",
        "notion": "Notion",
        "duolingo": "Duolingo Plus",
        "swiggy": "Swiggy One",
        "zomato": "Zomato Gold",
        "zepto": "Zepto Pass",
        "blinkit": "Blinkit Club"
    }
    low = merchant.lower()
    for kw, display_name in subscriptions_map.items():
        if kw in low:
            return display_name
    return None


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


async def update_profile_sync_state(db, user_id: str, req: WebhookReq, now: datetime.datetime):
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
    if req.sourceApp:
        update["$addToSet"] = {"upi_apps_used": req.sourceApp}

    await db.profiles.update_one({"_id": user_id}, update)


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

    if profile.get("pairing_code") and req.pairing_code and profile["pairing_code"] != req.pairing_code:
        raise HTTPException(status_code=403, detail="Invalid pairing code")

    raw_body = req.text or req.body or ""
    notification_source = req.captureSource or req.type or req.source or "unknown"
    device_id = req.deviceId or x_pocketbuddy_device_id
    log_id = str(uuid.uuid4())

    await db.companion_sync_log.insert_one(
        {
            "_id": log_id,
            "user_id": user_id,
            "device_id": device_id,
            "device_name": req.device_name or req.sourceApp or req.packageName,
            "notification_source": notification_source,
            "raw_body": raw_body,
            "processing_status": "pending",
            "package_name": req.packageName,
            "source_app": req.sourceApp,
            "transaction_reference": req.transactionId,
            "created_at": now,
        }
    )

    direction = (req.direction or "debit").lower()
    if direction != "debit":
        await mark_sync_log(db, log_id, "failed")
        await update_profile_sync_state(db, user_id, req, now)
        return {"status": "ignored", "reason": "non_debit_transaction"}

    amount_paise = int(round(req.amount * 100)) if req.amount is not None else parse_amount(raw_body)
    merchant = normalize_merchant(req.merchant) or parse_merchant(raw_body)
    transaction_reference = req.transactionId or parse_transaction_id(raw_body)

    if not raw_body or not amount_paise or not merchant:
        await mark_sync_log(db, log_id, "failed", amount_paise, merchant)
        await update_profile_sync_state(db, user_id, req, now)
        return {"status": "parse_failed"}

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
        await update_profile_sync_state(db, user_id, req, now)
        return {"status": "duplicate", "transaction_id": existing_txn["_id"]}

    merchant_doc = await db.merchant_directory.find_one({"raw_string": merchant})
    source = "companion_sms" if "sms" in notification_source.lower() else "companion_notification"
    txn_id = str(uuid.uuid4())
    new_txn = {
        "_id": txn_id,
        "user_id": user_id,
        "amount": amount_paise,
        "currency": req.currency or "INR",
        "direction": direction,
        "raw_merchant_string": merchant,
        "mapped_merchant_name": merchant_doc["display_name"] if merchant_doc else None,
        "category": merchant_doc["category"] if merchant_doc else None,
        "is_mapped": bool(merchant_doc),
        "source": source,
        "raw_notification_body": raw_body,
        "transaction_reference": transaction_reference,
        "device_id": device_id,
        "package_name": req.packageName,
        "source_app": req.sourceApp,
        "capture_source": notification_source,
        "detected_at_device": millis_to_utc_datetime(req.detectedAtDeviceMillis or req.timestamp),
        "created_at": now,
    }

    await db.transactions.insert_one(new_txn)
    await mark_sync_log(db, log_id, "parsed", amount_paise, merchant, txn_id)
    await update_profile_sync_state(db, user_id, req, now)

    sub_name = detect_subscription(merchant)
    if sub_name:
        existing_sub = await db.subscriptions.find_one(
            {
                "user_id": user_id,
                "$or": [{"service_name": sub_name}, {"name": sub_name}],
            }
        )
        if not existing_sub:
            next_month = now + datetime.timedelta(days=30)
            await db.subscriptions.insert_one(
                {
                    "_id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "name": sub_name,
                    "service_name": sub_name,
                    "amount": amount_paise,
                    "billing_cycle": "monthly",
                    "next_debit_date": next_month,
                    "is_active": True,
                    "detected_from": "auto_detected",
                    "created_at": now,
                }
            )

    return {"status": "ok", "transaction_id": txn_id}
