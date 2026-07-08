import json
import logging
import datetime
import math
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
LOCAL_CAMPUS_FOOD_PATH = REPO_ROOT / "data" / "campus_food.json"
REVIEW_ONLY_STATUSES = {
    "pending_verification",
    "rejected",
    "merged_into_active",
    "needs_review",
    "disputed_hidden",
}


def compute_food_verification_threshold(source_type: str, active_reviewers: int = 0) -> int:
    """
    Return the independent confirmations needed before a crowd item affects recommendations.

    A tiny fixed-vote model is too weak for campus-scale data. This uses a cold-start floor
    and then grows sub-linearly with the number of active campus reviewers, similar in
    spirit to reputation systems where more active communities require stronger consensus.
    """
    source = str(source_type or "").strip().lower()
    try:
        reviewer_count = max(0, int(active_reviewers or 0))
    except (TypeError, ValueError):
        reviewer_count = 0

    if source in {"partner_verified", "trusted_direct_edit", "curated_baseline"}:
        return 1

    base = max(5, min(25, math.ceil(1.5 * math.sqrt(max(reviewer_count, 10)))))

    if source in {"price_change_review", "manual_correction", "receipt_price_spike_review", "price_spike_quiz"}:
        return min(40, max(base + 2, math.ceil(base * 1.5)))
    if source in {"external_snapshot", "google_places_snapshot", "swiggy_snapshot", "zomato_snapshot", "apify_snapshot"}:
        return min(30, max(base, math.ceil(base * 1.2)))
    return base


def food_effective_verification_threshold(
    item: dict[str, Any],
    source_type: str | None = None,
    active_reviewers: int = 0,
) -> int:
    """
    Return the threshold an item should use today.

    Older review rows were created with a fixed threshold of 3. Keep trusted/curated
    records cheap to publish, but never let legacy crowd rows keep that tiny threshold.
    """
    source = str(source_type or item.get("source_type") or item.get("source") or "").strip().lower()
    computed = compute_food_verification_threshold(source, active_reviewers=active_reviewers)

    try:
        stored = int(item.get("verification_threshold") or 0)
    except (TypeError, ValueError):
        stored = 0

    if computed <= 1:
        return max(1, stored or computed)
    return max(computed, stored)


def food_confirmation_count(item: dict[str, Any]) -> int:
    """Positive independent confirmations, with backwards compatibility for old vote docs."""
    if item.get("confirmation_count") is not None:
        try:
            return max(0, int(item.get("confirmation_count") or 0))
        except (TypeError, ValueError):
            return 0
    try:
        return max(0, int(item.get("verification_votes") or 0))
    except (TypeError, ValueError):
        return 0


def food_dispute_count(item: dict[str, Any]) -> int:
    """Negative independent reports, with backwards compatibility for old net-vote docs."""
    if item.get("dispute_count") is not None:
        try:
            return max(0, int(item.get("dispute_count") or 0))
        except (TypeError, ValueError):
            return 0
    try:
        votes = int(item.get("verification_votes") or 0)
    except (TypeError, ValueError):
        return 0
    return abs(min(0, votes))


def food_net_vote_score(item: dict[str, Any]) -> int:
    return food_confirmation_count(item) - food_dispute_count(item)


def food_dispute_hide_threshold(verification_threshold: int) -> int:
    return max(3, math.ceil(max(1, verification_threshold) * 0.5))


def _read_s3_json() -> Any | None:
    if not settings.CAMPUS_FOOD_S3_BUCKET:
        return None

    try:
        import boto3

        client = boto3.client("s3", region_name=settings.AWS_REGION)
        response = client.get_object(
            Bucket=settings.CAMPUS_FOOD_S3_BUCKET,
            Key=settings.CAMPUS_FOOD_S3_KEY,
        )
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception as exc:
        logger.warning("Could not load campus food from S3; using local fallback: %s", exc)
        return None


def _read_local_json() -> Any:
    try:
        with LOCAL_CAMPUS_FOOD_PATH.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        logger.warning("Campus food file not found at %s", LOCAL_CAMPUS_FOOD_PATH)
        return []
    except json.JSONDecodeError as exc:
        logger.warning("Campus food file is invalid JSON: %s", exc)
        return []


def _normalize_flat_items(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return []

    campus = data.get("college") or data.get("campus") or "ABV-IIITM Gwalior"
    normalized: list[dict[str, Any]] = []

    for canteen in data.get("canteens", []):
        if not isinstance(canteen, dict):
            continue
        venue_id = canteen.get("id") or canteen.get("name")
        venue_name = canteen.get("name") or str(venue_id)
        available_from, available_until = _split_hours(canteen.get("operating_hours"))
        for item in canteen.get("items", []):
            if not isinstance(item, dict):
                continue
            item_name = item.get("item_name") or item.get("name")
            if not item_name:
                continue
            price = item.get("price", 0)
            normalized.append(
                {
                    "id": f"{venue_id}_{str(item_name).lower().replace(' ', '_')}",
                    "campus": campus,
                    "venue_id": venue_id,
                    "venue_name": venue_name,
                    "item_name": item_name,
                    "category": item.get("category", "food"),
                    "price": _price_to_paise(price),
                    "available_from": available_from,
                    "available_until": available_until,
                }
            )

    return normalized


def _split_hours(value: Any) -> tuple[str, str]:
    if not isinstance(value, str) or "-" not in value:
        return "08:00", "22:00"
    start, end = value.split("-", 1)
    return start.strip(), end.strip()


def _price_to_paise(value: Any) -> int:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return 0
    if price < 1000:
        return int(round(price * 100))
    return int(round(price))


def build_price_matched_food_options(
    menu_items: list[dict[str, Any]],
    amount_paise: int,
    max_options: int = 4,
) -> list[str]:
    """
    Suggest likely food labels for a repeated payment amount using trusted menu data.

    This intentionally avoids amount-bucket guesses such as "Rs. 10 means chai".
    If the campus menu has no nearby trusted price evidence, return no options and
    let the product ask for a manual correction instead of inventing public data.
    """
    try:
        amount = int(amount_paise or 0)
    except (TypeError, ValueError):
        return []
    if amount <= 0:
        return []

    tolerance = max(300, min(2000, int(amount * 0.25)))
    ranked: list[tuple[int, int, str]] = []
    seen: set[str] = set()

    for item in menu_items:
        if str(item.get("status") or "active").lower() != "active":
            continue
        name = str(item.get("item_name") or "").strip()
        if not name:
            continue
        try:
            price = int(item.get("price") or 0)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue

        distance = abs(price - amount)
        if distance > tolerance:
            continue

        normalized = name.casefold()
        if normalized in seen:
            continue
        seen.add(normalized)
        ranked.append((distance, price, name))

    ranked.sort(key=lambda row: (row[0], row[1], row[2].casefold()))
    return [name for _, _, name in ranked[: max(1, min(max_options, 8))]]


def _format_seen_label(seen_at: datetime.datetime | None, now: datetime.datetime) -> str:
    if not seen_at:
        return "baseline"
    seen_at = seen_at.replace(tzinfo=None)
    diff_seconds = max(0, int((now - seen_at).total_seconds()))
    if diff_seconds < 3600:
        return "just now"
    hours = diff_seconds // 3600
    if hours < 48:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = hours // 24
    return f"{days} day{'s' if days != 1 else ''} ago"


def _last_price_seen_at(item: dict[str, Any], now: datetime.datetime) -> tuple[datetime.datetime | None, str]:
    history = item.get("price_history") or []
    if not history:
        created_at = item.get("updated_at") or item.get("created_at")
        if isinstance(created_at, datetime.datetime):
            return created_at, _format_seen_label(created_at, now)
        return None, "baseline"

    changed_at_raw = history[-1].get("changed_at")
    if not changed_at_raw:
        return None, "baseline"

    try:
        changed_at = datetime.datetime.fromisoformat(str(changed_at_raw).replace("Z", "+00:00"))
        return changed_at, _format_seen_label(changed_at, now)
    except Exception:
        return None, "baseline"


def _food_source_type(item: dict[str, Any]) -> str:
    source = str(item.get("source") or "").lower()
    status = str(item.get("status") or "").lower()
    confirmations = food_confirmation_count(item)

    if status == "pending_verification" and source in {"ocr_menu_scan", "demo_menu_scan"}:
        return "menu_scan_pending"
    if source in {"receipt_ocr", "receipt_price_spike_review", "price_spike_quiz"}:
        return "price_change_review"
    if source in {"external_snapshot", "apify_snapshot", "google_places_snapshot", "swiggy_snapshot", "zomato_snapshot"}:
        return "external_snapshot"
    if source in {"partner_api", "partner_verified", "swiggy_partner", "zomato_partner", "ondc_partner"}:
        return "partner_verified"
    if source in {"manual_menu_add", "community_item_quiz"} and status in REVIEW_ONLY_STATUSES:
        return "student_menu_submission"
    if source in {"manual_menu_add", "community_item_quiz", "student_correction", "trusted_direct_edit"} or confirmations >= 3:
        return "student_confirmed"
    if source in {"transaction_seen", "passive_transaction_seen"}:
        return "transaction_seen"
    return "curated_baseline"


def build_food_trust_metadata(item: dict[str, Any], now: datetime.datetime) -> dict[str, Any]:
    """Return source-aware trust metadata without mutating trusted menu state."""
    source_type = _food_source_type(item)
    confirmations = food_confirmation_count(item)
    seen_at, seen_label = _last_price_seen_at(item, now)

    trust_map = {
        "partner_verified": (95, "Partner verified", "Official partner/API source"),
        "student_confirmed": (
            min(92, 70 + (confirmations * 4)),
            "Student confirmed",
            f"{confirmations} student confirmation{'s' if confirmations != 1 else ''}",
        ),
        "transaction_seen": (72, "Seen in payments", "Matched against passive campus transactions"),
        "curated_baseline": (62, "Campus baseline", "Curated campus baseline catalog"),
        "external_snapshot": (55, "External snapshot", "External menu/place snapshot, pending campus confirmation"),
        "price_change_review": (44, "Price review", "Possible price change awaiting student confirmation"),
        "student_menu_submission": (40, "Needs review", "Student menu submission awaiting confirmation"),
        "menu_scan_pending": (35, "Needs review", "Menu scan candidate awaiting student confirmation"),
    }
    score, badge, reason = trust_map.get(source_type, trust_map["curated_baseline"])

    return {
        "source_type": source_type,
        "trust_score": int(score),
        "trust_badge": badge,
        "trust_reason": reason,
        "last_seen_at": seen_at.isoformat() if seen_at else None,
        "last_seen_label": seen_label,
    }


def apply_food_context_metadata(
    item: dict[str, Any],
    safe_food_budget_paise: int | None = None,
    meal_gap_hours: float | None = None,
) -> None:
    price = int(item.get("price") or 0)

    if safe_food_budget_paise is None:
        item["budget_fit"] = "unknown"
        item["budget_fit_reason"] = "No daily food budget context supplied"
    elif price <= safe_food_budget_paise:
        item["budget_fit"] = "safe"
        item["budget_fit_reason"] = "Fits today's safe food spend"
    elif price <= int(safe_food_budget_paise * 1.25):
        item["budget_fit"] = "tight"
        item["budget_fit_reason"] = "Slightly above today's safe food spend"
    else:
        item["budget_fit"] = "avoid_today"
        item["budget_fit_reason"] = "Above today's safe food spend"

    if meal_gap_hours is None:
        item["meal_gap_context"] = {
            "state": "unknown",
            "message": "No meal-gap context supplied",
        }
    elif meal_gap_hours >= 16:
        item["meal_gap_context"] = {
            "state": "meal_gap_checkin",
            "message": f"No food spend seen for {meal_gap_hours:.0f}h. If you ate in mess, mark it instead of ordering blindly.",
        }
    elif meal_gap_hours >= 10:
        item["meal_gap_context"] = {
            "state": "meal_due",
            "message": f"Food gap is {meal_gap_hours:.0f}h. Choose a simple meal that protects runway.",
        }
    else:
        item["meal_gap_context"] = {
            "state": "normal",
            "message": "Meal rhythm looks normal.",
        }


def _parse_time(value: Any) -> datetime.time | None:
    if not isinstance(value, str) or ":" not in value:
        return None
    try:
        hours, minutes = value.strip().split(":", 1)
        return datetime.time(hour=int(hours), minute=int(minutes[:2]))
    except Exception:
        return None


def _is_available_at(item: dict[str, Any], now: datetime.datetime) -> bool | None:
    start = _parse_time(item.get("available_from"))
    end = _parse_time(item.get("available_until"))
    if not start or not end:
        return None

    current = now.time()
    if start <= end:
        return start <= current <= end
    return current >= start or current <= end


def _recommendation_score(item: dict[str, Any], available_now: bool | None) -> int:
    score = int(item.get("trust_score") or 0)

    budget_fit = item.get("budget_fit")
    if budget_fit == "safe":
        score += 35
    elif budget_fit == "tight":
        score += 10
    elif budget_fit == "avoid_today":
        score -= 45

    if available_now is True:
        score += 25
    elif available_now is False:
        score -= 35

    source_type = item.get("source_type")
    if source_type == "menu_scan_pending":
        score -= 55
    elif source_type == "external_snapshot":
        score -= 20
    elif source_type == "partner_verified":
        score += 10

    if item.get("price_spike_alert"):
        score -= 35

    density = str(item.get("crowd_density") or "").lower()
    if "high" in density:
        score -= 8
    elif "low" in density:
        score += 4

    return score


def _recommendation_why(item: dict[str, Any], available_now: bool | None) -> str:
    parts = []
    budget_fit = item.get("budget_fit")
    if budget_fit == "safe":
        parts.append("fits today's safe food spend")
    elif budget_fit == "tight":
        parts.append("is close to today's safe food spend")
    elif budget_fit == "avoid_today":
        parts.append("is above today's safe food spend")

    if available_now is True:
        parts.append("available now")
    elif available_now is False:
        parts.append("not available right now")

    if item.get("trust_badge"):
        parts.append(str(item["trust_badge"]).lower())

    return ", ".join(parts).capitalize() + "." if parts else "Ranked using trust, budget, and availability."


def _recommendation_evidence(item: dict[str, Any], available_now: bool | None) -> list[str]:
    evidence = []
    trust_reason = item.get("trust_reason")
    if trust_reason:
        evidence.append(str(trust_reason))
    if item.get("last_seen_label"):
        evidence.append(f"Last seen {item['last_seen_label']}")
    if item.get("budget_fit_reason"):
        evidence.append(str(item["budget_fit_reason"]))
    if available_now is True:
        evidence.append("Available in the current meal window")
    elif available_now is False:
        evidence.append("Outside the current meal window")
    if item.get("price_spike_alert"):
        evidence.append("Possible price spike under review")
    return evidence[:5]


def _is_recommendable_item(item: dict[str, Any]) -> bool:
    status = str(item.get("status") or "active").lower()
    if status in REVIEW_ONLY_STATUSES:
        return False

    try:
        price = int(item.get("price") or 0)
    except (TypeError, ValueError):
        return False
    if price <= 0:
        return False

    if not item.get("item_name") or not item.get("venue_name"):
        return False

    return True


def build_food_recommendations(
    items: list[dict[str, Any]],
    now: datetime.datetime,
    safe_food_budget_paise: int | None = None,
    meal_gap_hours: float | None = None,
    limit: int = 3,
) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []

    for source_item in items:
        item = dict(source_item)
        if not _is_recommendable_item(item):
            continue

        item.update(build_food_trust_metadata(item, now))
        apply_food_context_metadata(item, safe_food_budget_paise, meal_gap_hours)
        available_now = _is_available_at(item, now)
        score = _recommendation_score(item, available_now)

        ranked.append({
            "item_id": str(item.get("_id") or item.get("id") or ""),
            "venue_name": item.get("venue_name"),
            "item_name": item.get("item_name"),
            "category": item.get("category", "food"),
            "price": int(item.get("price") or 0),
            "score": score,
            "why": _recommendation_why(item, available_now),
            "evidence": _recommendation_evidence(item, available_now),
            "availability": "available_now" if available_now is True else "not_now" if available_now is False else "unknown",
            "source_type": item.get("source_type"),
            "trust_score": item.get("trust_score"),
            "trust_badge": item.get("trust_badge"),
            "trust_reason": item.get("trust_reason"),
            "budget_fit": item.get("budget_fit"),
            "budget_fit_reason": item.get("budget_fit_reason"),
            "meal_gap_context": item.get("meal_gap_context"),
            "price_spike_alert": bool(item.get("price_spike_alert")),
        })

    ranked.sort(key=lambda rec: (rec["score"], -rec["price"]), reverse=True)
    return ranked[: max(1, min(limit, 10))]


def load_campus_food() -> list[dict[str, Any]]:
    s3_data = _read_s3_json()
    if s3_data is not None:
        return _normalize_flat_items(s3_data)
    # The checked-in file is the curated baseline catalog for the prototype.
    # S3 can override it in production, but an empty S3 setting should not
    # blank the food experience.
    return _normalize_flat_items(_read_local_json())
