import re
from typing import Any, Iterable


AI_ADVICE_LABEL = "Grounded AI advice"
LOCAL_ADVICE_LABEL = "PocketBuddy rules"
AI_ADVICE_DISCLAIMER = (
    "Advice only. PocketBuddy's backend calculates balances, runway, prices, and limits; "
    "AI only explains those facts."
)

MEDICAL_OVERCLAIM_TERMS = (
    "diagnose",
    "diagnosis",
    "medical advice",
    "treatment",
    "illness",
    "disease",
    "depression",
    "anxiety disorder",
    "burnout risk",
    "health risk",
    "sleep disorder",
)

UNSUPPORTED_CLAIM_TERMS = (
    "guaranteed",
    "guarantee",
    "definitely",
    "live price",
    "real-time price",
    "live fare",
    "real-time fare",
    "bank verified",
    "doctor",
)

EXTERNAL_FOOD_APP_TERMS = (
    "zomato",
    "swiggy",
    "zepto",
    "blinkit",
    "instamart",
    "bigbasket",
    "uber eats",
)

RUPEE_RE = re.compile(r"(?:rs\.?|inr|\u20b9)\s*([0-9][0-9,]*(?:\.[0-9]+)?)", re.IGNORECASE)
PERCENT_RE = re.compile(r"\b([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent)\b", re.IGNORECASE)
TIME_RE = re.compile(r"\b([0-9]+(?:\.[0-9]+)?)\s*(?:days?|hours?|hrs?|h)\b", re.IGNORECASE)
PLAIN_NUMBER_RE = re.compile(r"(?<![A-Za-z0-9_/-])([0-9][0-9,]*(?:\.[0-9]+)?)(?![A-Za-z0-9_/-])")


class GroundingError(ValueError):
    """Raised when AI advice uses unsupported facts or overclaims."""


def normalize_advice_text(text: Any, *, max_chars: int = 420, max_sentences: int = 2) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip(" `\"'\n\t")
    if not cleaned:
        raise GroundingError("empty advice")

    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    if len(sentences) > max_sentences:
        cleaned = " ".join(sentences[:max_sentences]).strip()

    if len(cleaned) > max_chars:
        raise GroundingError("advice too long")

    return cleaned


def ai_response_metadata(
    *,
    source: str,
    facts_used: Iterable[str] = (),
    fallback_reason: str | None = None,
) -> dict[str, Any]:
    fallback_used = source != "bedrock"
    return {
        "advice_label": AI_ADVICE_LABEL if source == "bedrock" else LOCAL_ADVICE_LABEL,
        "advice_disclaimer": AI_ADVICE_DISCLAIMER,
        "grounding": {
            "status": "grounded" if source == "bedrock" else "deterministic_fallback",
            "numbers_from_backend": True,
            "fallback_used": fallback_used,
            "fallback_reason": fallback_reason,
            "facts_used": [str(fact) for fact in facts_used if fact][:8],
        },
    }


def validate_grounded_advice(
    text: Any,
    *,
    allowed_rupee_values: Iterable[float | int] = (),
    allowed_percent_values: Iterable[float | int] = (),
    allowed_time_values: Iterable[float | int] = (),
    allowed_plain_values: Iterable[float | int] | None = None,
    allowed_entities: Iterable[str] = (),
    require_entity: bool = False,
    forbidden_terms: Iterable[str] = (),
    max_chars: int = 420,
    max_sentences: int = 2,
) -> str:
    cleaned = normalize_advice_text(text, max_chars=max_chars, max_sentences=max_sentences)
    lower = cleaned.lower()

    blocked_terms = tuple(MEDICAL_OVERCLAIM_TERMS) + tuple(UNSUPPORTED_CLAIM_TERMS) + tuple(forbidden_terms)
    blocked = [term for term in blocked_terms if term and term.lower() in lower]
    if blocked:
        raise GroundingError(f"blocked unsupported terms: {', '.join(sorted(set(blocked)))}")

    _assert_numbers_grounded(
        RUPEE_RE.findall(cleaned),
        allowed_rupee_values,
        kind="rupee",
        tolerance_floor=1.0,
    )
    _assert_numbers_grounded(
        PERCENT_RE.findall(cleaned),
        allowed_percent_values,
        kind="percent",
        tolerance_floor=1.0,
    )
    _assert_numbers_grounded(
        [match.group(1) for match in TIME_RE.finditer(cleaned)],
        allowed_time_values,
        kind="time",
        tolerance_floor=1.0,
    )
    if allowed_plain_values is not None:
        _assert_numbers_grounded(
            _plain_number_values(cleaned),
            allowed_plain_values,
            kind="plain",
            tolerance_floor=0.0,
            relative_tolerance=0.0,
        )

    entity_values = [entity.strip().lower() for entity in allowed_entities if str(entity).strip()]
    if require_entity and entity_values and not any(entity in lower for entity in entity_values):
        raise GroundingError("advice did not reference a trusted entity")

    return cleaned


def _assert_numbers_grounded(
    values: Iterable[str],
    allowed_values: Iterable[float | int],
    *,
    kind: str,
    tolerance_floor: float,
    relative_tolerance: float = 0.015,
) -> None:
    allowed = [float(value) for value in allowed_values if _is_finite_number(value)]
    unsupported: list[str] = []
    for raw_value in values:
        value = _parse_number(raw_value)
        if value is None:
            continue
        if not allowed or not any(
            _close_number(value, candidate, tolerance_floor, relative_tolerance)
            for candidate in allowed
        ):
            unsupported.append(raw_value)

    if unsupported:
        raise GroundingError(f"unsupported {kind} numbers: {', '.join(unsupported)}")


def _parse_number(value: str) -> float | None:
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _is_finite_number(value: Any) -> bool:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return number == number and number not in (float("inf"), float("-inf"))


def _close_number(value: float, candidate: float, tolerance_floor: float, relative_tolerance: float) -> bool:
    tolerance = max(tolerance_floor, abs(candidate) * relative_tolerance)
    return abs(value - candidate) <= tolerance


def _plain_number_values(text: str) -> list[str]:
    ignored_spans = [
        match.span()
        for pattern in (RUPEE_RE, PERCENT_RE, TIME_RE)
        for match in pattern.finditer(text)
    ]
    values: list[str] = []
    for match in PLAIN_NUMBER_RE.finditer(text):
        if any(_spans_overlap(match.span(), span) for span in ignored_spans):
            continue
        values.append(match.group(1))
    return values


def _spans_overlap(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return a[0] < b[1] and b[0] < a[1]
