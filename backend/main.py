"""apds backend — FastAPI + SQLite.

Serves:
  - /api/*   JSON API
  - /*       built Vite frontend (frontend/dist), when present

Run locally:  uvicorn main:app --reload --port 8000   (from backend/)
Docs:         http://localhost:8000/docs

Schema source of truth: private repo web12-app/dbs (schema.sql).
"""

import os
import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).with_name("dbs.db"))))
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = FastAPI(title="apds API", version="0.1.0")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as db, closing(db.cursor()) as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        db.commit()


class RecordIn(BaseModel):
    name: str


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/records")
def list_records():
    with closing(get_db()) as db, closing(db.cursor()) as cur:
        cur.execute("SELECT id, name, created_at FROM records ORDER BY id DESC")
        return [dict(row) for row in cur.fetchall()]


@app.post("/api/records", status_code=201)
def create_record(rec: RecordIn):
    name = rec.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name must not be empty")
    with closing(get_db()) as db, closing(db.cursor()) as cur:
        cur.execute("INSERT INTO records (name) VALUES (?)", (name,))
        db.commit()
        return {"id": cur.lastrowid, "name": name}


@app.delete("/api/records/{record_id}", status_code=204)
def delete_record(record_id: int):
    with closing(get_db()) as db, closing(db.cursor()) as cur:
        cur.execute("DELETE FROM records WHERE id = ?", (record_id,))
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="record not found")


# Serve the built Vite frontend (present when built via Dockerfile or npm run build).
# Mounted last, so /api/* routes take precedence.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
