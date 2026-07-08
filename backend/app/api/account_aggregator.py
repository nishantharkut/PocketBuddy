import datetime
import json
import uuid
from typing import Literal, Optional
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

router = APIRouter()

AA_SOURCE = "account_aggregator"
LOCAL_SANDBOX_PROVIDER = "local"
DEFAULT_AA_PURPOSE = "Preview bank-consent controls for PocketBuddy insights"
AA_DATA_CATEGORIES = [
    "deposit_account_transactions",
    "transaction_amount",
    "transaction_timestamp",
    "transaction_reference",
    "masked_account_reference",
]

AA_REGISTRY_REFERENCE_URL = "https://sahamati.org.in/fip-aa-mapping/"
DEFAULT_AA_INSTITUTIONS = [
    {"id": "sbi", "name": "State Bank of India", "short_name": "SBI", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "hdfc", "name": "HDFC Bank", "short_name": "HDFC", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "icici", "name": "ICICI Bank", "short_name": "ICICI", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "axis", "name": "Axis Bank", "short_name": "AXIS", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "kotak", "name": "Kotak Mahindra Bank", "short_name": "KOTAK", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "pnb", "name": "Punjab National Bank", "short_name": "PNB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "bob", "name": "Bank of Baroda", "short_name": "BOB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "canara", "name": "Canara Bank", "short_name": "CAN", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "union-bank", "name": "Union Bank of India", "short_name": "UBI", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "indian-bank", "name": "Indian Bank", "short_name": "IB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "bank-of-india", "name": "Bank of India", "short_name": "BOI", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "central-bank", "name": "Central Bank of India", "short_name": "CBI", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "idfc-first", "name": "IDFC FIRST Bank", "short_name": "IDFC", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "yes-bank", "name": "YES Bank", "short_name": "YES", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "indusind", "name": "IndusInd Bank", "short_name": "IIB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "federal", "name": "Federal Bank", "short_name": "FED", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "rbl", "name": "RBL Bank", "short_name": "RBL", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "bandhan", "name": "Bandhan Bank", "short_name": "BDN", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "idbi", "name": "IDBI Bank", "short_name": "IDBI", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "bank-of-maharashtra", "name": "Bank of Maharashtra", "short_name": "BOM", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "uco", "name": "UCO Bank", "short_name": "UCO", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "iob", "name": "Indian Overseas Bank", "short_name": "IOB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "south-indian", "name": "South Indian Bank", "short_name": "SIB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "city-union", "name": "City Union Bank", "short_name": "CUB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "karur-vysya", "name": "Karur Vysya Bank", "short_name": "KVB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "karnataka", "name": "Karnataka Bank", "short_name": "KBL", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "dcb", "name": "DCB Bank", "short_name": "DCB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "csb", "name": "CSB Bank", "short_name": "CSB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "tmb", "name": "Tamilnad Mercantile Bank", "short_name": "TMB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "j-and-k", "name": "Jammu & Kashmir Bank", "short_name": "JKB", "type": "Bank", "regulator": "RBI", "status": "Live"},
    {"id": "equitas", "name": "Equitas Small Finance Bank", "short_name": "EQX", "type": "Small Finance Bank", "regulator": "RBI", "status": "Live"},
    {"id": "au-small-finance", "name": "AU Small Finance Bank", "short_name": "AU", "type": "Small Finance Bank", "regulator": "RBI", "status": "Live"},
    {"id": "ujjivan", "name": "Ujjivan Small Finance Bank", "short_name": "UJV", "type": "Small Finance Bank", "regulator": "RBI", "status": "Live"},
    {"id": "jana-small-finance", "name": "Jana Small Finance Bank", "short_name": "JANA", "type": "Small Finance Bank", "regulator": "RBI", "status": "Available"},
    {"id": "utkarsh-small-finance", "name": "Utkarsh Small Finance Bank", "short_name": "UTK", "type": "Small Finance Bank", "regulator": "RBI", "status": "Available"},
    {"id": "esaf-small-finance", "name": "ESAF Small Finance Bank", "short_name": "ESAF", "type": "Small Finance Bank", "regulator": "RBI", "status": "Available"},
    {"id": "suryoday-small-finance", "name": "Suryoday Small Finance Bank", "short_name": "SURY", "type": "Small Finance Bank", "regulator": "RBI", "status": "Available"},
    {"id": "shivalik-small-finance", "name": "Shivalik Small Finance Bank", "short_name": "SFB", "type": "Small Finance Bank", "regulator": "RBI", "status": "Available"},
    {"id": "capital-small-finance", "name": "Capital Small Finance Bank", "short_name": "CSFB", "type": "Small Finance Bank", "regulator": "RBI", "status": "Available"},
    {"id": "airtel-payments", "name": "Airtel Payments Bank", "short_name": "APB", "type": "Payments Bank", "regulator": "RBI", "status": "Live-enabled"},
    {"id": "nsdl-payments", "name": "NSDL Payments Bank", "short_name": "NSDL", "type": "Payments Bank", "regulator": "RBI", "status": "Live"},
    {"id": "india-post-payments", "name": "India Post Payments Bank", "short_name": "IPPB", "type": "Payments Bank", "regulator": "RBI", "status": "Available"},
    {"id": "fino-payments", "name": "Fino Payments Bank", "short_name": "FINO", "type": "Payments Bank", "regulator": "RBI", "status": "Available"},
    {"id": "jio-payments", "name": "Jio Payments Bank", "short_name": "JIO", "type": "Payments Bank", "regulator": "RBI", "status": "Available"},
    {"id": "dbs-india", "name": "DBS Bank India", "short_name": "DBS", "type": "Foreign Bank", "regulator": "RBI", "status": "Available"},
    {"id": "hsbc-india", "name": "HSBC India", "short_name": "HSBC", "type": "Foreign Bank", "regulator": "RBI", "status": "Available"},
    {"id": "standard-chartered", "name": "Standard Chartered Bank", "short_name": "SCB", "type": "Foreign Bank", "regulator": "RBI", "status": "Available"},
    {"id": "deutsche-bank", "name": "Deutsche Bank", "short_name": "DB", "type": "Foreign Bank", "regulator": "RBI", "status": "Available"},
    {"id": "dhanlaxmi", "name": "Dhanlaxmi Bank", "short_name": "DLB", "type": "Bank", "regulator": "RBI", "status": "Available"},
    {"id": "nainital", "name": "Nainital Bank", "short_name": "NTB", "type": "Bank", "regulator": "RBI", "status": "Available"},
    {"id": "cosmos-coop", "name": "Cosmos Co-operative Bank", "short_name": "COS", "type": "Co-operative Bank", "regulator": "RBI", "status": "Available"},
    {"id": "saraswat-coop", "name": "Saraswat Co-operative Bank", "short_name": "SAR", "type": "Co-operative Bank", "regulator": "RBI", "status": "Available"},
]

AA_INSTITUTION_DOMAINS = {
    "sbi": "sbi.co.in",
    "hdfc": "hdfcbank.com",
    "icici": "icicibank.com",
    "axis": "axisbank.com",
    "kotak": "kotak.com",
    "pnb": "pnbindia.in",
    "bob": "bankofbaroda.in",
    "canara": "canarabank.com",
    "union-bank": "unionbankofindia.co.in",
    "indian-bank": "indianbank.in",
    "bank-of-india": "bankofindia.co.in",
    "central-bank": "centralbankofindia.co.in",
    "idfc-first": "idfcfirstbank.com",
    "yes-bank": "yesbank.in",
    "indusind": "indusind.com",
    "federal": "federalbank.co.in",
    "rbl": "rblbank.com",
    "bandhan": "bandhanbank.com",
    "idbi": "idbibank.in",
    "bank-of-maharashtra": "bankofmaharashtra.in",
    "uco": "ucobank.com",
    "iob": "iob.in",
    "south-indian": "southindianbank.com",
    "city-union": "cityunionbank.com",
    "karur-vysya": "kvb.co.in",
    "karnataka": "karnatakabank.com",
    "dcb": "dcbbank.com",
    "csb": "csb.co.in",
    "tmb": "tmb.in",
    "j-and-k": "jkbank.com",
    "equitas": "equitasbank.com",
    "au-small-finance": "aubank.in",
    "ujjivan": "ujjivansfb.in",
    "jana-small-finance": "janabank.com",
    "utkarsh-small-finance": "utkarsh.bank",
    "esaf-small-finance": "esafbank.com",
    "suryoday-small-finance": "suryodaybank.com",
    "shivalik-small-finance": "shivalikbank.com",
    "capital-small-finance": "capitalbank.co.in",
    "airtel-payments": "airtel.in/bank",
    "nsdl-payments": "nsdlbank.com",
    "india-post-payments": "ippbonline.com",
    "fino-payments": "finobank.com",
    "jio-payments": "jiopaymentsbank.com",
    "dbs-india": "dbs.com/in",
    "hsbc-india": "hsbc.co.in",
    "standard-chartered": "sc.com/in",
    "deutsche-bank": "deutschebank.co.in",
    "dhanlaxmi": "dhanbank.com",
    "nainital": "nainitalbank.co.in",
    "cosmos-coop": "cosmosbank.com",
    "saraswat-coop": "saraswatbank.com",
}


class AASandboxSelectedAccount(BaseModel):
    account_ref: str = Field(max_length=80)
    masked_account_ref: str = Field(max_length=24)
    account_type: str = Field(default="Savings account", max_length=60)
    fi_type: str = Field(default="DEPOSIT", max_length=30)
    nickname: Optional[str] = Field(default=None, max_length=80)


class AASandboxConsentReq(BaseModel):
    aa_handle: Optional[str] = Field(default=None, max_length=120)
    bank_code: Optional[str] = Field(default=None, max_length=60)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    bank_short_name: Optional[str] = Field(default=None, max_length=24)
    purpose: str = Field(default=DEFAULT_AA_PURPOSE, max_length=180)
    requested_range_days: int = Field(default=30, ge=1, le=365)
    fi_types: list[str] = Field(default_factory=lambda: ["DEPOSIT"])
    selected_accounts: list[AASandboxSelectedAccount] = Field(default_factory=list)


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


def normalize_institution(row: dict) -> dict:
    name = str(row.get("name") or row.get("institution_name") or row.get("fip_name") or "").strip()
    short_name = str(row.get("short_name") or row.get("short") or row.get("code") or "").strip()
    institution_id = str(row.get("id") or row.get("fip_id") or row.get("entity_id") or "").strip()
    if not institution_id and name:
        institution_id = name.lower().replace("&", "and").replace(".", "").replace(" ", "-")
    if not short_name and name:
        short_name = "".join(part[0] for part in name.replace("&", " ").split()[:4]).upper()
    domain = str(row.get("domain") or AA_INSTITUTION_DOMAINS.get(institution_id, "")).strip()
    logo_url = row.get("logo_url") or row.get("logoUrl")
    if not logo_url and domain:
        logo_url = f"https://www.google.com/s2/favicons?sz=64&domain={domain}"
    return {
        "id": institution_id,
        "name": name,
        "short_name": short_name[:8],
        "type": row.get("type") or row.get("category") or "Bank",
        "regulator": row.get("regulator") or "RBI",
        "status": row.get("status") or row.get("stage") or "Available",
        "domain": domain,
        "logo_url": logo_url,
    }


def load_external_institution_registry() -> tuple[list[dict], str] | None:
    registry_url = (settings.AA_INSTITUTION_REGISTRY_URL or "").strip()
    if not registry_url:
        return None
    try:
        req = UrlRequest(registry_url, headers={"User-Agent": "PocketBuddy-AA-Registry/1.0"})
        with urlopen(req, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
        rows = payload.get("institutions") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            return None
        institutions = [normalize_institution(row) for row in rows if isinstance(row, dict)]
        institutions = [row for row in institutions if row["id"] and row["name"]]
        if not institutions:
            return None
        return institutions, registry_url
    except Exception:
        return None


def aa_institution_registry() -> tuple[list[dict], str, str]:
    external = load_external_institution_registry()
    if external:
        institutions, registry_url = external
        return institutions, "Configured AA institution registry", registry_url
    reference_rows = []
    for row in DEFAULT_AA_INSTITUTIONS:
        normalized = normalize_institution(row)
        normalized["status"] = "Reference"
        reference_rows.append(normalized)
    return reference_rows, "AA reference institution list", AA_REGISTRY_REFERENCE_URL


def aa_runtime_state() -> dict:
    provider = aa_provider()
    if provider != LOCAL_SANDBOX_PROVIDER:
        return {
            "status": "misconfigured",
            "provider": LOCAL_SANDBOX_PROVIDER,
            "mode": "local_aa_sandbox",
            "uses_sandbox_data": False,
            "can_start_sandbox": False,
            "can_receive_callbacks": False,
            "message": "Only the local AA sandbox is available in this build. Set AA_SANDBOX_PROVIDER=local before demoing consent flows.",
            "required_env": ["AA_SANDBOX_PROVIDER=local"],
        }

    return {
        "status": "sandbox_ready",
        "provider": "local",
        "mode": "local_aa_sandbox",
        "uses_sandbox_data": True,
        "can_start_sandbox": True,
        "can_receive_callbacks": bool(settings.AA_CALLBACK_SECRET),
        "message": "Local AA sandbox is enabled for consent-flow testing. Sandbox records stay separate from live transactions.",
        "required_env": [],
    }


def ensure_local_sandbox_enabled() -> None:
    state = aa_runtime_state()
    if aa_provider() != LOCAL_SANDBOX_PROVIDER:
        raise HTTPException(
            status_code=501,
            detail="Only the local AA sandbox lifecycle is available in this build.",
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


def sandbox_account_suffix(seed: str, index: int) -> str:
    digest = uuid.uuid5(uuid.NAMESPACE_DNS, f"pocketbuddy-aa:{seed}:{index}").int
    return f"{1000 + digest % 9000}"


def build_sandbox_accounts(bank_code: Optional[str], bank_name: Optional[str] = None) -> list[dict]:
    seed = (bank_code or bank_name or "bank").strip().lower() or "bank"
    bank_prefix = "".join(ch for ch in seed.upper() if ch.isalnum())[:10] or "BANK"
    templates = [
        ("primary", "Primary savings", "Savings account", "DEPOSIT"),
        ("spending", "Campus spending", "Savings account", "DEPOSIT"),
        ("deposit", "Term deposit", "Term deposit", "DEPOSIT"),
    ]
    accounts = []
    for index, (kind, nickname, account_type, fi_type) in enumerate(templates, start=1):
        suffix = sandbox_account_suffix(seed, index)
        accounts.append(
            {
                "account_ref": f"AA-SBX-{bank_prefix}-{kind.upper()}-{suffix}",
                "masked_account_ref": f"XXXX{suffix}",
                "account_type": account_type,
                "fi_type": fi_type,
                "nickname": nickname,
            }
        )
    return accounts


def resolve_selected_sandbox_accounts(req: AASandboxConsentReq) -> list[dict]:
    discovered = build_sandbox_accounts(req.bank_code, req.bank_name)
    discovered_by_ref = {account["account_ref"]: account for account in discovered}
    requested_refs = [account.account_ref for account in req.selected_accounts[:8]]

    if not requested_refs:
        return discovered[:1]

    selected = []
    seen = set()
    for account_ref in requested_refs:
        if account_ref in seen:
            continue
        account = discovered_by_ref.get(account_ref)
        if account:
            selected.append(account)
            seen.add(account_ref)

    if not selected:
        raise HTTPException(status_code=400, detail="Select at least one discovered bank account.")
    return selected


async def find_user_aa_consent(db, user_id: str, consent_id: str) -> dict:
    consent = await db.data_consents.find_one(
        {"_id": consent_id, "user_id": user_id, "source": AA_SOURCE}
    )
    if not consent:
        raise HTTPException(status_code=404, detail="AA consent not found")
    return consent


def build_sandbox_records(now: datetime.datetime, accounts: Optional[list[dict]] = None) -> list[dict]:
    selected_accounts = accounts or build_sandbox_accounts(None)[:1]
    base_ref = uuid.uuid4().hex[:8].upper()
    templates = [
        [("DEBIT", 7200, "Campus Canteen"), ("DEBIT", 12500, "Metro Card Recharge"), ("CREDIT", 250000, "Allowance Credit")],
        [("DEBIT", 4200, "Library Print Counter"), ("DEBIT", 9800, "Hostel Mess Top-up"), ("DEBIT", 6000, "UPI Transfer")],
        [("CREDIT", 6400, "Deposit Interest"), ("DEBIT", 50000, "Term Deposit Sweep"), ("CREDIT", 50000, "Term Deposit Credit")],
    ]
    records = []
    for account_index, account in enumerate(selected_accounts[:8]):
        account_templates = templates[account_index % len(templates)]
        for txn_index, (direction, amount_paise, merchant) in enumerate(account_templates, start=1):
            records.append(
                {
                    "posted_at": (now - datetime.timedelta(days=(len(account_templates) - txn_index + 1))).isoformat() + "Z",
                    "direction": direction,
                    "amount_paise": amount_paise,
                    "merchant": merchant,
                    "transaction_reference": f"AA-SBX-{base_ref}-{account_index + 1:02d}{txn_index:02d}",
                    "masked_account_ref": account.get("masked_account_ref") or "XXXX0000",
                    "account_ref": account.get("account_ref"),
                    "account_type": account.get("account_type") or "Deposit account",
                }
            )
    return records


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


@router.get("/institutions")
async def get_aa_institutions(q: str = Query(default="", max_length=80), user_id: str = Depends(get_current_user)):
    institutions_list, source_label, source_url = aa_institution_registry()
    query = q.strip().lower()
    if query:
        institutions_list = [
            row
            for row in institutions_list
            if query in row["name"].lower()
            or query in row.get("short_name", "").lower()
            or query in row.get("type", "").lower()
        ]
    return {
        "source": source_label,
        "source_url": source_url,
        "updated_hint": "This build uses a local AA-style sandbox registry for demos. No live Account Aggregator provider is connected.",
        "total_count": len(institutions_list),
        "institutions": institutions_list[:150],
    }


@router.get("/sandbox/accounts")
async def discover_sandbox_accounts(
    bank_code: str = Query(max_length=60),
    bank_name: Optional[str] = Query(default=None, max_length=120),
    user_id: str = Depends(get_current_user),
):
    ensure_local_sandbox_enabled()
    return {
        "status": "discovered",
        "bank_code": bank_code,
        "bank_name": bank_name,
        "accounts": build_sandbox_accounts(bank_code, bank_name),
        "message": "Masked accounts discovered for consent selection.",
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
    selected_accounts = resolve_selected_sandbox_accounts(req)
    consent = {
        "_id": consent_id,
        "user_id": user_id,
        "source": AA_SOURCE,
        "provider": "local_sandbox",
        "provider_label": req.bank_name or "Consent sandbox",
        "financial_institution_code": req.bank_code,
        "financial_institution_name": req.bank_name,
        "financial_institution_short_name": req.bank_short_name,
        "trust_framework": "RBI Account Aggregator",
        "status": "pending",
        "aa_status": "PENDING",
        "consent_handle": consent_handle,
        "purpose": req.purpose or DEFAULT_AA_PURPOSE,
        "data_categories": AA_DATA_CATEGORIES,
        "fi_types": req.fi_types or ["DEPOSIT"],
        "requested_range_days": req.requested_range_days,
        "selected_accounts": selected_accounts,
        "account_count": len(selected_accounts),
        "masked_account_refs": [account["masked_account_ref"] for account in selected_accounts],
        "aa_handle": req.aa_handle,
        "uses_sandbox_data": True,
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
        message="AA sandbox consent request created.",
        metadata={
            "provider": "local_sandbox",
            "requested_range_days": req.requested_range_days,
            "bank_code": req.bank_code,
            "bank_name": req.bank_name,
            "bank_short_name": req.bank_short_name,
            "account_count": len(selected_accounts),
            "masked_account_refs": [account["masked_account_ref"] for account in selected_accounts],
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
        delete_result = await db.aa_financial_snapshots.delete_many(
            {"user_id": user_id, "consent_id": consent_id}
        )
        update = {
            "status": "revoked",
            "aa_status": "REVOKED",
            "revoked_at": consent.get("revoked_at") or now,
            "fetch_status": "revoked",
            "fetched_records_count": 0,
            "updated_at": now,
        }
        event_type = "consent_revoked"
        message = req.reason or "AA sandbox consent revoked and fetched sandbox records deleted."
        revoke_metadata = {"sandbox_data": True, "deleted_snapshot_count": delete_result.deleted_count}

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
        selected_accounts = consent.get("selected_accounts") or build_sandbox_accounts(
            consent.get("financial_institution_code"),
            consent.get("financial_institution_name"),
        )[:1]
        records = build_sandbox_records(now, selected_accounts)
        snapshot = {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "consent_id": consent_id,
            "source": AA_SOURCE,
            "provider": "local_sandbox",
            "sandbox_data": True,
            "accounts": selected_accounts,
            "account_count": len(selected_accounts),
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
            "account_count": len(selected_accounts),
            "updated_at": now,
        }
        await db.data_consents.update_one({"_id": consent_id}, {"$set": update})
        await insert_aa_event(
            db,
            user_id=user_id,
            consent_id=consent_id,
            event_type="fi_fetch_completed",
            status="completed",
            message="AA sandbox financial information fetched. Sandbox records were not inserted as live transactions.",
            metadata={"record_count": len(records), "sandbox_data": True},
        )
        fresh = await db.data_consents.find_one({"_id": consent_id})
        return {
            "status": "completed",
            "message": "Sandbox financial information fetched. Records are stored separately from live transactions.",
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
        metadata=revoke_metadata if req.action == "revoke" else {"sandbox_data": True},
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
        update["fetch_status"] = "revoked"
        update["fetched_records_count"] = 0
    if next_status == "expired":
        update["expired_at"] = utcnow()
    if next_status == "rejected":
        update["rejected_at"] = utcnow()

    await db.data_consents.update_one({"_id": consent["_id"]}, {"$set": update})
    deleted_snapshot_count = 0
    if next_status == "revoked":
        delete_result = await db.aa_financial_snapshots.delete_many(
            {"user_id": consent.get("user_id"), "consent_id": consent["_id"]}
        )
        deleted_snapshot_count = delete_result.deleted_count
    await insert_aa_event(
        db,
        user_id=consent.get("user_id"),
        consent_id=consent["_id"],
        event_type="consent_callback",
        status=next_status,
        message=f"AA consent notification received: {aa_status or next_status}.",
        metadata={
            "provider_txnid": payload.get("txnid"),
            "notifier": payload.get("Notifier"),
            "deleted_snapshot_count": deleted_snapshot_count,
        },
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
