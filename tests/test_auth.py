from auth.security import create_access_token


def test_login_me_refresh_logout_flow(client):
    login_response = client.post("/auth/login", json={"username": "admin", "password": "admin12345"})
    assert login_response.status_code == 200
    payload = login_response.json()
    assert payload["user"]["username"] == "admin"

    access_token = payload["access_token"]
    refresh_token = payload["refresh_token"]

    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_response.status_code == 200
    assert "admin" in me_response.json()["roles"]

    refresh_response = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()
    assert refreshed["refresh_token"] != refresh_token

    logout_response = client.post("/auth/logout", json={"refresh_token": refreshed["refresh_token"]})
    assert logout_response.status_code == 200

    revoked_refresh = client.post("/auth/refresh", json={"refresh_token": refreshed["refresh_token"]})
    assert revoked_refresh.status_code == 401


def test_rbac_blocks_cashier_from_admin_report(client, cashier_headers):
    response = client.get("/reports/finance", headers=cashier_headers)
    assert response.status_code == 403


def test_refresh_rejects_revoked_token(client, admin_token_pair):
    response = client.post("/auth/logout", json={"refresh_token": admin_token_pair["refresh_token"]})
    assert response.status_code == 200

    refresh_response = client.post("/auth/refresh", json={"refresh_token": admin_token_pair["refresh_token"]})
    assert refresh_response.status_code == 401


def test_expired_access_token_is_rejected(client):
    expired_access_token, _ = create_access_token(
        user_id=1,
        username="admin",
        roles=["admin"],
        token_version=999,
    )
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_access_token}"})
    assert response.status_code == 401
