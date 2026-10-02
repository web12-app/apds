"""Authentication and account endpoints."""
import re
import unicodedata
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from .config import settings
from .db import db, get_developer, new_id, notify, utcnow
from .security import (
    EMAIL_RE,
    USERNAME_RE,
    check_app_key,
    create_session,
    hash_password,
    limiter,
    client_ip,
    require_user,
    resolve_auth,
    session_cookie_params,
    sha256,
    validate_password,
    verify_password,
)
from .security import require_scope

router = APIRouter(dependencies=[Depends(check_app_key)])


class DeveloperIn(BaseModel):
    name: str
    bio: str = ""
    website: str = ""


class SignupIn(BaseModel):
    username: str
    email: str
    password: str
    confirm_password: str
    developer: Optional[DeveloperIn] = None


class LoginIn(BaseModel):
    identifier: str
    password: str


class AccountPatch(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None


class DeleteIn(BaseModel):
    password: str


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or "dev"


def _create_developer_row(conn, user_id: str, name: str, bio: str = "", website: str = "",
                          reserved: Optional[set] = None) -> None:
    from .db import new_id as _new_id

    reserved = reserved or set()
    slug = slugify(name)
    if len(slug) < 2:
        slug = f"dev-{slug}"
    clash = (
        conn.execute("SELECT 1 FROM developers WHERE slug = ?", (slug,)).fetchone()
        or slug in reserved
    )
    n = 2
    while clash:
        slug = f"{slugify(name)}-{n}"
        clash = (
            conn.execute("SELECT 1 FROM developers WHERE slug = ?", (slug,)).fetchone()
            or slug in reserved
        )
        n += 1
    conn.execute(
        "INSERT INTO developers (id, user_id, name, slug, bio, website, created_at) VALUES (?,?,?,?,?,?,?)",
        (_new_id("dev"), user_id, name, slug, bio[:500], website[:200], utcnow()),
    )


def user_payload(conn, user_id: str) -> dict:
    u = conn.execute(
        "SELECT id, username, email, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not u:
        raise HTTPException(404, "Account not found.")
    dev = get_developer(conn, user_id)
    keys = conn.execute(
        "SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ? AND revoked_at IS NULL",
        (user_id,),
    ).fetchone()["n"]
    unread = conn.execute(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL",
        (user_id,),
    ).fetchone()["n"]
    return {
        "id": u["id"],
        "username": u["username"],
        "email": u["email"],
        "created_at": u["created_at"],
        "developer": (
            {
                "name": dev["name"],
                "slug": dev["slug"],
                "bio": dev["bio"],
                "website": dev["website"],
                "created_at": dev["created_at"],
            }
            if dev
            else None
        ),
        "api_keys": keys,
        "unread_notifications": unread,
    }


@router.post("/api/auth/signup", status_code=201)
async def signup(body: SignupIn, request: Request, response: Response):
    limiter.check(f"signup:{client_ip(request)}", 5, 3600)

    if not USERNAME_RE.match(body.username or ""):
        raise HTTPException(422, "Username must be 3-24 characters (letters, numbers, underscores).")
    if not EMAIL_RE.match(body.email or "") or len(body.email) > 254:
        raise HTTPException(422, "Please enter a valid email address.")
    if body.password != body.confirm_password:
        raise HTTPException(422, "Passwords do not match.")
    pw_err = validate_password(body.password or "")
    if pw_err:
        raise HTTPException(422, pw_err)

    dev_name = ""
    if body.developer:
        dev_name = (body.developer.name or "").strip()
        if not 2 <= len(dev_name) <= 64:
            raise HTTPException(422, "Developer name must be 2-64 characters.")

    from .routers_apps import catalog as _catalog

    with db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (body.username,)).fetchone():
            raise HTTPException(409, "That username is already taken.")
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (body.email,)).fetchone():
            raise HTTPException(409, "An account with that email already exists.")

        user_id = new_id("usr")
        conn.execute(
            "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?,?,?,?,?)",
            (user_id, body.username, body.email, hash_password(body.password), utcnow()),
        )

        if body.developer:
            reserved = {a.get("developer_id") for a in (await _catalog())}
            _create_developer_row(
                conn, user_id, dev_name, body.developer.bio, body.developer.website, reserved
            )

        notify(conn, user_id, "welcome", "Welcome to APDS",
               "Discover great apps, or publish your own — your journey starts here.")
        token = create_session(conn, user_id, request.headers.get("user-agent", ""))
        payload = user_payload(conn, user_id)

    response.set_cookie(value=token, **session_cookie_params(request))
    return {"user": payload}


@router.post("/api/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    limiter.check(f"login:{client_ip(request)}", 10, 60)
    ident = (body.identifier or "").strip()
    limiter.check(f"login-id:{ident.lower()}", 10, 300)

    with db() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ? OR email = ?",
            (ident, ident),
        ).fetchone()
        if not row or not verify_password(body.password or "", row["password_hash"]):
            raise HTTPException(401, "Incorrect login details. Please try again.")
        token = create_session(conn, row["id"], request.headers.get("user-agent", ""))
        payload = user_payload(conn, row["id"])

    response.set_cookie(value=token, **session_cookie_params(request))
    return {"user": payload}


@router.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(settings.cookie_name)
    if token:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (sha256(token),))
    response.delete_cookie(
        settings.cookie_name, path="/", secure=False, httponly=True, samesite="lax"
    )
    return {"ok": True}


@router.get("/api/account")
async def account(request: Request):
    ctx = require_user(request)
    with db() as conn:
        return {"user": user_payload(conn, ctx.user_id)}


@router.patch("/api/account")
async def account_update(body: AccountPatch, request: Request):
    ctx = require_user(request)
    require_scope(ctx, "account.write")
    with db() as conn:
        if body.username is not None:
            if not USERNAME_RE.match(body.username):
                raise HTTPException(422, "Username must be 3-24 characters (letters, numbers, underscores).")
            clash = conn.execute(
                "SELECT 1 FROM users WHERE username = ? AND id != ?", (body.username, ctx.user_id)
            ).fetchone()
            if clash:
                raise HTTPException(409, "That username is already taken.")
            conn.execute("UPDATE users SET username = ? WHERE id = ?", (body.username, ctx.user_id))
        if body.email is not None:
            if not EMAIL_RE.match(body.email):
                raise HTTPException(422, "Please enter a valid email address.")
            clash = conn.execute(
                "SELECT 1 FROM users WHERE email = ? AND id != ?", (body.email, ctx.user_id)
            ).fetchone()
            if clash:
                raise HTTPException(409, "An account with that email already exists.")
            conn.execute("UPDATE users SET email = ? WHERE id = ?", (body.email, ctx.user_id))
        return {"user": user_payload(conn, ctx.user_id)}


@router.delete("/api/account")
async def account_delete(body: DeleteIn, request: Request, response: Response):
    ctx = require_user(request)
    require_scope(ctx, "account.write")
    with db() as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?", (ctx.user_id,)
        ).fetchone()
        if not row or not verify_password(body.password or "", row["password_hash"]):
            raise HTTPException(403, "Password verification failed.")
        conn.execute("DELETE FROM users WHERE id = ?", (ctx.user_id,))
    response.delete_cookie(
        settings.cookie_name, path="/", secure=False, httponly=True, samesite="lax"
    )
    return {"ok": True, "message": "Your account has been deleted. Published catalog data is retained."}
