from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import datetime
import hashlib
import hmac
import jwt
import re
import uuid
import logging

from app.core.config import settings
from app.core.database import get_db
from app.core.privacy import (
    connector_pairing_present,
    device_fingerprint,
    masked_device_id,
    verify_connector_pairing_token,
)
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

    # Privacy-preserving connector v2 shape. Raw notification text is parsed on
    # device; the server receives only transaction facts and a masked preview.
    maskedPreview: Optional[str] = None
    parserVersion: Optional[str] = None
    confidence: Optional[str] = None
    privacyMode: Optional[str] = None
    rawTextSuppressed: Optional[bool] = None
    schemaVersion: Optional[int] = None
    clientEventId: Optional[str] = None


def parse_amount(text: str) -> Optional[int]:
    # Try currency-prefixed patterns first (₹/Rs/INR before the number)
    prefix_match = re.search(
        r"(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        text,
        re.IGNORECASE,
    )
    if prefix_match:
        return int(round(float(prefix_match.group(1).replace(",", "")) * 100))

    # Try amount-labeled patterns: "Amt Rs 247", "Amount: 247", "amount of Rs 247"
    labeled_match = re.search(
        r"(?:amt|amount)[\s:.of]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        text,
        re.IGNORECASE,
    )
    if labeled_match:
        return int(round(float(labeled_match.group(1).replace(",", "")) * 100))

    # Try currency-suffixed patterns (number before INR/Rs)
    suffix_match = re.search(
        r"([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:₹|rs\.?|inr)\b",
        text,
        re.IGNORECASE,
    )
    if suffix_match:
        return int(round(float(suffix_match.group(1).replace(",", "")) * 100))

    return None


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
        # Standard UPI references
        r"(?:upi\s*ref(?:erence)?\s*(?:no\.?|number)?|upi\s*txn(?:\s*id)?|upi\s*transaction(?:\s*id)?|utr|txn\s*id)\s*[:.\\-]?\s*([A-Z0-9]{6,})",
        # UPI/NNNNN style (NPCI format)
        r"UPI/([A-Z0-9_\-]{6,})",
        # IMPS / NEFT / RTGS ref
        r"(?:imps|neft|rtgs)\s*ref(?:erence)?\s*(?:no\.?|number?)?\s*[:.\\-]?\s*([A-Z0-9]{6,})",
        # Generic "Ref No" / "Reference No"
        r"ref(?:erence)?\s*(?:no\.?|number?|#)\s*[:.\\-]?\s*([A-Z0-9]{8,})",
        # Fallback — any standalone 12-digit number (standard UTR length)
        r"\b(\d{12})\b",
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


def clean_confidence(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized if normalized in {"high", "medium", "low"} else None


def build_android_consent_id(user_id: str, device_id: Optional[str]) -> str:
    if not device_id:
        return f"android:{user_id}:unknown-device"
    return f"android:{user_id}:{device_fingerprint(device_id)}"


def legacy_android_consent_id(user_id: str, device_id: Optional[str]) -> str:
    return f"android:{user_id}:{device_id or 'unknown-device'}"


def verify_connector_request_signature(
    *,
    supplied_token: str,
    raw_body: bytes,
    timestamp_header: Optional[str],
    event_id_header: Optional[str],
    signature_header: Optional[str],
    now: datetime.datetime,
) -> bool:
    if not (timestamp_header and event_id_header and signature_header):
        if settings.CONNECTOR_SIGNATURE_REQUIRED:
            raise HTTPException(status_code=401, detail="Missing connector request signature")
        return False

    try:
        timestamp_ms = int(timestamp_header)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid connector signature timestamp")

    try:
        event_time = datetime.datetime.utcfromtimestamp(timestamp_ms / 1000)
    except (OverflowError, OSError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid connector signature timestamp")
    tolerance = max(60, int(settings.CONNECTOR_SIGNATURE_TOLERANCE_SECONDS))
    if abs((now - event_time).total_seconds()) > tolerance:
        raise HTTPException(status_code=401, detail="Stale connector request signature")

    signed_payload = (
        f"{timestamp_header}.{event_id_header}.".encode("utf-8") + raw_body
    )
    expected = hmac.new(
        supplied_token.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    supplied = signature_header.removeprefix("sha256=").strip()
    if not hmac.compare_digest(expected, supplied):
        raise HTTPException(status_code=401, detail="Invalid connector request signature")
    return True


def _coerce_datetime(value) -> Optional[datetime.datetime]:
    if isinstance(value, datetime.datetime):
        return value
    return None


def pairing_rotated_after_revocation(profile: dict, consent: Optional[dict]) -> bool:
    if not consent or consent.get("status") != "revoked":
        return False

    pairing_updated_at = _coerce_datetime(profile.get("pairing_code_updated_at"))
    revoked_at = _coerce_datetime(consent.get("revoked_at") or consent.get("updated_at"))
    return bool(pairing_updated_at and revoked_at and pairing_updated_at > revoked_at)


def connector_ingest_block_reason(
    profile: dict,
    consent: Optional[dict],
    device_id: Optional[str] = None,
) -> Optional[str]:
    if not connector_pairing_present(profile):
        return "connector_not_paired"

    if profile.get("companion_sync_enabled") is False:
        return "sync_disabled_by_user"

    device_block_reason = connector_device_binding_block_reason(profile, device_id)
    if device_block_reason:
        return device_block_reason

    consent_status = consent.get("status") if consent else None
    if consent_status == "paused":
        return "sync_paused_by_user"

    if consent_status == "revoked" and not pairing_rotated_after_revocation(profile, consent):
        return "consent_revoked_repair_required"

    return None


def connector_device_binding_block_reason(profile: dict, device_id: Optional[str]) -> Optional[str]:
    existing_fingerprint = profile.get("companion_device_fingerprint")
    if not existing_fingerprint or not device_id:
        return None

    incoming_fingerprint = device_fingerprint(device_id)
    if incoming_fingerprint and hmac.compare_digest(str(existing_fingerprint), str(incoming_fingerprint)):
        return None

    pairing_updated_at = _coerce_datetime(profile.get("pairing_code_updated_at"))
    last_sync_at = _coerce_datetime(profile.get("companion_last_sync"))
    if pairing_updated_at and (last_sync_at is None or pairing_updated_at > last_sync_at):
        return None

    return "device_repair_required"


async def find_android_consent(db, user_id: str, device_id: Optional[str]) -> Optional[dict]:
    consent = await db.data_consents.find_one({"_id": build_android_consent_id(user_id, device_id)})
    if consent:
        return consent

    if device_id:
        fingerprint = device_fingerprint(device_id)
        consent = await db.data_consents.find_one(
            {
                "user_id": user_id,
                "source": "android_connector",
                "device_fingerprint": fingerprint,
            }
        )
        if consent:
            return consent
        return await db.data_consents.find_one({"_id": legacy_android_consent_id(user_id, device_id)})

    return None


async def upsert_android_consent(
    db,
    *,
    user_id: str,
    device_id: Optional[str],
    req: WebhookReq,
    now: datetime.datetime,
    status: str = "active",
    sync_observed: bool = True,
) -> str:
    consent_id = build_android_consent_id(user_id, device_id)
    fingerprint = device_fingerprint(device_id)
    status_timestamps = {"last_sync_at": now} if sync_observed else {"last_blocked_at": now}
    update = {
        "$set": {
            "user_id": user_id,
            "source": "android_connector",
            "status": status,
            "purpose": "instant_payment_tracking",
            "data_categories": [
                "amount",
                "merchant",
                "direction",
                "transaction_reference",
                "source_app",
                "masked_preview",
            ],
            "device_id": masked_device_id(device_id),
            "device_fingerprint": fingerprint,
            "device_name": req.device_name or req.sourceApp or req.packageName or "PocketBuddy Android Connector",
            **status_timestamps,
            "raw_text_policy": "not_required_for_v2",
            "updated_at": now,
        },
        "$setOnInsert": {
            "_id": consent_id,
            "granted_at": now,
            "created_at": now,
        },
    }
    if status == "revoked":
        update["$set"]["revoked_at"] = now
    else:
        update["$unset"] = {"revoked_at": ""}
    await db.data_consents.update_one({"_id": consent_id}, update, upsert=True)
    return consent_id


async def record_blocked_connector_event(
    db,
    *,
    user_id: str,
    device_id: Optional[str],
    req: WebhookReq,
    now: datetime.datetime,
    reason: str,
    consent_status: str,
) -> str:
    consent_id = await upsert_android_consent(
        db,
        user_id=user_id,
        device_id=device_id,
        req=req,
        now=now,
        status=consent_status,
        sync_observed=False,
    )
    log_id = str(uuid.uuid4())
    await db.companion_sync_log.insert_one(
        {
            "_id": log_id,
            "user_id": user_id,
            "device_id": masked_device_id(device_id),
            "device_fingerprint": device_fingerprint(device_id),
            "device_name": req.device_name or req.sourceApp or req.packageName,
            "notification_source": req.captureSource or req.type or req.source or "unknown",
            "notification_preview": "Connector event blocked by your privacy controls before parsing.",
            "processing_status": reason,
            "package_name": req.packageName,
            "source_app": req.sourceApp,
            "transaction_reference": None,
            "data_origin": "android_on_device" if req.rawTextSuppressed or req.maskedPreview else "blocked_before_parse",
            "consent_id": consent_id,
            "parser_version": req.parserVersion,
            "source_confidence": clean_confidence(req.confidence),
            "privacy_mode": "blocked_by_user_control",
            "raw_payload_received": bool(req.text or req.body),
            "schema_version": req.schemaVersion,
            "client_event_id": req.clientEventId,
            "blocked_reason": reason,
            "created_at": now,
        }
    )
    return consent_id


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
        fingerprint = device_fingerprint(device_id)
        update["$set"]["companion_device_id"] = masked_device_id(device_id)
        update["$set"]["companion_device_fingerprint"] = fingerprint
    if req.sourceApp:
        update["$addToSet"] = {"upi_apps_used": req.sourceApp}

    await db.profiles.update_one({"_id": user_id}, update)

    if device_id:
        fingerprint = device_fingerprint(device_id)
        # Cascade-unpair any other user registered with this same device fingerprint.
        await db.profiles.update_many(
            {"_id": {"$ne": user_id}, "companion_device_fingerprint": fingerprint},
            {
                "$set": {
                    "companion_paired": False,
                    "companion_device_name": None,
                    "companion_last_sync": None,
                    "companion_device_id": None,
                    "companion_device_fingerprint": None
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


async def try_auto_verify_pool_payment(
    db,
    user_id: str,
    text: str,
    amount_from_req: Optional[float] = None,
    utr_from_req: Optional[str] = None,
    direction_from_req: Optional[str] = None,
) -> bool:
    text_lower = text.lower()

    # --- Step 1: Determine transaction direction ---
    # If Android app tells us the direction, trust it completely.
    if direction_from_req:
        if direction_from_req.lower() == "debit":
            return False  # Host spent money — not a roommate paying in
        is_credit = direction_from_req.lower() == "credit"
    else:
        # Explicit debit keywords — bail out immediately
        debit_keywords = [
            "debited", "deducted", "withdrawn", "sent to", "paid to",
            "transferred to", "payment to", "spent at", "purchase at",
            "debit", "dr ", "dr.",
        ]
        if any(kw in text_lower for kw in debit_keywords):
            return False

        # Credit indicators
        credit_keywords = [
            "received", "credited", "credit", "cr ", "cr.",
            "deposit", "deposited", "added", "sent you",
            "credited to a/c", "credited to your",
            "payment received", "money received", "amount received",
            "transferred to your", "transfer to your a/c",
            "refund", "cashback", "reversed",
        ]
        is_credit = any(kw in text_lower for kw in credit_keywords)

    if not is_credit:
        return False

    # --- Step 2: Extract UTR ---
    utr = utr_from_req or parse_transaction_id(text)

    # --- Step 3: Parse amount ---
    # Prefer amount from Android app (already parsed), fall back to text parsing
    amount_paise = int(round(amount_from_req * 100)) if amount_from_req is not None else parse_amount(text)
    if not amount_paise:
        return False

    # --- Step 4: Extract sender name from notification text ---
    def local_name_key(v: Optional[str]) -> str:
        return " ".join((v or "").strip().split()).casefold()

    sender_name = None
    sender_patterns = [
        r"received\s+from\s+([a-zA-Z][a-zA-Z\s]{1,40}?)(?:\s+via|\s+on|\s+using|\s+ref|\.|,|$)",
        r"([a-zA-Z][a-zA-Z\s]{1,40}?)\s+sent\s+you",
        r"credited\s+by\s+([a-zA-Z][a-zA-Z\s]{1,40}?)(?:\s+on|\s+via|\.|,|$)",
        r"transfer\s+from\s+([a-zA-Z][a-zA-Z\s]{1,40}?)(?:\s+via|\s+on|\.|,|$)",
        r"from\s+([a-zA-Z][a-zA-Z\s]{1,40}?)\s+to\s+(?:a/c|your|acct)",
        r"payment\s+from\s+([a-zA-Z][a-zA-Z\s]{1,40}?)(?:\s+via|\s+on|\.|,|$)",
        r"money\s+from\s+([a-zA-Z][a-zA-Z\s]{1,40}?)(?:\s+via|\s+on|\.|,|$)",
    ]
    for pattern in sender_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            raw = match.group(1).strip()
            # Reject if it looks like a bank/app name
            noise = {"upi", "neft", "rtgs", "imps", "bank", "gpay", "phonepe", "paytm", "bhim", "google", "amazon"}
            if not any(n in raw.lower() for n in noise):
                sender_name = raw
                break

    # --- Step 5: Scan completed pools ---
    since = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    pools_cursor = db.cart_pools.find({
        "host_id": user_id,
        "status": "completed",
        "completed_at": {"$gte": since}
    })
    pools = await pools_cursor.to_list(length=20)

    for pool in pools:
        pool_id = pool["_id"]
        items_cursor = db.cart_pool_items.find({"pool_id": pool_id})
        items = await items_cursor.to_list(length=1000)

        participants = list(set(it["added_by_name"] for it in items if it.get("is_purchased", True)))
        num_people = len(participants)

        final_overhead = pool.get("final_overhead", 0)
        final_discount = pool.get("final_discount", 0)
        net_overhead = final_overhead - final_discount
        overhead_share = int(net_overhead / num_people) if num_people > 0 else 0

        for roommate in participants:
            if roommate.lower() == "you" or local_name_key(roommate) == local_name_key(pool.get("created_by_name")):
                continue

            roommate_items_total = sum(it["estimated_price"] for it in items if it.get("is_purchased", True) and local_name_key(it["added_by_name"]) == local_name_key(roommate))
            total_owed = roommate_items_total + overhead_share

            payments = pool.get("payments", [])
            roommate_payment = next((p for p in payments if local_name_key(p["name"]) == local_name_key(roommate)), None)

            if not roommate_payment or roommate_payment.get("status") in ("pending", "needs_review"):
                # Compare amount (allowing ±500 paise i.e. 5 rupee tolerance for rounding)
                if abs(total_owed - amount_paise) <= 500:
                    confidence = "medium"
                    if sender_name:
                        r_key = local_name_key(roommate)
                        s_key = local_name_key(sender_name)
                        if r_key in s_key or s_key in r_key:
                            confidence = "high"

                    status = "verified" if confidence == "high" else "needs_review"

                    payment_entry = {
                        "name": roommate,
                        "utr": utr or (roommate_payment.get("utr") if roommate_payment else "AUTO_VERIFIED"),
                        "status": status,
                        "submitted_at": roommate_payment.get("submitted_at") if roommate_payment else datetime.datetime.utcnow().isoformat(),
                        "verified_at": datetime.datetime.utcnow().isoformat() if status == "verified" else None,
                        "confidence": confidence,
                        "parsed_sender": sender_name,
                        "settlement_mode": "manual" if status == "verified" else None
                    }

                    # Remove existing payment record for this roommate and push the updated one
                    await db.cart_pools.update_one(
                        {"_id": pool_id},
                        {"$pull": {"payments": {"name": roommate}}}
                    )
                    await db.cart_pools.update_one(
                        {"_id": pool_id},
                        {"$push": {"payments": payment_entry}}
                    )

                    logger.info(f"Auto-verified roommate split: {roommate} in pool {pool_id} with confidence {confidence}")
                    return True

    # --- Step 6: Fallback — UTR direct lookup (last 7 days only) ---
    if utr:
        since = datetime.datetime.utcnow() - datetime.timedelta(days=7)
        pool = await db.cart_pools.find_one({
            "host_id": user_id,
            "status": "completed",
            "completed_at": {"$gte": since},
            "payments": {
                "$elemMatch": {
                    "utr": utr,
                    "status": "pending"
                }
            }
        })
        if pool:
            res = await db.cart_pools.update_one(
                {"_id": pool["_id"], "payments.utr": utr},
                {"$set": {
                    "payments.$.status": "verified",
                    "payments.$.verified_at": datetime.datetime.utcnow().isoformat()
                }}
            )
            if res.modified_count > 0:
                logger.info(f"Matched manual UTR {utr} for pool {pool['_id']}")
                return True

    return False


@router.post("/")
@router.post("/notification")
@router.post("/notification-v2")
async def ingest_notification(
    request: Request,
    req: WebhookReq,
    authorization: Optional[str] = Header(None),
    x_pocketbuddy_user_id: Optional[str] = Header(None, alias="X-PocketBuddy-User-Id"),
    x_pocketbuddy_device_id: Optional[str] = Header(None, alias="X-PocketBuddy-Device-Id"),
    x_pocketbuddy_timestamp: Optional[str] = Header(None, alias="X-PocketBuddy-Timestamp"),
    x_pocketbuddy_event_id: Optional[str] = Header(None, alias="X-PocketBuddy-Event-Id"),
    x_pocketbuddy_signature: Optional[str] = Header(None, alias="X-PocketBuddy-Signature"),
):
    db = get_db()
    now = datetime.datetime.utcnow()
    request_body = await request.body()
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
    device_id = req.deviceId or x_pocketbuddy_device_id
    if x_pocketbuddy_event_id and not req.clientEventId:
        req.clientEventId = x_pocketbuddy_event_id

    if not connector_pairing_present(profile):
        raise HTTPException(status_code=403, detail="Connector is not paired. Start setup from PocketBuddy before syncing.")

    if not verify_connector_pairing_token(profile, client_pairing_code):
        raise HTTPException(status_code=403, detail="Invalid pairing code")

    signature_verified = verify_connector_request_signature(
        supplied_token=client_pairing_code,
        raw_body=request_body,
        timestamp_header=x_pocketbuddy_timestamp,
        event_id_header=x_pocketbuddy_event_id or req.clientEventId,
        signature_header=x_pocketbuddy_signature,
        now=now,
    )

    if req.type == "unpair" or req.source == "unpair":
        await db.profiles.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "companion_paired": False,
                    "companion_device_name": None,
                    "companion_last_sync": None,
                    "companion_device_id": None,
                    "companion_device_fingerprint": None,
                    "pairing_code_updated_at": now,
                },
                "$unset": {
                    "pairing_code": "",
                    "pairing_code_hash": "",
                    "pairing_code_preview": "",
                    "pairing_token_version": "",
                },
            }
        )
        await upsert_android_consent(db, user_id=user_id, device_id=device_id, req=req, now=now, status="revoked")
        return {"status": "ok", "message": "unpaired_successfully"}

    strict_sanitized = request.url.path.endswith("/notification-v2")
    if strict_sanitized and (req.text or req.body):
        raise HTTPException(status_code=400, detail="Raw notification text is not accepted on v2 ingest")

    raw_body = req.text or req.body or ""
    if raw_body and not strict_sanitized and not settings.CONNECTOR_LEGACY_RAW_INGEST_ENABLED:
        raise HTTPException(
            status_code=400,
            detail="Legacy raw notification ingest is disabled. Update the connector to notification-v2 on-device parsing.",
        )
    raw_payload_received = bool(raw_body)
    has_structured_event = req.amount is not None or bool(req.merchant) or bool(req.transactionId)
    notification_preview = (req.maskedPreview or "").strip() or mask_notification_text(raw_body)
    notification_source = req.captureSource or req.type or req.source or "unknown"
    requested_privacy_mode = (req.privacyMode or "").strip().lower()
    if raw_payload_received:
        privacy_mode = "legacy_server_parse"
    elif requested_privacy_mode == "on_device_only" or req.rawTextSuppressed or req.maskedPreview or has_structured_event:
        privacy_mode = "on_device_only"
    else:
        privacy_mode = "legacy_server_parse"
    data_origin = "android_on_device" if privacy_mode == "on_device_only" else "legacy_android_raw_ingest"
    source_confidence = clean_confidence(req.confidence)
    log_id = str(uuid.uuid4())

    if req.clientEventId:
        existing_event = await db.companion_sync_log.find_one(
            {
                "user_id": user_id,
                "client_event_id": req.clientEventId,
                "processing_status": {"$ne": "pending"},
            }
        )
        if existing_event:
            return {
                "status": "duplicate_event",
                "transaction_id": existing_event.get("transaction_id"),
            }

    existing_consent = await find_android_consent(db, user_id, device_id)
    block_reason = connector_ingest_block_reason(profile, existing_consent, device_id=device_id)
    if block_reason:
        consent_status = "paused" if block_reason in {"sync_disabled_by_user", "sync_paused_by_user"} else "revoked"
        await record_blocked_connector_event(
            db,
            user_id=user_id,
            device_id=device_id,
            req=req,
            now=now,
            reason=block_reason,
            consent_status=consent_status,
        )
        return {"status": "blocked", "reason": block_reason, "stored": "metadata_only"}

    sync_enabled = profile.get("companion_sync_enabled", True)
    consent_id = await upsert_android_consent(
        db,
        user_id=user_id,
        device_id=device_id,
        req=req,
        now=now,
        status="active" if sync_enabled else "paused",
    )
    initial_status = "pending" if sync_enabled else "paused"

    await db.companion_sync_log.insert_one(
        {
            "_id": log_id,
            "user_id": user_id,
            "device_id": masked_device_id(device_id),
            "device_fingerprint": device_fingerprint(device_id),
            "device_name": req.device_name or req.sourceApp or req.packageName,
            "notification_source": notification_source,
            "notification_preview": notification_preview,
            "processing_status": initial_status,
            "package_name": req.packageName,
            "source_app": req.sourceApp,
            "transaction_reference": req.transactionId,
            "data_origin": data_origin,
            "consent_id": consent_id,
            "parser_version": req.parserVersion,
            "source_confidence": source_confidence,
            "privacy_mode": privacy_mode,
            "raw_payload_received": raw_payload_received,
            "schema_version": req.schemaVersion,
            "client_event_id": req.clientEventId,
            "signature_verified": signature_verified,
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
        utr_from_req=req.transactionId,
        direction_from_req=req.direction,
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

    if not (raw_body or has_structured_event) or not amount_paise or not merchant:
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
    parsing_confidence = source_confidence or "high"
    needs_verification = False
    if source_confidence:
        parsing_confidence = source_confidence
    elif req.amount is not None and req.merchant:
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
    verification_status = "parsed_on_device" if data_origin == "android_on_device" else "legacy_parsed"
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
        "device_id": masked_device_id(device_id),
        "device_fingerprint": device_fingerprint(device_id),
        "package_name": req.packageName,
        "source_app": req.sourceApp,
        "capture_source": notification_source,
        "data_origin": data_origin,
        "consent_id": consent_id,
        "parser_version": req.parserVersion,
        "source_confidence": source_confidence or parsing_confidence,
        "privacy_mode": privacy_mode,
        "raw_payload_received": raw_payload_received,
        "schema_version": req.schemaVersion,
        "client_event_id": req.clientEventId,
        "signature_verified": signature_verified,
        "verification_status": "needs_review" if needs_verification else verification_status,
        "verified_by": None,
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
    update_fields = {
        "needs_verification": False,
        "user_corrected": True,
        "verification_status": "user_reviewed",
        "parsing_confidence": "high",
        "user_confirmed_at": now,
    }
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
