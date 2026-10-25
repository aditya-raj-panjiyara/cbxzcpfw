"""Small SQLite cache for immutable historical Elexon records."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path


class WindRepository:
    def __init__(self, database_path: str):
        if database_path != ":memory:":
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(database_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS forecasts (
                    start_time TEXT NOT NULL,
                    publish_time TEXT NOT NULL,
                    generation REAL NOT NULL,
                    retrieved_at TEXT NOT NULL,
                    PRIMARY KEY (start_time, publish_time)
                );
                CREATE INDEX IF NOT EXISTS idx_forecasts_publish ON forecasts(publish_time);
                CREATE TABLE IF NOT EXISTS actuals (
                    start_time TEXT PRIMARY KEY,
                    publish_time TEXT NOT NULL,
                    generation REAL NOT NULL,
                    retrieved_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            self.connection.commit()

    def save_forecasts(self, records: list[dict]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        rows = [(r["startTime"], r["publishTime"], float(r["generation"]), now) for r in records]
        with self.lock:
            self.connection.executemany(
                "INSERT OR REPLACE INTO forecasts(start_time,publish_time,generation,retrieved_at) VALUES(?,?,?,?)",
                rows,
            )
            self.connection.commit()

    def save_actuals(self, records: list[dict]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        rows = [(r["startTime"], r["publishTime"], float(r["generation"]), now) for r in records]
        with self.lock:
            self.connection.executemany(
                "INSERT OR REPLACE INTO actuals(start_time,publish_time,generation,retrieved_at) VALUES(?,?,?,?)",
                rows,
            )
            self.connection.commit()

    def forecasts(self, start: str, end: str) -> list[dict]:
        with self.lock:
            rows = self.connection.execute(
                "SELECT start_time AS startTime,publish_time AS publishTime,generation,retrieved_at AS retrievedAt FROM forecasts WHERE publish_time>=? AND publish_time<=? ORDER BY publish_time",
                (start, end),
            ).fetchall()
        return [dict(row) for row in rows]

    def actuals(self, start: str, end: str) -> list[dict]:
        with self.lock:
            rows = self.connection.execute(
                "SELECT start_time AS startTime,publish_time AS publishTime,generation,retrieved_at AS retrievedAt FROM actuals WHERE start_time>=? AND start_time<? ORDER BY start_time",
                (start, end),
            ).fetchall()
        return [dict(row) for row in rows]

    def set_metadata(self, key: str, value: dict) -> None:
        with self.lock:
            self.connection.execute(
                "INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)",
                (key, json.dumps(value)),
            )
            self.connection.commit()

    def metadata(self, key: str) -> dict | None:
        with self.lock:
            row = self.connection.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def all_metadata(self) -> dict[str, dict]:
        with self.lock:
            rows = self.connection.execute("SELECT key,value FROM metadata").fetchall()
        return {row[0]: json.loads(row[1]) for row in rows}
