import { useMemo } from 'react'
import { findReservationsBySearch } from './findReservationsBySearch'

export default function CancelReservationContent({ t, locale, cancelSearch, students, books, pendingReservations, salesHistory, formatCurrency, onComplete }) {
  const { student, reservations, candidates } = useMemo(
    () => findReservationsBySearch(cancelSearch, students, pendingReservations, salesHistory),
    [cancelSearch, students, pendingReservations, salesHistory]
  )
  if (!cancelSearch.trim()) {
    if (pendingReservations.length === 0) {
      return <p className="mt-6 text-sm text-slate-500">لا يوجد حجوزات معلقة يمكن سحبها.</p>
    }
    return (
      <div className="mt-6 text-sm text-slate-500">
        اكتب رقم العملية، اسم الطالب، أو رقم الهاتف لعرض الحجوزات القابلة للسحب.
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
  const totalRefund = reservations.reduce((sum, r) => sum + (r.deposit || 0), 0)
  return (
    <div className="mt-6 text-right">
      <p className="font-semibold">{student.name}</p>
      <p className="text-sm text-slate-500">{student.phone}</p>
      <div className="mt-4 space-y-2">
        {reservations.map((r) => {
          const book = books.find((b) => b.id === r.bookId)
          return (
            <div key={r.id} className="rounded-xl border border-amber-100 bg-amber-50 p-3">
              <p>{book?.title} - استرداد: {formatCurrency(locale, r.deposit)}</p>
            </div>
          )
        })}
      </div>
      <p className="mt-4 font-semibold text-amber-700">إجمالي الاسترداد: {formatCurrency(locale, totalRefund)}</p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => onComplete({ student, reservations, totalRefund, refundMethod: 'cash' })}
          className="flex-1 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
        >
          سحب كاش
        </button>
        <button
          type="button"
          onClick={() => onComplete({ student, reservations, totalRefund, refundMethod: 'wallet' })}
          className="flex-1 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          إيداع في المحفظة
        </button>
      </div>
    </div>
  )
}
