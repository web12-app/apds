"""SQLite database layer (server-side only — never exposed through the API)."""
import datetime
import json
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    settings      TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS api_keys (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    prefix       TEXT NOT NULL,
    scopes       TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at   TEXT
);
CREATE TABLE IF NOT EXISTS developers (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    bio        TEXT NOT NULL DEFAULT '',
    website    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS upload_sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_slug        TEXT NOT NULL,
    version         TEXT NOT NULL,
    filename        TEXT NOT NULL,
    declared_size   INTEGER NOT NULL,
    declared_sha256 TEXT NOT NULL,
    token_hash      TEXT NOT NULL UNIQUE,
    state           TEXT NOT NULL DEFAULT 'created',
    release_id      INTEGER,
    actual_size     INTEGER,
    actual_sha256   TEXT,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS download_stats (
    app_slug TEXT NOT NULL,
    version  TEXT NOT NULL,
    day      TEXT NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (app_slug, version, day)
);
CREATE TABLE IF NOT EXISTS download_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT,
    app_slug   TEXT NOT NULL,
    version    TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS library (
    user_id   TEXT NOT NULL,
    app_slug  TEXT NOT NULL,
    kind      TEXT NOT NULL,
    added_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, app_slug, kind)
);
CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'info',
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    read_at    TEXT
);
"""


def utcnow() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def get_conn() -> sqlite3.Connection:
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db() as conn:
        conn.executescript(SCHEMA)


def get_developer(conn: sqlite3.Connection, user_id: str):
    return conn.execute(
        "SELECT * FROM developers WHERE user_id = ?", (user_id,)
    ).fetchone()


def live_download_delta(conn: sqlite3.Connection, app_slug: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(count), 0) AS n FROM download_stats WHERE app_slug = ?",
        (app_slug,),
    ).fetchone()
    return int(row["n"]) if row else 0


def notify(conn: sqlite3.Connection, user_id: str, kind: str, title: str, body: str = "") -> None:
    conn.execute(
        "INSERT INTO notifications (id, user_id, kind, title, body, created_at) VALUES (?,?,?,?,?,?)",
        (new_id("n"), user_id, kind, title, body, utcnow()),
    )


def row_to_dict(row) -> dict:
    return dict(row) if row is not None else None


def json_dumps(obj) -> str:
    return json.dumps(obj, indent=2) + "\n"
