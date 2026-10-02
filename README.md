# APDS — the independent app marketplace

**Discover. Download. Create.**

A complete, production-ready app marketplace (original branding, not affiliated
with any existing store) — users browse, search, review and download apps;
developers publish releases through a secure, validated pipeline.

🌐 **Live:** https://apds.onrender.com

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React (SPA, dark/light, mobile-first, 25+ screens) |
| Backend | Python — FastAPI |
| Catalog storage | Git-backed (public [`dbs` repo](https://github.com/web12-app/dbs)) — data files, git tags, releases |
| Sensitive storage | SQLite (users, sessions, API-key hashes, upload sessions, stats) — server-side only |
| Background processing | GitHub Actions (release validation & publishing) |
| Deploy | Docker → Render (free plan) |

## Architecture

```
Mobile/Desktop Client (Vite SPA)
        │
        ▼
APDS API (FastAPI, app-key gated)          ← presents: Apps / Versions / Downloads
        │
        ├─ SQLite: accounts, sessions, API keys, upload sessions, stats
        │
        └─ Git storage (server-side token only):
             ├─ catalog JSON files (apps, versions, reviews, categories)
             ├─ git tags (immutable version refs)
             └─ GitHub Actions: validate → publish → update metadata
```

### Release pipeline

```
Developer app
   ↓ POST /api/apps                (create listing, draft)
   ↓ POST /api/releases            (version metadata)
   ↓ POST /api/upload-sessions     (temporary, single-purpose session + token)
   ↓ PUT  /api/uploads/{id}        (public tunnel: streaming upload, SHA-256 verified,
   ↓                                 no RAM buffering, no internal credentials exposed)
   ↓ asset stored on a draft release
   ↓ POST /api/releases/{id}/publish
   ↓ GitHub Actions workflow: validate (type, magic bytes, checksum)
   ↓                             → publish release (creates immutable git tag)
   ↓                             → update catalog metadata
   ↓ GET /api/releases/{id}        (status polling, self-healing)
   ✓ live in the store — authorized, checksummed downloads
```

## Security model

- **Two layers**: a public `X-App-Key` client identifier on every API call, plus
  real identity via httpOnly **session cookies** (web) or **scoped API keys**
  (`Authorization: Bearer` / `X-API-Key`) for programmatic access.
- API keys: random, revocable, rotatable, scoped (`apps.read`, `releases.write`, …),
  stored only as SHA-256 hashes, shown once.
- Upload sessions: expire automatically, single-purpose, token-gated,
  never expose git or worker credentials.
- Passwords: bcrypt. Rate limiting on auth and downloads.
- All git access is server-side; users only ever see *apps, versions, downloads*.
- Errors return generic messages; details live in server logs only.

## Run locally

```bash
# Backend (from repo root)
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # configure
uvicorn backend.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api → :8000)
```

## Environment

| Var | Purpose |
|---|---|
| `APP_KEY` | public client key (identifier, not a secret) |
| `GITHUB_TOKEN` | **server-side only** PAT for the data repo |
| `DATA_REPO` / `DATA_BRANCH` | catalog storage repo |
| `DB_PATH` | SQLite location |
| `MAX_UPLOAD_MB` | upload size cap (default 200) |
| `UPLOAD_SESSION_TTL_MIN` | upload session lifetime (default 60) |

## API

```
POST   /api/auth/signup | login | logout
GET    /api/account  PATCH /api/account  DELETE /api/account
GET    /api/apps  POST /api/apps  PATCH /api/apps/:slug
GET    /api/apps/:slug  POST /api/apps/:slug/reviews  /wishlist
GET    /api/categories  /api/search  /api/library  /api/assets/*
POST   /api/upload-sessions  GET/DELETE /api/upload-sessions/:id
PUT    /api/uploads/:id            (the public upload tunnel)
POST   /api/releases  GET /api/releases/:id  POST /api/releases/:id/publish
GET    /api/releases/:id/download
POST   /api/developer  GET /api/developer/apps  /api/developer/stats
GET/POST/DELETE /api/keys  POST /api/keys/:id/rotate
GET    /api/notifications  POST /api/notifications/read
GET    /api/health  /api/meta      (public bootstrap)
```

## Notes

- Free-tier instances sleep and reset local state (SQLite). The catalog — apps,
  versions, reviews — lives in git and persists. Swap `DB_PATH` for a managed
  Postgres in production.
- Seeded catalog entries ship without binaries; their downloads stream a clearly
  labeled demo package so the full download UX can be exercised. Developer-uploaded
  releases serve their real files.
- Catalog seed: `python3 scripts/seed_data.py` in the data repo.
