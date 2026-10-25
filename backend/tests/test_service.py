from datetime import date, datetime, timedelta, timezone

from backend.repository import WindRepository
from backend.service import WindService

UTC = timezone.utc


def populated_service():
    repository = WindRepository(":memory:")
    decision = date(2026, 1, 10)
    delivery = date(2026, 1, 11)
    forecasts = []
    actuals = []
    for hour in range(24):
        target = datetime(2026, 1, 11, hour, tzinfo=UTC)
        forecasts.append({"startTime": target.isoformat().replace("+00:00", "Z"), "publishTime": "2026-01-10T14:00:00Z", "generation": 7000 + hour * 10})
        for minute in (0, 30):
            start = target + timedelta(minutes=minute)
            actuals.append({"startTime": start.isoformat().replace("+00:00", "Z"), "publishTime": start.isoformat().replace("+00:00", "Z"), "generation": 6800 + hour * 10 + minute})
    repository.save_forecasts(forecasts)
    repository.save_actuals(actuals)
    repository.set_metadata("decision:2026-01-10", {"status": "complete", "refreshedAt": "2026-02-01T00:00:00Z"})
    return WindService(repository)


def test_decision_preserves_half_hour_actuals_and_hourly_forecasts():
    decision = populated_service().get_decision(date(2026, 1, 10))
    assert len(decision["periods"]) == 48
    assert decision["coverage"]["forecastHours"] == 24
    assert decision["coverage"]["actualPeriods"] == 48
    assert decision["periods"][0]["forecast"] == decision["periods"][1]["forecast"]
    assert decision["periods"][0]["actual"] != decision["periods"][1]["actual"]


def test_accuracy_uses_hourly_mean_of_two_half_hour_actuals():
    accuracy = populated_service().get_accuracy(date(2026, 1, 10), date(2026, 1, 10))
    assert len(accuracy["pairs"]) == 24
    first = accuracy["pairs"][0]
    assert first["actual"] == 6815
    assert first["error"] == 185


def test_missing_actual_is_not_imputed_as_zero():
    service = populated_service()
    service.repository.connection.execute("DELETE FROM actuals WHERE start_time='2026-01-11T00:30:00Z'")
    service.repository.connection.commit()
    accuracy = service.get_accuracy(date(2026, 1, 10), date(2026, 1, 10))
    assert len(accuracy["pairs"]) == 23
    assert all(pair["startTime"] != "2026-01-11T00:00:00Z" for pair in accuracy["pairs"])
