import { useMemo } from 'react'
import { findReservationsBySearch } from './findReservationsBySearch'

export default function PickupReservationContent({ t, locale, pickupSearch, students, books, pendingReservations, salesHistory, formatCurrency, onComplete }) {
  const { student, reservations, candidates } = useMemo(
    () => findReservationsBySearch(pickupSearch, students, pendingReservations, salesHistory),
    [pickupSearch, students, pendingReservations, salesHistory]
  )
  
  // Calculate Balance (Debt/Credit)
  const balance = student?.balance || 0

  if (!pickupSearch.trim()) {
    if (pendingReservations.length === 0) {
      return <p className="mt-6 text-sm text-slate-500">لا يوجد حجوزات معلقة حاليًا.</p>
    }
    return (
      <div className="mt-6 text-sm text-slate-500">
        اكتب رقم العملية، اسم الطالب، أو رقم الهاتف لعرض حجوزاته المعلقة.
      </div>
    )
  }
  if (!student && candidates.length > 1) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-semibold text-amber-700">يوجد أكثر من طالب مطابق. اكتب اسمًا أكمل أو رقم هاتف أو رقم عملية.</p>
        <div className="mt-2 space-y-1 text-slate-700">
          {candidates.slice(0, 8).map((c) => (
            <p key={c.id}>{c.name} · {c.phone || '--'}</p>
          ))}
        </div>
      </div>
    )
  }
  if (!student) return <p className="mt-6 text-sm text-slate-500">{t('empty.students')}</p>
  if (reservations.length === 0) return <p className="mt-6 text-sm text-slate-500">لا يوجد حجوزات معلقة</p>
  const totalDeposit = reservations.reduce((sum, r) => sum + (r.deposit || 0), 0)
  const totalPrice = reservations.reduce((sum, r) => {
    const book = books.find((b) => b.id === r.bookId)
    const qty = r.qty || 1
    return sum + (book ? (book.sellingPrice || 0) * qty : 0)
  }, 0)
  const remainingTotal = Math.max(totalPrice - totalDeposit, 0)
  return (
    <div className="mt-6 text-right">
      <p className="font-semibold">{student.name}</p>
      <p className="text-sm text-slate-500">{student.phone}</p>
      <div className="mt-4 space-y-2">
        {reservations.map((r) => {
          const book = books.find((b) => b.id === r.bookId)
          const qty = r.qty || 1
          const price = book ? (book.sellingPrice || 0) * qty : 0
          const remaining = Math.max(price - (r.deposit || 0), 0)
          return (
            <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p>{book?.title}</p>
              <p className="text-xs text-slate-500">{r.transactionId || r.id}</p>
              <div className="mt-1 text-xs text-slate-600">
                <p>سعر الكتاب: {formatCurrency(locale, price)}</p>
                <p>المدفوع حجزًا: {formatCurrency(locale, r.deposit || 0)}</p>
                <p>المتبقي على هذا الحجز: {formatCurrency(locale, remaining)}</p>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 space-y-1 text-sm">
        <p className="font-semibold">إجمالي المدفوع حجزًا: {formatCurrency(locale, totalDeposit)}</p>
        <p>إجمالي سعر الكتب: {formatCurrency(locale, totalPrice)}</p>
        <p className="font-semibold text-emerald-700">المتبقي على الحساب الآن: {formatCurrency(locale, remainingTotal)}</p>
        {balance > 0 && (
           <p className="text-xs font-semibold text-brand-600">رصيد المحفظة المتاح: {formatCurrency(locale, balance)}</p>
        )}
        {remainingTotal > 0 && balance >= remainingTotal && (
           <p className="text-xs text-emerald-600">سيتم الخصم من المحفظة تلقائيًا.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onComplete({ student, reservations })}
        className="mt-4 rounded-2xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white"
      >
        تأكيد الاستلام {remainingTotal > 0 && balance >= remainingTotal ? '(من المحفظة)' : ''}
      </button>
    </div>
  )
}
