"""Wellness Companion API (feature 7.7).

Turns the deterministic wellness signal engine into a supportive check-in
experience: an AI-narrated read on the week, concrete resets, campus support
resources, and a lightweight check-in log with streaks.

Framing rule (from the finals guide): "Detects risk patterns and offers a
supportive check-in." Never diagnoses.
"""

import datetime
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.wellness import (
    build_reset_actions,
    build_support_resources,
    compute_wellness,
    generate_care_plan,
    generate_supportive_message,
)

router = APIRouter()

# Responses that count as a wellness check-in (used for streaks/history).
WELLNESS_RESPONSES = {
    "wellness_checkin",
    "wellness_ate",
    "wellness_need_break",
    "wellness_plan_spending",
    "wellness_text_response",
    "wellness_mood",
}

MOOD_LABELS = {
    "good": "Feeling good",
    "okay": "Doing okay",
    "stretched": "Stretched thin",
}


def _weather_of(status: str) -> dict[str, str]:
    """Reframe the clinical-sounding score as gentle 'week weather'."""
    return {
        "steady": {"weather": "calm", "emoji": "sun", "headline": "Your week looks calm"},
        "watch": {"weather": "cloudy", "emoji": "cloud", "headline": "A few clouds this week"},
        "stressed": {"weather": "stormy", "emoji": "storm", "headline": "It's been a heavy week"},
    }.get(status, {"weather": "calm", "emoji": "sun", "headline": "Your week looks calm"})


async def _streak_and_history(db, user_id: str, limit: int = 8):
    cursor = db.checkin_logs.find(
        {"user_id": user_id, "response": {"$in": list(WELLNESS_RESPONSES)}}
    ).sort("created_at", -1)
    logs = await cursor.to_list(length=400)

    # Distinct check-in days (UTC date) for streak calculation.
    days = sorted(
        {log["created_at"].date() for log in logs if log.get("created_at")},
        reverse=True,
    )
    streak = 0
    today = datetime.datetime.utcnow().date()
    expected = today
    for d in days:
        if d == expected:
            streak += 1
            expected = expected - datetime.timedelta(days=1)
        elif d == expected - datetime.timedelta(days=1):
            # allow the streak to still count if they missed *today* but checked in yesterday
            if streak == 0 and d == today - datetime.timedelta(days=1):
                streak += 1
                expected = d - datetime.timedelta(days=1)
            else:
                break
        else:
            break

    history = []
    for log in logs[:limit]:
        history.append({
            "id": str(log.get("_id")),
            "response": log.get("response"),
            "mood": log.get("mood"),
            "note": log.get("stress_note"),
            "created_at": log["created_at"].isoformat() if log.get("created_at") else None,
        })

    return {"streak": streak, "total": len(logs), "history": history}


@router.get("/checkin")
async def get_checkin(user_id: str = Depends(get_current_user)):
    """The full supportive check-in package for the Wellness Companion page."""
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id}) or {}

    package = await compute_wellness(db, user_id)
    metrics = package["metrics"]

    # NOTE: the Bedrock-narrated line is served separately by GET /coach so the
    # dashboard card renders instantly. Here we return the deterministic message.
    message, source = package["message"], "local_rules"

    weather = _weather_of(package["status"])
    show_support = package["status"] == "stressed" or package["score"] < 45

    # Only surface the patterns that actually need attention — gentler than a wall of metrics.
    patterns = [s for s in package["signals"] if s.get("severity") in ("watch", "stressed")]

    streak_info = await _streak_and_history(db, user_id, limit=8)

    return {
        "score": package["score"],
        "status": package["status"],
        "label": package["label"],
        "weather": weather["weather"],
        "emoji": weather["emoji"],
        "headline": weather["headline"],
        "message": message,
        "ai_source": source,
        "signals": package["signals"],
        "drivers": package["drivers"],
        "primary_driver": package["primary_driver"],
        "driver_summary": package["driver_summary"],
        "patterns": patterns,
        "reset_actions": build_reset_actions(metrics),
        "support_resources": build_support_resources(profile),
        "show_support": show_support,
        "metrics": metrics,
        "streak": streak_info["streak"],
        "total_checkins": streak_info["total"],
        "recent_checkins": streak_info["history"],
    }


@router.get("/coach")
async def get_coach(user_id: str = Depends(get_current_user)):
    """AI-narrated supportive check-in line (Bedrock, deterministic fallback).

    Served on its own so the dashboard card renders instantly and the warm,
    personalised message streams in when ready — never blocking the page.
    """
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id}) or {}
    package = await compute_wellness(db, user_id)
    message, source = generate_supportive_message(package, profile)
    return {"message": message, "source": source, "status": package["status"]}


@router.get("/care-plan")
async def get_care_plan(user_id: str = Depends(get_current_user)):
    """On-demand AI-generated supportive care plan for the Care Plan popup.

    Loaded lazily (only when the student opens the plan) so Bedrock is never on
    the dashboard's critical path.
    """
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id}) or {}
    package = await compute_wellness(db, user_id)
    plan = generate_care_plan(package, profile)
    plan["show_support"] = package["status"] == "stressed" or package["score"] < 45
    return plan


@router.get("/history")
async def get_history(user_id: str = Depends(get_current_user)):
    db = get_db()
    return await _streak_and_history(db, user_id, limit=20)


class WellnessCheckinReq(BaseModel):
    mood: Optional[str] = None            # good | okay | stretched
    action: Optional[str] = None          # reset action key, if triggered from a card
    response: Optional[str] = None         # explicit response override
    note: Optional[str] = None            # free-text reflection
    score: Optional[int] = None           # wellness score captured at check-in time
    food_gap_hours: Optional[float] = None


@router.post("/checkin")
async def post_checkin(req: WellnessCheckinReq, user_id: str = Depends(get_current_user)):
    db = get_db()

    response = req.response
    if not response:
        response = "wellness_mood" if req.mood else "wellness_checkin"

    note = req.note
    if not note and req.mood:
        note = f"Mood check-in: {MOOD_LABELS.get(req.mood, req.mood)}"

    log_id = str(uuid.uuid4())
    await db.checkin_logs.insert_one({
        "_id": log_id,
        "user_id": user_id,
        "response": response,
        "mood": req.mood,
        "action": req.action,
        "gap_hours": req.food_gap_hours or 0,
        "food_gap_hours": req.food_gap_hours or 0,
        "suggestion_given": "wellness_companion",
        "score_at_checkin": req.score,
        "stress_note": note,
        "created_at": datetime.datetime.utcnow(),
    })

    streak_info = await _streak_and_history(db, user_id, limit=8)
    return {"status": "ok", "id": log_id, "streak": streak_info["streak"], "total": streak_info["total"]}
