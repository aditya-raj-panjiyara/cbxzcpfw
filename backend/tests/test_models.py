from datetime import date, datetime, timezone

from backend.models import calculate_metrics, decision_context, select_latest_forecasts

UTC = timezone.utc


def test_latest_eligible_forecast_is_selected_per_delivery_hour():
    forecasts = [
        {"startTime": "2026-01-11T10:00:00Z", "publishTime": "2026-01-10T08:00:00Z", "generation": 7000},
        {"startTime": "2026-01-11T10:00:00Z", "publishTime": "2026-01-10T14:00:00Z", "generation": 6800},
        {"startTime": "2026-01-11T10:00:00Z", "publishTime": "2026-01-10T20:00:00Z", "generation": 6500},
    ]
    cutoff = datetime(2026, 1, 10, 17, tzinfo=UTC)
    selected = select_latest_forecasts(forecasts, date(2026, 1, 11), cutoff)
    assert selected[datetime(2026, 1, 11, 10, tzinfo=UTC)]["generation"] == 6800


def test_no_eligible_forecast_is_not_replaced_with_later_version():
    forecasts = [{"startTime": "2026-01-11T10:00:00Z", "publishTime": "2026-01-10T20:00:00Z", "generation": 6500}]
    cutoff = datetime(2026, 1, 10, 17, tzinfo=UTC)
    assert select_latest_forecasts(forecasts, date(2026, 1, 11), cutoff) == {}


def test_accuracy_reference_fixture():
    metrics = calculate_metrics([10, -20, 60])
    assert metrics["mae"] == 30
    assert round(metrics["rmse"], 2) == 36.97
    assert round(metrics["bias"], 2) == 16.67


def test_empty_accuracy_is_not_zero():
    assert calculate_metrics([]) == {"mae": None, "rmse": None, "bias": None}


def test_january_boundary_delivery_is_february():
    context = decision_context(date(2026, 1, 31), "17:00", "Europe/London")
    assert context.delivery_date == date(2026, 2, 1)
    assert context.cutoff == datetime(2026, 1, 31, 17, tzinfo=UTC)

