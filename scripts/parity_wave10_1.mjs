import { createCheckoutController } from '../pos-frontend/src/modules/checkout/checkoutController.js'

const formatTransactionId = (n) => `ED-${String(n).padStart(4, '0')}`
const t = (k) => `__${k}__`
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

let failures = 0
let total = 0

function check(name, expected, actual) {
  total += 1
  if (!eq(expected, actual)) {
    failures += 1
    console.log(`FAIL ${name}`)
    console.log('  expected', JSON.stringify(expected))
    console.log('  actual  ', JSON.stringify(actual))
  }
}

function makeHarness(opts) {
  opts = opts || {}
  const state = opts.state || {}
  const onlineFail = !!opts.onlineFail
  const authFail = !!opts.authFail
  const calls = []
  const setters = {}
  const names = 'setStudents,setSelectedStudentId,setQuickStudent,setSalesHistory,setPendingReservations,setTransactionCounter,setLastTransaction,setWalletLog,setBooks,setUseBackend,setDiscount,setPaidAmount,setSearchTerm,setActiveView'.split(',')
  for (const n of names) setters[n] = function() { calls.push({ kind: 'setter', name: n, args: Array.from(arguments) }) }
  const apiRequest = async function(route, opts2) {
    calls.push({ kind: 'api', route, body: JSON.parse((opts2 && opts2.body) || '{}') })
    if (authFail) { const e = new Error('unauthorized'); e._isAuth = true; throw e }
    if (onlineFail) throw new Error('server down')
    return { id: 1, name: 'FromServer' }
  }
  const enqueueSync = function(op) { calls.push({ kind: 'sync', op }) }
  const isAuthError = function(e) { return !!(e && e._isAuth) }
  const handleSessionExpired = function() { calls.push({ kind: 'authExpired' }) }
  const fetchCoreSnapshot = async function() { calls.push({ kind: 'snapshot' }); return { uiBooks: [], uiStudents: [], pending: [] } }
  const clearCart = function() { calls.push({ kind: 'clearCart' }) }
  const mapUiStudentToApi = function(s) { return Object.assign({}, s) }
  const mapApiBookToUi = function(b) { return b }
  const mapApiStudentToUi = function(s) { return Object.assign({}, s, { id: 99 }) }
  const baseState = Object.assign({
    cartDetails: { items: [{ id: 1, qty: 2, type: 'sale', sellingPrice: 100, costPrice: 60 }], subtotal: 200, total: 200, safeDiscount: 0 },
    selectedStudent: { id: 7, name: 'Sam', balance: 50 },
    quickStudent: { name: '', phone: '', stage: 'first', gender: 'male', system: 'general', specialty: '' },
    useBackend: false, transactionCounter: 3, selectedStaffId: 'youssef', paymentMethod: 'cash', paidAmount: '',
  }, state)
  const ctrl = createCheckoutController({
    apiRequest, enqueueSync, isAuthError, handleSessionExpired, fetchCoreSnapshot, clearCart,
    formatTransactionId, t, mapUiStudentToApi, mapApiBookToUi, mapApiStudentToUi,
    getCheckoutState: function() { return baseState }, setters, alert: function() {},
  })
  return { ctrl, calls, baseState }
}

async function run(name, fn) {
  await fn()
}

;// 1. Empty cart
await run('empty cart', async function() {
  const h = makeHarness({ state: { cartDetails: { items: [] } } })
  await h.ctrl.completeSale()
  check('1. empty cart: no calls', [], h.calls)
})

;// 2. Offline normal cash sale
await run('offline', async function() {
  const h = makeHarness()
  await h.ctrl.completeSale()
  const kinds = h.calls.map(function(c) { return c.kind })
  check('2. offline: no api calls', false, kinds.indexOf('api') !== -1)
  check('2. offline: has sync', true, kinds.indexOf('sync') !== -1)
  check('2. offline: has clearCart', true, kinds.indexOf('clearCart') !== -1)
  const syncTypes = h.calls.filter(function(c) { return c.kind === 'sync' }).map(function(c) { return c.op.type })
  check('2. offline: transaction_create queued', true, syncTypes.indexOf('transaction_create') !== -1)
  const sn = h.calls.filter(function(c) { return c.kind === 'setter' }).map(function(c) { return c.name })
  check('2. offline: setActiveView last', 'setActiveView', sn[sn.length - 1])
  check('2. offline: setSalesHistory called', true, sn.indexOf('setSalesHistory') !== -1)
  check('2. offline: setTransactionCounter called', true, sn.indexOf('setTransactionCounter') !== -1)
  check('2. offline: setBooks called (stock)', true, sn.indexOf('setBooks') !== -1)
})

;// 3. Online success
await run('online', async function() {
  const h = makeHarness({ state: { useBackend: true } })
  await h.ctrl.completeSale()
  const routes = h.calls.filter(function(c) { return c.kind === 'api' }).map(function(c) { return c.route })
  check('3. online: POST /transactions', true, routes.indexOf('/transactions') !== -1)
  check('3. online: snapshot refreshed', true, h.calls.some(function(c) { return c.kind === 'snapshot' }))
  const sn = h.calls.filter(function(c) { return c.kind === 'setter' }).map(function(c) { return c.name })
  check('3. online: setActiveView last', 'setActiveView', sn[sn.length - 1])
})

;// 4. Online failure -> offline fallback
await run('fallback', async function() {
  const h = makeHarness({ state: { useBackend: true }, onlineFail: true })
  await h.ctrl.completeSale()
  check('4. fallback: setUseBackend(false)', true, h.calls.some(function(c) { return c.kind === 'setter' && c.name === 'setUseBackend' && c.args[0] === false }))
  check('4. fallback: still syncs transaction_create', true, h.calls.some(function(c) { return c.kind === 'sync' && c.op.type === 'transaction_create' }))
})

;// 5. Auth failure
await run('auth', async function() {
  const h = makeHarness({ state: { useBackend: true }, authFail: true })
  await h.ctrl.completeSale()
  check('5. auth: handleSessionExpired called', true, h.calls.some(function(c) { return c.kind === 'authExpired' }))
  check('5. auth: no setSalesHistory (early return)', false, h.calls.some(function(c) { return c.kind === 'setter' && c.name === 'setSalesHistory' }))
})

;// 6. Debt sale
await run('debt', async function() {
  const h = makeHarness({ state: { paidAmount: '50', cartDetails: { items: [{ id: 1, qty: 2, type: 'sale', sellingPrice: 100, costPrice: 60 }], subtotal: 200, total: 200, safeDiscount: 0 } } })
  await h.ctrl.completeSale()
  const bs = h.calls.filter(function(c) { return c.kind === 'sync' && c.op.type === 'student_balance_set' })
  check('6. debt: student_balance_set queued', true, bs.length === 1)
  check('6. debt: balance decreased to -100', -100, bs[0].op.payload.balance)
})

;// 7. Wallet payment (sufficient)
await run('wallet', async function() {
  const h = makeHarness({ state: { paymentMethod: 'wallet', selectedStudent: { id: 7, name: 'Sam', balance: 300 }, cartDetails: { items: [{ id: 1, qty: 1, type: 'sale', sellingPrice: 100, costPrice: 60 }], subtotal: 100, total: 100, safeDiscount: 0 } } })
  await h.ctrl.completeSale()
  const ws = h.calls.filter(function(c) { return c.kind === 'sync' && c.op.type === 'student_balance_set' })
  check('7. wallet: student_balance_set queued', true, ws.length === 1)
  check('7. wallet: balance decreased by total to 200', 200, ws[0].op.payload.balance)
})

;// 8. Transaction ID generation
await run('txid', async function() {
  const h = makeHarness({ state: { transactionCounter: 42 } })
  await h.ctrl.completeSale()
  const last = h.calls.filter(function(c) { return c.kind === 'setter' && c.name === 'setLastTransaction' })[0]
  check('8. tx id format', 'ED-0042', last.args[0].id)
})

;// 9. Reset/navigation is last
await run('reset', async function() {
  const h = makeHarness()
  await h.ctrl.completeSale()
  const sn = h.calls.filter(function(c) { return c.kind === 'setter' }).map(function(c) { return c.name })
  check('9. last setter is setActiveView', 'setActiveView', sn[sn.length - 1])
  check('9. setSearchTerm before setActiveView', true, sn.indexOf('setSearchTerm') < sn.indexOf('setActiveView'))
})

;// 10. Stock deduction floor
await run('stock', async function() {
  const h = makeHarness({ state: { cartDetails: { items: [{ id: 1, qty: 999, type: 'sale', sellingPrice: 100, costPrice: 60 }], subtotal: 100, total: 100, safeDiscount: 0 } } })
  await h.ctrl.completeSale()
  const sb = h.calls.filter(function(c) { return c.kind === 'setter' && c.name === 'setBooks' })[0]
  const books = sb.args[0]([{ id: 1, stock: 5 }])
  check('10. stock floored at 0', 0, books[0].stock)
})

console.log(failures === 0 ? `PARITY OK (${total} cases)` : `PARITY FAILURES: ${failures}/${total}`)
process.exit(failures ? 1 : 0)
