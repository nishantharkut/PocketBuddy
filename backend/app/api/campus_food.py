import uuid
from fastapi import APIRouter
from app.core.database import get_db
from app.core.security import map_docs
from app.services.campus_food import load_campus_food

router = APIRouter()


@router.get("")
@router.get("/")
async def get_campus_food():
    db = get_db()
    cursor = db.campus_food.find({})
    items = await cursor.to_list(length=1000)
    
    if not items:
        raw_items = load_campus_food()
        if raw_items:
            for item in raw_items:
                item["_id"] = item.pop("id", None) or str(uuid.uuid4())
            await db.campus_food.insert_many(raw_items)
            items = raw_items
            
    return map_docs(items)
