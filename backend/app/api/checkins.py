from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
import uuid
import datetime
from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter()

class CheckinReq(BaseModel):
    response: str
    gap_hours: Optional[float] = None
    food_gap_hours: Optional[float] = None
    suggestion_given: Optional[str] = None
    stress_note: Optional[str] = None

@router.post("")
async def insert_checkin(req: CheckinReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    thirty_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=30)
    await db.checkin_logs.delete_many({"user_id": user_id, "created_at": {"$lt": thirty_days_ago}})

    log_id = str(uuid.uuid4())
    gap_hours = req.gap_hours if req.gap_hours is not None else req.food_gap_hours
    await db.checkin_logs.insert_one({
        "_id": log_id,
        "user_id": user_id,
        "response": req.response,
        "gap_hours": gap_hours or 0,
        "food_gap_hours": gap_hours or 0,
        "suggestion_given": req.suggestion_given,
        "stress_note": req.stress_note,
        "created_at": datetime.datetime.utcnow()
    })
    return {"status": "ok", "id": log_id}
