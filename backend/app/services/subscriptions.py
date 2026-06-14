import datetime
import re
import uuid
from typing import Any, Optional


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
    update = {
        "name": normalized_name,
        "service_name": normalized_name,
        "amount": amount_paise,
        "billing_cycle": "monthly",
        "next_debit_date": to_naive_utc(next_debit_date),
        "updated_at": now,
    }
    if observed_at:
        update["last_observed_at"] = to_naive_utc(observed_at)
    if observed_interval_days:
        update["observed_interval_days"] = observed_interval_days

    if existing:
        await db.subscriptions.update_one({"_id": existing["_id"]}, {"$set": update})
        updated = await db.subscriptions.find_one({"_id": existing["_id"]})
        return updated

    new_sub = {
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        **update,
        "is_active": True,
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
    )


async def detect_recurring_subscriptions(db, user_id: str) -> list[dict]:
    txns_cursor = db.transactions.find({"user_id": user_id}).sort("created_at", -1)
    txns = await txns_cursor.to_list(length=300)

    groups: dict[tuple[str, int], list[dict]] = {}
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

        key = (canonical_merchant(service_name), amount)
        groups.setdefault(key, []).append(txn)

    detected: list[dict] = []
    for txns_for_key in groups.values():
        dated = [
            (coerce_datetime(txn.get("created_at")), txn)
            for txn in txns_for_key
        ]
        dated = [(dt, txn) for dt, txn in dated if dt is not None]
        if len(dated) < 2:
            continue

        dated.sort(key=lambda pair: pair[0])
        for index in range(len(dated) - 1):
            first_dt, _ = dated[index]
            second_dt, second_txn = dated[index + 1]
            gap_days = (second_dt - first_dt).days
            if 25 <= gap_days <= 35:
                observed_name = service_name_from_transaction(second_txn)
                known_name = subscription_name_for_merchant(observed_name)

                if known_name:
                    # Known subscription — upsert directly (existing behavior)
                    detected.append(
                        await upsert_subscription(
                            db,
                            user_id=user_id,
                            service_name=known_name,
                            amount_paise=second_txn["amount"],
                            next_debit_date=next_future_debit(second_dt, gap_days),
                            detected_from="recurring_pattern",
                            observed_at=second_dt,
                            observed_interval_days=gap_days,
                        )
                    )
                elif observed_name:
                    # --- Dynamic Subscription Detection ---
                    # Unknown merchant with recurring interval → flag as candidate
                    candidate = await _flag_candidate_subscription(
                        db,
                        user_id=user_id,
                        merchant_name=observed_name,
                        amount_paise=second_txn["amount"],
                        gap_days=gap_days,
                        observed_at=second_dt,
                    )
                    if candidate:
                        detected.append(candidate)
                break

    return detected


async def _flag_candidate_subscription(
    db,
    *,
    user_id: str,
    merchant_name: str,
    amount_paise: int,
    gap_days: int,
    observed_at: datetime.datetime,
) -> Optional[dict]:
    """
    Track unknown merchants that show recurring billing patterns.

    When a candidate merchant matches across 3+ distinct users, auto-promote
    it to a real subscription for those users.
    """
    canonical_name = canonical_merchant(merchant_name)
    now = datetime.datetime.utcnow()

    # Upsert the candidate entry and add user to the distinct user set
    await db.candidate_subscriptions.update_one(
        {"canonical_name": canonical_name, "amount": amount_paise},
        {
            "$set": {
                "display_name": clean_merchant_name(merchant_name),
                "last_seen_at": now,
                "observed_interval_days": gap_days,
            },
            "$addToSet": {"distinct_users": user_id},
            "$setOnInsert": {
                "_id": str(uuid.uuid4()),
                "created_at": now,
                "promoted": False,
            },
        },
        upsert=True,
    )

    # Check if cross-user threshold is met (3+ distinct users)
    candidate = await db.candidate_subscriptions.find_one(
        {"canonical_name": canonical_name, "amount": amount_paise}
    )
    if not candidate:
        return None

    distinct_count = len(candidate.get("distinct_users", []))
    if distinct_count >= 3 and not candidate.get("promoted"):
        # Auto-promote: create a real subscription for this user
        await db.candidate_subscriptions.update_one(
            {"_id": candidate["_id"]},
            {"$set": {"promoted": True, "promoted_at": now}},
        )
        return await upsert_subscription(
            db,
            user_id=user_id,
            service_name=candidate["display_name"] or merchant_name,
            amount_paise=amount_paise,
            next_debit_date=next_future_debit(observed_at, gap_days),
            detected_from="community_pattern",
            observed_at=observed_at,
            observed_interval_days=gap_days,
        )

    # Also create for this individual user since they have recurring pattern
    return await upsert_subscription(
        db,
        user_id=user_id,
        service_name=merchant_name,
        amount_paise=amount_paise,
        next_debit_date=next_future_debit(observed_at, gap_days),
        detected_from="candidate_recurring",
        observed_at=observed_at,
        observed_interval_days=gap_days,
    )

