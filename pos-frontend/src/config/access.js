export const rolePriority = { viewer: 1, cashier: 2, manager: 3, admin: 4 }
export const viewAccessLevel = {
  pos: 'cashier',
  books: 'manager',
  booksInsights: 'manager',
  students: 'cashier',
  pickupReservation: 'cashier',
  cancelReservation: 'cashier',
  returns: 'cashier',
  receipt: 'cashier',
  receiptArchive: 'manager',
  emergency: 'manager',
  inventory: 'manager',
  admin: 'admin',
  accounting: 'manager',
  reports: 'manager',
}