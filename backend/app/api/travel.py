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

router = APIRouter()
logger = logging.getLogger("app.api.travel")

MIN_COMMUNITY_REPORTS_FOR_FARE = 3
FARE_MODEL_VERSION = "campus-distance-v2"


# Default seeded routes for ABV-IIITM Gwalior
DEFAULT_ROUTES = [
    {
        "id": "gwalior_station_iiitm",
        "name": "Gwalior Railway Station â†’ ABV-IIITM",
        "description": "Travel from Gwalior Main Railway Station to the ABV-IIITM Campus.",
        "modes": [
            {"mode": "Auto", "min_fare": 140, "max_fare": 180, "median_fare": 160},
            {"mode": "Cab", "min_fare": 220, "max_fare": 300, "median_fare": 260},
            {"mode": "Shared Auto + Tempo", "min_fare": 40, "max_fare": 70, "median_fare": 50}
        ],
        "cheapest_route_combo": "Take a shared auto from outside the station till Phool Bagh (â‚¹20), then change to a tempo towards Morena Road / IIITM gate (â‚¹20-â‚¹30). Total: â‚¹45-â‚¹50.",
        "negotiation_helper": "Bhaiya, ABV-IIITM ka normal student fare â‚¹150-â‚¹170 hota hai. â‚¹170 final?",
        "safety_score_day": "High Safety",
        "safety_score_night": "Avoid shared routes after 9:00 PM. Prefer pre-booked cab or direct auto from main stand.",
        "scam_warnings": "Auto drivers inside the station gate will quote â‚¹400+. Walk 100 meters outside the station main gate to the circle to get a direct auto for â‚¹150.",
        "campus_landmark": "Campus Gate No 1, Morena Link Road"
    },
    {
        "id": "gwalior_airport_iiitm",
        "name": "Gwalior Airport â†’ ABV-IIITM",
        "description": "Travel from Rajmata Vijaya Raje Scindia Airport to the ABV-IIITM Campus.",
        "modes": [
            {"mode": "Cab", "min_fare": 450, "max_fare": 600, "median_fare": 500},
            {"mode": "Auto", "min_fare": 300, "max_fare": 380, "median_fare": 340}
        ],
        "cheapest_route_combo": "No direct shared transit is usually available. A cab is the safer option when travelling with luggage or late at night.",
        "negotiation_helper": "Bhaiya, IIITM Gwalior to 12km hi hai. â‚¹330 chaloge?",
        "safety_score_day": "Moderate Safety",
        "safety_score_night": "Avoid travel after 10 PM unless using a pre-booked cab.",
        "scam_warnings": "Pre-book a cab if arriving late. Airport autos charge highly inflated premium rates.",
        "campus_landmark": "Campus Main Gate"
    },
    {
        "id": "bus_stand_iiitm",
        "name": "Gwalior Bus Stand â†’ ABV-IIITM",
        "description": "Travel from Gola ka Mandir Bus Stand to ABV-IIITM Campus.",
        "modes": [
            {"mode": "Auto", "min_fare": 100, "max_fare": 130, "median_fare": 110},
            {"mode": "Cab", "min_fare": 160, "max_fare": 220, "median_fare": 180},
            {"mode": "Shared Auto", "min_fare": 30, "max_fare": 50, "median_fare": 40}
        ],
        "cheapest_route_combo": "Take a shared auto from Gola ka Mandir to Hazira (â‚¹15), then another auto/tempo to IIITM gate (â‚¹15). Total: â‚¹30.",
        "negotiation_helper": "Bhaiya, Hazira crossing hote hue â‚¹110 normal fare hai. â‚¹120 chaloge?",
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
        "fare_basis": f"{distance_km:.1f} km × {rule_name}",
        "fare_model_version": FARE_MODEL_VERSION,
        "report_sample_size": 0,
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
        # Delhi Autos (metered â‚¹30 base + â‚¹11/km)
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
        # Bangalore Autos (metered â‚¹30 base + â‚¹15/km)
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


def _robust_fare_range(values: list[float]) -> Optional[dict[str, int]]:
    fares = sorted(float(v) for v in values if isinstance(v, (int, float)) and v > 0)
    if len(fares) < 3:
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
    if len(filtered) < 3:
        filtered = fares

    return {
        "min_fare": int(round(percentile(filtered, 0.15))),
        "max_fare": int(round(percentile(filtered, 0.85))),
        "median_fare": int(round(percentile(filtered, 0.5))),
        "sample_size": len(filtered),
    }


def _with_report_fare_meta(mode_doc: dict[str, Any], sample_size: int) -> dict[str, Any]:
    updated = dict(mode_doc)
    updated["report_sample_size"] = sample_size
    updated["fare_source"] = "student_reports"
    updated["fare_source_label"] = "Student reports"
    updated["fare_basis"] = f"{sample_size} recent student fare reports"
    return updated


def _ensure_fare_meta(mode_doc: dict[str, Any], route_distance_km: Optional[float] = None) -> dict[str, Any]:
    updated = dict(mode_doc)
    sample_size = int(updated.get("report_sample_size") or 0)
    if sample_size >= MIN_COMMUNITY_REPORTS_FOR_FARE:
        updated["fare_source"] = "student_reports"
        updated["fare_source_label"] = "Student reports"
        updated["fare_basis"] = updated.get("fare_basis") or f"{sample_size} recent student fare reports"
        return updated

    updated.setdefault("fare_source", "distance_model")
    updated["fare_source_label"] = "Distance model"
    if route_distance_km:
        updated["fare_basis"] = updated.get("fare_basis") or f"{float(route_distance_km):.1f} km × campus-local fare rule"
    else:
        updated["fare_basis"] = updated.get("fare_basis") or "Campus-local fare rule"
    updated["report_sample_size"] = sample_size
    updated.setdefault("fare_model_version", FARE_MODEL_VERSION)
    return updated

class CustomRouteCreateReq(BaseModel):
    name: str
    description: Optional[str] = ""
    distance_km: float
    campus_landmark: Optional[str] = "Main Gate"
    college: Optional[str] = None

class ReportSubmitReq(BaseModel):
    route_id: str
    mode: str
    amount_paid: float
    time_of_day: str
    luggage: bool
    driver_quote: float
    final_amount: float
    anonymous: bool = False

class SavingsLogReq(BaseModel):
    amount_saved: float
    route_id: str

class VoteReq(BaseModel):
    vote_type: str


def _clean_text(value: Optional[str], max_len: int) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    return cleaned[:max_len]


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


def _clean_phone(value: Optional[str]) -> str:
    digits = re.sub(r"\D+", "", value or "")
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    return digits if len(digits) == 10 else ""


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

    if not college:
        # Get user profile to determine college
        profile = await db.profiles.find_one({"_id": user_id})
        college = profile.get("college_name") if profile else "ABV-IIITM Gwalior"

    if not college:
        college = "ABV-IIITM Gwalior"

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

    mapped_routes = []
    for r in routes:
        route_dict = _to_dict(r)
        route_id = route_dict.get("id")
        
        # Calculate dynamic labels based on report age
        reports_cursor = db.travel_reports.find({"route_id": route_id}).sort("created_at", -1)
        r_reports = await reports_cursor.to_list(length=10)
        
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
                if len(r_reports) >= 3:
                    route_dict["source"] = "community median"
                else:
                    route_dict["source"] = "recent student report"
        else:
            if route_dict.get("source") in {"seeded", "app_estimate", "user_added"}:
                route_dict["source"] = "distance_model"

        # Determine confidence:
        # - high: official + recent community reports, or community median with >=3 reports and recent report
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
            if len(r_reports) >= 3 and has_recent:
                route_dict["confidence"] = "high"
            else:
                route_dict["confidence"] = "medium"
        else:
            route_dict["confidence"] = "low"

        route_dict["modes"] = [
            _ensure_fare_meta(m, route_dict.get("distance_km"))
            for m in route_dict.get("modes", [])
        ]
                
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
        college = profile.get("college_name") if profile else "ABV-IIITM Gwalior"

    if not college:
        college = "ABV-IIITM Gwalior"

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
        "negotiation_helper": f"Bhaiya, {route_name} ka normal student fare â‚¹{int(70 + d * 10.5)} hai. Sahi rate pe chal lo.",
        "safety_score_day": "High Safety",
        "safety_score_night": "Stick to app-based rides late at night.",
        "scam_warnings": "If you have a ride-app quote, compare it before negotiating flat prices.",
        "campus_landmark": campus_landmark,
        "source": "distance_model",
        "confidence": "low",
        "distance_km": d
    }

    await db.travel_routes.insert_one(r_doc)
    return _to_dict(r_doc)

@router.get("/reports")
async def get_reports(route_id: str = Query(...), user_id: str = Depends(get_current_user)):
    db = get_db()
    cursor = db.travel_reports.find({"route_id": route_id}).sort("created_at", -1)
    reports = await cursor.to_list(length=200)

    mapped_reports = []
    for r in reports:
        report_dict = _to_dict(r)
        poster_id = report_dict.get("user_id")
        
        if report_dict.get("anonymous"):
            report_dict["user_name"] = "Anonymous Student"
        else:
            user_doc = await db.users.find_one({"_id": poster_id})
            report_dict["user_name"] = user_doc.get("full_name", "Anonymous Student") if user_doc else "Anonymous Student"
        
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
            
        mapped_reports.append(report_dict)

    return mapped_reports

@router.post("/reports/{report_id}/vote")
async def vote_report(report_id: str, req: VoteReq, user_id: str = Depends(get_current_user)):
    db = get_db()
    report = await db.travel_reports.find_one({"_id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
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
        raise HTTPException(status_code=400, detail=f"Amount paid must be positive and not exceed 3x the baseline fare (â‚¹{base_median_fare * 3})")
    if req.final_amount <= 0 or req.final_amount > base_median_fare * 3:
        raise HTTPException(status_code=400, detail=f"Final amount must be positive and not exceed 3x the baseline fare (â‚¹{base_median_fare * 3})")
    if req.driver_quote <= 0 or req.driver_quote > base_median_fare * 5:
        raise HTTPException(status_code=400, detail=f"Driver quote must be positive and within reasonable limits (maximum â‚¹{base_median_fare * 5})")
    if req.final_amount > req.driver_quote:
        raise HTTPException(status_code=400, detail="Final amount cannot be higher than the driver quote")

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
        "anonymous": req.anonymous,
        "created_at": datetime.datetime.utcnow()
    })

    # Dynamically update the fair fare ranges in the route document based on community reports
    cursor = db.travel_reports.find({"route_id": req.route_id, "mode": req.mode})
    mode_reports = await cursor.to_list(length=1000)

    robust_range = _robust_fare_range([r.get("final_amount") for r in mode_reports])

    if robust_range:
        route_doc = await db.travel_routes.find_one({"_id": req.route_id})
        if route_doc:
            updated_modes = []
            mode_found = False
            for m in route_doc.get("modes", []):
                # match mode name (case-insensitive substring)
                if _mode_matches(req.mode, str(m.get("mode", ""))):
                    m["min_fare"] = robust_range["min_fare"]
                    m["max_fare"] = robust_range["max_fare"]
                    m["median_fare"] = robust_range["median_fare"]
                    m = _with_report_fare_meta(m, robust_range["sample_size"])
                    mode_found = True
                updated_modes.append(m)

            if not mode_found:
                updated_modes.append(_with_report_fare_meta({
                    "mode": req.mode,
                    "min_fare": robust_range["min_fare"],
                    "max_fare": robust_range["max_fare"],
                    "median_fare": robust_range["median_fare"],
                }, robust_range["sample_size"]))

            await db.travel_routes.update_one(
                {"_id": req.route_id},
                {"$set": {"modes": updated_modes, "last_report_at": datetime.datetime.utcnow()}}
            )

    # Add to wing feed activity
    profile = await db.profiles.find_one({"_id": user_id})
    wing = profile.get("wing_label", "unknown wing") if profile else "unknown wing"

    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    route_name = route_doc.get("name", "campus route") if route_doc else "campus route"
    route_short = route_name.split("â†’")[0].strip() if "â†’" in route_name else route_name

    await db.checkin_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "response": "travel_fare_report",
        "gap_hours": 0,
        "food_gap_hours": 0,
        "suggestion_given": f"{req.mode} via {route_short}",
        "stress_note": f"A student reported paying â‚¹{req.final_amount:.0f} (saved â‚¹{max(0.0, req.driver_quote - req.final_amount):.0f} from â‚¹{req.driver_quote:.0f} quote)",
        "created_at": datetime.datetime.utcnow()
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
        "stress_note": f"Saved â‚¹{req.amount_saved:.0f} using Travel negotiation helper!",
        "created_at": datetime.datetime.utcnow()
    })

    return {"status": "ok", "id": savings_id, "amount_saved": req.amount_saved}


class AiCoachReq(BaseModel):
    route_id: str
    mode: str
    user_situation: Optional[str] = ""
    college: Optional[str] = None
    app_quote: Optional[float] = None  # Optional quote the student saw in a ride app


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
            script = "Bhaiya, Hazira ka â‚¹10 chalo na, regular campus rate hai."
        elif "auto" in mode_lower:
            script = f"Bhaiya, ABV-IIITM Gate 1 chalo na. Regular student rate â‚¹{median_fare:.0f} hai."
        elif "cab" in mode_lower or "taxi" in mode_lower:
            if app_quote:
                script = f"Bhaiya, IIITM campus direct drop. App par â‚¹{app_quote:.0f} dikha raha hai, â‚¹{median_fare:.0f} me done karte hain."
            else:
                script = f"Bhaiya, IIITM campus direct drop. Regular fare â‚¹{median_fare:.0f} ke around hai, done karte hain."
        else:
            script = f"Bhaiya, IIITM Gate 1 chalo. Normal fare â‚¹{median_fare:.0f} lagao."
            
    elif "delhi" in col_lower:
        if "auto" in mode_lower:
            script = f"Bhaiya, IIT Delhi main gate chalo. Meter se chaloge? Ya flat â‚¹{median_fare:.0f} le lo."
        else:
            script = f"Bhaiya, IIT main gate. Regular route rate is â‚¹{median_fare:.0f}."
            
    elif "pilani" in col_lower or "bits" in col_lower:
        script = f"Bhaiya ji, BITS Campus chalna hai. Standard rate â‚¹{median_fare:.0f} chalo na."
        
    elif "bombay" in col_lower or "mumbai" in col_lower:
        script = f"Dada, IIT Bombay chalo. Meter chalu karo na please, ya flat â‚¹{median_fare:.0f} chalo."
        
    elif "bangalore" in col_lower or "iiitb" in col_lower:
        if app_quote:
            script = f"Anna, IIIT Bangalore chalo. Regular route rate is â‚¹{median_fare:.0f}. App is showing â‚¹{app_quote:.0f}."
        else:
            script = f"Anna, IIIT Bangalore chalo. Regular route rate is â‚¹{median_fare:.0f}."
        
    elif "vellore" in col_lower or "vit" in col_lower:
        script = f"Anna, VIT Vellore campus main gate. Katpadi station se standard rate â‚¹{median_fare:.0f} chalo."
        
    else:
        script = f"Bhaiya, campus chalna hai. Sahi price lagao, regular rate â‚¹{median_fare:.0f} hai."

    # 2. Append app benchmark counter-anchors
    if app_quote and app_quote > median_fare:
        script += f" App par toh high surge rate â‚¹{app_quote:.0f} dikha raha hai, regular rates toh â‚¹{median_fare:.0f} hote hain."

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

@router.post("/ai-coach")
async def get_ai_negotiation_coach(req: AiCoachReq, user_id: str = Depends(get_current_user)):
    db = get_db()

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
        report_count = len(recent_reports)
        if report_count >= MIN_COMMUNITY_REPORTS_FOR_FARE:
            robust_range = _robust_fare_range([r.get("final_amount") for r in recent_reports])
            if robust_range:
                fare_anchor = float(robust_range["median_fare"])
                community_median = fare_anchor
                fare_anchor_source = "student_reports"
                fare_anchor_label = f"{robust_range['sample_size']} student reports"

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
            f"Refer to standard rates: Bhaiya, regular campus rate is between â‚¹{min_fare}-â‚¹{max_fare}."
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
        prompt = f"""
        You are an expert Indian auto/cab fare negotiator and transit helper.
        The student is at {college} in {region}.
        They are travelling on the route: {route_name} ({distance_km} km) via {req.mode}.
        Target fair range: Rs. {min_fare} to Rs. {max_fare} (median: Rs. {median_fare}).
        Fare anchor: Rs. {fare_anchor} ({fare_anchor_label}; reports counted: {report_count}).
        {surge_context}
        Student's current situation/problems: {req.user_situation or 'None'}

        Task:
        Generate a JSON object containing three fields:
        1. "script": A localized, high-impact, realistic negotiation script in local Indian student dialect (using {dialect}) to say to the driver. Keep it short, natural, and street-smart. Mention an app quote only if current app quote context is provided. If a high app quote is provided, factor that into your advice (suggest alternatives if quote ratio > 1.5x, set a harder anchor if mildly high). Incorporate their situation (e.g. rain, luggage, night) if provided.
        2. "tactics": Array of 3 bullet points of specific tactical advice for negotiating this route/mode/situation. If app quote comparison data is available, include quote-specific tactics.
        3. "safety": A 1-sentence quick safety advice for this specific situation.

        Output ONLY valid JSON matching this schema, without markdown formatting or trailing text. Do not wrap in ```json.
        """

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

# Curated landmark â†’ (city, (lat, lon)) mapping.
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

_NOMINATIM_HEADERS = {
    "User-Agent": "PocketBuddy-StudentAffordabilityApp/1.0 (contact: kanik.dev@gmail.com)"
}
_PHOTON_HEADERS = {
    "User-Agent": "PocketBuddy-StudentAffordabilityApp/1.0 (contact: kanik.dev@gmail.com)",
    "Accept-Language": "en-IN,en;q=0.9",
}


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

    try:
        async with httpx.AsyncClient(headers=_NOMINATIM_HEADERS, timeout=6.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
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
                "updated_at": datetime.datetime.utcnow(),
            }
            await db.campus_metadata.replace_one({"_id": college_name}, meta, upsert=True)
            logger.info("Known campus matched: '%s' -> %s", college_name, city)
            return meta

    # 2b. Extended city-keyword matching for college names that don't contain
    #     institution acronyms. Safe here because we're matching the college name,
    #     not a landmark query.
    for keyword, city, state, lat, lon in _COLLEGE_NAME_CITY_HINTS:
        if keyword in col_lower:
            meta = {
                "_id": college_name,
                "lat": lat, "lon": lon,
                "city": city, "state": state,
                "updated_at": datetime.datetime.utcnow(),
            }
            await db.campus_metadata.replace_one({"_id": college_name}, meta, upsert=True)
            logger.info("City keyword matched college name '%s' -> %s", college_name, city)
            return meta

    # 3. Dynamic Nominatim geocode
    lat, lon, city, state = None, None, None, None
    async with httpx.AsyncClient(headers=_NOMINATIM_HEADERS, timeout=8.0) as client:
        try:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": college_name, "format": "json", "limit": 1},
            )
            if r.status_code == 200 and r.json():
                hit = r.json()[0]
                lat, lon = float(hit["lat"]), float(hit["lon"])
                # Reverse geocode for authoritative city
                rev = await client.get(
                    "https://nominatim.openstreetmap.org/reverse",
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

    # 4. Absolute fallback
    if not lat:
        lat, lon, city, state = 26.2514, 78.1685, "Gwalior", "Madhya Pradesh"
        logger.warning("Absolute fallback to Gwalior for unknown campus '%s'", college_name)

    meta = {
        "_id": college_name,
        "lat": lat, "lon": lon,
        "city": city, "state": state,
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
        college = (profile.get("college_name") if profile else None) or "ABV-IIITM Gwalior"

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
) -> Optional[tuple[float, float]]:
    """
    Resolves an arbitrary location query to (lat, lon).

    Pipeline:
      Phase 1 â€” Campus endpoint detection: if the query refers to the
                 college/campus itself, return campus coordinates immediately.
      Phase 2 â€” Curated landmark match with city-validation.
      Phase 3a â€” Nominatim search with viewbox bias around the campus.
                  Returns the closest result to campus when multiple hits.
      Phase 3b â€” Nominatim global search (no viewbox) as final fallback.
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

    async with httpx.AsyncClient(headers=_NOMINATIM_HEADERS, timeout=8.0) as client:

        if is_institution_query:
            # Global search for institutions (no viewbox — institution names are globally unique)
            try:
                r = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": query, "format": "json", "limit": 1},
                )
                if r.status_code == 200 and r.json():
                    hit = r.json()[0]
                    lat, lon = float(hit["lat"]), float(hit["lon"])
                    logger.info("Nominatim global (institution): '%s' -> (%.4f, %.4f)", query, lat, lon)
                    return lat, lon
            except Exception as exc:
                logger.warning("Nominatim institution search error for '%s': %s", query, exc)
        else:
            # 3a. HARD-bounded search within campus city area (bounded=1 prevents cross-country results)
            # This is the critical fix — prevents "City Centre" from resolving to Dublin/London.
            try:
                r = await client.get(
                    "https://nominatim.openstreetmap.org/search",
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
                    return lat, lon
            except Exception as exc:
                logger.warning("Nominatim bounded search error for '%s': %s", search_q, exc)

            # 3b. Soft-bounded fallback (bounded=0) with same city-anchored query
            # Only if the hard-bounded search returned nothing.
            # NEVER do a global search without city context for non-institution queries.
            try:
                r = await client.get(
                    "https://nominatim.openstreetmap.org/search",
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
                        return lat, lon
            except Exception as exc:
                logger.warning("Nominatim soft-bounded search error for '%s': %s", search_q, exc)

    logger.warning("Nominatim could not resolve '%s' within city '%s'", query, campus_city)
    return None


async def compute_route(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
) -> tuple[float, int, list[list[float]], str]:
    """
    Computes driving route between two points.

    Returns: (distance_km, duration_mins, leaflet_geometry_list, source_label)

    Uses OSRM public API for real driving routes with turn-by-turn geometry.
    Falls back to Haversine Ã— 1.35 road-factor if OSRM is unreachable.
    """
    # OSRM public routing engine
    try:
        base_url = (settings.osrm_route_url or "https://router.project-osrm.org").rstrip("/")
        url = (
            f"{base_url}/route/v1/driving/"
            f"{lon1},{lat1};{lon2},{lat2}"
            f"?overview=full&geometries=geojson&steps=false"
        )
        async with httpx.AsyncClient(timeout=8.0) as client:
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
                return dist_km, dur_mins, geom, "osrm_route"
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
    dur_mins    = max(2, int(road_km / 25.0 * 60)) # avg 25 km/h urban
    geom        = [[lat1, lon1], [lat2, lon2]]
    logger.info("Haversine fallback: %.1f km (road est.), %d min", road_km, dur_mins)
    return road_km, dur_mins, geom, "haversine_estimate"


@router.get("/calculate-route")
async def calculate_route(
    origin: str = Query(..., description="Origin location"),
    destination: str = Query(..., description="Destination location"),
    college: Optional[str] = Query(None, description="Campus context selected in the UI"),
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

    # Resolve college and campus location
    profile = await db.profiles.find_one({"_id": user_id})
    college = college or (profile.get("college_name") if profile else None) or "ABV-IIITM Gwalior"

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
        )
    if not coords_dest:
        coords_dest, destination_resolution, destination_resolved_label = await _resolve_typed_place(
            query=search_dest,
            college=college,
            campus_meta=campus_meta,
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

    if coords_origin:
        dist = _distance_km(campus_lat, campus_lon, *coords_origin)
        if dist > _MAX_LOCAL_DIST_KM and not _is_likely_institution(search_origin):
            logger.warning(
                "Origin '%s' resolved %.0f km from campus — rejecting (likely geocoding error)",
                search_origin, dist
            )
            coords_origin = None
            origin_resolution = "rejected_far_match"
    if coords_dest:
        dist = _distance_km(campus_lat, campus_lon, *coords_dest)
        if dist > _MAX_LOCAL_DIST_KM and not _is_likely_institution(search_dest):
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
    distance_km, duration_mins, geometry, source = await compute_route(lat1, lon1, lat2, lon2)

    # Estimate fares using city-specific tariff rules
    modes = estimate_fares_by_city(distance_km, college)
    resolution_values = {origin_resolution, destination_resolution}
    low_resolution = bool(resolution_values & {"deliberate_geocode", "rejected_far_match", "unresolved"})
    route_confidence = (
        "high"
        if source == "osrm_route" and not low_resolution
        else "medium"
        if source == "osrm_route"
        else "low"
    )
    needs_review = source != "osrm_route" or low_resolution
    resolution_warning = (
        "Route is based on a fallback distance estimate. Confirm the places before using the fare."
        if source != "osrm_route"
        else "One or both places were resolved from typed search. Select a suggestion next time for the strongest match."
        if low_resolution
        else None
    )

    price_basis = (
        "Mapped road distance plus campus-local fare rules. These are not ride-app API prices."
        if source == "osrm_route"
        else "Fallback road estimate plus campus-local fare rules. Confirm the route before relying on this."
    )

    return {
        "distance_km":    distance_km,
        "duration_mins":  duration_mins,
        "source":         source,
        "campus":         college,
        "campus_city":    campus_city,
        "route_confidence": route_confidence,
        "needs_review":   needs_review,
        "resolution_warning": resolution_warning,
        "price_basis":    price_basis,
        "origin_resolution": origin_resolution,
        "destination_resolution": destination_resolution,
        "origin_resolved_label": origin_resolved_label,
        "destination_resolved_label": destination_resolved_label,
        "origin_coords":  [lat1, lon1],
        "dest_coords":    [lat2, lon2],
        "modes":          modes,
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
    user_phone = _clean_phone(user_doc.get("phone_number", "") if user_doc else "")
    profile = await db.profiles.find_one({"_id": user_id})
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

    pool_id = str(uuid.uuid4())
    pool_doc = {
        "_id": pool_id,
        "route_id": req.route_id,
        "college": college,
        "departure_time": departure_time.isoformat(),
        "mode": str(_find_mode(route_doc, req.mode).get("mode") or req.mode),
        "max_passengers": req.max_passengers,
        "description": _clean_text(req.description, 140),
        "host_id": user_id,
        "host_name": user_name,
        "host_phone": user_phone,
        "status": "active",
        "co_passengers": [
            {
                "user_id": user_id,
                "full_name": user_name,
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
        {"$push": {"co_passengers": {"user_id": user_id, "full_name": user_name}}}
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
