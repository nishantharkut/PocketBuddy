from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import uuid
import datetime
from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

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

@router.get("/")
async def get_transactions(user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.transactions.find({"user_id": user_id}).sort("created_at", -1)
    txns = await cursor.to_list(length=1000)
    return map_docs(txns)

@router.post("/")
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
    
    # Update directory
    await db.merchant_directory.update_one(
        {"raw_string": raw_string},
        {"$set": {
            "display_name": req.display_name,
            "category": req.category,
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
            "mapped_merchant_name": req.display_name,
            "category": req.category
        }}
    )
    
    return {"status": "ok"}
