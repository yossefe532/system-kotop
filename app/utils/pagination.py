PAGE_DEFAULT_LIMIT = 50
PAGE_MAX_LIMIT = 200


def _clamp_page(skip: int, limit: int) -> tuple[int, int]:
    """Clamp pagination parameters to safe bounds (SQL-level safety)."""
    return max(skip, 0), max(0, min(limit, PAGE_MAX_LIMIT))
