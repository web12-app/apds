"""Git-backed catalog/storage layer.

All GitHub access happens here, server-side only. Internal details
(repository, tokens, tags, releases) are never exposed through the API.
"""
import asyncio
import base64
import json
import logging
import time
from pathlib import Path
from typing import Dict, Optional, Union

import httpx

from .config import settings

log = logging.getLogger("apds.gitstore")


class GitError(Exception):
    def __init__(self, kind: str = "upstream"):
        self.kind = kind  # "not_found" | "upstream" | "conflict"
        super().__init__(kind)


class GitStore:
    def __init__(self) -> None:
        self.repo = settings.data_repo
        self.branch = settings.data_branch
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "apds-marketplace",
        }
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"
        self.http = httpx.AsyncClient(
            base_url="https://api.github.com",
            headers=headers,
            timeout=httpx.Timeout(30.0, connect=15.0),
            follow_redirects=True,
        )
        self.uploads = httpx.AsyncClient(  # no base_url; used for uploads.github.com + asset streaming
            headers=headers,
            timeout=httpx.Timeout(900.0, connect=15.0),
            follow_redirects=True,
        )
        self._cache: Dict[str, dict] = {}

    async def aclose(self) -> None:
        await self.http.aclose()
        await self.uploads.aclose()

    # ------------------------------------------------------------ low level

    async def _req(self, method: str, url: str, **kw) -> httpx.Response:
        r = await self.http.request(method, url, **kw)
        if r.status_code in (404,):
            raise GitError("not_found")
        if r.status_code in (409, 422):
            raise GitError("conflict")
        if r.status_code >= 400:
            log.error("git %s %s -> %s %s", method, url, r.status_code, r.text[:300])
            raise GitError("upstream")
        return r

    # ------------------------------------------------------------ reads (cached)

    async def get_raw(self, path: str) -> bytes:
        entry = self._cache.get(path)
        now = time.monotonic()
        if entry and now - entry["ts"] < settings.cache_ttl:
            return entry["data"]
        headers = {"Accept": "application/vnd.github.raw"}
        if entry and entry.get("etag"):
            headers["If-None-Match"] = entry["etag"]
        r = await self.http.get(
            f"/repos/{self.repo}/contents/{path}",
            params={"ref": self.branch},
            headers=headers,
        )
        if r.status_code == 304 and entry:
            entry["ts"] = now
            return entry["data"]
        if r.status_code == 404:
            raise GitError("not_found")
        if r.status_code >= 400:
            log.error("git read %s -> %s %s", path, r.status_code, r.text[:300])
            raise GitError("upstream")
        etag = r.headers.get("etag")
        if etag:
            self._cache[path] = {"etag": etag, "data": r.content, "ts": now}
        else:
            self._cache[path] = {"etag": None, "data": r.content, "ts": now}
        return r.content

    async def get_json(self, path: str, default=None):
        try:
            return json.loads((await self.get_raw(path)).decode())
        except GitError as e:
            if e.kind == "not_found" and default is not None:
                return default
            raise

    # ------------------------------------------------------------ commits

    async def commit_files(self, files: Dict[str, Union[str, bytes]], message: str) -> str:
        """Atomically commit multiple files to the data branch."""
        last_err: Optional[GitError] = None
        for attempt in range(3):
            try:
                ref = await self._req("GET", f"/repos/{self.repo}/git/ref/heads/{self.branch}")
                head = ref.json()["object"]["sha"]
                commit = await self._req("GET", f"/repos/{self.repo}/git/commits/{head}")
                base_tree = commit.json()["tree"]["sha"]

                tree_items = []
                for path, content in files.items():
                    if isinstance(content, str):
                        payload = {"content": content, "encoding": "utf-8"}
                    else:
                        payload = {
                            "content": base64.b64encode(content).decode(),
                            "encoding": "base64",
                        }
                    blob = await self._req("POST", f"/repos/{self.repo}/git/blobs", json=payload)
                    tree_items.append(
                        {"path": path, "mode": "100644", "type": "blob", "sha": blob.json()["sha"]}
                    )

                tree = await self._req(
                    "POST",
                    f"/repos/{self.repo}/git/trees",
                    json={"base_tree": base_tree, "tree": tree_items},
                )
                new_commit = await self._req(
                    "POST",
                    f"/repos/{self.repo}/git/commits",
                    json={"message": message, "tree": tree.json()["sha"], "parents": [head]},
                )
                await self._req(
                    "PATCH",
                    f"/repos/{self.repo}/git/refs/heads/{self.branch}",
                    json={"sha": new_commit.json()["sha"]},
                )
                self._cache.clear()
                return new_commit.json()["sha"]
            except GitError as e:
                last_err = e
                if e.kind in ("conflict", "upstream") and attempt < 2:
                    await asyncio.sleep(1.0 + attempt)
                    continue
                raise
        raise last_err or GitError("upstream")

    # ------------------------------------------------------------ releases

    async def create_draft_release(self, tag: str, name: str, body: str) -> int:
        r = await self._req(
            "POST",
            f"/repos/{self.repo}/releases",
            json={
                "tag_name": tag,
                "target_commitish": self.branch,
                "name": name,
                "body": body,
                "draft": True,
            },
        )
        return int(r.json()["id"])

    async def get_release(self, release_id: int) -> dict:
        try:
            r = await self._req("GET", f"/repos/{self.repo}/releases/{release_id}")
            return r.json()
        except GitError:
            return {}

    async def get_asset_by_name(self, release: dict, filename: str) -> Optional[dict]:
        for a in release.get("assets", []):
            if a.get("name") == filename:
                return a
        return None

    async def delete_asset(self, asset_id: int) -> None:
        await self._req("DELETE", f"/repos/{self.repo}/releases/assets/{asset_id}")

    async def upload_asset(self, release_id: int, filename: str, file_path) -> dict:
        file_path = Path(file_path)
        # remove a same-named asset first so retries stay idempotent
        release = await self.get_release(release_id)
        existing = await self.get_asset_by_name(release, filename)
        if existing:
            await self.delete_asset(existing["id"])

        size = file_path.stat().st_size
        url = f"https://uploads.github.com/repos/{self.repo}/releases/{release_id}/assets"

        async def _chunks(path, block=1024 * 1024):
            with open(path, "rb") as f:
                while True:
                    chunk = await asyncio.to_thread(f.read, block)
                    if not chunk:
                        break
                    yield chunk

        r = await self.uploads.post(
            url,
            params={"name": filename},
            content=_chunks(file_path),
            headers={
                "Content-Type": "application/octet-stream",
                "Content-Length": str(size),
            },
        )
        if r.status_code >= 400:
            log.error("asset upload -> %s %s", r.status_code, r.text[:300])
            raise GitError("upstream")
        return r.json()

    async def publish_release(self, release_id: int) -> dict:
        r = await self._req(
            "PATCH", f"/repos/{self.repo}/releases/{release_id}", json={"draft": False}
        )
        return r.json()

    async def dispatch_processing(self, app_slug: str, version: str, release_id: int, sha256_hex: str) -> bool:
        """Trigger the background processing workflow. Returns success."""
        try:
            r = await self.http.post(
                f"/repos/{self.repo}/actions/workflows/process-release.yml/dispatches",
                json={
                    "ref": self.branch,
                    "inputs": {
                        "app_slug": app_slug,
                        "version": version,
                        "release_id": str(release_id),
                        "sha256": sha256_hex,
                    },
                },
            )
            if r.status_code == 204:
                return True
            log.error("dispatch -> %s %s", r.status_code, r.text[:300])
            return False
        except Exception:
            return False

    def stream_asset(self, asset_url: str):
        """Open a streaming download of a release asset (API URL)."""
        return self.uploads.stream(
            "GET", asset_url, headers={"Accept": "application/octet-stream"}
        )


gitstore = GitStore()
