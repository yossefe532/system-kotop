// Pure checkout computation / payload-building logic.
// Extracted from App.jsx handleCompleteSale (Wave 10, Phase 1).
//
// This module MUST remain side-effect free:
//   - no React imports
//   - no state setters
//   - no API / IndexedDB / localStorage calls
//   - no enqueueSync, alerts, navigation, or auth
//
// Every function below is a verbatim extraction of the original logic.
// No business rules were changed, normalized, or "cleaned up".

// ---------------------------------------------------------------------------
// NOTE ON deriveReceiptType vs getReceiptType
// ---------------------------------------------------------------------------
// `deriveReceiptType` (below) reproduces the inline receipt-type decision used
// inside handleCompleteSale. There is a SEPARATE `getReceiptType` helper in
// App.jsx used by the receipt view. They are NOT byte-identical:
//
//   - deriveReceiptType returns 'sale' for mixed sale+reservation carts.
//   - getReceiptType returns 'sale_reservation' for mixed carts, and also
//     short-circuits on payload.receiptType when present.
//
// Merging them would change receipt behavior, so both are preserved.
// ---------------------------------------------------------------------------

export function deriveReceiptType(items) {
  const hasReservation = items.some((i) => i.type === 'reservation')
  const allReservation = items.length > 0 && items.every((i) => i.type === 'reservation')
  return allReservation ? 'reservation' : hasReservation ? 'sale' : 'sale'
}

export function computeCostTotal(cartDetails) {
  return cartDetails.items.reduce((sum, item) => {
    if (item.type === 'reservation') return sum
    return sum + item.costPrice * item.qty
  }, 0)
}

export function computeNetProfit(cartDetails, costTotal) {
  return cartDetails.total - costTotal
}

export function buildSaleEntry({
  cartDetails,
  studentForSale,
  selectedStaffId,
  t,
  formatTransactionId,
  transactionCounter,
  paymentMethod,
  now,
}) {
  const transactionId = formatTransactionId(transactionCounter)
  const costTotal = computeCostTotal(cartDetails)
  const netProfit = computeNetProfit(cartDetails, costTotal)
  const receiptType = deriveReceiptType(cartDetails.items)
  return {
    id: transactionId,
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

export function buildReservationRecords({ items, transactionId, studentId, now }) {
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

export function buildServerReservationPayloads({ items, studentId, staffName }) {
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

export function buildServerTransactionPayload({ cartDetails, studentId, staffName }) {
  const items = cartDetails.items
    .filter((item) => item.type !== 'reservation')
    .map((item) => ({
      book_id: item.id,
      quantity: item.qty,
      reservation_id: item.linkedReservation?.id != null ? Number(item.linkedReservation.id) : null,
    }))
  return {
    student_id: studentId,
    discount: cartDetails.safeDiscount,
    staff_name: staffName,
    items,
  }
}

export function buildSyncTransactionPayload({ cartDetails, studentId, staffName }) {
  const items = cartDetails.items
    .filter((item) => item.type !== 'reservation')
    .map((item) => ({
      bookId: item.id,
      qty: item.qty,
      reservationId: item.linkedReservation?.id || null,
    }))
  return {
    studentId,
    discount: cartDetails.safeDiscount,
    staffName,
    items,
  }
}

export function computeBalanceAdjustment({
  studentForSale,
  paidAmount,
  totalDue,
  paymentMethod,
  transactionId,
}) {
  const paid = Number(paidAmount)
  let nextBalance = Number(studentForSale?.balance) || 0
  const operations = []
  let balanceSync = null
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
    balanceSync = {
      studentId: studentForSale.id,
      balance: nextBalance,
      studentSnapshot: { ...studentForSale, balance: nextBalance },
    }
  }
  return { nextBalance, operations, balanceSync }
}

export function buildStockDeductionItems({ items }) {
  const soldItems = items.filter((item) => item.type !== 'reservation')
  const reservedItems = items.filter((item) => item.type === 'reservation')
  const linkedReservations = items
    .filter((item) => item.linkedReservation)
    .map((item) => item.linkedReservation.id)
  const stockDeductItems = [
    ...soldItems.filter((item) => !item.linkedReservation),
    ...reservedItems,
  ]
  return { soldItems, reservedItems, linkedReservations, stockDeductItems }
}

export function computeNextStock({ book, item }) {
  return Math.max((book.stock || 0) - item.qty, 0)
}
