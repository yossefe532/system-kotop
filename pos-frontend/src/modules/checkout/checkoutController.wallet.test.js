import { describe, it, expect, vi } from 'vitest'
import { createCheckoutController } from './checkoutController'

vi.mock('../../config/featureFlags.js', () => ({ isWalletLedgerEnabled: true }))

function makeDeps(over = {}) {
  const setters = {
    setStudents: vi.fn(),
    setSelectedStudentId: vi.fn(),
    setQuickStudent: vi.fn(),
    setSalesHistory: vi.fn(),
    setPendingReservations: vi.fn(),
    setTransactionCounter: vi.fn(),
    setLastTransaction: vi.fn(),
    setWalletLog: vi.fn(),
    setBooks: vi.fn(),
    setUseBackend: vi.fn(),
    setDiscount: vi.fn(),
    setPaidAmount: vi.fn(),
    setSearchTerm: vi.fn(),
    setActiveView: vi.fn(),
  }
  const apiRequest = vi.fn()
  const enqueueSync = vi.fn()
  const state = {
    cartDetails: {
      items: [{ id: 1, qty: 1, type: 'sale', sellingPrice: 100, costPrice: 60 }],
      subtotal: 100,
      total: 100,
      safeDiscount: 0,
    },
    selectedStudent: { id: 7, name: 'Sam', balance: 100 },
    quickStudent: { name: '', phone: '', stage: 'first', gender: 'male', system: 'general', specialty: '' },
    useBackend: false,
    transactionCounter: 1,
    selectedStaffId: 'youssef',
    paymentMethod: 'wallet',
    paidAmount: '',
  }
  const deps = {
    apiRequest,
    enqueueSync,
    isAuthError: vi.fn(() => false),
    handleSessionExpired: vi.fn(),
    fetchCoreSnapshot: vi.fn(async () => ({ uiBooks: [], uiStudents: [], pending: [] })),
    clearCart: vi.fn(),
    formatTransactionId: (n) => `ED-${String(n).padStart(4, '0')}`,
    t: (k) => `__${k}__`,
    mapUiStudentToApi: (s) => ({ ...s, _api: true }),
    mapApiBookToUi: (b) => b,
    mapApiStudentToUi: (s) => ({ ...s, id: s.id || 99, name: s.name || 'X' }),
    getCheckoutState: () => ({ ...state, ...(over.state || {}) }),
    setters,
    ...(over.deps || {}),
  }
  return { deps, setters, apiRequest, clearCart: deps.clearCart, enqueueSync }
}

describe('checkoutController wallet ledger mode', () => {
  it('enqueues wallet_entry_create for wallet payment and no legacy set', async () => {
    const { deps, enqueueSync } = makeDeps()
    await createCheckoutController(deps).completeSale()
    const walletOps = enqueueSync.mock.calls.filter((c) => c[0].type === 'wallet_entry_create')
    expect(walletOps).toHaveLength(1)
    expect(walletOps[0][0].payload.entry_type).toBe('purchase_wallet')
    expect(walletOps[0][0].payload.amount).toBe(-100)
    expect(walletOps[0][0].payload.operation_id).toBe('wallet:transaction:ED-0001:purchase_wallet')
    const legacy = enqueueSync.mock.calls.filter((c) => c[0].type === 'student_balance_set')
    expect(legacy).toHaveLength(0)
  })

  it('still enqueues transaction_create alongside the wallet entry', async () => {
    const { deps, enqueueSync } = makeDeps()
    await createCheckoutController(deps).completeSale()
    const types = enqueueSync.mock.calls.map((c) => c[0].type)
    expect(types).toContain('transaction_create')
    expect(types).toContain('wallet_entry_create')
  })

  it('local student balance updated by the same delta', async () => {
    const { deps, setters } = makeDeps()
    await createCheckoutController(deps).completeSale()
    const studentUpdater = setters.setStudents.mock.calls[0][0]
    const updated = studentUpdater([{ id: 7, name: 'Sam', balance: 100 }])
    expect(updated[0].balance).toBe(0)
  })
})
