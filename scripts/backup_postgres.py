import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for backups")

    backup_dir = Path(os.getenv("BACKUP_DIR", "backups"))
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_path = backup_dir / f"postgres-backup-{timestamp}.dump"

    subprocess.run(
      ["pg_dump", "--format=custom", "--file", str(output_path), database_url],
      check=True,
    )
    print(f"Backup created at {output_path}")


if __name__ == "__main__":
    main()
