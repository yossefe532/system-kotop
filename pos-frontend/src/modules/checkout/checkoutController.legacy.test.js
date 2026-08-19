import { describe, it, expect, vi } from 'vitest'
import { createCheckoutController } from './checkoutController'

vi.mock('../../config/featureFlags.js', () => ({ isWalletLedgerEnabled: false }))

function makeDeps() {
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
    getCheckoutState: () => state,
    setters,
  }
  return { deps, enqueueSync }
}

describe('checkoutController legacy wallet mode', () => {
  it('enqueues student_balance_set when ledger disabled', async () => {
    const { deps, enqueueSync } = makeDeps()
    await createCheckoutController(deps).completeSale()
    const legacy = enqueueSync.mock.calls.filter((c) => c[0].type === 'student_balance_set')
    expect(legacy).toHaveLength(1)
    expect(legacy[0][0].payload.balance).toBe(0)
    const ledger = enqueueSync.mock.calls.filter((c) => c[0].type === 'wallet_entry_create')
    expect(ledger).toHaveLength(0)
  })
})
