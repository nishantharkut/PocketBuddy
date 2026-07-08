from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import datetime
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs
from app.services.subscriptions import (
    detect_recurring_subscriptions,
    parse_to_naive_utc,
    upsert_subscription,
)

router = APIRouter()


class SubReq(BaseModel):
    name: Optional[str] = None
    service_name: Optional[str] = None
    amount: int
    billing_cycle: Optional[str] = "monthly"
    next_debit_date: str
    detected_from: Optional[str] = "manual"
    is_active: Optional[bool] = True


@router.get("")
async def get_subscriptions(user_id: str = Depends(get_current_user)):
    db = get_db()
    # Runs the Recurring Commitments Engine detection loop
    await detect_recurring_subscriptions(db, user_id)

    cursor = db.subscriptions.find({"user_id": user_id}).sort("next_debit_date", 1)
    subs = await cursor.to_list(length=300)
    return map_docs(subs)


@router.post("")
async def insert_subscription_route(req: SubReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    service_name = (req.service_name or req.name or "").strip()
    if not service_name:
        raise HTTPException(status_code=400, detail="Missing service_name")

    subscription = await upsert_subscription(
        db,
        user_id=user_id,
        service_name=service_name,
        amount_paise=req.amount,
        next_debit_date=parse_to_naive_utc(req.next_debit_date),
        detected_from=req.detected_from or "manual",
        status="confirmed",
    )
    if req.is_active is not None and subscription.get("is_active") != req.is_active:
        await db.subscriptions.update_one(
            {"_id": subscription["_id"], "user_id": user_id},
            {"$set": {"is_active": req.is_active, "updated_at": datetime.datetime.utcnow()}},
        )
        subscription = await db.subscriptions.find_one({"_id": subscription["_id"], "user_id": user_id})

    return map_doc(subscription)


@router.post("/toggle-active")
async def toggle_subscription(req: dict, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = req.get("id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="Missing id")
    sub = await db.subscriptions.find_one({"_id": sub_id, "user_id": user_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    desired_status = req.get("is_active")
    new_status = desired_status if isinstance(desired_status, bool) else not sub.get("is_active", True)
    await db.subscriptions.update_one(
        {"_id": sub_id},
        {"$set": {"is_active": new_status, "updated_at": datetime.datetime.utcnow()}}
    )

    return {"status": "ok", "is_active": new_status}


@router.post("/confirm")
async def confirm_subscription(req: dict, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = req.get("id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="Missing id")
    sub = await db.subscriptions.find_one({"_id": sub_id, "user_id": user_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    await db.subscriptions.update_one(
        {"_id": sub_id},
        {"$set": {"status": "confirmed", "is_active": True, "updated_at": datetime.datetime.utcnow()}}
    )
    return {"status": "ok", "status_label": "confirmed"}


@router.post("/ignore")
async def ignore_subscription(req: dict, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = req.get("id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="Missing id")
    sub = await db.subscriptions.find_one({"_id": sub_id, "user_id": user_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    await db.subscriptions.update_one(
        {"_id": sub_id},
        {"$set": {"status": "ignored", "is_active": False, "updated_at": datetime.datetime.utcnow()}}
    )
    return {"status": "ok", "status_label": "ignored"}


@router.post("/cancel")
async def cancel_subscription(req: dict, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = req.get("id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="Missing id")
    sub = await db.subscriptions.find_one({"_id": sub_id, "user_id": user_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    await db.subscriptions.update_one(
        {"_id": sub_id},
        {"$set": {"status": "cancelled", "is_active": False, "updated_at": datetime.datetime.utcnow()}}
    )
    return {"status": "ok", "status_label": "cancelled"}


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
