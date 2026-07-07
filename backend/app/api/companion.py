import datetime

from fastapi import APIRouter, Depends, Query

from app.core.database import get_db
from app.core.security import get_current_user, map_docs
from app.core.privacy import (
    connector_token_hash,
    connector_token_preview,
    generate_connector_pairing_token,
)

router = APIRouter()


@router.get("/logs")
async def get_companion_logs(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    db = get_db()
    cursor = db.companion_sync_log.find({"user_id": user_id}).sort("created_at", -1).limit(limit)
    logs = await cursor.to_list(length=limit)
    return map_docs(logs)

@router.post("/clear-logs")
async def clear_companion_logs(user_id: str = Depends(get_current_user)):
    db = get_db()
    result = await db.companion_sync_log.delete_many({"user_id": user_id})
    return {"status": "ok", "deleted_count": result.deleted_count}


@router.get("/consents")
async def get_data_consents(user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.data_consents.find({"user_id": user_id}).sort("updated_at", -1)
    consents = await cursor.to_list(length=100)
    return map_docs(consents)


@router.post("/pairing-token")
async def create_pairing_token(user_id: str = Depends(get_current_user)):
    db = get_db()
    token = generate_connector_pairing_token()
    now = datetime.datetime.utcnow()
    await db.profiles.update_one(
        {"_id": user_id},
        {
            "$set": {
                "pairing_code_hash": connector_token_hash(token),
                "pairing_code_preview": connector_token_preview(token),
                "pairing_code_updated_at": now,
                "pairing_token_version": 2,
            },
            "$unset": {
                "pairing_code": "",
            },
        },
    )
    return {
        "status": "ok",
        "pairing_token": token,
        "pairing_token_preview": connector_token_preview(token),
        "expires_hint": "Use this setup key only on your own Android connector. Generate a new one anytime.",
    }
