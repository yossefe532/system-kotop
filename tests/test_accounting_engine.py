from datetime import datetime, timedelta


def test_sale_creates_balanced_journal_entry(client, cashier_headers, admin_headers, seeded_book, seeded_student):
    response = client.post(
        "/transactions",
        json={
            "student_id": seeded_student.id,
            "discount": 0.0,
            "staff_name": "Cashier",
            "items": [{"book_id": seeded_book.id, "quantity": 1}],
        },
        headers=cashier_headers,
    )
    assert response.status_code == 201, response.text

    ledger_response = client.get("/reports/general-ledger", headers=admin_headers)
    assert ledger_response.status_code == 200, ledger_response.text
    entries = ledger_response.json()
    sale_entry = next(entry for entry in entries if entry["source_type"] == "transaction")
    debit_total = round(sum(line["amount"] for line in sale_entry["lines"] if line["line_type"] == "debit"), 2)
    credit_total = round(sum(line["amount"] for line in sale_entry["lines"] if line["line_type"] == "credit"), 2)
    assert debit_total == credit_total
    assert any(line["account_code"] == "4000" for line in sale_entry["lines"])


def test_reservation_deposit_and_cancel_create_accounting_history(client, cashier_headers, manager_headers, admin_headers, seeded_book, seeded_student):
    create_response = client.post(
        "/reservations",
        json={
            "student_id": seeded_student.id,
            "book_id": seeded_book.id,
            "quantity": 1,
            "deposit_amount": 20.0,
            "staff_name": "Cashier",
            "status": "pending",
        },
        headers=cashier_headers,
    )
    assert create_response.status_code == 201, create_response.text
    reservation = create_response.json()

    cancel_response = client.delete(f"/reservations/{reservation['id']}", headers=manager_headers)
    assert cancel_response.status_code == 204, cancel_response.text

    trial_balance = client.get("/reports/trial-balance", headers=admin_headers)
    assert trial_balance.status_code == 200, trial_balance.text
    lines = trial_balance.json()
    deposit_account = next(line for line in lines if line["account_code"] == "4010")
    assert deposit_account["net_balance"] == 0.0

    audit_response = client.get("/financial-audit-trail", headers=admin_headers)
    assert audit_response.status_code == 200, audit_response.text
    assert any(item["entity_type"] == "reservation" for item in audit_response.json())


def test_supply_and_finance_validation_endpoints(client, admin_headers, manager_headers, seeded_book):
    supply_response = client.post(
        "/supplies",
        json={
            "book_id": seeded_book.id,
            "quantity": 5,
            "unit_cost": 20.0,
            "paid_amount": 40.0,
            "supplier_name": "Supplier",
            "staff_name": "Manager",
        },
        headers=manager_headers,
    )
    assert supply_response.status_code == 201, supply_response.text

    validation = client.get("/reports/financial-validation", headers=admin_headers)
    assert validation.status_code == 200, validation.text
    payload = validation.json()
    assert payload["balanced_journal_entries"] is True
    assert payload["orphan_safe_transaction_ids"] == []

    income_summary = client.get("/reports/income-summary", headers=admin_headers)
    assert income_summary.status_code == 200, income_summary.text
    assert income_summary.json()["accounts_payable"] == 60.0


def test_cash_drawer_and_reconciliation_flow(client, admin_headers, manager_headers):
    open_response = client.post(
        "/cash-drawer/sessions",
        json={"staff_name": "Manager", "opening_balance": 50.0, "notes": "Morning shift"},
        headers=manager_headers,
    )
    assert open_response.status_code == 201, open_response.text
    session = open_response.json()

    close_response = client.post(
        f"/cash-drawer/sessions/{session['id']}/close",
        json={"counted_cash": 50.0, "supervisor_name": "Admin", "notes": "Matched"},
        headers=manager_headers,
    )
    assert close_response.status_code == 200, close_response.text
    assert close_response.json()["status"] == "closed"

    now = datetime.utcnow()
    reconcile_response = client.post(
        "/reconciliations",
        json={
            "reconciliation_type": "daily",
            "period_key": now.strftime("%Y-%m-%d"),
            "starts_at": (now - timedelta(days=1)).isoformat(),
            "ends_at": now.isoformat(),
            "counted_cash": 0.0,
            "staff_name": "Admin",
            "supervisor_name": "Admin",
            "notes": "Daily reconciliation",
        },
        headers=admin_headers,
    )
    assert reconcile_response.status_code == 201, reconcile_response.text
    assert reconcile_response.json()["status"] in {"balanced", "exceptions"}


def test_period_close_requires_balanced_journals(client, admin_headers):
    periods_response = client.get("/financial-periods", headers=admin_headers)
    assert periods_response.status_code == 200, periods_response.text
    periods = periods_response.json()
    assert periods
    period_key = periods[0]["period_key"]

    close_response = client.post(
        f"/financial-periods/{period_key}/close",
        json={"closed_by": "Admin", "notes": "Month end"},
        headers=admin_headers,
    )
    assert close_response.status_code == 200, close_response.text
    assert close_response.json()["status"] == "closed"


def test_reservation_sale_releases_deposit_liability_into_revenue(client, cashier_headers, admin_headers, seeded_book, seeded_student):
    reservation_response = client.post(
        "/reservations",
        json={
            "student_id": seeded_student.id,
            "book_id": seeded_book.id,
            "quantity": 1,
            "deposit_amount": 10.0,
            "staff_name": "Cashier",
            "status": "pending",
        },
        headers=cashier_headers,
    )
    assert reservation_response.status_code == 201, reservation_response.text
    reservation = reservation_response.json()

    sale_response = client.post(
        "/transactions",
        json={
            "student_id": seeded_student.id,
            "discount": 0.0,
            "staff_name": "Cashier",
            "items": [{"book_id": seeded_book.id, "quantity": 1, "reservation_id": reservation["id"]}],
        },
        headers=cashier_headers,
    )
    assert sale_response.status_code == 201, sale_response.text

    trial_balance = client.get("/reports/trial-balance", headers=admin_headers)
    assert trial_balance.status_code == 200, trial_balance.text
    lines = trial_balance.json()
    deposit_account = next(line for line in lines if line["account_code"] == "4010")
    revenue_account = next(line for line in lines if line["account_code"] == "4000")
    assert deposit_account["net_balance"] == 0.0
    assert revenue_account["credits"] == 100.0
