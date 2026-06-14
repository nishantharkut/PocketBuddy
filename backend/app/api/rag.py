import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user
from app.core.database import get_db
from app.services.campus_food import load_campus_food

router = APIRouter()
logger = logging.getLogger(__name__)


class RagReq(BaseModel):
    days_left: int
    remaining_budget: float
    spent_today: float


@router.post("/food-rag")
async def get_food_recommendation(req: RagReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.campus_food.find({})
    campus_foods = await cursor.to_list(length=1000)
    if not campus_foods:
        campus_foods = load_campus_food()
        
    fallback = build_local_recommendation(req, campus_foods)

    if not settings.BEDROCK_ENABLED:
        return {**fallback, "source": "local_fallback"}

    try:
        import boto3

        client = boto3.client(
            service_name="bedrock-runtime",
            region_name=settings.AWS_REGION,
        )

        prompt = f"""
        You are an AI financial assistant for a college student.
        The student has {req.days_left} days left in their cycle, Rs {req.remaining_budget:.0f} remaining,
        and has spent Rs {req.spent_today:.0f} today.

        Available campus food options are JSON objects where price is in paise:
        {json.dumps(campus_foods[:20], indent=2)}

        Analyze their runway and suggest exactly one cost-effective food option from the list.
        Provide a very short, encouraging 2-sentence response telling them what to eat and why it fits their tight budget.
        """

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 150,
            "messages": [{"role": "user", "content": prompt}],
        })

        response = client.invoke_model(
            body=body,
            modelId=settings.BEDROCK_MODEL_ID,
            accept="application/json",
            contentType="application/json",
        )

        res_body = json.loads(response.get("body").read())
        recommendation = res_body.get("content")[0].get("text")

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
            import boto3, json as _json

            cursor_food = db.campus_food.find({})
            campus_foods = await cursor_food.to_list(length=20)
            if not campus_foods:
                campus_foods = load_campus_food()[:5]

            client = boto3.client("bedrock-runtime", region_name=settings.AWS_REGION)
            prompt = f"""You are PocketBuddy, an AI financial wellness guard for Indian college students.
Student context:
- Spent Rs {spend_7:.0f} in last 7 days
- Remaining budget: Rs {remaining:.0f}
- Last food transaction: {last_food_hours:.0f} hours ago
- Campus food options: {_json.dumps([{"venue": f.get("venue_name"), "item": f.get("item_name"), "price_rs": f.get("price", 0)//100} for f in campus_foods[:5]], indent=None)}

Generate exactly 2 concise, specific, actionable sentences as a campus financial intelligence summary. Be direct, mention real numbers. No emojis."""

            body = _json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 120,
                "messages": [{"role": "user", "content": prompt}],
            })
            response = client.invoke_model(body=body, modelId=settings.BEDROCK_MODEL_ID, accept="application/json", contentType="application/json")
            res_body = _json.loads(response.get("body").read())
            text = res_body.get("content", [{}])[0].get("text", "")
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

