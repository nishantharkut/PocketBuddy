"""
Catalog API – dynamic, extensible option lists.

Supports four catalog types:
  campuses, payment-providers, transaction-categories, cart-platforms

Defaults are lazy-seeded on first GET if no items exist for that type.
Users can POST custom items; they appear alongside defaults in GET.

Hierarchical Category Mapping:
  For transaction-categories, custom user labels are auto-mapped to a
  parent_category for clean analytics. E.g., "maggi" → parent: "food".
"""

import uuid
import datetime
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs

router = APIRouter()

VALID_CATALOG_TYPES = {
    "campuses",
    "payment-providers",
    "transaction-categories",
    "cart-platforms",
}

# ---------------------------------------------------------------------------
# Default seed data per catalog type
# ---------------------------------------------------------------------------

_DEFAULT_SEEDS: dict[str, list[dict]] = {
    "campuses": [
        {"value": "abv_iiitm_gwalior", "label": "ABV-IIITM Gwalior", "sort_order": 0, "metadata": {"city": "Gwalior", "state": "MP"}},
        {"value": "iit_delhi", "label": "IIT Delhi", "sort_order": 1, "metadata": {"city": "New Delhi", "state": "Delhi"}},
        {"value": "iit_bombay", "label": "IIT Bombay", "sort_order": 2, "metadata": {"city": "Mumbai", "state": "Maharashtra"}},
        {"value": "nit_trichy", "label": "NIT Trichy", "sort_order": 3, "metadata": {"city": "Tiruchirappalli", "state": "Tamil Nadu"}},
        {"value": "bits_pilani", "label": "BITS Pilani", "sort_order": 4, "metadata": {"city": "Pilani", "state": "Rajasthan"}},
        {"value": "nit_warangal", "label": "NIT Warangal", "sort_order": 5, "metadata": {"city": "Warangal", "state": "Telangana"}},
        {"value": "iiit_hyderabad", "label": "IIIT Hyderabad", "sort_order": 6, "metadata": {"city": "Hyderabad", "state": "Telangana"}},
    ],
    "payment-providers": [
        {"value": "googlepay", "label": "Google Pay", "sort_order": 0, "metadata": {}},
        {"value": "phonepe", "label": "PhonePe", "sort_order": 1, "metadata": {}},
        {"value": "paytm", "label": "Paytm", "sort_order": 2, "metadata": {}},
        {"value": "amazonpay", "label": "Amazon Pay", "sort_order": 3, "metadata": {}},
        {"value": "cred", "label": "CRED", "sort_order": 4, "metadata": {}},
    ],
    "transaction-categories": [
        {"value": "food", "label": "Food", "sort_order": 0, "metadata": {"is_parent": True}},
        {"value": "stationery", "label": "Stationery", "sort_order": 1, "metadata": {"is_parent": True}},
        {"value": "travel", "label": "Travel", "sort_order": 2, "metadata": {"is_parent": True}},
        {"value": "subscription", "label": "Subscription", "sort_order": 3, "metadata": {"is_parent": True}},
        {"value": "other", "label": "Other", "sort_order": 4, "metadata": {"is_parent": True}},
    ],
    "cart-platforms": [
        {"value": "zepto", "label": "Zepto", "sort_order": 0, "metadata": {"default_min_cart": 19900, "default_delivery_fee": 2500}},
        {"value": "blinkit", "label": "Blinkit", "sort_order": 1, "metadata": {"default_min_cart": 19900, "default_delivery_fee": 2500}},
        {"value": "swiggy_instamart", "label": "Swiggy Instamart", "sort_order": 2, "metadata": {"default_min_cart": 19900, "default_delivery_fee": 3500}},
        {"value": "bigbasket", "label": "BigBasket", "sort_order": 3, "metadata": {"default_min_cart": 29900, "default_delivery_fee": 3000}},
        {"value": "jiomart", "label": "JioMart", "sort_order": 4, "metadata": {"default_min_cart": 19900, "default_delivery_fee": 2900}},
    ],
}


# ---------------------------------------------------------------------------
# Hierarchical Category Mapping – semantic keyword → parent category
# ---------------------------------------------------------------------------

_CATEGORY_KEYWORD_MAP: dict[str, list[str]] = {
    "food": [
        "food", "maggi", "noodle", "canteen", "mess", "chai", "tea", "coffee",
        "snack", "lunch", "dinner", "breakfast", "biryani", "pizza", "burger",
        "samosa", "dosa", "idli", "thali", "juice", "shake", "momos",
        "sandwich", "paratha", "roti", "rice", "dal", "swiggy", "zomato",
        "drink", "beverage", "water", "coke", "pepsi", "lassi", "milk",
        "fruit", "chocolate", "ice cream", "dessert", "cake", "biscuit",
    ],
    "stationery": [
        "stationery", "pen", "pencil", "notebook", "book", "paper", "xerox",
        "photocopy", "print", "marker", "eraser", "ruler", "glue", "tape",
        "folder", "file", "stapler", "highlighter", "lab manual", "register",
    ],
    "travel": [
        "travel", "auto", "cab", "uber", "ola", "rapido", "metro", "bus",
        "train", "flight", "ticket", "fare", "petrol", "diesel", "fuel",
        "parking", "toll", "rickshaw", "tempo", "bike", "taxi",
    ],
    "subscription": [
        "subscription", "netflix", "spotify", "prime", "hotstar", "youtube",
        "premium", "recharge", "plan", "monthly", "annual", "renewal",
        "membership", "gym", "vpn", "cloud", "storage", "wifi", "internet",
    ],
}


def _resolve_parent_category(label: str) -> str:
    """Map a custom label to its nearest parent category via keyword matching."""
    slug = re.sub(r"[^a-z0-9 ]+", "", label.lower()).strip()
    for parent, keywords in _CATEGORY_KEYWORD_MAP.items():
        for kw in keywords:
            if kw in slug:
                return parent
    return "other"


async def _ensure_seeded(db, catalog_type: str) -> None:
    """Lazy-seed defaults on first access if collection has no items for this type."""
    count = await db.catalog_items.count_documents({"catalog_type": catalog_type})
    if count > 0:
        return

    seeds = _DEFAULT_SEEDS.get(catalog_type, [])
    if not seeds:
        return

    now = datetime.datetime.utcnow()
    docs = []
    for seed in seeds:
        docs.append({
            "_id": str(uuid.uuid4()),
            "catalog_type": catalog_type,
            "value": seed["value"],
            "label": seed["label"],
            "source": "default",
            "created_by": None,
            "sort_order": seed.get("sort_order", 99),
            "metadata": seed.get("metadata", {}),
            "created_at": now,
        })

    await db.catalog_items.insert_many(docs)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CatalogItemCreateReq(BaseModel):
    label: str
    metadata: Optional[dict] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _validate_catalog_type(catalog_type: str) -> str:
    ct = catalog_type.strip().lower()
    if ct not in VALID_CATALOG_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid catalog type '{catalog_type}'. Must be one of: {', '.join(sorted(VALID_CATALOG_TYPES))}",
        )
    return ct


def _normalize_value(label: str) -> str:
    """Turn a human label into a slug-style value key."""
    import re
    normalized = label.strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return normalized or "custom"


@router.get("/{catalog_type}")
async def get_catalog(catalog_type: str, user_id: str = Depends(get_current_user)):
    ct = _validate_catalog_type(catalog_type)
    db = get_db()

    await _ensure_seeded(db, ct)

    cursor = db.catalog_items.find({"catalog_type": ct}).sort("sort_order", 1)
    items = await cursor.to_list(length=500)
    return map_docs(items)


@router.post("/{catalog_type}")
async def add_catalog_item(
    catalog_type: str,
    req: CatalogItemCreateReq,
    user_id: str = Depends(get_current_user),
):
    ct = _validate_catalog_type(catalog_type)
    db = get_db()

    label = req.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    if len(label) > 120:
        raise HTTPException(status_code=400, detail="Label is too long (max 120 characters)")

    value = _normalize_value(label)

    # Check for duplicate value within this catalog type
    existing = await db.catalog_items.find_one({"catalog_type": ct, "value": value})
    if existing:
        # Return the existing item instead of erroring – idempotent behavior
        return map_doc(existing)

    # --- Hierarchical Category Mapping ---
    # For transaction-categories, auto-map custom labels to a parent category
    metadata = req.metadata or {}
    if ct == "transaction-categories":
        parent_category = _resolve_parent_category(label)
        metadata["parent_category"] = parent_category
        metadata["is_custom_label"] = True

    now = datetime.datetime.utcnow()
    new_item = {
        "_id": str(uuid.uuid4()),
        "catalog_type": ct,
        "value": value,
        "label": label,
        "source": "user",
        "created_by": user_id,
        "sort_order": 99,
        "metadata": metadata,
        "created_at": now,
    }

    await db.catalog_items.insert_one(new_item)
    return map_doc(new_item)

