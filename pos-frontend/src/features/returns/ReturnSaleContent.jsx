import { useState } from 'react'
import useStudentSearch from '../../hooks/useStudentSearch'

export default function ReturnSaleContent({ t, locale, salesHistory, formatCurrency, selectedStaffId, paymentMethod, onReturnComplete }) {
  const [search, setSearch] = useState('')
  const { filteredStudents: saleMatch } = useStudentSearch({
    students: salesHistory,
    query: search,
    options: { mode: 'find', bidirectional: true, emptyResult: 'none', getTarget: (sale) => sale.student },
  })
  const term = search.trim().toLowerCase()
  let sale = null
  if (term) {
    const txMatch = term.match(/^ed-?(\d+)$/i)
    if (txMatch) {
      const txId = `ED-${String(parseInt(txMatch[1], 10)).padStart(4, '0')}`
      sale = salesHistory.find((s) => s.id === txId)
    }
    if (!sale) sale = saleMatch
  }
  if (!salesHistory.length) {
    return (
      <div className="mt-6 text-sm text-slate-500">لا يوجد مبيعات مسجلة بعد.</div>
    )
  }
  return (
    <div className="mt-6 space-y-4 text-right">
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="ED-0001 أو الاسم أو الهاتف"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      {!term && <p className="text-sm text-slate-500">اكتب رقم الفاتورة أو اسم الطالب.</p>}
      {term && !sale && <p className="text-sm text-slate-500">لم يتم العثور على فاتورة مطابقة.</p>}
      {sale && (
        <div className="mt-4 space-y-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-slate-800">
          <p className="font-semibold">الطالب: {sale.student?.name || 'بدون اسم'}</p>
          <p className="text-xs text-slate-600">رقم العملية الأصلية: {sale.id}</p>
          <div className="mt-2 space-y-1">
            {(sale.items || []).map((item) => (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <span>
                  {item.title} × {item.qty}
                </span>
                <span>{formatCurrency(locale, item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>إجمالي الفاتورة</span>
            <span className="font-semibold text-rose-700">
              {formatCurrency(locale, sale.total)}
            </span>
          </div>
          <button
        type="button"
        onClick={() => {
          const now = new Date()
          const items = (sale.items || []).map((item) => ({
            ...item,
            type: 'return',
            lineTotal: -Math.abs(item.lineTotal),
          }))
          const total = -Math.abs(sale.total)
          const subtotal = -Math.abs(sale.subtotal || sale.total)
          const entry = {
            id: `RET-${sale.id}`,
            date: now.toISOString(),
            staffId: selectedStaffId,
            staffName: t(`staff.${selectedStaffId}`),
            student: sale.student,
            items,
            subtotal,
            discount: 0,
            total,
            costTotal: -(sale.costTotal || 0),
            netProfit: -(sale.netProfit || 0),
            receiptType: 'return',
            paymentMethod: sale.paymentMethod || paymentMethod,
            originalTransactionId: sale.id,
          }
          const affectedBooks = (sale.items || [])
            .filter((item) => item.type === 'sale' || item.type === 'pickup')
            .map((item) => ({ bookId: item.id, qty: item.qty }))
          onReturnComplete(entry, affectedBooks)
        }}
        className="mt-4 w-full rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
      >
        إرجاع الفاتورة بالكامل (كاش)
      </button>
      <button
        type="button"
        onClick={() => {
          const now = new Date()
          const items = (sale.items || []).map((item) => ({
            ...item,
            type: 'return',
            lineTotal: -Math.abs(item.lineTotal),
          }))
          const total = -Math.abs(sale.total)
          const subtotal = -Math.abs(sale.subtotal || sale.total)
          const entry = {
            id: `RET-${sale.id}`,
            date: now.toISOString(),
            staffId: selectedStaffId,
            staffName: t(`staff.${selectedStaffId}`),
            student: sale.student,
            items,
            subtotal,
            discount: 0,
            total,
            costTotal: -(sale.costTotal || 0),
            netProfit: -(sale.netProfit || 0),
            receiptType: 'return',
            paymentMethod: 'wallet',
            originalTransactionId: sale.id,
          }
          const affectedBooks = (sale.items || [])
            .filter((item) => item.type === 'sale' || item.type === 'pickup')
            .map((item) => ({ bookId: item.id, qty: item.qty }))
          onReturnComplete(entry, affectedBooks, true) // Pass true for walletRefund
        }}
        className="mt-2 w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
      >
        إرجاع الفاتورة للمحفظة
      </button>
        </div>
      )}
    </div>
  )
}
