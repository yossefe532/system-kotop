import { computeCartDetails, computeReservationOutstanding } from '../pos-frontend/src/hooks/useCart.js'
import { clampDeposit } from '../pos-frontend/src/lib/cart.js'

const books = [
  { id: 1, title: 'B1', sellingPrice: 100, isArriving: false },
  { id: 2, title: 'B2', sellingPrice: 250, isArriving: false },
  { id: 3, title: 'B3', sellingPrice: 80, isArriving: true },
  { id: 4, title: 'B4', sellingPrice: 150, isArriving: false },
  { id: 5, title: 'B5', sellingPrice: 200, isArriving: false },
]

const mk = (key, bookId, qty, type, extra = {}) => ({ key, bookId, qty, type, deposit: 0, isZeroReservation: false, linkedReservation: null, ...extra })

const cartCases = [
  [[mk('s-1', 1, 2, 'sale')], 0],
  [[mk('r-3', 3, 1, 'reservation', { deposit: 30 })], 0],
  [[mk('s-1', 1, 1, 'sale', { deposit: 20, linkedReservation: { deposit: 20 } })], 0],
  [[mk('s-5', 5, 1, 'sale', { deposit: 250, linkedReservation: { deposit: 250 } })], 0],
  [[mk('s-9', 9, 1, 'sale')], 0],
  [[], 0],
  [
    [
      mk('s-1', 1, 2, 'sale'),
      mk('r-3', 3, 1, 'reservation', { deposit: 30 }),
      mk('s-4', 4, 3, 'sale', { deposit: 50, linkedReservation: { deposit: 50 } }),
      mk('s-2', 2, 1, 'sale'),
      mk('s-9', 9, 5, 'sale'),
      mk('r-5', 5, 2, 'reservation', { deposit: 40, isZeroReservation: true }),
    ],
    '50',
  ],
  [[mk('s-1', 1, 2, 'sale')], 'abc'],
  [[mk('s-1', 1, 2, 'sale')], ''],
  [[mk('s-1', 1, 2, 'sale')], -10],
  [[mk('s-1', 1, 2, 'sale')], 99999],
  [[mk('s-1', 1, 0, 'sale')], 0],
  [[mk('r-3', 3, 1, 'reservation')], 0],
  [[mk('s-6', 6, 1, 'sale')], 0],
]

const refCartDetails = (cartItems, books, discount) => {
  const items = cartItems
    .map((entry) => {
      const book = books.find((item) => item.id === entry.bookId)
      if (!book) return null

      let lineUnit = book.sellingPrice
      if (entry.type === 'reservation') {
        lineUnit = clampDeposit(entry.deposit)
      } else if (entry.linkedReservation) {
        const deposit = entry.linkedReservation?.deposit || 0
        lineUnit = Math.max(book.sellingPrice - deposit, 0)
      }

      const pendingArrival = entry.type === 'reservation' && Boolean(book.isArriving)
      return {
        ...book,
        lineKey: entry.key,
        qty: entry.qty,
        type: entry.type,
        deposit: clampDeposit(entry.deposit),
        isZeroReservation: Boolean(entry.isZeroReservation),
        lineTotal: entry.qty * lineUnit,
        pendingArrival,
        linkedReservation: entry.linkedReservation
      }
    })
    .filter(Boolean)
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const safeDiscount = Number.isNaN(Number(discount)) ? 0 : Number(discount)
  const total = Math.max(subtotal - safeDiscount, 0)
  return { items, subtotal, total, safeDiscount }
}

const refOutstanding = (items) =>
  items
    .filter((item) => item.type === 'reservation')
    .reduce((sum, item) => sum + Math.max((Number(item.sellingPrice) || 0) * item.qty - (Number(item.deposit) || 0), 0), 0)

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
let failures = 0
let total = 0

for (const [cart, discount] of cartCases) {
  total += 1
  const expected = refCartDetails(cart, books, discount)
  const actual = computeCartDetails(cart, books, discount)
  if (!eq(expected, actual)) {
    failures += 1
    console.log(`FAIL cartDetails cart=${JSON.stringify(cart)} discount=${JSON.stringify(discount)}`)
    console.log('  expected', JSON.stringify(expected))
    console.log('  actual  ', JSON.stringify(actual))
  }
  const expOut = refOutstanding(expected.items)
  const actOut = computeReservationOutstanding(actual.items)
  total += 1
  if (!eq(expOut, actOut)) {
    failures += 1
    console.log(`FAIL outstanding cart=${JSON.stringify(cart)} expected=${expOut} actual=${actOut}`)
  }
}

console.log(failures === 0 ? `PARITY OK (${total} cases)` : `PARITY FAILURES: ${failures}`)
process.exit(failures ? 1 : 0)
