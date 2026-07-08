import datetime
import re
import uuid
import statistics
from typing import Any, Optional, List, Dict

KNOWN_SUBSCRIPTIONS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("spotify",), "Spotify"),
    (("netflix",), "Netflix"),
    (("youtube", "yt premium"), "YouTube Premium"),
    (("amazon prime", "prime video", "prime membership"), "Amazon Prime"),
    (("hotstar",), "Disney+ Hotstar"),
    (("zee5",), "Zee5"),
    (("sonyliv",), "SonyLIV"),
    (("jiofiber", "jio fiber"), "JioFiber"),
    (("airtel thanks", "airtel postpaid", "airtel xstream", "airtel broadband", "airtel fiber"), "Airtel Thanks"),
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
    "canteen", "cafeteria", "cafe", "coffee", "dhaba", "mess", "caterer", "dining", "tapri", "chai", "snack", "restaurant",
    "zomato", "swiggy", "ubereats", "eatclub", "box8",
    "blinkit", "zepto", "bigbasket", "jiomart", "groceries", "grocery", "kirana",
    "uber", "ola", "auto", "taxi", "metro", "irctc", "rail", "travel",
    "transfer", "sent", "pay to"
]
FOOD_OR_LOCAL_MERCHANT_BLOCKERS = {
    "canteen", "cafeteria", "cafe", "coffee", "dhaba", "mess", "caterer",
    "dining", "tapri", "chai", "snack", "restaurant", "kirana", "grocery",
    "groceries", "campus", "hostel", "library", "stationery",
}
USER_EXCLUDED_STATUSES = {"ignored", "cancelled"}
USER_INTENT_DETECTED_FROM = {"manual", "manual_transaction"}

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

def amount_paise_from_doc(item: dict) -> int:
    for key in ("amount", "amount_paise"):
        amount = item.get(key, 0)
        if isinstance(amount, int) and not isinstance(amount, bool) and amount > 0:
            return amount
    return 0

def is_bad_merchant(merchant_name: str) -> bool:
    if subscription_name_for_merchant(merchant_name):
        return False
    canonical = canonical_merchant(merchant_name)
    tokens = set(canonical.split())
    if tokens & FOOD_OR_LOCAL_MERCHANT_BLOCKERS:
        return True
    return any(word in canonical for word in BAD_KEYWORDS)

def subscription_name_for_merchant(merchant: Optional[str]) -> Optional[str]:
    cleaned = clean_merchant_name(merchant)
    if not cleaned:
        return None
    canonical = canonical_merchant(cleaned)
    tokens = set(canonical.split())
    if tokens & FOOD_OR_LOCAL_MERCHANT_BLOCKERS:
        return None
    compact = compact_merchant(cleaned)
    for keywords, display_name in KNOWN_SUBSCRIPTIONS:
        for keyword in keywords:
            if canonical_merchant(keyword) in canonical or compact_merchant(keyword) in compact:
                return display_name
    return None

def same_subscription_identity(left: Optional[str], right: Optional[str]) -> bool:
    left_clean = clean_merchant_name(left)
    right_clean = clean_merchant_name(right)
    if not left_clean or not right_clean:
        return False
    if canonical_merchant(left_clean) == canonical_merchant(right_clean):
        return True
    left_known = subscription_name_for_merchant(left_clean)
    right_known = subscription_name_for_merchant(right_clean)
    return bool(left_known and right_known and canonical_merchant(left_known) == canonical_merchant(right_known))

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
    if not existing:
        user_subs = await db.subscriptions.find({"user_id": user_id}).to_list(length=300)
        existing = next(
            (
                sub
                for sub in user_subs
                if same_subscription_identity(sub.get("service_name") or sub.get("name"), normalized_name)
            ),
            None,
        )

    now = datetime.datetime.utcnow()

    # Map observed interval to cadence label
    billing_cycle = "monthly"
    if observed_interval_days:
        billing_cycle, _ = classify_cadence([observed_interval_days])

    # If the user explicitly adds or marks a transaction as a commitment,
    # treat that as stronger than old detection state.
    if detected_from in USER_INTENT_DETECTED_FROM:
        status = "confirmed"
        confidence = 100.0
        evidence = evidence or ["Manually added by user"]

    evidence = evidence or ["Recurring payment pattern detected"]

    update = {
        "name": normalized_name,
        "service_name": normalized_name,
        "amount": amount_paise,
        "amount_paise": amount_paise,
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
        # Detection must never undo a user's explicit ignore/cancel choice.
        # Manual add/confirm is an explicit user reversal and should reactivate.
        if detected_from in USER_INTENT_DETECTED_FROM:
            update["is_active"] = status in ("confirmed", "active", "possible")
        elif existing.get("status") in USER_EXCLUDED_STATUSES:
            update["status"] = existing["status"]
            update["is_active"] = existing.get("is_active", False)
        elif existing.get("status") in {"confirmed", "active", "missed"}:
            update["status"] = existing["status"]
            update["is_active"] = existing.get("is_active", True)

        await db.subscriptions.update_one({"_id": existing["_id"], "user_id": user_id}, {"$set": update})
        updated = await db.subscriptions.find_one({"_id": existing["_id"], "user_id": user_id})
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
        status="possible",
        confidence=60.0,
        evidence=["Known subscription brand seen once; waiting for repeat pattern or user confirmation"],
    )

async def detect_recurring_subscriptions(db, user_id: str) -> list[dict]:
    # Fetch user transactions (past 120 days)
    txns_cursor = db.transactions.find({"user_id": user_id}).sort("created_at", -1)
    txns = await txns_cursor.to_list(length=500)
    profile = await db.profiles.find_one({"_id": user_id}) or {}
    campus_key = canonical_merchant(
        str(profile.get("college_name") or profile.get("campus") or "unknown_campus")
    ) or "unknown_campus"

    # Load existing subscriptions to preserve user status overrides
    existing_subs = await db.subscriptions.find({"user_id": user_id}).to_list(length=300)
    existing_map = {canonical_merchant(s.get("service_name") or ""): s for s in existing_subs}

    # Group transactions by canonical merchant name
    groups: dict[str, list[dict]] = {}
    for txn in txns:
        amount = amount_paise_from_doc(txn)
        if amount <= 0:
            continue

        direction = (txn.get("direction") or "debit").lower()
        if direction != "debit":
            continue

        service_name = service_name_from_transaction(txn)
        if not service_name:
            continue

        key = canonical_merchant(service_name)
        normalized_txn = {**txn, "amount": amount}
        groups.setdefault(key, []).append(normalized_txn)

    detected: list[dict] = []
    now_utc = datetime.datetime.utcnow()

    # Community verification lookup helper
    async def get_community_user_count(merchant_name: str, amount: int) -> int:
        canonical_name = canonical_merchant(merchant_name)
        candidate = await db.candidate_subscriptions.find_one(
            {"canonical_name": canonical_name, "amount": amount, "campus_key": campus_key}
        )
        if candidate:
            return len([candidate_user for candidate_user in candidate.get("distinct_users", []) if candidate_user != user_id])
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

        # 4. Community verification. Only subscription-like merchants should
        # participate in the shared campus candidate pool; habitual food/travel
        # merchants would otherwise pollute the crowd signal.
        comm_users = 0
        if not bad_merchant:
            comm_users = await get_community_user_count(observed_name, latest_txn["amount"])
            await db.candidate_subscriptions.update_one(
                {"canonical_name": m_canonical, "amount": latest_txn["amount"], "campus_key": campus_key},
                {
                    "$set": {
                        "display_name": observed_name,
                        "campus_key": campus_key,
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
                confidence += 10.0
                evidence.append("Similar recurring pattern seen from other students on this campus")

        # 5. Penalize and suppress generic habitual canteens/travel/cabs
        if bad_merchant:
            confidence -= 70.0
            evidence.append("Identified as habitual/discretionary daily merchant category")

        # Bounds check
        confidence = min(100.0, max(0.0, confidence))

        # Check existing user preference
        existing_pref = existing_map.get(m_canonical)

        has_subscription_signal = bool(known_name or matched_words)
        if existing_pref and existing_pref.get("status") == "confirmed":
            status = "confirmed"
        elif existing_pref and existing_pref.get("status") in USER_EXCLUDED_STATUSES:
            status = existing_pref["status"]
        elif has_subscription_signal and confidence >= 75 and not bad_merchant:
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

    # Reload all subscriptions for returned list. Detection may add review
    # candidates, but it must not cancel or deactivate commitments on a GET.
    updated_subs = await db.subscriptions.find({"user_id": user_id}).to_list(length=300)
    return updated_subs
