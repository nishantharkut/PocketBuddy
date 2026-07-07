import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Literal, Optional
from app.core.database import get_db
from app.core.privacy import connector_token_hash, connector_token_preview
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
    mess_billing_model: Optional[Literal["none", "included", "monthly", "per_meal"]] = None
    mess_monthly_cost: Optional[int] = Field(default=None, ge=0, le=5_000_000)
    mess_per_meal_cost: Optional[int] = Field(default=None, ge=0, le=100_000)
    mess_meals_per_day: Optional[int] = Field(default=None, ge=1, le=4)
    exam_safety_buffer: Optional[int] = Field(default=None, ge=0, le=5_000_000)
    meal_schedule: Optional[dict] = None
    upi_apps_used: Optional[list[str]] = None
    onboarding_completed: Optional[bool] = None
    setup_completed: Optional[bool] = None
    pairing_code: Optional[str] = None
    upi_id: Optional[str] = None
    phone: Optional[str] = None
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
    user = await db.users.find_one({"_id": user_id})
    if user:
        profile["phone"] = user.get("phone_number", "")
    return map_doc(profile)

@router.post("")
async def update_profile(req: ProfileUpdateReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    updates = req.model_dump(exclude_unset=True)
    now = datetime.datetime.utcnow()
    
    if "phone" in updates:
        phone_val = updates.pop("phone")
        if phone_val:
            await db.users.update_one({"_id": user_id}, {"$set": {"phone_number": phone_val}})

    if not updates:
        profile = await db.profiles.find_one({"_id": user_id})
        user = await db.users.find_one({"_id": user_id})
        if user and profile:
            profile["phone"] = user.get("phone_number", "")
        return map_doc(profile)

    pairing_code_supplied = "pairing_code" in updates
    unset_updates = {}

    if pairing_code_supplied:
        supplied_pairing_code = updates.pop("pairing_code")
        updates["pairing_code_updated_at"] = now
        if supplied_pairing_code:
            updates["pairing_code_hash"] = connector_token_hash(supplied_pairing_code)
            updates["pairing_code_preview"] = connector_token_preview(supplied_pairing_code)
            updates["pairing_token_version"] = 2
            unset_updates["pairing_code"] = ""
        else:
            unset_updates["pairing_code"] = ""
            unset_updates["pairing_code_hash"] = ""
            unset_updates["pairing_code_preview"] = ""
            unset_updates["pairing_token_version"] = ""

    if updates.get("companion_paired") is False:
        updates.setdefault("companion_device_name", None)
        updates.setdefault("companion_last_sync", None)
        updates.setdefault("companion_device_id", None)
        updates.setdefault("companion_device_fingerprint", None)
        if not pairing_code_supplied:
            updates["pairing_code_updated_at"] = now
            unset_updates["pairing_code"] = ""
            unset_updates["pairing_code_hash"] = ""
            unset_updates["pairing_code_preview"] = ""
            unset_updates["pairing_token_version"] = ""

    mongo_update = {}
    if updates:
        mongo_update["$set"] = updates
    if unset_updates:
        mongo_update["$unset"] = unset_updates
    if mongo_update:
        await db.profiles.update_one({"_id": user_id}, mongo_update)

    if "companion_sync_enabled" in updates:
        await db.data_consents.update_many(
            {
                "user_id": user_id,
                "source": "android_connector",
                "status": {"$ne": "revoked"},
            },
            {
                "$set": {
                    "status": "active" if updates["companion_sync_enabled"] else "paused",
                    "last_user_control_at": now,
                    "updated_at": now,
                }
            },
        )

    if updates.get("companion_paired") is False and not pairing_code_supplied:
        await db.data_consents.update_many(
            {
                "user_id": user_id,
                "source": "android_connector",
                "status": {"$ne": "revoked"},
            },
            {
                "$set": {
                    "status": "revoked",
                    "revoked_at": now,
                    "last_user_control_at": now,
                    "updated_at": now,
                }
            },
        )

    profile = await db.profiles.find_one({"_id": user_id})
    user = await db.users.find_one({"_id": user_id})
    if user and profile:
        profile["phone"] = user.get("phone_number", "")
    return map_doc(profile)

@router.post("/delete-account")
async def delete_account(user_id: str = Depends(get_current_user)):
    db = get_db()
    # Cascade delete all data for this user
    await db.transactions.delete_many({"user_id": user_id})
    await db.subscriptions.delete_many({"user_id": user_id})
    await db.companion_sync_log.delete_many({"user_id": user_id})
    await db.data_consents.delete_many({"user_id": user_id})
    await db.aa_sync_events.delete_many({"user_id": user_id})
    await db.aa_financial_snapshots.delete_many({"user_id": user_id})
    await db.parser_corrections.delete_many({"user_id": user_id})
    await db.checkin_logs.delete_many({"user_id": user_id})
    await db.travel_savings.delete_many({"user_id": user_id})
    await db.travel_reports.delete_many({"user_id": user_id})
    await db.travel_pools.update_many(
        {"host_id": {"$ne": user_id}},
        {"$pull": {"co_passengers": {"user_id": user_id}, "splits": {"user_id": user_id}}},
    )
    await db.travel_pools.delete_many({"host_id": user_id})
    
    # Clean up cart items from pools hosted by this user
    user_pools_cursor = db.cart_pools.find({"host_id": user_id}, {"_id": 1})
    user_pools = await user_pools_cursor.to_list(length=1000)
    user_pool_ids = [p["_id"] for p in user_pools]
    if user_pool_ids:
        await db.cart_pool_items.delete_many({"pool_id": {"$in": user_pool_ids}})
    # Legacy cart pools store guest participants by display name only. Do not delete
    # cross-pool rows by name here; names are not stable identifiers and can collide
    # between unrelated students. Hosted pools are fully removed above.
    await db.cart_pools.delete_many({"host_id": user_id})
    
    await db.profiles.delete_one({"_id": user_id})
    await db.users.delete_one({"_id": user_id})
    
    return {"status": "ok", "message": "Account deleted successfully"}
