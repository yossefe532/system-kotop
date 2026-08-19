def test_supply_and_finance_report_consistency(client, admin_headers, manager_headers, seeded_book):
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
    supply = supply_response.json()
    assert supply["total_cost"] == 100.0

    finance_for_manager = client.get("/reports/finance", headers=manager_headers)
    assert finance_for_manager.status_code == 403

    finance_response = client.get("/reports/finance", headers=admin_headers)
    assert finance_response.status_code == 200, finance_response.text
    finance_payload = finance_response.json()
    assert finance_payload["revenue"] == 0.0
    assert finance_payload["withdrawals"] == 40.0
    assert finance_payload["safe_balance"] == -40.0
    assert finance_payload["supplier_due"] == 60.0


def test_inventory_session_creates_reset_withdrawal(client, admin_headers, manager_headers, seeded_book, seeded_student):
    sale_response = client.post(
        "/transactions",
        json={
            "student_id": seeded_student.id,
            "discount": 0.0,
            "staff_name": "Manager",
            "items": [{"book_id": seeded_book.id, "quantity": 1}],
        },
        headers=manager_headers,
    )
    assert sale_response.status_code == 201, sale_response.text

    response = client.post(
        "/inventory-sessions",
        json={"staff_name": "Heba", "total_cash_found": 250.0},
        headers=manager_headers,
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["staff_name"] == "Heba"

    finance_response = client.get("/reports/finance", headers=admin_headers)
    assert finance_response.status_code == 200, finance_response.text
    finance_payload = finance_response.json()
    assert finance_payload["revenue"] == 100.0
    assert finance_payload["withdrawals"] == 100.0
    assert finance_payload["safe_balance"] == 0.0
