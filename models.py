from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=False, index=True)
    isbn_barcode = Column(String, nullable=True, unique=True, index=True)
    cost_price = Column(Float, nullable=False, default=0.0)
    selling_price = Column(Float, nullable=False, default=0.0)
    estimated_cost_price = Column(Float, nullable=True)
    estimated_selling_price = Column(Float, nullable=True)
    total_stock = Column(Integer, nullable=False, default=0)
    reserved_stock = Column(Integer, nullable=False, default=0)
    is_arriving = Column(Boolean, nullable=False, default=False)

    items = relationship("TransactionItem", back_populates="book")
    reservations = relationship("Reservation", back_populates="book")

    @property
    def available_stock(self) -> int:
        return self.total_stock - self.reserved_stock


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True, index=True)
    gender = Column(String, nullable=True)
    grade = Column(String, nullable=True)
    system = Column(String, nullable=True)
    specialty = Column(String, nullable=True)
    balance = Column(Float, nullable=False, default=0.0)

    transactions = relationship("Transaction", back_populates="student")
    reservations = relationship("Reservation", back_populates="student")
    wallet_entries = relationship("StudentWalletEntry", back_populates="student")


class StudentWalletEntry(Base):
    """Immutable append-only ledger of student wallet mutations.

    NOTE: money representation is intentionally the legacy Float type for this
    foundational wave. A later phase migrates amounts to minor units (BIGINT).
    The `amount` is signed: negative = debit/out, positive = credit/in.
    """

    __tablename__ = "student_wallet_entries"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    entry_type = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False, default=0.0)
    direction = Column(String, nullable=False)
    source_type = Column(String, nullable=True, index=True)
    source_id = Column(Integer, nullable=True, index=True)
    operation_id = Column(String, nullable=False, unique=True, index=True)
    balance_before = Column(Float, nullable=False, default=0.0)
    balance_after = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_by = Column(String, nullable=True)
    device_id = Column(String, nullable=True, index=True)
    reversal_of_entry_id = Column(Integer, ForeignKey("student_wallet_entries.id"), nullable=True)
    metadata_json = Column(Text, nullable=True)

    student = relationship("Student", back_populates="wallet_entries")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    total_amount = Column(Float, nullable=False)
    discount = Column(Float, nullable=False, default=0.0)
    staff_name = Column(String, nullable=False)
    date = Column(DateTime, nullable=False, default=datetime.utcnow)

    student = relationship("Student", back_populates="transactions")
    items = relationship("TransactionItem", back_populates="transaction", cascade="all, delete-orphan")


class TransactionItem(Base):
    __tablename__ = "transaction_items"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    price_at_sale = Column(Float, nullable=False)
    cost_at_sale = Column(Float, nullable=False, default=0.0)

    transaction = relationship("Transaction", back_populates="items")
    book = relationship("Book", back_populates="items")


class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    deposit_amount = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="pending")
    staff_name = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    student = relationship("Student", back_populates="reservations")
    book = relationship("Book", back_populates="reservations")


class SafeTransaction(Base):
    __tablename__ = "safe_transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    type = Column(String, nullable=False)
    reason = Column(String, nullable=True)
    staff_name = Column(String, nullable=False)
    source_type = Column(String, nullable=True, index=True)
    source_id = Column(Integer, nullable=True, index=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)

    journal_entry = relationship("JournalEntry", foreign_keys=[journal_entry_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)
    details = Column(String, nullable=True)
    staff_name = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)


class InventorySession(Base):
    __tablename__ = "inventory_sessions"

    id = Column(Integer, primary_key=True, index=True)
    staff_name = Column(String, nullable=False)
    total_cash_found = Column(Float, nullable=False)
    expected_cash = Column(Float, nullable=False, default=0.0)
    variance_amount = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="reconciled")
    supervisor_name = Column(String, nullable=True)
    approval_notes = Column(Text, nullable=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)


class Supply(Base):
    __tablename__ = "supplies"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_cost = Column(Float, nullable=False)
    total_cost = Column(Float, nullable=False)
    paid_amount = Column(Float, nullable=False, default=0.0)
    supplier_name = Column(String, nullable=True)
    staff_name = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)

    book = relationship("Book")


class LedgerAccount(Base):
    __tablename__ = "ledger_accounts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    account_type = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    allow_manual_entries = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    __table_args__ = (UniqueConstraint("source_type", "source_id", name="uq_journal_entry_source"),)

    id = Column(Integer, primary_key=True, index=True)
    entry_number = Column(String, nullable=False, unique=True, index=True)
    source_type = Column(String, nullable=True, index=True)
    source_id = Column(Integer, nullable=True, index=True)
    reference = Column(String, nullable=True, index=True)
    description = Column(String, nullable=False)
    reason = Column(String, nullable=True)
    staff_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="posted", index=True)
    period_key = Column(String, nullable=False, index=True)
    event_timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    posted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    is_reversal = Column(Boolean, nullable=False, default=False)
    reversal_of_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    lines = relationship("JournalLine", back_populates="journal_entry", cascade="all, delete-orphan")


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id = Column(Integer, primary_key=True, index=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("ledger_accounts.id"), nullable=False, index=True)
    line_type = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    memo = Column(String, nullable=True)

    journal_entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("LedgerAccount")


class FinancialAuditTrail(Base):
    __tablename__ = "financial_audit_trail"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    staff_name = Column(String, nullable=False)
    reason = Column(String, nullable=True)
    previous_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    originating_transaction_type = Column(String, nullable=True, index=True)
    originating_transaction_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class FinancialPeriod(Base):
    __tablename__ = "financial_periods"
    __table_args__ = (UniqueConstraint("period_key", "period_type", name="uq_financial_period_key_type"),)

    id = Column(Integer, primary_key=True, index=True)
    period_key = Column(String, nullable=False, index=True)
    period_type = Column(String, nullable=False, index=True)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default="open", index=True)
    closed_at = Column(DateTime, nullable=True)
    closed_by = Column(String, nullable=True)
    notes = Column(Text, nullable=True)


class CashDrawerSession(Base):
    __tablename__ = "cash_drawer_sessions"

    id = Column(Integer, primary_key=True, index=True)
    staff_name = Column(String, nullable=False, index=True)
    opening_balance = Column(Float, nullable=False, default=0.0)
    expected_cash = Column(Float, nullable=True)
    counted_cash = Column(Float, nullable=True)
    variance_amount = Column(Float, nullable=True)
    status = Column(String, nullable=False, default="open", index=True)
    supervisor_name = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    opened_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    closed_at = Column(DateTime, nullable=True, index=True)


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"

    id = Column(Integer, primary_key=True, index=True)
    reconciliation_type = Column(String, nullable=False, index=True)
    period_key = Column(String, nullable=False, index=True)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    expected_cash = Column(Float, nullable=False, default=0.0)
    counted_cash = Column(Float, nullable=True)
    variance_amount = Column(Float, nullable=False, default=0.0)
    exception_count = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="balanced", index=True)
    staff_name = Column(String, nullable=False)
    supervisor_name = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class ReceiptArchive(Base):
    __tablename__ = "receipt_archives"

    id = Column(Integer, primary_key=True, index=True)
    transaction_code = Column(String, nullable=True, index=True)
    receipt_type = Column(String, nullable=False)
    staff_name = Column(String, nullable=True)
    payload = Column(Text, nullable=False)
    printed_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class SyncReplayRecord(Base):
    __tablename__ = "sync_replay_records"

    id = Column(Integer, primary_key=True, index=True)
    operation_id = Column(String, nullable=False, unique=True, index=True)
    operation_type = Column(String, nullable=True, index=True)
    request_method = Column(String, nullable=False)
    request_path = Column(String, nullable=False)
    fingerprint = Column(String, nullable=False)
    replay_token = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, default="processing", index=True)
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    error_detail = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, unique=True, index=True)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    token_version = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    roles = relationship("Role", secondary="user_roles", back_populates="users")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)

    users = relationship("User", secondary="user_roles", back_populates="roles")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    issued_ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    user = relationship("User", back_populates="refresh_tokens")
