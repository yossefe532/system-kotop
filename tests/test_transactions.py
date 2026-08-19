def test_complete_sale_updates_inventory_and_safe_ledger(client, cashier_headers, manager_headers, seeded_book, seeded_student):
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

    transaction_response = client.post(
        "/transactions",
        json={
            "student_id": seeded_student.id,
            "discount": 5.0,
            "staff_name": "Cashier",
            "items": [
                {
                    "book_id": seeded_book.id,
                    "quantity": 1,
                    "reservation_id": reservation["id"],
                }
            ],
        },
        headers=cashier_headers,
    )
    assert transaction_response.status_code == 201, transaction_response.text
    transaction = transaction_response.json()
    assert transaction["student_id"] == seeded_student.id
    assert len(transaction["items"]) == 1

    book_response = client.get(f"/books/{seeded_book.id}", headers=cashier_headers)
    assert book_response.status_code == 200
    updated_book = book_response.json()
    assert updated_book["total_stock"] == 19
    assert updated_book["reserved_stock"] == 0

    safe_response = client.get("/safe/transactions", headers=manager_headers)
    assert safe_response.status_code == 200, safe_response.text
    safe_entries = safe_response.json()
    assert any(entry["type"] == "sale" and entry["amount"] == 85.0 for entry in safe_entries)


def test_transaction_rejects_insufficient_stock_without_partial_write(client, cashier_headers, seeded_book, seeded_student):
    response = client.post(
        "/transactions",
        json={
            "student_id": seeded_student.id,
            "discount": 0.0,
            "staff_name": "Cashier",
            "items": [{"book_id": seeded_book.id, "quantity": 999}],
        },
        headers=cashier_headers,
    )
    assert response.status_code == 400

    book_response = client.get(f"/books/{seeded_book.id}", headers=cashier_headers)
    assert book_response.status_code == 200
    assert book_response.json()["total_stock"] == 20

    transactions_response = client.get("/transactions", headers=cashier_headers)
    assert transactions_response.status_code == 200
    assert transactions_response.json() == []
