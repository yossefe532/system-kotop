import {
  buildSaleEntry,
  buildReservationRecords,
  buildServerReservationPayloads,
  buildServerTransactionPayload,
  buildSyncTransactionPayload,
  computeBalanceAdjustment,
  computeCostTotal,
  computeNetProfit,
  buildStockDeductionItems,
  computeNextStock,
  deriveReceiptType,
} from '../pos-frontend/src/modules/checkout/checkoutService.js'

// Shared deterministic dependencies (mirror App.jsx originals)
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

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

const book1 = { id: 1, title: 'B1', sellingPrice: 100, costPrice: 60, stock: 10, isArriving: false }
const book2 = { id: 2, title: 'B2', sellingPrice: 250, costPrice: 150, stock: 5, isArriving: false }
const book3 = { id: 3, title: 'B3', sellingPrice: 80, costPrice: 40, stock: 3, isArriving: true }
const book4 = { id: 4, title: 'B4', sellingPrice: 150, costPrice: 90, stock: 0, isArriving: false }

const studentA = { id: 10, name: 'Ali', balance: 0, stage: 'first' }
const studentB = { id: 20, name: 'Sara', balance: 300, stage: 'second' }
const studentC = { id: 30, name: 'Omar', balance: 50, stage: 'first' }

const mkItem = (book, qty, type, extra = {}) => ({
  ...book,
  lineKey: `${type === 'reservation' ? 'r' : 's'}-${book.id}`,
  key: `${type === 'reservation' ? 'r' : 's'}-${book.id}`,
  qty,
  type,
  deposit: 0,
  isZeroReservation: false,
  lineTotal: qty * (type === 'reservation' ? 0 : book.sellingPrice),
  pendingArrival: type === 'reservation' && book.isArriving,
  linkedReservation: null,
  ...extra,
})

const now = new Date('2026-08-09T10:00:00.000Z')
const txId = 'ED-0007'
const txCounter = 7

// ---------------------------------------------------------------------------
// 1. deriveReceiptType
// ---------------------------------------------------------------------------
check('receiptType empty', 'sale', deriveReceiptType([]))
check('receiptType single sale', 'sale', deriveReceiptType([mkItem(book1, 1, 'sale')]))
check('receiptType all reservation', 'reservation', deriveReceiptType([mkItem(book1, 1, 'reservation')]))
check('receiptType mixed', 'sale', deriveReceiptType([mkItem(book1, 1, 'sale'), mkItem(book3, 1, 'reservation')]))
check('receiptType multiple reservations', 'reservation', deriveReceiptType([mkItem(book1, 1, 'reservation'), mkItem(book3, 2, 'reservation')]))
check('receiptType multiple sales', 'sale', deriveReceiptType([mkItem(book1, 1, 'sale'), mkItem(book2, 1, 'sale')]))

// ---------------------------------------------------------------------------
// 2. computeCostTotal / computeNetProfit
// ---------------------------------------------------------------------------
const cartSaleOnly = { items: [mkItem(book1, 2, 'sale'), mkItem(book2, 1, 'sale')], subtotal: 450, total: 450, safeDiscount: 0 }
check('costTotal sale only', 270, computeCostTotal(cartSaleOnly))
check('netProfit sale only', 180, computeNetProfit(cartSaleOnly, 270))

const cartWithReservation = { items: [mkItem(book1, 1, 'sale'), mkItem(book3, 1, 'reservation', { deposit: 30 })], subtotal: 100, total: 100, safeDiscount: 0 }
check('costTotal reservation excluded', 60, computeCostTotal(cartWithReservation))
check('netProfit reservation excluded', 40, computeNetProfit(cartWithReservation, 60))

const cartReservationOnly = { items: [mkItem(book3, 1, 'reservation', { deposit: 30 })], subtotal: 0, total: 0, safeDiscount: 0 }
check('costTotal reservation only', 0, computeCostTotal(cartReservationOnly))

const cartWithDiscount = { items: [mkItem(book1, 1, 'sale')], subtotal: 100, total: 80, safeDiscount: 20 }
check('costTotal with discount', 60, computeCostTotal(cartWithDiscount))
check('netProfit with discount', 20, computeNetProfit(cartWithDiscount, 60))

// ---------------------------------------------------------------------------
// 3. buildSaleEntry
// ---------------------------------------------------------------------------
function refSaleEntry(cartDetails, studentForSale, selectedStaffId, paymentMethod) {
  const costTotal = cartDetails.items.reduce((sum, item) => {
    if (item.type === 'reservation') return sum
    return sum + item.costPrice * item.qty
  }, 0)
  const netProfit = cartDetails.total - costTotal
  const hasReservation = cartDetails.items.some((i) => i.type === 'reservation')
  const allReservation = cartDetails.items.length > 0 && cartDetails.items.every((i) => i.type === 'reservation')
  const receiptType = allReservation ? 'reservation' : hasReservation ? 'sale' : 'sale'
  return {
    id: formatTransactionId(txCounter),
    date: now.toISOString(),
    staffId: selectedStaffId,
    staffName: t(`staff.${selectedStaffId}`),
    student: studentForSale,
    items: cartDetails.items,
    subtotal: cartDetails.subtotal,
    discount: cartDetails.safeDiscount,
    total: cartDetails.total,
    costTotal,
    netProfit,
    receiptType,
    paymentMethod,
  }
}

const saleCommon = { cartDetails: cartSaleOnly, studentForSale: studentA, selectedStaffId: 'youssef', paymentMethod: 'cash' }
check('buildSaleEntry normal', refSaleEntry(cartSaleOnly, studentA, 'youssef', 'cash'), buildSaleEntry({ ...saleCommon, t, formatTransactionId, transactionCounter: txCounter, now }))
check('buildSaleEntry reservation', refSaleEntry(cartReservationOnly, studentB, 'heba', 'wallet'), buildSaleEntry({ cartDetails: cartReservationOnly, studentForSale: studentB, selectedStaffId: 'heba', paymentMethod: 'wallet', t, formatTransactionId, transactionCounter: txCounter, now }))
check('buildSaleEntry mixed', refSaleEntry(cartWithReservation, studentC, 'youssef', 'cash'), buildSaleEntry({ cartDetails: cartWithReservation, studentForSale: studentC, selectedStaffId: 'youssef', paymentMethod: 'cash', t, formatTransactionId, transactionCounter: txCounter, now }))
check('buildSaleEntry null student', refSaleEntry(cartSaleOnly, null, 'youssef', 'cash'), buildSaleEntry({ ...saleCommon, studentForSale: null, t, formatTransactionId, transactionCounter: txCounter, now }))

// ---------------------------------------------------------------------------
// 4. buildReservationRecords
// ---------------------------------------------------------------------------
function refReservationRecords(items, transactionId, studentId) {
  return items
    .filter((item) => item.type === 'reservation')
    .map((item) => ({
      id: `${transactionId}-${item.id}`,
      transactionId,
      studentId,
      bookId: item.id,
      qty: item.qty,
      status: 'pending',
      deposit: item.deposit,
      pendingArrival: item.pendingArrival,
      date: now.toISOString(),
    }))
    .filter((item) => item.studentId)
}

const itemsWithReservations = [mkItem(book1, 1, 'sale'), mkItem(book3, 1, 'reservation', { deposit: 30 })]
check('buildReservationRecords one reservation', refReservationRecords(itemsWithReservations, txId, 10), buildReservationRecords({ items: itemsWithReservations, transactionId: txId, studentId: 10, now }))
check('buildReservationRecords no reservation', refReservationRecords([mkItem(book1, 1, 'sale')], txId, 10), buildReservationRecords({ items: [mkItem(book1, 1, 'sale')], transactionId: txId, studentId: 10, now }))
check('buildReservationRecords no student', refReservationRecords(itemsWithReservations, txId, undefined), buildReservationRecords({ items: itemsWithReservations, transactionId: txId, studentId: undefined, now }))
check('buildReservationRecords multiple', refReservationRecords([mkItem(book3, 1, 'reservation'), mkItem(book1, 2, 'reservation')], txId, 20), buildReservationRecords({ items: [mkItem(book3, 1, 'reservation'), mkItem(book1, 2, 'reservation')], transactionId: txId, studentId: 20, now }))
check('buildReservationRecords empty items', refReservationRecords([], txId, 10), buildReservationRecords({ items: [], transactionId: txId, studentId: 10, now }))

// ---------------------------------------------------------------------------
// 5. buildServerReservationPayloads
// ---------------------------------------------------------------------------
function refServerReservationPayloads(items, studentId, staffName) {
  return items
    .filter((item) => item.type === 'reservation')
    .map((item) => ({
      student_id: studentId,
      book_id: item.id,
      quantity: item.qty,
      deposit_amount: item.deposit || 0,
      staff_name: staffName,
    }))
}
check('serverResPayload normal', refServerReservationPayloads(itemsWithReservations, 10, 'youssef'), buildServerReservationPayloads({ items: itemsWithReservations, studentId: 10, staffName: 'youssef' }))
check('serverResPayload no reservation', refServerReservationPayloads([mkItem(book1, 1, 'sale')], 10, 'youssef'), buildServerReservationPayloads({ items: [mkItem(book1, 1, 'sale')], studentId: 10, staffName: 'youssef' }))
check('serverResPayload with deposit', refServerReservationPayloads([mkItem(book3, 1, 'reservation', { deposit: 25 })], 20, 'heba'), buildServerReservationPayloads({ items: [mkItem(book3, 1, 'reservation', { deposit: 25 })], studentId: 20, staffName: 'heba' }))

// ---------------------------------------------------------------------------
// 6. buildServerTransactionPayload
// ---------------------------------------------------------------------------
function refServerTransactionPayload(cartDetails, studentId, staffName) {
  const items = cartDetails.items
    .filter((item) => item.type !== 'reservation')
    .map((item) => ({
      book_id: item.id,
      quantity: item.qty,
      reservation_id: item.linkedReservation?.id != null ? Number(item.linkedReservation.id) : null,
    }))
  return { student_id: studentId, discount: cartDetails.safeDiscount, staff_name: staffName, items }
}
const cartWithLinked = { items: [mkItem(book1, 1, 'sale', { linkedReservation: { id: '5', deposit: 20 } }), mkItem(book3, 1, 'reservation')] }
check('serverTxPayload normal', refServerTransactionPayload(cartSaleOnly, 10, 'youssef'), buildServerTransactionPayload({ cartDetails: cartSaleOnly, studentId: 10, staffName: 'youssef' }))
check('serverTxPayload with linked res', refServerTransactionPayload(cartWithLinked, 10, 'youssef'), buildServerTransactionPayload({ cartDetails: cartWithLinked, studentId: 10, staffName: 'youssef' }))
check('serverTxPayload reservation only', refServerTransactionPayload(cartReservationOnly, 10, 'youssef'), buildServerTransactionPayload({ cartDetails: cartReservationOnly, studentId: 10, staffName: 'youssef' }))

// ---------------------------------------------------------------------------
// 7. buildSyncTransactionPayload  (NOTE: distinct field names from server payload)
// ---------------------------------------------------------------------------
function refSyncTransactionPayload(cartDetails, studentId, staffName) {
  const items = cartDetails.items
    .filter((item) => item.type !== 'reservation')
    .map((item) => ({
      bookId: item.id,
      qty: item.qty,
      reservationId: item.linkedReservation?.id || null,
    }))
  return { studentId, discount: cartDetails.safeDiscount, staffName, items }
}
check('syncTxPayload normal', refSyncTransactionPayload(cartSaleOnly, 10, 'youssef'), buildSyncTransactionPayload({ cartDetails: cartSaleOnly, studentId: 10, staffName: 'youssef' }))
check('syncTxPayload with linked res', refSyncTransactionPayload(cartWithLinked, 10, 'youssef'), buildSyncTransactionPayload({ cartDetails: cartWithLinked, studentId: 10, staffName: 'youssef' }))
check('syncTxPayload undefined student', refSyncTransactionPayload(cartSaleOnly, undefined, 'youssef'), buildSyncTransactionPayload({ cartDetails: cartSaleOnly, studentId: undefined, staffName: 'youssef' }))

// ---------------------------------------------------------------------------
// 8. computeBalanceAdjustment  (HIGH RISK — three branches)
// ---------------------------------------------------------------------------
function refBalanceAdjustment(studentForSale, paidAmount, totalDue, paymentMethod, transactionId) {
  const paid = Number(paidAmount)
  let nextBalance = Number(studentForSale?.balance) || 0
  const operations = []
  if (studentForSale?.id) {
    if (paidAmount !== '' && paid < totalDue) {
      const debt = totalDue - paid
      nextBalance -= debt
      operations.push({
        delta: -debt,
        logEntry: {
          studentId: studentForSale.id,
          amount: -debt,
          type: 'purchase_debt',
          description: `متبقي على فاتورة ${transactionId}`,
        },
      })
    } else if (paidAmount !== '' && paid > totalDue) {
      const change = paid - totalDue
      nextBalance += change
      operations.push({
        delta: change,
        logEntry: {
          studentId: studentForSale.id,
          amount: change,
          type: 'deposit_change',
          description: `باقي فاتورة ${transactionId}`,
        },
      })
    }
    if (paymentMethod === 'wallet' && studentForSale.balance >= totalDue) {
      nextBalance -= totalDue
      operations.push({
        delta: -totalDue,
        logEntry: {
          studentId: studentForSale.id,
          amount: -totalDue,
          type: 'purchase_wallet',
          description: `دفع فاتورة ${transactionId} من المحفظة`,
        },
      })
    }
  }
  const balanceSync = studentForSale?.id != null
    ? { studentId: studentForSale.id, balance: nextBalance, studentSnapshot: { ...studentForSale, balance: nextBalance } }
    : null
  return { nextBalance, operations, balanceSync }
}

// Exact payment (cash, no paidAmount)
check('balance exact cash', refBalanceAdjustment(studentA, '', 100, 'cash', txId), computeBalanceAdjustment({ studentForSale: studentA, paidAmount: '', totalDue: 100, paymentMethod: 'cash', transactionId: txId }))
// Debt
check('balance debt', refBalanceAdjustment(studentA, '50', 100, 'cash', txId), computeBalanceAdjustment({ studentForSale: studentA, paidAmount: '50', totalDue: 100, paymentMethod: 'cash', transactionId: txId }))
// Overpayment / change
check('balance overpay', refBalanceAdjustment(studentB, '400', 250, 'cash', txId), computeBalanceAdjustment({ studentForSale: studentB, paidAmount: '400', totalDue: 250, paymentMethod: 'cash', transactionId: txId }))
// Wallet full
check('balance wallet full', refBalanceAdjustment(studentB, '', 200, 'wallet', txId), computeBalanceAdjustment({ studentForSale: studentB, paidAmount: '', totalDue: 200, paymentMethod: 'wallet', transactionId: txId }))
// Wallet insufficient
check('balance wallet insufficient', refBalanceAdjustment(studentC, '', 200, 'wallet', txId), computeBalanceAdjustment({ studentForSale: studentC, paidAmount: '', totalDue: 200, paymentMethod: 'wallet', transactionId: txId }))
// Wallet exact balance
check('balance wallet exact', refBalanceAdjustment(studentC, '', 50, 'wallet', txId), computeBalanceAdjustment({ studentForSale: studentC, paidAmount: '', totalDue: 50, paymentMethod: 'wallet', transactionId: txId }))
// No student
check('balance no student', refBalanceAdjustment(null, '50', 100, 'cash', txId), computeBalanceAdjustment({ studentForSale: null, paidAmount: '50', totalDue: 100, paymentMethod: 'cash', transactionId: txId }))
// Numeric paidAmount
check('balance numeric paid', refBalanceAdjustment(studentA, 50, 100, 'cash', txId), computeBalanceAdjustment({ studentForSale: studentA, paidAmount: 50, totalDue: 100, paymentMethod: 'cash', transactionId: txId }))
// Zero paidAmount string
check('balance zero string paid', refBalanceAdjustment(studentA, '0', 100, 'cash', txId), computeBalanceAdjustment({ studentForSale: studentA, paidAmount: '0', totalDue: 100, paymentMethod: 'cash', transactionId: txId }))
// Decimal totalDue
check('balance decimal', refBalanceAdjustment(studentB, '150.5', 99.99, 'cash', txId), computeBalanceAdjustment({ studentForSale: studentB, paidAmount: '150.5', totalDue: 99.99, paymentMethod: 'cash', transactionId: txId }))

// ---------------------------------------------------------------------------
// 9. buildStockDeductionItems
// ---------------------------------------------------------------------------
function refStockDeductionItems(items) {
  const soldItems = items.filter((item) => item.type !== 'reservation')
  const reservedItems = items.filter((item) => item.type === 'reservation')
  const linkedReservations = items.filter((item) => item.linkedReservation).map((item) => item.linkedReservation.id)
  const stockDeductItems = [...soldItems.filter((item) => !item.linkedReservation), ...reservedItems]
  return { soldItems, reservedItems, linkedReservations, stockDeductItems }
}
const itemsForStock = [
  mkItem(book1, 2, 'sale'),
  mkItem(book2, 1, 'sale', { linkedReservation: { id: '5', deposit: 20 } }),
  mkItem(book3, 1, 'reservation'),
]
check('stockDeduct mixed', refStockDeductionItems(itemsForStock), buildStockDeductionItems({ items: itemsForStock }))
check('stockDeduct sale only', refStockDeductionItems([mkItem(book1, 1, 'sale')]), buildStockDeductionItems({ items: [mkItem(book1, 1, 'sale')] }))
check('stockDeduct reservation only', refStockDeductionItems([mkItem(book3, 1, 'reservation')]), buildStockDeductionItems({ items: [mkItem(book3, 1, 'reservation')] }))
check('stockDeduct empty', refStockDeductionItems([]), buildStockDeductionItems({ items: [] }))
check('stockDeduct linked only', refStockDeductionItems([mkItem(book2, 1, 'sale', { linkedReservation: { id: '9' } })]), buildStockDeductionItems({ items: [mkItem(book2, 1, 'sale', { linkedReservation: { id: '9' } })] }))

// ---------------------------------------------------------------------------
// 10. computeNextStock
// ---------------------------------------------------------------------------
check('nextStock normal', 8, computeNextStock({ book: book1, item: mkItem(book1, 2, 'sale') }))
check('nextStock floor zero', 0, computeNextStock({ book: book4, item: mkItem(book4, 5, 'sale') }))
check('nextStock zero qty', 10, computeNextStock({ book: book1, item: mkItem(book1, 0, 'sale') }))
check('nextStock exact', 0, computeNextStock({ book: book1, item: mkItem(book1, 10, 'sale') }))
check('nextStock undefined stock', 0, computeNextStock({ book: { id: 9 }, item: mkItem(book1, 1, 'sale') }))

// ---------------------------------------------------------------------------
console.log(failures === 0 ? `PARITY OK (${total} cases)` : `PARITY FAILURES: ${failures}/${total}`)
process.exit(failures ? 1 : 0)
