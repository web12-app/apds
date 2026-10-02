"""Developer profile, dashboard stats, API keys, notifications."""
import secrets as pysecrets
import datetime as dt
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .db import db, json_dumps, new_id, notify, utcnow, live_download_delta
from .gitstore import gitstore
from .routers_apps import api_scope, catalog, summary_of
from .routers_auth import slugify, user_payload
from .security import ALLOWED_SCOPES, require_developer, require_user, sha256

router = APIRouter()


# ------------------------------------------------------------------ profile

class DeveloperCreate(BaseModel):
    name: str
    bio: str = ""
    website: str = ""


@router.post("/api/developer", status_code=201)
async def create_developer(body: DeveloperCreate, request: Request):
    ctx = require_user(request)
    if ctx.developer:
        raise HTTPException(409, "You already have a developer profile.")

    name = (body.name or "").strip()
    if not 2 <= len(name) <= 64:
        raise HTTPException(422, "Developer name must be 2-64 characters.")

    slug = slugify(name)
    catalog_ids = {a.get("developer_id") for a in (await catalog())}
    with db() as conn:
        clash = conn.execute("SELECT 1 FROM developers WHERE slug = ?", (slug,)).fetchone()
        n = 2
        while clash or slug in catalog_ids:
            slug = f"{slugify(name)}-{n}"
            clash = conn.execute("SELECT 1 FROM developers WHERE slug = ?", (slug,)).fetchone()
            n += 1
        conn.execute(
            "INSERT INTO developers (id, user_id, name, slug, bio, website, created_at) VALUES (?,?,?,?,?,?,?)",
            (new_id("dev"), ctx.user_id, name, slug, body.bio[:500], body.website[:200], utcnow()),
        )
        notify(conn, ctx.user_id, "developer", "Developer account active",
               "You can now create app listings and publish releases.")
    return {"developer": {"name": name, "slug": slug, "bio": body.bio, "website": body.website}}


@router.get("/api/developer/apps")
async def my_apps(request: Request):
    ctx = require_developer(request)
    apps = [a for a in (await catalog()) if a.get("developer_id") == ctx.developer["slug"]]
    with db() as conn:
        deltas = {}
        for a in apps:
            deltas[a["slug"]] = live_download_delta(conn, a["slug"])
    for a in apps:
        a["downloads"] = int(a.get("downloads", 0)) + deltas.get(a["slug"], 0)
        a["versions"] = sorted(
            a.get("versions", []), key=lambda v: v.get("created_at", ""), reverse=True
        )
    apps.sort(key=lambda a: a.get("updated_at", ""), reverse=True)
    return {"items": apps}


@router.get("/api/developer/stats")
async def developer_stats(request: Request):
    ctx = require_developer(request)
    apps = [a for a in (await catalog()) if a.get("developer_id") == ctx.developer["slug"]]

    total_downloads = 0
    published_apps = 0
    active_releases = 0
    per_app = []
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).strftime("%Y-%m-%d")

    with db() as conn:
        for a in apps:
            live = live_download_delta(conn, a["slug"])
            downloads = int(a.get("downloads", 0)) + live
            total_downloads += downloads
            if a.get("status") == "published":
                published_apps += 1
            versions = a.get("versions", [])
            active_releases += sum(
                1 for v in versions
                if v.get("status") == "published" and (v.get("published_at") or "") >= cutoff
            )
            per_app.append({
                "slug": a["slug"],
                "name": a["name"],
                "status": a.get("status"),
                "downloads": downloads,
                "rating": a.get("rating", 0),
                "ratings_count": a.get("ratings_count", 0),
                "versions": len(versions),
                "updated_at": a.get("updated_at"),
            })

        recent_uploads = [
            dict(r) for r in conn.execute(
                """SELECT app_slug, version, state, created_at FROM upload_sessions
                   WHERE user_id = ? ORDER BY created_at DESC LIMIT 10""",
                (ctx.user_id,),
            ).fetchall()
        ]

        slugs = [a["slug"] for a in apps]
        recent_downloads = []
        if slugs:
            qmarks = ",".join("?" * len(slugs))
            rows = conn.execute(
                f"""SELECT day, SUM(count) AS n FROM download_stats
                    WHERE app_slug IN ({qmarks}) AND day >= date('now', '-13 days')
                    GROUP BY day ORDER BY day""",
                slugs,
            ).fetchall()
            recent_downloads = [{"day": r["day"], "count": int(r["n"])} for r in rows]

    return {
        "total_downloads": total_downloads,
        "published_apps": published_apps,
        "total_apps": len(apps),
        "active_releases": active_releases,
        "per_app": sorted(per_app, key=lambda p: -p["downloads"]),
        "recent_uploads": recent_uploads,
        "recent_downloads": recent_downloads,
    }


# ------------------------------------------------------------------ API keys

class KeyCreate(BaseModel):
    name: str
    scopes: List[str]


def _gen_key() -> str:
    return "apk_" + pysecrets.token_urlsafe(24)


@router.get("/api/keys")
async def list_keys(request: Request):
    ctx = require_user(request)
    with db() as conn:
        rows = conn.execute(
            "SELECT id, name, prefix, scopes, created_at, last_used_at, revoked_at "
            "FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
            (ctx.user_id,),
        ).fetchall()
    import json as _json

    return {
        "items": [
            {**dict(r), "scopes": _json.loads(r["scopes"])} for r in rows
        ]
    }


@router.post("/api/keys", status_code=201)
async def create_key(body: KeyCreate, request: Request):
    ctx = require_user(request)
    api_scope(ctx, "account.write")

    name = (body.name or "").strip()
    if not 1 <= len(name) <= 64:
        raise HTTPException(422, "Key name must be 1-64 characters.")
    scopes = sorted(set(body.scopes or []))
    if not scopes or any(s not in ALLOWED_SCOPES for s in scopes):
        raise HTTPException(422, f"Scopes must be a non-empty subset of: {', '.join(ALLOWED_SCOPES)}")

    key = _gen_key()
    kid = new_id("key")
    with db() as conn:
        conn.execute(
            "INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, created_at) VALUES (?,?,?,?,?,?,?)",
            (kid, ctx.user_id, name, sha256(key), key[:12], json_dumps(scopes).strip(), utcnow()),
        )
        notify(conn, ctx.user_id, "security", f"API key created: {name}",
               "Store it safely — it will not be shown again.")
    return {"id": kid, "name": name, "key": key, "scopes": scopes, "created_at": utcnow()}


@router.delete("/api/keys/{key_id}")
async def revoke_key(key_id: str, request: Request):
    ctx = require_user(request)
    api_scope(ctx, "account.write")
    with db() as conn:
        row = conn.execute(
            "SELECT id FROM api_keys WHERE id = ? AND user_id = ?", (key_id, ctx.user_id)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Key not found.")
        conn.execute(
            "UPDATE api_keys SET revoked_at = ? WHERE id = ?", (utcnow(), key_id)
        )
    return {"ok": True}


@router.post("/api/keys/{key_id}/rotate")
async def rotate_key(key_id: str, request: Request):
    ctx = require_user(request)
    api_scope(ctx, "account.write")
    with db() as conn:
        row = conn.execute(
            "SELECT name, scopes FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
            (key_id, ctx.user_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Key not found.")
        import json as _json

        scopes = _json.loads(row["scopes"])
        conn.execute("UPDATE api_keys SET revoked_at = ? WHERE id = ?", (utcnow(), key_id))
        key = _gen_key()
        new_kid = new_id("key")
        conn.execute(
            "INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, created_at) VALUES (?,?,?,?,?,?,?)",
            (new_kid, ctx.user_id, row["name"], sha256(key), key[:12], row["scopes"], utcnow()),
        )
    return {"id": new_kid, "name": row["name"], "key": key, "scopes": scopes}


# ------------------------------------------------------------------ notifications

@router.get("/api/notifications")
async def notifications(request: Request):
    ctx = require_user(request)
    with db() as conn:
        rows = conn.execute(
            "SELECT id, kind, title, body, created_at, read_at FROM notifications "
            "WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            (ctx.user_id,),
        ).fetchall()
        unread = conn.execute(
            "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL",
            (ctx.user_id,),
        ).fetchone()["n"]
    return {"items": [dict(r) for r in rows], "unread": unread}


@router.post("/api/notifications/read")
async def notifications_read(request: Request):
    ctx = require_user(request)
    with db() as conn:
        conn.execute(
            "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
            (utcnow(), ctx.user_id),
        )
    return {"ok": True}
