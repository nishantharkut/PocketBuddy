"""Deterministic, explainable runway and multi-horizon forecasting.

Money values are integer paise. Dates are naive UTC to match the existing MongoDB
documents. Bedrock is deliberately not involved in any calculation in this module.
"""

from __future__ import annotations

import calendar
import datetime as dt
import math
import re
from collections import defaultdict
from statistics import NormalDist, pstdev
from typing import Any, Iterable, Optional


DAY = dt.timedelta(days=1)
INCOME_CATEGORIES = {"income", "salary", "stipend", "scholarship", "refund", "cashback"}
PRIMARY_ALLOWANCE_WORDS = {"allowance", "stipend", "scholarship"}
REFUND_WORDS = {"refund", "cashback", "reimbursement", "reversal"}
INVALID_STATUSES = {"duplicate", "refunded", "reversed", "cancelled", "failed", "rejected"}
MESS_WORDS = {"mess", "hostel dining", "meal plan"}
DELIVERY_WORDS = {
    "swiggy",
    "zomato",
    "food delivery",
    "delivery",
    "ubereats",
    "eatclub",
    "box8",
    "dominos",
    "pizza hut",
    "kfc",
    "mcdonald",
    "burger",
}
COOKING_WORDS = {
    "grocery",
    "groceries",
    "kirana",
    "dmart",
    "bigbasket",
    "blinkit",
    "zepto",
    "jiomart",
    "vegetable",
    "fruit",
    "milk",
    "atta",
    "rice",
    "dal",
    "oil",
    "egg",
    "maggi",
    "cooking",
}
CAMPUS_FOOD_WORDS = {
    "canteen",
    "cafeteria",
    "cafe",
    "hostel dining",
    "mess",
    "tapri",
    "dhaba",
    "juice",
    "tea",
    "coffee",
    "tiffin",
}
FOOD_CATEGORIES = {"food", "mess", "canteen", "dining", "snacks", "grocery", "groceries"}
PG_CONTEXT_WORDS = {"pg", "paying guest", "flat", "rented", "rental", "apartment", "off campus"}
DAY_SCHOLAR_CONTEXT_WORDS = {"day scholar", "commuter", "commute", "home", "local", "with parents"}


def _utc_naive(value: Any) -> Optional[dt.datetime]:
    if isinstance(value, dt.datetime):
        if value.tzinfo is not None:
            return value.astimezone(dt.timezone.utc).replace(tzinfo=None)
        return value
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min)
    if isinstance(value, str) and value:
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
            return parsed
        except ValueError:
            return None
    return None


def _date(value: Any) -> Optional[dt.date]:
    parsed = _utc_naive(value)
    return parsed.date() if parsed else None


def _month_day(year: int, month: int, day: int) -> dt.datetime:
    last_day = calendar.monthrange(year, month)[1]
    return dt.datetime(year, month, min(max(day, 1), last_day))


def add_months(value: dt.datetime, months: int) -> dt.datetime:
    month_index = value.year * 12 + value.month - 1 + months
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    last_day = calendar.monthrange(year, month)[1]
    return value.replace(year=year, month=month, day=min(value.day, last_day))


def cycle_bounds(cycle_start_day: int, now: dt.datetime) -> tuple[dt.datetime, dt.datetime]:
    cycle_start_day = min(max(int(cycle_start_day or 1), 1), 31)
    candidate = _month_day(now.year, now.month, cycle_start_day)
    start = candidate if now >= candidate else add_months(candidate, -1)
    return start, add_months(start, 1)


def _label(txn: dict) -> str:
    return " ".join(
        str(txn.get(key) or "")
        for key in ("category", "mapped_merchant_name", "raw_merchant_string")
    ).casefold()


def _valid_amount(item: dict) -> int:
    amount = item.get("amount", 0)
    return amount if isinstance(amount, int) and not isinstance(amount, bool) and amount > 0 else 0


def _is_ignored(txn: dict) -> bool:
    status = str(txn.get("status") or txn.get("parse_status") or "").casefold()
    return bool(
        txn.get("is_duplicate")
        or txn.get("duplicate_of")
        or txn.get("is_refunded")
        or status in INVALID_STATUSES
        or not _valid_amount(txn)
        or not _utc_naive(txn.get("created_at"))
    )


def _is_income(txn: dict) -> bool:
    direction = str(txn.get("direction") or "").casefold()
    if direction == "credit":
        return True
    if direction == "debit":
        return False
    return str(txn.get("category") or "").casefold() in INCOME_CATEGORIES


def _is_committed_expense(txn: dict) -> bool:
    label = _label(txn)
    return str(txn.get("category") or "").casefold() == "subscription" or any(
        word in label for word in MESS_WORDS
    ) or bool(txn.get("is_committed"))


def _contains_any(text: str, words: set[str]) -> bool:
    return any(word in text for word in words)


def _is_food_expense(txn: dict) -> bool:
    category = str(txn.get("category") or "").casefold()
    label = _label(txn)
    return (
        category in FOOD_CATEGORIES
        or _contains_any(label, DELIVERY_WORDS)
        or _contains_any(label, COOKING_WORDS)
        or _contains_any(label, CAMPUS_FOOD_WORDS)
    )


def _food_stats(items: list[dict]) -> dict:
    total = sum(_valid_amount(txn) for txn in items)
    count = len(items)
    return {
        "count": count,
        "spend": total,
        "avg_order": round(total / count) if count else 0,
    }


def _profile_context(profile: dict) -> str:
    keys = (
        "hostel_block",
        "residence_type",
        "student_type",
        "meal_routine",
        "living_situation",
        "housing_type",
        "campus_role",
    )
    return " ".join(str(profile.get(key) or "") for key in keys).casefold()


def _routine_fallback_daily(routine_type: str) -> int:
    # Conservative Indian campus daily food caps in paise. These are used only
    # when the user has no configured meal cost and not enough food history.
    if routine_type == "hostel_mess":
        return 12_000
    if routine_type == "pg_cooking":
        return 16_000
    if routine_type == "day_scholar":
        return 18_000
    return 20_000


def _build_food_routine(
    *,
    profile: dict,
    cycle_expenses: list[dict],
    cycle_start: dt.datetime,
    cycle_end: dt.datetime,
    now: dt.datetime,
    days_left: int,
    safe_daily: int,
    mess_model: str,
) -> dict:
    observed_cycle_expenses = [
        txn
        for txn in cycle_expenses
        if (created := _utc_naive(txn.get("created_at"))) and cycle_start <= created <= min(now, cycle_end)
    ]
    food_items = [txn for txn in observed_cycle_expenses if _is_food_expense(txn)]
    delivery_items = [txn for txn in food_items if _contains_any(_label(txn), DELIVERY_WORDS)]
    cooking_items = [txn for txn in food_items if _contains_any(_label(txn), COOKING_WORDS)]
    campus_items = [
        txn
        for txn in food_items
        if _contains_any(_label(txn), CAMPUS_FOOD_WORDS) and txn not in delivery_items
    ]

    food = _food_stats(food_items)
    delivery = _food_stats(delivery_items)
    cooking = _food_stats(cooking_items)
    campus_direct = _food_stats(campus_items)
    elapsed_days = max(1, (min(now, cycle_end - dt.timedelta(microseconds=1)).date() - cycle_start.date()).days + 1)
    food_daily_pace = round(food["spend"] / elapsed_days) if food["spend"] else 0
    delivery_daily_pace = round(delivery["spend"] / elapsed_days) if delivery["spend"] else 0
    cooking_daily_pace = round(cooking["spend"] / elapsed_days) if cooking["spend"] else 0
    campus_daily_pace = round(campus_direct["spend"] / elapsed_days) if campus_direct["spend"] else 0

    context = _profile_context(profile)
    routine_type = "mixed"
    detected_from: list[str] = []
    if profile.get("mess_enrolled") or mess_model in {"monthly", "per_meal", "included"}:
        routine_type = "hostel_mess"
        detected_from.append("profile_mess")
    elif _contains_any(context, DAY_SCHOLAR_CONTEXT_WORDS):
        routine_type = "day_scholar"
        detected_from.append("profile_residence")
    elif _contains_any(context, PG_CONTEXT_WORDS):
        routine_type = "pg_cooking"
        detected_from.append("profile_residence")
    elif cooking["count"] >= 2 and cooking["spend"] >= max(delivery["spend"], campus_direct["spend"], 1):
        routine_type = "pg_cooking"
        detected_from.append("grocery_pattern")
    elif campus_direct["count"] >= 2 and delivery["count"] == 0:
        routine_type = "day_scholar"
        detected_from.append("campus_meal_pattern")
    elif food["count"]:
        detected_from.append("food_history")
    else:
        detected_from.append("profile_default")

    labels = {
        "hostel_mess": "Hostel mess / campus meals",
        "pg_cooking": "PG cooking / grocery routine",
        "day_scholar": "Day scholar meals",
        "mixed": "Mixed meal routine",
    }

    mess_per_meal = _profile_amount(profile, "mess_per_meal_cost")
    meals_per_day = min(max(int(profile.get("mess_meals_per_day") or 2), 1), 4)
    if routine_type == "hostel_mess" and mess_per_meal:
        routine_daily_target = mess_per_meal * meals_per_day
        meal_cost_source = "profile_mess_cost"
    elif routine_type == "pg_cooking" and cooking_daily_pace:
        routine_daily_target = max(8_000, min(22_000, cooking_daily_pace))
        meal_cost_source = "grocery_history"
    elif routine_type == "day_scholar" and campus_direct["avg_order"]:
        routine_daily_target = max(10_000, min(24_000, campus_direct["avg_order"] * 2))
        meal_cost_source = "campus_meal_history"
    elif food_daily_pace:
        routine_daily_target = max(8_000, min(_routine_fallback_daily(routine_type), food_daily_pace))
        meal_cost_source = "food_history"
    else:
        routine_daily_target = _routine_fallback_daily(routine_type)
        meal_cost_source = "campus_default"

    recommended_daily_food_cap = max(0, min(routine_daily_target, safe_daily))
    projected_remaining_food_pace = food_daily_pace * days_left
    projected_remaining_food_cap = recommended_daily_food_cap * days_left
    over_cap_remaining = max(0, projected_remaining_food_pace - projected_remaining_food_cap)

    if mess_per_meal:
        routine_meal_cost = mess_per_meal
    elif campus_direct["avg_order"]:
        routine_meal_cost = campus_direct["avg_order"]
    elif cooking_daily_pace:
        routine_meal_cost = max(4_000, round(cooking_daily_pace / 2))
    else:
        routine_meal_cost = round(_routine_fallback_daily(routine_type) / 2)
    savings_if_replace_two_deliveries = (
        max(0, delivery["avg_order"] - routine_meal_cost) * 2 if delivery["avg_order"] else 0
    )

    if not food["count"]:
        action = {
            "type": "set_routine",
            "title": "Set a default meal routine",
            "detail": "Log two or three meals this week so runway can separate food pace from other discretionary spend.",
            "impact": 0,
        }
    elif delivery["count"] and (food_daily_pace > recommended_daily_food_cap or delivery["spend"] >= food["spend"] * 0.45):
        impact = max(savings_if_replace_two_deliveries, over_cap_remaining)
        action = {
            "type": "reduce_delivery",
            "title": "Replace two delivery orders this week",
            "detail": f"Your delivery average is Rs {delivery['avg_order'] // 100:,}. Use {labels[routine_type].lower()} for two meals and keep food near Rs {recommended_daily_food_cap // 100:,}/day.",
            "impact": impact,
        }
    elif routine_type == "pg_cooking":
        action = {
            "type": "pg_batch_cook",
            "title": "Batch-cook before high-spend days",
            "detail": f"Your grocery-led routine works best when food stays near Rs {recommended_daily_food_cap // 100:,}/day. Plan two ready meals before busy class or exam days.",
            "impact": over_cap_remaining,
        }
    elif routine_type == "day_scholar":
        action = {
            "type": "day_scholar_plan",
            "title": "Set a commute-day meal cap",
            "detail": f"Keep one predictable campus meal or packed meal inside Rs {recommended_daily_food_cap // 100:,}/day so travel and snacks do not eat into runway.",
            "impact": over_cap_remaining,
        }
    elif routine_type == "hostel_mess":
        action = {
            "type": "use_mess",
            "title": "Use prepaid meals for routine days",
            "detail": f"Mess/campus meals are your stable baseline. Keep outside food inside Rs {recommended_daily_food_cap // 100:,}/day unless runway is comfortably above cycle length.",
            "impact": over_cap_remaining,
        }
    else:
        action = {
            "type": "stabilize_food",
            "title": "Pick one default low-cost meal",
            "detail": f"Keep food pace near Rs {recommended_daily_food_cap // 100:,}/day and reserve delivery for planned days, not impulse gaps.",
            "impact": over_cap_remaining,
        }

    return {
        "type": routine_type,
        "label": labels[routine_type],
        "detected_from": detected_from,
        "meal_cost_source": meal_cost_source,
        "cycle_food_spend": food["spend"],
        "cycle_food_count": food["count"],
        "food_daily_pace": food_daily_pace,
        "recommended_daily_food_cap": recommended_daily_food_cap,
        "projected_remaining_food_pace": projected_remaining_food_pace,
        "projected_remaining_food_cap": projected_remaining_food_cap,
        "over_cap_remaining": over_cap_remaining,
        "avg_meal_cost": food["avg_order"],
        "routine_meal_cost": routine_meal_cost,
        "delivery": {**delivery, "daily_pace": delivery_daily_pace},
        "campus_direct": {**campus_direct, "daily_pace": campus_daily_pace},
        "cooking": {**cooking, "daily_pace": cooking_daily_pace},
        "savings_if_replace_two_deliveries": savings_if_replace_two_deliveries,
        "action": action,
    }


def _billing_interval(subscription: dict) -> tuple[str, int]:
    cycle = str(subscription.get("billing_cycle") or "monthly").casefold().replace("-", "_")
    if cycle == "weekly":
        return "days", 7
    if cycle in {"biweekly", "fortnightly"}:
        return "days", 14
    if cycle == "quarterly":
        return "months", 3
    if cycle in {"half_yearly", "semiannual", "semi_annual"}:
        return "months", 6
    if cycle in {"yearly", "annual"}:
        return "months", 12
    observed = subscription.get("observed_interval_days")
    if isinstance(observed, int) and observed > 0 and cycle not in {"monthly", "month"}:
        return "days", observed
    return "months", 1


def _advance(value: dt.datetime, interval: tuple[str, int]) -> dt.datetime:
    unit, count = interval
    return value + dt.timedelta(days=count) if unit == "days" else add_months(value, count)


def _subscription_dates(subscription: dict, start: dt.datetime, end: dt.datetime) -> list[dt.datetime]:
    interval = _billing_interval(subscription)
    due = _utc_naive(subscription.get("next_debit_date")) or start
    guard = 0
    while due < start and guard < 500:
        due = _advance(due, interval)
        guard += 1
    dates: list[dt.datetime] = []
    while due < end and guard < 500:
        dates.append(due)
        due = _advance(due, interval)
        guard += 1
    return dates


def _monthly_subscription_cost(subscription: dict) -> float:
    amount = _valid_amount(subscription)
    unit, count = _billing_interval(subscription)
    if unit == "days":
        return amount * 30.4375 / count
    return amount / count


def _profile_amount(profile: dict, key: str) -> int:
    value = profile.get(key, 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else 0


def _exam_overlap(profile: dict, start: dt.datetime, end: dt.datetime) -> int:
    exam_start = _date(profile.get("exam_start_date"))
    exam_end = _date(profile.get("exam_end_date"))
    if not exam_start or not exam_end or exam_end < exam_start:
        return 0
    overlap_start = max(start.date(), exam_start)
    overlap_end = min((end - dt.timedelta(microseconds=1)).date(), exam_end)
    return max(0, (overlap_end - overlap_start).days + 1)


def derive_pool_obligations(
    pools: Iterable[dict],
    items: Iterable[dict],
    *,
    user_id: str,
    user_name: str,
    now: Optional[dt.datetime] = None,
) -> list[dict]:
    """Return unpaid/estimated shares owned by the current user."""
    now = now or dt.datetime.utcnow()
    item_map: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        item_map[str(item.get("pool_id") or "")].append(item)

    def name_key(value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip()).casefold()

    obligations: list[dict] = []
    for pool in pools:
        pool_id = str(pool.get("_id") or pool.get("id") or "")
        status = str(pool.get("status") or "").casefold()
        if status not in {"open", "closed", "completed"}:
            continue
        pool_items = [item for item in item_map.get(pool_id, []) if item.get("is_purchased", True)]
        effective_name = user_name
        if str(pool.get("host_id") or "") == user_id and not effective_name:
            effective_name = str(pool.get("created_by_name") or "")
        mine = [item for item in pool_items if name_key(item.get("added_by_name")) == name_key(effective_name)]
        if not mine:
            continue

        payments = pool.get("payments") or []
        payment = next((p for p in payments if name_key(p.get("name")) == name_key(effective_name)), None)
        if status == "completed" and payment and str(payment.get("status") or "") in {
            "verified", "auto_verified", "manual_verified"
        }:
            continue
        # The host share is already written to transactions when checkout completes.
        if status == "completed" and str(pool.get("host_id") or "") == user_id:
            continue

        participants = {name_key(item.get("added_by_name")) for item in pool_items}
        participant_count = max(1, len(participants))
        item_total = sum(_valid_amount({"amount": item.get("estimated_price")}) for item in mine)
        if status == "completed":
            overhead = int(pool.get("final_overhead") or 0) - int(pool.get("final_discount") or 0)
        else:
            overhead = int(pool.get("delivery_fee") or 0)
        amount = max(0, item_total + round(overhead / participant_count))
        if amount <= 0:
            continue
        due = _utc_naive(pool.get("expires_at")) or now
        obligations.append({
            "pool_id": pool_id,
            "label": f"{str(pool.get('platform_display_label') or pool.get('platform') or 'Cart').replace('_', ' ').title()} pool",
            "amount": amount,
            "due_at": due,
            "status": "pending" if status == "completed" else "estimated",
        })
    return obligations


def _pace_model(expenses: list[dict], now: dt.datetime) -> dict:
    history_start = (now - dt.timedelta(days=56)).date()
    complete_end = now.date() - dt.timedelta(days=1)
    by_day: dict[dt.date, int] = defaultdict(int)
    for txn in expenses:
        created = _utc_naive(txn.get("created_at"))
        if created and history_start <= created.date() <= complete_end and not _is_committed_expense(txn):
            by_day[created.date()] += _valid_amount(txn)

    dates = [history_start + dt.timedelta(days=i) for i in range(max(0, (complete_end - history_start).days + 1))]
    recent_dates = dates[-28:]
    values = [by_day[day] for day in recent_dates]
    active_days = sum(1 for value in values if value > 0)

    ewma = 0.0
    alpha = 0.24
    for value in values:
        ewma = value if ewma == 0 and value > 0 else alpha * value + (1 - alpha) * ewma
    if not values or ewma == 0:
        today_total = sum(
            _valid_amount(txn)
            for txn in expenses
            if (_utc_naive(txn.get("created_at")) or dt.datetime.min).date() == now.date()
            and not _is_committed_expense(txn)
        )
        ewma = float(today_total)

    global_mean = sum(by_day[day] for day in dates) / max(1, len(dates))
    weekday_values: dict[int, list[int]] = defaultdict(list)
    for day in dates:
        weekday_values[day.weekday()].append(by_day[day])
    factors: dict[int, float] = {}
    for weekday in range(7):
        samples = weekday_values.get(weekday, [])
        weekday_mean = sum(samples) / max(1, len(samples))
        raw = weekday_mean / global_mean if global_mean > 0 else 1.0
        # Shrink sparse weekday estimates toward one and cap outliers.
        weight = min(1.0, len(samples) / 8)
        factors[weekday] = min(1.6, max(0.6, 1 + (raw - 1) * weight))

    residuals = [value - ewma * factors[day.weekday()] for day, value in zip(recent_dates, values)]
    daily_std = pstdev(residuals) if len(residuals) > 1 else 0.0
    if daily_std <= 0 and ewma > 0:
        daily_std = ewma * 0.45
    return {
        "ewma_daily": ewma,
        "weekday_factors": factors,
        "daily_std": daily_std,
        "history_days": len(dates),
        "active_days": active_days,
        "observed_total": sum(values),
    }


def _confidence(pace: dict, subscriptions: list[dict], profile: dict) -> dict:
    score = min(40, round(pace["history_days"] / 42 * 40))
    score += min(25, round(pace["active_days"] / 14 * 25))
    score += 10 if subscriptions else 0
    score += 10 if profile.get("monthly_allowance") else 0
    score += 10 if profile.get("mess_billing_model") else 0
    volatility = pace["daily_std"] / pace["ewma_daily"] if pace["ewma_daily"] else 1.0
    score += 5 if volatility <= 0.75 else 2 if volatility <= 1.25 else 0
    score = min(100, score)
    level = "high" if score >= 75 else "medium" if score >= 45 else "low"
    reason = (
        "Enough recent activity and recurring-cost context for a stable estimate."
        if level == "high"
        else "The range stays wider until more daily spending history is available."
        if level == "medium"
        else "Early estimate: add transactions and configure fixed costs to improve it."
    )
    return {"score": score, "level": level, "reason": reason, "history_days": pace["history_days"], "active_days": pace["active_days"]}


def _round_ask_home(shortfall_paise: float) -> int:
    # Round up to a practical Rs 100 request.
    return int(math.ceil(max(0.0, shortfall_paise) / 10_000) * 10_000)


def build_runway_forecast(
    *,
    profile: dict,
    transactions: Iterable[dict],
    subscriptions: Iterable[dict],
    pool_obligations: Iterable[dict] = (),
    now: Optional[dt.datetime] = None,
) -> dict:
    now = _utc_naive(now) or dt.datetime.utcnow()
    cycle_start, cycle_end = cycle_bounds(int(profile.get("cycle_start_day") or 1), now)
    allowance = _profile_amount(profile, "monthly_allowance")

    valid = [txn for txn in transactions if not _is_ignored(txn)]
    expenses = [txn for txn in valid if not _is_income(txn)]
    credits = [txn for txn in valid if _is_income(txn)]
    cycle_expenses = [txn for txn in expenses if cycle_start <= _utc_naive(txn.get("created_at")) < cycle_end]
    cycle_credits = [txn for txn in credits if cycle_start <= _utc_naive(txn.get("created_at")) < cycle_end]

    additional_income = 0
    allowance_credits = 0
    for txn in cycle_credits:
        label = _label(txn)
        amount = _valid_amount(txn)
        if any(word in label for word in REFUND_WORDS):
            additional_income += amount
        elif any(word in label for word in PRIMARY_ALLOWANCE_WORDS):
            allowance_credits += amount
        else:
            additional_income += amount
    # A recorded allowance transfer is evidence of the configured budget, not a second allowance.
    funding = max(allowance, allowance_credits) + additional_income
    spent = sum(_valid_amount(txn) for txn in cycle_expenses)
    committed_spent = sum(_valid_amount(txn) for txn in cycle_expenses if _is_committed_expense(txn))
    discretionary_spent = spent - committed_spent
    remaining = funding - spent

    active_subscriptions = [sub for sub in subscriptions if sub.get("is_active", True) and _valid_amount(sub)]
    commitments: list[dict] = []
    for sub in active_subscriptions:
        for due in _subscription_dates(sub, now, cycle_end):
            commitments.append({
                "kind": "subscription",
                "label": str(sub.get("service_name") or sub.get("name") or "Subscription"),
                "amount": _valid_amount(sub),
                "due_at": due,
                "status": "scheduled",
            })

    mess_model = str(profile.get("mess_billing_model") or ("included" if profile.get("mess_enrolled") else "none")).casefold()
    days_left = max(0, (cycle_end.date() - now.date()).days)
    already_paid_mess = any(any(word in _label(txn) for word in MESS_WORDS) for txn in cycle_expenses)
    if profile.get("mess_enrolled") and mess_model == "monthly" and not already_paid_mess:
        mess_amount = _profile_amount(profile, "mess_monthly_cost")
        if mess_amount:
            commitments.append({"kind": "mess", "label": "Monthly mess bill", "amount": mess_amount, "due_at": cycle_end - DAY, "status": "scheduled"})
    elif profile.get("mess_enrolled") and mess_model == "per_meal":
        per_meal = _profile_amount(profile, "mess_per_meal_cost")
        meals_per_day = min(max(int(profile.get("mess_meals_per_day") or 2), 1), 4)
        if per_meal and days_left:
            commitments.append({"kind": "mess", "label": "Expected mess meals", "amount": per_meal * meals_per_day * days_left, "due_at": now, "status": "estimated"})

    exam_days = _exam_overlap(profile, now, cycle_end)
    configured_exam_buffer = _profile_amount(profile, "exam_safety_buffer")
    exam_buffer = configured_exam_buffer if configured_exam_buffer and exam_days else exam_days * 10_000
    if exam_buffer:
        commitments.append({
            "kind": "exam_buffer",
            "label": "Exam safety fund",
            "amount": exam_buffer,
            "due_at": now,
            "status": "reserved" if configured_exam_buffer else "recommended",
        })

    for obligation in pool_obligations:
        amount = _valid_amount(obligation)
        due = _utc_naive(obligation.get("due_at")) or now
        if amount and due < cycle_end:
            commitments.append({
                "kind": "pool",
                "label": str(obligation.get("label") or "Cart pool share"),
                "amount": amount,
                "due_at": max(now, due),
                "status": str(obligation.get("status") or "estimated"),
            })

    commitment_total = sum(item["amount"] for item in commitments)
    pace = _pace_model(expenses, now)
    projected_days = [now.date() + dt.timedelta(days=i) for i in range(days_left)]
    daily_projection = [pace["ewma_daily"] * pace["weekday_factors"][day.weekday()] for day in projected_days]
    projected_discretionary = sum(daily_projection)
    projection_std = pace["daily_std"] * math.sqrt(max(1, days_left))
    z80 = 1.2815515655446004
    discretionary_low = max(0, projected_discretionary - z80 * projection_std)
    discretionary_high = projected_discretionary + z80 * projection_std
    end_balance = remaining - commitment_total - projected_discretionary
    end_balance_low = remaining - commitment_total - discretionary_high
    end_balance_high = remaining - commitment_total - discretionary_low

    available_for_discretionary = remaining - commitment_total
    if projection_std > 0:
        shortfall_probability = 1 - NormalDist().cdf((available_for_discretionary - projected_discretionary) / projection_std)
    else:
        shortfall_probability = 1.0 if projected_discretionary > available_for_discretionary else 0.0
    shortfall_probability = round(min(1.0, max(0.0, shortfall_probability)), 4)
    safe_daily = max(0, math.floor(available_for_discretionary / max(1, days_left)))
    food_routine = _build_food_routine(
        profile=profile,
        cycle_expenses=cycle_expenses,
        cycle_start=cycle_start,
        cycle_end=cycle_end,
        now=now,
        days_left=days_left,
        safe_daily=safe_daily,
        mess_model=mess_model,
    )

    # Simulate depletion with dated commitments and the projected weekday pace.
    balance = remaining
    commitments_by_day: dict[dt.date, int] = defaultdict(int)
    for item in commitments:
        commitments_by_day[_utc_naive(item["due_at"]).date()] += item["amount"]
    broke_at: Optional[dt.datetime] = None
    for index, day in enumerate(projected_days):
        balance -= commitments_by_day.get(day, 0)
        balance -= daily_projection[index]
        if balance < 0:
            broke_at = dt.datetime.combine(day, dt.time(23, 59, 59))
            break
    runway_days = max(0, (broke_at.date() - now.date()).days) if broke_at else days_left

    ask_home = _round_ask_home(-end_balance_low) if end_balance < 0 else 0
    projected_daily = round(projected_discretionary / max(1, days_left))
    if ask_home:
        action = {"type": "ask_home", "title": f"Ask home for Rs {ask_home // 100:,}", "detail": "This covers the forecast shortfall plus the high-spend side of the confidence range."}
    elif shortfall_probability >= 0.35:
        action = {"type": "slow_down", "title": f"Hold flexible spend near Rs {safe_daily // 100:,}/day", "detail": "The base forecast survives, but the high-spend range can still end below zero."}
    elif commitment_total and safe_daily < projected_daily:
        action = {"type": "review_commitments", "title": "Review the next fixed debit", "detail": "Known subscriptions, mess, exam reserve, or pool shares are reducing today's flexible limit."}
    else:
        action = {"type": "on_track", "title": "Keep the current pace", "detail": "The current forecast reaches reset with a non-negative balance."}

    monthly_discretionary = pace["ewma_daily"] * 30.4375
    monthly_subscriptions = sum(_monthly_subscription_cost(sub) for sub in active_subscriptions)
    if profile.get("mess_enrolled") and mess_model == "monthly":
        monthly_mess = _profile_amount(profile, "mess_monthly_cost")
    elif profile.get("mess_enrolled") and mess_model == "per_meal":
        monthly_mess = _profile_amount(profile, "mess_per_meal_cost") * min(max(int(profile.get("mess_meals_per_day") or 2), 1), 4) * 30.4375
    else:
        monthly_mess = 0
    monthly_spend = monthly_discretionary + monthly_subscriptions + monthly_mess
    horizon_defs = (("next_month", "Next month", 1), ("quarter", "3 months", 3), ("half_year", "6 months", 6), ("year", "1 year", 12))
    horizons = []
    for key, label, months in horizon_defs:
        horizon_days = months * 30.4375
        horizon_std = pace["daily_std"] * math.sqrt(max(1, horizon_days))
        expected_spend = monthly_spend * months
        expected_funding = allowance * months
        balance_mid = expected_funding - expected_spend
        horizons.append({
            "key": key,
            "label": label,
            "months": months,
            "projected_spend": round(expected_spend),
            "projected_funding": round(expected_funding),
            "projected_balance": round(balance_mid),
            "balance_low": round(balance_mid - z80 * horizon_std),
            "balance_high": round(balance_mid + z80 * horizon_std),
            "monthly_shortfall": round(max(0, -balance_mid) / months),
        })

    confidence = _confidence(pace, active_subscriptions, profile)
    commitment_by_kind: dict[str, int] = defaultdict(int)
    for item in commitments:
        commitment_by_kind[item["kind"]] += item["amount"]
    status = "shortfall" if end_balance < 0 else "watch" if shortfall_probability >= 0.35 else "healthy"
    subscription_total = commitment_by_kind.get("subscription", 0)
    pool_total = commitment_by_kind.get("pool", 0)
    exam_total = commitment_by_kind.get("exam_buffer", 0)
    mess_total = commitment_by_kind.get("mess", 0)
    absorbed = [
        {
            "kind": "subscriptions",
            "label": "Subscriptions",
            "amount": subscription_total,
            "detail": "Recurring debits due before reset.",
        },
        {
            "kind": "food_pace",
            "label": "Food pace",
            "amount": food_routine["projected_remaining_food_pace"],
            "daily_amount": food_routine["food_daily_pace"],
            "detail": f"{food_routine['label']} projected from this cycle.",
        },
        {
            "kind": "pool_debts",
            "label": "Pool debts",
            "amount": pool_total,
            "detail": "Pending or estimated shared-cart settlements.",
        },
        {
            "kind": "exam_buffer",
            "label": "Exam buffer",
            "amount": exam_total,
            "detail": "Reserved money for exam-window stability.",
        },
        {
            "kind": "safe_daily",
            "label": "Safe/day",
            "amount": safe_daily,
            "daily_amount": safe_daily,
            "detail": "What remains per day after spend, commitments, and buffers.",
        },
    ]
    reserved_labels = []
    if subscription_total:
        reserved_labels.append("subscriptions")
    if mess_total:
        reserved_labels.append("mess")
    if pool_total:
        reserved_labels.append("pool debts")
    if exam_total:
        reserved_labels.append("exam buffer")
    reserved_text = ", ".join(reserved_labels) if reserved_labels else "known reserves"

    next_best_action = action
    food_action = food_routine.get("action") or {}
    if action["type"] not in {"ask_home"} and int(food_action.get("impact") or 0) > 0:
        next_best_action = {
            "type": food_action.get("type") or "food_pace",
            "title": food_action.get("title") or "Stabilize food pace",
            "detail": food_action.get("detail") or "Food pace is the fastest lever to extend runway this cycle.",
            "impact": int(food_action.get("impact") or 0),
        }
    elif action["type"] == "on_track" and pool_total:
        next_best_action = {
            "type": "settle_pool",
            "title": "Confirm pending pool shares",
            "detail": "Settling shared-cart dues keeps the safe/day number accurate before the next reset.",
            "impact": pool_total,
        }
    else:
        next_best_action = {**action, "impact": ask_home or max(0, projected_daily - safe_daily) * days_left}

    return {
        "generated_at": now.isoformat() + "Z",
        "status": status,
        "current_cycle": {
            "start": cycle_start.isoformat() + "Z",
            "end": cycle_end.isoformat() + "Z",
            "days_left": days_left,
            "monthly_allowance": allowance,
            "additional_income": additional_income,
            "available_funding": funding,
            "spent": spent,
            "committed_spent": committed_spent,
            "discretionary_spent": discretionary_spent,
            "remaining": remaining,
        },
        "commitments": {
            "total": commitment_total,
            "by_kind": dict(commitment_by_kind),
            "items": [{**item, "due_at": _utc_naive(item["due_at"]).isoformat() + "Z"} for item in sorted(commitments, key=lambda entry: entry["due_at"])],
        },
        "projection": {
            "days_until_broke": runway_days,
            "broke_at": broke_at.isoformat() + "Z" if broke_at else None,
            "safe_daily_spend": safe_daily,
            "projected_daily_spend": projected_daily,
            "projected_discretionary": round(projected_discretionary),
            "forecast_end_balance": round(end_balance),
            "balance_low": round(end_balance_low),
            "balance_high": round(end_balance_high),
            "shortfall_probability": shortfall_probability,
            "ask_home_amount": ask_home,
        },
        "spend_split": {
            "committed": committed_spent + commitment_total,
            "flexible": discretionary_spent + round(projected_discretionary),
        },
        "food_routine": food_routine,
        "decision_engine": {
            "summary": f"Runway leaves Rs {safe_daily // 100:,}/day after reserving {reserved_text} and tracking food at Rs {food_routine['food_daily_pace'] // 100:,}/day.",
            "absorbed": absorbed,
            "next_best_action": next_best_action,
        },
        "action": action,
        "confidence": confidence,
        "horizons": horizons,
        "methodology": {
            "model": "weekday_adjusted_ewma",
            "lookback_days": 56,
            "ewma_alpha": 0.24,
            "range": "80_percent",
            "notes": [
                "Calculations are deterministic; AI does not decide financial values.",
                "Duplicates, failed/reversed events, credits, and committed historical spend are excluded from flexible-spend pace.",
                "Food pace is separated into delivery, campus meals, and grocery/cooking patterns so hostel, PG, day-scholar, and mixed routines are handled differently.",
                "The ask-home amount is shown only when the base forecast is negative and is rounded up to Rs 100.",
            ],
        },
    }
