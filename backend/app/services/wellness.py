import datetime as dt
from typing import Any


LATE_NIGHT_START_HOUR = 23
LATE_NIGHT_END_HOUR = 5
INDIA_STANDARD_TIME_OFFSET_MINUTES = 330

MEAL_CHECKIN_RESPONSES = {
    "ate",
    "meal_logged",
    "ate_without_transaction",
    "wellness_ate",
}

SKIPPED_MEAL_RESPONSES = {
    "skipped",
    "meal_skipped",
    "could_not_eat",
}


def as_naive_datetime(value: Any) -> dt.datetime | None:
    if isinstance(value, dt.datetime):
        return value.astimezone(dt.timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.astimezone(dt.timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed
    return None


def is_late_night_activity(value: Any, timezone_offset_minutes: int = 0) -> bool:
    timestamp = as_naive_datetime(value)
    if not timestamp:
        return False
    if timezone_offset_minutes:
        timestamp = timestamp + dt.timedelta(minutes=timezone_offset_minutes)
    return timestamp.hour >= LATE_NIGHT_START_HOUR or timestamp.hour < LATE_NIGHT_END_HOUR


def is_meal_checkin(log: dict[str, Any]) -> bool:
    response = str(log.get("response") or "").strip().lower()
    if response in SKIPPED_MEAL_RESPONSES:
        return False
    if response in MEAL_CHECKIN_RESPONSES:
        return True
    return bool(log.get("meal_source")) and response not in SKIPPED_MEAL_RESPONSES


def meal_signal_events(
    transactions: list[dict[str, Any]],
    checkins: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for txn in transactions:
        if txn.get("category") != "food":
            continue
        timestamp = as_naive_datetime(txn.get("created_at"))
        if timestamp:
            events.append({"at": timestamp, "source": "transaction"})

    for checkin in checkins:
        if not is_meal_checkin(checkin):
            continue
        timestamp = as_naive_datetime(checkin.get("created_at"))
        if timestamp:
            events.append({
                "at": timestamp,
                "source": "checkin",
                "meal_source": checkin.get("meal_source"),
            })

    events.sort(key=lambda event: event["at"])
    return events


def current_meal_gap_hours(
    now: dt.datetime,
    events: list[dict[str, Any]],
    default: float = 0.0,
) -> float:
    if not events:
        return default
    return max(0.0, (now - events[-1]["at"]).total_seconds() / 3600.0)


def average_meal_gap_hours(
    now: dt.datetime,
    events: list[dict[str, Any]],
    default: float = 168.0,
) -> float:
    if not events:
        return default

    gaps: list[float] = []
    for index in range(1, len(events)):
        gap = (events[index]["at"] - events[index - 1]["at"]).total_seconds() / 3600.0
        if gap >= 0:
            gaps.append(gap)

    gaps.append(current_meal_gap_hours(now, events, default=default))
    return sum(gaps) / len(gaps) if gaps else default
