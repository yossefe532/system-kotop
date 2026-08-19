import { DEMO_DATA_ENABLED } from '../../demoData'

export const hydrateCoreData = async ({
  apiRequest,
  storedBooks,
  storedStudents,
  mapUiBookToApi,
  mapUiStudentToApi,
  mapApiBookToUi,
  mapApiStudentToUi,
}) => {
  let apiBooks = await apiRequest('/books?limit=200')
  let apiStudents = await apiRequest('/students?limit=200')

  if (DEMO_DATA_ENABLED && Array.isArray(apiBooks) && apiBooks.length === 0 && Array.isArray(storedBooks) && storedBooks.length) {
    for (const b of storedBooks) {
      const draft = {
        title: b.title,
        author: b.author,
        sellingPrice: b.sellingPrice,
        costPrice: b.costPrice,
        stock: b.stock,
        barcode: b.barcode,
        isArriving: b.isArriving,
      }
      await apiRequest('/books', { method: 'POST', body: JSON.stringify(mapUiBookToApi(draft)) })
    }
    apiBooks = await apiRequest('/books?limit=200')
  }

  if (DEMO_DATA_ENABLED && Array.isArray(apiStudents) && apiStudents.length === 0 && Array.isArray(storedStudents) && storedStudents.length) {
    for (const s of storedStudents) {
      const draft = {
        name: s.name,
        phone: s.phone,
        stage: s.stage,
        gender: s.gender,
        system: s.system,
        specialty: s.specialty,
        balance: s.balance,
      }
      await apiRequest('/students', { method: 'POST', body: JSON.stringify(mapUiStudentToApi(draft)) })
    }
    apiStudents = await apiRequest('/students?limit=200')
  }

  const uiBooks = Array.isArray(apiBooks) ? apiBooks.map(mapApiBookToUi) : []
  const uiStudents = Array.isArray(apiStudents) ? apiStudents.map(mapApiStudentToUi) : []
  const apiReservations = await apiRequest('/reservations?limit=200')
  const bookById = new Map(uiBooks.map((b) => [b.id, b]))
  const pending = Array.isArray(apiReservations)
    ? apiReservations
        .filter((r) => r.status === 'pending')
        .map((r) => {
          const book = bookById.get(r.book_id)
          return {
            id: r.id,
            transactionId: r.transaction_id ?? null,
            studentId: r.student_id,
            bookId: r.book_id,
            qty: r.quantity || 1,
            status: r.status,
            deposit: r.deposit_amount || 0,
            pendingArrival: Boolean(book?.isArriving),
            date: r.created_at,
          }
        })
    : []

  return { uiBooks, uiStudents, pending }
}

export const buildPendingReservations = (apiReservations, uiBooks) => {
  const bookById = new Map(uiBooks.map((b) => [b.id, b]))
  return Array.isArray(apiReservations)
    ? apiReservations
        .filter((r) => r.status === 'pending')
        .map((r) => {
          const book = bookById.get(r.book_id)
          return {
            id: r.id,
            transactionId: r.transaction_id ?? null,
            studentId: r.student_id,
            bookId: r.book_id,
            qty: r.quantity || 1,
            status: r.status,
            deposit: r.deposit_amount || 0,
            pendingArrival: Boolean(book?.isArriving),
            date: r.created_at,
          }
        })
    : []
}

export const fetchCoreSnapshot = async ({ apiRequest, mapApiBookToUi, mapApiStudentToUi }) => {
  const [apiBooks, apiStudents, apiReservations] = await Promise.all([
    apiRequest('/books?limit=200'),
    apiRequest('/students?limit=200'),
    apiRequest('/reservations?limit=200'),
  ])
  const uiBooks = Array.isArray(apiBooks) ? apiBooks.map(mapApiBookToUi) : []
  const uiStudents = Array.isArray(apiStudents) ? apiStudents.map(mapApiStudentToUi) : []
  const pending = buildPendingReservations(apiReservations, uiBooks)
  return { uiBooks, uiStudents, pending }
}

export const fetchReceiptArchive = async (apiRequest) => {
  const data = await apiRequest('/receipt-archive?limit=200')
  return Array.isArray(data) ? data : []
}

export const fetchBooksInsights = async (apiRequest, books) => {
  const stats = await apiRequest('/reports/books?limit=200')
  const rows = Array.isArray(stats) ? stats : []
  const byId = new Map(rows.map((r) => [r.book_id, r]))
  const merged = books.map((b) => {
    const s = byId.get(b.id)
    return {
      book: b,
      soldQty: Number(s?.sold_qty) || 0,
      reservedQty: Number(s?.pending_reserved_qty) || 0,
      reservedStock: Number(b.reservedStock) || 0,
      availableToSell: Math.max((Number(b.stock) || 0) - (Number(b.reservedStock) || 0), 0),
    }
  })
  merged.sort((a, b) => b.soldQty - a.soldQty)
  return merged
}

export const fetchAccountingData = async (apiRequest) => {
  const [finance, suppliesList] = await Promise.all([apiRequest('/reports/finance'), apiRequest('/supplies?limit=200')])
  return {
    finance: finance || null,
    supplies: Array.isArray(suppliesList) ? suppliesList : [],
  }
}
