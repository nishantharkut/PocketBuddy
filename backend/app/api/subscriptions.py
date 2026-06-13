from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import uuid
import datetime
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

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

    # Auto-detect subscriptions dynamically from historical transaction streams
    try:
        txns_cursor = db.transactions.find({"user_id": user_id}).sort("created_at", -1)
        txns = await txns_cursor.to_list(length=150)

        # Group by clean merchant and amount to check for monthly recurrences
        groups = {}
        for t in txns:
            m_name = t.get("mapped_merchant_name") or t.get("raw_merchant_string")
            if not m_name:
                continue
            amt = t.get("amount")
            if not amt or amt <= 0:
                continue
            key = (m_name.strip(), amt)
            groups.setdefault(key, []).append(t)

        for (m_name, amt), t_list in groups.items():
            if len(t_list) >= 2:
                # Sort by created_at ascending
                t_list.sort(key=lambda x: x["created_at"])

                # Check date differences between consecutive transactions
                for i in range(len(t_list) - 1):
                    d1 = t_list[i]["created_at"]
                    d2 = t_list[i + 1]["created_at"]

                    # Convert to datetime if string
                    if isinstance(d1, str):
                        d1 = datetime.datetime.fromisoformat(d1.replace("Z", "+00:00"))
                    if isinstance(d2, str):
                        d2 = datetime.datetime.fromisoformat(d2.replace("Z", "+00:00"))

                    days_diff = (d2 - d1).days

                    # Gap matching regular monthly auto-debit billing cycles (25-35 days)
                    if 25 <= days_diff <= 35:
                        service_name = m_name.capitalize()

                        # Verify if subscription already exists
                        existing = await db.subscriptions.find_one({
                            "user_id": user_id,
                            "service_name": service_name
                        })

                        if not existing:
                            next_debit = d2 + datetime.timedelta(days=30)
                            await db.subscriptions.insert_one({
                                "_id": str(uuid.uuid4()),
                                "user_id": user_id,
                                "name": service_name,
                                "service_name": service_name,
                                "amount": amt,
                                "billing_cycle": "monthly",
                                "next_debit_date": next_debit,
                                "is_active": True,
                                "detected_from": "auto_detected",
                                "created_at": datetime.datetime.utcnow()
                            })
                        break
    except Exception:
        pass  # Fail-silent to ensure user can always load manual subscriptions

    cursor = db.subscriptions.find({"user_id": user_id}).sort("next_debit_date", 1)
    subs = await cursor.to_list(length=100)
    return map_docs(subs)

@router.post("")
async def insert_subscription(req: SubReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    sub_id = str(uuid.uuid4())
    service_name = (req.service_name or req.name or "").strip()
    if not service_name:
        raise HTTPException(status_code=400, detail="Missing service_name")

    new_sub = {
        "_id": sub_id,
        "user_id": user_id,
        "name": service_name,
        "service_name": service_name,
        "amount": req.amount,
        "billing_cycle": req.billing_cycle or "monthly",
        "next_debit_date": datetime.datetime.fromisoformat(req.next_debit_date.replace("Z", "+00:00")),
        "is_active": True if req.is_active is None else req.is_active,
        "detected_from": req.detected_from or "manual",
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

    desired_status = req.get("is_active")
    new_status = desired_status if isinstance(desired_status, bool) else not sub.get("is_active", True)
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
