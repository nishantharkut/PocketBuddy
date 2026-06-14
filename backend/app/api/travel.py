import datetime
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter()

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
async def get_routes(user_id: str = Depends(get_current_user)):
    db = get_db()
    
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
            # Generate default travel booking app-based estimates for any college
            new_routes = [
                {
                    "id": f"{uuid.uuid4().hex[:8]}_station",
                    "name": f"Railway Station → {college}",
                    "description": f"Standard route from nearest major Railway Station to {college}.",
                    "distance_km": 11.5,
                    "campus_landmark": "Main Gate"
                },
                {
                    "id": f"{uuid.uuid4().hex[:8]}_bus",
                    "name": f"Bus Stand → {college}",
                    "description": f"Standard route from nearest major Bus Stand to {college}.",
                    "distance_km": 7.0,
                    "campus_landmark": "Main Gate"
                },
                {
                    "id": f"{uuid.uuid4().hex[:8]}_airport",
                    "name": f"Airport → {college}",
                    "description": f"Route from local airport to {college} (simulated distance).",
                    "distance_km": 24.5,
                    "campus_landmark": "Main Gate"
                }
            ]
            
            for nr in new_routes:
                d = nr["distance_km"]
                # Formulate approximate ranges based on standard Indian ride app tariffs:
                # Cab: ~220 base + ₹18/km. Auto: ~70 base + ₹11/km. Bike: ~30 base + ₹7/km.
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
    
    # Get user profile to check college
    profile = await db.profiles.find_one({"_id": user_id})
    college = profile.get("college_name") if profile else "ABV-IIITM Gwalior"
    if not college:
        college = "ABV-IIITM Gwalior"
        
    d = req.distance_km
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
