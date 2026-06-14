import datetime
import uuid
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.services.bedrock import generate_json

router = APIRouter()
logger = logging.getLogger("app.api.travel")


# Default seeded routes for ABV-IIITM Gwalior
DEFAULT_ROUTES = [
    {
        "id": "gwalior_station_iiitm",
        "name": "Gwalior Railway Station → ABV-IIITM",
        "description": "Travel from Gwalior Main Railway Station to the ABV-IIITM Campus.",
        "modes": [
            {"mode": "Auto (Ola/Uber/Local)", "min_fare": 140, "max_fare": 180, "median_fare": 160},
            {"mode": "Cab (Uber/Ola)", "min_fare": 220, "max_fare": 300, "median_fare": 260},
            {"mode": "Shared Auto + Tempo", "min_fare": 40, "max_fare": 70, "median_fare": 50}
        ],
        "cheapest_route_combo": "Take a shared auto from outside the station till Phool Bagh (₹20), then change to a tempo towards Morena Road / IIITM gate (₹20-₹30). Total: ₹45-₹50.",
        "negotiation_helper": "Bhaiya, ABV-IIITM ka normal student fare ₹150-₹170 hota hai. ₹170 final?",
        "safety_score_day": "High Safety",
        "safety_score_night": "Avoid shared routes after 9:00 PM. Prefer pre-booked cab or direct auto from main stand.",
        "scam_warnings": "Auto drivers inside the station gate will quote ₹400+. Walk 100 meters outside the station main gate to the circle to get a direct auto for ₹150.",
        "campus_landmark": "Campus Gate No 1, Morena Link Road"
    },
    {
        "id": "gwalior_airport_iiitm",
        "name": "Gwalior Airport → ABV-IIITM",
        "description": "Travel from Rajmata Vijaya Raje Scindia Airport to the ABV-IIITM Campus.",
        "modes": [
            {"mode": "Cab (Uber/Ola)", "min_fare": 450, "max_fare": 600, "median_fare": 500},
            {"mode": "Auto (Ola/Uber)", "min_fare": 300, "max_fare": 380, "median_fare": 340}
        ],
        "cheapest_route_combo": "No direct shared transit available. It's recommended to pool a cab with co-passengers/students.",
        "negotiation_helper": "Bhaiya, IIITM Gwalior to 12km hi hai. ₹330 chaloge?",
        "safety_score_day": "Moderate Safety",
        "safety_score_night": "Avoid travel after 10 PM unless using a pre-booked app cab (Ola/Uber).",
        "scam_warnings": "Pre-book a cab if arriving late. Airport autos charge highly inflated premium rates.",
        "campus_landmark": "Campus Main Gate"
    },
    {
        "id": "bus_stand_iiitm",
        "name": "Gwalior Bus Stand → ABV-IIITM",
        "description": "Travel from Gola ka Mandir Bus Stand to ABV-IIITM Campus.",
        "modes": [
            {"mode": "Auto (Ola/Uber/Local)", "min_fare": 100, "max_fare": 130, "median_fare": 110},
            {"mode": "Cab (Uber/Ola)", "min_fare": 160, "max_fare": 220, "median_fare": 180},
            {"mode": "Shared Auto", "min_fare": 30, "max_fare": 50, "median_fare": 40}
        ],
        "cheapest_route_combo": "Take a shared auto from Gola ka Mandir to Hazira (₹15), then another auto/tempo to IIITM gate (₹15). Total: ₹30.",
        "negotiation_helper": "Bhaiya, Hazira crossing hote hue ₹110 normal fare hai. ₹120 chaloge?",
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

class SavingsLogReq(BaseModel):
    amount_saved: float
    route_id: str

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

    if not routes:
        if "gwalior" in college.lower() or "iiitm" in college.lower():
            # Seed Gwalior defaults
            for r in DEFAULT_ROUTES:
                r_doc = dict(r)
                r_doc["_id"] = r_doc.pop("id")
                r_doc["college"] = college
                r_doc["source"] = "seeded"
                await db.travel_routes.insert_one(r_doc)
        else:
            # Generate default travel booking app-based estimates for the college
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
                    "name": f"{names['station_name']} → {college}",
                    "description": f"Standard route from nearest major Railway Station to {college}.",
                    "distance_km": distances["station"],
                    "campus_landmark": "Main Gate"
                },
                {
                    "id": f"{uuid.uuid4().hex[:8]}_bus",
                    "name": f"{names['bus_name']} → {college}",
                    "description": f"Standard route from nearest major Bus Stand to {college}.",
                    "distance_km": distances["bus"],
                    "campus_landmark": "Main Gate"
                },
                {
                    "id": f"{uuid.uuid4().hex[:8]}_airport",
                    "name": f"{names['airport_name']} → {college}",
                    "description": f"Route from local airport to {college} (simulated distance).",
                    "distance_km": distances["airport"],
                    "campus_landmark": "Main Gate"
                }
            ]

            for nr in new_routes:
                d = nr["distance_km"]
                # Formulate approximate ranges based on standard Indian ride app tariffs:
                # Cab: ~180 base + ₹16.5/km. Auto: ~70 base + ₹10.5/km. Bike: ~30 base + ₹7/km.
                modes = [
                    {
                        "mode": "Auto (Ola/Uber/Local)",
                        "min_fare": int(60 + d * 9),
                        "max_fare": int(80 + d * 12),
                        "median_fare": int(70 + d * 10.5)
                    },
                    {
                        "mode": "Cab (Uber/Ola)",
                        "min_fare": int(180 + d * 14),
                        "max_fare": int(240 + d * 19),
                        "median_fare": int(210 + d * 16.5)
                    },
                    {
                        "mode": "Bike (Rapido/Ola)",
                        "min_fare": int(25 + d * 6),
                        "max_fare": int(35 + d * 8),
                        "median_fare": int(30 + d * 7)
                    }
                ]

                r_doc = {
                    "_id": nr["id"],
                    "college": college,
                    "name": nr["name"],
                    "description": nr["description"],
                    "modes": modes,
                    "cheapest_route_combo": f"Use Bike (Rapido/Ola) for single commuters to keep travel cost around ₹{int(30 + d * 7)}. For luggage or group travel, check Ola Auto.",
                    "negotiation_helper": f"Bhaiya, {college} to normal booking app fare dikha raha hai. Sahi price pe chaloge?",
                    "safety_score_day": "High Safety",
                    "safety_score_night": "Avoid shared or bike trips after 9 PM; prefer pre-booked app cabs.",
                    "scam_warnings": "Compare prices on Uber/Ola before negotiating flat rates with auto drivers at the terminal exit.",
                    "campus_landmark": nr["campus_landmark"],
                    "source": "app_estimate",
                    "distance_km": d
                }
                await db.travel_routes.insert_one(r_doc)

        cursor = db.travel_routes.find({"college": college})
        routes = await cursor.to_list(length=100)

    return [_to_dict(r) for r in routes]

@router.post("/routes")
async def create_custom_route(req: CustomRouteCreateReq, user_id: str = Depends(get_current_user)):
    db = get_db()

    # Determine college
    college = req.college
    if not college:
        profile = await db.profiles.find_one({"_id": user_id})
        college = profile.get("college_name") if profile else "ABV-IIITM Gwalior"

    if not college:
        college = "ABV-IIITM Gwalior"

    d = req.distance_km
    if d <= 0 or d > 250:
        raise HTTPException(status_code=400, detail="Distance must be positive and less than 250 km")
    # Auto-calculate fare estimates based on distance using ride app simulation
    modes = [
        {
            "mode": "Auto (Ola/Uber/Local)",
            "min_fare": int(60 + d * 9),
            "max_fare": int(80 + d * 12),
            "median_fare": int(70 + d * 10.5)
        },
        {
            "mode": "Cab (Uber/Ola)",
            "min_fare": int(180 + d * 14),
            "max_fare": int(240 + d * 19),
            "median_fare": int(210 + d * 16.5)
        },
        {
            "mode": "Bike (Rapido/Ola)",
            "min_fare": int(25 + d * 6),
            "max_fare": int(35 + d * 8),
            "median_fare": int(30 + d * 7)
        }
    ]

    route_id = f"{uuid.uuid4().hex[:8]}_custom"

    r_doc = {
        "_id": route_id,
        "college": college,
        "name": req.name,
        "description": req.description,
        "modes": modes,
        "cheapest_route_combo": f"Check Uber and Ola auto apps. The estimated distance is {d} km.",
        "negotiation_helper": f"Bhaiya, {req.name} ka normal booking rate ₹{int(70 + d * 10.5)} hai. Sahi rate pe chal lo.",
        "safety_score_day": "High Safety",
        "safety_score_night": "Stick to app-based rides late at night.",
        "scam_warnings": "Always check app base fare before negotiating flat prices.",
        "campus_landmark": req.campus_landmark,
        "source": "user_added",
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
        user_doc = await db.users.find_one({"_id": poster_id})
        report_dict["user_name"] = user_doc.get("full_name", "Anonymous Student") if user_doc else "Anonymous Student"
        mapped_reports.append(report_dict)

    return mapped_reports

@router.post("/reports")
async def create_report(req: ReportSubmitReq, user_id: str = Depends(get_current_user)):
    db = get_db()

    # Fetch route to validate route and get baseline fare
    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    if not route_doc:
        raise HTTPException(status_code=404, detail="Route not found")

    # Find base median fare for mode
    base_median_fare = 150  # default fallback
    modes = route_doc.get("modes", [])
    if modes:
        base_median_fare = modes[0].get("median_fare", 150)
        for m in modes:
            if req.mode.lower() in m["mode"].lower() or m["mode"].lower() in req.mode.lower():
                base_median_fare = m.get("median_fare", base_median_fare)
                break

    # Validate input amounts
    if req.amount_paid <= 0 or req.amount_paid > base_median_fare * 3:
        raise HTTPException(status_code=400, detail=f"Amount paid must be positive and not exceed 3x the baseline fare (₹{base_median_fare * 3})")
    if req.final_amount <= 0 or req.final_amount > base_median_fare * 3:
        raise HTTPException(status_code=400, detail=f"Final amount must be positive and not exceed 3x the baseline fare (₹{base_median_fare * 3})")
    if req.driver_quote <= 0 or req.driver_quote > base_median_fare * 5:
        raise HTTPException(status_code=400, detail=f"Driver quote must be positive and within reasonable limits (maximum ₹{base_median_fare * 5})")

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
        "created_at": datetime.datetime.utcnow()
    })

    # Dynamically update the fair fare ranges in the route document based on community reports
    cursor = db.travel_reports.find({"route_id": req.route_id, "mode": req.mode})
    mode_reports = await cursor.to_list(length=1000)

    if len(mode_reports) >= 2:
        fares = [r["final_amount"] for r in mode_reports]
        fares.sort()

        min_fare = int(fares[0])
        max_fare = int(fares[-1])
        median_fare = int(fares[len(fares) // 2])

        route_doc = await db.travel_routes.find_one({"_id": req.route_id})
        if route_doc:
            updated_modes = []
            mode_found = False
            for m in route_doc.get("modes", []):
                # match mode name (case-insensitive substring)
                if req.mode.lower() in m["mode"].lower() or m["mode"].lower() in req.mode.lower():
                    m["min_fare"] = min_fare
                    m["max_fare"] = max_fare
                    m["median_fare"] = median_fare
                    mode_found = True
                updated_modes.append(m)

            if not mode_found:
                updated_modes.append({
                    "mode": req.mode,
                    "min_fare": min_fare,
                    "max_fare": max_fare,
                    "median_fare": median_fare
                })

            await db.travel_routes.update_one(
                {"_id": req.route_id},
                {"$set": {"modes": updated_modes}}
            )

    # Add to wing feed activity
    profile = await db.profiles.find_one({"_id": user_id})
    wing = profile.get("wing_label", "unknown wing") if profile else "unknown wing"

    route_doc = await db.travel_routes.find_one({"_id": req.route_id})
    route_name = route_doc.get("name", "campus route") if route_doc else "campus route"
    route_short = route_name.split("→")[0].strip() if "→" in route_name else route_name

    await db.checkin_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "response": "travel_fare_report",
        "gap_hours": 0,
        "food_gap_hours": 0,
        "suggestion_given": f"{req.mode} via {route_short}",
        "stress_note": f"A student reported paying ₹{req.final_amount:.0f} (saved ₹{max(0.0, req.driver_quote - req.final_amount):.0f} from ₹{req.driver_quote:.0f} quote)",
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
        "stress_note": f"Saved ₹{req.amount_saved:.0f} using Travel negotiation helper!",
        "created_at": datetime.datetime.utcnow()
    })

    return {"status": "ok", "id": savings_id, "amount_saved": req.amount_saved}


class AiCoachReq(BaseModel):
    route_id: str
    mode: str
    user_situation: Optional[str] = ""
    college: Optional[str] = None
    app_quote: Optional[float] = None  # What the booking app is showing right now

@router.post("/ai-coach")
async def get_ai_negotiation_coach(req: AiCoachReq, user_id: str = Depends(get_current_user)):
    db = get_db()

    # Fetch route info
    route = await db.travel_routes.find_one({"_id": req.route_id})

    # Determine college name
    college = req.college or (route.get("college") if route else None)
    if not college:
        profile = await db.profiles.find_one({"_id": user_id})
        college = profile.get("college_name") if profile else "ABV-IIITM Gwalior"

    route_name = route.get("name", "Campus Route") if route else "Campus Route"
    distance_km = route.get("distance_km", 10.0) if route else 10.0

    # Determine target fare ranges
    min_fare, max_fare, median_fare = 150, 200, 175
    if route:
        for m in route.get("modes", []):
            if req.mode.lower() in m["mode"].lower() or m["mode"].lower() in req.mode.lower():
                min_fare = m.get("min_fare", min_fare)
                max_fare = m.get("max_fare", max_fare)
                median_fare = m.get("median_fare", median_fare)
                break

    # --- Surge Coefficient Model ---
    # Compare the live app quote against historical median from community reports
    surge_factor = 1.0
    community_median = median_fare  # fallback to route median
    report_count = 0
    if route:
        now_hour = datetime.datetime.utcnow().hour
        # Fetch recent reports for this route+mode to build community median
        report_cursor = db.travel_reports.find({
            "route_id": req.route_id,
            "mode": {"$regex": req.mode, "$options": "i"},
        }).sort("created_at", -1)
        recent_reports = await report_cursor.to_list(length=200)
        if recent_reports:
            report_count = len(recent_reports)
            report_fares = sorted([r["final_amount"] for r in recent_reports])
            community_median = report_fares[len(report_fares) // 2]

    if req.app_quote and req.app_quote > 0 and community_median > 0:
        surge_factor = round(req.app_quote / community_median, 2)

    surge_context = ""
    if surge_factor > 1.5:
        surge_context = f"SURGE ALERT: Current app price (₹{req.app_quote:.0f}) is {surge_factor}x the community median (₹{community_median:.0f}). Advise the student to consider alternative transport combos or wait 15-30 min for prices to drop."
    elif surge_factor > 1.15:
        surge_context = f"MILD SURGE: Current app price (₹{req.app_quote:.0f}) is {surge_factor}x the community median (₹{community_median:.0f}). The student should negotiate harder than usual; target ₹{community_median:.0f} as the anchor."
    elif req.app_quote and req.app_quote > 0:
        surge_context = f"NO SURGE: Current app price (₹{req.app_quote:.0f}) is close to community median (₹{community_median:.0f}). Fair pricing window."

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

    # Build local rule-based fallback response
    fallback_script = route.get("negotiation_helper", "Bhaiya, sahi price lagao. Chalo na.") if route else "Bhaiya, sahi price lagao."
    if req.app_quote and surge_factor > 1.15:
        fallback_script += f" App par ₹{req.app_quote:.0f} dikha raha hai, par normal rate ₹{community_median:.0f} hota hai."
    if req.user_situation:
        fallback_script += f" (Note: {req.user_situation})"

    fallback_response = {
        "script": fallback_script,
        "tactics": [
            f"Compare Ola/Uber/Rapido rates on your phone screen before discussing flat rates.",
            f"Walk 100 meters away from main exit gates to hire passing running autos rather than stationary ones.",
            f"Refer to standard rates: Bhaiya, regular campus rate is between ₹{min_fare}-₹{max_fare}."
        ],
        "safety": route.get("safety_score_night", "Avoid shared/unknown routes late at night; prefer app-booked rides.") if route else "Always prefer pre-booked app rides late at night.",
        "surge_factor": surge_factor,
        "community_median": community_median,
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
        Community median from {report_count} student reports: Rs. {community_median}.
        {surge_context}
        Student's current situation/problems: {req.user_situation or 'None'}

        Task:
        Generate a JSON object containing three fields:
        1. "script": A localized, high-impact, realistic negotiation script in local Indian student dialect (using {dialect}) to say to the driver. Keep it short, natural, and street-smart (e.g., 'Bhaiya, app par Rs. 150 dikha raha hai...'). If there is a surge, factor the surge into your advice (suggest alternatives if surge > 1.5x, set a harder anchor if mild surge). Incorporate their situation (e.g. rain, luggage, night) if provided.
        2. "tactics": Array of 3 bullet points of specific tactical advice for negotiating this route/mode/situation. If surge data is available, include surge-specific tactics.
        3. "safety": A 1-sentence quick safety advice for this specific situation.

        Output ONLY valid JSON matching this schema, without markdown formatting or trailing text. Do not wrap in ```json.
        """

        result = generate_json(prompt, max_tokens=500, temperature=0.25)
        result["source"] = "bedrock"
        result["surge_factor"] = surge_factor
        result["community_median"] = community_median
        result["report_count"] = report_count
        return result

    except Exception as exc:
        logger.warning("Bedrock AI coach failed: %s", exc)
        return {**fallback_response, "bedrock_error": str(exc)}

