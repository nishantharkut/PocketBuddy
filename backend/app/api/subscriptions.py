from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import uuid
import datetime
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

router = APIRouter()

class SubReq(BaseModel):
    name: str
    amount: int
    billing_cycle: str
    next_debit_date: str

@router.get("/")
async def get_subscriptions(user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.subscriptions.find({"user_id": user_id, "is_active": True}).sort("next_debit_date", 1)
    subs = await cursor.to_list(length=100)
    return map_docs(subs)

@router.post("/")
async def insert_subscription(req: SubReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = str(uuid.uuid4())
    
    new_sub = {
        "_id": sub_id,
        "user_id": user_id,
        "name": req.name,
        "amount": req.amount,
        "billing_cycle": req.billing_cycle,
        "next_debit_date": datetime.datetime.fromisoformat(req.next_debit_date.replace("Z", "+00:00")),
        "is_active": True,
        "detected_from": "manual",
        "created_at": datetime.datetime.utcnow()
    }
    
    await db.subscriptions.insert_one(new_sub)
    return map_doc(new_sub)

@router.post("/toggle-active")
async def toggle_subscription(req: dict, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = req.get("id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="Missing id")
    sub = await db.subscriptions.find_one({"_id": sub_id, "user_id": user_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
        
    new_status = not sub.get("is_active", True)
    await db.subscriptions.update_one(
        {"_id": sub_id},
        {"$set": {"is_active": new_status}}
    )
    
    return {"status": "ok", "is_active": new_status}

@router.post("/delete")
async def delete_subscription(req: dict, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = req.get("id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="Missing id")
    result = await db.subscriptions.delete_one({"_id": sub_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"status": "ok"}
