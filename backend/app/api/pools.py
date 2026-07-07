from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import uuid
import datetime
import re
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

router = APIRouter()

ALLOWED_POOL_STATUSES = {"open", "closed", "cancelled", "completed"}
MAX_POOL_VALUE_PAISE = 10_000_000
MAX_FEE_PAISE = 500_000
MAX_ITEM_PRICE_PAISE = 500_000
MAX_NAME_CHARS = 80
MAX_DESCRIPTION_CHARS = 200
MAX_URL_CHARS = 2048

class PoolReq(BaseModel):
    wing_label: str
    min_cart_value: int
    expires_at: str
    platform: str
    platform_display_label: Optional[str] = None
    delivery_fee: int
    created_by_name: str
    auto_nudge_enabled: bool = False
    nudge_interval_hours: int = 24

class PoolUpdateReq(BaseModel):
    status: Optional[str] = None
    upi_id: Optional[str] = None
    final_overhead: Optional[int] = None
    final_discount: Optional[int] = None
    cancellation_reason: Optional[str] = None
    checkout_notes: Optional[str] = None
    created_by_name: Optional[str] = None
    auto_nudge_enabled: Optional[bool] = None
    nudge_interval_hours: Optional[int] = None

class PaymentConfirmReq(BaseModel):
    roommate_name: str
    utr: str

class PaymentVerifyReq(BaseModel):
    roommate_name: str
    action: str  # "verify" or "reject"

class PoolItemReq(BaseModel):
    added_by_name: str
    item_description: str
    estimated_price: int
    product_url: Optional[str] = None

class PoolItemUpdateReq(BaseModel):
    is_purchased: Optional[bool] = None
    estimated_price: Optional[int] = None
    item_description: Optional[str] = None
    product_url: Optional[str] = None


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def to_utc_naive(value: datetime.datetime) -> datetime.datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)


def clean_text(value: Optional[str], field_name: str, max_chars: int = MAX_NAME_CHARS) -> str:
    cleaned = " ".join((value or "").strip().split())
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if len(cleaned) > max_chars:
        raise HTTPException(status_code=400, detail=f"{field_name} is too long")
    return cleaned


def name_key(value: Optional[str]) -> str:
    return " ".join((value or "").strip().split()).casefold()


def validate_paise_amount(
    value: int,
    field_name: str,
    max_value: int,
    allow_zero: bool = False,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer paise amount")
    minimum = 0 if allow_zero else 1
    if value < minimum or value > max_value:
        if allow_zero:
            raise HTTPException(status_code=400, detail=f"{field_name} must be between 0 and {max_value} paise")
        raise HTTPException(status_code=400, detail=f"{field_name} must be between 1 and {max_value} paise")
    return value


def validate_platform(platform: str) -> str:
    normalized = clean_text(platform, "Platform", max_chars=60).lower()
    return re.sub(r"[^a-z0-9_]+", "_", normalized).strip("_") or "other"


def validate_upi_id(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    upi_id = value.strip()
    if not upi_id:
        return None
    if len(upi_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid UPI ID")
    return upi_id


def validate_product_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    url = value.strip()
    if not url:
        return None
    if len(url) > MAX_URL_CHARS or any(ch.isspace() for ch in url):
        raise HTTPException(status_code=400, detail="Invalid product URL")
    return url


def parse_expires_at(value: str) -> datetime.datetime:
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid pool expiry time")

    expires_at = to_utc_naive(parsed)
    now = utcnow()
    if expires_at <= now:
        raise HTTPException(status_code=400, detail="Pool expiry must be in the future")
    return expires_at


def is_pool_expired(pool: dict) -> bool:
    expires_at = pool.get("expires_at")
    return bool(expires_at and to_utc_naive(expires_at) <= utcnow())


async def expire_pool_if_needed(db, pool: dict) -> dict:
    if pool.get("status") == "open" and is_pool_expired(pool):
        await db.cart_pools.update_one({"_id": pool["_id"]}, {"$set": {"status": "closed"}})
        pool["status"] = "closed"
    return pool

async def get_roommate_reliability(db, wing_label: str) -> dict:
    pools = await db.cart_pools.find({"wing_label": wing_label, "status": "completed"}).to_list(length=100)
    roommate_stats = {}
    
    for pool in pools:
        pool_id = pool["_id"]
        completed_at = pool.get("completed_at")
        if not completed_at:
            continue
        
        items = await db.cart_pool_items.find({"pool_id": pool_id}).to_list(length=500)
        participants = list(set(it["added_by_name"] for it in items if it.get("is_purchased", True)))
        host_name = pool.get("created_by_name", "")
        
        for roommate in participants:
            if name_key(roommate) == name_key(host_name) or roommate.lower() == "you":
                continue
                
            r_key = name_key(roommate)
            r_name = roommate
            
            stats = roommate_stats.setdefault(r_key, {
                "name": r_name,
                "total_pools": 0,
                "verified_pools": 0,
                "pending_pools": 0,
                "total_repayment_time_sec": 0.0,
            })
            stats["total_pools"] += 1
            
            payments = pool.get("payments", [])
            pm = next((p for p in payments if name_key(p["name"]) == r_key), None)
            
            if pm and pm.get("status") == "verified":
                stats["verified_pools"] += 1
                pay_time_str = pm.get("submitted_at") or pm.get("verified_at")
                if pay_time_str:
                    try:
                        pay_time = datetime.datetime.fromisoformat(pay_time_str.replace("Z", "+00:00")).replace(tzinfo=None)
                        diff_sec = max(0.0, (pay_time - completed_at).total_seconds())
                        stats["total_repayment_time_sec"] += diff_sec
                    except:
                        pass
            else:
                stats["pending_pools"] += 1
                
    reliability = {}
    for r_key, stats in roommate_stats.items():
        total_pools = stats["total_pools"]
        if total_pools == 0:
            continue
            
        pool_scores = []
        for pool in pools:
            pool_id = pool["_id"]
            completed_at = pool.get("completed_at")
            if not completed_at:
                continue
                
            items = await db.cart_pool_items.find({"pool_id": pool_id}).to_list(length=500)
            participants = list(set(it["added_by_name"] for it in items if it.get("is_purchased", True)))
            if name_key(stats["name"]) not in [name_key(p) for p in participants]:
                continue
                
            payments = pool.get("payments", [])
            pm = next((p for p in payments if name_key(p["name"]) == r_key), None)
            
            if pm and pm.get("status") == "verified":
                pay_time_str = pm.get("submitted_at") or pm.get("verified_at")
                if pay_time_str:
                    try:
                        pay_time = datetime.datetime.fromisoformat(pay_time_str.replace("Z", "+00:00")).replace(tzinfo=None)
                        diff_sec = (pay_time - completed_at).total_seconds()
                        diff_hours = diff_sec / 3600.0
                        if diff_hours <= 1:
                            pool_scores.append(100)
                        elif diff_hours <= 6:
                            pool_scores.append(95)
                        elif diff_hours <= 24:
                            pool_scores.append(85)
                        else:
                            pool_scores.append(70)
                    except:
                        pool_scores.append(85)
                else:
                    pool_scores.append(85)
            else:
                elapsed_hours = (datetime.datetime.utcnow() - completed_at).total_seconds() / 3600.0
                if elapsed_hours <= 24:
                    pool_scores.append(70)
                elif elapsed_hours <= 48:
                    pool_scores.append(30)
                else:
                    pool_scores.append(10)
                    
        avg_score = int(sum(pool_scores) / len(pool_scores)) if pool_scores else 90
        
        if avg_score >= 95:
            label = "Instant payer"
            color = "green"
        elif avg_score >= 85:
            label = "Pays in hours"
            color = "blue"
        elif avg_score >= 70:
            label = "Usually next day"
            color = "yellow"
        else:
            label = "Needs reminder"
            color = "red"
            
        reliability[stats["name"]] = {
            "name": stats["name"],
            "score": avg_score,
            "label": label,
            "color": color,
            "total_pools": total_pools,
            "pending_pools": stats["pending_pools"],
            "avg_repayment_time_hours": round((stats["total_repayment_time_sec"] / stats["verified_pools"] / 3600.0) if stats["verified_pools"] > 0 else 0.0, 1)
        }
        
    return reliability


async def enrich_pool_document(db, p: dict, current_user_id: Optional[str] = None) -> dict:
    pool_id = p["_id"] if "_id" in p else p.get("id")
    host_id = p.get("host_id")
    host_user = await db.users.find_one({"_id": host_id}) if host_id else None
    p["host_phone"] = host_user.get("phone_number", "") if host_user else ""
    
    items_cursor = db.cart_pool_items.find({"pool_id": pool_id})
    items = await items_cursor.to_list(length=200)
    
    grouped = {}
    for item in items:
        grouped.setdefault(item["added_by_name"], []).append(item)
        
    participants = list(grouped.keys())
    active_participants = [name for name, its in grouped.items() if any(it.get("is_purchased", True) for it in its)]
    
    split_breakdown = {}
    if p.get("status") in ("completed", "closed") and p.get("status") != "open":
        num_people = len(active_participants)
        net_overhead = (p.get("final_overhead") or 0) - (p.get("final_discount") or 0)
        overhead_share = int(net_overhead / num_people) if num_people > 0 else 0
        
        for name in active_participants:
            p_items_total = sum(it["estimated_price"] for it in grouped[name] if it.get("is_purchased", True))
            payment = next((pay for pay in p.get("payments", []) if pay["name"].lower() == name.lower()), None)
            is_host = (name.lower() == "you" or name_key(name) == name_key(p.get("created_by_name")))
            
            usr = await db.users.find_one({"full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
            r_email = usr.get("email", "") if usr else ""
            
            split_breakdown[name] = {
                "name": name,
                "email": r_email,
                "items_total": p_items_total,
                "share": overhead_share,
                "total": p_items_total + overhead_share,
                "paid": True if is_host else (payment["status"] == "verified" if payment else False),
                "payment_status": "host" if is_host else (payment["status"] if payment else "unpaid"),
                "utr": payment["utr"] if payment else "",
                "settlement_mode": payment.get("settlement_mode") if payment else None,
                "confidence": payment.get("confidence") if payment else None
            }
    else:
        num_people = len(participants)
        delivery_per_person = int(p.get("delivery_fee", 0) / num_people) if num_people > 0 else p.get("delivery_fee", 0)
        
        for name in participants:
            p_items_total = sum(it["estimated_price"] for it in grouped[name])
            is_host = (name.lower() == "you" or name_key(name) == name_key(p.get("created_by_name")))
            
            usr = await db.users.find_one({"full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
            r_email = usr.get("email", "") if usr else ""
            
            split_breakdown[name] = {
                "name": name,
                "email": r_email,
                "items_total": p_items_total,
                "share": delivery_per_person,
                "total": p_items_total + delivery_per_person,
                "paid": True if is_host else False,
                "payment_status": "host" if is_host else "unpaid",
                "utr": ""
            }
            
    p["split_breakdown"] = split_breakdown
    
    reliability_map = await get_roommate_reliability(db, p.get("wing_label", ""))
    p["reliability_scores"] = {name: reliability_map.get(name, {"score": 90, "label": "New roommate", "color": "blue"}) for name in participants}
    
    wing_label = p.get("wing_label")
    wing_members = []
    if wing_label:
        profiles_cursor = db.profiles.find({"wing_label": wing_label})
        profiles = await profiles_cursor.to_list(length=100)
        uids = [prof["_id"] for prof in profiles]
        users_cursor = db.users.find({"_id": {"$in": uids}})
        users = await users_cursor.to_list(length=100)
        wing_members = [u.get("full_name", "").strip() for u in users if u.get("full_name")]
    p["wing_members"] = list(set(wing_members))
    
    return p


@router.get("")
async def get_cart_pools(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile or not profile.get("wing_label"):
        return []

    now = utcnow()
    await db.cart_pools.update_many(
        {
            "wing_label": profile["wing_label"],
            "status": "open",
            "expires_at": {"$lt": now}
        },
        {"$set": {"status": "closed"}}
    )

    cursor = db.cart_pools.find({
        "wing_label": profile["wing_label"]
    }).sort("created_at", -1)

    pools = await cursor.to_list(length=50)
    enriched_pools = []

    for p in pools:
        p["id"] = str(p.pop("_id"))
        from app.core.security import _serialize_value
        for k, v in list(p.items()):
            p[k] = _serialize_value(v)
        
        p = await enrich_pool_document(db, p, user_id)
        
        items_cursor = db.cart_pool_items.find({"pool_id": p["id"]})
        items = await items_cursor.to_list(length=100)
        p["items"] = map_docs(items)
        enriched_pools.append(p)

    return enriched_pools


@router.get("/wing/reliability")
async def get_wing_reliability(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile or not profile.get("wing_label"):
        return {}
    reliability = await get_roommate_reliability(db, profile["wing_label"])
    return reliability


@router.get("/wing/netted-balances")
async def get_wing_netted_balances(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile or not profile.get("wing_label"):
        return {"balances": {"you_owe": [], "owes_you": []}, "suggested_settlements": []}
        
    wing_label = profile["wing_label"]
    user_doc = await db.users.find_one({"_id": user_id})
    full_name = user_doc.get("full_name", "") if user_doc else ""
    
    pools = await db.cart_pools.find({"wing_label": wing_label, "status": "completed"}).to_list(length=100)
    debts = {}
    
    for pool in pools:
        pool_id = pool["_id"]
        host_id = pool.get("host_id")
        host_user = await db.users.find_one({"_id": host_id})
        host_name = host_user.get("full_name", "") if host_user else pool.get("created_by_name", "")
        
        items = await db.cart_pool_items.find({"pool_id": pool_id}).to_list(length=500)
        participants = list(set(it["added_by_name"] for it in items if it.get("is_purchased", True)))
        num_people = len(participants)
        
        final_overhead = pool.get("final_overhead", 0)
        final_discount = pool.get("final_discount", 0)
        net_overhead = final_overhead - final_discount
        overhead_share = int(net_overhead / num_people) if num_people > 0 else 0
        
        for roommate in participants:
            if name_key(roommate) == name_key(host_name):
                continue
                
            payments = pool.get("payments", [])
            pm = next((p for p in payments if name_key(p["name"]) == name_key(roommate)), None)
            
            if not pm or pm.get("status") != "verified":
                p_items_total = sum(it["estimated_price"] for it in items if it.get("is_purchased", True) and name_key(it["added_by_name"]) == name_key(roommate))
                total_owed = p_items_total + overhead_share
                
                u1 = roommate.strip()
                u2 = host_name.strip()
                debts.setdefault(u1, {}).setdefault(u2, 0)
                debts[u1][u2] += total_owed
                
    all_users = list(set(list(debts.keys()) + [u2 for u1 in debts for u2 in debts[u1]]))
    netted_debts = {}
    
    for i in range(len(all_users)):
        for j in range(i+1, len(all_users)):
            u1 = all_users[i]
            u2 = all_users[j]
            
            owes_1_to_2 = debts.get(u1, {}).get(u2, 0)
            owes_2_to_1 = debts.get(u2, {}).get(u1, 0)
            
            if owes_1_to_2 > owes_2_to_1:
                diff = owes_1_to_2 - owes_2_to_1
                if diff > 0:
                    netted_debts.setdefault(u1, {})[u2] = diff
            elif owes_2_to_1 > owes_1_to_2:
                diff = owes_2_to_1 - owes_1_to_2
                if diff > 0:
                    netted_debts.setdefault(u2, {})[u1] = diff
                    
    user_key = full_name.strip()
    owes_you = []
    you_owe = []
    suggested_settlements = []
    
    for debtor, creditors in netted_debts.items():
        for creditor, amount in creditors.items():
            if amount <= 0:
                continue
                
            suggested_settlements.append({
                "debtor": debtor,
                "creditor": creditor,
                "amount": amount,
                "text": f"{debtor} owes {creditor} ₹{amount/100:.2f}"
            })
            
            if name_key(debtor) == name_key(user_key):
                you_owe.append({
                    "name": creditor,
                    "amount": amount
                })
            elif name_key(creditor) == name_key(user_key):
                owes_you.append({
                    "name": debtor,
                    "amount": amount
                })
                
    return {
        "balances": {
            "you_owe": you_owe,
            "owes_you": owes_you
        },
        "suggested_settlements": suggested_settlements
    }


@router.post("")
async def create_cart_pool(req: PoolReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool_id = str(uuid.uuid4())

    req_name = (req.created_by_name or "").strip()
    if req_name and req_name.lower() != "you" and req_name.lower() != "host":
        host_name = req_name
    else:
        user = await db.users.find_one({"_id": user_id})
        host_name = user.get("full_name") if user else None
        if not host_name or host_name.strip().lower() == "you":
            host_name = "Host"
        
    created_by_name = clean_text(host_name, "Host name")

    profile = await db.profiles.find_one({"_id": user_id})
    host_upi = validate_upi_id(profile.get("upi_id")) if profile else None
    wing_label = clean_text((profile or {}).get("wing_label") or req.wing_label, "Wing label", max_chars=60)

    new_pool = {
        "_id": pool_id,
        "host_id": user_id,
        "created_by_name": created_by_name,
        "wing_label": wing_label,
        "platform": validate_platform(req.platform),
        "platform_display_label": clean_text(req.platform_display_label, "Platform display label", max_chars=120) if req.platform_display_label else None,
        "min_cart_value": validate_paise_amount(req.min_cart_value, "Minimum cart value", MAX_POOL_VALUE_PAISE),
        "delivery_fee": validate_paise_amount(req.delivery_fee, "Delivery fee", MAX_FEE_PAISE, allow_zero=True),
        "status": "open",
        "upi_id": host_upi,
        "final_overhead": 0,
        "final_discount": 0,
        "payments": [],  # List of {name, utr, status, submitted_at}
        "expires_at": parse_expires_at(req.expires_at),
        "auto_nudge_enabled": req.auto_nudge_enabled,
        "nudge_interval_hours": req.nudge_interval_hours,
        "created_at": utcnow()
    }

    await db.cart_pools.insert_one(new_pool)
    return map_doc(new_pool)


@router.get("/{pool_id}")
async def get_pool(pool_id: str):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    pool = await expire_pool_if_needed(db, pool)
    
    pool["id"] = str(pool.pop("_id"))
    from app.core.security import _serialize_value
    for k, v in list(pool.items()):
        pool[k] = _serialize_value(v)
        
    pool = await enrich_pool_document(db, pool)
    return pool

@router.put("/{pool_id}")
async def update_pool(pool_id: str, req: PoolUpdateReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")

    # Security Guard: Only host can finalize checkout or cancel
    if pool.get("host_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the pool host can update pool configurations")

    updates = {k: v for k, v in req.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        return map_doc(pool)

    if "status" in updates:
        updates["status"] = updates["status"].strip().lower()
        if updates["status"] not in ALLOWED_POOL_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid pool status")
    if "upi_id" in updates:
        updates["upi_id"] = validate_upi_id(updates["upi_id"])
    if "final_overhead" in updates:
        updates["final_overhead"] = validate_paise_amount(
            updates["final_overhead"], "Final overhead", MAX_FEE_PAISE, allow_zero=True
        )
    if "final_discount" in updates:
        updates["final_discount"] = validate_paise_amount(
            updates["final_discount"], "Final discount", MAX_FEE_PAISE, allow_zero=True
        )
    if "created_by_name" in updates:
        updates["created_by_name"] = clean_text(updates["created_by_name"], "Host name")

    # Check if transitioning to 'completed' to auto-log host split transaction
    if updates.get("status") == "completed" and pool.get("status") != "completed":
        items_cursor = db.cart_pool_items.find({"pool_id": pool_id})
        items = await items_cursor.to_list(length=1000)

        participants = list(set(it["added_by_name"] for it in items if it.get("is_purchased", True)))
        num_people = len(participants)

        if num_people == 0:
            raise HTTPException(status_code=400, detail="Cannot complete a pool with no purchased items.")

        host_name = pool.get("created_by_name")
        host_items_total = 0
        for it in items:
            if it.get("is_purchased", True) and name_key(it["added_by_name"]) == name_key(host_name):
                host_items_total += it["estimated_price"]

        final_overhead = updates.get("final_overhead", pool.get("final_overhead", 0))
        final_discount = updates.get("final_discount", pool.get("final_discount", 0))
        net_overhead = final_overhead - final_discount
        overhead_per_person = int(net_overhead / num_people) if num_people > 0 else 0

        host_share = host_items_total + overhead_per_person
        platform_name = pool.get("platform", "delivery").replace("_", " ").title()

        if host_share > 0:
            txn_id = str(uuid.uuid4())
            new_txn = {
                "_id": txn_id,
                "user_id": user_id,
                "amount": host_share,
                "raw_merchant_string": f"{platform_name} Pool Split - Host",
                "mapped_merchant_name": f"{platform_name} Pool Split",
                "category": "food",
                "source": "manual",
                "is_mapped": True,
                "created_at": utcnow()
            }
            await db.transactions.insert_one(new_txn)
        
        updates["completed_at"] = utcnow()

    await db.cart_pools.update_one({"_id": pool_id}, {"$set": updates})
    updated_pool = await db.cart_pools.find_one({"_id": pool_id})
    if updated_pool:
        updated_pool["id"] = str(updated_pool.pop("_id"))
        from app.core.security import _serialize_value
        for k, v in list(updated_pool.items()):
            updated_pool[k] = _serialize_value(v)
        updated_pool = await enrich_pool_document(db, updated_pool)
    return updated_pool

@router.post("/{pool_id}/payment-confirm")
async def payment_confirm(pool_id: str, req: PaymentConfirmReq):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if pool.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Payments can be confirmed only after checkout is finalized")

    roommate_name = clean_text(req.roommate_name, "Roommate name")
    utr = req.utr.strip()
    if not utr.isdigit() or len(utr) != 12:
        raise HTTPException(status_code=400, detail="Invalid UTR format. Must be a 12-digit numeric reference.")

    items_cursor = db.cart_pool_items.find({"pool_id": pool_id})
    items = await items_cursor.to_list(length=500)
    participant_keys = {name_key(item.get("added_by_name")) for item in items if item.get("is_purchased", True)}
    if participant_keys and name_key(roommate_name) not in participant_keys:
        raise HTTPException(status_code=400, detail="Roommate is not part of this pool")

    # Resolve exact casing of the roommate's name from active pool items to avoid case mismatches in db query
    exact_roommate_name = next(
        (item["added_by_name"] for item in items if name_key(item.get("added_by_name")) == name_key(roommate_name)),
        roommate_name
    )

    payment_entry = {
        "name": exact_roommate_name,
        "utr": utr,
        "status": "pending",
        "submitted_at": utcnow().isoformat()
    }

    # Remove any existing payment record for this roommate
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$pull": {"payments": {"name": exact_roommate_name}}}
    )

    # Append the payment entry
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$push": {"payments": payment_entry}}
    )

    updated = await db.cart_pools.find_one({"_id": pool_id})
    if updated:
        updated["id"] = str(updated.pop("_id"))
        from app.core.security import _serialize_value
        for k, v in list(updated.items()):
            updated[k] = _serialize_value(v)
        updated = await enrich_pool_document(db, updated)
    return updated

@router.post("/{pool_id}/payment-verify")
async def payment_verify(pool_id: str, req: PaymentVerifyReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")

    # Security Guard: Only the host can verify payments
    if pool.get("host_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the pool host can verify payment logs")

    roommate_name = clean_text(req.roommate_name, "Roommate name")
    action = req.action.strip().lower()

    # Resolve exact casing of name from payments list or items list to prevent case mismatches in query update
    payments = pool.get("payments", [])
    items_cursor = db.cart_pool_items.find({"pool_id": pool_id})
    items = await items_cursor.to_list(length=500)
    participants = [pay.get("name") for pay in payments if pay.get("name")] + [it.get("added_by_name") for it in items if it.get("added_by_name")]
    exact_roommate_name = next(
        (name for name in participants if name_key(name) == name_key(roommate_name)),
        roommate_name
    )

    if action in ("verify", "settle_in_kind"):
        status = "verified"
        settlement_mode = "settle_in_kind" if action == "settle_in_kind" else "manual"
        
        # Check if roommate already has a payment log
        has_payment = any(name_key(p["name"]) == name_key(exact_roommate_name) for p in payments)
        
        if has_payment:
            result = await db.cart_pools.update_one(
                {"_id": pool_id, "payments.name": exact_roommate_name},
                {"$set": {
                    "payments.$.status": status,
                    "payments.$.verified_at": utcnow().isoformat(),
                    "payments.$.settlement_mode": settlement_mode
                }}
            )
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Payment confirmation not found")
        else:
            payment_entry = {
                "name": exact_roommate_name,
                "utr": "SETTLED_BY_HOST" if action == "verify" else "SETTLED_IN_KIND",
                "status": status,
                "submitted_at": utcnow().isoformat(),
                "verified_at": utcnow().isoformat(),
                "settlement_mode": settlement_mode
            }
            await db.cart_pools.update_one(
                {"_id": pool_id},
                {"$push": {"payments": payment_entry}}
            )
            
    elif action == "reject":
        result = await db.cart_pools.update_one(
            {"_id": pool_id},
            {"$pull": {"payments": {"name": exact_roommate_name}}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Payment confirmation not found")
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    updated = await db.cart_pools.find_one({"_id": pool_id})
    if updated:
        updated["id"] = str(updated.pop("_id"))
        from app.core.security import _serialize_value
        for k, v in list(updated.items()):
            updated[k] = _serialize_value(v)
        updated = await enrich_pool_document(db, updated)
    return updated

@router.get("/{pool_id}/items")
async def get_pool_items(pool_id: str):
    db = get_db()
    cursor = db.cart_pool_items.find({"pool_id": pool_id}).sort("created_at", 1)
    items = await cursor.to_list(length=500)
    return map_docs(items)

async def match_wing_roommate(db, pool: dict, input_name: str) -> str:
    cleaned = clean_text(input_name, "Roommate name")
    wing_label = pool.get("wing_label")
    if not wing_label:
        return cleaned

    profiles_cursor = db.profiles.find({"wing_label": wing_label})
    profiles = await profiles_cursor.to_list(length=100)
    uids = [prof["_id"] for prof in profiles]
    users_cursor = db.users.find({"_id": {"$in": uids}})
    users = await users_cursor.to_list(length=100)
    wing_members = [u.get("full_name", "").strip() for u in users if u.get("full_name")]

    in_key = name_key(cleaned)
    for member in wing_members:
        m_key = name_key(member)
        if in_key == m_key:
            return member

    return cleaned

@router.post("/{pool_id}/items")
async def insert_pool_item(pool_id: str, req: PoolItemReq):
    db = get_db()

    # Verify pool exists and is open
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    pool = await expire_pool_if_needed(db, pool)
    if pool.get("status") != "open":
        raise HTTPException(status_code=400, detail="This pool is no longer accepting items.")
    if is_pool_expired(pool):
        raise HTTPException(status_code=400, detail="This pool has expired.")

    # Robustness Limit Validation
    if req.estimated_price <= 0 or req.estimated_price > MAX_ITEM_PRICE_PAISE:
         raise HTTPException(status_code=400, detail="Estimated price must be between ₹1 and ₹5,000")

    # Match against registered wing roommates to avoid name collisions/typos
    matched_name = await match_wing_roommate(db, pool, req.added_by_name)

    item_id = str(uuid.uuid4())

    new_item = {
        "_id": item_id,
        "pool_id": pool_id,
        "added_by_name": matched_name,
        "item_description": clean_text(req.item_description, "Item description", max_chars=MAX_DESCRIPTION_CHARS),
        "estimated_price": req.estimated_price,
        "product_url": validate_product_url(req.product_url),
        "is_purchased": True,
        "created_at": utcnow()
    }

    await db.cart_pool_items.insert_one(new_item)
    return map_doc(new_item)

@router.delete("/{pool_id}/items/{item_id}")
async def delete_pool_item(pool_id: str, item_id: str):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    pool = await expire_pool_if_needed(db, pool)
    if pool.get("status") != "open":
        raise HTTPException(status_code=400, detail="This pool is no longer editable.")

    res = await db.cart_pool_items.delete_one({"_id": item_id, "pool_id": pool_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}

@router.patch("/{pool_id}/items/{item_id}")
async def update_pool_item(pool_id: str, item_id: str, req: PoolItemUpdateReq):
    db = get_db()

    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    pool = await expire_pool_if_needed(db, pool)
    if pool.get("status") != "open":
        raise HTTPException(status_code=400, detail="This pool is no longer editable.")

    if req.estimated_price is not None and (req.estimated_price <= 0 or req.estimated_price > MAX_ITEM_PRICE_PAISE):
         raise HTTPException(status_code=400, detail="Estimated price must be between ₹1 and ₹5,000")

    item = await db.cart_pool_items.find_one({"_id": item_id, "pool_id": pool_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Build updates dict, handling booleans (False is a valid value, not None)
    updates = {}
    for k, v in req.model_dump(exclude_unset=True).items():
        if isinstance(v, bool) or v is not None:
            updates[k] = v

    if "item_description" in updates:
        updates["item_description"] = clean_text(
            updates["item_description"], "Item description", max_chars=MAX_DESCRIPTION_CHARS
        )
    if "product_url" in updates:
        updates["product_url"] = validate_product_url(updates["product_url"])

    if updates:
        await db.cart_pool_items.update_one({"_id": item_id, "pool_id": pool_id}, {"$set": updates})
        item = await db.cart_pool_items.find_one({"_id": item_id, "pool_id": pool_id})

    return map_doc(item)

class NudgeReq(BaseModel):
    roommate_name: str

@router.post("/{pool_id}/nudge")
async def nudge_roommate_api(pool_id: str, req: NudgeReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
        
    roommate_name = req.roommate_name
    
    usr = await db.users.find_one({"full_name": {"$regex": f"^{re.escape(roommate_name)}$", "$options": "i"}})
    if not usr or not usr.get("phone_number"):
        raise HTTPException(status_code=400, detail=f"No registered phone number found for {roommate_name}. Please nudge manually.")
        
    phone = usr["phone_number"]
    platform = pool.get("platform", "delivery").replace("_", " ").title()
    p = await enrich_pool_document(db, pool)
    details = p.get("split_breakdown", {}).get(roommate_name)
    if not details or details.get("paid"):
         return {"success": False, "mode": "fallback", "message": f"{roommate_name} has already paid."}
         
    owed_amount = details.get("total", 0)
    formatted_amount = f"{owed_amount / 100:.2f}"
    
    from app.core.config import settings
    pool_url = f"{settings.FRONTEND_BASE_URL}/pool/{pool_id}"
    message_text = f"Hey {roommate_name}, please settle your {platform} split of INR {formatted_amount} for our cart pool. Pay the host and verify here: {pool_url}"
    
    clean_phone = "".join(filter(str.isdigit, phone))
    if len(clean_phone) == 10:
        clean_phone = f"91{clean_phone}"

    # --- TWILIO WHATSAPP (Primary — works out of the box with Sandbox) ---
    twilio_sid     = getattr(settings, "TWILIO_ACCOUNT_SID", None)
    twilio_token   = getattr(settings, "TWILIO_AUTH_TOKEN", None)
    twilio_from_no = getattr(settings, "TWILIO_WHATSAPP_FROM", None)  # e.g. "whatsapp:+14155238886"

    if twilio_sid and twilio_token and twilio_from_no:
        import httpx, base64
        auth = base64.b64encode(f"{twilio_sid}:{twilio_token}".encode()).decode()
        url  = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
        payload = {
            "From": twilio_from_no,
            "To":   f"whatsapp:+{clean_phone}",
            "Body": message_text,
        }
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(url, data=payload, headers={"Authorization": f"Basic {auth}"}, timeout=10.0)
            data = res.json()
            if res.status_code in (200, 201):
                await db.cart_pools.update_one(
                    {"_id": pool_id},
                    {"$set": {f"last_nudge_sent_at_{roommate_name.lower().replace(' ', '_')}": utcnow().isoformat()}}
                )
                return {"success": True, "mode": "twilio", "message": f"WhatsApp nudge sent to {roommate_name}!"}
            else:
                error_msg = data.get("message", res.text)
                # fall through to Meta below
        except Exception as e:
            error_msg = str(e)

    # --- META CLOUD API (Fallback — requires verified recipient in sandbox) ---
    whatsapp_token = getattr(settings, "WHATSAPP_API_TOKEN", None)
    phone_id       = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)
    
    if whatsapp_token and phone_id:
        import httpx
        url = f"https://graph.facebook.com/v25.0/{phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {whatsapp_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {"body": message_text}
        }
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(url, headers=headers, json=payload, timeout=10.0)
            if res.status_code in (200, 201):
                await db.cart_pools.update_one(
                    {"_id": pool_id},
                    {"$set": {f"last_nudge_sent_at_{roommate_name.lower().replace(' ', '_')}": utcnow().isoformat()}}
                )
                return {"success": True, "mode": "meta", "message": f"WhatsApp nudge sent to {roommate_name} via Meta!"}
            else:
                return {"success": False, "mode": "fallback", "message": f"Meta API error: {res.text}"}
        except Exception as e:
            return {"success": False, "mode": "fallback", "message": f"Meta request error: {str(e)}"}

    return {"success": False, "mode": "fallback", "message": "No WhatsApp provider configured. Use manual sharing."}

@router.post("/cron/auto-nudge")
async def cron_auto_nudge(user_id: str = Depends(get_current_user)):
    db = get_db()
    pools_cursor = db.cart_pools.find({
        "host_id": user_id,
        "status": "completed",
        "auto_nudge_enabled": True,
    })
    pools = await pools_cursor.to_list(length=500)
    
    from app.core.config import settings
    whatsapp_token = getattr(settings, "WHATSAPP_API_TOKEN", None)
    phone_id = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)
    if not whatsapp_token or not phone_id:
         return {"success": False, "message": "WhatsApp API keys not configured. Auto-nudge cron skipped."}
         
    import httpx
    nudge_count = 0
    
    for pool in pools:
        pool_id = pool["_id"]
        completed_at = pool.get("completed_at")
        if not completed_at:
             continue
             
        interval_hours = pool.get("nudge_interval_hours", 24)
        elapsed_seconds = (utcnow() - completed_at).total_seconds()
        elapsed_hours = elapsed_seconds / 3600
        
        if elapsed_hours < interval_hours:
             continue
             
        p = await enrich_pool_document(db, pool)
        platform = p.get("platform", "delivery").replace("_", " ").title()
        pool_url = f"{settings.FRONTEND_BASE_URL}/pool/{pool_id}"
        
        for rName, details in p.get("split_breakdown", {}).items():
            is_host = rName.lower() == "you" or name_key(rName) == name_key(p.get("created_by_name"))
            if is_host:
                 continue
                 
            if details.get("paid"):
                 continue
                 
            nudge_key = f"last_nudge_sent_at_{rName.lower().replace(' ', '_')}"
            last_nudge = p.get(nudge_key)
            if last_nudge:
                 try:
                     last_dt = datetime.datetime.fromisoformat(last_nudge)
                     if (utcnow() - last_dt).total_seconds() / 3600 < interval_hours:
                          continue
                 except Exception:
                      pass
                      
            usr = await db.users.find_one({"full_name": {"$regex": f"^{re.escape(rName)}$", "$options": "i"}})
            if not usr or not usr.get("phone_number"):
                 continue
                 
            phone = usr["phone_number"]
            clean_phone = "".join(filter(str.isdigit, phone))
            if len(clean_phone) == 10:
                clean_phone = f"91{clean_phone}"
                
            formatted_amount = f"{details['total'] / 100:.2f}"
            message_text = f"Hey {rName}, this is an automated reminder to settle your {platform} split of INR {formatted_amount} for our cart pool. Pay here: {pool_url}"
            
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": clean_phone,
                "type": "text",
                "text": {
                    "body": message_text
                }
            }
            
            try:
                url = f"https://graph.facebook.com/v20.0/{phone_id}/messages"
                headers = {
                    "Authorization": f"Bearer {whatsapp_token}",
                    "Content-Type": "application/json"
                }
                async with httpx.AsyncClient() as client:
                    res = await client.post(url, headers=headers, json=payload, timeout=10.0)
                if res.status_code in (200, 201):
                    await db.cart_pools.update_one(
                        {"_id": pool_id},
                        {"$set": {nudge_key: utcnow().isoformat()}}
                    )
                    nudge_count += 1
            except Exception:
                pass
                
    return {"success": True, "messages_sent": nudge_count}


# ── Amazon Pay sandbox contract simulation ──────────────────────────────────

class AmazonCheckoutReq(BaseModel):
    final_overhead: int
    final_discount: int
    checkout_notes: Optional[str] = None
    upi_id: Optional[str] = None

class RoommateAmznPayReq(BaseModel):
    roommate_name: str
    amount: int

@router.post("/{pool_id}/amazon-checkout-session")
async def create_amazon_checkout_session(
    pool_id: str,
    req: AmazonCheckoutReq,
    user_id: str = Depends(get_current_user)
):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
        
    if pool.get("host_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the pool host can initiate Amazon Pay checkout")
    if pool.get("status") != "open":
        raise HTTPException(status_code=400, detail="Amazon Pay sandbox checkout can only start while the pool is open")
        
    # Generate a local sandbox session ID in the same visual family as Amazon Pay.
    checkout_session_id = f"S01-{uuid.uuid4().hex[:14].upper()}"
    
    # Calculate net total amount in paise to display in INR
    items_cursor = db.cart_pool_items.find({"pool_id": pool_id})
    items = await items_cursor.to_list(length=1000)
    items_total = sum(it.get("estimated_price", 0) for it in items if it.get("is_purchased", True))
    net_total = max(0, items_total + req.final_overhead - req.final_discount)
    
    # Store a local sandbox session shaped like the Amazon Pay V2 contract.
    amazon_checkout = {
        "checkoutSessionId": checkout_session_id,
        "statusDetails": {"state": "Open"},
        "webCheckoutDetails": {
            "checkoutReviewReturnUrl": f"/pool/{pool_id}?amazonCheckoutSessionId={checkout_session_id}"
        },
        "paymentDetails": {
            "paymentIntent": "AuthorizeWithCapture",
            "chargeAmount": {
                "amount": f"{net_total / 100:.2f}",
                "currencyCode": "INR"
            }
        },
        "final_overhead": req.final_overhead,
        "final_discount": req.final_discount,
        "checkout_notes": req.checkout_notes,
        "upi_id": req.upi_id,
        "created_at": utcnow()
    }
    
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$set": {"amazon_checkout": amazon_checkout}}
    )
    
    return {
        "checkoutSessionId": checkout_session_id,
        "amazonPayRedirectUrl": f"/mock-amazon-pay-gateway?pool_id={pool_id}&checkoutSessionId={checkout_session_id}",
        "statusDetails": {"state": "Open"}
    }

@router.post("/{pool_id}/amazon-checkout-session/{checkout_session_id}/complete")
async def complete_amazon_checkout_session(
    pool_id: str,
    checkout_session_id: str,
    user_id: str = Depends(get_current_user)
):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if pool.get("host_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the pool host can complete Amazon Pay checkout")
    if pool.get("status") != "open":
        raise HTTPException(status_code=400, detail="Amazon Pay sandbox checkout can only complete while the pool is open")
        
    amzn_checkout = pool.get("amazon_checkout")
    if not amzn_checkout or amzn_checkout.get("checkoutSessionId") != checkout_session_id:
        raise HTTPException(status_code=400, detail="Invalid Amazon Pay checkout session ID")
        
    # Mark pool as completed and log host transaction
    final_overhead = amzn_checkout.get("final_overhead", 0)
    final_discount = amzn_checkout.get("final_discount", 0)
    checkout_notes = amzn_checkout.get("checkout_notes")
    upi_id = amzn_checkout.get("upi_id")
    
    # Gather items and calculate host split
    items_cursor = db.cart_pool_items.find({"pool_id": pool_id})
    items = await items_cursor.to_list(length=1000)
    
    participants = list(set(it["added_by_name"] for it in items if it.get("is_purchased", True)))
    num_people = len(participants)
    
    if num_people == 0:
        raise HTTPException(status_code=400, detail="Cannot complete checkout with zero items.")
        
    host_name = pool.get("created_by_name")
    host_items_total = 0
    for it in items:
        if it.get("is_purchased", True) and name_key(it["added_by_name"]) == name_key(host_name):
            host_items_total += it["estimated_price"]
            
    net_overhead = final_overhead - final_discount
    overhead_per_person = int(net_overhead / num_people) if num_people > 0 else 0
    host_share = host_items_total + overhead_per_person
    platform_name = pool.get("platform", "delivery").replace("_", " ").title()
    
    if host_share > 0:
        txn_id = f"amzn_txn_{uuid.uuid4().hex[:12]}"
        new_txn = {
            "_id": txn_id,
            "user_id": pool.get("host_id"),
            "amount": host_share,
            "raw_merchant_string": f"{platform_name} Pool - Amazon Pay Sandbox checkout",
            "mapped_merchant_name": f"{platform_name} Pool (Amazon Pay Sandbox)",
            "category": "food",
            "source": "amazon_pay_sandbox",
            "is_mapped": True,
            "created_at": utcnow()
        }
        await db.transactions.insert_one(new_txn)
        
    # Update pool document status
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {
            "$set": {
                "status": "completed",
                "upi_id": upi_id,
                "final_overhead": final_overhead,
                "final_discount": final_discount,
                "checkout_notes": checkout_notes,
                "completed_at": utcnow(),
                "amazon_checkout.statusDetails.state": "Completed",
                "amazon_checkout.completed_at": utcnow()
            }
        }
    )
    
    # Return enriched pool document
    updated = await db.cart_pools.find_one({"_id": pool_id})
    updated["id"] = str(updated.pop("_id"))
    
    from app.core.security import _serialize_value
    for k, v in list(updated.items()):
        updated[k] = _serialize_value(v)
    return await enrich_pool_document(db, updated)

@router.post("/{pool_id}/amazon-charge-permission/roommate-reimburse")
async def process_amazon_roommate_payment(
    pool_id: str,
    req: RoommateAmznPayReq,
    user_id: str = Depends(get_current_user)
):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if pool.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Roommate settlement is available only after checkout is finalized")
    if pool.get("host_id") == user_id:
        raise HTTPException(status_code=400, detail="Host cannot settle their own pool as a roommate")
        
    # Record a roommate sandbox settlement. This does not charge a live payment rail.
    exact_roommate_name = await match_wing_roommate(db, pool, req.roommate_name)
    user_doc = await db.users.find_one({"_id": user_id})
    user_name = name_key(user_doc.get("full_name")) if user_doc else ""
    if not user_name or user_name != name_key(exact_roommate_name):
        raise HTTPException(status_code=403, detail="You can settle only your own roommate split")

    enriched_pool = await enrich_pool_document(db, {**pool, "id": pool.get("_id")}, current_user_id=user_id)
    roommate_split = (enriched_pool.get("split_breakdown") or {}).get(exact_roommate_name)
    if not roommate_split:
        raise HTTPException(status_code=400, detail="Roommate split was not found for this pool")
    if roommate_split.get("paid"):
        raise HTTPException(status_code=409, detail="Roommate split is already settled")
    expected_amount = int(roommate_split.get("total") or 0)
    if req.amount != expected_amount:
        raise HTTPException(status_code=400, detail="Settlement amount does not match the finalized split")
    
    charge_permission_id = f"B01-{uuid.uuid4().hex[:14].upper()}"
    payment_entry = {
        "name": exact_roommate_name,
        "utr": charge_permission_id,
        "status": "verified",
        "submitted_at": utcnow().isoformat(),
        "verified_at": utcnow().isoformat(),
        "settlement_mode": "amazon_pay_sandbox",
        "confidence": 1.0
    }
    
    # Pull old payment record and push new one
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$pull": {"payments": {"name": exact_roommate_name}}}
    )
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$push": {"payments": payment_entry}}
    )
    
    # Log transaction for the paying roommate
    txn_id = f"amzn_ltr_{uuid.uuid4().hex[:12]}"
    new_txn = {
        "_id": txn_id,
        "user_id": user_id,
        "amount": req.amount,
        "raw_merchant_string": f"Amazon Pay Sandbox - Reimburse {pool.get('created_by_name')}",
        "mapped_merchant_name": "Amazon Pay Sandbox",
        "category": "food",
        "source": "amazon_pay_sandbox",
        "is_mapped": True,
        "created_at": utcnow()
    }
    await db.transactions.insert_one(new_txn)
    
    return {
        "chargePermissionId": charge_permission_id,
        "chargePermissionStatus": {
            "state": "Chargeable",
            "lastUpdatedTimestamp": utcnow().isoformat()
        }
    }
