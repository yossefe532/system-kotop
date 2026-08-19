from __future__ import annotations

import pytest

from models import (
    FinancialAuditTrail,
    JournalEntry,
    JournalLine,
    LedgerAccount,
    StudentWalletEntry,
)


def _post_entry(client, headers, student_id, entry_type, amount, operation_id, source_type="test", **extra):
    payload = {
        "entry_type": entry_type,
        "amount": amount,
        "source_type": source_type,
        "operation_id": operation_id,
        **extra,
    }
    return client.post(f"/students/{student_id}/wallet/entries", json=payload, headers=headers)


def _enable_ledger(monkeypatch):
    monkeypatch.setenv("WALLET_LEDGER_ENABLED", "true")


# 1. wallet entry creation
def test_wallet_entry_creation(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 50.0, "op-1")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["entry_type"] == "deposit_change"
    assert body["amount"] == 50.0
    assert body["direction"] == "credit"
    assert body["balance_before"] == 0.0
    assert body["balance_after"] == 50.0
    assert body["operation_id"] == "op-1"


# 2. balance before/after arithmetic
def test_balance_before_after(client, cashier_headers, seeded_student, db_session, monkeypatch):
    _enable_ledger(monkeypatch)
    _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 100.0, "op-2")
    _post_entry(client, cashier_headers, seeded_student.id, "purchase_wallet", -30.0, "op-3")
    entry = db_session.query(StudentWalletEntry).filter(StudentWalletEntry.operation_id == "op-3").first()
    assert entry.balance_before == 100.0
    assert entry.balance_after == 70.0


# 3. journal creation
def test_journal_creation(client, cashier_headers, seeded_student, db_session, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 40.0, "op-4")
    entry_id = resp.json()["id"]
    journal = db_session.query(JournalEntry).filter(
        JournalEntry.source_type == "student_wallet", JournalEntry.source_id == entry_id
    ).first()
    assert journal is not None
    lines = db_session.query(JournalLine).filter(JournalLine.journal_entry_id == journal.id).all()
    assert len(lines) == 2
    codes = {line.account_id for line in lines}
    wallet_account = db_session.query(LedgerAccount).filter(LedgerAccount.code == "1300").first()
    cash_account = db_session.query(LedgerAccount).filter(LedgerAccount.code == "1000").first()
    assert wallet_account.id in codes
    assert cash_account.id in codes


# 4. audit creation
def test_audit_creation(client, cashier_headers, seeded_student, db_session, monkeypatch):
    _enable_ledger(monkeypatch)
    _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 10.0, "op-5")
    audit = db_session.query(FinancialAuditTrail).filter(
        FinancialAuditTrail.entity_type == "student_wallet"
    ).first()
    assert audit is not None
    assert audit.staff_name is not None


# 5. duplicate operation returns existing
def test_duplicate_operation(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    first = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 25.0, "op-6")
    assert first.status_code == 201
    second = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 25.0, "op-6")
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]


# 6. conflicting duplicate operation rejected
def test_conflicting_duplicate_operation(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    first = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 25.0, "op-7")
    assert first.status_code == 201
    conflict = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 99.0, "op-7")
    assert conflict.status_code == 409


# 7. negative balance allowed (design: no sign restriction on cached balance)
def test_negative_balance(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 20.0, "op-8")
    _post_entry(client, cashier_headers, seeded_student.id, "purchase_wallet", -60.0, "op-9")
    balance = client.get(f"/students/{seeded_student.id}/wallet/balance", headers=cashier_headers)
    assert balance.json()["balance"] == -40.0


# 8. positive balance
def test_positive_balance(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 15.0, "op-10")
    balance = client.get(f"/students/{seeded_student.id}/wallet/balance", headers=cashier_headers)
    assert balance.json()["balance"] == 15.0


# 9. zero balance after offsetting entries
def test_zero_balance(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 50.0, "op-11")
    _post_entry(client, cashier_headers, seeded_student.id, "purchase_wallet", -50.0, "op-12")
    balance = client.get(f"/students/{seeded_student.id}/wallet/balance", headers=cashier_headers)
    assert balance.json()["balance"] == 0.0


# 10. refund (cancel reservation)
def test_refund_cancel_reservation(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "refund_cancel_reservation", 10.0, "op-13", source_type="reservation", source_id=1)
    assert resp.json()["balance_after"] == 10.0
    assert resp.json()["direction"] == "credit"


# 11. purchase wallet
def test_purchase_wallet(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 50.0, "op-14")
    resp = _post_entry(client, cashier_headers, seeded_student.id, "purchase_wallet", -20.0, "op-15")
    assert resp.json()["balance_after"] == 30.0


# 12. debt
def test_purchase_debt(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "purchase_debt", -12.0, "op-16")
    assert resp.json()["balance_after"] == -12.0


# 13. change
def test_deposit_change(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 33.0, "op-17")
    assert resp.json()["balance_after"] == 33.0


# 14. reservation refund alias (same as 10 but explicit)
def test_reservation_refund(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "refund_cancel_reservation", 5.0, "op-18", source_type="reservation", source_id=2)
    assert resp.json()["balance_after"] == 5.0


# 15. return refund
def test_return_refund(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "refund_return_sale", 7.0, "op-19", source_type="return", source_id=3)
    assert resp.json()["balance_after"] == 7.0


# 16. manual adjustment
def test_manual_adjustment(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "manual_adjustment", 8.0, "op-20")
    assert resp.json()["balance_after"] == 8.0


# 17. correction
def test_correction(client, cashier_headers, seeded_student, monkeypatch):
    _enable_ledger(monkeypatch)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "correction", -3.0, "op-21")
    assert resp.json()["balance_after"] == -3.0


# 18. rollback on journal failure
def test_rollback_on_journal_failure(client, cashier_headers, seeded_student, db_session, monkeypatch):
    _enable_ledger(monkeypatch)
    from app.services import student_wallet as sw_module
    original = sw_module.create_journal_entry

    def boom(*args, **kwargs):
        raise RuntimeError("journal failure")

    monkeypatch.setattr(sw_module, "create_journal_entry", boom)
    resp = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 100.0, "op-22")
    monkeypatch.setattr(sw_module, "create_journal_entry", original)
    assert resp.status_code == 500
    entry = db_session.query(StudentWalletEntry).filter(StudentWalletEntry.operation_id == "op-22").first()
    assert entry is None
    student = db_session.query(type(seeded_student)).filter_by(id=seeded_student.id).first()
    assert student.balance == 0.0


# 19. reconciliation mismatch reported (no auto-repair)
def test_reconciliation_mismatch(client, admin_headers, seeded_student, db_session, monkeypatch):
    _enable_ledger(monkeypatch)
    _post_entry(client, admin_headers, seeded_student.id, "deposit_change", 50.0, "op-23")
    # Simulate drift in cached balance without a ledger entry.
    student = db_session.query(type(seeded_student)).filter_by(id=seeded_student.id).first()
    student.balance = 999.0
    db_session.commit()
    resp = client.get("/students/wallet/reconciliation", headers=admin_headers)
    assert resp.status_code == 200
    rows = {row["student_id"]: row for row in resp.json()}
    assert seeded_student.id in rows
    assert rows[seeded_student.id]["matches"] is False
    assert rows[seeded_student.id]["derived_balance"] == 50.0
    assert rows[seeded_student.id]["cached_balance"] == 999.0


# 20. migration opening balance (deterministic, idempotent, dry-run safe)
def test_migration_opening_balance(client, admin_headers, seeded_student, db_session, monkeypatch):
    _enable_ledger(monkeypatch)
    # Set a legacy balance on the student.
    student = db_session.query(type(seeded_student)).filter_by(id=seeded_student.id).first()
    student.balance = 123.45
    db_session.commit()

    dry = client.post(
        "/students/wallet/migration/opening-balances",
        json={"migration_run_id": "run-1", "dry_run": True},
        headers=admin_headers,
    )
    assert dry.status_code == 200
    assert dry.json()["processed_count"] == 0
    assert db_session.query(StudentWalletEntry).count() == 0

    real = client.post(
        "/students/wallet/migration/opening-balances",
        json={"migration_run_id": "run-1", "dry_run": False},
        headers=admin_headers,
    )
    assert real.status_code == 200
    body = real.json()
    assert body["processed_count"] == 1
    assert body["entries"][0]["amount"] == 123.45
    assert body["entries"][0]["balance_after"] == 123.45

    # Idempotent rerun
    again = client.post(
        "/students/wallet/migration/opening-balances",
        json={"migration_run_id": "run-1", "dry_run": False},
        headers=admin_headers,
    )
    assert again.json()["processed_count"] == 0
    assert again.json()["skipped_count"] == 1
    assert db_session.query(StudentWalletEntry).count() == 1


# 21. disabled feature flag preserves legacy behavior
def test_disabled_feature_flag_preserves_legacy(client, cashier_headers, seeded_student, db_session, monkeypatch):
    monkeypatch.delenv("WALLET_LEDGER_ENABLED", raising=False)
    # Wallet endpoint unavailable
    resp = _post_entry(client, cashier_headers, seeded_student.id, "deposit_change", 50.0, "op-24")
    assert resp.status_code == 503
    # PUT balance updates directly, no wallet entry created
    update = client.put(
        f"/students/{seeded_student.id}",
        json={"balance": 77.0},
        headers=cashier_headers,
    )
    assert update.status_code == 200
    assert update.json()["balance"] == 77.0
    assert db_session.query(StudentWalletEntry).count() == 0


# 22. enabled feature flag routes balance update through ledger
def test_enabled_feature_flag_uses_ledger(client, cashier_headers, seeded_student, db_session, monkeypatch):
    _enable_ledger(monkeypatch)
    update = client.put(
        f"/students/{seeded_student.id}",
        json={"balance": 60.0},
        headers=cashier_headers,
    )
    assert update.status_code == 200
    assert update.json()["balance"] == 60.0
    entry = db_session.query(StudentWalletEntry).filter(
        StudentWalletEntry.entry_type == "manual_adjustment"
    ).first()
    assert entry is not None
    assert entry.amount == 60.0
    balance = client.get(f"/students/{seeded_student.id}/wallet/balance", headers=cashier_headers)
    assert balance.json()["balance"] == 60.0


# OpenAPI: new paths appear, existing paths preserved
def test_openapi_contains_wallet_paths(client, admin_headers):
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    paths = resp.json()["paths"]
    assert "/students/{student_id}/wallet/entries" in paths
    assert "/students/{student_id}/wallet/balance" in paths
    assert "/students/wallet/reconciliation" in paths
    assert "/students/wallet/migration/opening-balances" in paths
    # Existing path preserved
    assert "/students/{student_id}" in paths
    assert "/students" in paths
