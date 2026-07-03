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
    fullName: str | None = None

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
        "full_name": req.fullName or "",
        "created_at": datetime.datetime.utcnow()
    })
    
    await db.profiles.insert_one({
        "_id": user_id,
        "email": req.email,
        "monthly_allowance": 1000000,
        "cycle_start_day": 1,
        "mess_billing_model": "none",
        "mess_monthly_cost": 0,
        "mess_per_meal_cost": 0,
        "mess_meals_per_day": 2,
        "exam_safety_buffer": 0,
        "companion_paired": False,
        "created_at": datetime.datetime.utcnow()
    })
    
    token = jwt.encode({"userId": user_id}, settings.JWT_SECRET, algorithm="HS256")
    return {
        "sessionToken": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "fullName": req.fullName or ""
        }
    }

@router.post("/login")
async def login(req: AuthReq):
    db = get_db()
    user = await db.users.find_one({"email": req.email})
    # Safely retrieve password hash; if missing, treat as invalid credentials
    password_hash = user.get("password") if user else None
    if not user or not password_hash or not bcrypt.checkpw(req.password.encode('utf-8'), password_hash.encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = jwt.encode({"userId": user["_id"]}, settings.JWT_SECRET, algorithm="HS256")
    return {
        "sessionToken": token,
        "user": {
            "id": user["_id"],
            "email": user["email"],
            "fullName": user.get("full_name", "")
        }
    }

@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)):
    db = get_db()
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": {"id": user["_id"], "email": user.get("email", ""), "fullName": user.get("full_name", "")}}

class PhoneAuthReq(BaseModel):
    phone: str
    fullName: str | None = None

@router.post("/login/phone")
async def login_phone(req: PhoneAuthReq):
    db = get_db()
    user = await db.users.find_one({"phone_number": req.phone})
    if not user:
        # For demo purposes, auto-signup user on first phone login
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "_id": user_id,
            "phone_number": req.phone,
            "full_name": req.fullName or "Student",
            "created_at": datetime.datetime.utcnow()
        })
        await db.profiles.insert_one({
            "_id": user_id,
            "phone_number": req.phone,
            "monthly_allowance": 1000000,
            "cycle_start_day": 1,
            "mess_billing_model": "none",
            "mess_monthly_cost": 0,
            "mess_per_meal_cost": 0,
            "mess_meals_per_day": 2,
            "exam_safety_buffer": 0,
            "companion_paired": False,
            "created_at": datetime.datetime.utcnow()
        })
        user = await db.users.find_one({"_id": user_id})

    token = jwt.encode({"userId": user["_id"]}, settings.JWT_SECRET, algorithm="HS256")
    return {
        "sessionToken": token,
        "user": {
            "id": user["_id"],
            "email": user.get("email", ""),
            "fullName": user.get("full_name", ""),
            "phone": user.get("phone_number", "")
        }
    }

class LogoutReq(BaseModel):
    token: str

@router.post("/logout")
async def logout(req: LogoutReq):
    # In a fully stateless JWT architecture, the client just drops the token.
    # To actually invalidate, we'd need a token blacklist in DB/Redis.
    # We simply return success so the frontend request succeeds.
    return {"success": True}
