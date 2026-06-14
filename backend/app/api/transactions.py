from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import uuid
import datetime
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs
from app.services.subscriptions import (
    clean_merchant_name,
    next_future_debit,
    subscription_name_for_merchant,
    upsert_subscription,
)

router = APIRouter()

class TxnReq(BaseModel):
    amount: int
    raw_merchant_string: str
    category: Optional[str] = None
    source: str = "manual"
    is_mapped: bool = True
    mapped_merchant_name: Optional[str] = None

class IdentifyReq(BaseModel):
    category: str
    display_name: str

class UpdateTxnReq(BaseModel):
    mapped_merchant_name: Optional[str] = None
    category: Optional[str] = None

def clean_transaction_label(value: str, field_name: str, max_length: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} cannot be empty")
    if len(cleaned) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} is too long")
    return cleaned

@router.get("")
async def get_transactions(user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.transactions.find({"user_id": user_id}).sort("created_at", -1)
    txns = await cursor.to_list(length=1000)
    return map_docs(txns)

@router.post("")
async def insert_transaction(req: TxnReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    txn_id = str(uuid.uuid4())
    
    new_txn = {
        "_id": txn_id,
        "user_id": user_id,
        "amount": req.amount,
        "raw_merchant_string": req.raw_merchant_string,
        "mapped_merchant_name": req.mapped_merchant_name or req.raw_merchant_string,
        "category": req.category or "other",
        "source": req.source,
        "is_mapped": req.is_mapped,
        "created_at": datetime.datetime.utcnow()
    }
    
    await db.transactions.insert_one(new_txn)
    merchant = new_txn["mapped_merchant_name"] or new_txn["raw_merchant_string"]
    service_name = subscription_name_for_merchant(merchant)
    if new_txn["category"] == "subscription" or service_name:
        service_name = service_name or clean_merchant_name(merchant)
        if service_name:
            await upsert_subscription(
                db,
                user_id=user_id,
                service_name=service_name,
                amount_paise=new_txn["amount"],
                next_debit_date=next_future_debit(new_txn["created_at"], 30),
                detected_from="manual_transaction",
                observed_at=new_txn["created_at"],
                observed_interval_days=30,
            )
    return map_doc(new_txn)

@router.post("/delete-recent")
async def delete_recent(req: dict, user_id: str = Depends(get_current_user)):
    db = get_db()
    start_date = req.get("startDate")
    if not start_date:
        raise HTTPException(status_code=400, detail="Missing startDate")
        
    dt = datetime.datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    result = await db.transactions.delete_many({
        "user_id": user_id,
        "created_at": {"$gte": dt}
    })
    return {"status": "ok", "deleted_count": result.deleted_count}

@router.post("/{txn_id}/identify")
async def identify_merchant(txn_id: str, req: IdentifyReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    txn = await db.transactions.find_one({"_id": txn_id, "user_id": user_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    raw_string = txn["raw_merchant_string"]
    display_name = clean_transaction_label(req.display_name, "Display name", 80)
    category = clean_transaction_label(req.category, "Category", 40)
    
    # Update directory
    await db.merchant_directory.update_one(
        {"raw_string": raw_string},
        {"$set": {
            "display_name": display_name,
            "category": category,
            "verified": True,
            "updated_at": datetime.datetime.utcnow()
        }},
        upsert=True
    )
    
    # Retroactively update all txns for this user with the same raw string
    await db.transactions.update_many(
        {"user_id": user_id, "raw_merchant_string": raw_string},
        {"$set": {
            "is_mapped": True,
            "mapped_merchant_name": display_name,
            "category": category
        }}
    )
    
    return {"status": "ok"}

@router.patch("/{txn_id}")
async def update_transaction(txn_id: str, req: UpdateTxnReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    txn = await db.transactions.find_one({"_id": txn_id, "user_id": user_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    update_data = {}
    if req.mapped_merchant_name is not None:
        update_data["mapped_merchant_name"] = clean_transaction_label(
            req.mapped_merchant_name,
            "Display name",
            80,
        )
        update_data["is_mapped"] = True
    if req.category is not None:
        update_data["category"] = clean_transaction_label(req.category, "Category", 40)
        
    if update_data:
        await db.transactions.update_one(
            {"_id": txn_id, "user_id": user_id},
            {"$set": update_data}
        )
    return {"status": "ok"}
