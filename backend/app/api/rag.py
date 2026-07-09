import json
import logging
import datetime
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user
from app.core.database import get_db
from app.services.campus_food import REVIEW_ONLY_STATUSES, build_food_recommendations, load_campus_food
from app.services.bedrock import generate_text
from app.services.runway import build_runway_forecast, derive_pool_obligations
from app.services.subscriptions import detect_recurring_subscriptions
from app.services.wellness import current_meal_gap_hours, meal_signal_events

router = APIRouter()
logger = logging.getLogger(__name__)


class RagReq(BaseModel):
    days_left: int
    remaining_budget: float
    spent_today: float


@router.post("/food-rag")
async def get_food_recommendation(req: RagReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.campus_food.find({
        "status": {"$nin": list(REVIEW_ONLY_STATUSES)}
    })
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

        Trusted, budget-aware campus food options are JSON objects where price is in paise:
        {json.dumps(fallback.get("ranked_options", [])[:5], indent=2)}

        Analyze their runway and suggest exactly one cost-effective food option from the list.
        Do not recommend any food option that is not present in the trusted options above.
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
            "ranked_options": [],
        }

    daily_budget = max(0, req.remaining_budget / max(req.days_left, 1))
    ranked_options = build_food_recommendations(
        campus_foods,
        now=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
        safe_food_budget_paise=int(max(daily_budget, 50) * 100),
        limit=5,
    )
    if not ranked_options:
        return {
            "recommendation": "No trusted campus food option is available yet. Use manual review before adding scanned menu items to recommendations.",
            "item": None,
            "ranked_options": [],
        }

    item = ranked_options[0]
    price_rupees = item.get("price", 0) / 100
    venue_name = item.get("venue_name", "campus canteen")
    item_name = item.get("item_name", "a low-cost meal")
    budget_line = (
        f"It keeps today's food spend inside a Rs {daily_budget:.0f}/day runway."
        if price_rupees <= max(daily_budget, 50)
        else f"It is the strongest trusted option, but it is above today's Rs {daily_budget:.0f}/day runway."
    )

    return {
        "recommendation": (
            f"Try {item_name} at {venue_name} for Rs {price_rupees:.0f}. "
            f"{budget_line}"
        ),
        "item": item,
        "ranked_options": ranked_options,
    }


@router.get("/campus-intel")
async def get_campus_intel(user_id: str = Depends(get_current_user)):
    """Returns a short AI-generated or local-fallback campus intelligence blurb for the dashboard."""
    import datetime
    db = get_db()

    profile = await db.profiles.find_one({"_id": user_id})

    # Basic spending stats
    now = datetime.datetime.utcnow()
    since_7 = now - datetime.timedelta(days=7)
    cursor = db.transactions.find({"user_id": user_id, "created_at": {"$gte": since_7}})
    txns = await cursor.to_list(length=500)
    spend_7 = sum(t.get("amount", 0) for t in txns) / 100
    food_txns = [t for t in txns if t.get("category") == "food"]
    checkins = await db.checkin_logs.find({
        "user_id": user_id,
        "created_at": {"$gte": since_7},
    }).sort("created_at", -1).to_list(length=500)
    meal_events = meal_signal_events(food_txns, checkins)
    last_food_hours = current_meal_gap_hours(now, meal_events, default=0.0)
    last_food_source = meal_events[-1]["source"] if meal_events else None

    remaining = (profile.get("monthly_allowance", 0) / 100) if profile else 0

    # Try Bedrock
    if settings.BEDROCK_ENABLED:
        try:
            cursor_food = db.campus_food.find({
                "status": {"$nin": list(REVIEW_ONLY_STATUSES)}
            })
            campus_foods = await cursor_food.to_list(length=1000)
            if not campus_foods:
                campus_foods = load_campus_food()
            safe_budget_paise = 15_000
            if profile:
                safe_budget_paise = int((profile.get("monthly_allowance", 0) or 0) / 30)
            ranked_foods = build_food_recommendations(
                campus_foods,
                now=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
                safe_food_budget_paise=safe_budget_paise,
                meal_gap_hours=last_food_hours,
                limit=5,
            )

            prompt = f"""You are PocketBuddy, a student budget and routine assistant for Indian college students.
Student context:
- Spent Rs {spend_7:.0f} in last 7 days
- Remaining budget: Rs {remaining:.0f}
- Last food payment/check-in signal: {last_food_hours:.0f} hours ago
- Trusted campus food options: {json.dumps([{"venue": f.get("venue_name"), "item": f.get("item_name"), "price_rs": f.get("price", 0)//100, "why": f.get("why"), "trust": f.get("trust_badge")} for f in ranked_foods[:5]], indent=None)}

Generate exactly 2 concise, specific, actionable sentences as a campus financial intelligence summary.
Be direct and mention real numbers.
Describe only budget and routine signals; do not infer illness, stress, sleep quality, or medical risk.
If you mention food, cite only trusted campus food options above.
No emojis. No preamble."""

            text = generate_text(prompt, max_tokens=120, temperature=0.2)
            if text:
                return {
                    "summary": text,
                    "source": "bedrock",
                    "spend_7d": spend_7,
                    "last_food_hours": round(last_food_hours, 1),
                    "last_food_signal_source": last_food_source,
                }
        except Exception as exc:
            logger.warning("Bedrock campus-intel failed: %s", exc)

    # Local fallback
    routine_parts = []
    if spend_7 > 0:
        routine_parts.append(f"You've spent Rs {spend_7:.0f} in the last 7 days.")
    if last_food_hours > 8:
        routine_parts.append(f"Your last meal signal was {last_food_hours:.0f} hours ago; log a meal or use a trusted campus option if needed.")
    elif last_food_hours > 0:
        routine_parts.append(f"Last meal signal was {last_food_hours:.0f} hours ago.")
    if remaining > 0:
        routine_parts.append(f"Rs {remaining:.0f} remaining in your current cycle.")
    summary = " ".join(routine_parts) if routine_parts else "Start logging transactions to activate campus intelligence."
    return {
        "summary": summary,
        "source": "local_fallback",
        "spend_7d": spend_7,
        "last_food_hours": round(last_food_hours, 1),
        "last_food_signal_source": last_food_source,
    }


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
    user_item_query: dict = {"added_by_user_id": user_id}
    if full_name:
        name_regex = re.compile(f"^{re.escape(full_name)}$", re.IGNORECASE)
        user_item_query = {
            "$or": [
                {"added_by_user_id": user_id},
                {"added_by_user_id": {"$exists": False}, "added_by_name": name_regex},
                {"added_by_user_id": None, "added_by_name": name_regex},
                {"added_by_user_id": "", "added_by_name": name_regex},
            ]
        }
    user_items = await db.cart_pool_items.find(user_item_query).to_list(length=1000)
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
    food_routine = forecast.get("food_routine") or {}
    decision_engine = forecast.get("decision_engine") or {}
    next_action = decision_engine.get("next_best_action") or forecast.get("action") or {}
    food_label = str(food_routine.get("label") or "Meal routine")
    food_pace = int(food_routine.get("food_daily_pace") or 0) // 100
    food_cap = int(food_routine.get("recommended_daily_food_cap") or 0) // 100
    next_action_title = str(next_action.get("title") or "Keep runway stable")
    next_action_detail = str(next_action.get("detail") or "Keep discretionary spend inside the safe daily limit.")
    decision_summary = str(decision_engine.get("summary") or "")
    pace_source = str((forecast.get("projection") or {}).get("pace_source") or "")
    stress_band = (forecast.get("projection") or {}).get("stress_band") or {}
    expected_days = int((stress_band.get("expected") or {}).get("days_until_broke") or broke_days)
    stress_days = int((stress_band.get("stress") or {}).get("days_until_broke") or broke_days)

    # Build local fallback
    if status == "setup_required":
        fallback_summary = (
            "Runway needs your allowance or an allowance credit before it can produce a trusted daily limit. "
            "Add funding in Settings or sync transactions first; no spending recommendation is shown yet."
        )
    elif next_action.get("type") == "pause_flexible":
        fallback_summary = (
            "There is no safe discretionary amount left after known spending and commitments. "
            "Pause flexible spending until reset, or add funding before making non-essential payments."
        )
    elif pace_source == "no_recent_history":
        fallback_summary = (
            f"Use Rs {safe_daily:,}/day only as a temporary cap because there is not enough recent spend history yet. "
            "Sync or add a few real payments before relying on pace-based suggestions."
        )
    elif status == "shortfall":
        fallback_summary = (
            f"Expected runway is {expected_days} days, with a stress case of {stress_days} days. "
            f"Ask home for Rs {ask_amount:,} and follow this next action: {next_action_detail}"
        )
    elif status == "watch" or shortfall_prob >= 0.35:
        fallback_summary = (
            f"Your remaining runway is tight (shortfall probability: {shortfall_prob * 100:.0f}%). "
            f"Keep daily spend under Rs {safe_daily}; your {food_label.lower()} is currently Rs {food_pace}/day against a suggested food cap of Rs {food_cap}/day."
        )
    else:
        fallback_summary = (
            f"You are on track to finish this cycle with a healthy balance. "
            f"Safe/day is Rs {safe_daily}; keep food near Rs {food_cap}/day and review any new pool or subscription commitments before spending."
        )

    # Try Bedrock
    if settings.BEDROCK_ENABLED:
        try:
            prompt = f"""You are PocketBuddy, a campus affordability explainer for college students.
Here is the student's runway forecast details:
- Cycle days left: {days_left} days
- Safe daily spend limit: Rs {safe_daily}
- Current daily spend pace (EWMA): Rs {projected_daily}
- Forecast status: {status.upper()}
- Shortfall probability: {shortfall_prob * 100:.0f}%
- Expected runway: {expected_days} days
- Stress-case runway: {stress_days} days
- Ask home amount needed: Rs {ask_amount}
- Upcoming commitments total: Rs {commitments_total}
- Meal routine: {food_label}
- Food pace: Rs {food_pace}/day
- Suggested food cap: Rs {food_cap}/day
- Decision engine summary: {decision_summary}
- Next best action: {next_action_title} — {next_action_detail}

Generate exactly 2 concise, personalized, and action-oriented sentences. Explain only the deterministic values above. Do not calculate new amounts. Do not invent amounts, dates, probabilities, contacts, merchant names, guarantees, or extra actions. No emojis. No preamble."""

            text = generate_text(prompt, max_tokens=150, temperature=0.25)
            if text:
                return {"summary": text, "source": "bedrock"}
        except Exception as exc:
            logger.warning("Bedrock runway-intel failed: %s", exc)

    return {"summary": fallback_summary, "source": "local_fallback"}
