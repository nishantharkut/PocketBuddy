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
    delivery_fee: int
    created_by_name: str

class PoolUpdateReq(BaseModel):
    status: Optional[str] = None
    upi_id: Optional[str] = None
    final_overhead: Optional[int] = None
    final_discount: Optional[int] = None

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

@router.get("")
async def get_cart_pools(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile or not profile.get("wing_label"):
        return []

    # Auto-expire pools that have passed their expiration date
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

    for p in pools:
        p["id"] = str(p.pop("_id"))
        # Serialize datetime fields with Z suffix for frontend UTC compatibility
        from app.core.security import _serialize_value
        for k, v in list(p.items()):
            p[k] = _serialize_value(v)
        items_cursor = db.cart_pool_items.find({"pool_id": p["id"]})
        items = await items_cursor.to_list(length=100)
        p["items"] = map_docs(items)

    return pools

@router.post("")
async def create_cart_pool(req: PoolReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool_id = str(uuid.uuid4())

    profile = await db.profiles.find_one({"_id": user_id})
    host_upi = validate_upi_id(profile.get("upi_id")) if profile else None
    wing_label = clean_text((profile or {}).get("wing_label") or req.wing_label, "Wing label", max_chars=60)

    new_pool = {
        "_id": pool_id,
        "host_id": user_id,
        "created_by_name": clean_text(req.created_by_name, "Host name"),
        "wing_label": wing_label,
        "platform": validate_platform(req.platform),
        "min_cart_value": validate_paise_amount(req.min_cart_value, "Minimum cart value", MAX_POOL_VALUE_PAISE),
        "delivery_fee": validate_paise_amount(req.delivery_fee, "Delivery fee", MAX_FEE_PAISE, allow_zero=True),
        "status": "open",
        "upi_id": host_upi,
        "final_overhead": 0,
        "final_discount": 0,
        "payments": [],  # List of {name, utr, status, submitted_at}
        "expires_at": parse_expires_at(req.expires_at),
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

    return map_doc(pool)

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
            if it.get("is_purchased", True) and it["added_by_name"] == host_name:
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

    await db.cart_pools.update_one({"_id": pool_id}, {"$set": updates})
    updated_pool = await db.cart_pools.find_one({"_id": pool_id})
    return map_doc(updated_pool)

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

    payment_entry = {
        "name": roommate_name,
        "utr": utr,
        "status": "pending",
        "submitted_at": utcnow().isoformat()
    }

    # Remove any existing payment record for this roommate
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$pull": {"payments": {"name": roommate_name}}}
    )

    # Append the payment entry
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$push": {"payments": payment_entry}}
    )

    updated = await db.cart_pools.find_one({"_id": pool_id})
    return map_doc(updated)

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

    if action == "verify":
        result = await db.cart_pools.update_one(
            {"_id": pool_id, "payments.name": roommate_name},
            {"$set": {"payments.$.status": "verified"}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Payment confirmation not found")
    elif action == "reject":
        result = await db.cart_pools.update_one(
            {"_id": pool_id},
            {"$pull": {"payments": {"name": roommate_name}}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Payment confirmation not found")
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    updated = await db.cart_pools.find_one({"_id": pool_id})
    return map_doc(updated)

@router.get("/{pool_id}/items")
async def get_pool_items(pool_id: str):
    db = get_db()
    cursor = db.cart_pool_items.find({"pool_id": pool_id}).sort("created_at", 1)
    items = await cursor.to_list(length=500)
    return map_docs(items)

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

    item_id = str(uuid.uuid4())

    new_item = {
        "_id": item_id,
        "pool_id": pool_id,
        "added_by_name": clean_text(req.added_by_name, "Roommate name"),
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
