import { useMemo, useState } from 'react'
import { cartKey, clampDeposit, getDefaultReservationDeposit } from '../lib/cart.js'

export function computeCartDetails(cartItems, books, discount) {
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

export function computeReservationOutstanding(items) {
  return items
    .filter((item) => item.type === 'reservation')
    .reduce((sum, item) => sum + Math.max((Number(item.sellingPrice) || 0) * item.qty - (Number(item.deposit) || 0), 0), 0)
}

export default function useCart({ books, discount, initialCartItems = [] }) {
  const [cartItems, setCartItems] = useState(initialCartItems)

  const cartDetails = useMemo(() => computeCartDetails(cartItems, books, discount), [cartItems, books, discount])
  const reservationOutstandingTotal = useMemo(
    () => computeReservationOutstanding(cartDetails.items),
    [cartDetails.items],
  )

  const addCartLine = (bookId, type, options) => {
    const key = cartKey(bookId, type)
    setCartItems((prev) => {
      const existing = prev.find((item) => item.key === key)
      if (existing) {
        return prev.map((item) => (item.key === key ? { ...item, qty: item.qty + 1 } : item))
      }
      return [
        ...prev,
        {
          key,
          bookId,
          qty: 1,
          type,
          deposit: Number(options?.deposit) || 0,
          isZeroReservation: Boolean(options?.isZeroReservation),
          linkedReservation: options?.linkedReservation || null,
        },
      ]
    })
  }

  const updateCartQty = (key, delta) => {
    setCartItems((prev) => {
      const updated = prev
        .map((item) => (item.key === key ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
      return updated
    })
  }

  const updateCartType = (key, nextType) => {
    setCartItems((prev) => {
      const item = prev.find((i) => i.key === key)
      if (!item) return prev
      const book = books.find((b) => b.id === item.bookId)
      const safeType = nextType === 'sale' && book?.isArriving ? 'reservation' : nextType
      const nextKey = cartKey(item.bookId, safeType)
      if (nextKey === item.key) return prev
      const existing = prev.find((i) => i.key === nextKey)
      const nextItem = {
        ...item,
        type: safeType,
        key: nextKey,
        linkedReservation: safeType === 'reservation' ? null : item.linkedReservation,
        deposit: safeType === 'reservation' ? (item.deposit || getDefaultReservationDeposit(book)) : item.deposit,
        isZeroReservation: safeType === 'reservation' ? Boolean(item.isZeroReservation) : false,
      }
      if (!existing) {
        return prev.map((i) => (i.key === item.key ? nextItem : i))
      }
      return prev
        .filter((i) => i.key !== item.key)
        .map((i) => (i.key === existing.key ? { ...i, qty: i.qty + item.qty } : i))
    })
  }

  const updateCartDeposit = (key, deposit) => {
    setCartItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, deposit, isZeroReservation: Number(deposit) === 0 } : item)),
    )
  }

  const clearCart = () => setCartItems([])

  return {
    cartItems,
    setCartItems,
    cartDetails,
    reservationOutstandingTotal,
    addCartLine,
    updateCartQty,
    updateCartType,
    updateCartDeposit,
    clearCart,
  }
}
