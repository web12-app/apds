"""Authentication, API keys, scopes, and rate limiting.

Two independent layers:
  1. X-App-Key  — public client identifier; required on every /api route
                 (except public bootstrap routes). Not a secret.
  2. Identity   — session cookie (web app) OR scoped API key
                 (Authorization: Bearer <key> / X-API-Key: <key>).
"""
import hashlib
import json
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional, Set

import bcrypt
from fastapi import HTTPException, Request

from .config import settings
from .db import db, get_developer, utcnow

ALLOWED_SCOPES = [
    "apps.read", "apps.write", "uploads.create", "releases.write",
    "account.read", "account.write",
]

# ---------------------------------------------------------------- passwords

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


# ---------------------------------------------------------------- tokens

def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ---------------------------------------------------------------- validation

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,24}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
VERSION_RE = re.compile(r"^\d+(\.\d+){0,3}(-[a-z0-9.]+)?$")
PACKAGE_RE = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+){1,4}$")
SLUG_RE = re.compile(r"^[a-z0-9-]{2,64}$")


def validate_password(password: str) -> Optional[str]:
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password is too long."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain both letters and numbers."
    return None


# ---------------------------------------------------------------- rate limiting

class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict = defaultdict(deque)

    def check(self, key: str, limit: int, window_s: int) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and q[0] < now - window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "Too many requests. Please slow down and try again shortly.")
        q.append(now)


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------- app key gate

def check_app_key(request: Request) -> None:
    key = request.headers.get("x-app-key") or request.query_params.get("app_key")
    if not key or key != settings.app_key:
        raise HTTPException(401, "Invalid or missing app key.")
    limiter.check(f"ip:{client_ip(request)}", 600, 60)


# ---------------------------------------------------------------- identity

@dataclass
class AuthContext:
    user_id: str
    username: str
    developer: Optional[dict]
    scopes: Optional[Set[str]]  # None => interactive session (full access to own data)
    via: str  # "session" | "api_key"

    def has_scope(self, scope: str) -> bool:
        if self.scopes is None:
            return True  # interactive; ownership enforced separately
        return scope in self.scopes


def resolve_auth(request: Request) -> Optional[AuthContext]:
    bearer = request.headers.get("authorization", "")
    api_key = request.headers.get("x-api-key", "")
    token = None
    if bearer.lower().startswith("bearer "):
        token = bearer[7:].strip()
    elif api_key:
        token = api_key.strip()
    if token:
        with db() as conn:
            row = conn.execute(
                """SELECT k.id AS key_id, k.user_id, k.scopes, k.last_used_at, u.username
                   FROM api_keys k JOIN users u ON u.id = k.user_id
                   WHERE k.key_hash = ? AND k.revoked_at IS NULL""",
                (sha256(token),),
            ).fetchone()
            if not row:
                return None
            conn.execute(
                "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
                (utcnow(), row["key_id"]),
            )
            dev = get_developer(conn, row["user_id"])
            return AuthContext(
                user_id=row["user_id"],
                username=row["username"],
                developer=dict(dev) if dev else None,
                scopes=set(json.loads(row["scopes"])),
                via="api_key",
            )

    session_token = request.cookies.get(settings.cookie_name)
    if session_token:
        with db() as conn:
            row = conn.execute(
                """SELECT s.token_hash, u.id AS user_id, u.username
                   FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.token_hash = ? AND s.expires_at > ?""",
                (sha256(session_token), utcnow()),
            ).fetchone()
            if not row:
                return None
            dev = get_developer(conn, row["user_id"])
            return AuthContext(
                user_id=row["user_id"],
                username=row["username"],
                developer=dict(dev) if dev else None,
                scopes=None,
                via="session",
            )
    return None


def require_user(request: Request) -> AuthContext:
    check_app_key(request)
    ctx = resolve_auth(request)
    if not ctx:
        raise HTTPException(401, "Authentication required.")
    return ctx


def require_developer(request: Request) -> AuthContext:
    ctx = require_user(request)
    if not ctx.developer:
        raise HTTPException(403, "A developer account is required for this action.")
    return ctx


def require_scope(ctx: AuthContext, scope: str) -> None:
    if not ctx.has_scope(scope):
        raise HTTPException(403, f"This API key is missing the required scope: {scope}.")


# ---------------------------------------------------------------- sessions

def create_session(conn, user_id: str, user_agent: str = "") -> str:
    import datetime
    import secrets

    token = "sess_" + secrets.token_urlsafe(32)
    expires = (
        datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=settings.session_ttl_days)
    ).isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
        (sha256(token), user_id, utcnow(), expires, user_agent[:200]),
    )
    return token


def session_cookie_params(request: Request) -> dict:
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    return {
        "key": settings.cookie_name,
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "max_age": settings.session_ttl_days * 86400,
        "path": "/",
    }
