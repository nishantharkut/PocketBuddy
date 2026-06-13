from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import re
import uuid
import datetime
from typing import Optional
from app.core.database import get_db

router = APIRouter()

class WebhookReq(BaseModel):
    user_id: str
    pairing_code: Optional[str] = None
    body: str
    source: Optional[str] = None
    type: Optional[str] = None
    device_name: Optional[str] = None

def parse_upi_body(text: str):
    amount = None
    merchant = None
    
    amt_match = re.search(r'(?:RS\.?|INR)\s*([0-9,]+(?:\.[0-9]{2})?)', text, re.IGNORECASE)
    if amt_match:
        amount = int(round(float(amt_match.group(1).replace(',', '')) * 100))
        
    to_match = re.search(r'(?:sent\s+)?(?:to|at)\s+([A-Z0-9_\- ]{3,40})', text, re.IGNORECASE)
    if to_match:
        merchant = to_match.group(1).strip().replace(' ', '_')[:80]
        
    upi_match = re.search(r'UPI/([A-Z0-9_\-]+)', text, re.IGNORECASE)
    if not merchant and upi_match:
        merchant = upi_match.group(1)
        
    return amount, merchant

def detect_subscription(merchant: str):
    subs = ['spotify', 'netflix', 'youtube', 'prime', 'xbox', 'playstation', 'adobe']
    if not merchant: return None
    low = merchant.lower()
    for s in subs:
        if s in low:
            return s.capitalize()
    return None

@router.post("/")
async def ingest_notification(req: WebhookReq):
    db = get_db()
    
    profile = await db.profiles.find_one({"_id": req.user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
        
    if profile.get("pairing_code") and req.pairing_code and profile["pairing_code"] != req.pairing_code:
        raise HTTPException(status_code=403, detail="Invalid pairing code")
        
    amount, merchant = parse_upi_body(req.body)
    
    if not amount or not merchant:
        return {"status": "parse_failed"}
        
    md = await db.merchant_directory.find_one({"raw_string": merchant})
    
    txn_id = str(uuid.uuid4())
    new_txn = {
        "_id": txn_id,
        "user_id": req.user_id,
        "amount": amount,
        "raw_merchant_string": merchant,
        "mapped_merchant_name": md["display_name"] if md else None,
        "category": md["category"] if md else None,
        "is_mapped": bool(md),
        "source": "companion_notification",
        "raw_notification_body": req.body,
        "created_at": datetime.datetime.utcnow()
    }
    
    await db.transactions.insert_one(new_txn)
    
    await db.profiles.update_one(
        {"_id": req.user_id},
        {"$set": {
            "companion_paired": True,
            "companion_device_name": req.device_name or "Companion",
            "companion_last_sync": datetime.datetime.utcnow()
        }}
    )
    
    # Auto-detect subscription
    sub_name = detect_subscription(merchant)
    if sub_name:
        # Check if already exists
        existing_sub = await db.subscriptions.find_one({"user_id": req.user_id, "name": sub_name})
        if not existing_sub:
            next_month = datetime.datetime.utcnow() + datetime.timedelta(days=30)
            await db.subscriptions.insert_one({
                "_id": str(uuid.uuid4()),
                "user_id": req.user_id,
                "name": sub_name,
                "amount": amount,
                "billing_cycle": "monthly",
                "next_debit_date": next_month,
                "is_active": True,
                "detected_from": "auto_detected",
                "created_at": datetime.datetime.utcnow()
            })
            
    return {"status": "ok", "transaction_id": txn_id}
