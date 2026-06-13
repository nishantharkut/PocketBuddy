from fastapi import APIRouter

from app.services.campus_food import load_campus_food

router = APIRouter()


@router.get("")
@router.get("/")
async def get_campus_food():
    return load_campus_food()
