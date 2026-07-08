import os
import sys
import uuid
import datetime
import bcrypt
from pathlib import Path
from pymongo import MongoClient

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))
os.environ.setdefault("JWT_SECRET", "seed-script-placeholder")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017")

from app.services.campus_food import compute_food_verification_threshold  # noqa: E402

# Target credentials
TARGET_EMAIL = "charizardoped@gmail.com"
TARGET_PASSWORD = "Nishant@27"
TARGET_NAME = "Nishant Arkut"

def get_mongo_client():
    mongo_uri = "mongodb://localhost:27017"
    for env_path in (Path.cwd() / ".env", REPO_ROOT / "backend" / ".env", REPO_ROOT / ".env"):
        if env_path.exists():
            with env_path.open("r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("MONGO_URI="):
                        mongo_uri = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
    return MongoClient(mongo_uri)

def generate_monthly_transactions(year, month, user_id, max_day=31):
    txns = [
        # Allowance Credit (1st of month)
        {
            "amount": 1000000, # Rs 10,000
            "merchant": "Monthly Allowance - Parent",
            "category": "income",
            "dir": "credit",
            "day": 1,
            "hour": 12
        },
        # Subscriptions on the 2nd/10th
        {
            "amount": 19900,
            "merchant": "Netflix India",
            "category": "subscription",
            "dir": "debit",
            "day": 2,
            "hour": 12
        },
        {
            "amount": 11900,
            "merchant": "Spotify India",
            "category": "subscription",
            "dir": "debit",
            "day": 2,
            "hour": 12
        },
        {
            "amount": 199900,
            "merchant": "ChatGPT Plus",
            "category": "subscription",
            "dir": "debit",
            "day": 10,
            "hour": 12
        },
        {
            "amount": 9900,
            "merchant": "Design Tool Workspace",
            "category": "other",
            "dir": "debit",
            "day": 12,
            "hour": 12
        }
    ]
    
    debits = [
        {"day": 3, "amount": 4500, "merchant": "BH-2 Night Canteen", "category": "food", "hour": 1}, # Late night
        {"day": 4, "amount": 14000, "merchant": "Uber Auto - Phoenix Mall", "category": "travel", "hour": 15},
        {"day": 5, "amount": 34000, "merchant": "Swiggy - Megha Foods", "category": "food", "hour": 13},
        {"day": 7, "amount": 8000, "merchant": "Mess Extra - Chicken", "category": "food", "hour": 20},
        {"day": 8, "amount": 8500, "merchant": "Campus Bookstore", "category": "other", "hour": 11},
        {"day": 10, "amount": 5000, "merchant": "Auto - Campus Gate", "category": "travel", "hour": 9},
        {"day": 11, "amount": 12000, "merchant": "BH-2 Night Canteen", "category": "food", "hour": 22},
        {"day": 13, "amount": 20000, "merchant": "Hostel Laundry", "category": "other", "hour": 10},
        {"day": 15, "amount": 42000, "merchant": "Ola Cab - Central Station", "category": "travel", "hour": 18},
        {"day": 16, "amount": 15000, "merchant": "Zomato - Burger King", "category": "food", "hour": 13},
        {"day": 18, "amount": 9000, "merchant": "Fruit Juice Stall", "category": "food", "hour": 16},
        {"day": 20, "amount": 28000, "merchant": "Swiggy - Megha Foods", "category": "food", "hour": 14},
        {"day": 22, "amount": 5500, "merchant": "BH-2 Night Canteen", "category": "food", "hour": 23},
        {"day": 24, "amount": 12000, "merchant": "Campus Stationery", "category": "other", "hour": 15},
        {"day": 26, "amount": 45000, "merchant": "Uber Cab - Airport", "category": "travel", "hour": 6},
        {"day": 27, "amount": 6000, "merchant": "Mess Extra - Ice Cream", "category": "food", "hour": 21},
        {"day": 29, "amount": 32000, "merchant": "Swiggy - Sweet Truth", "category": "food", "hour": 19}
    ]
    
    for d in debits:
        if d["day"] <= max_day:
            txns.append({
                "amount": d["amount"],
                "merchant": d["merchant"],
                "category": d["category"],
                "dir": "debit",
                "day": d["day"],
                "hour": d["hour"]
            })
            
    return txns

def seed_data(email=TARGET_EMAIL, password=TARGET_PASSWORD, full_name=TARGET_NAME):
    print(f"Connecting to MongoDB...")
    client = get_mongo_client()
    db = client.pocketbuddy

    print(f"Checking for existing user {email}...")
    user = db.users.find_one({"email": email})
    
    if user:
        user_id = user["_id"]
        print(f"User exists (ID: {user_id}). Cascading delete to re-seed...")
        db.users.delete_one({"_id": user_id})
        db.profiles.delete_one({"_id": user_id})
        db.transactions.delete_many({"user_id": user_id})
        db.subscriptions.delete_many({"user_id": user_id})
        db.companion_sync_log.delete_many({"user_id": user_id})
        db.checkin_logs.delete_many({"user_id": user_id})
        db.travel_savings.delete_many({"user_id": user_id})
        db.travel_reports.delete_many({"user_id": user_id})
        
        # Remove from travel pools
        db.travel_pools.update_many(
            {"host_id": {"$ne": user_id}},
            {"$pull": {"co_passengers": {"user_id": user_id}, "splits": {"user_id": user_id}}},
        )
        db.travel_pools.delete_many({"host_id": user_id})

        # Remove from cart pools
        user_pools = list(db.cart_pools.find({"host_id": user_id}, {"_id": 1}))
        user_pool_ids = [p["_id"] for p in user_pools]
        if user_pool_ids:
            db.cart_pool_items.delete_many({"pool_id": {"$in": user_pool_ids}})
        db.cart_pool_items.delete_many({"added_by_name": full_name})
        db.cart_pools.delete_many({"host_id": user_id})

        # Clean campus food and scan logs
        db.campus_food.delete_many({"scanned_by": user_id})
        db.campus_food.delete_many({"scanned_by": "rahul_sharma"})
        db.menu_scan_log.delete_many({"user_id": user_id})
    else:
        user_id = str(uuid.uuid4())
        print(f"Creating new user (ID: {user_id})...")

    # Hash password
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # 1. Create User
    db.users.insert_one({
        "_id": user_id,
        "email": email,
        "password": hashed,
        "full_name": full_name,
        "phone_number": "+919876543210",
        "created_at": datetime.datetime(2026, 4, 30)
    })

    # 2. Create Profile (with exam dates encompassing today July 6 for -15 pts pressure)
    db.profiles.insert_one({
        "_id": user_id,
        "email": email,
        "monthly_allowance": 1000000, # Rs 10,000
        "cycle_start_day": 1,
        "college_name": "IIT Madras",
        "hostel_block": "Bhadra",
        "wing_label": "C-Wing",
        "room_number": "304",
        "exam_start_date": "2026-07-04", # Starts July 4
        "exam_end_date": "2026-07-12",   # Ends July 12
        "mess_enrolled": True,
        "mess_billing_model": "monthly",
        "mess_monthly_cost": 450000, # Rs 4,500
        "mess_per_meal_cost": 0,
        "mess_meals_per_day": 3,
        "exam_safety_buffer": 200000, # Rs 2,000
        "meal_schedule": {
            "breakfast": "08:30",
            "lunch": "12:30",
            "dinner": "19:30"
        },
        "upi_apps_used": ["gpay", "phonepe", "paytm"],
        "upi_id": "nishant@okaxis",
        "onboarding_completed": True,
        "setup_completed": True,
        "companion_paired": True,
        "companion_device_name": "Pixel 7 Pro",
        "companion_sync_enabled": True,
        "companion_device_id": "pixel-7-pro-unique-id",
        "companion_last_sync": datetime.datetime.utcnow().isoformat() + "Z",
        "created_at": datetime.datetime(2026, 4, 30)
    })

    # 3. Create Subscriptions (set due in 4 days to trigger Collisions card)
    now = datetime.datetime.utcnow()
    # Spotify: Active/Tracked
    db.subscriptions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "service_name": "Spotify",
        "name": "Spotify",
        "amount": 11900,
        "billing_cycle": "monthly",
        "next_debit_date": now + datetime.timedelta(days=4),
        "detected_from": "manual_transaction",
        "is_active": True,
        "status": "confirmed",
        "confidence": 100.0,
        "evidence": ["Manually added by user during onboarding"],
        "created_at": datetime.datetime(2026, 4, 30),
        "updated_at": datetime.datetime(2026, 4, 30)
    })
    # ChatGPT Plus: Active/Tracked from repeated known-brand debit rhythm
    db.subscriptions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "service_name": "ChatGPT Plus",
        "name": "ChatGPT Plus",
        "amount": 199900,
        "billing_cycle": "monthly",
        "next_debit_date": now + datetime.timedelta(days=5),
        "detected_from": "recurring_pattern",
        "is_active": True,
        "status": "confirmed",
        "confidence": 95.0,
        "evidence": [
            "Recognized premium subscription brand",
            "Stable monthly amount of Rs 1,999.00 observed"
        ],
        "created_at": datetime.datetime(2026, 4, 30),
        "updated_at": datetime.datetime(2026, 4, 30)
    })
    # Netflix: Paused/Inactive
    db.subscriptions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "service_name": "Netflix",
        "name": "Netflix",
        "amount": 19900,
        "billing_cycle": "monthly",
        "next_debit_date": now + datetime.timedelta(days=4),
        "detected_from": "manual_transaction",
        "is_active": False,
        "status": "confirmed",
        "confidence": 100.0,
        "evidence": ["Paused by user in settings"],
        "created_at": datetime.datetime(2026, 4, 30),
        "updated_at": datetime.datetime(2026, 4, 30)
    })
    # Design Tool Workspace: Possible/Candidate. This is intentionally not a
    # known brand, so it remains in review until the student confirms it.
    db.subscriptions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "service_name": "Design Tool Workspace",
        "name": "Design Tool Workspace",
        "amount": 9900,
        "billing_cycle": "monthly",
        "next_debit_date": now + datetime.timedelta(days=6),
        "detected_from": "recurring_pattern",
        "is_active": True,
        "status": "possible",
        "confidence": 60.0,
        "evidence": [
            "Seen twice with a recurring monthly cadence",
            "Stable amount of Rs 99.00 observed",
            "Requires user confirmation to count as runway fixed cost"
        ],
        "created_at": datetime.datetime(2026, 4, 30),
        "updated_at": datetime.datetime(2026, 4, 30)
    })

    # 4. Create Historical Transactions
    # May 2026
    print("Seeding May 2026 transactions...")
    may_txns = generate_monthly_transactions(2026, 5, user_id)
    for t in may_txns:
        db.transactions.insert_one({
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": t["amount"],
            "raw_merchant_string": t["merchant"],
            "mapped_merchant_name": t["merchant"],
            "category": t["category"],
            "source": "android_sync",
            "is_mapped": True,
            "direction": t["dir"],
            "created_at": datetime.datetime(2026, 5, t["day"], t["hour"], 0, 0)
        })
    # Add historical travel/books in May
    db.transactions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": 280000,
        "raw_merchant_string": "IRCTC - Train Ticket",
        "mapped_merchant_name": "IRCTC - Train Ticket",
        "category": "travel",
        "source": "android_sync",
        "is_mapped": True,
        "direction": "debit",
        "created_at": datetime.datetime(2026, 5, 15, 15, 30, 0)
    })
    db.transactions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": 120000,
        "raw_merchant_string": "Campus Book House",
        "mapped_merchant_name": "Campus Book House",
        "category": "other",
        "source": "android_sync",
        "is_mapped": True,
        "direction": "debit",
        "created_at": datetime.datetime(2026, 5, 18, 11, 0, 0)
    })
        
    # June 2026
    print("Seeding June 2026 transactions...")
    june_txns = generate_monthly_transactions(2026, 6, user_id)
    for t in june_txns:
        db.transactions.insert_one({
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": t["amount"],
            "raw_merchant_string": t["merchant"],
            "mapped_merchant_name": t["merchant"],
            "category": t["category"],
            "source": "android_sync",
            "is_mapped": True,
            "direction": t["dir"],
            "created_at": datetime.datetime(2026, 6, t["day"], t["hour"], 0, 0)
        })
    # Add historical travel/books in June
    db.transactions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": 280000,
        "raw_merchant_string": "IRCTC - Train Ticket",
        "mapped_merchant_name": "IRCTC - Train Ticket",
        "category": "travel",
        "source": "android_sync",
        "is_mapped": True,
        "direction": "debit",
        "created_at": datetime.datetime(2026, 6, 15, 15, 30, 0)
    })
    db.transactions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": 120000,
        "raw_merchant_string": "Campus Book House",
        "mapped_merchant_name": "Campus Book House",
        "category": "other",
        "source": "android_sync",
        "is_mapped": True,
        "direction": "debit",
        "created_at": datetime.datetime(2026, 6, 18, 11, 0, 0)
    })

    # July 2026 (current month up to July 6)
    print("Seeding July 2026 transactions...")
    july_txns = generate_monthly_transactions(2026, 7, user_id, max_day=6)
    for t in july_txns:
        db.transactions.insert_one({
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": t["amount"],
            "raw_merchant_string": t["merchant"],
            "mapped_merchant_name": t["merchant"],
            "category": t["category"],
            "source": "manual" if t["day"] == 6 else "android_sync",
            "is_mapped": True,
            "direction": t["dir"],
            "created_at": datetime.datetime(2026, 7, t["day"], t["hour"], 0, 0)
        })

    # Seed travel/textbook triggers for July to create the shortfall
    db.transactions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": 280000,
        "raw_merchant_string": "IRCTC - Train Ticket",
        "mapped_merchant_name": "IRCTC - Train Ticket",
        "category": "travel",
        "source": "android_sync",
        "is_mapped": True,
        "direction": "debit",
        "created_at": datetime.datetime(2026, 7, 4, 15, 30, 0)
    })
    db.transactions.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": 120000,
        "raw_merchant_string": "Campus Book House",
        "mapped_merchant_name": "Campus Book House",
        "category": "other",
        "source": "android_sync",
        "is_mapped": True,
        "direction": "debit",
        "created_at": datetime.datetime(2026, 7, 5, 11, 0, 0)
    })

    # Seed 4 late-night study canteens in the last 7 days (July 2, 3, 4, 5 at 1:30 AM)
    # This triggers the sleep deprivation penalty (-20 points)
    late_night_days = [2, 3, 4, 5]
    for idx, day in enumerate(late_night_days):
        db.transactions.insert_one({
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": 4500 + (idx * 1500), # Rs 45, 60, 75, 90
            "raw_merchant_string": "BH-2 Night Canteen",
            "mapped_merchant_name": "BH-2 Night Canteen",
            "category": "food",
            "source": "android_sync",
            "is_mapped": True,
            "direction": "debit",
            "created_at": datetime.datetime(2026, 7, day, 1, 30, 0) # 1:30 AM
        })

    # 5. Seed Travel Routes & Reports
    route_id_1 = "itm_central_custom"
    db.travel_routes.replace_one(
        {"_id": route_id_1},
        {
            "_id": route_id_1,
            "college": "IIT Madras",
            "name": "IIT Madras ➔ Chennai Central Railway Station",
            "description": "Direct cab/auto route to the railway station.",
            "cheapest_route_combo": "Use Uber Auto or local auto sharing near gate.",
            "negotiation_helper": "Bhaiya, normal rate is Rs 180-220 for sharing. Central chal lo.",
            "safety_score_day": "High Safety",
            "safety_score_night": "Stick to app cabs (Uber/Ola/InDrive) after 10 PM.",
            "scam_warnings": "Do not pay flat rates inside the station gate; use the prepaid stand.",
            "campus_landmark": "Main Gate",
            "source": "user_added",
            "confidence": "high",
            "distance_km": 15.2,
            "modes": [
                {"mode": "auto", "median_fare": 200, "confidence": "high"},
                {"mode": "cab", "median_fare": 420, "confidence": "high"}
            ]
        },
        upsert=True
    )

    # Historical travel reports
    db.travel_reports.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "route_id": route_id_1,
            "mode": "auto",
            "amount_paid": 220,
            "time_of_day": "evening",
            "luggage": "none",
            "driver_quote": 300,
            "final_amount": 220,
            "anonymous": False,
            "created_at": datetime.datetime(2026, 5, 15)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "route_id": route_id_1,
            "mode": "cab",
            "amount_paid": 450,
            "time_of_day": "night",
            "luggage": "medium",
            "driver_quote": 600,
            "final_amount": 450,
            "anonymous": False,
            "created_at": datetime.datetime(2026, 6, 26)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "route_id": route_id_1,
            "mode": "auto",
            "amount_paid": 200,
            "time_of_day": "morning",
            "luggage": "none",
            "driver_quote": 250,
            "final_amount": 200,
            "anonymous": False,
            "created_at": datetime.datetime(2026, 7, 4)
        }
    ])

    # 6. Create Travel Savings History
    db.travel_savings.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "route_id": route_id_1,
            "amount_saved": 80.0,
            "created_at": datetime.datetime(2026, 5, 15)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "route_id": route_id_1,
            "amount_saved": 150.0,
            "created_at": datetime.datetime(2026, 6, 26)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "route_id": route_id_1,
            "amount_saved": 50.0,
            "created_at": datetime.datetime(2026, 7, 4)
        }
    ])

    # 7. Create Travel Pools
    db.travel_pools.insert_one({
        "_id": str(uuid.uuid4()),
        "route_id": route_id_1,
        "college": "IIT Madras",
        "departure_time": (now + datetime.timedelta(hours=6)).isoformat() + "Z",
        "mode": "auto",
        "max_passengers": 3,
        "description": "Splitting auto to Central Station. Meet at Main Gate. Heavy bags welcome.",
        "host_id": user_id,
        "host_name": full_name,
        "host_phone": "+919876543210",
        "co_passengers": [
            {"user_id": user_id, "full_name": full_name, "phone_number": "+919876543210"},
            {"user_id": "fake_user_1", "full_name": "Rahul Sharma (Room 305)", "phone_number": "+919999988888"}
        ],
        "created_at": now - datetime.timedelta(hours=2)
    })

    # =======================================================================
    # 8. Create Cart Pools (Seeding ALL lifecycle cases with realistic times)
    # =======================================================================
    
    # Case 1: Active Open Pool (Zomato)
    # Created 10 mins ago, expires in 20 mins (30 mins total time window)
    pool_id_1 = str(uuid.uuid4())
    db.cart_pools.insert_one({
        "_id": pool_id_1,
        "host_id": user_id,
        "created_by_name": full_name,
        "wing_label": "C-Wing",
        "platform": "zomato",
        "platform_display_label": "Zomato Wing Feast",
        "min_cart_value": 150000, 
        "delivery_fee": 4000, 
        "status": "open",
        "upi_id": "nishant@okaxis",
        "final_overhead": 0,
        "final_discount": 0,
        "payments": [
            {
                "name": "Rahul Sharma (Room 305)",
                "utr": "GPAY9830192301",
                "status": "submitted",
                "submitted_at": now - datetime.timedelta(minutes=5)
            }
        ],
        "expires_at": now + datetime.timedelta(minutes=20),
        "auto_nudge_enabled": True,
        "nudge_interval_hours": 1,
        "created_at": now - datetime.timedelta(minutes=10)
    })

    db.cart_pool_items.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_1,
            "added_by_name": full_name,
            "item_description": "Chicken Biryani Double",
            "estimated_price": 35000, 
            "product_url": "https://zomato.com/biryani-double",
            "is_purchased": True,
            "created_at": now - datetime.timedelta(minutes=9)
        },
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_1,
            "added_by_name": "Rahul Sharma (Room 305)",
            "item_description": "Paneer Tikka Roll",
            "estimated_price": 18000, 
            "product_url": "https://zomato.com/paneer-tikka-roll",
            "is_purchased": True,
            "created_at": now - datetime.timedelta(minutes=7)
        }
    ])

    # Case 2: Active Completed Pool with active splits (Zepto Snacks)
    # Completed 45 minutes ago
    pool_id_2 = str(uuid.uuid4())
    db.cart_pools.insert_one({
        "_id": pool_id_2,
        "host_id": user_id,
        "created_by_name": full_name,
        "wing_label": "C-Wing",
        "platform": "zepto",
        "platform_display_label": "Zepto Snacks Pool",
        "min_cart_value": 50000, 
        "delivery_fee": 3000, 
        "status": "completed",
        "upi_id": "nishant@okaxis",
        "final_overhead": 2000, 
        "final_discount": 1000, 
        "payments": [
            {
                "name": "Rahul Sharma (Room 305)",
                "utr": "ZEPTO99882201",
                "status": "submitted",
                "submitted_at": now - datetime.timedelta(minutes=20)
            }
        ],
        "expires_at": now - datetime.timedelta(minutes=45),
        "auto_nudge_enabled": True,
        "nudge_interval_hours": 1,
        "created_at": now - datetime.timedelta(hours=1, minutes=15)
    })

    db.cart_pool_items.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_2,
            "added_by_name": full_name,
            "item_description": "Milk & Bread Bundle",
            "estimated_price": 12000, 
            "product_url": "https://zepto.com/milk-bread",
            "is_purchased": True,
            "created_at": now - datetime.timedelta(hours=1, minutes=10)
        },
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_2,
            "added_by_name": "Rahul Sharma (Room 305)",
            "item_description": "Doritos Cheese Nachos",
            "estimated_price": 9000, 
            "product_url": "https://zepto.com/doritos",
            "is_purchased": True,
            "created_at": now - datetime.timedelta(hours=1, minutes=5)
        },
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_2,
            "added_by_name": "Rohan Gupta (Room 306)",
            "item_description": "Coca Cola 1.25L",
            "estimated_price": 9000, 
            "product_url": "https://zepto.com/coke",
            "is_purchased": True,
            "created_at": now - datetime.timedelta(hours=1)
        }
    ])

    # Case 3: Completed Fully Settled Pool (Instamart Fruit)
    # Settled yesterday
    pool_id_3 = str(uuid.uuid4())
    db.cart_pools.insert_one({
        "_id": pool_id_3,
        "host_id": user_id,
        "created_by_name": full_name,
        "wing_label": "C-Wing",
        "platform": "instamart",
        "platform_display_label": "Instamart Fruit Order",
        "min_cart_value": 50000,
        "delivery_fee": 2000,
        "status": "completed",
        "upi_id": "nishant@okaxis",
        "final_overhead": 0,
        "final_discount": 0,
        "payments": [
            {
                "name": "Rahul Sharma (Room 305)",
                "utr": "GPAY5555444321",
                "status": "verified", 
                "submitted_at": now - datetime.timedelta(days=1, hours=2)
            }
        ],
        "expires_at": now - datetime.timedelta(days=1),
        "created_at": now - datetime.timedelta(days=1, hours=4)
    })

    db.cart_pool_items.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_3,
            "added_by_name": full_name,
            "item_description": "Fresh Apples 1kg",
            "estimated_price": 15000, 
            "product_url": "https://swiggy.com/apples",
            "is_purchased": True,
            "created_at": now - datetime.timedelta(days=1, hours=3)
        },
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_3,
            "added_by_name": "Rahul Sharma (Room 305)",
            "item_description": "Cavendish Bananas 12pcs",
            "estimated_price": 8000, 
            "product_url": "https://swiggy.com/bananas",
            "is_purchased": True,
            "created_at": now - datetime.timedelta(days=1, hours=3)
        }
    ])

    # Case 4: Cancelled/Closed Pool (Swiggy Pizza)
    # Cancelled 2 days ago
    pool_id_4 = str(uuid.uuid4())
    db.cart_pools.insert_one({
        "_id": pool_id_4,
        "host_id": user_id,
        "created_by_name": full_name,
        "wing_label": "C-Wing",
        "platform": "swiggy",
        "platform_display_label": "Swiggy Pizza Party",
        "min_cart_value": 100000,
        "delivery_fee": 4000,
        "status": "cancelled", 
        "upi_id": "nishant@okaxis",
        "final_overhead": 0,
        "final_discount": 0,
        "payments": [],
        "expires_at": now - datetime.timedelta(days=2),
        "created_at": now - datetime.timedelta(days=2, hours=1)
    })

    db.cart_pool_items.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "pool_id": pool_id_4,
            "added_by_name": full_name,
            "item_description": "Farmhouse Pizza Medium",
            "estimated_price": 45000, 
            "product_url": "https://swiggy.com/pizza",
            "is_purchased": False, 
            "created_at": now - datetime.timedelta(days=2)
        }
    ])

    # 9. Create Companion Sync Logs
    db.companion_sync_log.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "device_name": "Pixel 7 Pro",
            "sync_trigger": "scheduled",
            "sms_count": 5,
            "processed_count": 3,
            "processing_status": "success",
            "created_at": datetime.datetime(2026, 5, 20, 10, 0, 0)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "device_name": "Pixel 7 Pro",
            "sync_trigger": "scheduled",
            "sms_count": 8,
            "processed_count": 5,
            "processing_status": "success",
            "created_at": datetime.datetime(2026, 6, 18, 15, 30, 0)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "device_name": "Pixel 7 Pro",
            "sync_trigger": "scheduled",
            "sms_count": 4,
            "processed_count": 2,
            "processing_status": "success",
            "created_at": now - datetime.timedelta(minutes=14)
        }
    ])

    # 10. Create Wellness Check-in Logs
    db.checkin_logs.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "response": "wellness_checkin",
            "wellness_score": 75,
            "gap_hours": 0,
            "food_gap_hours": 0,
            "suggestion_given": "all_good",
            "stress_note": "Felt good, spending in control during mid-May",
            "created_at": datetime.datetime(2026, 5, 15)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "response": "wellness_checkin",
            "wellness_score": 82,
            "gap_hours": 0,
            "food_gap_hours": 0,
            "suggestion_given": "all_good",
            "stress_note": "Great savings in June, runway expanded",
            "created_at": datetime.datetime(2026, 6, 20)
        },
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "response": "wellness_checkin",
            "wellness_score": 45,
            "gap_hours": 0,
            "food_gap_hours": 0,
            "suggestion_given": "review_commitments",
            "stress_note": "Runway is tight after train bookings and text book purchases.",
            "created_at": now - datetime.timedelta(days=1)
        }
    ])

    # 11. Seed Campus Metadata (IIT Madras Cache to prevent geocoding lookup failures)
    print("Seeding campus metadata for IIT Madras...")
    db.campus_metadata.replace_one(
        {"_id": "IIT Madras"},
        {
            "_id": "IIT Madras",
            "lat": 12.9915,
            "lon": 80.2336,
            "city": "Chennai",
            "state": "Tamil Nadu",
            "updated_at": now
        },
        upsert=True
    )

    # 12. Seed Campus Food (Pending crowdsourced items for verification testing)
    print("Seeding pending food items for crowdsourced verification...")
    food_review_threshold = compute_food_verification_threshold(
        "menu_scan_pending",
        active_reviewers=36,
    )
    db.campus_food.insert_many([
        {
            "_id": "seed_food_1",
            "campus": "IIT Madras",
            "venue_id": "bh2_night_canteen",
            "venue_name": "BH-2 Night Canteen",
            "item_name": "Cheese Masala Maggi",
            "category": "food",
            "price": 6000,
            "status": "pending_verification",
            "source": "ocr_menu_scan",
            "verification_votes": 3,
            "confirmation_count": 4,
            "dispute_count": 1,
            "verification_threshold": food_review_threshold,
            "scanned_by": "rahul_sharma",
            "submitted_by": "rahul_sharma",
            "voters": ["some_voter_1", "some_voter_2", "some_voter_3", "some_voter_4", "some_voter_5"],
            "needs_review": True,
            "available_from": "18:00",
            "available_until": "02:00",
            "created_at": now - datetime.timedelta(hours=5)
        },
        {
            "_id": "seed_food_2",
            "campus": "IIT Madras",
            "venue_id": "bh2_night_canteen",
            "venue_name": "BH-2 Night Canteen",
            "item_name": "Butter Paneer Maggi",
            "category": "food",
            "price": 8000,
            "status": "pending_verification",
            "source": "ocr_menu_scan",
            "verification_votes": 2,
            "confirmation_count": 2,
            "dispute_count": 0,
            "verification_threshold": food_review_threshold,
            "scanned_by": "rahul_sharma",
            "submitted_by": "rahul_sharma",
            "voters": ["some_voter_1", "some_voter_2"],
            "needs_review": True,
            "available_from": "18:00",
            "available_until": "02:00",
            "created_at": now - datetime.timedelta(hours=4)
        },
        {
            "_id": "seed_food_3",
            "campus": "IIT Madras",
            "venue_id": "gurunath_cafe",
            "venue_name": "Gurunath Cafe",
            "item_name": "Cold Coffee Combo",
            "category": "beverage",
            "price": 12000,
            "status": "disputed_hidden",
            "source": "ocr_menu_scan",
            "verification_votes": -3,
            "confirmation_count": 2,
            "dispute_count": 5,
            "verification_threshold": food_review_threshold,
            "scanned_by": "rahul_sharma",
            "submitted_by": "rahul_sharma",
            "voters": ["some_voter_1", "some_voter_2", "some_voter_3", "some_voter_4", "some_voter_5", "some_voter_6", "some_voter_7"],
            "needs_review": True,
            "available_from": "18:00",
            "available_until": "02:00",
            "created_at": now - datetime.timedelta(hours=3)
        }
    ])

    print(f"Data seeding completed successfully for {email}!")

if __name__ == "__main__":
    email = TARGET_EMAIL
    password = TARGET_PASSWORD
    name = TARGET_NAME
    
    if len(sys.argv) > 1:
        email = sys.argv[1]
    if len(sys.argv) > 2:
        password = sys.argv[2]
    if len(sys.argv) > 3:
        name = sys.argv[3]
        
    seed_data(email, password, name)
