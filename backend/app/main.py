from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from app.core.config import settings

from app.api import auth, profile, transactions, subscriptions, pools, webhook, checkins

app = FastAPI(title="PocketBuddy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(pools.router, prefix="/api/cart-pools", tags=["pools"])
app.include_router(checkins.router, prefix="/api/checkins", tags=["checkins"])
app.include_router(webhook.router, prefix="/webhook", tags=["webhook"])

@app.get("/api/campus-food")
async def get_campus_food():
    import os, json
    food_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'campus_food.json')
    try:
        with open(food_path, 'r') as f:
            return json.load(f)
    except Exception:
        return []

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
