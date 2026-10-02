"""APDS backend configuration — all values come from environment variables."""
import os
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        # public client key (identifier, not a secret)
        self.app_key: str = os.environ.get("APP_KEY", "apk_dev_local")

        # server-side only credentials
        self.github_token: str = os.environ.get("GITHUB_TOKEN", "")

        # git-backed catalog storage
        self.data_repo: str = os.environ.get("DATA_REPO", "web12-app/dbs")
        self.data_branch: str = os.environ.get("DATA_BRANCH", "main")

        # database
        self.db_path: str = os.environ.get(
            "DB_PATH", str(Path(__file__).with_name("marketplace.db"))
        )

        # uploads
        self.max_upload_mb: int = int(os.environ.get("MAX_UPLOAD_MB", "200"))
        self.upload_session_ttl_min: int = int(os.environ.get("UPLOAD_SESSION_TTL_MIN", "60"))

        # sessions
        self.session_ttl_days: int = int(os.environ.get("SESSION_TTL_DAYS", "30"))
        self.cookie_name: str = "apds_session"

        # catalog cache
        self.cache_ttl: int = int(os.environ.get("CACHE_TTL", "20"))

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


settings = Settings()
