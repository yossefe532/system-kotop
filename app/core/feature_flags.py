import os


def is_wallet_ledger_enabled() -> bool:
    """Feature flag for the immutable student wallet ledger.

    Default: disabled (False) for production safety. Protected environments
    must explicitly opt in by setting WALLET_LEDGER_ENABLED=true.
    """
    raw = os.getenv("WALLET_LEDGER_ENABLED")
    if raw is None:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}
