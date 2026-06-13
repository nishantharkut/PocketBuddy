from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import uuid
import datetime
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

router = APIRouter()

class PoolReq(BaseModel):
    wing_label: str
    min_cart_value: int
    expires_at: str

class PoolItemReq(BaseModel):
    added_by_name: str
    item_description: str
    estimated_price: int

@router.get("/")
async def get_cart_pools(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile or not profile.get("wing_label"):
        return []
    
    now = datetime.datetime.utcnow()
    cursor = db.cart_pools.find({
        "wing_label": profile["wing_label"],
        "status": "open",
        "expires_at": {"$gt": now}
    }).sort("created_at", -1)
    
    pools = await cursor.to_list(length=50)
    
    for p in pools:
        p["id"] = str(p.pop("_id"))
        items_cursor = db.cart_pool_items.find({"pool_id": p["id"]})
        items = await items_cursor.to_list(length=100)
        p["items"] = map_docs(items)
        
    return pools

@router.post("/")
async def create_cart_pool(req: PoolReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool_id = str(uuid.uuid4())
    
    new_pool = {
        "_id": pool_id,
        "host_id": user_id,
        "wing_label": req.wing_label,
        "min_cart_value": req.min_cart_value,
        "status": "open",
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
    return map_doc(pool)

@router.get("/{pool_id}/items")
async def get_pool_items(pool_id: str):
    db = get_db()
    cursor = db.cart_pool_items.find({"pool_id": pool_id}).sort("created_at", 1)
    items = await cursor.to_list(length=500)
    return map_docs(items)

@router.post("/{pool_id}/items")
async def insert_pool_item(pool_id: str, req: PoolItemReq):
    db = get_db()
    item_id = str(uuid.uuid4())
    
    new_item = {
        "_id": item_id,
        "pool_id": pool_id,
        "added_by_name": req.added_by_name,
        "item_description": req.item_description,
        "estimated_price": req.estimated_price,
        "created_at": datetime.datetime.utcnow()
    }
    
    await db.cart_pool_items.insert_one(new_item)
    return map_doc(new_item)
