"""Marketplace catalog: apps, categories, search, details, reviews, library, assets."""
import base64
import binascii
import json
import re
import time
import unicodedata
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from .db import db, live_download_delta, new_id, notify, utcnow, json_dumps
from .gitstore import GitError, gitstore
from .routers_auth import slugify, user_payload
from .security import check_app_key, require_user, require_scope

router = APIRouter(dependencies=[Depends(check_app_key)])

IMAGE_MAGIC = {
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpg",
    b"GIF8": "gif",
    b"RIFF": "webp",  # + WEBP at offset 8
}


# ------------------------------------------------------------------ helpers

async def catalog() -> list:
    return await gitstore.get_json("data/apps.json", default=[])


def summary_of(app: dict) -> dict:
    keys = ["slug", "name", "developer", "developer_id", "category", "tagline", "icon",
            "tags", "rating", "ratings_count", "downloads", "version", "status",
            "featured", "trending", "created_at", "updated_at"]
    return {k: app.get(k) for k in keys}


async def load_app(slug: str, allow_unpublished: bool = False) -> dict:
    try:
        app = await gitstore.get_json(f"data/apps/{slug}.json")
    except GitError:
        raise HTTPException(404, "App not found.")
    if not allow_unpublished and app.get("status") != "published":
        raise HTTPException(404, "App not found.")
    return app


async def save_app(app: dict, message: str) -> None:
    idx = [i for i in (await catalog()) if i["slug"] != app["slug"]]
    idx.append(summary_of(app))
    idx.sort(key=lambda i: i["slug"])
    await gitstore.commit_files(
        {
            f"data/apps/{app['slug']}.json": json_dumps(app),
            "data/apps.json": json_dumps(idx),
        },
        message,
    )


def live_deltas(slugs: Optional[list] = None) -> dict:
    with db() as conn:
        if slugs:
            qmarks = ",".join("?" * len(slugs))
            rows = conn.execute(
                f"SELECT app_slug, SUM(count) AS n FROM download_stats WHERE app_slug IN ({qmarks}) GROUP BY app_slug",
                slugs,
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT app_slug, SUM(count) AS n FROM download_stats GROUP BY app_slug"
            ).fetchall()
    return {r["app_slug"]: int(r["n"]) for r in rows}


def with_delta(app: dict, deltas: dict) -> dict:
    out = dict(app)
    out["downloads"] = int(app.get("downloads", 0)) + deltas.get(app["slug"], 0)
    return out


def api_scope(ctx, scope: str) -> None:
    """Scoped API keys must carry the scope; sessions are checked via ownership."""
    require_scope(ctx, scope)


def ensure_owner(ctx, app: dict) -> None:
    if not ctx.developer or ctx.developer.get("slug") != app.get("developer_id"):
        raise HTTPException(403, "You do not have permission to manage this app.")


# ------------------------------------------------------------------ listings

@router.get("/api/apps")
async def list_apps(
    category: Optional[str] = None,
    featured: Optional[bool] = None,
    trending: Optional[bool] = None,
    new: Optional[bool] = None,
    q: Optional[str] = None,
    sort: str = "popular",
    limit: int = 24,
    offset: int = 0,
):
    limit = max(1, min(limit, 100))
    apps = [a for a in (await catalog()) if a.get("status") == "published"]
    if category:
        apps = [a for a in apps if a.get("category") == category]
    if featured is not None:
        apps = [a for a in apps if bool(a.get("featured")) == featured]
    if trending is not None:
        apps = [a for a in apps if bool(a.get("trending")) == trending]
    if q:
        ql = q.lower()
        apps = [a for a in apps if ql in a["name"].lower()
                or ql in a.get("developer", "").lower()
                or ql in a.get("tagline", "").lower()
                or any(ql in t.lower() for t in a.get("tags", []))]

    deltas = live_deltas()
    apps = [with_delta(a, deltas) for a in apps]

    if new:
        sort = "updated"
    sorters = {
        "popular": lambda a: (-a["downloads"], a["name"]),
        "rating": lambda a: (-a.get("rating", 0), -a["downloads"]),
        "newest": lambda a: a.get("created_at", ""),
        "updated": lambda a: a.get("updated_at", ""),
        "name": lambda a: a["name"].lower(),
    }
    apps.sort(key=sorters.get(sort, sorters["popular"]), reverse=sort in ("newest", "updated"))

    return {"items": apps[offset: offset + limit], "total": len(apps)}


@router.get("/api/categories")
async def categories():
    cats = await gitstore.get_json("data/categories.json", default=[])
    counts = {}
    for a in await catalog():
        if a.get("status") == "published":
            counts[a.get("category")] = counts.get(a.get("category"), 0) + 1
    for c in cats:
        c["count"] = counts.get(c["slug"], 0)
    return cats


# ------------------------------------------------------------------ details

@router.get("/api/apps/{slug}")
async def app_details(slug: str, request: Request):
    try:
        app = await gitstore.get_json(f"data/apps/{slug}.json")
    except GitError:
        raise HTTPException(404, "App not found.")

    if app.get("status") != "published":
        # unpublished / draft apps are only visible to their owner
        from .security import resolve_auth

        ctx = resolve_auth(request)
        if not ctx or not ctx.developer or ctx.developer.get("slug") != app.get("developer_id"):
            raise HTTPException(404, "App not found.")

    reviews = await gitstore.get_json(f"data/reviews/{slug}.json", default=[])
    reviews = sorted(reviews, key=lambda r: r.get("created_at", ""), reverse=True)

    others = [
        summary
        for summary in await catalog()
        if summary.get("developer_id") == app.get("developer_id")
        and summary["slug"] != slug
        and summary.get("status") == "published"
    ][:5]

    deltas = live_deltas([slug])
    app = with_delta(app, deltas)
    app["versions"] = sorted(app.get("versions", []), key=lambda v: v.get("published_at") or v.get("created_at", ""), reverse=True)

    return {
        **app,
        "reviews": reviews,
        "developer_info": {
            "name": app.get("developer"),
            "website": app.get("website", ""),
            "other_apps": others,
        },
    }


# ------------------------------------------------------------------ create / edit app

class IconIn(BaseModel):
    emoji: str = "📦"
    gradient: List[str] = ["#6366f1", "#8b5cf6"]


class AppIn(BaseModel):
    name: str
    package_id: str
    description: str
    category: str
    tagline: str = ""
    tags: List[str] = []
    website: str = ""
    privacy_policy: str = ""
    age_rating: str = "Everyone"
    icon: Optional[IconIn] = None


class AppPatch(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    website: Optional[str] = None
    privacy_policy: Optional[str] = None
    age_rating: Optional[str] = None
    icon: Optional[IconIn] = None
    status: Optional[str] = None


@router.post("/api/apps", status_code=201)
async def create_app(body: AppIn, request: Request):
    from .security import require_developer

    ctx = require_developer(request)
    api_scope(ctx, "apps.write")

    name = (body.name or "").strip()
    if not 2 <= len(name) <= 64:
        raise HTTPException(422, "App name must be 2-64 characters.")
    if not re.match(r"^[a-z0-9_]+(\.[a-z0-9_]+){1,4}$", body.package_id or ""):
        raise HTTPException(422, "Package ID must look like com.example.app")
    if not (10 <= len(body.description or "") <= 5000):
        raise HTTPException(422, "Description must be 10-5000 characters.")

    cats = {c["slug"] for c in await gitstore.get_json("data/categories.json", default=[])}
    if body.category not in cats:
        raise HTTPException(422, "Unknown category.")

    idx = await catalog()
    slug = slugify(name)
    if not 2 <= len(slug) <= 64:
        raise HTTPException(422, "Please choose a different app name.")
    base_slug, n = slug, 2
    while any(a["slug"] == slug for a in idx):
        slug = f"{base_slug}-{n}"
        n += 1

    tags = sorted({slugify(t) for t in body.tags if t.strip()})[:8]
    icon = (body.icon.model_dump() if body.icon else None) or {
        "type": "gradient", "emoji": "📦", "gradient": ["#6366f1", "#8b5cf6"],
    }

    today = utcnow()[:10]
    app = {
        "slug": slug,
        "name": name,
        "package_id": body.package_id,
        "developer": ctx.developer["name"],
        "developer_id": ctx.developer["slug"],
        "category": body.category,
        "tagline": (body.tagline or "")[:120],
        "description": body.description,
        "icon": icon,
        "screenshots": [],
        "website": (body.website or "")[:200],
        "privacy_policy": (body.privacy_policy or "")[:200],
        "age_rating": (body.age_rating or "Everyone")[:40],
        "permissions": ["Internet"],
        "tags": tags,
        "status": "draft",
        "rating": 0,
        "ratings_count": 0,
        "downloads": 0,
        "created_at": today,
        "updated_at": today,
        "featured": False,
        "trending": False,
        "versions": [],
    }
    await save_app(app, f"create app: {slug}")

    with db() as conn:
        notify(conn, ctx.user_id, "app", f"'{name}' created",
               "Your app is a draft. Upload a release to start publishing.")
    return app


@router.patch("/api/apps/{slug}")
async def edit_app(slug: str, body: AppPatch, request: Request):
    ctx = require_user(request)
    app = await load_app(slug, allow_unpublished=True)
    ensure_owner(ctx, app)

    if body.name is not None:
        if not 2 <= len(body.name.strip()) <= 64:
            raise HTTPException(422, "App name must be 2-64 characters.")
        app["name"] = body.name.strip()
    if body.tagline is not None:
        app["tagline"] = body.tagline[:120]
    if body.description is not None:
        if not 10 <= len(body.description) <= 5000:
            raise HTTPException(422, "Description must be 10-5000 characters.")
        app["description"] = body.description
    if body.category is not None:
        cats = {c["slug"] for c in await gitstore.get_json("data/categories.json", default=[])}
        if body.category not in cats:
            raise HTTPException(422, "Unknown category.")
        app["category"] = body.category
    if body.tags is not None:
        app["tags"] = sorted({slugify(t) for t in body.tags if t.strip()})[:8]
    if body.website is not None:
        app["website"] = body.website[:200]
    if body.privacy_policy is not None:
        app["privacy_policy"] = body.privacy_policy[:200]
    if body.age_rating is not None:
        app["age_rating"] = body.age_rating[:40]
    if body.icon is not None:
        app["icon"] = body.icon.model_dump()
    if body.status is not None:
        if body.status not in ("draft", "published", "unpublished"):
            raise HTTPException(422, "Invalid status.")
        if body.status == "published":
            if not any(v.get("status") == "published" for v in app.get("versions", [])):
                raise HTTPException(422, "Publish a release first — an app needs at least one published version.")
        app["status"] = body.status

    app["updated_at"] = utcnow()[:10]
    await save_app(app, f"update app: {slug}")
    return app


# ------------------------------------------------------------------ assets (icons / screenshots)

class AssetIn(BaseModel):
    kind: str  # icon | screenshot
    filename: str
    data_b64: str


@router.post("/api/apps/{slug}/assets", status_code=201)
async def upload_asset(slug: str, body: AssetIn, request: Request):
    ctx = require_user(request)
    api_scope(ctx, "apps.write")
    app = await load_app(slug, allow_unpublished=True)
    ensure_owner(ctx, app)

    if body.kind not in ("icon", "screenshot"):
        raise HTTPException(422, "kind must be icon or screenshot.")
    if body.kind == "screenshot" and len(app.get("screenshots", [])) >= 5:
        raise HTTPException(422, "Maximum of 5 screenshots.")

    try:
        raw = base64.b64decode(body.data_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "Invalid image data.")
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(422, "Images must be 2 MB or smaller.")

    ext = None
    for magic, mime in IMAGE_MAGIC.items():
        if raw.startswith(magic):
            ext = mime
            if mime == "webp" and raw[8:12] != b"WEBP":
                ext = None
            break
    if not ext:
        raise HTTPException(422, "Unsupported image — use PNG, JPG, WEBP or GIF.")

    if body.kind == "icon":
        path = f"assets/{slug}/icon.{ext}"
        app["icon"] = {"type": "image", "path": path}
    else:
        n = len(app.get("screenshots", [])) + 1
        path = f"assets/{slug}/shot{n}.{ext}"
        app.setdefault("screenshots", []).append({"type": "image", "path": path})

    app["updated_at"] = utcnow()[:10]
    idx = [i for i in (await catalog()) if i["slug"] != slug] + [summary_of(app)]
    idx.sort(key=lambda i: i["slug"])
    await gitstore.commit_files(
        {
            path: raw,
            f"data/apps/{slug}.json": json_dumps(app),
            "data/apps.json": json_dumps(idx),
        },
        f"asset: {slug}",
    )
    return {"path": path}


@router.get("/api/assets/{path:path}")
async def get_asset(path: str, response: Response):
    if not path.startswith("assets/") or ".." in path or path.startswith("/"):
        raise HTTPException(404, "Not found.")
    if not re.search(r"\.(png|jpg|jpeg|webp|gif|svg)$", path.lower()):
        raise HTTPException(404, "Not found.")
    try:
        data = await gitstore.get_raw(path)
    except GitError:
        raise HTTPException(404, "Not found.")
    response.headers["Cache-Control"] = "public, max-age=3600"
    media = "image/png" if path.endswith("png") else "image/jpeg"
    return Response(content=data, media_type=media)


# ------------------------------------------------------------------ reviews

class ReviewIn(BaseModel):
    rating: int
    title: str = ""
    body: str = ""


@router.post("/api/apps/{slug}/reviews", status_code=201)
async def add_review(slug: str, body: ReviewIn, request: Request):
    ctx = require_user(request)
    app = await load_app(slug)
    if not 1 <= body.rating <= 5:
        raise HTTPException(422, "Rating must be 1-5 stars.")
    if len(body.title) > 80 or len(body.body) > 2000:
        raise HTTPException(422, "Review is too long.")

    reviews = await gitstore.get_json(f"data/reviews/{slug}.json", default=[])
    if any(r.get("user") == ctx.username for r in reviews):
        raise HTTPException(409, "You have already reviewed this app.")

    review = {
        "id": new_id("rv"),
        "user": ctx.username,
        "rating": body.rating,
        "title": body.title.strip(),
        "body": body.body.strip(),
        "created_at": utcnow()[:10],
    }
    reviews.append(review)

    old_r, old_c = float(app.get("rating", 0)), int(app.get("ratings_count", 0))
    app["rating"] = round((old_r * old_c + body.rating) / (old_c + 1), 2)
    app["ratings_count"] = old_c + 1

    await gitstore.commit_files(
        {
            f"data/reviews/{slug}.json": json_dumps(reviews),
            f"data/apps/{slug}.json": json_dumps(app),
            "data/apps.json": json_dumps(
                [summary_of(app) if i["slug"] == slug else i for i in await catalog()]
            ),
        },
        f"review: {slug}",
    )
    return {"review": review, "rating": app["rating"], "ratings_count": app["ratings_count"]}


# ------------------------------------------------------------------ wishlist & library

class WishlistIn(BaseModel):
    added: bool


@router.post("/api/apps/{slug}/wishlist")
async def wishlist(slug: str, body: WishlistIn, request: Request):
    ctx = require_user(request)
    await load_app(slug)
    with db() as conn:
        if body.added:
            conn.execute(
                "INSERT OR IGNORE INTO library (user_id, app_slug, kind, added_at) VALUES (?,?,?,?)",
                (ctx.user_id, slug, "wishlist", utcnow()),
            )
        else:
            conn.execute(
                "DELETE FROM library WHERE user_id = ? AND app_slug = ? AND kind = 'wishlist'",
                (ctx.user_id, slug),
            )
    return {"added": body.added}


@router.get("/api/library")
async def library(request: Request):
    ctx = require_user(request)
    with db() as conn:
        rows = conn.execute(
            "SELECT app_slug, kind, added_at FROM library WHERE user_id = ?", (ctx.user_id,)
        ).fetchall()
    wanted = [r["app_slug"] for r in rows]
    deltas = live_deltas(wanted)
    catalog_all = {a["slug"]: a for a in (await catalog())}
    out = {"installed": [], "wishlist": []}
    for r in rows:
        a = catalog_all.get(r["app_slug"])
        if a and a.get("status") == "published":
            out[r["kind"] if r["kind"] in out else "installed"].append(
                {**with_delta(a, deltas), "added_at": r["added_at"]}
            )
    out["installed"].sort(key=lambda a: a.get("added_at", ""), reverse=True)
    out["wishlist"].sort(key=lambda a: a.get("added_at", ""), reverse=True)
    return out


# ------------------------------------------------------------------ search

@router.get("/api/search")
async def search(
    q: str = "",
    category: Optional[str] = None,
    tag: Optional[str] = None,
    min_rating: float = 0.0,
    sort: str = "relevance",
    limit: int = 24,
    offset: int = 0,
):
    started = time.perf_counter()
    limit = max(1, min(limit, 100))
    apps = [a for a in (await catalog()) if a.get("status") == "published"]

    if category:
        apps = [a for a in apps if a.get("category") == category]
    if tag:
        tl = tag.lower()
        apps = [a for a in apps if tl in [t.lower() for t in a.get("tags", [])]]
    if min_rating > 0:
        apps = [a for a in apps if a.get("rating", 0) >= min_rating]

    q = (q or "").strip().lower()
    scored = []
    if q:
        terms = q.split()[:5]
        for a in apps:
            s = 0
            for t in terms:
                name = a["name"].lower()
                if name.startswith(t):
                    s += 8
                elif t in name:
                    s += 5
                atags = [x.lower() for x in a.get("tags", [])]
                if t in atags:
                    s += 4
                elif any(t in x for x in atags):
                    s += 2
                if t in a.get("developer", "").lower():
                    s += 3
                if t in a.get("tagline", "").lower():
                    s += 2
                if t in a.get("description", "").lower():
                    s += 1
            if s > 0:
                scored.append((s, a))
        scored.sort(key=lambda x: (-x[0], -x[1].get("downloads", 0)))
        apps = [a for _, a in scored]
        if sort != "relevance":
            apps = _resort(apps, sort)
    else:
        apps = _resort(apps, "popularity" if sort == "relevance" else sort)

    deltas = live_deltas([a["slug"] for a in apps])
    apps = [with_delta(a, deltas) for a in apps]
    return {
        "items": apps[offset: offset + limit],
        "total": len(apps),
        "took_ms": round((time.perf_counter() - started) * 1000, 1),
    }


def _resort(apps: list, sort: str) -> list:
    sorters = {
        "popularity": lambda a: -a.get("downloads", 0),
        "rating": lambda a: -a.get("rating", 0),
        "newest": lambda a: a.get("created_at", ""),
    }
    if sort in sorters:
        return sorted(apps, key=sorters[sort], reverse=sort == "newest")
    return apps
