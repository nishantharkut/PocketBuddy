import datetime
import uuid
import logging
import re
import math
from difflib import SequenceMatcher
from typing import Any, Optional, List
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.services.bedrock import generate_json
from app.services.travel_geo import (
    build_geo_cache_key,
    build_geo_headers,
    get_geo_cache,
    set_geo_cache,
    travel_geo_source_note,
)

router = APIRouter()
logger = logging.getLogger("app.api.travel")

TRAVEL_REPORT_THRESHOLD_FLOOR = 5
TRAVEL_REPORT_THRESHOLD_CEILING = 25
FARE_MODEL_VERSION = "campus-distance-v2"
REPORT_TRUST_WINDOW_DAYS = 90
REPORT_DUPLICATE_WINDOW_HOURS = 12
PLACEHOLDER_CAMPUS_NAMES = {"pocketbuddy campus", "select campus", "campus", "my campus"}
TRANSPORT_HUB_TERMS = ("airport", "station", "railway", "junction", "bus stand", "isbt", "terminal", "depot")


# Default seeded routes for ABV-IIITM Gwalior
DEFAULT_ROUTES = [
    {
        "id": "gwalior_station_iiitm",
        "name": "Gwalior Railway Station to ABV-IIITM",
        "description": "Travel from Gwalior Main Railway Station to the ABV-IIITM Campus.",
        "modes": [
            {"mode": "Auto", "min_fare": 140, "max_fare": 180, "median_fare": 160},
            {"mode": "Cab", "min_fare": 220, "max_fare": 300, "median_fare": 260},
            {"mode": "Shared Auto + Tempo", "min_fare": 40, "max_fare": 70, "median_fare": 50}
        ],
        "cheapest_route_combo": "Take a shared auto from outside the station till Phool Bagh (Rs 20), then change to a tempo towards Morena Road / IIITM gate (Rs 20-Rs 30). Total: Rs 45-Rs 50.",
        "negotiation_helper": "Bhaiya, ABV-IIITM ka normal student fare Rs 150-Rs 170 hota hai. Rs 170 final?",
        "safety_score_day": "High Safety",
        "safety_score_night": "Avoid shared routes after 9:00 PM. Prefer pre-booked cab or direct auto from main stand.",
        "scam_warnings": "Auto drivers inside the station gate may quote Rs 400+. Walk 100 meters outside the station main gate to the circle to get a direct auto near Rs 150.",
        "campus_landmark": "Campus Gate No 1, Morena Link Road"
    },
    {
        "id": "gwalior_airport_iiitm",
        "name": "Gwalior Airport to ABV-IIITM",
        "description": "Travel from Rajmata Vijaya Raje Scindia Airport to the ABV-IIITM Campus.",
        "modes": [
            {"mode": "Cab", "min_fare": 450, "max_fare": 600, "median_fare": 500},
            {"mode": "Auto", "min_fare": 300, "max_fare": 380, "median_fare": 340}
        ],
        "cheapest_route_combo": "No direct shared transit is usually available. A cab is the safer option when travelling with luggage or late at night.",
        "negotiation_helper": "Bhaiya, IIITM Gwalior to 12km hi hai. Rs 330 chaloge?",
        "safety_score_day": "Moderate Safety",
        "safety_score_night": "Avoid travel after 10 PM unless using a pre-booked cab.",
        "scam_warnings": "Pre-book a cab if arriving late. Airport autos charge highly inflated premium rates.",
        "campus_landmark": "Campus Main Gate"
    },
    {
        "id": "bus_stand_iiitm",
        "name": "Gwalior Bus Stand to ABV-IIITM",
        "description": "Travel from Gola ka Mandir Bus Stand to ABV-IIITM Campus.",
        "modes": [
            {"mode": "Auto", "min_fare": 100, "max_fare": 130, "median_fare": 110},
            {"mode": "Cab", "min_fare": 160, "max_fare": 220, "median_fare": 180},
            {"mode": "Shared Auto", "min_fare": 30, "max_fare": 50, "median_fare": 40}
        ],
        "cheapest_route_combo": "Take a shared auto from Gola ka Mandir to Hazira (Rs 15), then another auto/tempo to IIITM gate (Rs 15). Total: Rs 30.",
        "negotiation_helper": "Bhaiya, Hazira crossing hote hue Rs 110 normal fare hai. Rs 120 chaloge?",
        "safety_score_day": "High Safety",
        "safety_score_night": "Avoid shared autos after 8:30 PM. Use direct auto.",
        "scam_warnings": "Walk 50m away from busy bus exits to hire a passing running auto instead of stationary ones parked at the gates.",
        "campus_landmark": "IIITM Gate No 1"
    }
]

# Real-world estimated distances in km for popular campuses
CAMPUS_DISTANCES = {
    "iit delhi": {
        "station": 15.5,
        "bus": 21.0,
        "airport": 10.0,
        "station_name": "New Delhi Railway Station (NDLS)",
        "bus_name": "Kashmere Gate ISBT",
        "airport_name": "Indira Gandhi International Airport (DEL)"
    },
    "bits pilani": {
        "station": 26.0,
        "bus": 1.8,
        "airport": 180.0,
        "station_name": "Loharu Railway Station (LHU)",
        "bus_name": "Pilani Bus Stand",
        "airport_name": "Delhi Airport (IGI)"
    },
    "iit bombay": {
        "station": 8.5,
        "bus": 9.0,
        "airport": 7.5,
        "station_name": "Lokmanya Tilak Terminus (LTT)",
        "bus_name": "Kurla Bus Stand",
        "airport_name": "Chhatrapati Shivaji Maharaj Airport (BOM)"
    },
    "iiit bangalore": {
        "station": 24.0,
        "bus": 2.5,
        "airport": 54.0,
        "station_name": "Majestic Railway Station (SBC)",
        "bus_name": "Electronic City Bus Stand",
        "airport_name": "Kempegowda International Airport (BLR)"
    },
    "vit vellore": {
        "station": 6.5,
        "bus": 4.5,
        "airport": 130.0,
        "station_name": "Katpadi Junction (KPD)",
        "bus_name": "Vellore New Bus Stand",
        "airport_name": "Chennai Airport (MAA)"
    }
}


def _fare_mode(mode: str, min_fare: int, max_fare: int, median_fare: int, distance_km: float, rule_name: str) -> dict[str, Any]:
    return {
        "mode": mode,
        "min_fare": max(0, int(min_fare)),
        "max_fare": max(0, int(max_fare)),
        "median_fare": max(0, int(median_fare)),
        "fare_source": "distance_model",
        "fare_source_label": "Distance model",
        "fare_basis": f"{distance_km:.1f} km x {rule_name}",
        "fare_model_version": FARE_MODEL_VERSION,
        "report_sample_size": 0,
        "report_threshold": compute_travel_verification_threshold(),
    }


def estimate_fares_by_city(d: float, college: str) -> list[dict[str, Any]]:
    col_lower = college.lower() if college else ""
    rule_name = "campus-local fare rule"
    
    # 1. Determine City Rules
    if "bombay" in col_lower or "mumbai" in col_lower:
        rule_name = "Mumbai local fare rule"
        # Mumbai Autos & Cabs (kaali peeli meter guidelines)
        auto_min = int(23 + max(0.0, d - 1.5) * 14.5)
        auto_max = int(25 + max(0.0, d - 1.5) * 16.5)
        auto_median = int(23 + max(0.0, d - 1.5) * 15.33)
        
        cab_min = int(120 + d * 15)
        cab_max = int(160 + d * 20)
        cab_median = int(140 + d * 18.0)
        
        bike_min = int(25 + d * 7)
        bike_max = int(35 + d * 9)
        bike_median = int(30 + d * 8.0)
        
        shared_min = int(15 + d * 3.5)
        shared_max = int(25 + d * 4.5)
        shared_median = int(20 + d * 4.0)
        
    elif "delhi" in col_lower:
        rule_name = "Delhi local fare rule"
        # Delhi autos: metered Rs 30 base + Rs 11/km.
        auto_min = int(30 + max(0.0, d - 1.5) * 10.0)
        auto_max = int(35 + max(0.0, d - 1.5) * 12.0)
        auto_median = int(30 + max(0.0, d - 1.5) * 11.0)
        
        cab_min = int(100 + d * 14)
        cab_max = int(140 + d * 18)
        cab_median = int(120 + d * 16.0)
        
        bike_min = int(20 + d * 6)
        bike_max = int(30 + d * 8)
        bike_median = int(25 + d * 7.0)
        
        shared_min = int(10 + d * 3.0)
        shared_max = int(20 + d * 4.0)
        shared_median = int(15 + d * 3.5)
        
    elif "bangalore" in col_lower:
        rule_name = "Bangalore local fare rule"
        # Bangalore autos: metered Rs 30 base + Rs 15/km.
        auto_min = int(30 + max(0.0, d - 2.0) * 13.5)
        auto_max = int(35 + max(0.0, d - 2.0) * 16.0)
        auto_median = int(30 + max(0.0, d - 2.0) * 15.0)
        
        cab_min = int(120 + d * 16)
        cab_max = int(180 + d * 22)
        cab_median = int(150 + d * 19.0)
        
        bike_min = int(25 + d * 7.5)
        bike_max = int(35 + d * 9.5)
        bike_median = int(30 + d * 8.5)
        
        shared_min = int(15 + d * 4.0)
        shared_max = int(25 + d * 5.0)
        shared_median = int(20 + d * 4.5)
        
    elif "vellore" in col_lower:
        rule_name = "Vellore campus fare rule"
        # Vellore (flat rates, no meter compliance)
        auto_min = int(60 + d * 12)
        auto_max = int(80 + d * 16)
        auto_median = int(70 + d * 14.0)
        
        cab_min = int(140 + d * 15)
        cab_max = int(180 + d * 19)
        cab_median = int(160 + d * 17.0)
        
        bike_min = int(25 + d * 7)
        bike_max = int(35 + d * 9)
        bike_median = int(30 + d * 8.0)
        
        shared_min = int(10 + d * 3.5)
        shared_max = int(20 + d * 5.0)
        shared_median = int(15 + d * 4.0)
        
    elif "pilani" in col_lower or "bits" in col_lower:
        rule_name = "Pilani campus fare rule"
        # Pilani (small town, flat auto pricing, Loharu outstation cab)
        if d <= 5.0:
            auto_min, auto_max, auto_median = 40, 60, 50
        else:
            auto_min = int(50 + d * 12)
            auto_max = int(70 + d * 15)
            auto_median = int(60 + d * 13.5)
            
        cab_min = int(150 + d * 13)
        cab_max = int(200 + d * 16)
        cab_median = int(180 + d * 14.5)
        
        bike_min = int(20 + d * 5.5)
        bike_max = int(30 + d * 7.5)
        bike_median = int(25 + d * 6.5)
        
        shared_min = int(10 + d * 2.5)
        shared_max = int(15 + d * 3.5)
        shared_median = int(12 + d * 3.0)
        
    else:
        rule_name = "campus-local fare rule"
        # Default / Gwalior rules (flat/negotiated auto fares)
        if d <= 3.0:
            auto_min, auto_max, auto_median = 50, 70, 60
        else:
            auto_min, auto_max, auto_median = int(80 + d * 10), int(100 + d * 13), int(90 + d * 11.5)
            
        if d <= 3.0:
            cab_min, cab_max, cab_median = 120, 160, 140
        else:
            cab_min, cab_max, cab_median = int(180 + d * 14), int(240 + d * 19), int(210 + d * 16.5)
            
        if d <= 3.0:
            bike_min, bike_max, bike_median = 20, 30, 25
        else:
            bike_min, bike_max, bike_median = int(25 + d * 6), int(35 + d * 8), int(30 + d * 7)
            
        if d <= 3.0:
            shared_min, shared_max, shared_median = 10, 15, 10
        else:
            shared_min, shared_max, shared_median = int(10 + d * 3.5), int(20 + d * 5), int(15 + d * 4)

    return [
        _fare_mode("Auto", auto_min, auto_max, auto_median, d, rule_name),
        _fare_mode("Cab", cab_min, cab_max, cab_median, d, rule_name),
        _fare_mode("Bike", bike_min, bike_max, bike_median, d, rule_name),
        _fare_mode("Shared Auto / Tempo", shared_min, shared_max, shared_median, d, rule_name),
    ]


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


def compute_travel_verification_threshold(active_reporters: int = 0) -> int:
    """
    Independent student reports needed before crowdsourced fares affect recommendations.

    Travel fare data has the same trust problem as scanned menus: a fixed three-vote
    threshold is too easy to game and too weak for busy routes. The floor handles
    cold starts, then the threshold grows sub-linearly as the route reporter base grows.
    """
    try:
        reporter_count = max(0, int(active_reporters or 0))
    except (TypeError, ValueError):
        reporter_count = 0
    return max(
        TRAVEL_REPORT_THRESHOLD_FLOOR,
        min(TRAVEL_REPORT_THRESHOLD_CEILING, math.ceil(1.25 * math.sqrt(max(reporter_count, 10)))),
    )


def travel_dispute_hide_threshold(verification_threshold: int) -> int:
    return max(3, math.ceil(max(1, verification_threshold) * 0.5))


def _robust_fare_range(values: list[float], min_sample_size: Optional[int] = None) -> Optional[dict[str, int]]:
    fares = sorted(float(v) for v in values if isinstance(v, (int, float)) and v > 0)
    required = min_sample_size or compute_travel_verification_threshold()
    if len(fares) < required:
        return None

    def percentile(sorted_values: list[float], pct: float) -> float:
        if not sorted_values:
            return 0.0
        idx = (len(sorted_values) - 1) * pct
        lower = int(idx)
        upper = min(lower + 1, len(sorted_values) - 1)
        weight = idx - lower
        return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight

    q1 = percentile(fares, 0.25)
    q3 = percentile(fares, 0.75)
    iqr = max(1.0, q3 - q1)
    lower_bound = max(0.0, q1 - 1.5 * iqr)
    upper_bound = q3 + 1.5 * iqr
    filtered = [fare for fare in fares if lower_bound <= fare <= upper_bound]
    if len(filtered) < max(3, math.ceil(required * 0.6)):
        filtered = fares

    return {
        "min_fare": int(round(percentile(filtered, 0.15))),
        "max_fare": int(round(percentile(filtered, 0.85))),
        "median_fare": int(round(percentile(filtered, 0.5))),
        "sample_size": len(fares),
        "filtered_sample_size": len(filtered),
    }


def _report_created_at(report: dict[str, Any]) -> Optional[datetime.datetime]:
    created_at = report.get("created_at")
    if isinstance(created_at, datetime.datetime):
        return created_at.replace(tzinfo=None) if created_at.tzinfo else created_at
    if isinstance(created_at, str):
        try:
            parsed = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            return parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed
        except ValueError:
            return None
    return None


def _is_disputed_report(report: dict[str, Any]) -> bool:
    upvotes = report.get("upvotes") or []
    downvotes = report.get("downvotes") or []
    return len(downvotes) >= travel_dispute_hide_threshold(compute_travel_verification_threshold()) and len(downvotes) > len(upvotes)


def _report_identity(report: dict[str, Any], fallback_index: int) -> str:
    for key in ("user_id", "device_id", "phone_hash", "_id", "id"):
        value = str(report.get(key) or "").strip()
        if value:
            return value
    created_at = _report_created_at(report)
    return f"anonymous:{fallback_index}:{created_at.isoformat() if created_at else 'unknown'}"


def _trusted_fare_reports(reports: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=REPORT_TRUST_WINDOW_DAYS)
    latest_by_reporter: dict[str, dict[str, Any]] = {}
    for index, report in enumerate(reports):
        if _is_disputed_report(report):
            continue
        created_at = _report_created_at(report)
        if created_at and created_at < cutoff:
            continue
        if not isinstance(report.get("final_amount"), (int, float)) or float(report.get("final_amount") or 0) <= 0:
            continue
        reporter_id = _report_identity(report, index)
        existing = latest_by_reporter.get(reporter_id)
        existing_at = _report_created_at(existing) if existing else None
        if existing is None or (created_at and (not existing_at or created_at > existing_at)):
            latest_by_reporter[reporter_id] = report

    return sorted(
        latest_by_reporter.values(),
        key=lambda item: _report_created_at(item) or datetime.datetime.min,
        reverse=True,
    )


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_travel_trust_metadata(mode_doc: dict[str, Any]) -> dict[str, Any]:
    """Expose the same trust lifecycle language as Food Guard, with travel-specific evidence."""
    sample_size = max(0, _safe_int(mode_doc.get("report_sample_size"), 0))
    threshold = max(
        TRAVEL_REPORT_THRESHOLD_FLOOR,
        _safe_int(mode_doc.get("report_threshold"), compute_travel_verification_threshold(sample_size)),
    )
    fare_source = str(mode_doc.get("fare_source") or "distance_model").lower()

    if fare_source == "student_reports" and sample_size >= threshold:
        return {
            "trust_stage": "student_verified",
            "trust_badge": "Student verified",
            "trust_reason": f"{sample_size} distinct student fare reports confirm this route and mode.",
            "trust_score": min(95, 80 + min(15, sample_size - threshold)),
            "report_sample_size": sample_size,
            "report_threshold": threshold,
        }

    if sample_size > 0:
        return {
            "trust_stage": "learning",
            "trust_badge": "Learning",
            "trust_reason": f"{sample_size}/{threshold} trusted student reports collected; fares still use the distance model.",
            "trust_score": min(70, 40 + math.floor((sample_size / max(1, threshold)) * 25)),
            "report_sample_size": sample_size,
            "report_threshold": threshold,
        }

    return {
        "trust_stage": "model_estimate",
        "trust_badge": "Model estimate",
        "trust_reason": "Distance and campus-local fare model; no trusted student fare cluster yet.",
        "trust_score": 35,
        "report_sample_size": sample_size,
        "report_threshold": threshold,
    }


def _route_source_label(route_source: Optional[str], routing_cache_hit: bool = False) -> str:
    source = (route_source or "").strip().lower()
    if source in {"osrm_route", "tomtom_traffic_route"}:
        return "Mapped road route, cached" if routing_cache_hit else "Mapped road route"
    if source == "haversine_estimate":
        return "Fallback distance estimate"
    return "Route estimate"


def build_fare_explanation(
    *,
    mode_doc: dict[str, Any],
    route_source: Optional[str],
    price_basis: Optional[str],
    eta_basis: Optional[str],
    time_context: Optional[str],
    routing_cache_hit: bool = False,
) -> dict[str, Any]:
    """Compact, judge-safe provenance for a shown fare."""
    mode_with_trust = _apply_travel_trust_metadata(mode_doc)
    sample_size = _safe_int(mode_with_trust.get("report_sample_size"), 0)
    threshold = max(
        TRAVEL_REPORT_THRESHOLD_FLOOR,
        _safe_int(mode_with_trust.get("report_threshold"), compute_travel_verification_threshold(sample_size)),
    )
    trust_stage = mode_with_trust.get("trust_stage") or "model_estimate"
    trust_badge = mode_with_trust.get("trust_badge") or "Model estimate"
    fare_basis = mode_with_trust.get("fare_basis") or price_basis or "Campus-local fare rule"
    route_label = _route_source_label(route_source, routing_cache_hit)

    return {
        "route_source_label": route_label,
        "fare_source_label": trust_badge,
        "trust_stage": trust_stage,
        "trust_score": mode_with_trust.get("trust_score", 35),
        "trust_reason": mode_with_trust.get("trust_reason"),
        "reports_label": f"{sample_size}/{threshold} trusted reports",
        "report_sample_size": sample_size,
        "report_threshold": threshold,
        "fare_basis": fare_basis,
        "price_basis": price_basis or fare_basis,
        "eta_basis": eta_basis or "ETA depends on the mapped route source.",
        "timing_label": _travel_time_label(time_context),
        "pricing_disclaimer": "This is a campus fare guardrail, not live ride-app pricing.",
    }


def _allowance_rupees(profile: Optional[dict[str, Any]]) -> float:
    if not profile:
        return 0.0
    raw = profile.get("monthly_allowance") or profile.get("allowance") or 0
    try:
        amount = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if amount <= 0:
        return 0.0
    return amount / 100.0 if amount >= 10000 else amount


def _cycle_bounds(profile: Optional[dict[str, Any]], now: Optional[datetime.datetime] = None) -> tuple[datetime.datetime, datetime.datetime]:
    now = (now or datetime.datetime.utcnow()).replace(tzinfo=None)
    try:
        cycle_start_day = int((profile or {}).get("cycle_start_day") or 1)
    except (TypeError, ValueError):
        cycle_start_day = 1
    cycle_start_day = max(1, min(28, cycle_start_day))

    start = now.replace(day=min(cycle_start_day, 28), hour=0, minute=0, second=0, microsecond=0)
    if start > now:
        previous_month = (start.replace(day=1) - datetime.timedelta(days=1))
        start = previous_month.replace(day=min(cycle_start_day, 28), hour=0, minute=0, second=0, microsecond=0)

    next_month_seed = (start.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    reset = next_month_seed.replace(day=min(cycle_start_day, 28), hour=0, minute=0, second=0, microsecond=0)
    return start, reset


def build_travel_runway_impact(fare_rs: float, runway_context: Optional[dict[str, Any]]) -> dict[str, Any]:
    context = runway_context or {}
    safe_daily = float(context.get("safe_daily_budget_rs") or 0)
    if safe_daily <= 0:
        return {
            "available": False,
            "summary": "Add allowance details to see runway impact.",
        }

    fare = max(0.0, float(fare_rs or 0))
    safe_day_share = round(fare / safe_daily, 2)
    remaining = float(context.get("remaining_allowance_rs") or 0)
    after_fare = max(0.0, remaining - fare) if remaining > 0 else None
    summary = (
        f"Uses {safe_day_share} safe-day budget at Rs {safe_daily:.0f}/day."
        if safe_day_share >= 0.1
        else f"Uses less than 0.1 safe-day budget at Rs {safe_daily:.0f}/day."
    )

    return {
        "available": True,
        "fare_rs": round(fare, 2),
        "safe_daily_budget_rs": round(safe_daily, 2),
        "safe_day_share": safe_day_share,
        "remaining_allowance_rs": round(remaining, 2) if remaining > 0 else None,
        "after_fare_allowance_rs": round(after_fare, 2) if after_fare is not None else None,
        "days_until_reset": context.get("days_until_reset"),
        "summary": summary,
    }


async def _build_user_runway_context(db: Any, user_id: str, profile: Optional[dict[str, Any]]) -> dict[str, Any]:
    allowance_rs = _allowance_rupees(profile)
    if allowance_rs <= 0:
        return {"available": False}

    now = datetime.datetime.utcnow()
    cycle_start, reset_at = _cycle_bounds(profile, now)
    spent_paise = 0
    credit_paise = 0
    try:
        cursor = db.transactions.find({
            "user_id": user_id,
            "created_at": {"$gte": cycle_start, "$lt": reset_at},
        })
        txns = await cursor.to_list(length=1000)
        for txn in txns:
            try:
                amount_paise = int(float(txn.get("amount") or 0))
            except (TypeError, ValueError):
                amount_paise = 0
            direction = str(txn.get("direction") or "debit").lower()
            if direction == "credit":
                credit_paise += max(0, amount_paise)
            else:
                spent_paise += max(0, amount_paise)
    except Exception as exc:
        logger.info("Travel runway context fell back to allowance-only mode: %s", exc)

    remaining_rs = max(0.0, allowance_rs + credit_paise / 100.0 - spent_paise / 100.0)
    days_until_reset = max(1, (reset_at.date() - now.date()).days + 1)
    safe_daily = remaining_rs / days_until_reset
    return {
        "available": True,
        "cycle_start": cycle_start.isoformat(),
        "reset_at": reset_at.isoformat(),
        "monthly_allowance_rs": round(allowance_rs, 2),
        "spent_rs": round(spent_paise / 100.0, 2),
        "credit_rs": round(credit_paise / 100.0, 2),
        "remaining_allowance_rs": round(remaining_rs, 2),
        "days_until_reset": days_until_reset,
        "safe_daily_budget_rs": round(safe_daily, 2),
    }


def _attach_mode_decision_context(
    modes: list[dict[str, Any]],
    *,
    route_source: Optional[str],
    price_basis: Optional[str],
    eta_basis: Optional[str],
    time_context: Optional[str],
    routing_cache_hit: bool,
    runway_context: Optional[dict[str, Any]],
) -> list[dict[str, Any]]:
    time_factor = _travel_time_fare_factor(time_context)
    enriched = []
    for mode in modes:
        mode_doc = _apply_travel_trust_metadata(mode)
        time_adjusted_fare = round(float(mode_doc.get("median_fare") or 0) * time_factor)
        mode_doc["fare_explanation"] = build_fare_explanation(
            mode_doc=mode_doc,
            route_source=route_source,
            price_basis=price_basis,
            eta_basis=eta_basis,
            time_context=time_context,
            routing_cache_hit=routing_cache_hit,
        )
        mode_doc["runway_impact"] = build_travel_runway_impact(time_adjusted_fare, runway_context)
        enriched.append(mode_doc)
    return enriched


def _apply_travel_trust_metadata(mode_doc: dict[str, Any]) -> dict[str, Any]:
    updated = dict(mode_doc)
    updated.update(build_travel_trust_metadata(updated))
    return updated


def _with_report_fare_meta(mode_doc: dict[str, Any], sample_size: int) -> dict[str, Any]:
    updated = dict(mode_doc)
    threshold = compute_travel_verification_threshold(sample_size)
    updated["report_sample_size"] = sample_size
    updated["report_threshold"] = threshold
    updated["fare_source"] = "student_reports"
    updated["fare_source_label"] = "Student reports"
    updated["fare_basis"] = f"{sample_size} distinct recent student fare reports"
    return _apply_travel_trust_metadata(updated)


def _ensure_fare_meta(mode_doc: dict[str, Any], route_distance_km: Optional[float] = None) -> dict[str, Any]:
    updated = dict(mode_doc)
    sample_size = int(updated.get("report_sample_size") or 0)
    threshold = compute_travel_verification_threshold(sample_size)
    updated["report_threshold"] = max(int(updated.get("report_threshold") or 0), threshold)
    if sample_size >= threshold:
        updated["fare_source"] = "student_reports"
        updated["fare_source_label"] = "Student reports"
        updated["fare_basis"] = updated.get("fare_basis") or f"{sample_size} distinct recent student fare reports"
        return _apply_travel_trust_metadata(updated)

    updated.setdefault("fare_source", "distance_model")
    updated["fare_source_label"] = "Distance model"
    if route_distance_km:
        updated["fare_basis"] = updated.get("fare_basis") or f"{float(route_distance_km):.1f} km x campus-local fare rule"
    else:
        updated["fare_basis"] = updated.get("fare_basis") or "Campus-local fare rule"
    updated["report_sample_size"] = sample_size
    updated.setdefault("fare_model_version", FARE_MODEL_VERSION)
    return _apply_travel_trust_metadata(updated)

class CustomRouteCreateReq(BaseModel):
    name: str
    description: Optional[str] = ""
    distance_km: float
    campus_landmark: Optional[str] = "Main Gate"
    college: Optional[str] = None
    duration_mins: Optional[int] = None
    routing_provider: Optional[str] = None
    eta_confidence: Optional[str] = None
    split_suggestion: Optional[dict[str, Any]] = None

class ReportSubmitReq(BaseModel):
    route_id: str
    mode: str
    amount_paid: float
    time_of_day: str
    luggage: bool
    driver_quote: float
    final_amount: float
    anonymous: bool = True

class SavingsLogReq(BaseModel):
    amount_saved: float
    route_id: str

class VoteReq(BaseModel):
    vote_type: str


class TravelReportCandidateConfirmReq(BaseModel):
    route_id: str
    mode: str
    driver_quote: Optional[float] = None
    anonymous: bool = True


def _clean_text(value: Optional[str], max_len: int) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    return cleaned[:max_len]


def _is_placeholder_campus(value: Optional[str]) -> bool:
    cleaned = re.sub(r"\s+", " ", (value or "").strip()).lower()
    return not cleaned or cleaned in PLACEHOLDER_CAMPUS_NAMES


def _is_transport_hub_query(value: str) -> bool:
    q = (value or "").lower()
    return any(term in q for term in TRANSPORT_HUB_TERMS)


def _parse_user_datetime(value: str) -> Optional[datetime.datetime]:
    if not value:
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return parsed


def _mode_matches(selected: str, mode_name: str) -> bool:
    selected_l = (selected or "").lower().strip()
    mode_l = (mode_name or "").lower().strip()
    return bool(selected_l and mode_l and (selected_l in mode_l or mode_l in selected_l))


def _find_mode(route_doc: dict[str, Any], selected_mode: str) -> Optional[dict[str, Any]]:
    modes = route_doc.get("modes", []) if route_doc else []
    if not modes:
        return None
    for mode in modes:
        if _mode_matches(selected_mode, str(mode.get("mode", ""))):
            return mode
    return modes[0]


async def _refresh_route_mode_fares(db, route_id: str, selected_mode: str) -> None:
    route_doc = await db.travel_routes.find_one({"_id": route_id})
    if not route_doc:
        return

    cursor = db.travel_reports.find({"route_id": route_id, "mode": {"$regex": f"^{re.escape(selected_mode)}$", "$options": "i"}})
    all_reports = await cursor.to_list(length=1000)
    trusted_reports = _trusted_fare_reports(all_reports)
    report_threshold = compute_travel_verification_threshold(len(trusted_reports))
    robust_range = _robust_fare_range(
        [r.get("final_amount") for r in trusted_reports],
        min_sample_size=report_threshold,
    )

    model_mode = None
    distance_km = route_doc.get("distance_km")
    if isinstance(distance_km, (int, float)) and distance_km > 0:
        model_mode = _find_mode(
            {"modes": estimate_fares_by_city(float(distance_km), str(route_doc.get("college") or ""))},
            selected_mode,
        )

    updated_modes = []
    mode_found = False
    for mode in route_doc.get("modes", []):
        if _mode_matches(selected_mode, str(mode.get("mode", ""))):
            mode_found = True
            if robust_range:
                updated_modes.append(_with_report_fare_meta({
                    **mode,
                    "min_fare": robust_range["min_fare"],
                    "max_fare": robust_range["max_fare"],
                    "median_fare": robust_range["median_fare"],
                }, robust_range["sample_size"]))
            elif model_mode:
                updated_modes.append(_apply_travel_trust_metadata({
                    **mode,
                    "min_fare": model_mode["min_fare"],
                    "max_fare": model_mode["max_fare"],
                    "median_fare": model_mode["median_fare"],
                    "fare_source": "distance_model",
                    "fare_source_label": "Distance model",
                    "fare_basis": model_mode.get("fare_basis") or f"{float(distance_km):.1f} km x campus-local fare rule",
                    "fare_model_version": FARE_MODEL_VERSION,
                    "report_sample_size": len(trusted_reports),
                    "report_threshold": report_threshold,
                }))
            else:
                next_mode = dict(mode)
                next_mode["fare_source"] = "distance_model"
                next_mode["fare_source_label"] = "Distance model"
                if isinstance(distance_km, (int, float)):
                    next_mode["fare_basis"] = next_mode.get("fare_basis") or f"{float(distance_km):.1f} km x campus-local fare rule"
                next_mode["report_sample_size"] = len(trusted_reports)
                next_mode["report_threshold"] = report_threshold
                next_mode.setdefault("fare_model_version", FARE_MODEL_VERSION)
                updated_modes.append(_apply_travel_trust_metadata(next_mode))
        else:
            updated_modes.append(mode)

    if not mode_found and robust_range:
        updated_modes.append(_with_report_fare_meta({
            "mode": selected_mode,
            "min_fare": robust_range["min_fare"],
            "max_fare": robust_range["max_fare"],
            "median_fare": robust_range["median_fare"],
        }, robust_range["sample_size"]))

    await db.travel_routes.update_one(
        {"_id": route_id},
        {"$set": {"modes": updated_modes, "last_report_at": datetime.datetime.utcnow()}}
    )


def _transaction_amount_rupees(txn: dict[str, Any]) -> float:
    raw = txn.get("amount")
    try:
        amount = float(raw or 0)
    except (TypeError, ValueError):
        return 0.0
    return amount / 100.0 if amount >= 1000 else amount


def _is_travel_like_transaction(txn: dict[str, Any]) -> bool:
    if str(txn.get("direction") or "debit").lower() == "credit":
        return False
    category = str(txn.get("category") or "").lower()
    merchant = " ".join(
        str(txn.get(key) or "")
        for key in ("mapped_merchant_name", "raw_merchant_string", "merchant")
    ).lower()
    travel_terms = (
        "auto", "cab", "taxi", "uber", "ola", "rapido", "namma yatri", "metro",
        "bus", "railway", "train", "station", "airport", "travel", "ride",
    )
    return category == "travel" or any(term in merchant for term in travel_terms)


def build_travel_report_candidate(transaction: dict[str, Any], routes: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Suggest one-tap fare reporting from a recent synced payment."""
    if not _is_travel_like_transaction(transaction):
        return None
    amount_rs = _transaction_amount_rupees(transaction)
    if amount_rs <= 0:
        return None

    best: Optional[dict[str, Any]] = None
    best_score = float("inf")
    for route in routes:
        for mode in route.get("modes", []) or []:
            min_fare = float(mode.get("min_fare") or 0)
            max_fare = float(mode.get("max_fare") or 0)
            median_fare = float(mode.get("median_fare") or 0)
            if max_fare <= 0 or median_fare <= 0:
                continue
            if amount_rs < max(10.0, min_fare * 0.65) or amount_rs > max_fare * 1.45:
                continue
            score = abs(amount_rs - median_fare) / max(1.0, median_fare)
            if score < best_score:
                best_score = score
                best = {
                    "transaction_id": str(transaction.get("_id") or transaction.get("id") or ""),
                    "route_id": str(route.get("_id") or route.get("id") or ""),
                    "route_name": route.get("name"),
                    "mode": mode.get("mode"),
                    "amount_paid": round(amount_rs, 2),
                    "driver_quote": round(max(amount_rs, median_fare), 2),
                    "merchant": transaction.get("mapped_merchant_name") or transaction.get("raw_merchant_string") or "Travel payment",
                    "created_at": transaction.get("created_at"),
                    "confidence": "high" if score <= 0.15 else "medium",
                    "action_label": "Confirm as travel fare",
                    "reason": "Recent travel-like payment matches this route's fare band.",
                }
    return best


def _clean_phone(value: Optional[str]) -> str:
    digits = re.sub(r"\D+", "", value or "")
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    return digits if len(digits) == 10 else ""


def build_ride_pool_safety_context(
    *,
    profile: Optional[dict[str, Any]],
    departure_time: datetime.datetime,
    mode: str,
    max_passengers: int,
    host_phone: str,
) -> dict[str, Any]:
    """Create the accountability and safety policy for a travel pool."""
    cleaned_phone = _clean_phone(host_phone)
    mode_l = (mode or "").lower()
    is_late_night = departure_time.hour >= 21 or departure_time.hour < 6
    is_shared_or_bike = any(token in mode_l for token in ("shared", "tempo", "bus", "bike"))
    notes = [
        "Same-campus ride pool.",
        "Host identity is visible to joined students.",
    ]

    if profile and profile.get("wing_label"):
        notes.append(f"Host wing: {profile.get('wing_label')}.")
    if is_late_night:
        notes.append("Late-night ride: prefer direct, traceable rides and avoid isolated pickup points.")

    if not cleaned_phone:
        return {
            "can_create": False,
            "blocking_reason": "Add a valid phone number before hosting a travel pool so co-riders can identify the host.",
            "notes": notes,
            "scope": "same_campus",
            "host_contact_verified": False,
            "late_night": is_late_night,
        }

    if max_passengers < 2 or max_passengers > 6:
        return {
            "can_create": False,
            "blocking_reason": "Ride pools must have 2 to 6 seats.",
            "notes": notes,
            "scope": "same_campus",
            "host_contact_verified": True,
            "late_night": is_late_night,
        }

    if is_late_night and is_shared_or_bike:
        return {
            "can_create": False,
            "blocking_reason": "Late-night shared or bike ride pools are disabled. Use a direct auto or cab pool instead.",
            "notes": notes,
            "scope": "same_campus",
            "host_contact_verified": True,
            "late_night": is_late_night,
        }

    return {
        "can_create": True,
        "blocking_reason": None,
        "notes": notes,
        "scope": "same_campus",
        "host_contact_verified": True,
        "late_night": is_late_night,
        "max_passengers": max_passengers,
    }


def _valid_upi(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9.\-_]{2,}@[A-Za-z][A-Za-z0-9.\-_]{2,}", (value or "").strip()))


def _public_pool(pool_doc: dict[str, Any], current_user_id: str) -> dict[str, Any]:
    pool = _to_dict(pool_doc)
    co_passengers = pool.get("co_passengers", [])
    is_member = any(p.get("user_id") == current_user_id for p in co_passengers)
    is_host = pool.get("host_id") == current_user_id

    pool["co_passengers"] = [
        {
            "user_id": p.get("user_id"),
            "full_name": p.get("full_name", "Student"),
        }
        for p in co_passengers
    ]

    if not (is_member or is_host):
        pool.pop("host_phone", None)
        pool.pop("upi_id", None)
        pool.pop("splits", None)
    else:
        pool["host_phone"] = _clean_phone(pool.get("host_phone"))

    return pool

@router.get("/routes")
async def get_routes(college: Optional[str] = Query(None), user_id: str = Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})

    if not college:
        # Get user profile to determine college
        college = profile.get("college_name") if profile else None

    if _is_placeholder_campus(college):
        return []

    cursor = db.travel_routes.find({"college": college})
    routes = await cursor.to_list(length=100)

    if not routes and settings.TRAVEL_DEMO_MODE:
        if "gwalior" in college.lower() or "iiitm" in college.lower():
            # Seed Gwalior defaults
            for r in DEFAULT_ROUTES:
                r_doc = dict(r)
                r_doc["_id"] = r_doc.pop("id")
                r_doc["college"] = college
                r_doc["source"] = "distance_model"
                r_doc["modes"] = [_ensure_fare_meta(m, r_doc.get("distance_km")) for m in r_doc.get("modes", [])]
                await db.travel_routes.replace_one({"_id": r_doc["_id"]}, r_doc, upsert=True)
        else:
            # Generate default distance-model estimates for the college
            # Look up standard distances
            distances = {"station": 12.0, "bus": 7.0, "airport": 25.0}
            names = {
                "station_name": "Nearest Railway Station",
                "bus_name": "Local Bus Stand",
                "airport_name": "Local Airport"
            }

            for key, val in CAMPUS_DISTANCES.items():
                if key in college.lower():
                    distances = val
                    names = val
                    break

            new_routes = [
                {
                    "id": f"{uuid.uuid4().hex[:8]}_station",
                    "name": f"{names['station_name']} to {college}",
                    "description": f"Standard route from nearest major Railway Station to {college}.",
                    "distance_km": distances["station"],
                    "campus_landmark": "Main Gate"
                },
                {
                    "id": f"{uuid.uuid4().hex[:8]}_bus",
                    "name": f"{names['bus_name']} to {college}",
                    "description": f"Standard route from nearest major Bus Stand to {college}.",
                    "distance_km": distances["bus"],
                    "campus_landmark": "Main Gate"
                },
                {
                    "id": f"{uuid.uuid4().hex[:8]}_airport",
                    "name": f"{names['airport_name']} to {college}",
                    "description": f"Estimated route from the nearest major airport to {college}.",
                    "distance_km": distances["airport"],
                    "campus_landmark": "Main Gate"
                }
            ]

            for nr in new_routes:
                d = nr["distance_km"]
                modes = estimate_fares_by_city(d, college)

                r_doc = {
                    "_id": nr["id"],
                    "college": college,
                    "name": nr["name"],
                    "description": nr["description"],
                    "modes": modes,
                    "cheapest_route_combo": f"Use a bike ride for single commuters to keep travel cost around ₹{int(30 + d * 7)}. For luggage or group travel, compare cab and auto prices.",
                    "negotiation_helper": f"Bhaiya, {college} ka normal student fare dikha raha hai. Sahi price pe chaloge?",
                    "safety_score_day": "High Safety",
                    "safety_score_night": "Avoid shared or bike trips after 9 PM; prefer pre-booked cabs.",
                    "scam_warnings": "If you have a ride-app quote, compare it before negotiating flat rates with auto drivers at the terminal exit.",
                    "campus_landmark": nr["campus_landmark"],
                    "source": "distance_model",
                    "distance_km": d
                }
                await db.travel_routes.replace_one({"_id": r_doc["_id"]}, r_doc, upsert=True)

        cursor = db.travel_routes.find({"college": college})
        routes = await cursor.to_list(length=100)

    runway_context = await _build_user_runway_context(db, user_id, profile)
    mapped_routes = []
    for r in routes:
        route_dict = _to_dict(r)
        route_id = route_dict.get("id")
        
        # Calculate dynamic labels based on report age
        reports_cursor = db.travel_reports.find({"route_id": route_id}).sort("created_at", -1)
        all_reports = await reports_cursor.to_list(length=50)
        r_reports = _trusted_fare_reports(all_reports)
        route_report_threshold = compute_travel_verification_threshold(len(r_reports))
        
        age_days = None
        has_recent = False
        if r_reports:
            latest = r_reports[0]
            latest_time = latest.get("created_at")
            if latest_time:
                if isinstance(latest_time, str):
                    try:
                        latest_time = datetime.datetime.fromisoformat(latest_time)
                    except ValueError:
                        latest_time = datetime.datetime.utcnow()
                
                # Make timezone-naive if it's timezone-aware to prevent comparison TypeErrors
                if latest_time.tzinfo is not None:
                    latest_time = latest_time.replace(tzinfo=None)
                    
                age_days = (datetime.datetime.utcnow() - latest_time).days
                if age_days <= 14:
                    has_recent = True
        
        if age_days is not None:
            if age_days > 30:
                route_dict["source"] = "stale"
            elif age_days <= 14:
                route_dict["source"] = "recent student report"
            else:
                if len(r_reports) >= route_report_threshold:
                    route_dict["source"] = "community median"
                else:
                    route_dict["source"] = "recent student report"
        else:
            if route_dict.get("source") in {"seeded", "app_estimate", "user_added"}:
                route_dict["source"] = "distance_model"

        # Determine confidence:
        # - high: official + recent community reports, or community median above the adaptive trust threshold
        # - medium: community only (without recent report, or official without recent report)
        # - low: stale or sparse reports
        resolved_source = route_dict.get("source", "")

        if resolved_source == "stale":
            route_dict["confidence"] = "low"
        elif resolved_source == "official":
            if r_reports and has_recent:
                route_dict["confidence"] = "high"
            else:
                route_dict["confidence"] = "medium"
        elif resolved_source == "recent student report" or resolved_source == "community median":
            if len(r_reports) >= route_report_threshold and has_recent:
                route_dict["confidence"] = "high"
            else:
                route_dict["confidence"] = "medium"
        else:
            route_dict["confidence"] = "low"

        modes_with_meta = [
            _ensure_fare_meta(m, route_dict.get("distance_km"))
            for m in route_dict.get("modes", [])
        ]
        route_dict["modes"] = _attach_mode_decision_context(
            modes_with_meta,
            route_source=route_dict.get("routing_source") or route_dict.get("source"),
            price_basis="Saved campus route plus campus-local fare rules. These are not live ride-app API prices.",
            eta_basis=route_dict.get("eta_basis") or "Saved route ETA depends on the mapped route source.",
            time_context="now",
            routing_cache_hit=bool(route_dict.get("routing_cache_hit")),
            runway_context=runway_context,
        )
                
        mapped_routes.append(route_dict)

    return mapped_routes

@router.post("/routes")
async def create_custom_route(req: CustomRouteCreateReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    route_name = _clean_text(req.name, 80)
    route_desc = _clean_text(req.description, 180)
    campus_landmark = _clean_text(req.campus_landmark, 60) or "Main Gate"

    if len(route_name) < 3:
        raise HTTPException(status_code=400, detail="Route name is too short")

    # Determine college
    college = _clean_text(req.college, 120)
    if not college:
        profile = await db.profiles.find_one({"_id": user_id})
        college = profile.get("college_name") if profile else None

    if _is_placeholder_campus(college):
        raise HTTPException(status_code=400, detail="Set your college before saving travel routes")

    d = req.distance_km
    if d <= 0 or d > 250:
        raise HTTPException(status_code=400, detail="Distance must be positive and less than 250 km")
    modes = estimate_fares_by_city(d, college)

    route_id = f"{uuid.uuid4().hex[:8]}_custom"

    r_doc = {
        "_id": route_id,
        "college": college,
        "name": route_name,
        "description": route_desc,
        "modes": modes,
        "cheapest_route_combo": f"Compare auto and cab prices. The estimated distance is {d} km.",
        "negotiation_helper": f"Bhaiya, {route_name} ka normal student fare Rs {int(70 + d * 10.5)} hai. Sahi rate pe chal lo.",
        "safety_score_day": "High Safety",
        "safety_score_night": "Stick to app-based rides late at night.",
        "scam_warnings": "If you have a ride-app quote, compare it before negotiating flat prices.",
        "campus_landmark": campus_landmark,
        "source": "distance_model",
        "confidence": "low",
        "distance_km": d,
        "duration_mins": req.duration_mins,
        "routing_provider": _clean_text(req.routing_provider, 40),
        "eta_confidence": _clean_text(req.eta_confidence, 20),
        "split_suggestion": req.split_suggestion if isinstance(req.split_suggestion, dict) else None,
    }

    await db.travel_routes.insert_one(r_doc)
    return _to_dict(r_doc)


@router.get("/report-candidates")
async def get_report_candidates(
    route_id: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    db = get_db()
    profile = await db.profiles.find_one({"_id": user_id})
    college = profile.get("college_name") if profile else None
    if _is_placeholder_campus(college):
        return []

    route_query: dict[str, Any] = {"college": college}
    if route_id:
        route_query["_id"] = route_id
    routes = await db.travel_routes.find(route_query).to_list(length=100)
    if not routes:
        return []

    since = datetime.datetime.utcnow() - datetime.timedelta(days=3)
    txns = await db.transactions.find({
        "user_id": user_id,
        "created_at": {"$gte": since},
    }).sort("created_at", -1).to_list(length=50)

    candidates = []
    seen_txns = set()
    for txn in txns:
        txn_id = str(txn.get("_id") or "")
        if not txn_id or txn_id in seen_txns:
            continue
        existing = await db.travel_reports.find_one({"source_transaction_id": txn_id})
        if existing:
            continue
        candidate = build_travel_report_candidate(txn, routes)
        if candidate and (not route_id or candidate.get("route_id") == route_id):
            candidates.append(_to_dict(candidate))
            seen_txns.add(txn_id)
        if len(candidates) >= 5:
            break
    return candidates


@router.post("/report-candidates/{transaction_id}/confirm")
async def confirm_report_candidate(
    transaction_id: str,
    req: TravelReportCandidateConfirmReq,
    user_id: str = Depends(get_current_user),
):
    db = get_db()
    txn = await db.transactions.find_one({"_id": transaction_id, "user_id": user_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Travel payment candidate not found")
    existing = await db.travel_reports.find_one({"source_transaction_id": transaction_id})
    if existing:
        raise HTTPException(status_code=409, detail="This payment has already been used as a travel fare report")

    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    if not route_doc:
        raise HTTPException(status_code=404, detail="Route not found")
    profile = await db.profiles.find_one({"_id": user_id})
    user_college = profile.get("college_name") if profile else None
    if route_doc.get("college") != user_college:
        raise HTTPException(status_code=403, detail="This route belongs to a different campus")

    candidate = build_travel_report_candidate(txn, [route_doc])
    if not candidate:
        raise HTTPException(status_code=400, detail="This payment does not match a travel fare band strongly enough")
    mode_doc = _find_mode(route_doc, req.mode)
    if not mode_doc:
        raise HTTPException(status_code=400, detail="Select a valid travel mode for this route")

    amount_paid = float(candidate["amount_paid"])
    driver_quote = float(req.driver_quote or candidate.get("driver_quote") or amount_paid)
    if driver_quote < amount_paid:
        driver_quote = amount_paid
    baseline = float(mode_doc.get("median_fare", amount_paid) or amount_paid)
    if amount_paid > baseline * 3:
        raise HTTPException(status_code=400, detail="Payment amount is too high for this route")

    report_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow()
    await db.travel_reports.insert_one({
        "_id": report_id,
        "user_id": user_id,
        "route_id": req.route_id,
        "mode": str(mode_doc.get("mode") or req.mode),
        "amount_paid": amount_paid,
        "time_of_day": _normalize_travel_time_context(None),
        "luggage": False,
        "driver_quote": driver_quote,
        "final_amount": amount_paid,
        "anonymous": bool(req.anonymous),
        "upvotes": [],
        "downvotes": [],
        "source": "payment_sync_candidate",
        "source_transaction_id": transaction_id,
        "created_at": now,
    })
    await _refresh_route_mode_fares(db, req.route_id, str(mode_doc.get("mode") or req.mode))
    return {"status": "ok", "id": report_id, "candidate": candidate}


@router.get("/reports")
async def get_reports(route_id: str = Query(...), user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.travel_reports.find({"route_id": route_id}).sort("created_at", -1)
    reports = await cursor.to_list(length=200)

    mapped_reports = []
    for r in reports:
        report_dict = _to_dict(r)
        poster_id = report_dict.get("user_id")
        report_dict["is_own_report"] = poster_id == user_id
        if poster_id == user_id:
            report_dict["user_name"] = "Your report"
        elif report_dict.get("anonymous", True):
            report_dict["user_name"] = "Anonymous student"
        else:
            report_dict["user_name"] = "Campus student"
        
        # Calculate upvotes and downvotes
        upvotes = r.get("upvotes", [])
        downvotes = r.get("downvotes", [])
        report_dict["upvotes_count"] = len(upvotes)
        report_dict["downvotes_count"] = len(downvotes)
        
        if user_id in upvotes:
            report_dict["user_vote"] = "up"
        elif user_id in downvotes:
            report_dict["user_vote"] = "down"
        else:
            report_dict["user_vote"] = None

        report_dict["counts_in_model"] = bool(_trusted_fare_reports([r]))
            
        mapped_reports.append(report_dict)

    return mapped_reports

@router.post("/reports/{report_id}/vote")
async def vote_report(report_id: str, req: VoteReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    report = await db.travel_reports.find_one({"_id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.get("user_id") == user_id:
        raise HTTPException(status_code=400, detail="You cannot vote on your own fare report")
        
    vote_type = req.vote_type.lower()
    if vote_type not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Invalid vote type. Must be 'up' or 'down'.")
        
    upvotes = report.get("upvotes", [])
    downvotes = report.get("downvotes", [])
    
    if vote_type == "up":
        if user_id in upvotes:
            upvotes.remove(user_id)  # Toggle off
        else:
            upvotes.append(user_id)
            if user_id in downvotes:
                downvotes.remove(user_id)
    elif vote_type == "down":
        if user_id in downvotes:
            downvotes.remove(user_id)  # Toggle off
        else:
            downvotes.append(user_id)
            if user_id in upvotes:
                upvotes.remove(user_id)
                
    await db.travel_reports.update_one(
        {"_id": report_id},
        {"$set": {"upvotes": upvotes, "downvotes": downvotes}}
    )
    await _refresh_route_mode_fares(db, str(report.get("route_id") or ""), str(report.get("mode") or ""))
    
    return {
        "status": "ok",
        "upvotes_count": len(upvotes),
        "downvotes_count": len(downvotes),
        "user_vote": "up" if user_id in upvotes else "down" if user_id in downvotes else None
    }

@router.post("/reports")
async def create_report(req: ReportSubmitReq, user_id: str = Depends(get_current_user)):
    db = get_db()

    # Fetch route to validate route and get baseline fare
    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    if not route_doc:
        raise HTTPException(status_code=404, detail="Route not found")

    # Find base median fare for selected mode
    mode_doc = _find_mode(route_doc, req.mode)
    if not mode_doc:
        raise HTTPException(status_code=400, detail="Select a valid travel mode for this route")
    req.mode = str(mode_doc.get("mode") or req.mode)
    base_median_fare = float(mode_doc.get("median_fare", 150))

    # Validate input amounts
    if req.amount_paid != req.final_amount:
        raise HTTPException(status_code=400, detail="Amount paid and final amount must match")
    if req.amount_paid <= 0 or req.amount_paid > base_median_fare * 3:
        raise HTTPException(status_code=400, detail=f"Amount paid must be positive and not exceed 3x the baseline fare (Rs {base_median_fare * 3:.0f})")
    if req.final_amount <= 0 or req.final_amount > base_median_fare * 3:
        raise HTTPException(status_code=400, detail=f"Final amount must be positive and not exceed 3x the baseline fare (Rs {base_median_fare * 3:.0f})")
    if req.driver_quote <= 0 or req.driver_quote > base_median_fare * 5:
        raise HTTPException(status_code=400, detail=f"Driver quote must be positive and within reasonable limits (maximum Rs {base_median_fare * 5:.0f})")
    if req.final_amount > req.driver_quote:
        raise HTTPException(status_code=400, detail="Final amount cannot be higher than the driver quote")

    now = datetime.datetime.utcnow()
    duplicate_cutoff = now - datetime.timedelta(hours=REPORT_DUPLICATE_WINDOW_HOURS)
    recent_duplicate = await db.travel_reports.find_one({
        "user_id": user_id,
        "route_id": req.route_id,
        "mode": {"$regex": f"^{re.escape(req.mode)}$", "$options": "i"},
        "created_at": {"$gte": duplicate_cutoff},
    })
    if recent_duplicate:
        raise HTTPException(
            status_code=409,
            detail="You already reported this route and mode recently. Update the route after your next ride.",
        )

    report_id = str(uuid.uuid4())

    # Insert report
    await db.travel_reports.insert_one({
        "_id": report_id,
        "user_id": user_id,
        "route_id": req.route_id,
        "mode": req.mode,
        "amount_paid": req.amount_paid,
        "time_of_day": req.time_of_day,
        "luggage": req.luggage,
        "driver_quote": req.driver_quote,
        "final_amount": req.final_amount,
        "anonymous": True if req.anonymous is None else bool(req.anonymous),
        "upvotes": [],
        "downvotes": [],
        "created_at": now
    })

    await _refresh_route_mode_fares(db, req.route_id, req.mode)

    # Add to wing feed activity
    profile = await db.profiles.find_one({"_id": user_id})
    wing = profile.get("wing_label", "unknown wing") if profile else "unknown wing"

    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    route_name = route_doc.get("name", "campus route") if route_doc else "campus route"
    route_short = route_name.replace("→", " to ").split(" to ")[0].strip()

    await db.checkin_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "response": "travel_fare_report",
        "gap_hours": 0,
        "food_gap_hours": 0,
        "suggestion_given": f"{req.mode} via {route_short}",
        "stress_note": f"A student reported paying Rs {req.final_amount:.0f} (saved Rs {max(0.0, req.driver_quote - req.final_amount):.0f} from Rs {req.driver_quote:.0f} quote)",
        "created_at": now
    })

    return {"status": "ok", "id": report_id}

@router.get("/savings")
async def get_savings(user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.travel_savings.find({"user_id": user_id})
    savings = await cursor.to_list(length=1000)
    total_saved = sum(s.get("amount_saved", 0) for s in savings)
    return {"total_saved": total_saved}

@router.post("/savings")
async def log_savings(req: SavingsLogReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    if req.amount_saved <= 0 or req.amount_saved > 10000:
        raise HTTPException(status_code=400, detail="Savings amount must be positive and realistic")
    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    if not route_doc:
        raise HTTPException(status_code=404, detail="Route not found")
    savings_id = str(uuid.uuid4())

    await db.travel_savings.insert_one({
        "_id": savings_id,
        "user_id": user_id,
        "route_id": req.route_id,
        "amount_saved": req.amount_saved,
        "created_at": datetime.datetime.utcnow()
    })

    await db.checkin_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "response": "travel_savings",
        "gap_hours": 0,
        "food_gap_hours": 0,
        "suggestion_given": "negotiation_helper",
        "stress_note": f"Saved Rs {req.amount_saved:.0f} using Travel negotiation helper!",
        "created_at": datetime.datetime.utcnow()
    })

    return {"status": "ok", "id": savings_id, "amount_saved": req.amount_saved}


class AiCoachReq(BaseModel):
    route_id: str
    mode: str
    user_situation: Optional[str] = ""
    college: Optional[str] = None
    app_quote: Optional[float] = None  # Optional quote the student saw in a ride app
    travel_time_context: Optional[str] = None


def _coerce_ai_text(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _coerce_ai_tactics(value: Any, fallback: list[str]) -> list[str]:
    if isinstance(value, list):
        tactics = [str(item).strip() for item in value if str(item).strip()]
        if tactics:
            return tactics[:5]

    if isinstance(value, str) and value.strip():
        raw_parts = value.replace("\r", "\n").split("\n")
        tactics = []
        for part in raw_parts:
            cleaned = part.strip().lstrip("-*0123456789. )").strip()
            if cleaned:
                tactics.append(cleaned)
        if tactics:
            return tactics[:5]
        return [value.strip()]

    return fallback


COACH_IRRELEVANT_TERMS = (
    "privacy trust layer",
    "bank consent",
    "account aggregator",
    "android connector",
    "privacy center",
    "consent ledger",
    "bank password",
    "debit card",
    "mpin",
    "otp",
    "credential",
    "revoked consent",
    "pairing token",
)


def _is_irrelevant_coach_output(*values: Any) -> bool:
    combined = " ".join(str(value or "") for value in values).lower()
    return any(term in combined for term in COACH_IRRELEVANT_TERMS)


def _normalize_ai_coach_response(
    result: dict[str, Any],
    fallback_response: dict[str, Any],
    *,
    surge_factor: float,
    fare_anchor: float,
    fare_anchor_source: str,
    fare_anchor_label: str,
    report_count: int,
) -> dict[str, Any]:
    script = _coerce_ai_text(result.get("script"), fallback_response["script"])
    tactics = _coerce_ai_tactics(result.get("tactics"), fallback_response["tactics"])
    safety = _coerce_ai_text(result.get("safety"), fallback_response["safety"])

    if _is_irrelevant_coach_output(script, " ".join(tactics), safety):
        return {
            **fallback_response,
            "source": "route_script",
            "surge_factor": surge_factor,
            "community_median": fare_anchor if fare_anchor_source == "student_reports" else None,
            "fare_anchor": fare_anchor,
            "fare_anchor_source": fare_anchor_source,
            "fare_anchor_label": fare_anchor_label,
            "report_count": report_count,
        }

    return {
        "script": script,
        "tactics": tactics,
        "safety": safety,
        "source": "bedrock",
        "surge_factor": surge_factor,
        "community_median": fare_anchor if fare_anchor_source == "student_reports" else None,
        "fare_anchor": fare_anchor,
        "fare_anchor_source": fare_anchor_source,
        "fare_anchor_label": fare_anchor_label,
        "report_count": report_count,
    }


def generate_rich_fallback_script(college: str, mode: str, situation: str, app_quote: Optional[float], median_fare: float) -> str:
    col_lower = college.lower()
    mode_lower = mode.lower()
    sit_lower = situation.lower() if situation else ""
    
    # 1. Base pitches depending on college & mode
    if "gwalior" in col_lower or "iiitm" in col_lower:
        if "shared" in mode_lower or "tempo" in mode_lower:
            script = "Bhaiya, Hazira ka Rs 10 chalo na, regular campus rate hai."
        elif "auto" in mode_lower:
            script = f"Bhaiya, ABV-IIITM Gate 1 chalo na. Regular student rate Rs {median_fare:.0f} hai."
        elif "cab" in mode_lower or "taxi" in mode_lower:
            if app_quote:
                script = f"Bhaiya, IIITM campus direct drop. App par Rs {app_quote:.0f} dikha raha hai, Rs {median_fare:.0f} me done karte hain."
            else:
                script = f"Bhaiya, IIITM campus direct drop. Regular fare Rs {median_fare:.0f} ke around hai, done karte hain."
        else:
            script = f"Bhaiya, IIITM Gate 1 chalo. Normal fare Rs {median_fare:.0f} lagao."
            
    elif "delhi" in col_lower:
        if "auto" in mode_lower:
            script = f"Bhaiya, IIT Delhi main gate chalo. Meter se chaloge? Ya flat Rs {median_fare:.0f} le lo."
        else:
            script = f"Bhaiya, IIT main gate. Regular route rate is Rs {median_fare:.0f}."
            
    elif "pilani" in col_lower or "bits" in col_lower:
        script = f"Bhaiya ji, BITS Campus chalna hai. Standard rate Rs {median_fare:.0f} chalo na."
        
    elif "bombay" in col_lower or "mumbai" in col_lower:
        script = f"Dada, IIT Bombay chalo. Meter chalu karo na please, ya flat Rs {median_fare:.0f} chalo."
        
    elif "bangalore" in col_lower or "iiitb" in col_lower:
        if app_quote:
            script = f"Anna, IIIT Bangalore chalo. Regular route rate is Rs {median_fare:.0f}. App is showing Rs {app_quote:.0f}."
        else:
            script = f"Anna, IIIT Bangalore chalo. Regular route rate is Rs {median_fare:.0f}."
        
    elif "vellore" in col_lower or "vit" in col_lower:
        script = f"Anna, VIT Vellore campus main gate. Katpadi station se standard rate Rs {median_fare:.0f} chalo."
        
    else:
        script = f"Bhaiya, campus chalna hai. Sahi price lagao, regular rate Rs {median_fare:.0f} hai."

    # 2. Append app benchmark counter-anchors
    if app_quote and app_quote > median_fare:
        script += f" App par toh high quote Rs {app_quote:.0f} dikha raha hai, regular rates toh Rs {median_fare:.0f} hote hain."

    # 3. Add situation-specific overlays
    if sit_lower:
        if "rain" in sit_lower or "barish" in sit_lower:
            script += " Barish ho rahi hai, direct gate drop kar do please."
        elif "luggage" in sit_lower or "bag" in sit_lower or "saman" in sit_lower:
            script += " Saman bhi hai sath me, thoda adjust kar lo."
        elif "night" in sit_lower or "late" in sit_lower or "raat" in sit_lower:
            script += " Late night hai bhaiya, direct and safe drop karo."
        else:
            script += f" (Note: {situation})"
            
    return script


def build_travel_ai_prompt(
    *,
    college: str,
    region: str,
    route_name: str,
    distance_km: float,
    mode: str,
    min_fare: float,
    max_fare: float,
    median_fare: float,
    fare_anchor: float,
    fare_anchor_label: str,
    report_count: int,
    surge_context: str,
    user_situation: Optional[str],
    dialect: str,
    travel_time_context: str = "now",
) -> str:
    return f"""
You are PocketBuddy Travel Guard, a student transport fare assistant.
The student is at {college} in {region}.
They are travelling on the route: {route_name} ({distance_km} km) via {mode}.
Target fair range: Rs. {min_fare} to Rs. {max_fare} (median: Rs. {median_fare}).
Fare anchor: Rs. {fare_anchor} ({fare_anchor_label}; distinct trusted reports counted: {report_count}).
{surge_context}
Student's current situation/problems: {user_situation or 'None'}
Selected travel timing: {travel_time_context}.

Hard rules:
- Use only the fare numbers, route, distance, quote context, and report count provided above.
- Never invent fare numbers, live traffic, route distances, app prices, report counts, landmarks, or safety claims.
- Do not imply live Ola, Uber, Rapido, or other ride-app pricing unless the context explicitly says the quote came from a live API. User-entered app quotes are only comparison inputs.
- If the fare anchor is a Distance model, call it an estimate. If it is Student reports, mention the distinct trusted report count.
- Keep advice practical and safe; do not encourage unsafe walking, isolated pickups, or late-night shared rides.

Task:
Generate a JSON object containing three fields:
1. "script": A localized, realistic negotiation script in local student dialect ({dialect}) to say to the driver. Keep it short and natural. Mention an app quote only if quote context is provided.
2. "tactics": Array of 3 route-specific tactical tips. Each tip must be grounded in the supplied fare/routing context.
3. "safety": A 1-sentence quick safety advice for this specific situation.

Output ONLY valid JSON matching this schema, without markdown formatting or trailing text. Do not wrap in ```json.
"""


@router.post("/ai-coach")
async def get_ai_negotiation_coach(req: AiCoachReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    normalized_time_context = _normalize_travel_time_context(req.travel_time_context)

    # Fetch route info
    route = await db.travel_routes.find_one({"_id": req.route_id})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    if req.app_quote is not None and (req.app_quote <= 0 or req.app_quote > 50000):
        raise HTTPException(status_code=400, detail="Enter a valid app quote")

    # Determine college name
    college = req.college or (route.get("college") if route else None)
    if not college:
        profile = await db.profiles.find_one({"_id": user_id})
        college = profile.get("college_name") if profile else "ABV-IIITM Gwalior"

    route_name = route.get("name", "Campus Route")
    distance_km = route.get("distance_km", 10.0)

    # Determine target fare ranges
    min_fare, max_fare, median_fare = 150, 200, 175
    mode_doc = _find_mode(route, req.mode)
    if not mode_doc:
        raise HTTPException(status_code=400, detail="Select a valid travel mode for this route")
    req.mode = str(mode_doc.get("mode") or req.mode)
    min_fare = mode_doc.get("min_fare", min_fare)
    max_fare = mode_doc.get("max_fare", max_fare)
    median_fare = mode_doc.get("median_fare", median_fare)

    # --- Surge / quote comparison model ---
    # Only call the anchor "student reports" when enough reports exist.
    # Otherwise it is explicitly a distance-model estimate.
    surge_factor = 1.0
    fare_anchor = float(median_fare)
    fare_anchor_source = "distance_model"
    fare_anchor_label = "Distance model"
    community_median = None
    report_count = 0
    if route:
        report_cursor = db.travel_reports.find({
            "route_id": req.route_id,
            "mode": {"$regex": re.escape(req.mode), "$options": "i"},
        }).sort("created_at", -1)
        recent_reports = await report_cursor.to_list(length=200)
        recent_reports = _trusted_fare_reports(recent_reports)
        report_count = len(recent_reports)
        report_threshold = compute_travel_verification_threshold(report_count)
        if report_count >= report_threshold:
            robust_range = _robust_fare_range(
                [r.get("final_amount") for r in recent_reports],
                min_sample_size=report_threshold,
            )
            if robust_range:
                fare_anchor = float(robust_range["median_fare"])
                community_median = fare_anchor
                fare_anchor_source = "student_reports"
                fare_anchor_label = f"{robust_range['sample_size']} distinct student reports"

    time_factor = _travel_time_fare_factor(normalized_time_context)
    if time_factor != 1.0:
        min_fare = round(float(min_fare) * time_factor)
        max_fare = round(float(max_fare) * time_factor)
        median_fare = round(float(median_fare) * time_factor)
        fare_anchor = round(float(fare_anchor) * time_factor, 2)
        fare_anchor_label = f"{fare_anchor_label}, adjusted for {_travel_time_label(normalized_time_context)}"

    if req.app_quote and req.app_quote > 0 and fare_anchor > 0:
        surge_factor = round(req.app_quote / fare_anchor, 2)

    surge_context = ""
    if surge_factor > 1.5:
        surge_context = f"SURGE ALERT: Current app quote entered by the student (Rs. {req.app_quote:.0f}) is {surge_factor}x the {fare_anchor_label.lower()} anchor (Rs. {fare_anchor:.0f}). Advise the student to consider safer alternatives or wait 15-30 min."
    elif surge_factor > 1.15:
        surge_context = f"MILD SURGE: Current app quote entered by the student (Rs. {req.app_quote:.0f}) is {surge_factor}x the {fare_anchor_label.lower()} anchor (Rs. {fare_anchor:.0f}). The student should use Rs. {fare_anchor:.0f} as the counter-anchor."
    elif req.app_quote and req.app_quote > 0:
        surge_context = f"NO SURGE: Current app quote entered by the student (Rs. {req.app_quote:.0f}) is close to the {fare_anchor_label.lower()} anchor (Rs. {fare_anchor:.0f}). Fair pricing window."

    # Dialect and regional mapping based on college
    col_lower = college.lower()
    if "gwalior" in col_lower or "iiitm" in col_lower:
        region = "Gwalior, Madhya Pradesh"
        dialect = "Chambal-styled friendly but street-smart Hindi. Use terms like 'Bhaiya', 'chalo na' in a firm student voice."
    elif "delhi" in col_lower:
        region = "Delhi NCR"
        dialect = "Delhi Hinglish/slang. Use terms like 'Bhai', 'yaar', refer to standard app booking screenshots, speak firmly."
    elif "pilani" in col_lower or "bits" in col_lower:
        region = "Pilani, Rajasthan"
        dialect = "Pilani student Hinglish. Use terms like 'Bhaiya ji', be polite but highly assertive."
    elif "bombay" in col_lower or "mumbai" in col_lower:
        region = "Mumbai, Maharashtra"
        dialect = "Bambaiya street Hinglish. Use terms like 'Dada', 'Boss', mention 'meter-se chalo'."
    elif "bangalore" in col_lower or "iiitb" in col_lower:
        region = "Bangalore, Karnataka"
        dialect = "Bangalore Hinglish. Use terms like 'Anna', refer to dynamic app pricing, polite and rational."
    elif "vellore" in col_lower or "vit" in col_lower:
        region = "Vellore, Tamil Nadu"
        dialect = "Vellore/Tamil Hinglish. Use terms like 'Anna', mention standard Katpadi junction fares."
    else:
        region = "India"
        dialect = "Hinglish student negotiation slang."

    # Build local rule-based fallback response using rich generator
    fallback_script = generate_rich_fallback_script(college, req.mode, req.user_situation, req.app_quote, fare_anchor)

    fallback_response = {
        "script": fallback_script,
        "tactics": [
            f"If you have a ride-app quote, compare it with this fare anchor before discussing flat rates.",
            f"Walk 100 meters away from main exit gates to hire passing running autos rather than stationary ones.",
            f"Refer to standard rates: Bhaiya, regular campus rate is between Rs {min_fare}-Rs {max_fare}."
        ],
        "safety": route.get("safety_score_night", "Avoid shared/unknown routes late at night; prefer pre-booked rides.") if route else "Always prefer pre-booked rides late at night.",
        "surge_factor": surge_factor,
        "community_median": community_median,
        "fare_anchor": fare_anchor,
        "fare_anchor_source": fare_anchor_source,
        "fare_anchor_label": fare_anchor_label,
        "report_count": report_count,
        "source": "local_fallback"
    }

    if not settings.BEDROCK_ENABLED:
        return fallback_response

    try:
        prompt = build_travel_ai_prompt(
            college=college,
            region=region,
            route_name=route_name,
            distance_km=distance_km,
            mode=req.mode,
            min_fare=min_fare,
            max_fare=max_fare,
            median_fare=median_fare,
            fare_anchor=fare_anchor,
            fare_anchor_label=fare_anchor_label,
            report_count=report_count,
            surge_context=surge_context,
            user_situation=req.user_situation,
            dialect=dialect,
            travel_time_context=normalized_time_context,
        )

        result = generate_json(prompt, max_tokens=500, temperature=0.25)
        return _normalize_ai_coach_response(
            result,
            fallback_response,
            surge_factor=surge_factor,
            fare_anchor=fare_anchor,
            fare_anchor_source=fare_anchor_source,
            fare_anchor_label=fare_anchor_label,
            report_count=report_count,
        )

    except Exception as exc:
        logger.warning("Bedrock AI coach failed: %s", exc)
        return {**fallback_response, "bedrock_error": str(exc)}



# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#  ROUTING ENGINE
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# Curated landmark to (city, (lat, lon)) mapping.
# City field is used to validate that a matched landmark
# belongs to the same city as the user's campus, preventing
# cross-campus coordinate leakage.
KNOWN_LANDMARK_COORDS: dict[str, tuple[str, tuple[float, float]]] = {
    # ── Gwalior ───────────────────────────────────────────────────────────────
    # Railway/Station
    "gwalior junction":    ("Gwalior",   (26.2162, 78.1826)),
    "gwalior station":     ("Gwalior",   (26.2162, 78.1826)),
    "gwalior railway":     ("Gwalior",   (26.2162, 78.1826)),
    "railway station":     ("Gwalior",   (26.2162, 78.1826)),  # generic — gwalior context
    # Airport
    "gwalior airport":     ("Gwalior",   (26.2941, 78.2281)),
    "rajmata airport":     ("Gwalior",   (26.2941, 78.2281)),
    # Bus Stand
    "gola ka mandir":      ("Gwalior",   (26.2140, 78.1840)),
    "gwalior bus stand":   ("Gwalior",   (26.2140, 78.1840)),
    "bus stand gwalior":   ("Gwalior",   (26.2140, 78.1840)),
    "gwalior bus":         ("Gwalior",   (26.2140, 78.1840)),
    "bus stand":           ("Gwalior",   (26.2140, 78.1840)),   # generic — gwalior context
    # Localities
    "hazira":              ("Gwalior",   (26.2346, 78.1901)),
    "phool bagh":          ("Gwalior",   (26.2163, 78.1687)),
    "lashkar":             ("Gwalior",   (26.2183, 78.1828)),   # old Gwalior city centre
    "city centre":         ("Gwalior",   (26.2183, 78.1828)),   # generic city centre
    "city center":         ("Gwalior",   (26.2183, 78.1828)),
    "maharaj bada":        ("Gwalior",   (26.2185, 78.1821)),
    "morar":               ("Gwalior",   (26.2420, 78.2180)),
    "thatipur":            ("Gwalior",   (26.2052, 78.1503)),
    "govindpuri":          ("Gwalior",   (26.1947, 78.1710)),
    "padav":               ("Gwalior",   (26.2270, 78.1810)),
    "birla nagar":         ("Gwalior",   (26.2093, 78.1569)),
    "kampoo":              ("Gwalior",   (26.2233, 78.1883)),
    "university gwalior":  ("Gwalior",   (26.2162, 78.1750)),
    "jiwaji university":   ("Gwalior",   (26.2162, 78.1750)),
    # ── Delhi ─────────────────────────────────────────────────────────────────
    "new delhi station":   ("Delhi",     (28.6430, 77.2223)),
    "ndls":                ("Delhi",     (28.6430, 77.2223)),
    "new delhi railway":   ("Delhi",     (28.6430, 77.2223)),
    "delhi railway":       ("Delhi",     (28.6430, 77.2223)),
    "kashmere gate":       ("Delhi",     (28.6669, 77.2294)),
    "delhi airport":       ("Delhi",     (28.5562, 77.1000)),
    "igi airport":         ("Delhi",     (28.5562, 77.1000)),
    "connaught place":     ("Delhi",     (28.6328, 77.2197)),
    "hauz khas":           ("Delhi",     (28.5494, 77.2001)),
    # ── Pilani ────────────────────────────────────────────────────────────────
    "loharu station":      ("Pilani",    (28.4357, 75.8115)),
    "loharu railway":      ("Pilani",    (28.4357, 75.8115)),
    "pilani bus stand":    ("Pilani",    (28.3718, 75.6022)),
    "pilani bus":          ("Pilani",    (28.3718, 75.6022)),
    "chirawa":             ("Pilani",    (28.2330, 75.6426)),
    # ── Mumbai ────────────────────────────────────────────────────────────────
    "lokmanya tilak":      ("Mumbai",    (19.0601, 72.8901)),
    "ltt station":         ("Mumbai",    (19.0601, 72.8901)),
    "kurla station":       ("Mumbai",    (19.0673, 72.8895)),
    "kurla bus":           ("Mumbai",    (19.0673, 72.8895)),
    "mumbai airport":      ("Mumbai",    (19.0896, 72.8656)),
    "csmia":               ("Mumbai",    (19.0896, 72.8656)),
    "bandra":              ("Mumbai",    (19.0596, 72.8295)),
    "powai":               ("Mumbai",    (19.1176, 72.9060)),
    "andheri":             ("Mumbai",    (19.1197, 72.8464)),
    # ── Bangalore ─────────────────────────────────────────────────────────────
    "majestic station":    ("Bangalore", (12.9779, 77.5724)),
    "ksr station":         ("Bangalore", (12.9779, 77.5724)),
    "bangalore station":   ("Bangalore", (12.9779, 77.5724)),
    "electronic city bus": ("Bangalore", (12.8497, 77.6749)),
    "bangalore airport":   ("Bangalore", (13.1986, 77.7066)),
    "kempegowda airport":  ("Bangalore", (13.1986, 77.7066)),
    "electronic city":     ("Bangalore", (12.8399, 77.6770)),
    "koramangala":         ("Bangalore", (12.9352, 77.6245)),
    # ── Vellore ───────────────────────────────────────────────────────────────
    "katpadi junction":    ("Vellore",   (12.9796, 79.1375)),
    "katpadi station":     ("Vellore",   (12.9796, 79.1375)),
    "vellore bus stand":   ("Vellore",   (12.9304, 79.1348)),
    "vellore new bus":     ("Vellore",   (12.9304, 79.1348)),
    "chennai airport":     ("Vellore",   (12.9941, 80.1709)),
    "maa airport":         ("Vellore",   (12.9941, 80.1709)),
    "ambur":               ("Vellore",   (12.7974, 78.7184)),
}

# Pre-configured metadata for the 6 main target campuses.
# IMPORTANT: Only include unambiguous institution-specific keywords here.
# Do NOT add plain city names like "gwalior", "pilani", "mumbai" — these
# appear in landmark queries (e.g. "Gwalior Station") and would cause false matches.
# Format: (institution_keyword, city, state, lat, lon)
_KNOWN_CAMPUS_META: list[tuple[str, str, str, float, float]] = [
    ("abv-iiitm",      "Gwalior",   "Madhya Pradesh", 26.2514, 78.1685),
    ("iiitm gwalior",  "Gwalior",   "Madhya Pradesh", 26.2514, 78.1685),
    ("iiitm",          "Gwalior",   "Madhya Pradesh", 26.2514, 78.1685),
    ("iiit allahabad", "Prayagraj", "Uttar Pradesh",  25.4304, 81.7700),
    ("iit delhi",      "Delhi",     "Delhi",           28.5463, 77.1928),
    ("iitd",           "Delhi",     "Delhi",           28.5463, 77.1928),
    ("bits pilani",    "Pilani",    "Rajasthan",       28.3582, 75.5901),
    ("iit bombay",     "Mumbai",    "Maharashtra",     19.1246, 72.9157),
    ("iitb",           "Mumbai",    "Maharashtra",     19.1246, 72.9157),
    ("iiit bangalore", "Bangalore", "Karnataka",       12.8407, 77.6766),
    ("iiitb",          "Bangalore", "Karnataka",       12.8407, 77.6766),
    ("vit vellore",    "Vellore",   "Tamil Nadu",      12.9712, 79.1601),
]

_COLLEGE_NAME_CITY_HINTS: list[tuple[str, str, str, float, float]] = [
    ("gwalior",    "Gwalior",    "Madhya Pradesh", 26.2514, 78.1685),
    ("allahabad",  "Prayagraj",  "Uttar Pradesh",  25.4358, 81.8463),
    ("prayagraj",  "Prayagraj",  "Uttar Pradesh",  25.4358, 81.8463),
    ("pilani",     "Pilani",     "Rajasthan",      28.3582, 75.5901),
    ("mumbai",     "Mumbai",     "Maharashtra",    19.1246, 72.9157),
    ("bombay",     "Mumbai",     "Maharashtra",    19.1246, 72.9157),
    ("bangalore",  "Bangalore",  "Karnataka",      12.8407, 77.6766),
    ("bengaluru",  "Bangalore",  "Karnataka",      12.8407, 77.6766),
    ("vellore",    "Vellore",    "Tamil Nadu",     12.9712, 79.1601),
    ("delhi",      "Delhi",      "Delhi",          28.5463, 77.1928),
    ("kanpur",     "Kanpur",     "Uttar Pradesh",  26.5123, 80.2329),
    ("varanasi",   "Varanasi",   "Uttar Pradesh",  25.2677, 82.9913),
    ("roorkee",    "Roorkee",    "Uttarakhand",    29.8649, 77.8964),
    ("kharagpur",  "Kharagpur",  "West Bengal",    22.3193, 87.3095),
    ("hyderabad",  "Hyderabad",  "Telangana",      17.4455, 78.3498),
    ("chennai",    "Chennai",    "Tamil Nadu",     13.0827, 80.2707),
    ("pune",       "Pune",       "Maharashtra",    18.5204, 73.8567),
]

_NOMINATIM_HEADERS = build_geo_headers(settings.travel_geo_user_agent)
_PHOTON_HEADERS = build_geo_headers(settings.travel_geo_user_agent)


def _nominatim_base_url() -> str:
    return (settings.nominatim_geocoder_url or "https://nominatim.openstreetmap.org").rstrip("/")


def _osrm_base_url() -> str:
    return (settings.osrm_route_url or "https://router.project-osrm.org").rstrip("/")


def _geo_cache_collection(db: Any) -> Optional[Any]:
    if db is None or not settings.travel_geo_cache_enabled:
        return None
    return db.travel_geo_cache


async def _read_geo_cache(db: Any, cache_key: str) -> Optional[dict[str, Any]]:
    collection = _geo_cache_collection(db)
    if collection is None:
        return None
    try:
        return await get_geo_cache(collection, cache_key)
    except Exception as exc:
        logger.info("Travel geo cache read skipped for %s: %s", cache_key, exc)
        return None


async def _write_geo_cache(
    db: Any,
    cache_key: str,
    *,
    kind: str,
    provider: str,
    payload: dict[str, Any],
    ttl_days: int,
) -> None:
    collection = _geo_cache_collection(db)
    if collection is None:
        return
    try:
        await set_geo_cache(
            collection,
            cache_key,
            kind=kind,
            provider=provider,
            payload=payload,
            ttl_days=ttl_days,
        )
    except Exception as exc:
        logger.info("Travel geo cache write skipped for %s: %s", cache_key, exc)


def _valid_lat_lon(lat: Optional[float], lon: Optional[float]) -> bool:
    return (
        lat is not None
        and lon is not None
        and -90.0 <= float(lat) <= 90.0
        and -180.0 <= float(lon) <= 180.0
    )


def _place_suggestion(
    *,
    suggestion_id: str,
    label: str,
    secondary: str,
    source: str,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    place_id: Optional[str] = None,
    confidence: str = "medium",
    match_score: float = 0.0,
) -> dict[str, Any]:
    return {
        "id": suggestion_id,
        "label": label,
        "secondary": secondary,
        "source": source,
        "lat": lat,
        "lon": lon,
        "place_id": place_id,
        "confidence": confidence,
        "match_score": round(match_score, 3),
    }


def _normalize_place_text(value: str) -> str:
    value = (value or "").lower().strip()
    replacements = {
        "stn": "station",
        "staion": "station",
        "staton": "station",
        "railwy": "railway",
        "rly": "railway",
        "junctn": "junction",
        "jn": "junction",
        "centr": "centre",
        "center": "centre",
        "airprt": "airport",
        "busstand": "bus stand",
        "main gate": "gate",
    }
    value = re.sub(r"[^a-z0-9\s]+", " ", value)
    words = [replacements.get(part, part) for part in value.split()]
    return " ".join(words)


def _place_match_score(query: str, candidate: str) -> float:
    q = _normalize_place_text(query)
    c = _normalize_place_text(candidate)
    if not q or not c:
        return 0.0
    if q in c or c in q:
        return 1.0

    q_tokens = set(q.split())
    c_tokens = set(c.split())
    token_score = len(q_tokens & c_tokens) / max(1, len(q_tokens | c_tokens))
    sequence_score = SequenceMatcher(None, q, c).ratio()
    best_word_score = max(
        (SequenceMatcher(None, q_word, c_word).ratio() for q_word in q_tokens for c_word in c_tokens),
        default=0.0,
    )
    word_weight = 0.58 if len(q_tokens) == 1 else 0.38
    return max(token_score, sequence_score * 0.9, best_word_score * word_weight)


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * math.asin(math.sqrt(a)) * 6371.0


def _city_anchored_query(query: str, campus_city: str) -> str:
    q = query.strip()
    city = str(campus_city or "").strip()
    if not q or not city:
        return q
    city_words = [word for word in _normalize_place_text(city).split() if len(word) > 2]
    has_city = any(word in _normalize_place_text(q).split() for word in city_words)
    return q if has_city else f"{q}, {city}"


def _dedupe_place_suggestions(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        label = str(item.get("label") or "").strip().lower()
        lat = item.get("lat")
        lon = item.get("lon")
        key = f"{label}|{round(float(lat), 4) if lat is not None else ''}|{round(float(lon), 4) if lon is not None else ''}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


def _nominatim_label(hit: dict[str, Any]) -> tuple[str, str]:
    display = str(hit.get("display_name") or "").strip()
    name = str(hit.get("name") or "").strip()
    parts = [part.strip() for part in display.split(",") if part.strip()]
    label = name or (parts[0] if parts else "Mapped place")
    secondary_parts = [part for part in parts if part.lower() != label.lower()]
    secondary = " · ".join(secondary_parts[:4]) or "Map data"
    return label, secondary


def _local_place_suggestions(
    *,
    query: str,
    college: str,
    campus_meta: dict[str, Any],
    limit: int,
) -> list[dict[str, Any]]:
    q = query.lower().strip()
    campus_city = str(campus_meta.get("city") or "").lower()
    suggestions: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(item: dict[str, Any]) -> None:
        key = f"{item.get('label')}|{item.get('lat')}|{item.get('lon')}".lower()
        if key in seen or len(suggestions) >= limit:
            return
        seen.add(key)
        suggestions.append(item)

    campus_labels = [
        f"{college} Main Gate",
        f"{college} Campus",
        "Campus Main Gate",
    ]
    for idx, label in enumerate(campus_labels):
        score = _place_match_score(q, label)
        if not q or score >= 0.42:
            add(
                _place_suggestion(
                    suggestion_id=f"campus_{idx}",
                    label=label,
                    secondary=f"{campus_meta.get('city', 'Campus')} · campus location",
                    source="campus",
                    lat=float(campus_meta["lat"]),
                    lon=float(campus_meta["lon"]),
                    confidence="high" if score >= 0.7 else "medium",
                    match_score=score,
                )
            )

    for key, (city, coords) in KNOWN_LANDMARK_COORDS.items():
        city_l = city.lower()
        if campus_city and not (city_l in campus_city or campus_city in city_l):
            continue
        label = key.title()
        score = max(_place_match_score(q, key), _place_match_score(q, label))
        if q and score < 0.42:
            continue
        add(
            _place_suggestion(
                suggestion_id=f"landmark_{key.replace(' ', '_')}",
                label=label,
                secondary=f"{city} · known student route point",
                source="campus_landmark",
                lat=float(coords[0]),
                lon=float(coords[1]),
                confidence="high" if score >= 0.55 else "medium",
                match_score=score,
            )
        )

    suggestions.sort(
        key=lambda item: (
            1 if item.get("confidence") == "high" else 0,
            float(item.get("match_score") or 0),
        ),
        reverse=True,
    )
    return suggestions[:limit]


async def _photon_place_suggestions(
    *,
    query: str,
    campus_city: str,
    campus_lat: float,
    campus_lon: float,
    limit: int,
) -> list[dict[str, Any]]:
    if len(query.strip()) < 3:
        return []

    base_url = (settings.photon_geocoder_url or "https://photon.komoot.io").rstrip("/")
    search_q = _city_anchored_query(query, campus_city)
    bbox_margin = 1.2
    try:
        async with httpx.AsyncClient(headers=_PHOTON_HEADERS, timeout=6.0) as client:
            response = await client.get(
                f"{base_url}/api",
                params={
                    "q": search_q,
                    "lat": campus_lat,
                    "lon": campus_lon,
                    "zoom": 12,
                    "location_bias_scale": 0.2,
                    "bbox": f"{campus_lon - bbox_margin},{campus_lat - bbox_margin},{campus_lon + bbox_margin},{campus_lat + bbox_margin}",
                    "countrycode": "IN",
                    "limit": min(max(limit * 2, 6), 16),
                    "lang": "en",
                },
            )
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        logger.warning("Photon autocomplete failed for '%s': %s", query, exc)
        return []

    suggestions: list[dict[str, Any]] = []
    seen: set[str] = set()

    for idx, feature in enumerate(data.get("features", [])):
        props = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        if not _valid_lat_lon(lat, lon):
            continue

        label = props.get("name") or props.get("street") or props.get("city")
        if not label:
            continue

        secondary_parts = [
            props.get("street"),
            props.get("district"),
            props.get("city") or props.get("county"),
            props.get("state"),
        ]
        secondary = " · ".join(str(part) for part in secondary_parts if part and part != label)
        if not secondary:
            secondary = props.get("country") or "Map data"

        campus_distance = _distance_km(campus_lat, campus_lon, float(lat), float(lon))
        match_score = max(
            _place_match_score(query, str(label)),
            _place_match_score(search_q, f"{label} {secondary}"),
        )
        if match_score < 0.42:
            continue
        if campus_distance > 250 and match_score < 0.62:
            continue

        key = f"{label}|{round(float(lat), 5)}|{round(float(lon), 5)}".lower()
        if key in seen:
            continue
        seen.add(key)

        confidence = "high" if match_score >= 0.62 and campus_distance <= 120 else "medium"
        suggestions.append(
            _place_suggestion(
                suggestion_id=f"photon_{props.get('osm_type', 'x')}_{props.get('osm_id', idx)}",
                label=str(label),
                secondary=secondary,
                source="photon",
                lat=float(lat),
                lon=float(lon),
                confidence=confidence,
                match_score=match_score,
            )
        )

    suggestions.sort(
        key=lambda item: (
            1 if item.get("confidence") == "high" else 0,
            float(item.get("match_score") or 0),
        ),
        reverse=True,
    )
    return suggestions[:limit]


async def _nominatim_place_suggestions(
    *,
    query: str,
    campus_city: str,
    campus_lat: float,
    campus_lon: float,
    limit: int,
    db: Any = None,
) -> list[dict[str, Any]]:
    cleaned = query.strip()
    if len(cleaned) < 4:
        return []

    search_q = _city_anchored_query(cleaned, campus_city)
    q_norm = _normalize_place_text(cleaned)
    transport_or_citywide = any(
        token in q_norm
        for token in ("airport", "station", "railway", "bus", "isbt", "junction")
    )
    max_distance_km = 220.0 if transport_or_citywide else 120.0
    bbox_margin = 2.0 if transport_or_citywide else 1.0
    viewbox = (
        f"{campus_lon - bbox_margin},{campus_lat + bbox_margin},"
        f"{campus_lon + bbox_margin},{campus_lat - bbox_margin}"
    )

    base_url = _nominatim_base_url()
    cache_key = build_geo_cache_key(
        "nominatim_suggestions",
        base_url,
        search_q,
        viewbox,
        limit,
    )
    cached = await _read_geo_cache(db, cache_key)
    if cached and isinstance(cached.get("hits"), list):
        hits = cached["hits"]
    else:
        try:
            async with httpx.AsyncClient(headers=_NOMINATIM_HEADERS, timeout=6.0) as client:
                response = await client.get(
                    f"{base_url}/search",
                    params={
                        "q": search_q,
                        "format": "json",
                        "addressdetails": 1,
                        "limit": min(max(limit * 3, 6), 12),
                        "viewbox": viewbox,
                        "bounded": 0,
                        "countrycodes": "in",
                        "accept-language": "en",
                    },
                )
            response.raise_for_status()
            hits = response.json()
            await _write_geo_cache(
                db,
                cache_key,
                kind="nominatim_suggestions",
                provider=base_url,
                payload={"hits": hits},
                ttl_days=settings.travel_geocode_cache_ttl_days,
            )
        except Exception as exc:
            logger.warning("Nominatim suggestion fallback failed for '%s': %s", query, exc)
            return []

    suggestions: list[dict[str, Any]] = []
    for idx, hit in enumerate(hits):
        try:
            lat, lon = float(hit["lat"]), float(hit["lon"])
        except Exception:
            continue
        if not _valid_lat_lon(lat, lon):
            continue

        campus_distance = _distance_km(campus_lat, campus_lon, lat, lon)
        display = str(hit.get("display_name") or "")
        city_match = bool(campus_city and campus_city.lower() in display.lower())
        if campus_distance > max_distance_km and not city_match:
            continue

        label, secondary = _nominatim_label(hit)
        match_score = max(
            _place_match_score(cleaned, label),
            _place_match_score(search_q, display),
        )
        if match_score < 0.24 and campus_distance > 50:
            continue

        confidence = "medium" if campus_distance <= 80 or match_score >= 0.5 else "low"
        suggestions.append(
            _place_suggestion(
                suggestion_id=f"nominatim_{hit.get('osm_type', 'x')}_{hit.get('osm_id', idx)}",
                label=label,
                secondary=secondary,
                source="nominatim",
                lat=lat,
                lon=lon,
                place_id=str(hit.get("place_id") or hit.get("osm_id") or ""),
                confidence=confidence,
                match_score=match_score,
            )
        )

    suggestions.sort(
        key=lambda item: (
            1 if item.get("confidence") == "medium" else 0,
            float(item.get("match_score") or 0),
        ),
        reverse=True,
    )
    return suggestions[:limit]


# Terms that indicate the query refers to the campus/college itself
_CAMPUS_ENDPOINT_TERMS = frozenset({
    "campus", "college", "university", "institute", "iit", "nit", "bits",
    "iiit", "iiitm", "iitd", "iitb", "iiitb", "iiitm", "vit", "main gate",
    "gate 1", "gate 2", "main entrance", "academic block",
})


async def get_campus_metadata(db, college_name: str) -> dict:
    """
    Resolves campus lat/lon/city/state for ANY college.

    Resolution order:
      1. MongoDB cache (zero latency)
      2. Pre-configured 6 campuses (zero API calls)
      3. Nominatim search + reverse geocode (dynamic, any college worldwide)
      4. Absolute fallback: Gwalior defaults
    """
    # 1. MongoDB cache
    cached = await db.campus_metadata.find_one({"_id": college_name})
    if cached:
        logger.debug("campus_metadata HIT: '%s' -> %s", college_name, cached.get("city"))
        return cached

    logger.info("campus_metadata MISS: '%s'. Resolving...", college_name)
    col_lower = college_name.lower()

    # 2. Pre-configured campuses — match against KNOWN_CAMPUS_META first
    for keyword, city, state, lat, lon in _KNOWN_CAMPUS_META:
        if keyword in col_lower:
            meta = {
                "_id": college_name,
                "lat": lat, "lon": lon,
                "city": city, "state": state,
                "source": "known_campus",
                "confidence": "high",
                "updated_at": datetime.datetime.utcnow(),
            }
            await db.campus_metadata.replace_one({"_id": college_name}, meta, upsert=True)
            logger.info("Known campus matched: '%s' -> %s", college_name, city)
            return meta

    # 3. Dynamic Nominatim geocode
    lat, lon, city, state = None, None, None, None
    base_url = _nominatim_base_url()
    async with httpx.AsyncClient(headers=_NOMINATIM_HEADERS, timeout=8.0) as client:
        try:
            r = await client.get(
                f"{base_url}/search",
                params={"q": college_name, "format": "json", "limit": 1},
            )
            if r.status_code == 200 and r.json():
                hit = r.json()[0]
                lat, lon = float(hit["lat"]), float(hit["lon"])
                # Reverse geocode for authoritative city
                rev = await client.get(
                    f"{base_url}/reverse",
                    params={"lat": lat, "lon": lon, "format": "json"},
                )
                if rev.status_code == 200:
                    addr = rev.json().get("address", {})
                    city = (
                        addr.get("city")
                        or addr.get("town")
                        or addr.get("municipality")
                        or addr.get("county")
                        or addr.get("state_district")
                        or "Unknown"
                    )
                    state = addr.get("state", "India")
                    logger.info("Nominatim resolved '%s' -> %s, %s @ (%.4f, %.4f)",
                                college_name, city, state, lat, lon)
        except Exception as exc:
            logger.warning("Nominatim campus resolution failed for '%s': %s", college_name, exc)

    if lat:
        meta = {
            "_id": college_name,
            "lat": lat, "lon": lon,
            "city": city, "state": state,
            "source": "geocoded_campus",
            "confidence": "medium" if city and city != "Unknown" else "low",
            "updated_at": datetime.datetime.utcnow(),
        }
        await db.campus_metadata.replace_one({"_id": college_name}, meta, upsert=True)
        return meta

    # 4. Extended city-keyword matching for college names that do not resolve exactly.
    # This is treated as a city-level anchor, not a confirmed campus coordinate.
    for keyword, city, state, lat, lon in _COLLEGE_NAME_CITY_HINTS:
        if keyword in col_lower:
            meta = {
                "_id": college_name,
                "lat": lat, "lon": lon,
                "city": city, "state": state,
                "source": "city_hint",
                "confidence": "low",
                "updated_at": datetime.datetime.utcnow(),
            }
            await db.campus_metadata.replace_one({"_id": college_name}, meta, upsert=True)
            logger.info("City keyword matched college name '%s' -> %s", college_name, city)
            return meta

    # 5. Absolute fallback
    if not lat:
        lat, lon, city, state = 26.2514, 78.1685, "Gwalior", "Madhya Pradesh"
        logger.warning("Absolute fallback to Gwalior for unknown campus '%s'", college_name)

    meta = {
        "_id": college_name,
        "lat": lat, "lon": lon,
        "city": city, "state": state,
        "source": "absolute_fallback",
        "confidence": "low",
        "updated_at": datetime.datetime.utcnow(),
    }
    await db.campus_metadata.replace_one({"_id": college_name}, meta, upsert=True)
    return meta


@router.get("/place-suggestions")
async def place_suggestions(
    q: str = Query(..., min_length=1, description="Place search query"),
    college: Optional[str] = Query(None),
    limit: int = Query(8, ge=1, le=12),
    user_id: str = Depends(get_current_user),
):
    """
    Provider-safe place suggestions for the travel estimator.

    Returns campus-local fuzzy matches first, Photon predictions second, and a
    bounded/city-anchored Nominatim fallback only when coverage is still low.
    Photon can later be self-hosted behind PHOTON_GEOCODER_URL.
    """
    query = q.strip()
    if not query:
        return {"suggestions": [], "source": "empty"}

    db = get_db()
    if not college:
        profile = await db.profiles.find_one({"_id": user_id})
        college = profile.get("college_name") if profile else None

    if _is_placeholder_campus(college):
        return {
            "suggestions": [],
            "source": "campus_required",
            "campus": college,
            "campus_city": None,
            "requires_selection": False,
            "requires_campus": True,
            "message": "Set your college first so suggestions are searched near the right campus.",
        }

    campus_meta = await get_campus_metadata(db, college)
    local = _local_place_suggestions(
        query=query,
        college=college,
        campus_meta=campus_meta,
        limit=limit,
    )

    remaining = max(0, limit - len(local))
    photon = []
    if remaining:
        photon = await _photon_place_suggestions(
            query=query,
            campus_city=str(campus_meta.get("city") or ""),
            campus_lat=float(campus_meta["lat"]),
            campus_lon=float(campus_meta["lon"]),
            limit=remaining,
        )

    suggestions = _dedupe_place_suggestions(local + photon, limit)

    nominatim = []
    remaining = max(0, limit - len(suggestions))
    if remaining and len(query) >= 4:
        nominatim = await _nominatim_place_suggestions(
            query=query,
            campus_city=str(campus_meta.get("city") or ""),
            campus_lat=float(campus_meta["lat"]),
            campus_lon=float(campus_meta["lon"]),
            limit=remaining,
            db=db,
        )
        suggestions = _dedupe_place_suggestions(suggestions + nominatim, limit)

    return {
        "suggestions": suggestions,
        "source": "nominatim" if nominatim else "photon" if photon else "campus_local",
        "campus": college,
        "campus_city": campus_meta.get("city"),
        "requires_selection": len(suggestions) > 0,
    }


async def _resolve_typed_place(
    *,
    query: str,
    college: str,
    campus_meta: dict[str, Any],
    db: Any = None,
) -> tuple[Optional[tuple[float, float]], str, Optional[str]]:
    """
    Resolve a user-typed place with explicit confidence gates.

    This intentionally does not trust arbitrary text blindly:
      1. exact/fuzzy campus-local matches,
      2. Photon OSM search-as-you-type results,
      3. deliberate Nominatim search fallback.
    """
    cleaned = query.strip()
    if not cleaned:
        return None, "empty", None

    local = _local_place_suggestions(
        query=cleaned,
        college=college,
        campus_meta=campus_meta,
        limit=3,
    )
    for item in local:
        if _valid_lat_lon(item.get("lat"), item.get("lon")) and float(item.get("match_score") or 0) >= 0.45:
            return (float(item["lat"]), float(item["lon"])), "local_fuzzy_match", item.get("label")

    photon = await _photon_place_suggestions(
        query=cleaned,
        campus_city=str(campus_meta.get("city") or ""),
        campus_lat=float(campus_meta["lat"]),
        campus_lon=float(campus_meta["lon"]),
        limit=5,
    )
    for item in photon:
        if not _valid_lat_lon(item.get("lat"), item.get("lon")):
            continue
        score = float(item.get("match_score") or 0)
        if item.get("confidence") == "high" or score >= 0.48:
            return (float(item["lat"]), float(item["lon"])), "osm_autocomplete_match", item.get("label")

    nominatim = await _nominatim_place_suggestions(
        query=cleaned,
        campus_city=str(campus_meta.get("city") or ""),
        campus_lat=float(campus_meta["lat"]),
        campus_lon=float(campus_meta["lon"]),
        limit=4,
        db=db,
    )
    for item in nominatim:
        if not _valid_lat_lon(item.get("lat"), item.get("lon")):
            continue
        score = float(item.get("match_score") or 0)
        if item.get("confidence") in {"medium", "high"} or score >= 0.3:
            return (float(item["lat"]), float(item["lon"])), "deliberate_geocode", item.get("label")

    coords = await geocode_query(
        cleaned,
        float(campus_meta["lat"]),
        float(campus_meta["lon"]),
        str(campus_meta.get("city") or ""),
        db=db,
    )
    if coords:
        return coords, "deliberate_geocode", None

    return None, "unresolved", None


def _resolve_landmark(query: str, campus_city: str) -> Optional[tuple[float, float]]:
    """
    Matches query against KNOWN_LANDMARK_COORDS.
    Only accepts a match when the landmark's city matches campus_city,
    preventing cross-campus leakage (e.g., Pilani Bus Stand for an IIT Guwahati user).
    """
    q = query.lower().strip()
    campus_city_l = campus_city.lower()

    for key, (landmark_city, coords) in KNOWN_LANDMARK_COORDS.items():
        if key in q:
            lc = landmark_city.lower()
            # Accept if city names share a word OR the query explicitly mentions the city
            if lc in campus_city_l or campus_city_l in lc or lc in q:
                logger.debug("Landmark resolved: '%s' -> %s @ %s", key, coords, landmark_city)
                return coords
    return None


async def geocode_query(
    query: str,
    campus_lat: float,
    campus_lon: float,
    campus_city: str,
    db: Any = None,
) -> Optional[tuple[float, float]]:
    """
    Resolves an arbitrary location query to (lat, lon).

    Pipeline:
      Phase 1 - Campus endpoint detection: if the query refers to the
                 college/campus itself, return campus coordinates immediately.
      Phase 2 - Curated landmark match with city-validation.
      Phase 3a - Nominatim search with viewbox bias around the campus.
                  Returns the closest result to campus when multiple hits.
      Phase 3b - Nominatim global search (no viewbox) as final fallback.
    """
    q = query.lower().strip()

    # Named campus keywords — if the query contains these, it explicitly names a campus.
    # These take priority over the generic "campus" shortcut so that "BITS Pilani campus"
    # resolves to Pilani, not the user's current campus.
    _NAMED_CAMPUS_MARKERS = (
        "bits pilani", "iit delhi", "iit bombay", "iit madras", "iit kanpur",
        "iit kharagpur", "iit roorkee", "iit guwahati", "iit hyderabad",
        "iiit bangalore", "iiit hyderabad", "iiit allahabad",
        "vit vellore", "vit chennai", "nit trichy", "nit warangal",
        "anna university", "manipal", "symbiosis", "amity",
    )
    has_named_campus = any(marker in q for marker in _NAMED_CAMPUS_MARKERS)

    # Phase 1: User's own campus endpoint shortcut
    # Applies ONLY when the query generically refers to "campus", "college", etc.
    # WITHOUT explicitly naming a different institution.
    if not has_named_campus and any(term in q for term in _CAMPUS_ENDPOINT_TERMS):
        logger.info("Own campus endpoint: '%s' -> (%.4f, %.4f)", query, campus_lat, campus_lon)
        return campus_lat, campus_lon

    # Phase 1.5: Named campus direct lookup — check if the query explicitly names
    # a well-known campus from our pre-configured list.
    for keyword, city, state, lat, lon in _KNOWN_CAMPUS_META:
        if keyword in q:
            logger.info("Named campus shortcut: '%s' matched '%s' -> (%.4f, %.4f)", query, keyword, lat, lon)
            return lat, lon

    # Phase 2: Curated landmark match (city-validated)
    coords = _resolve_landmark(query, campus_city)
    if coords:
        return coords

    # Phase 3: Nominatim geocoding
    # Build search query: ALWAYS append campus city to anchor results locally.
    # This is the single most important fix: "City Centre" alone returns Ireland;
    # "City Centre, Gwalior" returns the correct local result.
    search_q = _city_anchored_query(query, campus_city)

    # Detect institution queries (IIT, NIT, BITS etc.) — these are globally unique
    # by name and should be searched without a viewbox restriction.
    _INSTITUTION_MARKERS = ("iit ", "nit ", "iiit ", "bits ", "vit ", "iisc",
                            "university", "college", "institute", "academy")
    is_institution_query = any(m in q for m in _INSTITUTION_MARKERS)

    # Larger viewbox: ±0.5° ≈ 55 km around campus — covers entire city/district
    vb = f"{campus_lon - 0.5},{campus_lat + 0.5},{campus_lon + 0.5},{campus_lat - 0.5}"
    base_url = _nominatim_base_url()
    cache_key = build_geo_cache_key(
        "nominatim_geocode",
        base_url,
        query,
        campus_city,
        campus_lat,
        campus_lon,
    )
    cached = await _read_geo_cache(db, cache_key)
    if cached and _valid_lat_lon(cached.get("lat"), cached.get("lon")):
        return float(cached["lat"]), float(cached["lon"])

    async def _cache_coords(lat: float, lon: float, source: str) -> tuple[float, float]:
        await _write_geo_cache(
            db,
            cache_key,
            kind="nominatim_geocode",
            provider=base_url,
            payload={"lat": lat, "lon": lon, "source": source},
            ttl_days=settings.travel_geocode_cache_ttl_days,
        )
        return lat, lon

    async with httpx.AsyncClient(headers=_NOMINATIM_HEADERS, timeout=8.0) as client:

        if is_institution_query:
            # Global search for institutions (no viewbox — institution names are globally unique)
            try:
                r = await client.get(
                    f"{base_url}/search",
                    params={"q": query, "format": "json", "limit": 1},
                )
                if r.status_code == 200 and r.json():
                    hit = r.json()[0]
                    lat, lon = float(hit["lat"]), float(hit["lon"])
                    logger.info("Nominatim global (institution): '%s' -> (%.4f, %.4f)", query, lat, lon)
                    return await _cache_coords(lat, lon, "institution")
            except Exception as exc:
                logger.warning("Nominatim institution search error for '%s': %s", query, exc)
        else:
            # 3a. HARD-bounded search within campus city area (bounded=1 prevents cross-country results)
            # This is the critical fix — prevents "City Centre" from resolving to Dublin/London.
            try:
                r = await client.get(
                    f"{base_url}/search",
                    params={
                        "q": search_q,
                        "format": "json",
                        "limit": 5,
                        "viewbox": vb,
                        "bounded": 1,   # HARD restrict: only return results inside viewbox
                    },
                )
                if r.status_code == 200 and r.json():
                    hits = r.json()
                    # Pick result closest to campus (in case multiple hits inside viewbox)
                    best = min(
                        hits,
                        key=lambda h: (float(h["lat"]) - campus_lat) ** 2
                                   + (float(h["lon"]) - campus_lon) ** 2,
                    )
                    lat, lon = float(best["lat"]), float(best["lon"])
                    logger.info("Nominatim bounded: '%s' -> (%.4f, %.4f)", search_q, lat, lon)
                    return await _cache_coords(lat, lon, "bounded")
            except Exception as exc:
                logger.warning("Nominatim bounded search error for '%s': %s", search_q, exc)

            # 3b. Soft-bounded fallback (bounded=0) with same city-anchored query
            # Only if the hard-bounded search returned nothing.
            # NEVER do a global search without city context for non-institution queries.
            try:
                r = await client.get(
                    f"{base_url}/search",
                    params={
                        "q": search_q,
                        "format": "json",
                        "limit": 3,
                        "viewbox": vb,
                        "bounded": 0,
                    },
                )
                if r.status_code == 200 and r.json():
                    hits = r.json()
                    # Proximity check: only accept if result is within 80 km of campus
                    def _dist_km(h):
                        return _distance_km(campus_lat, campus_lon, float(h["lat"]), float(h["lon"]))
                    nearby = [h for h in hits if _dist_km(h) <= 80.0]
                    if nearby:
                        best = min(nearby, key=lambda h: _dist_km(h))
                        lat, lon = float(best["lat"]), float(best["lon"])
                        logger.info("Nominatim soft-bounded (80km check): '%s' -> (%.4f, %.4f)", search_q, lat, lon)
                        return await _cache_coords(lat, lon, "soft_bounded")
            except Exception as exc:
                logger.warning("Nominatim soft-bounded search error for '%s': %s", search_q, exc)

    logger.warning("Nominatim could not resolve '%s' within city '%s'", query, campus_city)
    return None


def _fallback_drive_minutes(road_km: float, straight_km: float) -> int:
    """
    Reasonable fallback when no routing provider responds.

    This avoids a single flat average speed that made several routes look like
    the same 25-minute trip. It varies by distance, road indirectness, and
    current traffic window while still staying conservative.
    """
    if road_km <= 0:
        return 2

    if road_km <= 3:
        avg_speed = 16.0
        buffer = 3
    elif road_km <= 8:
        avg_speed = 21.0
        buffer = 4
    elif road_km <= 18:
        avg_speed = 27.0
        buffer = 5
    elif road_km <= 60:
        avg_speed = 38.0
        buffer = 7
    else:
        avg_speed = 52.0
        buffer = 10

    hour = datetime.datetime.now().hour
    if 8 <= hour < 11 or 17 <= hour < 21:
        avg_speed *= 0.78
        buffer += 3
    elif hour >= 22 or hour < 6:
        avg_speed *= 1.08

    indirectness = road_km / max(straight_km, 0.1)
    if indirectness > 1.5:
        buffer += 4
    elif indirectness > 1.3:
        buffer += 2

    return max(2, int(round((road_km / max(avg_speed, 8.0)) * 60 + buffer)))


async def compute_route(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
    db: Any = None,
) -> tuple[float, int, list[list[float]], str, bool, int, str, bool]:
    """
    Computes driving route between two points.

    Returns: (distance_km, duration_mins, leaflet_geometry_list, source_label, traffic_used, traffic_delay_mins, provider_label, cache_hit)

    Uses TomTom first when configured for traffic-aware ETA.
    Uses OSRM public API for real driving routes with turn-by-turn geometry.
    Falls back to Haversine x 1.35 road-factor if OSRM is unreachable.
    """
    # Prefer a valid cached road route before calling external providers. This
    # keeps repeated estimates deterministic, reduces provider calls, and avoids
    # falling back to straight-line estimates when the network is unavailable.
    base_url = _osrm_base_url()
    route_cache_key = build_geo_cache_key("osrm_route", base_url, lat1, lon1, lat2, lon2)
    cached_route = await _read_geo_cache(db, route_cache_key)
    if cached_route:
        try:
            geometry = cached_route.get("geometry") or []
            if (
                cached_route.get("distance_km")
                and cached_route.get("duration_mins")
                and isinstance(geometry, list)
            ):
                return (
                    float(cached_route["distance_km"]),
                    int(cached_route["duration_mins"]),
                    geometry,
                    "osrm_route",
                    False,
                    0,
                    "OSRM cached",
                    True,
                )
        except Exception:
            logger.info("Ignoring malformed OSRM cache entry for %.5f,%.5f -> %.5f,%.5f", lat1, lon1, lat2, lon2)

    if settings.TOMTOM_API_KEY:
        try:
            base_url = (settings.TOMTOM_ROUTE_URL or "https://api.tomtom.com").rstrip("/")
            url = f"{base_url}/routing/1/calculateRoute/{lat1},{lon1}:{lat2},{lon2}/json"
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    url,
                    params={
                        "key": settings.TOMTOM_API_KEY,
                        "traffic": "true",
                        "travelMode": "car",
                        "routeType": "fastest",
                        "computeTravelTimeFor": "all",
                        "routeRepresentation": "polyline",
                    },
                )
            if r.status_code == 200:
                data = r.json()
                routes = data.get("routes") or []
                if routes:
                    route = routes[0]
                    summary = route.get("summary") or {}
                    dist_km = round(float(summary.get("lengthInMeters") or 0) / 1000.0, 1)
                    dur_mins = max(1, int(float(summary.get("travelTimeInSeconds") or 0) / 60.0))
                    delay_mins = max(0, int(float(summary.get("trafficDelayInSeconds") or 0) / 60.0))
                    points: list[dict[str, Any]] = []
                    for leg in route.get("legs") or []:
                        points.extend(leg.get("points") or [])
                    geom = [
                        [float(point["latitude"]), float(point["longitude"])]
                        for point in points
                        if _valid_lat_lon(point.get("latitude"), point.get("longitude"))
                    ]
                    if not geom:
                        geom = [[lat1, lon1], [lat2, lon2]]
                    if dist_km > 0 and dur_mins > 0:
                        logger.info("TomTom traffic route: %.1f km, %d min, %d min delay", dist_km, dur_mins, delay_mins)
                        return dist_km, dur_mins, geom, "tomtom_traffic_route", True, delay_mins, "TomTom Traffic", False
            else:
                logger.warning("TomTom routing failed with status %s: %s", r.status_code, r.text[:200])
        except Exception as exc:
            logger.warning("TomTom routing failed: %s. Falling back to OSRM.", exc)

    # OSRM public routing engine
    base_url = _osrm_base_url()
    route_cache_key = build_geo_cache_key("osrm_route", base_url, lat1, lon1, lat2, lon2)
    cached_route = await _read_geo_cache(db, route_cache_key)
    if cached_route:
        try:
            geometry = cached_route.get("geometry") or []
            if (
                cached_route.get("distance_km")
                and cached_route.get("duration_mins")
                and isinstance(geometry, list)
            ):
                return (
                    float(cached_route["distance_km"]),
                    int(cached_route["duration_mins"]),
                    geometry,
                    "osrm_route",
                    False,
                    0,
                    "OSRM cached",
                    True,
                )
        except Exception:
            logger.info("Ignoring malformed OSRM cache entry for %.5f,%.5f -> %.5f,%.5f", lat1, lon1, lat2, lon2)

    try:
        url = (
            f"{base_url}/route/v1/driving/"
            f"{lon1},{lat1};{lon2},{lat2}"
            f"?overview=full&geometries=geojson&steps=false"
        )
        async with httpx.AsyncClient(headers=_NOMINATIM_HEADERS, timeout=8.0) as client:
            r = await client.get(url)
        if r.status_code == 200:
            data = r.json()
            if data.get("routes"):
                route    = data["routes"][0]
                dist_km  = round(route["distance"] / 1000.0, 1)
                dur_mins = max(1, int(route["duration"] / 60.0))
                coords   = route.get("geometry", {}).get("coordinates", [])
                # GeoJSON is [lon, lat]; Leaflet needs [lat, lon]
                geom = [[c[1], c[0]] for c in coords]
                logger.info("OSRM: %.1f km, %d min, %d pts", dist_km, dur_mins, len(geom))
                await _write_geo_cache(
                    db,
                    route_cache_key,
                    kind="osrm_route",
                    provider=base_url,
                    payload={
                        "distance_km": dist_km,
                        "duration_mins": dur_mins,
                        "geometry": geom,
                    },
                    ttl_days=settings.travel_route_cache_ttl_days,
                )
                return dist_km, dur_mins, geom, "osrm_route", False, 0, "OSRM", False
    except Exception as exc:
        logger.warning("OSRM routing failed: %s. Falling back to Haversine.", exc)

    # Haversine fallback with Indian urban road-factor correction
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    straight_km = 2 * math.asin(math.sqrt(a)) * 6371.0
    road_km     = round(straight_km * 1.35, 1)   # urban road factor
    dur_mins    = _fallback_drive_minutes(road_km, straight_km)
    geom        = [[lat1, lon1], [lat2, lon2]]
    logger.info("Haversine fallback: %.1f km (road est.), %d min", road_km, dur_mins)
    return road_km, dur_mins, geom, "haversine_estimate", False, 0, "Fallback estimate", False


def _mode_fare(modes: list[dict[str, Any]], *needles: str, fallback: int = 0) -> int:
    for mode in modes:
        label = str(mode.get("mode") or "").lower()
        if any(needle in label for needle in needles):
            return int(mode.get("median_fare") or fallback)
    return fallback


def _route_midpoint(geometry: list[list[float]], lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    points = geometry if len(geometry) >= 2 else [[lat1, lon1], [lat2, lon2]]
    segments: list[tuple[float, tuple[float, float], tuple[float, float]]] = []
    total = 0.0
    for idx in range(len(points) - 1):
        a = points[idx]
        b = points[idx + 1]
        if len(a) < 2 or len(b) < 2:
            continue
        seg = _distance_km(float(a[0]), float(a[1]), float(b[0]), float(b[1]))
        if seg <= 0:
            continue
        segments.append((seg, (float(a[0]), float(a[1])), (float(b[0]), float(b[1]))))
        total += seg
    if not segments or total <= 0:
        return ((lat1 + lat2) / 2.0, (lon1 + lon2) / 2.0)

    halfway = total / 2.0
    travelled = 0.0
    for seg, start, end in segments:
        if travelled + seg >= halfway:
            ratio = (halfway - travelled) / seg
            return (
                start[0] + (end[0] - start[0]) * ratio,
                start[1] + (end[1] - start[1]) * ratio,
            )
        travelled += seg
    return segments[-1][2]


TRAVEL_TIME_CONTEXTS = {"now", "morning", "afternoon", "evening", "late_night"}


def _normalize_travel_time_context(value: Optional[str]) -> str:
    raw = (value or "now").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "current": "now",
        "right_now": "now",
        "morning_rush": "morning",
        "early_morning": "morning",
        "day": "afternoon",
        "daytime": "afternoon",
        "off_peak": "afternoon",
        "evening_rush": "evening",
        "night": "late_night",
        "late": "late_night",
    }
    normalized = aliases.get(raw, raw)
    return normalized if normalized in TRAVEL_TIME_CONTEXTS else "now"


def _travel_time_fare_factor(value: Optional[str]) -> float:
    context = _normalize_travel_time_context(value)
    return {
        "morning": 1.20,
        "afternoon": 1.0,
        "evening": 1.35,
        "late_night": 1.15,
        "now": 1.0,
    }.get(context, 1.0)


def _travel_time_label(value: Optional[str]) -> str:
    context = _normalize_travel_time_context(value)
    return {
        "morning": "morning rush",
        "afternoon": "off-peak",
        "evening": "evening rush",
        "late_night": "late night",
        "now": "current timing",
    }.get(context, "current timing")


def _strategy_legs_for_split(origin: str, destination: str, transfer_label: Optional[str], direct_fare: int, split_fare: int) -> dict[str, Any]:
    transfer = transfer_label or "known public junction"
    split_first = max(10, round(split_fare * 0.48))
    split_second = max(10, split_fare - split_first)
    direct_first = max(40, round(direct_fare * 0.45))
    direct_second = max(40, direct_fare - direct_first)
    return {
        "direct_strategy": {
            "total_fare": int(direct_fare),
            "legs": [
                {"label": "Start", "text": origin or "Pickup point", "fare": 0},
                {"label": "Ride", "text": f"Direct ride to {destination or 'destination'}", "fare": int(direct_fare)},
                {"label": "End", "text": destination or "Destination", "fare": 0},
            ],
        },
        "split_strategy": {
            "total_fare": int(split_fare),
            "legs": [
                {"label": "Hop 1", "text": f"{origin or 'Pickup point'} to {transfer}", "fare": int(split_first)},
                {"label": "Transfer", "text": f"Switch at {transfer}", "fare": 0},
                {"label": "Hop 2", "text": f"{transfer} to {destination or 'destination'}", "fare": int(split_second)},
            ],
        },
        "private_hop_strategy": {
            "total_fare": int(direct_first + direct_second),
            "legs": [
                {"label": "Hop 1", "text": f"{origin or 'Pickup point'} to {transfer}", "fare": int(direct_first)},
                {"label": "Transfer", "text": f"Switch at {transfer}", "fare": 0},
                {"label": "Hop 2", "text": f"{transfer} to {destination or 'destination'}", "fare": int(direct_second)},
            ],
        },
    }


def _public_split_suggestion(
    *,
    origin: str,
    destination: str,
    campus_city: str,
    distance_km: float,
    modes: list[dict[str, Any]],
    geometry: list[list[float]],
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    time_context: Optional[str] = None,
    has_luggage: bool = False,
) -> dict[str, Any]:
    normalized_time = _normalize_travel_time_context(time_context)
    direct_auto = _mode_fare(modes, "auto", fallback=max(80, int(distance_km * 13)))
    shared = _mode_fare(modes, "shared", "tempo", "bus", fallback=max(20, int(distance_km * 4)))
    if distance_km < 5.0:
        strategies = _strategy_legs_for_split(origin, destination, None, direct_auto, shared)
        return {
            "available": False,
            "recommended": False,
            "title": "Direct ride is better",
            "reason": "The route is short, so changing vehicles will usually waste time.",
            "source": "distance_rule",
            "time_context": normalized_time,
            "direct_fare": direct_auto,
            "split_fare": shared,
            **strategies,
        }

    city_norm = (campus_city or "").lower()
    midpoint = _route_midpoint(geometry, lat1, lon1, lat2, lon2)
    straight = max(0.1, _distance_km(lat1, lon1, lat2, lon2))
    candidates: list[dict[str, Any]] = []
    for label, (landmark_city, coords) in KNOWN_LANDMARK_COORDS.items():
        landmark_city_norm = landmark_city.lower()
        if not (landmark_city_norm in city_norm or city_norm in landmark_city_norm):
            continue
        cand_lat, cand_lon = coords
        dist_origin = _distance_km(lat1, lon1, cand_lat, cand_lon)
        dist_dest = _distance_km(cand_lat, cand_lon, lat2, lon2)
        dist_mid = _distance_km(midpoint[0], midpoint[1], cand_lat, cand_lon)
        if min(dist_origin, dist_dest) < 1.2:
            continue
        corridor_ratio = (dist_origin + dist_dest) / straight
        if corridor_ratio > 1.85:
            continue
        candidates.append({
            "label": label.title(),
            "lat": cand_lat,
            "lon": cand_lon,
            "dist_mid": dist_mid,
            "dist_origin": dist_origin,
            "dist_dest": dist_dest,
            "corridor_ratio": corridor_ratio,
        })

    if not candidates:
        strategies = _strategy_legs_for_split(origin, destination, None, direct_auto, shared)
        return {
            "available": False,
            "recommended": False,
            "title": "No verified split point yet",
            "reason": "PocketBuddy did not find a known busy public transfer point on this route. Use direct ride unless a local student confirms a safe interchange.",
            "source": "no_verified_transfer_point",
            "time_context": normalized_time,
            "direct_fare": direct_auto,
            "split_fare": shared,
            **strategies,
        }

    best = min(candidates, key=lambda item: (item["dist_mid"], item["corridor_ratio"]))
    transport_route = _is_transport_hub_query(f"{origin} {destination}")
    savings = max(0, direct_auto - shared)
    public_terms = ("stand", "station", "junction", "gate", "market", "circle", "crossing", "metro", "bus", "chowk")
    confidence = "high" if any(term in best["label"].lower() for term in public_terms) else "medium"
    airport_route = "airport" in f"{origin} {destination}".lower()
    unsafe_context = normalized_time == "late_night" or has_luggage
    recommended = savings >= 30 and not airport_route and not unsafe_context
    caution_parts = []
    if normalized_time == "late_night":
        caution_parts.append("late night")
    if has_luggage:
        caution_parts.append("luggage")
    if airport_route:
        caution_parts.append("airport route")
    strategies = _strategy_legs_for_split(origin, destination, best["label"], direct_auto, shared)

    return {
        "available": True,
        "recommended": recommended,
        "title": "Curated public split option" if recommended else "Direct ride may be safer",
        "transfer_label": best["label"],
        "transfer_coords": [round(best["lat"], 6), round(best["lon"], 6)],
        "confidence": confidence,
        "source": "curated_public_landmark",
        "time_context": normalized_time,
        "reason": (
            f"Curated public transfer via {best['label']}. Use it only when the area is busy and boarding the next vehicle is easy."
            if recommended
            else f"{best['label']} is a curated public transfer point, but direct travel is safer for this context"
                 f"{' (' + ', '.join(caution_parts) + ')' if caution_parts else ''}."
        ),
        "direct_fare": direct_auto,
        "split_fare": shared,
        "estimated_savings": savings,
        **strategies,
        "first_leg": f"{origin} to {best['label']}",
        "second_leg": f"{best['label']} to {destination}",
        "avoid_when": ["late night", "heavy luggage", "rain", "empty roads", "unfamiliar area"],
        "transport_route": transport_route,
    }


@router.get("/calculate-route")
async def calculate_route(
    origin: str = Query(..., description="Origin location"),
    destination: str = Query(..., description="Destination location"),
    college: Optional[str] = Query(None, description="Campus context selected in the UI"),
    time_context: Optional[str] = Query(None, description="User-selected fare timing context"),
    luggage: bool = Query(False, description="Whether the student is carrying luggage"),
    origin_lat: Optional[float] = Query(None),
    origin_lon: Optional[float] = Query(None),
    destination_lat: Optional[float] = Query(None),
    destination_lon: Optional[float] = Query(None),
    origin_place_id: Optional[str] = Query(None),
    destination_place_id: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    """
    Fully dynamic, end-to-end route and fare estimation.

    Handles any college in India (or worldwide) without hardcoded coordinates.
    Scales to hundreds of campuses via MongoDB caching + Nominatim geocoding.
    """
    db = get_db()
    normalized_time_context = _normalize_travel_time_context(time_context)

    # Resolve college and campus location
    profile = await db.profiles.find_one({"_id": user_id})
    college = college or (profile.get("college_name") if profile else None)
    if _is_placeholder_campus(college):
        raise HTTPException(
            status_code=400,
            detail="Set your college before estimating fares so PocketBuddy searches the right city.",
        )

    campus_meta = await get_campus_metadata(db, college)
    campus_lat  = campus_meta["lat"]
    campus_lon  = campus_meta["lon"]
    campus_city = campus_meta["city"]

    # 1. AI Query Refinement using Bedrock (Student context-aware search)
    search_origin = origin
    search_dest = destination
    if settings.BEDROCK_ENABLED:
        try:
            logger.info("Invoking Bedrock for Query Refinement: '%s', '%s'", origin, destination)
            refine_prompt_origin = f"""
            You are a campus travel search query refinement system.
            A student at {college} in the city {campus_city} searched for the origin landmark: "{origin}".
            Refine this query into a clean, searchable address or landmark name in {campus_city} that a map search can locate.
            Respond only with a JSON object:
            {{
              "refined_query": "string"
            }}
            """
            refine_res_origin = generate_json(refine_prompt_origin, max_tokens=100, temperature=0.1)
            search_origin = refine_res_origin.get("refined_query", origin)

            refine_prompt_dest = f"""
            You are a campus travel search query refinement system.
            A student at {college} in the city {campus_city} searched for the destination landmark: "{destination}".
            Refine this query into a clean, searchable address or landmark name in {campus_city} that a map search can locate.
            Respond only with a JSON object:
            {{
              "refined_query": "string"
            }}
            """
            refine_res_dest = generate_json(refine_prompt_dest, max_tokens=100, temperature=0.1)
            search_dest = refine_res_dest.get("refined_query", destination)
            logger.info("Bedrock refined search queries: '%s' -> '%s' | '%s' -> '%s'",
                        origin, search_origin, destination, search_dest)
        except Exception as e:
            logger.warning("Bedrock query refinement failed, using raw search inputs: %s", e)

    logger.info("calculate-route | college='%s' city='%s' | '%s' -> '%s'",
                college, campus_city, search_origin, search_dest)

    origin_resolution = "typed_search"
    destination_resolution = "typed_search"
    origin_resolved_label = None
    destination_resolved_label = None

    if _valid_lat_lon(origin_lat, origin_lon):
        coords_origin = (float(origin_lat), float(origin_lon))
        origin_resolution = "selected_suggestion"
    else:
        coords_origin = None

    if _valid_lat_lon(destination_lat, destination_lon):
        coords_dest = (float(destination_lat), float(destination_lon))
        destination_resolution = "selected_suggestion"
    else:
        coords_dest = None

    if not coords_origin:
        coords_origin, origin_resolution, origin_resolved_label = await _resolve_typed_place(
            query=search_origin,
            college=college,
            campus_meta=campus_meta,
            db=db,
        )
    if not coords_dest:
        coords_dest, destination_resolution, destination_resolved_label = await _resolve_typed_place(
            query=search_dest,
            college=college,
            campus_meta=campus_meta,
            db=db,
        )

    # ── Sanity check: reject coords that are too far from campus ──────────────
    # If a provider returns a point > 150 km from campus for a non-institution
    # query, it's almost certainly a wrong match. Reject it instead of showing
    # a confident fare for the wrong city.
    _INSTITUTION_MARKERS_SET = frozenset(["iit", "nit", "iiit", "bits", "vit",
                                          "iisc", "university", "college", "institute"])
    _MAX_LOCAL_DIST_KM = 150.0

    def _is_likely_institution(q: str) -> bool:
        return any(m in q.lower() for m in _INSTITUTION_MARKERS_SET)

    def _max_allowed_campus_distance(q: str) -> float:
        if _is_likely_institution(q):
            return 500.0
        if _is_transport_hub_query(q):
            return 260.0
        return _MAX_LOCAL_DIST_KM

    if coords_origin:
        dist = _distance_km(campus_lat, campus_lon, *coords_origin)
        if dist > _max_allowed_campus_distance(search_origin):
            logger.warning(
                "Origin '%s' resolved %.0f km from campus — rejecting (likely geocoding error)",
                search_origin, dist
            )
            coords_origin = None
            origin_resolution = "rejected_far_match"
    if coords_dest:
        dist = _distance_km(campus_lat, campus_lon, *coords_dest)
        if dist > _max_allowed_campus_distance(search_dest):
            logger.warning(
                "Destination '%s' resolved %.0f km from campus — rejecting (likely geocoding error)",
                search_dest, dist
            )
            coords_dest = None
            destination_resolution = "rejected_far_match"
    # ─────────────────────────────────────────────────────────────────────────

    unresolved_fields = []
    if not coords_origin:
        unresolved_fields.append("origin")
    if not coords_dest:
        unresolved_fields.append("destination")
    if unresolved_fields:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Could not locate one of these places near the selected campus. Choose a suggestion or add the city / nearby landmark and try again.",
                "unresolved": unresolved_fields,
                "origin_resolution": origin_resolution,
                "destination_resolution": destination_resolution,
            },
        )

    lat1, lon1 = coords_origin
    lat2, lon2 = coords_dest

    # Compute driving route
    (
        distance_km,
        duration_mins,
        geometry,
        source,
        traffic_used,
        traffic_delay_mins,
        routing_provider,
        routing_cache_hit,
    ) = await compute_route(lat1, lon1, lat2, lon2, db=db)

    # Estimate fares using city-specific tariff rules
    modes = estimate_fares_by_city(distance_km, college)
    resolution_values = {origin_resolution, destination_resolution}
    campus_confidence = str(campus_meta.get("confidence") or "medium")
    low_resolution = bool(resolution_values & {"deliberate_geocode", "rejected_far_match", "unresolved"})
    campus_low_confidence = campus_confidence == "low"
    route_confidence = (
        "high"
        if source in {"osrm_route", "tomtom_traffic_route"} and not low_resolution and not campus_low_confidence
        else "medium"
        if source in {"osrm_route", "tomtom_traffic_route"}
        else "low"
    )
    needs_review = source not in {"osrm_route", "tomtom_traffic_route"} or low_resolution
    resolution_warning = (
        "Route is based on a fallback distance estimate. Confirm the places before using the fare."
        if source not in {"osrm_route", "tomtom_traffic_route"}
        else "Campus location is city-level, not an exact college coordinate. Confirm the places before relying on the fare."
        if campus_confidence == "low"
        else "One or both places were resolved from typed search. Select a suggestion next time for the strongest match."
        if low_resolution
        else None
    )

    price_basis = (
        "Mapped road distance plus campus-local fare rules. These are not ride-app API prices."
        if source in {"osrm_route", "tomtom_traffic_route"}
        else "Fallback road estimate plus campus-local fare rules. Confirm the route before relying on this."
    )

    eta_confidence = (
        "high"
        if traffic_used
        else "medium"
        if source == "osrm_route"
        else "low"
    )
    eta_basis = (
        f"Traffic-aware ETA from {routing_provider}."
        if traffic_used
        else "Mapped driving ETA without live traffic."
        if source == "osrm_route"
        else "Rough ETA from fallback road-distance estimate."
    )
    routing_source_note = (
        travel_geo_source_note(settings.TOMTOM_ROUTE_URL)
        if source == "tomtom_traffic_route"
        else travel_geo_source_note(_osrm_base_url())
        if source == "osrm_route"
        else "Fallback estimate used because no routing provider responded."
    )
    split_suggestion = _public_split_suggestion(
        origin=origin,
        destination=destination,
        campus_city=str(campus_city or ""),
        distance_km=distance_km,
        modes=modes,
        geometry=geometry,
        lat1=lat1,
        lon1=lon1,
        lat2=lat2,
        lon2=lon2,
        time_context=normalized_time_context,
        has_luggage=luggage,
    )
    runway_context = await _build_user_runway_context(db, user_id, profile)
    modes = _attach_mode_decision_context(
        modes,
        route_source=source,
        price_basis=price_basis,
        eta_basis=eta_basis,
        time_context=normalized_time_context,
        routing_cache_hit=routing_cache_hit,
        runway_context=runway_context,
    )

    return {
        "distance_km":    distance_km,
        "duration_mins":  duration_mins,
        "traffic_delay_mins": traffic_delay_mins,
        "traffic_used": traffic_used,
        "eta_confidence": eta_confidence,
        "eta_basis": eta_basis,
        "routing_provider": routing_provider,
        "routing_cache_hit": routing_cache_hit,
        "routing_source_note": routing_source_note,
        "source":         source,
        "campus":         college,
        "campus_city":    campus_city,
        "campus_confidence": campus_confidence,
        "campus_source": campus_meta.get("source"),
        "route_confidence": route_confidence,
        "needs_review":   needs_review,
        "resolution_warning": resolution_warning,
        "price_basis":    price_basis,
        "origin_resolution": origin_resolution,
        "destination_resolution": destination_resolution,
        "origin_resolved_label": origin_resolved_label,
        "destination_resolved_label": destination_resolved_label,
        "time_context": normalized_time_context,
        "luggage": luggage,
        "runway_context": runway_context,
        "origin_coords":  [lat1, lon1],
        "dest_coords":    [lat2, lon2],
        "modes":          modes,
        "split_suggestion": split_suggestion,
        "geometry":       geometry,
    }


class RidePoolCreateReq(BaseModel):
    route_id: str
    departure_time: str
    mode: str
    max_passengers: int
    description: str

@router.post("/pools")
async def create_ride_pool(req: RidePoolCreateReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    user_doc = await db.users.find_one({"_id": user_id})
    user_name = user_doc.get("full_name", "Anonymous Student") if user_doc else "Anonymous Student"
    profile = await db.profiles.find_one({"_id": user_id})
    user_phone = _clean_phone(
        (user_doc.get("phone_number") if user_doc else "")
        or (profile.get("phone_number") if profile else "")
        or (profile.get("phone") if profile else "")
    )
    college = (profile.get("college_name") if profile else None) or "ABV-IIITM Gwalior"
    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    if not route_doc:
        raise HTTPException(status_code=404, detail="Route not found")
    if route_doc.get("college") != college:
        raise HTTPException(status_code=403, detail="This route belongs to a different campus")
    if not _find_mode(route_doc, req.mode):
        raise HTTPException(status_code=400, detail="Select a valid travel mode for this route")
    departure_time = _parse_user_datetime(req.departure_time)
    if not departure_time:
        raise HTTPException(status_code=400, detail="Enter a valid departure time")
    if departure_time < datetime.datetime.utcnow() - datetime.timedelta(minutes=10):
        raise HTTPException(status_code=400, detail="Departure time cannot be in the past")
    if req.max_passengers < 2 or req.max_passengers > 6:
        raise HTTPException(status_code=400, detail="Ride pool must have 2 to 6 seats")
    canonical_mode = str(_find_mode(route_doc, req.mode).get("mode") or req.mode)
    safety_context = build_ride_pool_safety_context(
        profile=profile,
        departure_time=departure_time,
        mode=canonical_mode,
        max_passengers=req.max_passengers,
        host_phone=user_phone,
    )
    if not safety_context.get("can_create"):
        raise HTTPException(status_code=400, detail=safety_context.get("blocking_reason") or "This ride pool is not safe to host.")

    pool_id = str(uuid.uuid4())
    pool_doc = {
        "_id": pool_id,
        "route_id": req.route_id,
        "college": college,
        "departure_time": departure_time.isoformat(),
        "mode": canonical_mode,
        "max_passengers": req.max_passengers,
        "description": _clean_text(req.description, 140),
        "host_id": user_id,
        "host_name": user_name,
        "host_phone": user_phone,
        "host_wing": profile.get("wing_label") if profile else None,
        "safety_context": safety_context,
        "status": "active",
        "co_passengers": [
            {
                "user_id": user_id,
                "full_name": user_name,
                "wing_label": profile.get("wing_label") if profile else None,
            }
        ],
        "created_at": datetime.datetime.utcnow()
    }
    await db.travel_pools.insert_one(pool_doc)
    return _public_pool(pool_doc, user_id)

@router.get("/pools")
async def get_ride_pools(route_id: str = Query(...), user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.travel_pools.find({"route_id": route_id}).sort("created_at", -1)
    pools = await cursor.to_list(length=100)
    return [_public_pool(p, user_id) for p in pools]

@router.post("/pools/{pool_id}/join")
async def join_ride_pool(pool_id: str, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool_doc = await db.travel_pools.find_one({"_id": pool_id})
    if not pool_doc:
        raise HTTPException(status_code=404, detail="Ride pool not found")
    if pool_doc.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Finalized ride pools cannot be changed")
    if pool_doc.get("status") == "completed":
        raise HTTPException(status_code=400, detail="This ride pool has already been finalized")
    if pool_doc.get("status") != "active":
        raise HTTPException(status_code=400, detail="This ride pool is not accepting riders")
    departure_time = _parse_user_datetime(str(pool_doc.get("departure_time") or ""))
    if departure_time and departure_time < datetime.datetime.utcnow() - datetime.timedelta(minutes=10):
        raise HTTPException(status_code=400, detail="This ride pool has already departed")
    profile = await db.profiles.find_one({"_id": user_id})
    user_college = (profile.get("college_name") if profile else None) or "ABV-IIITM Gwalior"
    if pool_doc.get("college") != user_college:
        raise HTTPException(status_code=403, detail="This ride pool belongs to a different campus")

    co_passengers = pool_doc.get("co_passengers", [])
    if any(p["user_id"] == user_id for p in co_passengers):
        return _public_pool(pool_doc, user_id) # Already joined

    if len(co_passengers) >= pool_doc.get("max_passengers", 4):
        raise HTTPException(status_code=400, detail="Ride pool is already full")

    user_doc = await db.users.find_one({"_id": user_id})
    user_name = user_doc.get("full_name", "Anonymous Student") if user_doc else "Anonymous Student"

    await db.travel_pools.update_one(
        {"_id": pool_id},
        {"$push": {"co_passengers": {"user_id": user_id, "full_name": user_name, "wing_label": profile.get("wing_label") if profile else None}}}
    )
    new_pool = await db.travel_pools.find_one({"_id": pool_id})
    return _public_pool(new_pool, user_id)

@router.post("/pools/{pool_id}/leave")
async def leave_ride_pool(pool_id: str, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool_doc = await db.travel_pools.find_one({"_id": pool_id})
    if not pool_doc:
        raise HTTPException(status_code=404, detail="Ride pool not found")

    if pool_doc.get("host_id") == user_id:
        # If the host leaves/cancels, delete the pool group entirely
        await db.travel_pools.delete_one({"_id": pool_id})
        return {"status": "deleted"}

    co_passengers = pool_doc.get("co_passengers", [])
    updated_passengers = [p for p in co_passengers if p["user_id"] != user_id]

    if len(updated_passengers) == 0:
        await db.travel_pools.delete_one({"_id": pool_id})
        return {"status": "deleted"}

    await db.travel_pools.update_one(
        {"_id": pool_id},
        {"$set": {"co_passengers": updated_passengers}}
    )
    new_pool = await db.travel_pools.find_one({"_id": pool_id})
    return _public_pool(new_pool, user_id)


class RidePoolCompleteReq(BaseModel):
    final_amount: float
    upi_id: str

class RidePoolSettleReq(BaseModel):
    passenger_user_id: str

@router.post("/pools/{pool_id}/complete")
async def complete_ride_pool(pool_id: str, req: RidePoolCompleteReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool_doc = await db.travel_pools.find_one({"_id": pool_id})
    if not pool_doc:
        raise HTTPException(status_code=404, detail="Ride pool not found")

    if pool_doc.get("host_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the host can finalize the ride pool splits")
    if pool_doc.get("status") == "completed":
        raise HTTPException(status_code=400, detail="This ride pool is already finalized")
    if req.final_amount <= 0 or req.final_amount > 50000:
        raise HTTPException(status_code=400, detail="Enter a valid final fare")
    upi_id = (req.upi_id or "").strip()
    if not _valid_upi(upi_id):
        raise HTTPException(status_code=400, detail="Enter a valid UPI ID")

    co_passengers = pool_doc.get("co_passengers", [])
    num_passengers = len(co_passengers)
    if num_passengers == 0:
        raise HTTPException(status_code=400, detail="Cannot split fare with zero riders")

    # Find the route name to include in UPI text
    route_doc = await db.travel_routes.find_one({"_id": pool_doc.get("route_id")})
    route_name = route_doc.get("name", "Campus Ride") if route_doc else "Campus Ride"
    mode_doc = _find_mode(route_doc or {}, pool_doc.get("mode", ""))
    baseline_total = float(mode_doc.get("median_fare", 150)) if mode_doc else 150.0
    if req.final_amount > baseline_total * 3:
        raise HTTPException(status_code=400, detail="Final fare is too high for this route")

    split_amount = round(req.final_amount / num_passengers, 2)

    host_name = pool_doc.get("host_name", "Host")
    
    # Generate UPI intent URLs for passengers
    splits = []
    for cp in co_passengers:
        is_host = cp["user_id"] == user_id
        # Safe URL encoding
        import urllib.parse
        encoded_name = urllib.parse.quote(host_name)
        encoded_note = urllib.parse.quote(f"Split for {route_name}")
        upi_link = f"upi://pay?pa={upi_id}&pn={encoded_name}&am={split_amount}&cu=INR&tn={encoded_note}"
        
        splits.append({
            "user_id": cp["user_id"],
            "full_name": cp["full_name"],
            "amount": split_amount,
            "status": "paid" if is_host else "pending",
            "upi_link": upi_link
        })

    # Update pool doc
    updates = {
        "status": "completed",
        "final_amount": req.final_amount,
        "upi_id": upi_id,
        "split_amount": split_amount,
        "splits": splits,
        "completed_at": datetime.datetime.utcnow(),
    }

    await db.travel_pools.update_one({"_id": pool_id}, {"$set": updates})

    # Automatically log the transaction for the host
    host_txn = {
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": int(split_amount * 100),
        "raw_merchant_string": f"Travel Split - {route_name}",
        "mapped_merchant_name": "Travel Pool",
        "category": "travel",
        "source": "manual",
        "is_mapped": True,
        "direction": "debit",
        "created_at": datetime.datetime.utcnow()
    }
    await db.transactions.insert_one(host_txn)

    new_pool = await db.travel_pools.find_one({"_id": pool_id})
    return _public_pool(new_pool, user_id)


@router.post("/pools/{pool_id}/settle")
async def settle_ride_pool(pool_id: str, req: RidePoolSettleReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    pool_doc = await db.travel_pools.find_one({"_id": pool_id})
    if not pool_doc:
        raise HTTPException(status_code=404, detail="Ride pool not found")

    if pool_doc.get("host_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the host can confirm payments")
    if pool_doc.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Finalize the ride pool before confirming payments")
    if req.passenger_user_id == user_id:
        raise HTTPException(status_code=400, detail="Host split is already marked paid")

    splits = pool_doc.get("splits", [])
    updated = False
    split_amount = pool_doc.get("split_amount", 0)

    # Find the route name to include in transaction
    route_doc = await db.travel_routes.find_one({"_id": pool_doc.get("route_id")})
    route_name = route_doc.get("name", "Campus Ride") if route_doc else "Campus Ride"

    for sp in splits:
        if sp["user_id"] == req.passenger_user_id and sp["status"] == "pending":
            sp["status"] = "paid"
            updated = True
            
            # Automatically log the transaction for the passenger
            passenger_txn = {
                "_id": str(uuid.uuid4()),
                "user_id": req.passenger_user_id,
                "amount": int(split_amount * 100),
                "raw_merchant_string": f"Travel Split - {route_name}",
                "mapped_merchant_name": "Travel Pool",
                "category": "travel",
                "source": "manual",
                "is_mapped": True,
                "direction": "debit",
                "created_at": datetime.datetime.utcnow()
            }
            await db.transactions.insert_one(passenger_txn)
            break

    if not updated:
        raise HTTPException(status_code=400, detail="Passenger not found in splits or already paid")

    await db.travel_pools.update_one({"_id": pool_id}, {"$set": {"splits": splits, "updated_at": datetime.datetime.utcnow()}})
    new_pool = await db.travel_pools.find_one({"_id": pool_id})
    return _public_pool(new_pool, user_id)
