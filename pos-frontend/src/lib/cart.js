export const clampDeposit = (value) => {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 0
  return Math.max(numeric, 0)
}

export const cartKey = (bookId, type) => `${type}:${bookId}`

export const getDefaultReservationDeposit = (book) => {
  const price = Number(book?.sellingPrice) || 0
  if (price <= 0) return 0
  return Math.max(Math.round(price * 0.3), 20)
}