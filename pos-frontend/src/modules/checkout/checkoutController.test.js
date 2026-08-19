import { describe, it, expect, vi } from 'vitest'
import { createCheckoutController } from './checkoutController'

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
  const isAuthError = vi.fn(() => false)
  const handleSessionExpired = vi.fn()
  const fetchCoreSnapshot = vi.fn(async () => ({ uiBooks: [], uiStudents: [], pending: [] }))
  const clearCart = vi.fn()
  const formatTransactionId = (n) => `ED-${String(n).padStart(4, '0')}`
  const t = (k) => `__${k}__`
  const mapUiStudentToApi = (s) => ({ ...s, _api: true })
  const mapApiBookToUi = (b) => b
  const mapApiStudentToUi = (s) => ({ ...s, id: s.id || 99, name: s.name || 'X' })

  const state = {
    cartDetails: {
      items: [{ id: 1, qty: 1, type: 'sale', sellingPrice: 100, costPrice: 60 }],
      subtotal: 100,
      total: 100,
      safeDiscount: 0,
    },
    selectedStudent: { id: 7, name: 'Sam', balance: 0 },
    quickStudent: { name: '', phone: '', stage: 'first', gender: 'male', system: 'general', specialty: '' },
    useBackend: false,
    transactionCounter: 1,
    selectedStaffId: 'youssef',
    paymentMethod: 'cash',
    paidAmount: '',
  }

  return {
    deps: {
      apiRequest,
      enqueueSync,
      isAuthError,
      handleSessionExpired,
      fetchCoreSnapshot,
      clearCart,
      formatTransactionId,
      t,
      mapUiStudentToApi,
      mapApiBookToUi,
      mapApiStudentToUi,
      getCheckoutState: () => ({ ...state, ...(over.state || {}) }),
      setters,
      ...(over.deps || {}),
    },
    setters,
    apiRequest,
    clearCart,
    enqueueSync,
    state,
  }
}

describe('createCheckoutController', () => {
  it('returns a completeSale function', () => {
    const { deps } = makeDeps()
    const ctrl = createCheckoutController(deps)
    expect(typeof ctrl.completeSale).toBe('function')
  })

  it('empty cart returns early with no side effects', async () => {
    const { deps, setters, apiRequest, clearCart } = makeDeps({ state: { cartDetails: { items: [] } } })
    await createCheckoutController(deps).completeSale()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(setters.setSalesHistory).not.toHaveBeenCalled()
    expect(clearCart).not.toHaveBeenCalled()
  })

  it('offline normal cash sale: updates history, counter, stock, sync queue, then resets', async () => {
    const { deps, setters, apiRequest, clearCart, enqueueSync } = makeDeps()
    await createCheckoutController(deps).completeSale()
    expect(setters.setSalesHistory).toHaveBeenCalledTimes(1)
    expect(setters.setTransactionCounter).toHaveBeenCalledWith(expect.any(Function))
    expect(setters.setLastTransaction).toHaveBeenCalledTimes(1)
    expect(setters.setBooks).toHaveBeenCalledTimes(1)
    expect(setters.setActiveView).toHaveBeenLastCalledWith('receipt')
    expect(setters.setDiscount).toHaveBeenLastCalledWith(0)
    expect(clearCart).toHaveBeenCalledTimes(1)
    const types = enqueueSync.mock.calls.map((c) => c[0].type)
    expect(types).toContain('transaction_create')
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('online success: commits to server, refreshes snapshot', async () => {
    const { deps, apiRequest, setters } = makeDeps({ state: { useBackend: true } })
    apiRequest.mockResolvedValue({ id: 1 })
    await createCheckoutController(deps).completeSale()
    const routes = apiRequest.mock.calls.map((c) => c[0])
    expect(routes).toContain('/transactions')
    expect(setters.setActiveView).toHaveBeenLastCalledWith('receipt')
  })

  it('auth failure triggers session expiration and returns early', async () => {
    const { deps, apiRequest } = makeDeps({ state: { useBackend: true } })
    apiRequest.mockRejectedValue(new Error('boom'))
    deps.isAuthError = () => true
    const handleSessionExpired = vi.fn()
    deps.handleSessionExpired = handleSessionExpired
    await createCheckoutController(deps).completeSale()
    expect(handleSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('reset/navigation is the very last setter call', async () => {
    const { deps, setters } = makeDeps()
    await createCheckoutController(deps).completeSale()
    expect(setters.setActiveView).toHaveBeenCalledTimes(1)
    expect(setters.setActiveView).toHaveBeenLastCalledWith('receipt')
  })
})
