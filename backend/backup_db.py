"""Create a consistent SQLite backup without interrupting the API."""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
database = ROOT / os.getenv("RAPIDRELAY_DB", "rapidrelay.sqlite3")
backup_dir = ROOT / "backups"
backup_dir.mkdir(exist_ok=True)
destination = backup_dir / f"rapidrelay-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.sqlite3"

with sqlite3.connect(database) as source, sqlite3.connect(destination) as target:
    source.backup(target)

print(destination)
