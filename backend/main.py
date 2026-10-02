"""APDS — app marketplace API + static frontend assembly."""
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .db import init_db
from .gitstore import gitstore
from .routers_apps import router as apps_router
from .routers_auth import router as auth_router
from .routers_dev import router as dev_router
from .routers_uploads import router as uploads_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("apds")

app = FastAPI(
    title="APDS Marketplace",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,  # internal API surface is not advertised
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["X-App-Key", "X-API-Key", "Authorization", "Content-Type", "X-Upload-Token"],
    expose_headers=["X-Demo-Package", "X-Checksum-Sha256", "Content-Disposition"],
)


@app.on_event("startup")
async def startup() -> None:
    init_db()
    log.info("APDS marketplace API ready")


@app.on_event("shutdown")
async def shutdown() -> None:
    await gitstore.aclose()


# ---- public bootstrap routes (no app key required) ----

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/meta")
async def meta():
    return {
        "name": "APDS",
        "tagline": "Discover. Download. Create.",
        "app_key": settings.app_key,
        "max_upload_mb": settings.max_upload_mb,
    }


# ---- error handling: never leak internals ----

@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        {"detail": "Unable to complete this request. Please try again."}, status_code=500
    )


app.include_router(auth_router)
app.include_router(apps_router)
app.include_router(uploads_router)
app.include_router(dev_router)


# ---- SPA static hosting (built Vite frontend) ----

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


class SPAStatic(StaticFiles):
    async def get_response(self, path: str, scope):
        if path.startswith("api"):
            raise StarletteHTTPException(status_code=404, detail="Not found.")
        try:
            resp = await super().get_response(path, scope)
        except StarletteHTTPException:
            resp = await super().get_response("index.html", scope)
        # never let browsers cache a stale app shell across deploys
        if "text/html" in (resp.media_type or ""):
            resp.headers["Cache-Control"] = "no-cache"
        return resp


if DIST.is_dir():
    app.mount("/", SPAStatic(directory=DIST, html=True), name="spa")
else:  # development without a frontend build
    @app.get("/")
    async def root():
        return Response(
            "APDS API is running. Build the frontend (npm run build) to serve the app.",
            media_type="text/plain",
        )
