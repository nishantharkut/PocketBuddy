import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user
from app.services.campus_food import load_campus_food

router = APIRouter()
logger = logging.getLogger(__name__)


class RagReq(BaseModel):
    days_left: int
    remaining_budget: float
    spent_today: float


@router.post("/food-rag")
async def get_food_recommendation(req: RagReq, user_id: str = Depends(get_current_user)):
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
