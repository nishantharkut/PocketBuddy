from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
import uuid
import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.wellness import MEAL_CHECKIN_RESPONSES, SKIPPED_MEAL_RESPONSES

router = APIRouter()

MEAL_SOURCES = {"mess", "cooked", "home", "outside_cash", "snack", "other"}

class CheckinReq(BaseModel):
    response: str
    gap_hours: Optional[float] = None
    food_gap_hours: Optional[float] = None
    suggestion_given: Optional[str] = None
    context_note: Optional[str] = None
    stress_note: Optional[str] = None
    meal_source: Optional[str] = None

@router.post("")
async def insert_checkin(req: CheckinReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    log_id = str(uuid.uuid4())
    gap_hours = req.gap_hours if req.gap_hours is not None else req.food_gap_hours
    response = (req.response or "").strip().lower()
    meal_source = (req.meal_source or "").strip().lower()
    if meal_source not in MEAL_SOURCES:
        meal_source = None
    note = (req.context_note if req.context_note is not None else req.stress_note or "").strip()
    if len(note) > 500:
        note = note[:500]
    is_meal_signal = response in MEAL_CHECKIN_RESPONSES or (
        bool(meal_source) and response not in SKIPPED_MEAL_RESPONSES
    )
    await db.checkin_logs.insert_one({
        "_id": log_id,
        "user_id": user_id,
        "response": response,
        "gap_hours": gap_hours or 0,
        "food_gap_hours": gap_hours or 0,
        "suggestion_given": req.suggestion_given,
        "context_note": note or None,
        "stress_note": note or None,
        "meal_source": meal_source,
        "is_meal_signal": is_meal_signal,
        "created_at": datetime.datetime.utcnow()
    })
    return {"status": "ok", "id": log_id}
