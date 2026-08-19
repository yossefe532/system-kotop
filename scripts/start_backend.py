import os

import uvicorn


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WEB_CONCURRENCY", "1"))
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        workers=workers,
        proxy_headers=True,
        forwarded_allow_ips=os.getenv("FORWARDED_ALLOW_IPS", "*"),
        timeout_keep_alive=int(os.getenv("UVICORN_TIMEOUT_KEEP_ALIVE", "15")),
    )


if __name__ == "__main__":
    main()
