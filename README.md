# Wind Forecast Decisions

A day-ahead wind forecast reconstruction and accuracy workspace for a UK electricity buying team, covering decisions for 1–31 January 2026. Data comes from two Elexon sources: WINDFOR (national wind forecasts and their publication times) and FUELHH filtered to `fuelType=WIND` (actual generation).

Stack: React + TypeScript, FastAPI, SQLite cache, pytest/vitest/Playwright, Docker.

## How it works

**Decision Day.** Pick a decision date in January 2026; the delivery day is the following calendar day. For each delivery hour, the backend selects the latest WINDFOR revision with `publishTime <= decisionCutoff` (default 17:00 Europe/London) and compares it with FUELHH actuals in a chart and 48-row table. Later revisions are kept for audit but labelled "After cutoff" and never selected. Displayed rows export to CSV.

**Accuracy.** Filter matched forecast/actual pairs by decision date, delivery date, and time of day. Metrics: MAE, RMSE, signed bias, coverage, largest misses, plus drill-down into the original decision. Filtered pairs export to CSV.

**Data resolution.** WINDFOR is hourly; FUELHH is half-hourly. Decision Day repeats each hourly forecast across its two half-hour periods for comparison. Accuracy compares each hourly forecast with the mean of its two half-hour actuals and drops the hour if either half is missing. Missing values are never coerced to zero; empty metric populations return N/A.

For `error = forecast - actual` (positive means overforecast): MAE = mean(|error|), RMSE = sqrt(mean(error²)), Bias = mean(error). The p05–p95 band shows only with 30+ matched errors; it's historical evidence, not a guarantee.

## Running it

Docker (with Compose):

```bash
docker compose up --build   # http://localhost:3000
```

Local dev needs Node 22+ and Python 3.12+:

```bash
npm install
python3 -m pip install -r backend/requirements.txt
npm run dev
```

Vite proxies `/api` to FastAPI on :8000. Tests: `npm test`, `npm run test:api`, `npm run test:e2e` (browser journeys, mocked API).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Service and decision-assumption status |
| `GET /api/status` | Cached decision metadata |
| `GET /api/decision-day?decisionDate=2026-01-10` | Cutoff-selected forecast, actuals, coverage |
| `GET /api/revisions?decisionDate=...&deliveryStart=...` | Forecast revision evidence |
| `GET /api/accuracy?decisionFrom=...&decisionTo=...` | Hourly matched errors and metrics |

Accuracy also accepts `deliveryFrom`, `deliveryTo`, `fromTime`, `toTime`. Invalid dates and reversed ranges return 400; source failures without usable cache return 503.

## Architecture

```text
React routes + URL-backed filters
        │
        ▼
FastAPI ── forecast-vintage selection
        ── hourly/half-hourly alignment
        ── metric and coverage calculations
        ── Elexon ingestion
        ── SQLite revision-preserving cache
```

Cache identity is `(start_time, publish_time)`, so newer revisions never overwrite older ones. Failed refreshes serve cached values only when they exist, labelled cached/partial.

## Configuration

Key env vars: `DECISION_CUTOFF_LOCAL_TIME` (17:00), `DECISION_TIMEZONE` (Europe/London), `ELEXON_BASE_URL`, `ELEXON_TIMEOUT_SECONDS` (35), `DATABASE_PATH`, `PORT`. No secrets needed; `.env.example` documents the rest.

## Notes

- The repo ships no fabricated forecast snapshot. If Elexon is unreachable the app says so instead of substituting synthetic data.
- Out of scope: durable production database, authentication, scheduled preloading, multi-market support, ML forecasting. It's a decision-support tool, not trading advice.
