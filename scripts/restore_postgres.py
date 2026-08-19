import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m scripts.restore_postgres <backup-file>")

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for restore")

    backup_path = Path(sys.argv[1]).resolve()
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_path}")

    subprocess.run(
        ["pg_restore", "--clean", "--if-exists", "--no-owner", "--dbname", database_url, str(backup_path)],
        check=True,
    )
    print(f"Restore completed from {backup_path}")


if __name__ == "__main__":
    main()
