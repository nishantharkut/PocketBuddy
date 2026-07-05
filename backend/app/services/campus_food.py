import json
import logging
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
LOCAL_CAMPUS_FOOD_PATH = REPO_ROOT / "data" / "campus_food.json"


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


def load_campus_food() -> list[dict[str, Any]]:
    s3_data = _read_s3_json()
    if s3_data is not None:
        return _normalize_flat_items(s3_data)
    if settings.DEMO_MODE:
        return _normalize_flat_items(_read_local_json())
    logger.info("No configured campus food source found; local demo fallback is disabled.")
    return []
