import { describe, it, expect } from 'vitest'
import {
  buildSaleEntry,
  buildReservationRecords,
  buildServerTransactionPayload,
  buildSyncTransactionPayload,
  computeBalanceAdjustment,
  computeCostTotal,
  computeNetProfit,
  buildStockDeductionItems,
  computeNextStock,
  deriveReceiptType,
} from './checkoutService'

const formatTransactionId = (n) => `ED-${String(n).padStart(4, '0')}`
const t = (k) => `__${k}__`
const now = new Date('2026-08-09T10:00:00.000Z')

const book = (id, over = {}) => ({
  id,
  title: `B${id}`,
  sellingPrice: 100,
  costPrice: 60,
  stock: 10,
  isArriving: false,
  ...over,
})

const item = (b, qty, type, extra = {}) => ({
  ...b,
  key: `${type === 'reservation' ? 'r' : 's'}-${b.id}`,
  qty,
  type,
  deposit: 0,
  isZeroReservation: false,
  lineTotal: qty * (type === 'reservation' ? 0 : b.sellingPrice),
  pendingArrival: type === 'reservation' && b.isArriving,
  linkedReservation: null,
  ...extra,
})

describe('deriveReceiptType', () => {
  it('empty cart -> sale', () => expect(deriveReceiptType([])).toBe('sale'))
  it('all reservation -> reservation', () =>
    expect(deriveReceiptType([item(book(1), 1, 'reservation')])).toBe('reservation'))
  it('mixed -> sale', () =>
    expect(deriveReceiptType([item(book(1), 1, 'sale'), item(book(2), 1, 'reservation')])).toBe('sale'))
})

describe('computeCostTotal / computeNetProfit', () => {
  it('skips reservations', () => {
    const cd = { items: [item(book(1), 2, 'sale'), item(book(2), 1, 'reservation')], subtotal: 200, total: 200, safeDiscount: 0 }
    expect(computeCostTotal(cd)).toBe(120)
    expect(computeNetProfit(cd, 120)).toBe(80)
  })
})

describe('buildSaleEntry', () => {
  it('preserves every field', () => {
    const cd = { items: [item(book(1), 2, 'sale')], subtotal: 200, total: 200, safeDiscount: 0 }
    const student = { id: 5, name: 'X', balance: 0 }
    const entry = buildSaleEntry({ cartDetails: cd, studentForSale: student, selectedStaffId: 'youssef', t, formatTransactionId, transactionCounter: 7, paymentMethod: 'cash', now })
    expect(entry).toEqual({
      id: 'ED-0007',
      date: now.toISOString(),
      staffId: 'youssef',
      staffName: '__staff.youssef__',
      student,
      items: cd.items,
      subtotal: 200,
      discount: 0,
      total: 200,
      costTotal: 120,
      netProfit: 80,
      receiptType: 'sale',
      paymentMethod: 'cash',
    })
  })
})

describe('buildReservationRecords', () => {
  it('filters and maps reservations', () => {
    const items = [item(book(1), 1, 'sale'), item(book(2), 2, 'reservation', { deposit: 30 })]
    const res = buildReservationRecords({ items, transactionId: 'ED-0001', studentId: 9, now })
    expect(res).toEqual([{
      id: 'ED-0001-2', transactionId: 'ED-0001', studentId: 9, bookId: 2, qty: 2,
      status: 'pending', deposit: 30, pendingArrival: false, date: now.toISOString(),
    }])
  })
  it('drops records without studentId', () => {
    expect(buildReservationRecords({ items: [item(book(1), 1, 'reservation')], transactionId: 'ED-1', studentId: undefined, now })).toEqual([])
  })
})

describe('server vs sync transaction payloads differ', () => {
  const cd = { items: [item(book(1), 1, 'sale', { linkedReservation: { id: '5' } })], safeDiscount: 0 }
  it('server payload uses snake_case + Number coercion', () => {
    expect(buildServerTransactionPayload({ cartDetails: cd, studentId: 1, staffName: 'y' })).toEqual({
      student_id: 1, discount: 0, staff_name: 'y',
      items: [{ book_id: 1, quantity: 1, reservation_id: 5 }],
    })
  })
  it('sync payload uses camelCase + || null', () => {
    expect(buildSyncTransactionPayload({ cartDetails: cd, studentId: 1, staffName: 'y' })).toEqual({
      studentId: 1, discount: 0, staffName: 'y',
      items: [{ bookId: 1, qty: 1, reservationId: '5' }],
    })
  })
})

describe('computeBalanceAdjustment', () => {
  const student = { id: 1, balance: 100 }
  const tx = 'ED-0001'
  it('exact cash -> no operations but balanceSync set', () => {
    const r = computeBalanceAdjustment({ studentForSale: student, paidAmount: '', totalDue: 50, paymentMethod: 'cash', transactionId: tx })
    expect(r.nextBalance).toBe(100)
    expect(r.operations).toEqual([])
    expect(r.balanceSync.balance).toBe(100)
  })
  it('debt branch', () => {
    const r = computeBalanceAdjustment({ studentForSale: student, paidAmount: '30', totalDue: 100, paymentMethod: 'cash', transactionId: tx })
    expect(r.nextBalance).toBe(30)
    expect(r.operations).toHaveLength(1)
    expect(r.operations[0].logEntry.type).toBe('purchase_debt')
  })
  it('overpay branch', () => {
    const r = computeBalanceAdjustment({ studentForSale: student, paidAmount: '150', totalDue: 100, paymentMethod: 'cash', transactionId: tx })
    expect(r.nextBalance).toBe(150)
    expect(r.operations[0].logEntry.type).toBe('deposit_change')
  })
  it('wallet branch', () => {
    const r = computeBalanceAdjustment({ studentForSale: student, paidAmount: '', totalDue: 80, paymentMethod: 'wallet', transactionId: tx })
    expect(r.nextBalance).toBe(20)
    expect(r.operations[0].logEntry.type).toBe('purchase_wallet')
  })
  it('no student -> null balanceSync', () => {
    const r = computeBalanceAdjustment({ studentForSale: null, paidAmount: '10', totalDue: 100, paymentMethod: 'cash', transactionId: tx })
    expect(r.balanceSync).toBeNull()
  })
})

describe('buildStockDeductionItems', () => {
  it('excludes linked reservations from deduction', () => {
    const items = [
      item(book(1), 1, 'sale'),
      item(book(2), 1, 'sale', { linkedReservation: { id: '5' } }),
      item(book(3), 1, 'reservation'),
    ]
    const r = buildStockDeductionItems({ items })
    expect(r.stockDeductItems.map((i) => i.id)).toEqual([1, 3])
    expect(r.linkedReservations).toEqual(['5'])
  })
})

describe('computeNextStock', () => {
  it('floors at zero', () => expect(computeNextStock({ book: book(1, { stock: 2 }), item: item(book(1), 5, 'sale') })).toBe(0))
  it('normal deduction', () => expect(computeNextStock({ book: book(1, { stock: 10 }), item: item(book(1), 3, 'sale') })).toBe(7))
})
