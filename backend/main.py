"""FastAPI application serving the wind forecast API and built React client."""
from __future__ import annotations

import os
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .service import SourceUnavailable, WindService

app = FastAPI(title="Wind Forecast Decisions API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173","databrick.hey-adi.me"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)
service = WindService()

ARCHIVE_START = date(2026, 1, 1)
ARCHIVE_END = date(2026, 1, 31)


def validate_decision(value: date) -> date:
    if not ARCHIVE_START <= value <= ARCHIVE_END:
        raise HTTPException(400, "Choose a purchase-decision date from 1–31 January 2026.")
    return value


@app.get("/api/health")
def health():
    return service.health()


@app.get("/api/status")
def status():
    return {"decisions": service.repository.all_metadata(), "source": service.base_url}


@app.get("/api/decision-day")
def decision_day(decision_date: date = Query(alias="decisionDate")):
    validate_decision(decision_date)
    try:
        return service.get_decision(decision_date)
    except SourceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/revisions")
def revisions(decision_date: date = Query(alias="decisionDate"), delivery_start: datetime = Query(alias="deliveryStart")):
    validate_decision(decision_date)
    context = service.context(decision_date)
    if delivery_start.date() != context.delivery_date:
        raise HTTPException(400, "The delivery period does not belong to the selected decision day.")
    try:
        return service.get_revisions(decision_date, delivery_start)
    except SourceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/accuracy")
def accuracy(
    decision_from: date = Query(default=ARCHIVE_START, alias="decisionFrom"),
    decision_to: date = Query(default=ARCHIVE_END, alias="decisionTo"),
    delivery_from: date | None = Query(default=None, alias="deliveryFrom"),
    delivery_to: date | None = Query(default=None, alias="deliveryTo"),
    from_time: str | None = Query(default=None, alias="fromTime", pattern=r"^([01]\d|2[0-3]):[0-5]\d$"),
    to_time: str | None = Query(default=None, alias="toTime", pattern=r"^([01]\d|2[0-3]):[0-5]\d$"),
):
    validate_decision(decision_from)
    validate_decision(decision_to)
    if decision_from > decision_to:
        raise HTTPException(400, "The decision start date must be on or before the end date.")
    if delivery_from and delivery_to and delivery_from > delivery_to:
        raise HTTPException(400, "The delivery start date must be on or before the end date.")
    if from_time and to_time and from_time > to_time:
        raise HTTPException(400, "The start time must be on or before the end time.")
    try:
        return service.get_accuracy(
            decision_from, decision_to, delivery_from, delivery_to, from_time, to_time
        )
    except SourceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


# DIST = Path(os.getenv("FRONTEND_DIST", "dist")).resolve()
# if (DIST / "assets").exists():
#     app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


# @app.get("/{full_path:path}", include_in_schema=False)
# def serve_client(full_path: str):
#     if full_path.startswith("api/"):
#         raise HTTPException(404, "API route not found")
#     index_file = DIST / "index.html"
#     if not index_file.exists():
#         raise HTTPException(503, "Frontend build not found. Run npm run build first.")
#     requested = (DIST / full_path).resolve()
#     if full_path and requested.is_file() and DIST in requested.parents:
#         return FileResponse(requested)
#     return FileResponse(index_file)
