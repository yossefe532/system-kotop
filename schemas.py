from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, ConfigDict, model_validator


class BookBase(BaseModel):
    title: str
    author: str
    isbn_barcode: Optional[str] = None
    cost_price: float
    selling_price: float
    estimated_cost_price: Optional[float] = None
    estimated_selling_price: Optional[float] = None
    total_stock: int
    reserved_stock: int = 0
    is_arriving: bool = False


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    isbn_barcode: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    estimated_cost_price: Optional[float] = None
    estimated_selling_price: Optional[float] = None
    total_stock: Optional[int] = None
    reserved_stock: Optional[int] = None
    is_arriving: Optional[bool] = None


class BookOut(BookBase):
    id: int
    available_stock: int
    model_config = ConfigDict(from_attributes=True)


class StudentBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    grade: Optional[Literal["1st Sec", "2nd Sec", "3rd Sec"]] = None
    system: Optional[Literal["General", "Azhar"]] = None
    specialty: Optional[Literal["Scientific", "Math", "Literary"]] = None
    balance: float = 0.0


class StudentCreate(StudentBase):
    @model_validator(mode="after")
    def validate_specialty(self):
        if self.grade == "3rd Sec" and not self.specialty:
            raise ValueError("Specialty is required for 3rd Sec students")
        if self.grade in {"1st Sec", "2nd Sec"} and self.specialty:
            raise ValueError("Specialty is only allowed for 3rd Sec students")
        return self


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    grade: Optional[Literal["1st Sec", "2nd Sec", "3rd Sec"]] = None
    system: Optional[Literal["General", "Azhar"]] = None
    specialty: Optional[Literal["Scientific", "Math", "Literary"]] = None
    balance: Optional[float] = None


class StudentOut(StudentBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


WALLET_ENTRY_TYPES = Literal[
    "purchase_debt",
    "deposit_change",
    "purchase_wallet",
    "pickup_wallet",
    "refund_cancel_reservation",
    "refund_return_sale",
    "manual_adjustment",
    "correction",
    "migration_opening_balance",
]


class WalletEntryCreate(BaseModel):
    entry_type: WALLET_ENTRY_TYPES
    amount: float
    source_type: str
    source_id: Optional[int] = None
    operation_id: str
    reason: Optional[str] = None
    metadata: Optional[dict] = None
    actor: Optional[str] = None
    device_id: Optional[str] = None


class WalletEntryOut(BaseModel):
    id: int
    student_id: int
    entry_type: str
    amount: float
    direction: str
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    operation_id: str
    balance_before: float
    balance_after: float
    created_at: datetime
    created_by: Optional[str] = None
    device_id: Optional[str] = None
    reversal_of_entry_id: Optional[int] = None
    metadata_json: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WalletBalanceOut(BaseModel):
    student_id: int
    balance: float


class WalletReconciliationOut(BaseModel):
    student_id: int
    derived_balance: float
    cached_balance: float
    matches: bool


class WalletMigrationRequest(BaseModel):
    migration_run_id: str
    reason: Optional[str] = None
    actor: Optional[str] = None
    dry_run: bool = False


class WalletMigrationResult(BaseModel):
    migration_run_id: str
    dry_run: bool
    processed_count: int
    skipped_count: int
    entries: List[dict]


class TransactionItemCreate(BaseModel):
    book_id: int
    quantity: int
    reservation_id: Optional[int] = None


class TransactionItemOut(BaseModel):
    id: int
    book_id: int
    quantity: int
    price_at_sale: float
    cost_at_sale: float
    model_config = ConfigDict(from_attributes=True)


class TransactionCreate(BaseModel):
    student_id: int
    discount: float = 0.0
    staff_name: str
    items: List[TransactionItemCreate]


class TransactionOut(BaseModel):
    id: int
    student_id: int
    total_amount: float
    discount: float
    staff_name: str
    date: datetime
    items: List[TransactionItemOut]
    model_config = ConfigDict(from_attributes=True)


class ReservationBase(BaseModel):
    student_id: int
    book_id: int
    quantity: int = 1
    deposit_amount: float = 0.0
    status: Literal["pending", "completed", "cancelled"] = "pending"
    staff_name: str


class ReservationCreate(ReservationBase):
    pass


class ReservationUpdate(BaseModel):
    status: Literal["pending", "completed", "cancelled"]


class ReservationOut(ReservationBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SafeTransactionCreate(BaseModel):
    amount: float
    type: Literal["sale", "withdrawal", "emergency", "supply"]
    reason: Optional[str] = None
    staff_name: str


class SafeTransactionOut(SafeTransactionCreate):
    id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class AuditLogCreate(BaseModel):
    action: str
    details: Optional[str] = None
    staff_name: str


class AuditLogOut(AuditLogCreate):
    id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class InventorySessionCreate(BaseModel):
    staff_name: Literal["Heba", "Mariam"]
    total_cash_found: float


class InventorySessionOut(InventorySessionCreate):
    id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class EmergencyWithdrawalCreate(BaseModel):
    amount: float
    reason: Optional[str] = None
    staff_name: str


class SupplyCreate(BaseModel):
    book_id: int
    quantity: int
    unit_cost: float
    paid_amount: float = 0.0
    supplier_name: Optional[str] = None
    staff_name: str


class SupplyOut(SupplyCreate):
    id: int
    total_cost: float
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class ReceiptArchiveCreate(BaseModel):
    transaction_code: Optional[str] = None
    receipt_type: str
    staff_name: Optional[str] = None
    payload: dict


class ReceiptArchiveOut(BaseModel):
    id: int
    transaction_code: Optional[str] = None
    receipt_type: str
    staff_name: Optional[str] = None
    payload: dict
    printed_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FinanceReportOut(BaseModel):
    revenue: float
    cogs: float
    gross_profit: float
    withdrawals: float
    safe_balance: float
    supplier_due: float


class JournalLineOut(BaseModel):
    account_code: str
    account_name: str
    line_type: str
    amount: float
    memo: Optional[str] = None


class JournalEntryOut(BaseModel):
    id: int
    entry_number: str
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    description: str
    reason: Optional[str] = None
    staff_name: str
    status: str
    period_key: str
    event_timestamp: datetime
    posted_at: datetime
    is_reversal: bool
    lines: List[JournalLineOut]


class TrialBalanceLineOut(BaseModel):
    account_code: str
    account_name: str
    account_type: str
    debits: float
    credits: float
    net_balance: float


class FinancialAuditTrailOut(BaseModel):
    id: int
    entity_type: str
    entity_id: Optional[int] = None
    action: str
    staff_name: str
    reason: Optional[str] = None
    previous_value: Optional[str] = None
    new_value: Optional[str] = None
    originating_transaction_type: Optional[str] = None
    originating_transaction_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReconciliationRunCreate(BaseModel):
    reconciliation_type: Literal["daily", "monthly"]
    period_key: str
    starts_at: datetime
    ends_at: datetime
    counted_cash: Optional[float] = None
    staff_name: str
    supervisor_name: Optional[str] = None
    notes: Optional[str] = None


class ReconciliationRunOut(BaseModel):
    id: int
    reconciliation_type: str
    period_key: str
    starts_at: datetime
    ends_at: datetime
    expected_cash: float
    counted_cash: Optional[float] = None
    variance_amount: float
    exception_count: int
    status: str
    staff_name: str
    supervisor_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CashDrawerSessionCreate(BaseModel):
    staff_name: str
    opening_balance: float = 0.0
    notes: Optional[str] = None


class CashDrawerSessionClose(BaseModel):
    counted_cash: float
    supervisor_name: Optional[str] = None
    notes: Optional[str] = None


class CashDrawerSessionOut(BaseModel):
    id: int
    staff_name: str
    opening_balance: float
    expected_cash: Optional[float] = None
    counted_cash: Optional[float] = None
    variance_amount: Optional[float] = None
    status: str
    supervisor_name: Optional[str] = None
    notes: Optional[str] = None
    opened_at: datetime
    closed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class FinancialValidationOut(BaseModel):
    balanced_journal_entries: bool
    unbalanced_entry_ids: List[int]
    orphan_safe_transaction_ids: List[int]
    open_cash_drawer_count: int
    current_cash_balance: float


class FinancialSummaryOut(BaseModel):
    period_key: str
    revenue: float
    sales_returns: float
    cogs: float
    gross_profit: float
    cash_balance: float
    accounts_payable: float


class FinancialPeriodClose(BaseModel):
    closed_by: str
    notes: Optional[str] = None


class FinancialPeriodOut(BaseModel):
    id: int
    period_key: str
    period_type: str
    starts_at: datetime
    ends_at: datetime
    status: str
    closed_at: Optional[datetime] = None
    closed_by: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BookStatsOut(BaseModel):
    book_id: int
    sold_qty: int
    pending_reserved_qty: int
