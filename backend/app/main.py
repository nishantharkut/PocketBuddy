from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from app.core.config import settings

from app.api import (
    account_aggregator,
    auth,
    campus_food,
    catalog,
    checkins,
    companion,
    insights,
    pools,
    profile,
    rag,
    seed,
    subscriptions,
    transactions,
    webhook,
    travel,
)

app = FastAPI(title="PocketBuddy API")

def cors_origins() -> list[str]:
    configured = [
        origin.strip()
        for origin in (settings.CORS_ALLOW_ORIGINS or "").split(",")
        if origin.strip()
    ]
    if configured:
        return configured
    return [
        settings.FRONTEND_BASE_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(catalog.router, prefix="/api/catalog", tags=["catalog"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(pools.router, prefix="/api/cart-pools", tags=["pools"])
app.include_router(checkins.router, prefix="/api/checkins", tags=["checkins"])
app.include_router(companion.router, prefix="/api/companion", tags=["companion"])
app.include_router(account_aggregator.router, prefix="/api/account-aggregator", tags=["account-aggregator"])
app.include_router(rag.router, prefix="/api/rag", tags=["rag"])
app.include_router(campus_food.router, prefix="/api/campus-food", tags=["campus-food"])
app.include_router(seed.router, prefix="/api/seed", tags=["seed"])
app.include_router(insights.router, prefix="/api/insights", tags=["insights"])
app.include_router(travel.router, prefix="/api/travel", tags=["travel"])
app.include_router(webhook.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(webhook.router, prefix="/webhook", tags=["webhook"])

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
