"""Elexon ingestion, forecast selection, and accuracy aggregation."""
from __future__ import annotations

import os
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import httpx

from .models import (
    calculate_metrics,
    decision_context,
    half_hour_periods,
    iso_z,
    parse_time,
    percentile,
    select_latest_forecasts,
)
from .repository import WindRepository

UTC = timezone.utc


class SourceUnavailable(RuntimeError):
    pass


class WindService:
    def __init__(self, repository: WindRepository | None = None):
        self.repository = repository or WindRepository(os.getenv("DATABASE_PATH", "data/wind.db"))
        self.base_url = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")
        self.cutoff_time = os.getenv("DECISION_CUTOFF_LOCAL_TIME", "17:00")
        self.timezone_name = os.getenv("DECISION_TIMEZONE", "Europe/London")
        self.timeout = float(os.getenv("ELEXON_TIMEOUT_SECONDS", "35"))

    def context(self, decision_date: date):
        return decision_context(decision_date, self.cutoff_time, self.timezone_name)

    @staticmethod
    def _records(response: httpx.Response) -> list[dict]:
        response.raise_for_status()
        payload = response.json()
        records = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(records, list):
            raise SourceUnavailable("Elexon returned an unexpected response shape")
        return [record for record in records if isinstance(record.get("generation"), (int, float))]

    def _fetch(self, dataset: str, params: dict[str, str]) -> list[dict]:
        url = f"{self.base_url}/datasets/{dataset}/stream"
        try:
            response = httpx.get(
                url,
                params=params,
                headers={"User-Agent": "WindForecastDecisions/1.0", "Accept": "application/json"},
                timeout=self.timeout,
            )
            return self._records(response)
        except (httpx.HTTPError, ValueError, SourceUnavailable) as exc:
            raise SourceUnavailable(f"Unable to retrieve {dataset}: {exc}") from exc

    def ensure_decision(self, decision_date: date) -> dict[str, Any]:
        context = self.context(decision_date)
        key = f"decision:{decision_date.isoformat()}"
        previous = self.repository.metadata(key)
        if previous and previous.get("status") == "complete":
            return previous

        publish_start = datetime.combine(
            decision_date - timedelta(days=4), time.min, tzinfo=UTC
        )
        delivery_start = datetime.combine(context.delivery_date, time.min, tzinfo=UTC)
        # Retain later versions for audit while forecast selection still uses the cutoff.
        publish_end = delivery_start + timedelta(days=1)
        try:
            forecasts = self._fetch(
                "WINDFOR",
                {
                    "publishDateTimeFrom": iso_z(publish_start),
                    "publishDateTimeTo": iso_z(publish_end),
                },
            )
            actuals = self._fetch(
                "FUELHH",
                {
                    "settlementDateFrom": context.delivery_date.isoformat(),
                    "settlementDateTo": context.delivery_date.isoformat(),
                    "fuelType": "WIND",
                },
            )
            self.repository.save_forecasts(forecasts)
            self.repository.save_actuals(actuals)
            metadata = {
                "status": "complete",
                "decisionDate": decision_date.isoformat(),
                "deliveryDate": context.delivery_date.isoformat(),
                "forecastRecords": len(forecasts),
                "actualRecords": len(actuals),
                "refreshedAt": iso_z(datetime.now(UTC)),
                "cached": False,
                "publishWindowStart": iso_z(publish_start),
                "publishWindowEnd": iso_z(publish_end),
            }
            self.repository.set_metadata(key, metadata)
            return metadata
        except SourceUnavailable as exc:
            cached_forecasts = self.repository.forecasts(iso_z(publish_start), iso_z(publish_end))
            cached_actuals = self.repository.actuals(
                iso_z(delivery_start), iso_z(delivery_start + timedelta(days=1))
            )
            if cached_forecasts or cached_actuals:
                metadata = dict(previous or {})
                metadata.update(
                    {
                        "status": "stale",
                        "cached": True,
                        "warning": str(exc),
                        "decisionDate": decision_date.isoformat(),
                        "deliveryDate": context.delivery_date.isoformat(),
                    }
                )
                return metadata
            raise

    def get_decision(self, decision_date: date) -> dict[str, Any]:
        metadata = self.ensure_decision(decision_date)
        context = self.context(decision_date)
        publish_start = datetime.combine(decision_date - timedelta(days=4), time.min, tzinfo=UTC)
        delivery_start = datetime.combine(context.delivery_date, time.min, tzinfo=UTC)
        forecasts = self.repository.forecasts(iso_z(publish_start), iso_z(context.cutoff))
        actual_rows = self.repository.actuals(
            iso_z(delivery_start), iso_z(delivery_start + timedelta(days=1))
        )
        selected = select_latest_forecasts(forecasts, context.delivery_date, context.cutoff)
        actual_by_start = {parse_time(row["startTime"]): row for row in actual_rows}

        periods = []
        for start in half_hour_periods(context.delivery_date):
            hour = start.replace(minute=0)
            forecast = selected.get(hour)
            actual = actual_by_start.get(start)
            forecast_value = forecast["generation"] if forecast else None
            actual_value = actual["generation"] if actual else None
            error = forecast_value - actual_value if forecast_value is not None and actual_value is not None else None
            periods.append(
                {
                    "startTime": iso_z(start),
                    "endTime": iso_z(start + timedelta(minutes=30)),
                    "forecastStartTime": iso_z(hour),
                    "forecast": forecast_value,
                    "publishTime": forecast["publishTime"] if forecast else None,
                    "actual": actual_value,
                    "error": error,
                    "leadTimeHours": round((start - parse_time(forecast["publishTime"])).total_seconds() / 3600, 1) if forecast else None,
                }
            )

        return {
            "decisionDate": decision_date.isoformat(),
            "deliveryDate": context.delivery_date.isoformat(),
            "cutoff": iso_z(context.cutoff),
            "cutoffLocalTime": self.cutoff_time,
            "timezone": self.timezone_name,
            "forecastResolution": "HOURLY",
            "actualResolution": "HALF_HOURLY",
            "accuracyNote": "Accuracy metrics compare each hourly forecast with the mean of its two half-hour actuals.",
            "periods": periods,
            "coverage": {
                "forecastHours": len(selected),
                "expectedForecastHours": 24,
                "actualPeriods": len(actual_rows),
                "expectedActualPeriods": 48,
                "matchedPeriods": sum(1 for period in periods if period["error"] is not None),
            },
            "source": self._source_metadata(metadata),
        }

    @staticmethod
    def _source_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
        return {
            "status": metadata.get("status", "unknown"),
            "cached": bool(metadata.get("cached", False)),
            "refreshedAt": metadata.get("refreshedAt"),
            "warning": metadata.get("warning"),
            "forecastRecords": metadata.get("forecastRecords"),
            "actualRecords": metadata.get("actualRecords"),
        }

    def get_revisions(self, decision_date: date, delivery_start: datetime) -> dict[str, Any]:
        self.ensure_decision(decision_date)
        context = self.context(decision_date)
        target_hour = delivery_start.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
        publish_start = datetime.combine(decision_date - timedelta(days=4), time.min, tzinfo=UTC)
        rows = self.repository.forecasts(iso_z(publish_start), iso_z(context.cutoff + timedelta(days=4)))
        revisions = []
        selected = select_latest_forecasts(rows, context.delivery_date, context.cutoff).get(target_hour)
        previous_generation = None
        for row in sorted(rows, key=lambda item: item["publishTime"]):
            if parse_time(row["startTime"]) != target_hour:
                continue
            generation = float(row["generation"])
            revisions.append(
                {
                    "publishTime": row["publishTime"],
                    "generation": generation,
                    "change": generation - previous_generation if previous_generation is not None else None,
                    "eligible": parse_time(row["publishTime"]) <= context.cutoff,
                    "selected": bool(selected and row["publishTime"] == selected["publishTime"]),
                }
            )
            previous_generation = generation
        return {
            "decisionDate": decision_date.isoformat(),
            "deliveryStart": iso_z(target_hour),
            "cutoff": iso_z(context.cutoff),
            "revisions": revisions,
        }

    def get_accuracy(
        self,
        decision_from: date,
        decision_to: date,
        delivery_from: date | None = None,
        delivery_to: date | None = None,
        from_time: str | None = None,
        to_time: str | None = None,
    ) -> dict[str, Any]:
        pairs: list[dict[str, Any]] = []
        warnings: list[str] = []
        source_status = "complete"
        refreshed_at: str | None = None
        decision_count = (decision_to - decision_from).days + 1
        loaded_decisions = 0

        for offset in range(decision_count):
            decision_date = decision_from + timedelta(days=offset)
            try:
                decision = self.get_decision(decision_date)
                loaded_decisions += 1
                source = decision["source"]
                refreshed_at = max(filter(None, [refreshed_at, source.get("refreshedAt")]), default=None)
                if source.get("warning"):
                    warnings.append(source["warning"])
                if source.get("cached"):
                    source_status = "stale"
            except SourceUnavailable as exc:
                warnings.append(f"{decision_date.isoformat()}: {exc}")
                source_status = "stale"
                continue

            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for period in decision["periods"]:
                grouped[period["forecastStartTime"]].append(period)
            for hour, periods in grouped.items():
                first = periods[0]
                if delivery_from and datetime.fromisoformat(decision["deliveryDate"]).date() < delivery_from:
                    continue
                if delivery_to and datetime.fromisoformat(decision["deliveryDate"]).date() > delivery_to:
                    continue
                local_hour = parse_time(hour).strftime("%H:%M")
                if from_time and local_hour < from_time:
                    continue
                if to_time and local_hour > to_time:
                    continue
                if first["forecast"] is None or len(periods) != 2 or any(p["actual"] is None for p in periods):
                    continue
                actual = sum(float(p["actual"]) for p in periods) / 2
                forecast = float(first["forecast"])
                pairs.append(
                    {
                        "decisionDate": decision["decisionDate"],
                        "deliveryDate": decision["deliveryDate"],
                        "startTime": hour,
                        "forecast": forecast,
                        "actual": actual,
                        "publishTime": first["publishTime"],
                        "error": forecast - actual,
                    }
                )

        if loaded_decisions == 0 and warnings:
            raise SourceUnavailable("; ".join(warnings[:3]))

        filtered_expected = max(0, decision_count * 24)
        errors = [pair["error"] for pair in pairs]
        metrics = calculate_metrics(errors)
        return {
            "decisionFrom": decision_from.isoformat(),
            "decisionTo": decision_to.isoformat(),
            "metrics": metrics,
            "pairs": sorted(pairs, key=lambda pair: pair["startTime"]),
            "coverage": {
                "matchedPairs": len(pairs),
                "excludedPairs": max(0, filtered_expected - len(pairs)),
                "loadedDecisions": loaded_decisions,
                "requestedDecisions": decision_count,
            },
            "errorRange": {
                "p05": percentile(errors, 0.05) if len(errors) >= 30 else None,
                "p95": percentile(errors, 0.95) if len(errors) >= 30 else None,
                "sampleSize": len(errors),
                "minimumSample": 30,
            },
            "source": {
                "status": source_status,
                "cached": source_status == "stale",
                "refreshedAt": refreshed_at,
                "warnings": warnings[:5],
            },
        }

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "cutoffLocalTime": self.cutoff_time,
            "timezone": self.timezone_name,
            "archive": "Purchase decisions: 2026-01-01 to 2026-01-31",
            "elexonBaseUrl": self.base_url,
        }
