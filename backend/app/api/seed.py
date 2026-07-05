import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user

router = APIRouter()


@router.post("")
@router.post("/")
async def seed_demo_environment(user_id: str = Depends(get_current_user)):
    if not settings.DEMO_MODE:
        raise HTTPException(status_code=404, detail="Demo seeding is disabled.")

    db = get_db()
    now = datetime.datetime.utcnow()
    await db.profiles.update_one(
        {"_id": user_id},
        {
            "$set": {
                "demo_seeded_at": now,
                "demo_seed_version": "2026-06-14-campus-food-v1",
            }
        },
        upsert=False,
    )
    return {
        "status": "ok",
        "message": "Demo environment initialized",
        "seed_version": "2026-06-14-campus-food-v1",
    }
