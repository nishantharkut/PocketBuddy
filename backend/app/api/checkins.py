from fastapi import APIRouter, Depends
from pydantic import BaseModel
import uuid
import datetime
from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter()

class CheckinReq(BaseModel):
    response: str
    gap_hours: float

@router.post("/")
async def insert_checkin(req: CheckinReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    log_id = str(uuid.uuid4())
    await db.checkin_logs.insert_one({
        "_id": log_id,
        "user_id": user_id,
        "response": req.response,
        "gap_hours": req.gap_hours,
        "created_at": datetime.datetime.utcnow()
    })
    return {"status": "ok", "id": log_id}
