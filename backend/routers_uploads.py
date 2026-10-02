"""Releases, temporary upload sessions (public upload tunnel), and downloads.

Architecture (user-facing names only — git internals stay server-side):

    Client → POST /api/upload-sessions  (temporary, single-purpose session)
           → PUT  /api/uploads/{id}     (public tunnel, streaming, token-gated)
           → POST /api/releases/{id}/publish (background processing)
"""
import hashlib
import io
import json
import os
import re
import tempfile
import zipfile
import secrets as pysecrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.background import BackgroundTask
from fastapi.responses import StreamingResponse

from .config import settings
from .db import db, json_dumps, new_id, notify, utcnow
from .gitstore import GitError, gitstore
from .routers_apps import api_scope, ensure_owner, load_app, save_app
from .security import (
    VERSION_RE,
    check_app_key,
    client_ip,
    limiter,
    require_developer,
    require_user,
    resolve_auth,
    sha256,
)

router = APIRouter(dependencies=[Depends(check_app_key)])

PACKAGE_EXTS = (".apk", ".aab", ".zip")
SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9._ -]{1,120}$")


def parse_release_id(rid: str):
    slug, _, version = rid.rpartition("--")
    if not slug or not version:
        raise HTTPException(404, "Release not found.")
    return slug, version


def find_version(app: dict, version: str) -> Optional[dict]:
    for v in app.get("versions", []):
        if v.get("version") == version:
            return v
    return None


def release_id(slug: str, version: str) -> str:
    return f"{slug}--{version}"


def stored_release_id(slug: str, version: str) -> Optional[int]:
    with db() as conn:
        row = conn.execute(
            """SELECT release_id FROM upload_sessions
               WHERE app_slug = ? AND version = ? AND state = 'stored' AND release_id IS NOT NULL
               ORDER BY created_at DESC LIMIT 1""",
            (slug, version),
        ).fetchone()
    return int(row["release_id"]) if row else None


# ------------------------------------------------------------------ create release

class ReleaseIn(BaseModel):
    app: str
    version: str
    notes: str = ""
    filename: str
    size: int
    sha256: str


@router.post("/api/releases", status_code=201)
async def create_release(body: ReleaseIn, request: Request):
    ctx = require_developer(request)
    api_scope(ctx, "releases.write")

    app = await load_app(body.app, allow_unpublished=True)
    ensure_owner(ctx, app)

    if not VERSION_RE.match(body.version or ""):
        raise HTTPException(422, "Version must look like 1.0 or 1.2.3-beta")
    if find_version(app, body.version):
        raise HTTPException(409, "That version already exists for this app.")

    filename = os.path.basename((body.filename or "").strip())
    if not filename or not SAFE_FILENAME_RE.match(filename):
        raise HTTPException(422, "Invalid filename.")
    if not filename.lower().endswith(PACKAGE_EXTS):
        raise HTTPException(422, "Package must be an .apk, .aab or .zip file.")
    if not (0 < body.size <= settings.max_upload_bytes):
        raise HTTPException(
            422, f"File size must be between 1 byte and {settings.max_upload_mb} MB."
        )
    if not re.match(r"^[a-f0-9]{64}$", (body.sha256 or "").lower()):
        raise HTTPException(422, "SHA-256 checksum must be 64 hex characters.")

    entry = {
        "version": body.version,
        "notes": (body.notes or "").strip()[:4000],
        "size_kb": (body.size + 1023) // 1024,
        "size": body.size,
        "min_os": "8.0",
        "status": "draft",
        "created_at": utcnow()[:10],
        "published_at": None,
        "downloads": 0,
        "sha256": body.sha256.lower(),
        "filename": filename,
    }
    app.setdefault("versions", []).append(entry)
    await save_app(app, f"release draft: {body.app} v{body.version}")

    return {"id": release_id(body.app, body.version), "status": "draft"}


# ------------------------------------------------------------------ upload sessions

class SessionIn(BaseModel):
    release_id: str


@router.post("/api/upload-sessions", status_code=201)
async def create_upload_session(body: SessionIn, request: Request):
    ctx = require_developer(request)
    api_scope(ctx, "uploads.create")

    slug, version = parse_release_id(body.release_id)
    app = await load_app(slug, allow_unpublished=True)
    ensure_owner(ctx, app)
    entry = find_version(app, version)
    if not entry:
        raise HTTPException(404, "Release not found.")
    if entry.get("status") not in ("draft", "failed"):
        raise HTTPException(409, "This release already has an uploaded package.")

    sid = new_id("us")
    token = "ut_" + pysecrets.token_urlsafe(24)
    import datetime as _dt

    expires = (
        _dt.datetime.now(_dt.timezone.utc)
        + _dt.timedelta(minutes=settings.upload_session_ttl_min)
    ).isoformat(timespec="seconds")

    exact_size = int(entry.get("size") or (int(entry["size_kb"]) * 1024))

    with db() as conn:
        # single-purpose: cancel any previous open session for this release
        conn.execute(
            """UPDATE upload_sessions SET state = 'canceled'
               WHERE app_slug = ? AND version = ? AND state = 'created'""",
            (slug, version),
        )
        conn.execute(
            """INSERT INTO upload_sessions
               (id, user_id, app_slug, version, filename, declared_size, declared_sha256,
                token_hash, state, created_at, expires_at)
               VALUES (?,?,?,?,?,?,?,?, 'created', ?, ?)""",
            (
                sid, ctx.user_id, slug, version, entry["filename"],
                exact_size, entry.get("sha256") or "",
                sha256(token), utcnow(), expires,
            ),
        )

    return {
        "session_id": sid,
        "upload_token": token,
        "expires_at": expires,
        "upload_url": f"/api/uploads/{sid}",
        "method": "PUT",
        "headers": {"X-Upload-Token": token},
        "max_size": exact_size,
    }


def _get_session(session_id: str):
    with db() as conn:
        return conn.execute(
            "SELECT * FROM upload_sessions WHERE id = ?", (session_id,)
        ).fetchone()


@router.get("/api/upload-sessions/{session_id}")
async def get_upload_session(session_id: str, request: Request):
    ctx = require_user(request)
    row = _get_session(session_id)
    if not row or row["user_id"] != ctx.user_id:
        raise HTTPException(404, "Upload session not found.")
    return {
        "session_id": row["id"],
        "state": row["state"],
        "app": row["app_slug"],
        "version": row["version"],
        "filename": row["filename"],
        "declared_size": row["declared_size"],
        "actual_size": row["actual_size"],
        "expires_at": row["expires_at"],
        "created_at": row["created_at"],
    }


@router.delete("/api/upload-sessions/{session_id}")
async def cancel_upload_session(session_id: str, request: Request):
    ctx = require_user(request)
    row = _get_session(session_id)
    if not row or row["user_id"] != ctx.user_id:
        raise HTTPException(404, "Upload session not found.")
    if row["state"] == "created":
        with db() as conn:
            conn.execute(
                "UPDATE upload_sessions SET state = 'canceled' WHERE id = ?", (session_id,)
            )
    return {"state": "canceled" if row["state"] == "created" else row["state"]}


# ------------------------------------------------------------------ the upload tunnel

@router.put("/api/uploads/{session_id}")
async def tunnel_upload(session_id: str, request: Request):
    token = request.headers.get("x-upload-token", "")
    row = _get_session(session_id)
    if not row or row["token_hash"] != sha256(token):
        raise HTTPException(404, "Upload session not found or token invalid.")
    if row["state"] != "created":
        raise HTTPException(409, "This upload session is no longer accepting files.")
    if row["expires_at"] < utcnow():
        raise HTTPException(410, "This upload session has expired.")

    slug, version, declared_size = row["app_slug"], row["version"], row["declared_size"]

    fd, tmp_path = tempfile.mkstemp(prefix="apds_upload_")
    digest = hashlib.sha256()
    total = 0
    try:
        with os.fdopen(fd, "wb") as f:
            async for chunk in request.stream():
                if not chunk:
                    continue
                total += len(chunk)
                if total > declared_size:
                    raise HTTPException(413, "Upload exceeds the declared file size.")
                digest.update(chunk)
                f.write(chunk)

        if total != declared_size:
            raise HTTPException(400, "Incomplete upload — the connection closed early. Please retry.")
        actual_sha = digest.hexdigest()
        if actual_sha != row["declared_sha256"].lower():
            raise HTTPException(400, "Checksum mismatch — the file changed during transfer. Please retry.")

        with open(tmp_path, "rb") as f:
            if f.read(4) not in (b"PK\x03\x04", b"PK\x05\x06"):
                raise HTTPException(400, "This does not look like a valid package (bad file signature).")

        with db() as conn:
            conn.execute(
                "UPDATE upload_sessions SET state = 'storing' WHERE id = ?", (session_id,)
            )

        app = await load_app(slug, allow_unpublished=True)
        entry = find_version(app, version)
        if not entry:
            raise HTTPException(404, "Release not found.")

        rel_id = row["release_id"]
        if not rel_id:
            rel_id = await gitstore.create_draft_release(
                tag=f"apps/{slug}/v{version}",
                name=f"{app['name']} {version}",
                body=entry.get("notes", ""),
            )
            with db() as conn:
                conn.execute(
                    "UPDATE upload_sessions SET release_id = ? WHERE id = ?",
                    (rel_id, session_id),
                )

        await gitstore.upload_asset(rel_id, entry["filename"], tmp_path)

        entry["status"] = "uploaded"
        entry["sha256"] = actual_sha
        entry["size_kb"] = (total + 1023) // 1024
        entry["size"] = total
        await save_app(app, f"release uploaded: {slug} v{version}")

        with db() as conn:
            conn.execute(
                """UPDATE upload_sessions SET state = 'stored', actual_size = ?, actual_sha256 = ?
                   WHERE id = ?""",
                (total, actual_sha, session_id),
            )
            notify(conn, row["user_id"], "upload", f"Upload complete: {app['name']} {version}",
                   "Your package was received and verified. Ready to publish.")

        return {
            "ok": True,
            "size": total,
            "sha256": actual_sha,
            "status": "uploaded",
            "next": "publish",
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ------------------------------------------------------------------ release status & publish

@router.get("/api/releases/{rid}")
async def release_status(rid: str, request: Request):
    ctx = require_user(request)
    slug, version = parse_release_id(rid)
    app = await load_app(slug, allow_unpublished=True)
    ensure_owner(ctx, app)
    entry = find_version(app, version)
    if not entry:
        raise HTTPException(404, "Release not found.")

    status = entry.get("status", "draft")
    if status in ("uploaded", "processing"):
        rel_id = stored_release_id(slug, version)
        if rel_id:
            rel = await gitstore.get_release(rel_id)
            if rel and not rel.get("draft", True) and status != "published":
                # the background pipeline finished — reflect it
                entry["status"] = "published"
                entry["published_at"] = utcnow()[:10]
                app["updated_at"] = utcnow()[:10]
                if app.get("status") == "draft":
                    app["status"] = "published"  # first published release lists the app
                await save_app(app, f"release published: {slug} v{version}")
                status = "published"
            elif status == "processing" and rel.get("draft", True):
                if entry.get("created_at", "") < (utcnow()[:10]):
                    pass  # same-day; keep processing
    elif status == "processing":
        # no stored session found — recover to failed so the developer can retry
        status = "failed"

    with db() as conn:
        live = conn.execute(
            "SELECT COALESCE(SUM(count),0) AS n FROM download_stats WHERE app_slug = ? AND version = ?",
            (slug, version),
        ).fetchone()["n"]

    return {
        "id": release_id(slug, version),
        "app": slug,
        "app_name": app["name"],
        "version": version,
        "notes": entry.get("notes", ""),
        "status": status,
        "filename": entry.get("filename"),
        "size_kb": entry.get("size_kb"),
        "sha256": entry.get("sha256"),
        "created_at": entry.get("created_at"),
        "published_at": entry.get("published_at"),
        "downloads": int(entry.get("downloads", 0)) + int(live),
        "checks": {
            "package_type": entry.get("filename", "").lower().endswith(PACKAGE_EXTS),
            "checksum": bool(entry.get("sha256")),
            "stored": status in ("uploaded", "processing", "published"),
        },
    }


@router.post("/api/releases/{rid}/publish")
async def publish_release(rid: str, request: Request):
    ctx = require_developer(request)
    api_scope(ctx, "releases.write")

    slug, version = parse_release_id(rid)
    app = await load_app(slug, allow_unpublished=True)
    ensure_owner(ctx, app)
    entry = find_version(app, version)
    if not entry:
        raise HTTPException(404, "Release not found.")

    status = entry.get("status")
    if status == "draft":
        raise HTTPException(409, "Upload the package before publishing.")
    if status == "processing":
        raise HTTPException(409, "This release is already being processed.")
    if status == "published":
        return {"status": "published", "mode": "none"}

    rel_id = stored_release_id(slug, version)
    if not rel_id:
        raise HTTPException(409, "No stored package found for this release.")

    entry["status"] = "processing"
    await save_app(app, f"release processing: {slug} v{version}")

    dispatched = await gitstore.dispatch_processing(slug, version, rel_id, entry.get("sha256") or "")
    if dispatched:
        with db() as conn:
            notify(conn, ctx.user_id, "release", f"Processing {app['name']} {version}",
                   "Your release is being validated and will publish automatically.")
        return {"status": "processing", "mode": "workflow"}

    # Pipeline unavailable — publish directly (same validation already ran at upload time)
    try:
        await gitstore.publish_release(rel_id)
        entry["status"] = "published"
        entry["published_at"] = utcnow()[:10]
        app["updated_at"] = utcnow()[:10]
        if app.get("status") == "draft":
            app["status"] = "published"
        await save_app(app, f"release published: {slug} v{version}")
        with db() as conn:
            notify(conn, ctx.user_id, "release", f"Published {app['name']} {version}",
                   "Your release is now live in the store.")
        return {"status": "published", "mode": "direct"}
    except GitError:
        raise HTTPException(502, "Unable to complete this request. Please try again.")


# ------------------------------------------------------------------ downloads

@router.get("/api/releases/{rid}/download")
async def download_release(rid: str, request: Request):
    limiter.check(f"dl:{client_ip(request)}", 60, 60)

    slug, version = parse_release_id(rid)
    app = await load_app(slug)  # published only
    entry = find_version(app, version)
    if not entry or entry.get("status") != "published":
        raise HTTPException(404, "This version is not available for download.")

    ctx = resolve_auth(request)
    today = utcnow()[:10]
    with db() as conn:
        conn.execute(
            """INSERT INTO download_stats (app_slug, version, day, count) VALUES (?,?,?,1)
               ON CONFLICT(app_slug, version, day) DO UPDATE SET count = count + 1""",
            (slug, version, today),
        )
        conn.execute(
            "INSERT INTO download_history (user_id, app_slug, version, bytes, created_at) VALUES (?,?,?,?,?)",
            (ctx.user_id if ctx else None, slug, version, int(entry.get("size_kb", 0)) * 1024, utcnow()),
        )
        if ctx:
            conn.execute(
                "INSERT OR IGNORE INTO library (user_id, app_slug, kind, added_at) VALUES (?,?, 'installed', ?)",
                (ctx.user_id, slug, utcnow()),
            )

    filename = entry.get("filename") or f"{slug}-{version}.zip"
    checksum = entry.get("sha256") or ""

    rel_id = stored_release_id(slug, version)
    asset = None
    if rel_id:
        rel = await gitstore.get_release(rel_id)
        if rel.get("assets"):
            asset = rel["assets"][0]

    if asset:
        req = gitstore.uploads.build_request(
            "GET", asset["url"], headers={"Accept": "application/octet-stream"}
        )
        upstream = await gitstore.uploads.send(req, stream=True)
        if upstream.status_code >= 400:
            await upstream.aclose()
            raise HTTPException(502, "Unable to complete this request. Please try again.")
        media = (
            "application/vnd.android.package-archive"
            if filename.lower().endswith(".apk")
            else "application/octet-stream"
        )
        return StreamingResponse(
            upstream.aiter_bytes(),
            media_type=media,
            headers={
                "Content-Disposition": f'attachment; filename="{asset["name"]}"',
                "Content-Length": str(asset["size"]),
                "X-Checksum-Sha256": checksum,
            },
            background=BackgroundTask(upstream.aclose),
        )

    # No stored binary (e.g. seeded catalog items): stream a demo package so the
    # download experience (progress, checksum, install entry) can be verified.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr(
            "app.json",
            json.dumps(
                {k: app.get(k) for k in ("slug", "name", "developer", "category", "tagline", "version")},
                indent=2,
            ),
        )
        zf.writestr(
            "README.txt",
            (
                f"APDS demo package: {app['name']} {version}\n"
                "This seeded catalog entry has no real binary attached.\n"
                "Developer-uploaded releases serve their actual package files.\n"
            ),
        )
        pad = max(0, 3 * 1024 * 1024 - buf.tell() - 128)
        zf.writestr("data/payload.bin", b"\0" * pad)

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{slug}-{version}-demo.zip"',
            "X-Demo-Package": "true",
        },
    )
