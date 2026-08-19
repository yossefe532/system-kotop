def test_create_duplicate_and_cancel_reservation(client, cashier_headers, seeded_book, seeded_student):
    payload = {
        "student_id": seeded_student.id,
        "book_id": seeded_book.id,
        "quantity": 2,
        "deposit_amount": 25.0,
        "staff_name": "Cashier",
        "status": "pending",
    }
    create_response = client.post("/reservations", json=payload, headers=cashier_headers)
    assert create_response.status_code == 201, create_response.text
    reservation = create_response.json()
    assert reservation["status"] == "pending"

    duplicate_response = client.post("/reservations", json=payload, headers=cashier_headers)
    assert duplicate_response.status_code == 400

    cancel_response = client.delete(f"/reservations/{reservation['id']}", headers=cashier_headers)
    assert cancel_response.status_code == 204
