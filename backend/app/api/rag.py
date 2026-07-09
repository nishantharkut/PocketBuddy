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
from app.services.ai_guardrails import (
    EXTERNAL_FOOD_APP_TERMS,
    GroundingError,
    ai_response_metadata,
    validate_grounded_advice,
)
from app.services.bedrock import generate_json, generate_text
from app.services.runway import build_runway_forecast, cycle_bounds, derive_pool_obligations
from app.services.subscriptions import detect_recurring_subscriptions
from app.services.wellness import current_meal_gap_hours, meal_signal_events

router = APIRouter()
logger = logging.getLogger(__name__)


class RagReq(BaseModel):
    days_left: int
    remaining_budget: float
    spent_today: float


def _rounded_rupees(*values: float | int | None) -> list[float]:
    result = []
    for value in values:
        if value is None:
            continue
        try:
            result.append(round(float(value), 2))
        except (TypeError, ValueError):
            continue
    return result


def _trusted_food_prompt_options(options: list[dict]) -> list[dict]:
    return [
        {
            "venue": option.get("venue_name"),
            "item": option.get("item_name"),
            "price_rs": round((option.get("price", 0) or 0) / 100),
            "trust": option.get("trust_badge"),
            "why": option.get("why"),
        }
        for option in options
    ]


def _trusted_food_entities(options: list[dict]) -> list[str]:
    entities: list[str] = []
    for option in options:
        entities.extend([str(option.get("venue_name") or ""), str(option.get("item_name") or "")])
    return entities


def _trusted_food_rupees(options: list[dict]) -> list[float]:
    return [round((option.get("price", 0) or 0) / 100, 2) for option in options]


def _campus_food_option(option: dict | None) -> dict | None:
    if not option:
        return None
    return {
        "venue": option.get("venue_name"),
        "item": option.get("item_name"),
        "price_rs": round((option.get("price", 0) or 0) / 100),
        "trust": option.get("trust_badge"),
        "why": option.get("why"),
    }


def _doc_amount_paise(item: dict | None) -> int:
    if not item:
        return 0
    for key in ("amount", "amount_paise"):
        amount = item.get(key)
        if isinstance(amount, int) and not isinstance(amount, bool) and amount > 0:
            return amount
    return 0


def _doc_datetime(value) -> datetime.datetime | None:
    if isinstance(value, datetime.datetime):
        if value.tzinfo is not None:
            return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        return value
    if isinstance(value, str):
        try:
            parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                return parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            return parsed
        except ValueError:
            return None
    return None


def _is_debit_transaction(txn: dict) -> bool:
    if txn.get("is_income") is True:
        return False
    return str(txn.get("direction") or "").lower() != "credit"


def _build_local_campus_insight(
    *,
    spend_7: float,
    remaining: float,
    days_left: int,
    safe_daily: float,
    last_food_hours: float,
    upcoming_commitments: float,
    upcoming_commitment_count: int,
    food_option: dict | None,
) -> dict:
    weekly_daily_pace = spend_7 / 7 if spend_7 > 0 else 0
    pace_ratio = weekly_daily_pace / safe_daily if safe_daily > 0 else 0
    commitment_ratio = upcoming_commitments / max(remaining, 1) if remaining > 0 else 0

    if remaining <= 0:
        headline = "Runway needs attention"
        action = "Pause flexible spends today and use essentials until the cycle resets."
        why = f"Your current cycle balance is Rs {remaining:.0f}, with {days_left} days left."
        focus = "runway"
    elif upcoming_commitments > 0 and commitment_ratio >= 0.25:
        headline = "Commitments ahead"
        action = f"Keep today near Rs {safe_daily:.0f} and avoid taking on new fixed costs."
        why = f"Rs {upcoming_commitments:.0f} is scheduled across {upcoming_commitment_count} upcoming commitment{'s' if upcoming_commitment_count != 1 else ''}."
        focus = "commitments"
    elif safe_daily > 0 and pace_ratio >= 1.25:
        headline = "Pace is running high"
        action = f"Keep flexible spend near Rs {safe_daily:.0f} today before adding anything new."
        why = f"This week's pace is about Rs {weekly_daily_pace:.0f}/day against a safe Rs {safe_daily:.0f}/day."
        focus = "spend"
    elif last_food_hours > 10:
        headline = "Routine check due"
        action = "Log a quick meal check-in and keep the next campus spend simple."
        why = f"The last routine food signal was {last_food_hours:.0f} hours ago."
        focus = "routine"
    else:
        headline = "Campus plan is steady"
        action = f"Keep today close to Rs {safe_daily:.0f} and review commitments before any large spend."
        why = f"You have Rs {remaining:.0f} left across {days_left} cycle days."
        focus = "steady"

    signals = [
        {
            "label": "Runway",
            "value": f"Rs {safe_daily:.0f}/day" if safe_daily > 0 else "Set budget",
            "detail": f"Rs {remaining:.0f} left" if remaining > 0 else "No cycle buffer",
            "tone": "watch" if safe_daily < 120 else "steady",
        },
        {
            "label": "Spend pace",
            "value": f"Rs {weekly_daily_pace:.0f}/day" if weekly_daily_pace > 0 else "No spend",
            "detail": "Above safe/day" if pace_ratio >= 1.25 else "Inside range",
            "tone": "watch" if pace_ratio >= 1.25 else "steady",
        },
        {
            "label": "Commitments",
            "value": f"Rs {upcoming_commitments:.0f}" if upcoming_commitments > 0 else "Clear",
            "detail": f"{upcoming_commitment_count} due soon" if upcoming_commitment_count else "Next 7 days",
            "tone": "watch" if upcoming_commitments > max(safe_daily * 2, 500) else "steady",
        },
        {
            "label": "Routine",
            "value": f"{last_food_hours:.0f}h ago" if last_food_hours > 0 else "No signal",
            "detail": "Check in" if last_food_hours > 10 else "Recent enough",
            "tone": "watch" if last_food_hours > 10 else "steady",
        },
    ]

    return {
        "headline": headline,
        "next_action": action,
        "why": why,
        "summary": f"{action} {why}",
        "focus": focus,
        "signals": signals,
        "food_option": food_option,
    }


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
    ranked_options = fallback.get("ranked_options", [])
    daily_budget = max(0, req.remaining_budget / max(req.days_left, 1))
    facts_used = [
        f"days_left={req.days_left}",
        f"remaining_budget_rs={req.remaining_budget:.0f}",
        f"spent_today_rs={req.spent_today:.0f}",
        f"daily_food_runway_rs={daily_budget:.0f}",
    ]
    if fallback.get("item"):
        item = fallback["item"]
        facts_used.append(
            f"recommended_food={item.get('item_name')} at {item.get('venue_name')} for Rs {round((item.get('price', 0) or 0) / 100):.0f}"
        )

    if not settings.BEDROCK_ENABLED:
        return {
            **fallback,
            "source": "local_fallback",
            **ai_response_metadata(source="local_fallback", facts_used=facts_used, fallback_reason="bedrock_disabled"),
        }

    try:
        trusted_options = _trusted_food_prompt_options(ranked_options[:5])
        prompt = f"""
You are PocketBuddy's grounded student food advisor.

Backend facts:
- Days left in cycle: {req.days_left}
- Remaining budget: Rs {req.remaining_budget:.0f}
- Spent today: Rs {req.spent_today:.0f}
- Food runway for today: Rs {daily_budget:.0f}

Trusted campus food options only:
{json.dumps(trusted_options, ensure_ascii=True)}

Hard rules:
- Return advice only, not a financial fact or guarantee.
- Use only the exact prices and trusted campus options above.
- Do not mention delivery apps, live prices, medical claims, stress diagnosis, or any food option outside the list.
- If you mention a number, it must appear in Backend facts or Trusted campus food options.
- Keep it useful for a student who wants to avoid overspending without skipping food.

Return ONLY valid JSON:
{{"recommendation":"one or two concise sentences"}}
        """

        result = generate_json(prompt, max_tokens=180, temperature=0.15)
        recommendation = validate_grounded_advice(
            result.get("recommendation"),
            allowed_rupee_values=_rounded_rupees(req.remaining_budget, req.spent_today, daily_budget)
            + _trusted_food_rupees(ranked_options[:5]),
            allowed_time_values=[req.days_left],
            allowed_entities=_trusted_food_entities(ranked_options[:5]),
            require_entity=bool(ranked_options),
            forbidden_terms=EXTERNAL_FOOD_APP_TERMS,
            max_chars=300,
        )

        return {
            **fallback,
            "recommendation": recommendation,
            "source": "bedrock",
            "fallback": fallback["recommendation"],
            **ai_response_metadata(source="bedrock", facts_used=facts_used),
        }

    except GroundingError as exc:
        logger.warning("Bedrock food recommendation was ungrounded; using local fallback: %s", exc)
        return {
            **fallback,
            "source": "local_fallback",
            "bedrock_error": "ungrounded_response",
            **ai_response_metadata(
                source="local_fallback",
                facts_used=facts_used,
                fallback_reason="ungrounded_response",
            ),
        }
    except Exception as exc:
        logger.warning("Bedrock recommendation failed; using local fallback: %s", exc)
        return {
            **fallback,
            "source": "local_fallback",
            "bedrock_error": "unavailable",
            **ai_response_metadata(source="local_fallback", facts_used=facts_used, fallback_reason="bedrock_unavailable"),
        }


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

    now = datetime.datetime.utcnow()
    since_7 = now - datetime.timedelta(days=7)
    cycle_start, cycle_end = cycle_bounds(int((profile or {}).get("cycle_start_day") or 1), now)
    cursor = db.transactions.find({"user_id": user_id, "created_at": {"$gte": min(since_7, cycle_start)}})
    txns = await cursor.to_list(length=500)
    debit_txns = [t for t in txns if _is_debit_transaction(t)]
    spend_7 = sum(
        _doc_amount_paise(t)
        for t in debit_txns
        if (_doc_datetime(t.get("created_at")) or now) >= since_7
    ) / 100
    cycle_spend = sum(
        _doc_amount_paise(t)
        for t in debit_txns
        if cycle_start <= (_doc_datetime(t.get("created_at")) or now) < cycle_end
    ) / 100
    food_txns = [t for t in debit_txns if t.get("category") == "food"]
    checkins = await db.checkin_logs.find({
        "user_id": user_id,
        "created_at": {"$gte": since_7},
    }).sort("created_at", -1).to_list(length=500)
    meal_events = meal_signal_events(food_txns, checkins)
    last_food_hours = current_meal_gap_hours(now, meal_events, default=0.0)
    last_food_source = meal_events[-1]["source"] if meal_events else None

    allowance = ((profile or {}).get("monthly_allowance", 0) or 0) / 100
    remaining = max(0, allowance - cycle_spend)
    days_left = max(1, (cycle_end.date() - now.date()).days)
    safe_daily = remaining / days_left if days_left > 0 else remaining

    subscriptions = await db.subscriptions.find(
        {"user_id": user_id, "is_active": {"$ne": False}}
    ).to_list(length=100)
    commitment_window_end = now + datetime.timedelta(days=7)
    upcoming_subscriptions = [
        sub
        for sub in subscriptions
        if (due_at := _doc_datetime(sub.get("next_debit_date"))) and now <= due_at <= commitment_window_end
    ]
    upcoming_commitments = sum(_doc_amount_paise(sub) for sub in upcoming_subscriptions) / 100
    upcoming_commitment_count = len([sub for sub in upcoming_subscriptions if _doc_amount_paise(sub) > 0])

    facts_used = [
        f"last_7_day_spend_rs={spend_7:.0f}",
        f"remaining_cycle_budget_rs={remaining:.0f}",
        f"cycle_days_left={days_left}",
        f"safe_daily_spend_rs={safe_daily:.0f}",
        f"upcoming_commitments_7d_rs={upcoming_commitments:.0f}",
        f"last_food_signal_hours={last_food_hours:.1f}",
    ]
    fallback_reason = "bedrock_disabled" if not settings.BEDROCK_ENABLED else "bedrock_unavailable"

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
    trusted_options = _trusted_food_prompt_options(ranked_foods[:5])
    food_option = _campus_food_option(ranked_foods[0] if ranked_foods else None)
    if food_option:
        facts_used.append(
            f"top_campus_food={food_option.get('item')} at {food_option.get('venue')} for Rs {food_option.get('price_rs')}"
        )
    fallback_insight = _build_local_campus_insight(
        spend_7=spend_7,
        remaining=remaining,
        days_left=days_left,
        safe_daily=safe_daily,
        last_food_hours=last_food_hours,
        upcoming_commitments=upcoming_commitments,
        upcoming_commitment_count=upcoming_commitment_count,
        food_option=food_option,
    )

    # Try Bedrock
    if settings.BEDROCK_ENABLED:
        try:
            weekly_daily_pace = spend_7 / 7 if spend_7 > 0 else 0
            prompt = f"""You are PocketBuddy's campus intelligence layer for Indian college students.
Choose the single most useful campus nudge from these backend facts.

Student context:
- Current cycle days left: {days_left}
- Current cycle budget left: Rs {remaining:.0f}
- Safe daily spend for this cycle: Rs {safe_daily:.0f}
- Spent in last 7 days: Rs {spend_7:.0f}
- Last 7-day daily spend pace: Rs {weekly_daily_pace:.0f}
- Upcoming fixed commitments in next 7 days: Rs {upcoming_commitments:.0f} across {upcoming_commitment_count} item(s)
- Last routine food signal: {last_food_hours:.0f} hours ago
- Trusted campus food options, only if routine/food is truly the strongest signal: {json.dumps(trusted_options[:3], ensure_ascii=True)}

Hard rules:
- Give student-life advice only; do not diagnose stress, sleep, anxiety, burnout, or health.
- Treat all prices, spend, commitment, food-gap, and budget values as backend facts. Do not invent or estimate new numbers.
- Choose from focus values only: runway, spend, commitments, routine, steady.
- Do not cite a food option unless the routine signal is clearly the strongest issue.
- Do not mention any delivery app, live price, bank claim, or guarantee.
- Be specific enough that the student can act in under 30 seconds.

Return ONLY valid JSON:
{{"focus":"runway|spend|commitments|routine|steady","headline":"under 6 words","next_action":"one concise action sentence","why":"one concise reason sentence","summary":"one sentence combining the action and reason"}}
"""

            allowed_rupees = _rounded_rupees(
                spend_7,
                remaining,
                safe_daily,
                weekly_daily_pace,
                upcoming_commitments,
                safe_budget_paise / 100,
            ) + _trusted_food_rupees(ranked_foods[:5])
            allowed_times = [7, 30, days_left, round(last_food_hours, 1)]
            allowed_entities = _trusted_food_entities(ranked_foods[:5])
            result = generate_json(prompt, max_tokens=160, temperature=0.15)
            focus = str(result.get("focus") or fallback_insight["focus"]).strip().lower()
            if focus not in {"runway", "spend", "commitments", "routine", "steady"}:
                focus = fallback_insight["focus"]
            headline = validate_grounded_advice(
                result.get("headline"),
                allowed_rupee_values=allowed_rupees,
                allowed_time_values=allowed_times,
                allowed_plain_values=[upcoming_commitment_count],
                allowed_entities=allowed_entities,
                forbidden_terms=EXTERNAL_FOOD_APP_TERMS,
                max_chars=80,
                max_sentences=1,
            )
            next_action = validate_grounded_advice(
                result.get("next_action"),
                allowed_rupee_values=allowed_rupees,
                allowed_time_values=allowed_times,
                allowed_plain_values=[upcoming_commitment_count],
                allowed_entities=allowed_entities,
                require_entity=focus == "routine" and last_food_hours > 10 and bool(ranked_foods),
                forbidden_terms=EXTERNAL_FOOD_APP_TERMS,
                max_chars=180,
                max_sentences=1,
            )
            why = validate_grounded_advice(
                result.get("why"),
                allowed_rupee_values=allowed_rupees,
                allowed_time_values=allowed_times,
                allowed_plain_values=[upcoming_commitment_count],
                allowed_entities=allowed_entities,
                forbidden_terms=EXTERNAL_FOOD_APP_TERMS,
                max_chars=180,
                max_sentences=1,
            )
            summary = validate_grounded_advice(
                result.get("summary"),
                allowed_rupee_values=allowed_rupees,
                allowed_time_values=allowed_times,
                allowed_plain_values=[upcoming_commitment_count],
                allowed_entities=allowed_entities,
                forbidden_terms=EXTERNAL_FOOD_APP_TERMS,
                max_chars=360,
                max_sentences=2,
            )
            if summary:
                return {
                    "summary": summary,
                    "headline": headline,
                    "next_action": next_action,
                    "why": why,
                    "focus": focus,
                    "signals": fallback_insight["signals"],
                    "food_option": food_option if focus == "routine" else None,
                    "source": "bedrock",
                    "spend_7d": spend_7,
                    "remaining_budget": remaining,
                    "days_left": days_left,
                    "safe_daily": round(safe_daily),
                    "upcoming_commitments": upcoming_commitments,
                    "safe_food_budget": round(safe_budget_paise / 100),
                    "last_food_hours": round(last_food_hours, 1),
                    "last_food_signal_source": last_food_source,
                    **ai_response_metadata(source="bedrock", facts_used=facts_used),
                }
        except GroundingError as exc:
            fallback_reason = "ungrounded_response"
            logger.warning("Bedrock campus-intel was ungrounded; using local fallback: %s", exc)
        except Exception as exc:
            fallback_reason = "bedrock_unavailable"
            logger.warning("Bedrock campus-intel failed: %s", exc)

    return {
        **fallback_insight,
        "source": "local_fallback",
        "spend_7d": spend_7,
        "remaining_budget": remaining,
        "days_left": days_left,
        "safe_daily": round(safe_daily),
        "upcoming_commitments": upcoming_commitments,
        "safe_food_budget": round(safe_budget_paise / 100),
        "last_food_hours": round(last_food_hours, 1),
        "last_food_signal_source": last_food_source,
        **ai_response_metadata(source="local_fallback", facts_used=facts_used, fallback_reason=fallback_reason),
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
    days_before_cycle_end = max(0, days_left - broke_days)
    shortfall_percent = round(shortfall_prob * 100)
    facts_used = [
        f"cycle_days_left={days_left}",
        f"days_until_broke={broke_days}",
        f"expected_runway_days={expected_days}",
        f"stress_runway_days={stress_days}",
        f"shortfall_probability_percent={shortfall_percent}",
        f"safe_daily_spend_rs={safe_daily}",
        f"projected_daily_spend_rs={projected_daily}",
        f"remaining_cycle_budget_rs={remaining}",
        f"food_cap_rs={food_cap}",
        f"next_action={next_action_title}",
    ]
    fallback_reason = "bedrock_disabled" if not settings.BEDROCK_ENABLED else "bedrock_unavailable"

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
- Forecast status: {str(status or "steady").upper()}
- Shortfall probability: {shortfall_prob * 100:.0f}%
- Expected runway: {expected_days} days
- Stress-case runway: {stress_days} days
- Ask home amount needed: Rs {ask_amount}
- Upcoming commitments total: Rs {commitments_total}
- Meal routine: {food_label}
- Food pace: Rs {food_pace}/day
- Suggested food cap: Rs {food_cap}/day
- Decision engine summary: {decision_summary}
- Next best action: {next_action_title} - {next_action_detail}

Generate exactly 2 concise, personalized, and action-oriented sentences. Explain only the deterministic values above. Do not calculate new amounts. Do not invent amounts, dates, probabilities, contacts, merchant names, guarantees, or extra actions. No emojis. No preamble."""

            text = validate_grounded_advice(
                generate_text(prompt, max_tokens=150, temperature=0.2),
                allowed_rupee_values=_rounded_rupees(
                    safe_daily,
                    projected_daily,
                    ask_amount,
                    commitments_total,
                    remaining,
                    food_pace,
                    food_cap,
                ),
                allowed_percent_values=[shortfall_percent],
                allowed_time_values=[days_left, broke_days, expected_days, stress_days, days_before_cycle_end],
                max_chars=420,
            )
            if text:
                return {"summary": text, "source": "bedrock", **ai_response_metadata(source="bedrock", facts_used=facts_used)}
        except GroundingError as exc:
            fallback_reason = "ungrounded_response"
            logger.warning("Bedrock runway-intel was ungrounded; using local fallback: %s", exc)
        except Exception as exc:
            fallback_reason = "bedrock_unavailable"
            logger.warning("Bedrock runway-intel failed: %s", exc)

    return {
        "summary": fallback_summary,
        "source": "local_fallback",
        **ai_response_metadata(source="local_fallback", facts_used=facts_used, fallback_reason=fallback_reason),
    }
