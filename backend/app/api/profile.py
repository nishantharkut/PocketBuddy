from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, map_doc

router = APIRouter()

class ProfileUpdateReq(BaseModel):
    monthly_allowance: Optional[int] = None
    cycle_start_day: Optional[int] = None
    wing_label: Optional[str] = None
    setup_completed: Optional[bool] = None
    pairing_code: Optional[str] = None

@router.get("/")
async def get_profile(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return map_doc(profile)

@router.post("/")
async def update_profile(req: ProfileUpdateReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    updates = {k: v for k, v in req.dict(exclude_unset=True).items() if v is not None}
    
    if not updates:
        profile = await db.profiles.find_one({"_id": user_id})
        return map_doc(profile)

    await db.profiles.update_one({"_id": user_id}, {"$set": updates})
    profile = await db.profiles.find_one({"_id": user_id})
    return map_doc(profile)
