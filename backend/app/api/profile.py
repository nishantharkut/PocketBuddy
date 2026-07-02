from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, map_doc

router = APIRouter()

class ProfileUpdateReq(BaseModel):
    monthly_allowance: Optional[int] = None
    cycle_start_day: Optional[int] = None
    college_name: Optional[str] = None
    hostel_block: Optional[str] = None
    wing_label: Optional[str] = None
    room_number: Optional[str] = None
    exam_start_date: Optional[str] = None
    exam_end_date: Optional[str] = None
    mess_enrolled: Optional[bool] = None
    meal_schedule: Optional[dict] = None
    upi_apps_used: Optional[list[str]] = None
    onboarding_completed: Optional[bool] = None
    setup_completed: Optional[bool] = None
    pairing_code: Optional[str] = None
    upi_id: Optional[str] = None
    companion_paired: Optional[bool] = None
    companion_device_name: Optional[str] = None
    companion_last_sync: Optional[str] = None
    companion_sync_enabled: Optional[bool] = None
    companion_device_id: Optional[str] = None

@router.get("")
async def get_profile(user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return map_doc(profile)

@router.post("")
async def update_profile(req: ProfileUpdateReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    updates = req.model_dump(exclude_unset=True)
    
    if not updates:
        profile = await db.profiles.find_one({"_id": user_id})
        return map_doc(profile)

    await db.profiles.update_one({"_id": user_id}, {"$set": updates})
    profile = await db.profiles.find_one({"_id": user_id})
    return map_doc(profile)

@router.post("/delete-account")
async def delete_account(user_id: str = Depends(get_current_user)):
    db = get_db()
    
    # Cascade delete all data for this user
    await db.transactions.delete_many({"user_id": user_id})
    await db.subscriptions.delete_many({"user_id": user_id})
    await db.companion_sync_log.delete_many({"user_id": user_id})
    await db.parser_corrections.delete_many({"user_id": user_id})
    await db.checkin_logs.delete_many({"user_id": user_id})
    await db.travel_savings.delete_many({"user_id": user_id})
    await db.cart_pools.delete_many({"host_id": user_id})
    await db.profiles.delete_one({"_id": user_id})
    await db.users.delete_one({"_id": user_id})
    
    return {"status": "ok", "message": "Account deleted successfully"}
