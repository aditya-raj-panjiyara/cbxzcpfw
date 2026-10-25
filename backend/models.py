"""Shared domain helpers for decision-relevant wind forecast analysis."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from math import sqrt
from statistics import mean
from zoneinfo import ZoneInfo

UTC = timezone.utc


def iso_z(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


@dataclass(frozen=True)
class DecisionContext:
    decision_date: date
    delivery_date: date
    cutoff: datetime
    timezone: str


def decision_context(decision_date: date, cutoff_time: str, timezone_name: str) -> DecisionContext:
    hour, minute = (int(part) for part in cutoff_time.split(":"))
    local_zone = ZoneInfo(timezone_name)
    local_cutoff = datetime.combine(decision_date, time(hour, minute), tzinfo=local_zone)
    return DecisionContext(
        decision_date=decision_date,
        delivery_date=decision_date + timedelta(days=1),
        cutoff=local_cutoff.astimezone(UTC),
        timezone=timezone_name,
    )


def half_hour_periods(delivery_date: date) -> list[datetime]:
    start = datetime.combine(delivery_date, time.min, tzinfo=UTC)
    return [start + timedelta(minutes=30 * index) for index in range(48)]


def select_latest_forecasts(
    forecasts: list[dict], delivery_date: date, cutoff: datetime
) -> dict[datetime, dict]:
    """Select the latest eligible hourly forecast for each delivery hour."""
    day_start = datetime.combine(delivery_date, time.min, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    selected: dict[datetime, dict] = {}
    for row in forecasts:
        target = parse_time(row["startTime"] if "startTime" in row else row["start_time"])
        published = parse_time(row["publishTime"] if "publishTime" in row else row["publish_time"])
        if not (day_start <= target < day_end) or published > cutoff:
            continue
        current = selected.get(target)
        if current is None or published > parse_time(current["publishTime"]):
            selected[target] = {
                "startTime": iso_z(target),
                "publishTime": iso_z(published),
                "generation": float(row["generation"]),
            }
    return selected


def calculate_metrics(errors: list[float]) -> dict[str, float | None]:
    if not errors:
        return {"mae": None, "rmse": None, "bias": None}
    return {
        "mae": mean(abs(error) for error in errors),
        "rmse": sqrt(mean(error * error for error in errors)),
        "bias": mean(errors),
    }


def percentile(values: list[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction
