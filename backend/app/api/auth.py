from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import bcrypt
import jwt
import uuid
import datetime
from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user

router = APIRouter()

class AuthReq(BaseModel):
    email: str
    password: str

@router.post("/signup")
async def signup(req: AuthReq):
    db = get_db()
    existing = await db.users.find_one({"email": req.email})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt())
    user_id = str(uuid.uuid4())
    
    await db.users.insert_one({
        "_id": user_id,
        "email": req.email,
        "password": hashed.decode('utf-8'),
        "created_at": datetime.datetime.utcnow()
    })
    
    await db.profiles.insert_one({
        "_id": user_id,
        "email": req.email,
        "monthly_allowance": 1000000,
        "cycle_start_day": 1,
        "companion_paired": False,
        "created_at": datetime.datetime.utcnow()
    })
    
    token = jwt.encode({"userId": user_id}, settings.JWT_SECRET, algorithm="HS256")
    return {"token": token}

@router.post("/login")
async def login(req: AuthReq):
    db = get_db()
    user = await db.users.find_one({"email": req.email})
    if not user or not bcrypt.checkpw(req.password.encode('utf-8'), user["password"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = jwt.encode({"userId": user["_id"]}, settings.JWT_SECRET, algorithm="HS256")
    return {"token": token}

@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)):
    db = get_db()
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": {"id": user["_id"], "email": user["email"]}}
