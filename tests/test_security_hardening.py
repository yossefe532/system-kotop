import importlib


def test_secure_headers_are_present(client, admin_headers):
    response = client.get("/books", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "Permissions-Policy" in response.headers
    assert response.headers["Cache-Control"] == "no-store"


def test_metrics_requires_internal_token_when_configured(monkeypatch):
    monkeypatch.setenv("METRICS_AUTH_TOKEN", "metrics-secret")
    module = importlib.import_module("app.api.observability")
    importlib.reload(module)

    try:
        module.metrics_endpoint(None)
        assert False, "metrics endpoint should require a token"
    except Exception as exc:  # HTTPException without TestClient
        assert getattr(exc, "status_code", None) == 401

    response = module.metrics_endpoint("metrics-secret")
    assert response.status_code == 200


def test_health_requires_internal_token_when_configured(monkeypatch, db_session):
    monkeypatch.setenv("HEALTHCHECK_AUTH_TOKEN", "health-secret")
    module = importlib.import_module("app.api.health")
    importlib.reload(module)

    try:
        module.readiness(db_session, None)
        assert False, "health readiness should require a token"
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 401


def test_oversized_request_is_rejected(client, admin_headers):
    oversized_payload = {
        "transaction_code": "abc",
        "receipt_type": "sale",
        "staff_name": "admin",
        "payload": {"blob": "x" * (2 * 1024 * 1024)},
    }
    response = client.post("/receipt-archive", json=oversized_payload, headers=admin_headers)
    assert response.status_code == 413, response.text
