from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import uuid
import datetime
from typing import Optional, List
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

router = APIRouter()

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

@router.get("")
async def get_cart_pools(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile or not profile.get("wing_label"):
        return []

    # Auto-expire pools that have passed their expiration date
    now = datetime.datetime.utcnow()
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
    host_upi = profile.get("upi_id") if profile else None

    new_pool = {
        "_id": pool_id,
        "host_id": user_id,
        "created_by_name": req.created_by_name,
        "wing_label": req.wing_label,
        "platform": req.platform,
        "min_cart_value": req.min_cart_value,
        "delivery_fee": req.delivery_fee,
        "status": "open",
        "upi_id": host_upi,
        "final_overhead": 0,
        "final_discount": 0,
        "payments": [],  # List of {name, utr, status, submitted_at}
        "expires_at": datetime.datetime.fromisoformat(req.expires_at.replace("Z", "+00:00")),
        "created_at": datetime.datetime.utcnow()
    }

    await db.cart_pools.insert_one(new_pool)
    return map_doc(new_pool)

@router.get("/{pool_id}")
async def get_pool(pool_id: str):
    db = get_db()
    pool = await db.cart_pools.find_one({"_id": pool_id})
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    # Auto-expire if expired and still open
    if pool.get("status") == "open" and pool.get("expires_at") and pool["expires_at"] < datetime.datetime.utcnow():
        await db.cart_pools.update_one({"_id": pool_id}, {"$set": {"status": "closed"}})
        pool["status"] = "closed"

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

    updates = {k: v for k, v in req.dict(exclude_unset=True).items() if v is not None}
    if not updates:
        return map_doc(pool)

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
                "created_at": datetime.datetime.utcnow()
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

    utr = req.utr.strip()
    if not utr.isdigit() or len(utr) != 12:
        raise HTTPException(status_code=400, detail="Invalid UTR format. Must be a 12-digit numeric reference.")

    payment_entry = {
        "name": req.roommate_name,
        "utr": utr,
        "status": "pending",
        "submitted_at": datetime.datetime.utcnow().isoformat()
    }

    # Remove any existing payment record for this roommate
    await db.cart_pools.update_one(
        {"_id": pool_id},
        {"$pull": {"payments": {"name": req.roommate_name}}}
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

    if req.action == "verify":
        await db.cart_pools.update_one(
            {"_id": pool_id, "payments.name": req.roommate_name},
            {"$set": {"payments.$.status": "verified"}}
        )
    elif req.action == "reject":
        await db.cart_pools.update_one(
            {"_id": pool_id},
            {"$pull": {"payments": {"name": req.roommate_name}}}
        )
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
    if pool.get("status") != "open":
        raise HTTPException(status_code=400, detail="This pool is no longer accepting items.")
    if pool.get("expires_at") and pool["expires_at"] < datetime.datetime.utcnow():
        raise HTTPException(status_code=400, detail="This pool has expired.")

    # Robustness Limit Validation
    if req.estimated_price <= 0 or req.estimated_price > 500000:
         raise HTTPException(status_code=400, detail="Estimated price must be between ₹1 and ₹5,000")

    item_id = str(uuid.uuid4())

    new_item = {
        "_id": item_id,
        "pool_id": pool_id,
        "added_by_name": req.added_by_name,
        "item_description": req.item_description,
        "estimated_price": req.estimated_price,
        "product_url": req.product_url,
        "is_purchased": True,
        "created_at": datetime.datetime.utcnow()
    }

    await db.cart_pool_items.insert_one(new_item)
    return map_doc(new_item)

@router.delete("/{pool_id}/items/{item_id}")
async def delete_pool_item(pool_id: str, item_id: str):
    db = get_db()
    res = await db.cart_pool_items.delete_one({"_id": item_id, "pool_id": pool_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}

@router.patch("/{pool_id}/items/{item_id}")
async def update_pool_item(pool_id: str, item_id: str, req: PoolItemUpdateReq):
    db = get_db()

    if req.estimated_price is not None and (req.estimated_price <= 0 or req.estimated_price > 500000):
         raise HTTPException(status_code=400, detail="Estimated price must be between ₹1 and ₹5,000")

    item = await db.cart_pool_items.find_one({"_id": item_id, "pool_id": pool_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Build updates dict, handling booleans (False is a valid value, not None)
    updates = {}
    for k, v in req.dict(exclude_unset=True).items():
        if isinstance(v, bool) or v is not None:
            updates[k] = v

    if updates:
        await db.cart_pool_items.update_one({"_id": item_id, "pool_id": pool_id}, {"$set": updates})
        item = await db.cart_pool_items.find_one({"_id": item_id, "pool_id": pool_id})

    return map_doc(item)
