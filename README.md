# Wind Forecast Decisions

A day-ahead wind forecast reconstruction and accuracy workspace for a UK electricity buying team, covering decisions for 1–31 January 2026. Data comes from two Elexon sources: WINDFOR (national wind forecasts and their publication times) and FUELHH filtered to `fuelType=WIND` (actual generation).

Stack: React + TypeScript, FastAPI, SQLite cache, pytest/vitest/Playwright, Docker.

Live sample: [Wind Forecast Decisions](https://databrick.hey-adi.me/decision-day)

## How it works

**Decision Day.** Pick a decision date in January 2026; the delivery day is the following calendar day. For each delivery hour, the backend selects the latest WINDFOR revision with `publishTime <= decisionCutoff` (default 17:00 Europe/London) and compares it with FUELHH actuals in a chart and 48-row table. Later revisions are kept for audit but labelled "After cutoff" and never selected. Displayed rows export to CSV.

**Accuracy.** Filter matched forecast/actual pairs by decision date, delivery date, and time of day. Metrics: MAE, RMSE, signed bias, coverage, largest misses, plus drill-down into the original decision. Filtered pairs export to CSV.

**Data resolution.** WINDFOR is hourly; FUELHH is half-hourly. Decision Day repeats each hourly forecast across its two half-hour periods for comparison. Accuracy compares each hourly forecast with the mean of its two half-hour actuals and drops the hour if either half is missing. Missing values are never coerced to zero; empty metric populations return N/A.

For `error = forecast - actual` (positive means overforecast): MAE = mean(|error|), RMSE = sqrt(mean(error²)), Bias = mean(error). The p05–p95 band shows only with 30+ matched errors; it's historical evidence, not a guarantee.

## Project layout

```text
.
├── backend/
│   ├── main.py              FastAPI routes, validation, errors, static client
│   ├── service.py           Elexon ingestion, alignment, analysis, source status
│   ├── models.py            Cutoff, selection, metric, and time helpers
│   ├── repository.py        Revision-preserving SQLite cache
│   ├── requirements.txt     Pinned Python dependencies
│   └── tests/               Backend unit and service tests
├── src/
│   ├── pages/               Decision Day and Accuracy routes
│   ├── components/          Charts, panels, data states, and UI components
│   ├── hooks/               Shared browser and chart behaviour
│   └── lib/                 API client, types, formatting, and frontend tests
├── tests/                   Playwright browser journeys with mocked API data
├── Dockerfile               React build followed by Python runtime
├── docker-compose.yml       Application port, environment, and cache volume
├── .env.example             Documented configuration defaults
├── package.json             Frontend scripts and dependencies
└── vite.config.ts           Development server and API proxy
```

## Running it

Docker with Compose is the recommended way to start the complete application:

```bash
docker compose up --build
```

Open http://localhost:3000. The Compose named volume preserves the SQLite cache between container restarts.

For local development, install Node 22+ and Python 3.12+, then create the virtual environment expected by the npm scripts:

```bash
npm install
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm run dev
```

Open http://localhost:3000. Vite serves the React client and proxies `/api` to FastAPI on port 8000.

## Tests

```bash
npm test                 # Frontend unit tests
npm run test:api         # Backend pytest suite
npm run test:e2e         # Playwright browser journeys, mocked API
npm run build            # Type-check and production frontend build
```

Playwright needs a Chromium installation. To use an existing Chrome or Chromium binary, set `CHROMIUM_PATH` before running `npm run test:e2e`.

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

## AI-use disclosure

AI tools assisted with application development, testing, and documentation.
