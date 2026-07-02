import json
import logging
import datetime
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user
from app.core.database import get_db
from app.services.campus_food import load_campus_food
from app.services.bedrock import generate_text
from app.services.runway import build_runway_forecast, derive_pool_obligations
from app.services.subscriptions import detect_recurring_subscriptions

router = APIRouter()
logger = logging.getLogger(__name__)


class RagReq(BaseModel):
    days_left: int
    remaining_budget: float
    spent_today: float


@router.post("/food-rag")
async def get_food_recommendation(req: RagReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.campus_food.find({"status": {"$nin": ["pending_verification", "rejected"]}})
    campus_foods = await cursor.to_list(length=1000)
    if not campus_foods:
        campus_foods = load_campus_food()

    fallback = build_local_recommendation(req, campus_foods)

    if not settings.BEDROCK_ENABLED:
        return {**fallback, "source": "local_fallback"}

    try:
        prompt = f"""
        You are an AI financial assistant for a college student.
        The student has {req.days_left} days left in their cycle, Rs {req.remaining_budget:.0f} remaining,
        and has spent Rs {req.spent_today:.0f} today.

        Available campus food options are JSON objects where price is in paise:
        {json.dumps(campus_foods[:20], indent=2)}

        Analyze their runway and suggest exactly one cost-effective food option from the list.
        Provide a very short, encouraging 2-sentence response telling them what to eat and why it fits their tight budget.
        """

        recommendation = generate_text(prompt, max_tokens=150, temperature=0.25)

        return {
            "recommendation": recommendation,
            "source": "bedrock",
            "fallback": fallback["recommendation"],
        }

    except Exception as exc:
        logger.warning("Bedrock recommendation failed; using local fallback: %s", exc)
        return {**fallback, "source": "local_fallback", "bedrock_error": "unavailable"}


def build_local_recommendation(req: RagReq, campus_foods: list[dict]) -> dict:
    if not campus_foods:
        return {
            "recommendation": "No campus food data is available yet.",
            "item": None,
        }

    daily_budget = max(0, req.remaining_budget / max(req.days_left, 1))
    candidates = sorted(campus_foods, key=lambda item: item.get("price", 0))
    affordable = [
        item for item in candidates if (item.get("price", 0) / 100) <= max(daily_budget, 50)
    ]
    item = (affordable or candidates)[0]
    price_rupees = item.get("price", 0) / 100
    venue_name = item.get("venue_name", "campus canteen")
    item_name = item.get("item_name", "a low-cost meal")

    return {
        "recommendation": (
            f"Try {item_name} at {venue_name} for Rs {price_rupees:.0f}. "
            f"It keeps today's food spend inside a Rs {daily_budget:.0f}/day runway."
        ),
        "item": item,
    }


@router.get("/campus-intel")
async def get_campus_intel(user_id: str = Depends(get_current_user)):
    """Returns a short AI-generated or local-fallback campus intelligence blurb for the dashboard."""
    import datetime
    db = get_db()

    profile = await db.profiles.find_one({"_id": user_id})

    # Basic spending stats
    since_7 = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    cursor = db.transactions.find({"user_id": user_id, "created_at": {"$gte": since_7}})
    txns = await cursor.to_list(length=500)
    spend_7 = sum(t.get("amount", 0) for t in txns) / 100
    food_txns = [t for t in txns if t.get("category") == "food"]
    last_food_hours = 0
    if food_txns:
        last_food = max(food_txns, key=lambda t: t.get("created_at", datetime.datetime.min))
        last_food_hours = (datetime.datetime.utcnow() - last_food["created_at"]).total_seconds() / 3600

    remaining = (profile.get("monthly_allowance", 0) / 100) if profile else 0

    # Try Bedrock
    if settings.BEDROCK_ENABLED:
        try:
            cursor_food = db.campus_food.find({"status": {"$nin": ["pending_verification", "rejected"]}})
            campus_foods = await cursor_food.to_list(length=20)
            if not campus_foods:
                campus_foods = load_campus_food()[:5]

            prompt = f"""You are PocketBuddy, an AI financial wellness guard for Indian college students.
Student context:
- Spent Rs {spend_7:.0f} in last 7 days
- Remaining budget: Rs {remaining:.0f}
- Last food transaction: {last_food_hours:.0f} hours ago
- Campus food options: {json.dumps([{"venue": f.get("venue_name"), "item": f.get("item_name"), "price_rs": f.get("price", 0)//100} for f in campus_foods[:5]], indent=None)}

Generate exactly 2 concise, specific, actionable sentences as a campus financial intelligence summary. Be direct, mention real numbers. No emojis."""

            text = generate_text(prompt, max_tokens=120, temperature=0.2)
            if text:
                return {"summary": text, "source": "bedrock", "spend_7d": spend_7, "last_food_hours": round(last_food_hours, 1)}
        except Exception as exc:
            logger.warning("Bedrock campus-intel failed: %s", exc)

    # Local fallback
    parts = []
    if spend_7 > 0:
        parts.append(f"You've spent ₹{spend_7:.0f} in the last 7 days.")
    if last_food_hours > 8:
        parts.append(f"Your last food transaction was {last_food_hours:.0f} hours ago — consider eating soon.")
    elif last_food_hours > 0:
        parts.append(f"Last meal logged {last_food_hours:.0f} hours ago, you're on track.")
    if remaining > 0:
        parts.append(f"₹{remaining:.0f} remaining in your current cycle.")
    summary = " ".join(parts) if parts else "Start logging transactions to activate campus intelligence."
    return {"summary": summary, "source": "local_fallback", "spend_7d": spend_7, "last_food_hours": round(last_food_hours, 1)}


@router.get("/runway-intel")
async def get_runway_intel(user_id: str = Depends(get_current_user)):
    """Returns a short AI-generated or local-fallback runway intelligence summary."""
    db = get_db()
    now = datetime.datetime.utcnow()
    profile = await db.profiles.find_one({"_id": user_id}) or {}

    # Trigger subscription recurrence detection
    await detect_recurring_subscriptions(db, user_id)

    # Fetch last 120 days of transaction history
    history_start = now - datetime.timedelta(days=120)
    transactions = await db.transactions.find(
        {"user_id": user_id, "created_at": {"$gte": history_start}}
    ).sort("created_at", 1).to_list(length=5000)

    # Fetch active subscriptions
    subscriptions = await db.subscriptions.find(
        {"user_id": user_id, "is_active": {"$ne": False}}
    ).to_list(length=250)

    # Fetch name and pooling context
    user = await db.users.find_one({"_id": user_id}) or {}
    full_name = str(user.get("full_name") or "").strip()
    pool_ids: set[str] = set()
    if full_name:
        name_regex = re.compile(f"^{re.escape(full_name)}$", re.IGNORECASE)
        user_items = await db.cart_pool_items.find({"added_by_name": name_regex}).to_list(length=1000)
        pool_ids.update(str(item.get("pool_id")) for item in user_items if item.get("pool_id"))

    hosted = await db.cart_pools.find(
        {"host_id": user_id, "status": {"$in": ["open", "closed", "completed"]}}
    ).to_list(length=250)
    pool_ids.update(str(pool.get("_id")) for pool in hosted)

    pools = []
    pool_items = []
    if pool_ids:
        pools = await db.cart_pools.find({"_id": {"$in": list(pool_ids)}}).to_list(length=500)
        pool_items = await db.cart_pool_items.find({"pool_id": {"$in": list(pool_ids)}}).to_list(length=2500)

    obligations = derive_pool_obligations(
        pools,
        pool_items,
        user_id=user_id,
        user_name=full_name,
        now=now,
    )

    forecast = build_runway_forecast(
        profile=profile,
        transactions=transactions,
        subscriptions=subscriptions,
        pool_obligations=obligations,
        now=now,
    )

    status = forecast.get("status")
    days_left = forecast["current_cycle"]["days_left"]
    broke_days = forecast["projection"]["days_until_broke"]
    shortfall_prob = forecast["projection"]["shortfall_probability"]
    safe_daily = forecast["projection"]["safe_daily_spend"] // 100
    projected_daily = forecast["projection"]["projected_daily_spend"] // 100
    ask_amount = forecast["projection"]["ask_home_amount"] // 100
    commitments_total = forecast["commitments"]["total"] // 100
    remaining = forecast["current_cycle"]["remaining"] // 100

    # Build local fallback
    if status == "shortfall":
        fallback_summary = (
            f"Based on your current spending pace, you will run out of allowance in {broke_days} days "
            f"({days_left - broke_days} days before the cycle ends). "
            f"We recommend asking home for ₹{ask_amount:,} to cover your shortfall and reducing discretionary expenses."
        )
    elif status == "watch" or shortfall_prob >= 0.35:
        fallback_summary = (
            f"Your remaining runway is tight (shortfall probability: {shortfall_prob * 100:.0f}%). "
            f"Try to keep daily discretionary spending under ₹{safe_daily}, as your current projected pace is ₹{projected_daily}/day."
        )
    else:
        fallback_summary = (
            f"Great job! You're on track to finish this cycle with a healthy balance. "
            f"You have ₹{safe_daily}/day safe limit left. Maintain your pace of ₹{projected_daily}/day to stay green."
        )

    # Try Bedrock
    if settings.BEDROCK_ENABLED:
        try:
            prompt = f"""You are PocketBuddy, an AI financial wellness advisor for college students.
Here is the student's runway forecast details:
- Cycle days left: {days_left} days
- Safe daily spend limit: Rs {safe_daily}
- Current daily spend pace (EWMA): Rs {projected_daily}
- Forecast status: {status.upper()}
- Shortfall probability: {shortfall_prob * 100:.0f}%
- Days until broke: {broke_days} (out of {days_left} days left)
- Ask home amount needed: Rs {ask_amount}
- Upcoming commitments total: Rs {commitments_total}

Generate exactly 2 concise, highly personalized, and action-oriented sentences. Be direct, address the student directly, reference their specific numbers, and suggest concrete actions (e.g. eat at mess, join pool, negotiate travel fares, or budget request home). No emojis. No preamble."""

            text = generate_text(prompt, max_tokens=150, temperature=0.25)
            if text:
                return {"summary": text, "source": "bedrock"}
        except Exception as exc:
            logger.warning("Bedrock runway-intel failed: %s", exc)

    return {"summary": fallback_summary, "source": "local_fallback"}

