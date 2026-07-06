import datetime
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

router = APIRouter()

AA_SOURCE = "account_aggregator"
LOCAL_SANDBOX_PROVIDER = "local"
DEFAULT_AA_PURPOSE = "Verify bank transactions for PocketBuddy insights"
AA_DATA_CATEGORIES = [
    "deposit_account_transactions",
    "transaction_amount",
    "transaction_timestamp",
    "transaction_reference",
    "masked_account_reference",
]


class AASandboxConsentReq(BaseModel):
    aa_handle: Optional[str] = Field(default=None, max_length=120)
    bank_code: Optional[str] = Field(default=None, max_length=60)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    purpose: str = Field(default=DEFAULT_AA_PURPOSE, max_length=180)
    requested_range_days: int = Field(default=30, ge=1, le=365)
    fi_types: list[str] = Field(default_factory=lambda: ["DEPOSIT"])


class AASandboxSimulationReq(BaseModel):
    action: Literal["approve", "reject", "revoke", "expire", "fetch_success", "fetch_failed"]
    reason: Optional[str] = Field(default=None, max_length=240)


def utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow()


def aa_provider() -> str:
    return (settings.AA_SANDBOX_PROVIDER or LOCAL_SANDBOX_PROVIDER).strip().lower()


def provider_missing_env() -> list[str]:
    missing = []
    for key in ["AA_SANDBOX_BASE_URL", "AA_CLIENT_ID", "AA_CLIENT_SECRET", "AA_FIU_ID", "AA_CALLBACK_SECRET"]:
        if not getattr(settings, key, ""):
            missing.append(key)
    return missing


def aa_runtime_state() -> dict:
    provider = aa_provider()
    if not settings.AA_SANDBOX_ENABLED:
        return {
            "status": "not_configured",
            "provider": provider,
            "mode": "disabled",
            "uses_dummy_data": False,
            "can_start_sandbox": False,
            "can_receive_callbacks": False,
            "message": "AA sandbox is disabled. Set AA_SANDBOX_ENABLED=true to test consent flows.",
            "required_env": ["AA_SANDBOX_ENABLED"],
        }

    if provider == LOCAL_SANDBOX_PROVIDER:
        return {
            "status": "sandbox_ready",
            "provider": "local",
            "mode": "local_dummy_sandbox",
            "uses_dummy_data": True,
            "can_start_sandbox": True,
            "can_receive_callbacks": bool(settings.AA_CALLBACK_SECRET),
            "message": "Local AA sandbox is enabled. It uses sample sandbox data only and does not verify live bank transactions.",
            "required_env": [],
        }

    missing = provider_missing_env()
    return {
        "status": "provider_configured" if not missing else "misconfigured",
        "provider": provider,
        "mode": "provider_sandbox",
        "uses_dummy_data": True,
        "can_start_sandbox": False,
        "can_receive_callbacks": bool(settings.AA_CALLBACK_SECRET),
        "message": (
            "Provider sandbox credentials are present. Outbound provider adapter still needs provider-specific certification wiring."
            if not missing
            else "AA provider sandbox is enabled but required credentials are missing."
        ),
        "required_env": missing,
    }


def ensure_local_sandbox_enabled() -> None:
    state = aa_runtime_state()
    if state["status"] == "not_configured":
        raise HTTPException(status_code=409, detail=state["message"])
    if aa_provider() != LOCAL_SANDBOX_PROVIDER:
        raise HTTPException(
            status_code=501,
            detail="Only the local AA sample-data sandbox lifecycle is available in this build.",
        )


async def insert_aa_event(
    db,
    *,
    user_id: Optional[str],
    event_type: str,
    status: str,
    message: str,
    consent_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    now = utcnow()
    event = {
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "consent_id": consent_id,
        "event_type": event_type,
        "status": status,
        "message": message,
        "metadata": metadata or {},
        "created_at": now,
    }
    await db.aa_sync_events.insert_one(event)
    return event


def build_consent_id(user_id: str) -> str:
    return f"aa:{user_id}:{uuid.uuid4()}"


async def find_user_aa_consent(db, user_id: str, consent_id: str) -> dict:
    consent = await db.data_consents.find_one(
        {"_id": consent_id, "user_id": user_id, "source": AA_SOURCE}
    )
    if not consent:
        raise HTTPException(status_code=404, detail="AA consent not found")
    return consent


def build_sandbox_records(now: datetime.datetime) -> list[dict]:
    base_ref = uuid.uuid4().hex[:8].upper()
    return [
        {
            "posted_at": (now - datetime.timedelta(days=3)).isoformat() + "Z",
            "direction": "DEBIT",
            "amount_paise": 7200,
            "merchant": "Campus Canteen",
            "transaction_reference": f"AA-SBX-{base_ref}-001",
            "masked_account_ref": "XXXX2042",
        },
        {
            "posted_at": (now - datetime.timedelta(days=2)).isoformat() + "Z",
            "direction": "DEBIT",
            "amount_paise": 12500,
            "merchant": "Metro Card Recharge",
            "transaction_reference": f"AA-SBX-{base_ref}-002",
            "masked_account_ref": "XXXX2042",
        },
        {
            "posted_at": (now - datetime.timedelta(days=1)).isoformat() + "Z",
            "direction": "CREDIT",
            "amount_paise": 250000,
            "merchant": "Allowance Credit",
            "transaction_reference": f"AA-SBX-{base_ref}-003",
            "masked_account_ref": "XXXX2042",
        },
    ]


def map_aa_status(status: Optional[str]) -> str:
    normalized = (status or "").strip().upper()
    if normalized in {"ACTIVE", "APPROVED", "READY"}:
        return "active"
    if normalized in {"REJECTED", "DENIED", "FAILED"}:
        return "rejected"
    if normalized == "REVOKED":
        return "revoked"
    if normalized == "EXPIRED":
        return "expired"
    return "pending"


def rebit_ack(payload: dict) -> dict:
    return {
        "ver": payload.get("ver") or "2.0.0",
        "timestamp": utcnow().isoformat() + "Z",
        "txnid": payload.get("txnid") or str(uuid.uuid4()),
        "response": "OK",
    }


def require_callback_secret(secret: Optional[str]) -> None:
    if not settings.AA_CALLBACK_SECRET:
        raise HTTPException(status_code=503, detail="AA callback secret is not configured")
    if secret != settings.AA_CALLBACK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid AA callback secret")


@router.get("/status")
async def get_aa_status(user_id: str = Depends(get_current_user)):
    db = get_db()
    state = aa_runtime_state()
    consents = await db.data_consents.find(
        {"user_id": user_id, "source": AA_SOURCE}
    ).sort("updated_at", -1).to_list(length=20)
    events = await db.aa_sync_events.find(
        {"user_id": user_id}
    ).sort("created_at", -1).to_list(length=20)
    snapshots = await db.aa_financial_snapshots.find(
        {"user_id": user_id}
    ).sort("created_at", -1).to_list(length=5)

    return {
        **state,
        "consents": map_docs(consents),
        "events": map_docs(events),
        "snapshots": map_docs(snapshots),
    }


@router.post("/sandbox/consents")
async def start_sandbox_consent(req: AASandboxConsentReq, user_id: str = Depends(get_current_user)):
    ensure_local_sandbox_enabled()
    db = get_db()
    now = utcnow()

    existing = await db.data_consents.find_one(
        {
            "user_id": user_id,
            "source": AA_SOURCE,
            "status": {"$in": ["pending", "active"]},
        },
        sort=[("updated_at", -1)],
    )
    if existing:
        await insert_aa_event(
            db,
            user_id=user_id,
            consent_id=existing["_id"],
            event_type="consent_reused",
            status=existing.get("status", "pending"),
            message="Existing AA sandbox consent reused instead of creating a duplicate.",
        )
        return {
            "status": "existing",
            "message": "An AA sandbox consent is already pending or active.",
            "consent": map_doc(existing),
        }

    consent_id = build_consent_id(user_id)
    consent_handle = str(uuid.uuid4())
    consent = {
        "_id": consent_id,
        "user_id": user_id,
        "source": AA_SOURCE,
        "provider": "local_sandbox",
        "provider_label": req.bank_name or "Bank consent",
        "financial_institution_code": req.bank_code,
        "financial_institution_name": req.bank_name,
        "trust_framework": "RBI Account Aggregator",
        "status": "pending",
        "aa_status": "PENDING",
        "consent_handle": consent_handle,
        "purpose": req.purpose or DEFAULT_AA_PURPOSE,
        "data_categories": AA_DATA_CATEGORIES,
        "fi_types": req.fi_types or ["DEPOSIT"],
        "requested_range_days": req.requested_range_days,
        "aa_handle": req.aa_handle,
        "uses_dummy_data": True,
        "raw_text_policy": "not_applicable_encrypted_fi",
        "fetch_status": "not_started",
        "created_at": now,
        "updated_at": now,
        "expires_at": now + datetime.timedelta(days=30),
    }
    await db.data_consents.insert_one(consent)
    await insert_aa_event(
        db,
        user_id=user_id,
        consent_id=consent_id,
        event_type="consent_requested",
        status="pending",
        message="AA sandbox consent request created. Sandbox uses sample data only.",
        metadata={
            "provider": "local_sandbox",
            "requested_range_days": req.requested_range_days,
            "bank_code": req.bank_code,
            "bank_name": req.bank_name,
        },
    )
    return {
        "status": "pending",
        "message": "AA sandbox consent created. Approve it from the sandbox controls to continue.",
        "consent": map_doc(consent),
    }


@router.post("/sandbox/consents/{consent_id}/simulate")
async def simulate_sandbox_consent(
    consent_id: str,
    req: AASandboxSimulationReq,
    user_id: str = Depends(get_current_user),
):
    ensure_local_sandbox_enabled()
    db = get_db()
    consent = await find_user_aa_consent(db, user_id, consent_id)
    current_status = consent.get("status")
    now = utcnow()

    if req.action == "approve":
        if current_status in {"revoked", "expired", "rejected"}:
            raise HTTPException(status_code=409, detail=f"Cannot approve a {current_status} consent")
        update = {
            "status": "active",
            "aa_status": "ACTIVE",
            "consent_artefact_id": consent.get("consent_artefact_id") or str(uuid.uuid4()),
            "granted_at": consent.get("granted_at") or now,
            "updated_at": now,
        }
        event_type = "consent_approved"
        message = "AA sandbox consent approved. Financial information fetch can now be tested."

    elif req.action == "reject":
        if current_status == "active":
            raise HTTPException(status_code=409, detail="Active consent must be revoked, not rejected")
        if current_status in {"revoked", "expired"}:
            raise HTTPException(status_code=409, detail=f"Cannot reject a {current_status} consent")
        update = {
            "status": "rejected",
            "aa_status": "REJECTED",
            "rejected_at": now,
            "updated_at": now,
            "last_error": req.reason or "Rejected in local sandbox",
        }
        event_type = "consent_rejected"
        message = req.reason or "AA sandbox consent rejected."

    elif req.action == "revoke":
        update = {
            "status": "revoked",
            "aa_status": "REVOKED",
            "revoked_at": consent.get("revoked_at") or now,
            "updated_at": now,
        }
        event_type = "consent_revoked"
        message = req.reason or "AA sandbox consent revoked."

    elif req.action == "expire":
        if current_status == "revoked":
            raise HTTPException(status_code=409, detail="Revoked consent cannot be expired")
        update = {
            "status": "expired",
            "aa_status": "EXPIRED",
            "expired_at": now,
            "updated_at": now,
        }
        event_type = "consent_expired"
        message = req.reason or "AA sandbox consent expired."

    elif req.action == "fetch_failed":
        if current_status != "active":
            raise HTTPException(status_code=409, detail="Financial information fetch requires active consent")
        update = {
            "fetch_status": "failed",
            "last_fetch_at": now,
            "last_error": req.reason or "Sandbox fetch failed",
            "updated_at": now,
        }
        event_type = "fi_fetch_failed"
        message = req.reason or "AA sandbox financial information fetch failed."

    else:
        if current_status != "active":
            raise HTTPException(status_code=409, detail="Financial information fetch requires active consent")
        records = build_sandbox_records(now)
        snapshot = {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "consent_id": consent_id,
            "source": AA_SOURCE,
            "provider": "local_sandbox",
            "sandbox_dummy_data": True,
            "record_count": len(records),
            "records": records,
            "created_at": now,
        }
        await db.aa_financial_snapshots.insert_one(snapshot)
        update = {
            "fetch_status": "completed",
            "last_fetch_at": now,
            "last_sync_at": now,
            "fetched_records_count": len(records),
            "updated_at": now,
        }
        await db.data_consents.update_one({"_id": consent_id}, {"$set": update})
        await insert_aa_event(
            db,
            user_id=user_id,
            consent_id=consent_id,
            event_type="fi_fetch_completed",
            status="completed",
            message="AA sandbox financial information fetched. Records are sample sandbox data and were not inserted as live transactions.",
            metadata={"record_count": len(records), "sandbox_dummy_data": True},
        )
        fresh = await db.data_consents.find_one({"_id": consent_id})
        return {
            "status": "completed",
            "message": "Sandbox financial information fetched. Sample records are stored separately from live transactions.",
            "consent": map_doc(fresh),
            "snapshot": map_doc(snapshot),
        }

    await db.data_consents.update_one({"_id": consent_id}, {"$set": update})
    await insert_aa_event(
        db,
        user_id=user_id,
        consent_id=consent_id,
        event_type=event_type,
        status=update.get("status") or update.get("fetch_status") or current_status,
        message=message,
        metadata={"sandbox_dummy_data": True},
    )
    fresh = await db.data_consents.find_one({"_id": consent_id})
    return {"status": fresh.get("status"), "message": message, "consent": map_doc(fresh)}


@router.post("/callbacks/consent-notification")
@router.post("/Consent/Notification")
async def receive_consent_notification(
    request: Request,
    x_callback_secret: Optional[str] = Header(default=None, alias="X-PocketBuddy-AA-Callback-Secret"),
):
    require_callback_secret(x_callback_secret)
    db = get_db()
    payload = await request.json()
    notification = payload.get("ConsentStatusNotification") or payload.get("ConsentNotification") or {}
    consent_handle = notification.get("consentHandle") or payload.get("consentHandle")
    consent_id = notification.get("consentId") or payload.get("consentId")
    aa_status = notification.get("consentStatus") or notification.get("status") or payload.get("status")
    next_status = map_aa_status(aa_status)
    consent = None

    if consent_handle:
        consent = await db.data_consents.find_one({"source": AA_SOURCE, "consent_handle": consent_handle})
    if not consent and consent_id:
        consent = await db.data_consents.find_one({"source": AA_SOURCE, "consent_artefact_id": consent_id})

    if not consent:
        await insert_aa_event(
            db,
            user_id=None,
            event_type="orphan_consent_callback",
            status="ignored",
            message="AA consent callback could not be matched to a user consent.",
            metadata={"provider_txnid": payload.get("txnid"), "consent_handle_present": bool(consent_handle)},
        )
        return rebit_ack(payload)

    update = {
        "status": next_status,
        "aa_status": aa_status or next_status.upper(),
        "updated_at": utcnow(),
    }
    if consent_id:
        update["consent_artefact_id"] = consent_id
    if next_status == "active":
        update["granted_at"] = consent.get("granted_at") or utcnow()
    if next_status == "revoked":
        update["revoked_at"] = utcnow()
    if next_status == "expired":
        update["expired_at"] = utcnow()
    if next_status == "rejected":
        update["rejected_at"] = utcnow()

    await db.data_consents.update_one({"_id": consent["_id"]}, {"$set": update})
    await insert_aa_event(
        db,
        user_id=consent.get("user_id"),
        consent_id=consent["_id"],
        event_type="consent_callback",
        status=next_status,
        message=f"AA consent notification received: {aa_status or next_status}.",
        metadata={"provider_txnid": payload.get("txnid"), "notifier": payload.get("Notifier")},
    )
    return rebit_ack(payload)


@router.post("/callbacks/fi-notification")
@router.post("/FI/Notification")
async def receive_fi_notification(
    request: Request,
    x_callback_secret: Optional[str] = Header(default=None, alias="X-PocketBuddy-AA-Callback-Secret"),
):
    require_callback_secret(x_callback_secret)
    db = get_db()
    payload = await request.json()
    notification = payload.get("FIStatusNotification") or {}
    session_status = notification.get("sessionStatus") or payload.get("sessionStatus")
    consent_handle = notification.get("consentHandle") or payload.get("consentHandle")
    consent = None

    if consent_handle:
        consent = await db.data_consents.find_one({"source": AA_SOURCE, "consent_handle": consent_handle})

    if not consent:
        await insert_aa_event(
            db,
            user_id=None,
            event_type="orphan_fi_callback",
            status="ignored",
            message="AA FI callback could not be matched to a user consent.",
            metadata={"provider_txnid": payload.get("txnid"), "session_status": session_status},
        )
        return rebit_ack(payload)

    status = "completed" if str(session_status).upper() == "COMPLETED" else "pending"
    await db.data_consents.update_one(
        {"_id": consent["_id"]},
        {
            "$set": {
                "fetch_status": status,
                "last_fetch_at": utcnow(),
                "updated_at": utcnow(),
            }
        },
    )
    await insert_aa_event(
        db,
        user_id=consent.get("user_id"),
        consent_id=consent["_id"],
        event_type="fi_callback",
        status=status,
        message=f"AA FI notification received: {session_status or status}.",
        metadata={"provider_txnid": payload.get("txnid"), "session_status": session_status},
    )
    return rebit_ack(payload)
