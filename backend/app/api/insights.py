from fastapi import APIRouter, Depends
from app.core.database import get_db
from app.core.security import get_current_user
import datetime

router = APIRouter()

def _to_dict(doc):
    if not doc:
        return doc
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d.pop("_id"))
    for k, v in d.items():
        if isinstance(v, datetime.datetime):
            d[k] = v.isoformat()
    return d

@router.get("")
async def get_insights(user_id: str = Depends(get_current_user)):
    db = get_db()

    # Fetch last 60 days of transactions
    since = datetime.datetime.utcnow() - datetime.timedelta(days=60)
    cursor = db.transactions.find({"user_id": user_id, "created_at": {"$gte": since}}).sort("created_at", -1)
    txns = await cursor.to_list(length=2000)

    # Fetch profile for exam dates
    profile = await db.profiles.find_one({"_id": user_id})

    now = datetime.datetime.utcnow()

    # ── Category breakdown (last 30 days) ─────────────────────────────────
    since_30 = now - datetime.timedelta(days=30)
    cat_totals: dict[str, int] = {}
    for t in txns:
        if t.get("created_at", now) >= since_30:
            cat = t.get("category") or "other"
            cat_totals[cat] = cat_totals.get(cat, 0) + (t.get("amount") or 0)
    total_30 = sum(cat_totals.values()) or 1
    category_breakdown = [
        {"category": k, "amount_paise": v, "pct": round(v / total_30 * 100)}
        for k, v in sorted(cat_totals.items(), key=lambda x: -x[1])
    ]

    # ── Daily spend last 7 days ────────────────────────────────────────────
    daily_spend = []
    for i in range(6, -1, -1):
        day = now - datetime.timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + datetime.timedelta(days=1)
        total = sum(
            t.get("amount", 0) for t in txns
            if day_start <= t.get("created_at", now) < day_end
        )
        daily_spend.append({
            "date": day_start.strftime("%a"),
            "amount_paise": total,
        })

    # ── Late-night spend (11pm – 4am) ──────────────────────────────────────
    late_txns = [
        t for t in txns
        if t.get("created_at") and (
            t["created_at"].hour >= 23 or t["created_at"].hour < 4
        )
    ]
    late_night_total_paise = sum(t.get("amount", 0) for t in late_txns)
    late_night_txn_count = len(late_txns)

    # ── Food gap analysis ──────────────────────────────────────────────────
    food_txns = [t for t in txns if t.get("category") == "food"]
    if food_txns:
        last_food = food_txns[0]  # already sorted desc
        food_gap_hours = (now - last_food["created_at"]).total_seconds() / 3600
        # Average daily food spend
        food_30 = [t for t in food_txns if t.get("created_at", now) >= since_30]
        avg_daily_food = sum(t.get("amount", 0) for t in food_30) / 30
    else:
        food_gap_hours = 0.0
        avg_daily_food = 0.0

    # ── Spending velocity (avg of last 7 days vs prior 7 days) ────────────
    since_7 = now - datetime.timedelta(days=7)
    since_14 = now - datetime.timedelta(days=14)
    spend_7 = sum(t.get("amount", 0) for t in txns if t.get("created_at", now) >= since_7)
    spend_7_prior = sum(
        t.get("amount", 0) for t in txns
        if since_14 <= t.get("created_at", now) < since_7
    )
    velocity_pct = 0
    if spend_7_prior > 0:
        velocity_pct = round((spend_7 - spend_7_prior) / spend_7_prior * 100)

    # ── Exam stress signal ─────────────────────────────────────────────────
    in_exam_period = False
    exam_days_left = None
    if profile:
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

    # ── Mess vs delivery ratio ─────────────────────────────────────────────
    delivery_keywords = ["blinkit", "zepto", "swiggy", "zomato", "instamart", "dunzo"]
    delivery_txns = [
        t for t in food_txns
        if any(kw in (t.get("raw_merchant_string") or "").lower() for kw in delivery_keywords)
        or any(kw in (t.get("mapped_merchant_name") or "").lower() for kw in delivery_keywords)
    ]
    delivery_count = len(delivery_txns)
    mess_count = max(0, len(food_txns) - delivery_count)
    delivery_spend_paise = sum(t.get("amount", 0) for t in delivery_txns)

    # ── Subscription bleed ─────────────────────────────────────────────────
    subs_cursor = db.subscriptions.find({"user_id": user_id, "is_active": {"$ne": False}})
    subs = await subs_cursor.to_list(length=100)
    monthly_sub_bleed = sum(s.get("amount", 0) for s in subs)

    return {
        "category_breakdown": category_breakdown,
        "daily_spend_7d": daily_spend,
        "late_night": {
            "total_paise": late_night_total_paise,
            "txn_count": late_night_txn_count,
        },
        "food": {
            "gap_hours": round(food_gap_hours, 1),
            "avg_daily_paise": round(avg_daily_food),
            "delivery_count_30d": delivery_count,
            "mess_count_30d": mess_count,
            "delivery_spend_paise": delivery_spend_paise,
        },
        "velocity": {
            "pct_change": velocity_pct,
            "spend_7d_paise": spend_7,
            "spend_prior_7d_paise": spend_7_prior,
        },
        "exam": {
            "in_exam_period": in_exam_period,
            "days_left": exam_days_left,
        },
        "subscriptions": {
            "monthly_bleed_paise": monthly_sub_bleed,
            "count": len(subs),
        },
    }


@router.get("/wing-feed")
async def get_wing_feed(user_id: str = Depends(get_current_user)):
    """Returns anonymized activity events across the campus for the Wing Activity Feed."""
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    wing = profile.get("wing_label") if profile else None

    events = []
    now = datetime.datetime.utcnow()
    since = now - datetime.timedelta(hours=24)

    # Recent pools (any wing)
    pool_cursor = db.cart_pools.find({"created_at": {"$gte": since}}).sort("created_at", -1).limit(5)
    pools = await pool_cursor.to_list(length=5)
    for p in pools:
        wing_label = p.get("wing_label", "unknown wing")
        platform = p.get("platform", "delivery").replace("_", " ")
        created_at = p.get("created_at", now)
        mins_ago = int((now - created_at).total_seconds() / 60)
        events.append({
            "type": "pool_created",
            "icon": "🛒",
            "text": f"New {platform} pool started in {wing_label}",
            "mins_ago": mins_ago,
        })

    # Recent merchant mappings (crowdsourced)
    dir_cursor = db.merchant_directory.find({"updated_at": {"$gte": since}}).sort("updated_at", -1).limit(5)
    dirs = await dir_cursor.to_list(length=5)
    for d in dirs:
        updated_at = d.get("updated_at", now)
        mins_ago = int((now - updated_at).total_seconds() / 60)
        name = d.get("display_name", "a merchant")
        events.append({
            "type": "merchant_mapped",
            "icon": "📍",
            "text": f"'{name}' was identified and added to the campus directory",
            "mins_ago": mins_ago,
        })

    # Recent check-ins (anonymized)
    ck_cursor = db.checkin_logs.find({"created_at": {"$gte": since}}).sort("created_at", -1).limit(3)
    cks = await ck_cursor.to_list(length=3)
    for ck in cks:
        created_at = ck.get("created_at", now)
        mins_ago = int((now - created_at).total_seconds() / 60)
        response = ck.get("response", "ate")
        if response == "ate":
            text = "A student checked in — ate at campus mess"
            icon = "🍽️"
        elif response == "travel_fare_report":
            text = ck.get("stress_note", "New travel fare report submitted")
            icon = "🗺️"
        elif response == "travel_savings":
            text = ck.get("stress_note", "Saved money on travel fare negotiation")
            icon = "💰"
        else:
            text = "A student checked in — reported skipping a meal during exam period"
            icon = "⚠️"
            
        events.append({
            "type": "checkin",
            "icon": icon,
            "text": text,
            "mins_ago": mins_ago,
        })


    # Sort all events by recency
    events.sort(key=lambda e: e["mins_ago"])

    return {"events": events[:8], "wing": wing}


def get_cycle_start(cycle_start_day: int, now: datetime.datetime) -> datetime.datetime:
    y = now.year
    m = now.month
    d = now.day
    try:
        candidate = datetime.datetime(y, m, cycle_start_day, 0, 0, 0)
    except ValueError:
        import calendar
        _, max_days = calendar.monthrange(y, m)
        candidate = datetime.datetime(y, m, min(cycle_start_day, max_days), 0, 0, 0)
        
    if d >= candidate.day:
        return candidate
        
    prev_m = m - 1 if m > 1 else 12
    prev_y = y if m > 1 else y - 1
    try:
        return datetime.datetime(prev_y, prev_m, cycle_start_day, 0, 0, 0)
    except ValueError:
        import calendar
        _, max_days = calendar.monthrange(prev_y, prev_m)
        return datetime.datetime(prev_y, prev_m, min(cycle_start_day, max_days), 0, 0, 0)


def get_cycle_end(cycle_start: datetime.datetime) -> datetime.datetime:
    return cycle_start + datetime.timedelta(days=30)


@router.get("/wellness")
async def get_wellness_insights(user_id: str = Depends(get_current_user)):
    db = get_db()
    now = datetime.datetime.utcnow()

    # Fetch last 60 days of transactions
    since = now - datetime.timedelta(days=60)
    cursor = db.transactions.find({"user_id": user_id, "created_at": {"$gte": since}}).sort("created_at", -1)
    txns = await cursor.to_list(length=2000)

    # Fetch user profile
    profile = await db.profiles.find_one({"_id": user_id})
    if not profile:
        profile = {}

    # 1. Late-night activity (last 7 days, hours 0 to 4)
    since_7 = now - datetime.timedelta(days=7)
    late_txns_7d = [
        t for t in txns
        if t.get("created_at") and t["created_at"] >= since_7 and (
            0 <= t["created_at"].hour < 5
        )
    ]
    late_night_spend_7d = len(late_txns_7d)

    # 2. Meal regularity: avg_food_gap_hours_7d
    food_txns_7d = [
        t for t in txns
        if t.get("category") == "food" and t.get("created_at") and t["created_at"] >= since_7
    ]
    food_txns_7d.sort(key=lambda t: t["created_at"])
    
    gaps_7d = []
    if len(food_txns_7d) > 0:
        for i in range(1, len(food_txns_7d)):
            gap = (food_txns_7d[i]["created_at"] - food_txns_7d[i-1]["created_at"]).total_seconds() / 3600.0
            gaps_7d.append(gap)
        current_gap = (now - food_txns_7d[-1]["created_at"]).total_seconds() / 3600.0
        gaps_7d.append(current_gap)
        avg_food_gap_hours_7d = sum(gaps_7d) / len(gaps_7d)
    else:
        avg_food_gap_hours_7d = 168.0

    # 3. Financial runway & safe daily limit
    cycle_start_day = profile.get("cycle_start_day") or 1
    monthly_allowance = profile.get("monthly_allowance") or 1000000  # in paise
    total_allowance_rs = monthly_allowance / 100

    cycle_start = get_cycle_start(cycle_start_day, now)
    cycle_end = get_cycle_end(cycle_start)

    cycle_txns = [t for t in txns if t.get("created_at") and t["created_at"] >= cycle_start]
    total_spent_rs = sum(t.get("amount", 0) for t in cycle_txns) / 100
    remaining_rs = max(0.0, total_allowance_rs - total_spent_rs)

    days_since_start = max(1, (now - cycle_start).days)
    avg_daily_spend_rs = total_spent_rs / days_since_start
    days_left = max(0, (cycle_end - now).days)

    if avg_daily_spend_rs > 0:
        runway_days = int(remaining_rs / avg_daily_spend_rs)
    else:
        runway_days = days_left

    runway_days = min(runway_days, days_left + 5)
    
    # safe_daily_limit_rs
    safe_daily_limit_rs = remaining_rs / days_left if days_left > 0 else 0.0

    # 4. Spending velocity
    spend_7_rs = sum(t.get("amount", 0) for t in txns if t.get("created_at") and t["created_at"] >= since_7) / 100.0
    avg_daily_spend_7d_rs = spend_7_rs / 7.0
    
    if safe_daily_limit_rs > 0:
        spend_velocity = avg_daily_spend_7d_rs / safe_daily_limit_rs
    else:
        spend_velocity = 1.5 if avg_daily_spend_7d_rs > 0 else 0.0

    # 5. Exam window
    in_exam_period = False
    if profile:
        exam_start = profile.get("exam_start_date")
        exam_end = profile.get("exam_end_date")
        if exam_start and exam_end:
            try:
                import datetime as dt
                es = dt.datetime.fromisoformat(str(exam_start))
                ee = dt.datetime.fromisoformat(str(exam_end) + "T23:59:59")
                if es <= now <= ee:
                    in_exam_period = True
            except Exception:
                pass

    # 6. Social signal from cart pools
    user_doc = await db.users.find_one({"_id": user_id})
    full_name = user_doc.get("full_name", "") if user_doc else ""
    user_hosted_pools = await db.cart_pools.find({"host_id": user_id}).to_list(length=100)
    participated_pool_ids = []
    if full_name:
        import re
        name_regex = re.compile(f"^{re.escape(full_name)}$", re.IGNORECASE)
        user_items = await db.cart_pool_items.find({"added_by_name": name_regex}).to_list(length=500)
        participated_pool_ids = [item["pool_id"] for item in user_items]

    all_pool_ids = list(set([p["_id"] for p in user_hosted_pools] + participated_pool_ids))
    if all_pool_ids:
        latest_pools = await db.cart_pools.find({"_id": {"$in": all_pool_ids}}).sort("created_at", -1).to_list(length=1)
        if latest_pools:
            last_pool_time = latest_pools[0].get("created_at")
            days_since_last_pool = (now - last_pool_time).days
        else:
            days_since_last_pool = None
    else:
        days_since_last_pool = None

    # Calculate Wellness Score
    score = 100

    # Sleep: late_night_spend_7d > 3 (-20), > 1 (-10)
    if late_night_spend_7d > 3:
        score -= 20
    elif late_night_spend_7d > 1:
        score -= 10

    # Meal regularity: avg_food_gap_hours_7d > 10 (-20), > 6 (-10)
    if avg_food_gap_hours_7d > 10:
        score -= 20
    elif avg_food_gap_hours_7d > 6:
        score -= 10

    # Runway: runway_days < 5 (-20), < 10 (-10)
    if runway_days < 5:
        score -= 20
    elif runway_days < 10:
        score -= 10

    # Exam pressure: in_exam_window: -15
    if in_exam_period:
        score -= 15

    # Spending control: spend_velocity > 1.4 (-15), > 1.2 (-8)
    if spend_velocity > 1.4:
        score -= 15
    elif spend_velocity > 1.2:
        score -= 8

    # Social signal: days_since_last_pool > 7 (-10)
    if days_since_last_pool is not None and days_since_last_pool > 7:
        score -= 10

    score = max(0, min(100, score))

    # Determine status bucket and messages
    if score >= 70:
        status = "steady"
        label = "Your routine looks steady"
        message = "Your routine looks steady this week. Keep meals regular and stay within today's safe spend target."
    elif score >= 50:
        status = "watch"
        label = "A few patterns need attention"
        message = "A few patterns need attention: your food timing, spending pace, or exam pressure is starting to stack up. Pick one reset today: a proper meal, a low-spend window, or a short break."
    else:
        status = "stressed"
        label = "Pattern suggests high stress"
        message = "Your recent pattern suggests you may be stretched thin. You do not need to fix everything today; start with one meal and one planned spend decision, then check in again."

    # Construct signals list
    signals = []

    # Food gap signal
    food_gap_severity = "ok"
    if avg_food_gap_hours_7d > 10:
        food_gap_severity = "stressed"
    elif avg_food_gap_hours_7d > 6:
        food_gap_severity = "watch"
    signals.append({
        "key": "food_gap",
        "label": "Avg Food gap",
        "value": f"{avg_food_gap_hours_7d:.1f}h" if avg_food_gap_hours_7d < 168.0 else "—",
        "severity": food_gap_severity,
        "detail": "Long gaps between meals detected" if food_gap_severity != "ok" else "Regular meal timing"
    })

    # Runway signal
    runway_severity = "ok"
    if runway_days < 5:
        runway_severity = "stressed"
    elif runway_days < 10:
        runway_severity = "watch"
    signals.append({
        "key": "runway",
        "label": "Runway",
        "value": f"{runway_days} days" if runway_days is not None else "—",
        "severity": runway_severity,
        "detail": "Allowance may not last the cycle" if runway_severity != "ok" else "Runway looks stable"
    })

    # Late night signal
    late_night_severity = "ok"
    if late_night_spend_7d > 3:
        late_night_severity = "stressed"
    elif late_night_spend_7d > 1:
        late_night_severity = "watch"
    signals.append({
        "key": "late_night",
        "label": "Late-night spending",
        "value": f"{late_night_spend_7d} txns",
        "severity": late_night_severity,
        "detail": "Frequent late-night activity" if late_night_severity != "ok" else "Healthy nighttime routine"
    })

    # Velocity signal
    velocity_severity = "ok"
    if spend_velocity > 1.4:
        velocity_severity = "stressed"
    elif spend_velocity > 1.2:
        velocity_severity = "watch"
    signals.append({
        "key": "velocity",
        "label": "Spend velocity",
        "value": f"{spend_velocity:.2f}x",
        "severity": velocity_severity,
        "detail": "Spending is accelerating rapidly" if velocity_severity == "stressed" else "Spending is slightly elevated" if velocity_severity == "watch" else "Spending velocity is stable"
    })

    # Exam signal
    exam_severity = "stressed" if in_exam_period else "ok"
    signals.append({
        "key": "exam",
        "label": "Exam period",
        "value": "Active" if in_exam_period else "No",
        "severity": exam_severity,
        "detail": "Active exam schedule" if in_exam_period else "No exams active"
    })

    # Social signal from cart pools
    pool_severity = "stressed" if (days_since_last_pool is not None and days_since_last_pool > 7) else "ok"
    signals.append({
        "key": "cart_pool",
        "label": "Social index",
        "value": f"{days_since_last_pool}d idle" if days_since_last_pool is not None else "None",
        "severity": pool_severity,
        "detail": "Low cart pool participation recently (possible social withdrawal)" if pool_severity == "stressed" else "Active in cart pools"
    })

    return {
        "score": score,
        "status": status,
        "label": label,
        "message": message,
        "signals": signals,
        "generated_by": "local_rules",
        "avg_food_gap_hours_7d": round(avg_food_gap_hours_7d, 1)
    }


