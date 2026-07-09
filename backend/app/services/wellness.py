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


def is_debit_transaction(txn: dict[str, Any]) -> bool:
    direction = str(txn.get("direction") or "").strip().lower()
    if direction:
        return direction != "credit"
    try:
        return float(txn.get("amount") or 0) >= 0
    except (TypeError, ValueError):
        return True


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


def build_wellness_summary(
    *,
    meal_events_count_7d: int,
    current_food_gap_hours: float | None,
    avg_food_gap_hours_7d: float | None,
    late_night_activity_7d: int,
    runway_days: int,
    safe_daily_limit_rs: float,
    spend_velocity: float,
    in_exam_period: bool,
) -> dict[str, Any]:
    meal_signal = _meal_signal_summary(
        meal_events_count_7d=meal_events_count_7d,
        current_food_gap_hours=current_food_gap_hours,
        avg_food_gap_hours_7d=avg_food_gap_hours_7d,
    )
    runway_signal = _runway_signal_summary(runway_days)
    late_night_signal = _late_night_signal_summary(late_night_activity_7d)
    velocity_signal = _velocity_signal_summary(spend_velocity)
    exam_signal = _exam_signal_summary(
        in_exam_period=in_exam_period,
        meal_signal=meal_signal,
        runway_signal=runway_signal,
        velocity_signal=velocity_signal,
    )

    score = 100
    score -= _severity_weight(late_night_signal["severity"], watch=6, attention=12)
    score -= _severity_weight(runway_signal["severity"], watch=10, attention=20)
    score -= _severity_weight(velocity_signal["severity"], watch=6, attention=12)
    if meal_signal["state"] == "due":
        score -= 8
    elif meal_signal["state"] == "stale":
        score -= 16
    elif meal_signal["state"] == "missing" and in_exam_period:
        score -= 6
    if in_exam_period and any(
        signal["severity"] != "ok" for signal in (meal_signal, runway_signal, velocity_signal)
    ):
        score -= 6
    if meal_signal["state"] == "missing":
        score = min(score, 72 if not in_exam_period else 66)
    score = max(0, min(100, score))

    primary_action = _primary_action_summary(
        meal_signal=meal_signal,
        runway_signal=runway_signal,
        velocity_signal=velocity_signal,
        late_night_signal=late_night_signal,
        runway_days=runway_days,
        safe_daily_limit_rs=safe_daily_limit_rs,
        spend_velocity=spend_velocity,
        in_exam_period=in_exam_period,
    )

    if score >= 74:
        status = "steady"
        label = "Routine looks steady"
        message = (
            "Exam dates are active, but your meal and spend signals still look steady. "
            "Keep the next meal predictable and stay inside today's safe spend."
            if in_exam_period
            else "Your meal and spend signals look steady this week. Keep the next meal predictable and stay inside today's safe spend."
        )
    elif score >= 56:
        status = "watch"
        label = "One reset would help today"
        message = _wellness_status_message(
            status=status,
            meal_signal=meal_signal,
            runway_signal=runway_signal,
            velocity_signal=velocity_signal,
            late_night_signal=late_night_signal,
            primary_action=primary_action,
            runway_days=runway_days,
            safe_daily_limit_rs=safe_daily_limit_rs,
            in_exam_period=in_exam_period,
        )
    else:
        status = "attention"
        label = "Routine needs a reset today"
        message = _wellness_status_message(
            status=status,
            meal_signal=meal_signal,
            runway_signal=runway_signal,
            velocity_signal=velocity_signal,
            late_night_signal=late_night_signal,
            primary_action=primary_action,
            runway_days=runway_days,
            safe_daily_limit_rs=safe_daily_limit_rs,
            in_exam_period=in_exam_period,
        )

    return {
        "score": score,
        "status": status,
        "label": label,
        "message": message,
        "primary_action": primary_action,
        "signals": [
            meal_signal,
            runway_signal,
            late_night_signal,
            velocity_signal,
            exam_signal,
        ],
    }


def _wellness_status_message(
    *,
    status: str,
    meal_signal: dict[str, Any],
    runway_signal: dict[str, Any],
    velocity_signal: dict[str, Any],
    late_night_signal: dict[str, Any],
    primary_action: dict[str, Any],
    runway_days: int,
    safe_daily_limit_rs: float,
    in_exam_period: bool,
) -> str:
    safe_daily_copy = f"Rs {round(safe_daily_limit_rs):.0f}" if safe_daily_limit_rs > 0 else None

    if status == "watch":
        if meal_signal["state"] == "missing":
            return (
                "PocketBuddy is missing a recent meal signal, so the routine view is less certain than usual. "
                "Log the last meal or keep the next one simple."
            )
        if in_exam_period and meal_signal["state"] in {"due", "stale"}:
            return (
                "Exam dates are active and the meal signal is getting old. "
                "Keep the next meal predictable so the day stays easier to manage."
            )
        if runway_signal["severity"] == "attention":
            return (
                "Runway is already critically tight, even if the rest of the routine signals are comparatively stable. "
                "Pause routine orders until the next spend is reviewed."
            )
        if runway_signal["severity"] == "watch":
            return (
                f"Runway is tightening, with about {max(runway_days, 0)} days left at the current pace. "
                "The next routine spend should stay deliberate."
            )
        if velocity_signal["severity"] == "attention":
            return "Spending is moving well above the safe pace. Pull the next routine spends back before the cycle gets harder to recover."
        if velocity_signal["severity"] == "watch":
            return "Spending has crept above the safe pace this week. One low-spend window today will help settle it."
        if late_night_signal["severity"] == "attention":
            return "After-hours payments are starting to look routine. A predictable snack, ride, or meal fallback would reduce that pressure."
        if late_night_signal["severity"] == "watch":
            return "A few after-hours payments showed up this week. A more predictable meal or snack plan will reduce that drift."
        return str(primary_action.get("detail") or "One reset would help today.")

    if meal_signal["state"] in {"missing", "stale"}:
        return (
            "Routine pressure is stacking because PocketBuddy either missed the last meal signal or the gap has gone stale. "
            "Reset that first, then make the next spend deliberate."
        )
    if runway_signal["severity"] == "attention":
        return (
            "Runway is critically tight today. Essentials should come first, and the next routine spend needs a quick review."
        )
    if velocity_signal["severity"] == "attention":
        return "Spending is moving well above the safe pace. Pull the next few routine spends back before the cycle gets harder to manage."
    if late_night_signal["severity"] == "attention":
        return "Repeated after-hours payments are now part of the routine pattern. A more predictable food or travel fallback would reduce that pressure."
    if in_exam_period:
        return (
            f"Exam dates are active and routine pressure is visible. Keep the next meal predictable{f' near {safe_daily_copy}' if safe_daily_copy else ''} and avoid stacking extra spend."
        )
    return str(primary_action.get("detail") or "Routine needs a reset today.")


def _meal_signal_summary(
    *,
    meal_events_count_7d: int,
    current_food_gap_hours: float | None,
    avg_food_gap_hours_7d: float | None,
) -> dict[str, Any]:
    if meal_events_count_7d <= 0:
        return {
            "key": "food_gap",
            "label": "Meal signal",
            "state": "missing",
            "value": "Missing",
            "severity": "watch",
            "detail": "No food payment or meal check-in was recorded this week.",
        }

    gap_hours = max(0.0, float(current_food_gap_hours or 0.0))
    avg_gap = max(0.0, float(avg_food_gap_hours_7d or 0.0))
    if gap_hours >= 14 or avg_gap > 10:
        state = "stale"
        severity = "attention"
        detail = "The last meal signal is old. Log mess, cash, or home meals before ordering again."
    elif gap_hours >= 9 or avg_gap > 6:
        state = "due"
        severity = "watch"
        detail = "The next meal should stay simple, and cash or mess meals should be checked in if no payment appears."
    else:
        state = "current"
        severity = "ok"
        detail = "Recent food payments or meal check-ins are keeping the routine signal current."

    return {
        "key": "food_gap",
        "label": "Meal signal",
        "state": state,
        "value": _format_gap_value(gap_hours),
        "severity": severity,
        "detail": detail,
    }


def _runway_signal_summary(runway_days: int) -> dict[str, Any]:
    if runway_days < 5:
        severity = "attention"
        detail = "Allowance may not last the cycle unless the next few days stay tighter."
    elif runway_days < 10:
        severity = "watch"
        detail = "Runway is getting shorter, so the next routine spends should stay deliberate."
    else:
        severity = "ok"
        detail = "Runway still looks stable against the current pace."

    return {
        "key": "runway",
        "label": "Runway",
        "state": "stable" if severity == "ok" else "tight",
        "value": f"{runway_days}d",
        "severity": severity,
        "detail": detail,
    }


def _late_night_signal_summary(late_night_activity_7d: int) -> dict[str, Any]:
    if late_night_activity_7d > 3:
        severity = "attention"
        detail = "Repeated debit payments landed between 11PM and 5AM campus time."
    elif late_night_activity_7d > 1:
        severity = "watch"
        detail = "A few debit payments landed between 11PM and 5AM campus time."
    else:
        severity = "ok"
        detail = "No repeated after-hours payment pattern is showing right now."

    return {
        "key": "late_night",
        "label": "After-hours",
        "state": "active" if severity != "ok" else "quiet",
        "value": f"{late_night_activity_7d} payments",
        "severity": severity,
        "detail": detail,
    }


def _velocity_signal_summary(spend_velocity: float) -> dict[str, Any]:
    if spend_velocity > 1.4:
        severity = "attention"
        detail = "Spending is moving well above the safe daily pace."
    elif spend_velocity > 1.2:
        severity = "watch"
        detail = "Spending is slightly above the safe daily pace."
    else:
        severity = "ok"
        detail = "Spending pace is still close to the safe daily limit."

    return {
        "key": "velocity",
        "label": "Spend pace",
        "state": "elevated" if severity != "ok" else "steady",
        "value": f"{spend_velocity:.2f}x",
        "severity": severity,
        "detail": detail,
    }


def _exam_signal_summary(
    *,
    in_exam_period: bool,
    meal_signal: dict[str, Any],
    runway_signal: dict[str, Any],
    velocity_signal: dict[str, Any],
) -> dict[str, Any]:
    if not in_exam_period:
        return {
            "key": "exam",
            "label": "Exam window",
            "state": "inactive",
            "value": "Off",
            "severity": "ok",
            "detail": "No active exam dates are configured right now.",
        }

    severity = "watch"
    if meal_signal["state"] in {"missing", "stale"} or runway_signal["severity"] == "attention" or velocity_signal["severity"] == "attention":
        severity = "attention"

    return {
        "key": "exam",
        "label": "Exam window",
        "state": "active",
        "value": "Active",
        "severity": severity,
        "detail": "Configured exam dates are active. Keep one predictable meal and review runway before late orders.",
    }


def _primary_action_summary(
    *,
    meal_signal: dict[str, Any],
    runway_signal: dict[str, Any],
    velocity_signal: dict[str, Any],
    late_night_signal: dict[str, Any],
    runway_days: int,
    safe_daily_limit_rs: float,
    spend_velocity: float,
    in_exam_period: bool,
) -> dict[str, Any]:
    safe_daily_copy = f"Rs {round(safe_daily_limit_rs):.0f}" if safe_daily_limit_rs > 0 else None

    if meal_signal["state"] == "missing":
        detail = (
            "PocketBuddy cannot tell whether you ate through mess, cash, or home food this week. "
            "Log the last meal so Food Guard and runway stay accurate."
        )
        if in_exam_period and safe_daily_copy:
            detail += f" Keep the next meal near {safe_daily_copy} if you still need to eat."
        return {
            "key": "meal_checkin",
            "title": "Log the last meal signal",
            "detail": detail,
            "cta_label": "Meal check-in",
            "destination": "checkin",
        }

    if in_exam_period and meal_signal["state"] in {"due", "stale"}:
        detail = f"The last meal signal is {meal_signal['value']} old. Log it if you already ate"
        if safe_daily_copy:
            detail += f", or keep the next meal near {safe_daily_copy}"
        detail += " so exam-day food stays predictable."
        return {
            "key": "meal_checkin",
            "title": "Protect the next exam-day meal",
            "detail": detail,
            "cta_label": "Meal check-in",
            "destination": "checkin",
        }

    if runway_signal["severity"] == "attention":
        if runway_days <= 0:
            detail = "Today's runway is effectively exhausted at the current pace."
        elif runway_days == 1:
            detail = "You have about 1 day of runway left at the current pace."
        else:
            detail = f"You have about {runway_days} days of runway left at the current pace."
        if safe_daily_copy:
            detail += f" Keep today close to {safe_daily_copy}."
        detail += " Review runway before placing another routine order."
        return {
            "key": "review_runway",
            "title": "Review runway before the next spend",
            "detail": detail,
            "cta_label": "Review runway",
            "destination": "runway",
        }

    if velocity_signal["severity"] != "ok":
        detail = "Use one low-spend window today so the next few routine payments do not stack."
        if safe_daily_copy:
            detail += f" Aim to stay near {safe_daily_copy} for the day."
        return {
            "key": "low_spend_window",
            "title": "Slow the spend pace today",
            "detail": detail,
            "cta_label": "Review runway",
            "destination": "runway",
        }

    if late_night_signal["severity"] != "ok":
        return {
            "key": "after_hours_reset",
            "title": "Keep after-hours spends intentional",
            "detail": "A planned snack, ride, or meal option will reduce late orders and make the routine easier to manage.",
            "cta_label": "Campus food",
            "destination": "food",
        }

    if meal_signal["state"] == "due":
        detail = "The next meal should stay predictable. Log mess, cash, or home food if no payment record appears."
        if safe_daily_copy:
            detail += f" Keep it near {safe_daily_copy} if possible."
        return {
            "key": "meal_routine",
            "title": "Keep the next meal simple",
            "detail": detail,
            "cta_label": "Campus food",
            "destination": "food",
        }

    if in_exam_period:
        detail = "Exam dates are active, so one predictable meal and one planned spend decision will keep the day cleaner."
        if safe_daily_copy:
            detail += f" Stay near {safe_daily_copy} for routine food."
        return {
            "key": "exam_routine",
            "title": "Keep the routine predictable today",
            "detail": detail,
            "cta_label": "Campus food",
            "destination": "food",
        }

    return {
        "key": "keep_steady",
        "title": "Keep the routine predictable",
        "detail": "Nothing urgent is showing right now. Keep meals regular and stay inside the current safe daily spend.",
        "cta_label": "Review runway",
        "destination": "runway",
    }


def _severity_weight(severity: str, *, watch: int, attention: int) -> int:
    if severity == "attention":
        return attention
    if severity == "watch":
        return watch
    return 0


def _format_gap_value(hours: float) -> str:
    if hours < 1:
        return "<1h"
    return f"{round(hours):.0f}h"
