from fastapi import APIRouter, Depends
from app.core.database import get_db
from app.core.security import get_current_user
import datetime
import random

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
        text = "A student checked in — ate at campus mess" if response == "ate" else "A student reported skipping a meal during exam period"
        events.append({
            "type": "checkin",
            "icon": "🍽️" if response == "ate" else "⚠️",
            "text": text,
            "mins_ago": mins_ago,
        })

    # Sort all events by recency
    events.sort(key=lambda e: e["mins_ago"])

    # Fallback: generate illustrative events if nothing real exists
    if not events:
        events = [
            {"type": "pool_created", "icon": "🛒", "text": f"New Zepto pool started in {wing or 'Wing 4B'}", "mins_ago": 3},
            {"type": "merchant_mapped", "icon": "📍", "text": "'BH-2 Night Canteen' was identified and added to campus directory", "mins_ago": 12},
            {"type": "checkin", "icon": "🍽️", "text": "A student checked in — ate at campus mess", "mins_ago": 28},
            {"type": "pool_created", "icon": "🛒", "text": "Blinkit pool closed — delivery fee was split 4 ways", "mins_ago": 45},
        ]

    return {"events": events[:8], "wing": wing}

