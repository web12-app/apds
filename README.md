# apds — full-stack app (Vite + Python)

Public full-stack application:

- **Frontend:** Vite + React → [`frontend/`](frontend/)
- **Backend:** Python — FastAPI + SQLite → [`backend/`](backend/)
- **Deploy:** multi-stage Docker → **Render** (free plan), single web service

The FastAPI backend serves both the JSON API (`/api/*`) and the built Vite
frontend from the same origin — one service, one URL.

🌐 **Live:** https://apds.onrender.com

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check (used by Render) |
| GET | `/api/records` | List all records |
| POST | `/api/records` | Create `{"name": "..."}` |
| DELETE | `/api/records/{id}` | Delete a record |

Docs (local): http://localhost:8000/docs

## Run locally

```bash
# Backend (terminal 1)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (terminal 2) — dev server proxies /api → :8000
cd frontend
npm install
npm run dev          # http://localhost:5173
```

## Run with Docker

```bash
docker build -t apds .
docker run --rm -p 10000:10000 apds     # http://localhost:10000
```

## Deploy on Render

- Runtime: **Docker** (`./Dockerfile`)
- Health check path: `/api/health`
- Port: honors `$PORT` (Render default `10000`)
- `render.yaml` blueprint included
- Auto-deploy on push to `main`

> Database (SQLite file) is ephemeral on free instances — data resets on
> restart/redeploy. Schema lives in the private [dbs](https://github.com/web12-app/dbs) repo.
