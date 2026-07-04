"""Wellness signal engine (feature 7.7).

Deterministic-first design: this module computes wellness *signals* from real
spend/meal/exam/social data, then optionally lets Bedrock narrate a warm,
supportive check-in. The engine never diagnoses — it detects risk patterns and
offers a supportive check-in with concrete, campus-relevant resets.

Consumers:
  - app/api/insights.py  -> legacy /api/insights/wellness (dashboard card)
  - app/api/wellness.py   -> /api/wellness/* (the Wellness Companion feature)
"""

import calendar
import datetime
import re
from typing import Any, Optional


# ── Cycle helpers ──────────────────────────────────────────────────────────
def get_cycle_start(cycle_start_day: int, now: datetime.datetime) -> datetime.datetime:
    y, m, d = now.year, now.month, now.day
    try:
        candidate = datetime.datetime(y, m, cycle_start_day, 0, 0, 0)
    except ValueError:
        _, max_days = calendar.monthrange(y, m)
        candidate = datetime.datetime(y, m, min(cycle_start_day, max_days), 0, 0, 0)

    if d >= candidate.day:
        return candidate

    prev_m = m - 1 if m > 1 else 12
    prev_y = y if m > 1 else y - 1
    try:
        return datetime.datetime(prev_y, prev_m, cycle_start_day, 0, 0, 0)
    except ValueError:
        _, max_days = calendar.monthrange(prev_y, prev_m)
        return datetime.datetime(prev_y, prev_m, min(cycle_start_day, max_days), 0, 0, 0)


def get_cycle_end(cycle_start: datetime.datetime) -> datetime.datetime:
    return cycle_start + datetime.timedelta(days=30)


def _severity_of(value: float, watch: float, stressed: float, invert: bool = False) -> str:
    """Return ok/watch/stressed. If invert, lower values are worse."""
    if invert:
        if value < stressed:
            return "stressed"
        if value < watch:
            return "watch"
        return "ok"
    if value > stressed:
        return "stressed"
    if value > watch:
        return "watch"
    return "ok"


async def compute_wellness(db, user_id: str) -> dict[str, Any]:
    """Compute the full wellness signal package for a user.

    Returns a dict that is backward-compatible with the legacy dashboard card
    (score/status/label/message/signals/generated_by/avg_food_gap_hours_7d) and
    additionally exposes a `metrics` block with the raw values the Wellness
    Companion feature builds resets and support decisions from.
    """
    now = datetime.datetime.utcnow()

    since = now - datetime.timedelta(days=60)
    cursor = db.transactions.find(
        {"user_id": user_id, "created_at": {"$gte": since}}
    ).sort("created_at", -1)
    txns = await cursor.to_list(length=2000)

    profile = await db.profiles.find_one({"_id": user_id}) or {}

    # 1. Late-night activity (last 7 days, 00:00–05:00) — sleep-disruption proxy
    since_7 = now - datetime.timedelta(days=7)
    late_txns_7d = [
        t for t in txns
        if t.get("created_at") and t["created_at"] >= since_7 and 0 <= t["created_at"].hour < 5
    ]
    late_night_spend_7d = len(late_txns_7d)

    # 2. Meal regularity — average gap between food transactions over 7 days
    food_txns_7d = [
        t for t in txns
        if t.get("category") == "food" and t.get("created_at") and t["created_at"] >= since_7
    ]
    food_txns_7d.sort(key=lambda t: t["created_at"])
    if food_txns_7d:
        gaps_7d = [
            (food_txns_7d[i]["created_at"] - food_txns_7d[i - 1]["created_at"]).total_seconds() / 3600.0
            for i in range(1, len(food_txns_7d))
        ]
        gaps_7d.append((now - food_txns_7d[-1]["created_at"]).total_seconds() / 3600.0)
        avg_food_gap_hours_7d = sum(gaps_7d) / len(gaps_7d)
        current_food_gap_hours = (now - food_txns_7d[-1]["created_at"]).total_seconds() / 3600.0
    else:
        avg_food_gap_hours_7d = 168.0
        current_food_gap_hours = 168.0

    # 3. Financial runway & safe daily limit
    cycle_start_day = profile.get("cycle_start_day") or 1
    monthly_allowance = profile.get("monthly_allowance") or 1000000  # paise
    total_allowance_rs = monthly_allowance / 100

    cycle_start = get_cycle_start(cycle_start_day, now)
    cycle_end = get_cycle_end(cycle_start)

    cycle_txns = [t for t in txns if t.get("created_at") and t["created_at"] >= cycle_start]
    total_spent_rs = sum(t.get("amount", 0) for t in cycle_txns) / 100
    remaining_rs = max(0.0, total_allowance_rs - total_spent_rs)

    days_since_start = max(1, (now - cycle_start).days)
    avg_daily_spend_rs = total_spent_rs / days_since_start
    days_left = max(1, (cycle_end - now).days)

    runway_days = int(remaining_rs / avg_daily_spend_rs) if avg_daily_spend_rs > 0 else days_left
    runway_days = min(runway_days, days_left + 5)
    safe_daily_limit_rs = remaining_rs / days_left

    # 4. Spending velocity (recent daily pace vs safe target)
    spend_7_rs = sum(
        t.get("amount", 0) for t in txns if t.get("created_at") and t["created_at"] >= since_7
    ) / 100.0
    avg_daily_spend_7d_rs = spend_7_rs / 7.0
    if safe_daily_limit_rs > 0:
        spend_velocity = avg_daily_spend_7d_rs / safe_daily_limit_rs
    else:
        spend_velocity = 1.5 if avg_daily_spend_7d_rs > 0 else 0.0

    # 5. Exam window
    in_exam_period = False
    exam_days_left: Optional[int] = None
    exam_start = profile.get("exam_start_date")
    exam_end = profile.get("exam_end_date")
    if exam_start and exam_end:
        try:
            es = datetime.datetime.fromisoformat(str(exam_start))
            ee = datetime.datetime.fromisoformat(str(exam_end) + "T23:59:59")
            if es <= now <= ee:
                in_exam_period = True
                exam_days_left = (ee - now).days
        except Exception:
            pass

    # 6. Social signal — days since last cart-pool participation (withdrawal proxy)
    user_doc = await db.users.find_one({"_id": user_id})
    full_name = user_doc.get("full_name", "") if user_doc else ""
    user_hosted_pools = await db.cart_pools.find({"host_id": user_id}).to_list(length=100)
    participated_pool_ids: list = []
    if full_name:
        name_regex = re.compile(f"^{re.escape(full_name)}$", re.IGNORECASE)
        user_items = await db.cart_pool_items.find({"added_by_name": name_regex}).to_list(length=500)
        participated_pool_ids = [item["pool_id"] for item in user_items]

    all_pool_ids = list({p["_id"] for p in user_hosted_pools} | set(participated_pool_ids))
    days_since_last_pool: Optional[int] = None
    if all_pool_ids:
        latest_pools = await db.cart_pools.find(
            {"_id": {"$in": all_pool_ids}}
        ).sort("created_at", -1).to_list(length=1)
        if latest_pools and latest_pools[0].get("created_at"):
            days_since_last_pool = (now - latest_pools[0]["created_at"]).days

    # ── Wellness score (deterministic, explainable) ──────────────────────────
    # Every deduction is attributed to a *driver* bucket so we can tell the
    # student WHAT is pressuring them — the money-vs-routine-vs-academic split is
    # PocketBuddy's differentiator: only a money app that also reads routine can
    # say "this week's stress is mostly financial."
    score = 100
    driver_points = {"money": 0, "routine": 0, "academic": 0}

    def deduct(points: int, driver: str) -> None:
        nonlocal score
        score -= points
        driver_points[driver] += points

    if late_night_spend_7d > 3:
        deduct(20, "routine")
    elif late_night_spend_7d > 1:
        deduct(10, "routine")

    if avg_food_gap_hours_7d > 10:
        deduct(20, "routine")
    elif avg_food_gap_hours_7d > 6:
        deduct(10, "routine")

    if runway_days < 5:
        deduct(20, "money")
    elif runway_days < 10:
        deduct(10, "money")

    if in_exam_period:
        deduct(15, "academic")

    if spend_velocity > 1.4:
        deduct(15, "money")
    elif spend_velocity > 1.2:
        deduct(8, "money")

    score = max(0, min(100, score))

    if score >= 70:
        status = "steady"
        label = "Stable routine"
        message = (
            "Your routine looks steady this week. Keep meals regular and stay "
            "within today's safe spend target."
        )
    elif score >= 50:
        status = "watch"
        label = "Needs attention"
        message = (
            "A few patterns need attention: your food timing, spending pace, or "
            "exam pressure is starting to stack up. Pick one reset today: a proper "
            "meal, a low-spend window, or a short break."
        )
    else:
        status = "stressed"
        label = "Reset suggested"
        message = (
            "Your recent spending or routine pattern suggests a reset. You do not need "
            "to adjust everything today; start with one proper meal and one planned spend "
            "decision, then check in again."
        )

    # ── Signals (same shape the dashboard already consumes) ───────────────────
    signals = []

    food_gap_sev = _severity_of(avg_food_gap_hours_7d, 6, 10)
    signals.append({
        "key": "food_gap",
        "label": "Avg food gap",
        "value": f"{avg_food_gap_hours_7d:.1f}h" if avg_food_gap_hours_7d < 168.0 else "—",
        "severity": food_gap_sev,
        "detail": "Long gaps between meals detected" if food_gap_sev != "ok" else "Regular meal timing",
    })

    runway_sev = _severity_of(runway_days, 10, 5, invert=True)
    signals.append({
        "key": "runway",
        "label": "Runway",
        "value": f"{runway_days} days",
        "severity": runway_sev,
        "detail": "Allowance may not last the cycle" if runway_sev != "ok" else "Runway looks stable",
    })

    late_sev = _severity_of(late_night_spend_7d, 1, 3)
    signals.append({
        "key": "late_night",
        "label": "Late-night spending",
        "value": f"{late_night_spend_7d} txns",
        "severity": late_sev,
        "detail": "Frequent late-night activity" if late_sev != "ok" else "Healthy nighttime routine",
    })

    vel_sev = _severity_of(spend_velocity, 1.2, 1.4)
    signals.append({
        "key": "velocity",
        "label": "Spend velocity",
        "value": f"{spend_velocity:.2f}x",
        "severity": vel_sev,
        "detail": (
            "Spending is accelerating rapidly" if vel_sev == "stressed"
            else "Spending is slightly elevated" if vel_sev == "watch"
            else "Spending velocity is stable"
        ),
    })

    exam_sev = "stressed" if in_exam_period else "ok"
    signals.append({
        "key": "exam",
        "label": "Exam period",
        "value": "Active" if in_exam_period else "No",
        "severity": exam_sev,
        "detail": "Active exam schedule" if in_exam_period else "No exams active",
    })

    signals.append({
        "key": "cart_pool",
        "label": "Shared-order activity",
        "value": f"{days_since_last_pool}d idle" if days_since_last_pool is not None else "None",
        "severity": "ok",
        "detail": "No recent cart pool orders" if (days_since_last_pool is not None and days_since_last_pool > 7) else "Regular shared orders",
    })

    # ── Stress-source attribution (the standout insight) ─────────────────────
    driver_meta = {
        "money": {"label": "Money", "color": "#ef4444"},
        "routine": {"label": "Routine", "color": "#f59e0b"},
        "academic": {"label": "Academics", "color": "#8b5cf6"},
    }
    total_deducted = sum(driver_points.values())
    drivers = []
    if total_deducted > 0:
        for key, pts in driver_points.items():
            if pts > 0:
                drivers.append({
                    "key": key,
                    "label": driver_meta[key]["label"],
                    "color": driver_meta[key]["color"],
                    "points": pts,
                    "pct": round(pts / total_deducted * 100),
                })
        drivers.sort(key=lambda d: -d["points"])

    primary_driver = drivers[0]["key"] if drivers else None
    driver_summary = {
        "money": "Most of this week's pressure looks financial — your runway and spending pace are the biggest factors.",
        "routine": "Most of this week's pressure is routine-related — meal timing and late nights are adding up.",
        "academic": "Exam pressure is the biggest factor this week. Protecting meals and sleep matters most right now.",
    }.get(primary_driver, "Your money, meals, and routine all look balanced this week.")

    return {
        "score": score,
        "status": status,
        "label": label,
        "message": message,
        "signals": signals,
        "drivers": drivers,
        "primary_driver": primary_driver,
        "driver_summary": driver_summary,
        "generated_by": "local_rules",
        "avg_food_gap_hours_7d": round(avg_food_gap_hours_7d, 1),
        "metrics": {
            "late_night_spend_7d": late_night_spend_7d,
            "avg_food_gap_hours_7d": round(avg_food_gap_hours_7d, 1),
            "current_food_gap_hours": round(current_food_gap_hours, 1),
            "runway_days": runway_days,
            "safe_daily_limit_rs": round(safe_daily_limit_rs, 1),
            "remaining_rs": round(remaining_rs, 1),
            "spend_velocity": round(spend_velocity, 2),
            "in_exam_period": in_exam_period,
            "exam_days_left": exam_days_left,
            "days_since_last_pool": days_since_last_pool,
            "hour": now.hour,
            "has_data": len(txns) > 0,
        },
    }


# ── Reset actions ───────────────────────────────────────────────────────────
# Each reset is a small, concrete, campus-relevant next step. `kind` tells the
# frontend whether to navigate ("link") or log a check-in in place ("checkin").
def build_reset_actions(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    m = metrics

    # Meal reminder — driven by food gap / late-night pattern
    if m["avg_food_gap_hours_7d"] > 6 or m["current_food_gap_hours"] > 6:
        actions.append({
            "key": "eat_something",
            "icon": "utensils",
            "title": "Have a proper meal",
            "body": (
                f"It's been about {int(m['current_food_gap_hours'])}h since your last "
                "food spend. Mess, home food, or a simple canteen plate works."
            ),
            "kind": "checkin",
            "checkin_response": "wellness_ate",
            "cta": "I just ate",
        })

    # Spending reset — driven by velocity / runway
    if m["spend_velocity"] > 1.2 or m["runway_days"] < 10:
        safe = m["safe_daily_limit_rs"]
        actions.append({
            "key": "plan_spend",
            "icon": "wallet",
            "title": "Set today's spend window",
            "body": (
                f"Your safe spend today is about ₹{int(safe)}. Planning one low-spend "
                "day resets the pace without feeling restrictive."
            ),
            "kind": "checkin",
            "checkin_response": "wellness_plan_spending",
            "cta": "I'll plan my spends",
        })

    # Split instead of solo order — social + budget
    actions.append({
        "key": "join_pool",
        "icon": "users",
        "title": "Split an order with your wing",
        "body": (
            "Craving something? Joining a wing cart pool splits delivery fees and "
            "keeps you connected instead of ordering solo."
        ),
        "kind": "link",
        "to": "/pool",
        "cta": "Open pools",
    })

    # Negotiate travel — surfaces when budget is tight
    if m["runway_days"] < 12 or m["spend_velocity"] > 1.2:
        actions.append({
            "key": "travel_fair",
            "icon": "compass",
            "title": "Check a fair fare before you travel",
            "body": (
                "Heading out? A quick fare check avoids overpaying and protects the "
                "runway you have left this cycle."
            ),
            "kind": "link",
            "to": "/travel",
            "cta": "Open travel guard",
        })

    # Take a break — exam / late-night pressure
    if m["in_exam_period"] or m["late_night_spend_7d"] > 1:
        actions.append({
            "key": "take_break",
            "icon": "coffee",
            "title": "Take a 15-minute reset",
            "body": (
                "Step away from the screen, stretch, get some water. Short breaks "
                "beat long late-night stretches during a heavy week."
            ),
            "kind": "checkin",
            "checkin_response": "wellness_need_break",
            "cta": "I'll take a break",
        })

    return actions


# ── Campus support resources ("talk to someone") ─────────────────────────────
# Real, verifiable India-wide student mental-health support lines. Campus
# counsellor detail is filled from the profile when available.
NATIONAL_SUPPORT = [
    {
        "name": "Tele-MANAS (Govt. of India)",
        "detail": "24x7 national mental-health support helpline",
        "contact": "14416",
        "kind": "call",
    },
    {
        "name": "KIRAN Mental Health Helpline",
        "detail": "24x7 toll-free, multilingual support",
        "contact": "1800-599-0019",
        "kind": "call",
    },
    {
        "name": "iCall Psychosocial Helpline (TISS)",
        "detail": "Counsellor support, Mon–Sat 8am–10pm",
        "contact": "9152987821",
        "kind": "call",
    },
]


def build_support_resources(profile: dict[str, Any]) -> list[dict[str, Any]]:
    resources: list[dict[str, Any]] = []
    college = (profile or {}).get("college_name")
    if college:
        resources.append({
            "name": f"{college} student counselling",
            "detail": "Most campuses offer free, confidential counselling. Check your student portal or wellness cell.",
            "contact": None,
            "kind": "campus",
        })
    resources.extend(NATIONAL_SUPPORT)
    return resources


# ── Bedrock supportive narration (deterministic fallback) ────────────────────
def _elevated_summary(signals: list[dict[str, Any]]) -> str:
    parts = []
    for s in signals:
        if s.get("severity") in ("watch", "stressed"):
            parts.append(f"{s['label'].lower()} ({s['value']})")
    return ", ".join(parts) if parts else "nothing standing out"


def generate_supportive_message(package: dict[str, Any], profile: dict[str, Any]) -> tuple[str, str]:
    """Return (message, source). Bedrock narrates; falls back to rules on failure."""
    status = package["status"]
    signals = package["signals"]
    metrics = package["metrics"]

    if not metrics.get("has_data"):
        return (
            "There isn't much activity to read yet. Once a few days of spends come "
            "in, I'll give you a gentle read on how your week is going.",
            "local_rules",
        )

    elevated = _elevated_summary(signals)
    primary = package.get("primary_driver")

    prompt = f"""You are PocketBuddy, a warm, supportive companion for an Indian college student.
Write a short check-in (2-3 sentences, max 55 words) about how their week looks based strictly on spending pace, meal gaps, and study/exam routine.

Rules:
- Keep the message focused strictly on money behavior, routine signals, and simple corrective resets.
- DO NOT use therapy-style or soothing language.
- DO NOT diagnose, and DO NOT use clinical words like burnout, depression, anxiety, disorder, stress patterns.
- Do not be preachy or alarmist. No emojis. No markdown.
- Name the main source of pressure (e.g. money or meals) in plain words, then point to ONE small next step.

Overall read: {status}. Main pressure source: {primary or "nothing in particular"}.
Patterns worth noting: {elevated}.
Food gap: {metrics['avg_food_gap_hours_7d']}h. Runway: {metrics['runway_days']} days left.
Late-night activity (7d): {metrics['late_night_spend_7d']}. Exam period: {metrics['in_exam_period']}.

Write only the message text."""

    try:
        from app.services.bedrock import generate_text

        text = generate_text(prompt, max_tokens=120, temperature=0.5)
        if text:
            return text.strip(), "bedrock"
    except Exception:
        pass

    return package["message"], "local_rules"


# ── AI Care Plan (on-demand, deeper supportive plan) ─────────────────────────
def _fallback_care_plan(package: dict[str, Any]) -> dict[str, Any]:
    m = package["metrics"]
    primary = package.get("primary_driver")

    steps: list[str] = []
    if m["avg_food_gap_hours_7d"] > 6 or m["current_food_gap_hours"] > 6:
        steps.append("Eat a proper meal in the next hour — mess, home food, or a simple canteen plate works.")
    if m["spend_velocity"] > 1.2 or m["runway_days"] < 10:
        steps.append(f"Pick one low-spend window today and keep spends under about ₹{int(m['safe_daily_limit_rs'])}.")
    if m["in_exam_period"] or m["late_night_spend_7d"] > 1:
        steps.append("Take a real 15-minute break away from screens, and aim to wind down earlier tonight.")
    if len(steps) < 3:
        steps.append("Message one friend or wingmate — a short chat is a good way to take a quick break.")
    steps = steps[:3]

    focus_by_driver = {
        "money": "Ease the money pressure with one planned, low-spend day.",
        "routine": "Get your meals and sleep back to a steady rhythm.",
        "academic": "Protect meals and rest so exam prep stays sustainable.",
    }

    return {
        "affirmation": "Small adjustments to your daily routine can help reset your spending and meal timing today.",
        "focus": focus_by_driver.get(primary, "Keep your simple routine steady — meals, rest, and mindful spends."),
        "steps": steps,
        "meal_tip": f"It's been about {int(m['current_food_gap_hours'])}h since your last food spend — a simple meal works." if m["current_food_gap_hours"] > 5 else "Your meal timing looks okay — keep it steady.",
        "rest_tip": "Try a screens-off wind-down 30 minutes before bed tonight." if m["late_night_spend_7d"] > 1 else "Your nights look calm — protect that sleep window.",
        "money_tip": f"About ₹{int(m['safe_daily_limit_rs'])} keeps you on track today; shared ordering can stretch it further." if m["runway_days"] < 12 else "Your runway looks stable — no money pressure to add stress today.",
        "source": "local_rules",
    }


def generate_care_plan(package: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    """Deeper, structured supportive plan. Bedrock writes it; rules back it up."""
    if not package["metrics"].get("has_data"):
        plan = _fallback_care_plan(package)
        plan["affirmation"] = "There isn't much to read yet — log a few days of spends and I'll build you a fuller plan."
        return plan

    m = package["metrics"]
    prompt = f"""You are PocketBuddy, a warm, supportive companion for an Indian college student.
Create a short, practical care plan for today based strictly on spending pace, meal gaps, and study/exam routine. Output ONLY JSON (no markdown fences) with keys:
"affirmation" (1 simple sentence focusing on small adjustments, no clinical words, no therapy-style/soothing language), "focus" (1 sentence, the single most useful focus today),
"steps" (array of exactly 3 short, concrete actions), "meal_tip", "rest_tip", "money_tip" (each 1 short sentence).

Rules: caring and encouraging, use "you", never diagnose, no words like burnout/anxiety/depression/disorder/stress patterns,
no emojis, no markdown. Focus on concrete spending, meal, and routine signals, not therapy. Ground it in the data below.

Overall read: {package['status']}. Main pressure source: {package.get('primary_driver')}.
Food gap avg: {m['avg_food_gap_hours_7d']}h, current gap: {m['current_food_gap_hours']}h.
Runway: {m['runway_days']} days, safe daily spend: about ₹{int(m['safe_daily_limit_rs'])}.
Late-night activity (7d): {m['late_night_spend_7d']}. Exam period: {m['in_exam_period']}. Spend pace: {m['spend_velocity']}x."""

    try:
        from app.services.bedrock import generate_json

        data = generate_json(prompt, max_tokens=500, temperature=0.5)
        steps = data.get("steps") or []
        if isinstance(steps, list) and len(steps) >= 2:
            return {
                "affirmation": str(data.get("affirmation") or "").strip() or _fallback_care_plan(package)["affirmation"],
                "focus": str(data.get("focus") or "").strip() or _fallback_care_plan(package)["focus"],
                "steps": [str(s).strip() for s in steps[:3] if str(s).strip()],
                "meal_tip": str(data.get("meal_tip") or "").strip(),
                "rest_tip": str(data.get("rest_tip") or "").strip(),
                "money_tip": str(data.get("money_tip") or "").strip(),
                "source": "bedrock",
            }
    except Exception:
        pass

    return _fallback_care_plan(package)
