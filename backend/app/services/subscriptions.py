import datetime
import re
import uuid
import statistics
from typing import Any, Optional, List, Dict

KNOWN_SUBSCRIPTIONS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("spotify",), "Spotify"),
    (("netflix",), "Netflix"),
    (("youtube", "yt premium"), "YouTube Premium"),
    (("prime", "amazon prime"), "Amazon Prime"),
    (("hotstar",), "Disney+ Hotstar"),
    (("zee5",), "Zee5"),
    (("sonyliv",), "SonyLIV"),
    (("jiofiber", "jio fiber"), "JioFiber"),
    (("airtel",), "Airtel Thanks"),
    (("vi postpaid", "vodafone idea"), "Vi Postpaid"),
    (("xbox",), "Xbox Game Pass"),
    (("playstation",), "PlayStation Plus"),
    (("nintendo",), "Nintendo Switch Online"),
    (("steam",), "Steam"),
    (("adobe",), "Adobe Creative Cloud"),
    (("canva",), "Canva Pro"),
    (("chatgpt", "openai"), "ChatGPT Plus"),
    (("midjourney",), "Midjourney"),
    (("github copilot", "copilot"), "GitHub Copilot"),
    (("icloud",), "Apple iCloud"),
    (("googleone", "google one"), "Google One"),
    (("notion",), "Notion"),
    (("duolingo",), "Duolingo Plus"),
    (("swiggy one",), "Swiggy One"),
    (("zomato gold",), "Zomato Gold"),
    (("zepto pass",), "Zepto Pass"),
    (("blinkit club",), "Blinkit Club"),
)

CADENCE_BUCKETS = [
    ("weekly", 7, range(5, 10)),
    ("biweekly", 14, range(12, 17)),
    ("cycle_28", 28, range(27, 30)),
    ("monthly", 30, range(25, 36)),
    ("quarterly", 90, range(80, 101)),
    ("semester", 180, range(150, 211)),
    ("annual", 365, range(330, 396)),
]

GOOD_KEYWORDS = ["autopay", "mandate", "renewal", "subscription", "plan", "validity", "premium", "pre-debit", "bill"]
BAD_KEYWORDS = [
    "canteen", "cafeteria", "dhaba", "mess", "caterer", "dining", "tapri", "chai",
    "zomato", "swiggy", "ubereats", "eatclub", "box8",
    "blinkit", "zepto", "bigbasket", "jiomart", "groceries", "grocery", "kirana",
    "uber", "ola", "auto", "taxi", "metro", "irctc", "rail", "travel",
    "transfer", "sent", "pay to"
]

def to_naive_utc(dt: datetime.datetime) -> datetime.datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return dt

def parse_to_naive_utc(date_str: str) -> datetime.datetime:
    clean_str = date_str.replace("Z", "+00:00")
    if len(clean_str) == 10:
        clean_str += "T00:00:00+00:00"
    return to_naive_utc(datetime.datetime.fromisoformat(clean_str))

def coerce_datetime(value: Any) -> Optional[datetime.datetime]:
    if isinstance(value, datetime.datetime):
        return to_naive_utc(value)
    if isinstance(value, str) and value:
        try:
            return parse_to_naive_utc(value)
        except ValueError:
            return None
    return None

def clean_merchant_name(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" .,-:_")
    return cleaned[:120] if cleaned else None

def canonical_merchant(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()

def compact_merchant(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())

def is_bad_merchant(merchant_name: str) -> bool:
    name_lower = merchant_name.lower()
    # Exempt club/pass/one members
    if any(p in name_lower for p in ["pass", "club", "one"]):
        return False
    return any(word in name_lower for word in BAD_KEYWORDS)

def subscription_name_for_merchant(merchant: Optional[str]) -> Optional[str]:
    cleaned = clean_merchant_name(merchant)
    if not cleaned:
        return None
    canonical = canonical_merchant(cleaned)
    compact = compact_merchant(cleaned)
    for keywords, display_name in KNOWN_SUBSCRIPTIONS:
        for keyword in keywords:
            if canonical_merchant(keyword) in canonical or compact_merchant(keyword) in compact:
                return display_name
    return None

def service_name_from_transaction(txn: dict) -> Optional[str]:
    merchant = txn.get("mapped_merchant_name") or txn.get("raw_merchant_string")
    return clean_merchant_name(merchant)

def next_future_debit(observed_at: datetime.datetime, interval_days: int) -> datetime.datetime:
    interval_days = max(1, interval_days)
    next_debit = observed_at + datetime.timedelta(days=interval_days)
    now = datetime.datetime.utcnow()
    while next_debit <= now:
        next_debit += datetime.timedelta(days=interval_days)
    return to_naive_utc(next_debit)

def classify_cadence(gaps: List[int]) -> tuple[str, int]:
    if not gaps:
        return "monthly", 30
    median_gap = int(statistics.median(gaps))
    for name, standard_days, range_vals in CADENCE_BUCKETS:
        if median_gap in range_vals:
            return name, standard_days
    return "custom", median_gap

async def upsert_subscription(
    db,
    *,
    user_id: str,
    service_name: str,
    amount_paise: int,
    next_debit_date: datetime.datetime,
    detected_from: str,
    observed_at: Optional[datetime.datetime] = None,
    observed_interval_days: Optional[int] = None,
    status: str = "confirmed",
    confidence: float = 100.0,
    evidence: Optional[List[str]] = None,
    occurrences_count: int = 1,
) -> dict:
    normalized_name = clean_merchant_name(service_name)
    if not normalized_name:
        raise ValueError("service_name is required")

    name_regex = re.compile(f"^{re.escape(normalized_name)}$", re.IGNORECASE)
    existing = await db.subscriptions.find_one(
        {
            "user_id": user_id,
            "$or": [{"service_name": name_regex}, {"name": name_regex}],
        }
    )

    now = datetime.datetime.utcnow()
    
    # Map observed interval to cadence label
    billing_cycle = "monthly"
    if observed_interval_days:
        billing_cycle, _ = classify_cadence([observed_interval_days])

    # If manual creation or known service, override confidence/status
    if detected_from in ("manual", "auto_detected"):
        status = "confirmed"
        confidence = 100.0
        evidence = evidence or ["Manually added by user" if detected_from == "manual" else "Recognized subscription service"]

    evidence = evidence or ["Recurring payment pattern detected"]

    update = {
        "name": normalized_name,
        "service_name": normalized_name,
        "amount": amount_paise,
        "billing_cycle": billing_cycle,
        "next_debit_date": to_naive_utc(next_debit_date),
        "status": status,
        "confidence": confidence,
        "evidence": evidence,
        "occurrences_count": occurrences_count,
        "updated_at": now,
    }
    if observed_at:
        update["last_observed_at"] = to_naive_utc(observed_at)
    if observed_interval_days:
        update["observed_interval_days"] = observed_interval_days

    # Respect user exclusions or toggled status
    if existing:
        # Don't auto-activate if the user has ignored/cancelled or turned it off
        if existing.get("status") in ("ignored", "cancelled") and status == "possible":
            # Keep their current status
            update["status"] = existing["status"]
            update["is_active"] = existing.get("is_active", False)
        
        await db.subscriptions.update_one({"_id": existing["_id"]}, {"$set": update})
        updated = await db.subscriptions.find_one({"_id": existing["_id"]})
        return updated

    new_sub = {
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        **update,
        "is_active": status in ("confirmed", "active", "possible"),
        "detected_from": detected_from,
        "created_at": now,
    }
    await db.subscriptions.insert_one(new_sub)
    return new_sub

async def upsert_subscription_for_transaction(
    db,
    *,
    user_id: str,
    merchant: Optional[str],
    amount_paise: int,
    observed_at: datetime.datetime,
    detected_from: str = "auto_detected",
) -> Optional[dict]:
    service_name = subscription_name_for_merchant(merchant)
    if not service_name:
        return None

    return await upsert_subscription(
        db,
        user_id=user_id,
        service_name=service_name,
        amount_paise=amount_paise,
        next_debit_date=next_future_debit(to_naive_utc(observed_at), 30),
        detected_from=detected_from,
        observed_at=observed_at,
        observed_interval_days=30,
        status="confirmed",
        confidence=100.0,
        evidence=["Recognized brand subscription service"],
    )

async def detect_recurring_subscriptions(db, user_id: str) -> list[dict]:
    # Fetch user transactions (past 120 days)
    txns_cursor = db.transactions.find({"user_id": user_id}).sort("created_at", -1)
    txns = await txns_cursor.to_list(length=500)

    # Load existing subscriptions to preserve user status overrides
    existing_subs = await db.subscriptions.find({"user_id": user_id}).to_list(length=300)
    existing_map = {canonical_merchant(s.get("service_name") or ""): s for s in existing_subs}

    # Group transactions by canonical merchant name
    groups: dict[str, list[dict]] = {}
    for txn in txns:
        amount = txn.get("amount")
        if not isinstance(amount, int) or amount <= 0:
            continue

        direction = (txn.get("direction") or "debit").lower()
        if direction != "debit":
            continue

        service_name = service_name_from_transaction(txn)
        if not service_name:
            continue

        key = canonical_merchant(service_name)
        groups.setdefault(key, []).append(txn)

    detected: list[dict] = []
    now_utc = datetime.datetime.utcnow()

    # Community verification lookup helper
    async def get_community_user_count(merchant_name: str, amount: int) -> int:
        canonical_name = canonical_merchant(merchant_name)
        candidate = await db.candidate_subscriptions.find_one(
            {"canonical_name": canonical_name, "amount": amount}
        )
        if candidate:
            return len(candidate.get("distinct_users", []))
        return 0

    for m_canonical, txns_for_key in groups.items():
        # Sort oldest first to compute chronological intervals
        txns_for_key.sort(key=lambda t: coerce_datetime(t.get("created_at")) or datetime.datetime.min)
        
        dated_txns = [
            (coerce_datetime(t.get("created_at")), t)
            for t in txns_for_key
        ]
        dated_txns = [(dt, t) for dt, t in dated_txns if dt is not None]
        if len(dated_txns) < 2:
            continue

        # Extract gaps between occurrences
        gaps = []
        amounts = []
        for i in range(len(dated_txns) - 1):
            first_dt, _ = dated_txns[i]
            second_dt, _ = dated_txns[i + 1]
            gaps.append((second_dt - first_dt).days)
            
        for _, t in dated_txns:
            amounts.append(t["amount"])

        # Check if the median gap matches any defined cadence cycle
        cadence_label, standard_days = classify_cadence(gaps)
        median_gap = int(statistics.median(gaps))
        
        # Verify if interval matches cadence ranges (5 to 395 days)
        if not (5 <= median_gap <= 395):
            continue

        latest_dt, latest_txn = dated_txns[-1]
        observed_name = service_name_from_transaction(latest_txn)
        if not observed_name:
            continue

        # Check if this merchant is classified as generic "habitual" spending
        bad_merchant = is_bad_merchant(observed_name)
        
        # Confidence Score calculation:
        confidence = 60.0 if len(dated_txns) >= 3 else 40.0
        evidence = [f"Seen {len(dated_txns)} times with a recurring {cadence_label} cadence"]

        # 1. Known brand name lookup
        known_name = subscription_name_for_merchant(observed_name)
        if known_name:
            confidence += 35.0
            evidence.append("Matches known premium subscription brand")
        
        # 2. Key indicator words match
        matched_words = []
        for txn_item in txns_for_key:
            desc = (txn_item.get("category", "") + " " + txn_item.get("description", "") + " " + txn_item.get("raw_merchant_string", "")).lower()
            for kw in GOOD_KEYWORDS:
                if kw in desc and kw not in matched_words:
                    matched_words.append(kw)
        if matched_words:
            confidence += 25.0
            evidence.append(f"Includes pre-authorization/debit triggers: {', '.join(matched_words)}")

        # 3. Stable billing amounts
        unique_amounts = len(set(amounts))
        if unique_amounts == 1:
            confidence += 20.0
            evidence.append(f"Amount is completely stable at {amounts[0]/100:.2f} Rs")
        elif unique_amounts <= 2:
            confidence += 10.0
            evidence.append("Amount shows slight variability")

        # 4. Community verification
        comm_users = await get_community_user_count(observed_name, latest_txn["amount"])
        # Update community collection asynchronously
        await db.candidate_subscriptions.update_one(
            {"canonical_name": m_canonical, "amount": latest_txn["amount"]},
            {
                "$set": {
                    "display_name": observed_name,
                    "last_seen_at": now_utc,
                    "observed_interval_days": standard_days,
                },
                "$addToSet": {"distinct_users": user_id},
                "$setOnInsert": {
                    "_id": str(uuid.uuid4()),
                    "created_at": now_utc,
                    "promoted": False,
                },
            },
            upsert=True,
        )
        if comm_users >= 3:
            confidence += 15.0
            evidence.append("Confirmed recurring commitment by other campus students")

        # 5. Penalize and suppress generic habitual canteens/travel/cabs
        if bad_merchant:
            confidence -= 70.0
            evidence.append("Identified as habitual/discretionary daily merchant category")

        # Bounds check
        confidence = min(100.0, max(0.0, confidence))

        # Check existing user preference
        existing_pref = existing_map.get(m_canonical)
        
        # Determine status lifecycle
        # If user already approved or if confidence >= 75
        if existing_pref and existing_pref.get("status") == "confirmed":
            status = "confirmed"
        elif confidence >= 75:
            status = "confirmed"
        else:
            status = "possible"

        # Suppress commitments with very low confidence
        if confidence < 40 and not (existing_pref and existing_pref.get("status") == "confirmed"):
            continue

        # Upsert detected commitment
        sub = await upsert_subscription(
            db,
            user_id=user_id,
            service_name=known_name or observed_name,
            amount_paise=latest_txn["amount"],
            next_debit_date=next_future_debit(latest_dt, standard_days),
            detected_from="community_pattern" if comm_users >= 3 else "recurring_pattern",
            observed_at=latest_dt,
            observed_interval_days=standard_days,
            status=status,
            confidence=confidence,
            evidence=evidence,
            occurrences_count=len(dated_txns),
        )
        detected.append(sub)

    # Missed renewal & cancellation lifecycle pass
    all_subs = await db.subscriptions.find({"user_id": user_id}).to_list(length=300)
    for sub in all_subs:
        if sub.get("status") not in ("confirmed", "active", "possible") or not sub.get("is_active", True):
            continue

        next_debit = sub.get("next_debit_date")
        if not next_debit:
            continue

        interval_days = sub.get("observed_interval_days") or 30
        grace_date = next_debit + datetime.timedelta(days=5)
        skipped_cycle_date = next_debit + datetime.timedelta(days=interval_days)

        if now_utc > grace_date:
            # Check if a transaction matching this subscription occurred since next_debit - 3 days
            sub_canonical = canonical_merchant(sub.get("service_name") or "")
            matching_txn = await db.transactions.find_one({
                "user_id": user_id,
                "created_at": {"$gte": next_debit - datetime.timedelta(days=3)},
                "direction": "debit",
                "$or": [
                    {"mapped_merchant_name": re.compile(f"^{re.escape(sub['service_name'])}$", re.IGNORECASE)},
                    {"raw_merchant_string": re.compile(f"^{re.escape(sub['service_name'])}$", re.IGNORECASE)}
                ]
            })

            if not matching_txn:
                if now_utc > skipped_cycle_date:
                    # Skipped a full cycle -> auto-cancel tracking
                    await db.subscriptions.update_one(
                        {"_id": sub["_id"]},
                        {"$set": {"status": "cancelled", "is_active": False, "updated_at": now_utc}}
                    )
                else:
                    # Beyond 5-day grace -> mark missed
                    await db.subscriptions.update_one(
                        {"_id": sub["_id"]},
                        {"$set": {"status": "missed", "updated_at": now_utc}}
                    )

    # Reload all subscriptions for returned list
    updated_subs = await db.subscriptions.find({"user_id": user_id}).to_list(length=300)
    return updated_subs
