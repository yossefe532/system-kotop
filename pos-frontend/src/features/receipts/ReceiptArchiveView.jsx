import { formatCurrency } from '../../lib/format'

export default function ReceiptArchiveView({ locale, items, onRefresh, onOpenReceipt }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">أرشيف الإيصالات</h3>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
        >
          تحديث
        </button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="pb-3">الوقت</th>
              <th className="pb-3">رقم العملية</th>
              <th className="pb-3">النوع</th>
              <th className="pb-3">الموظف</th>
              <th className="pb-3">الطالب</th>
              <th className="pb-3">الإجمالي</th>
              <th className="pb-3">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it) => {
              const payload = it.payload || {}
              const date = it.printed_at ? new Date(it.printed_at).toLocaleString(locale) : '--'
              return (
                <tr key={it.id} className="text-slate-700">
                  <td className="py-3 text-xs text-slate-500">{date}</td>
                  <td className="py-3 font-semibold">{it.transaction_code || payload.id || '--'}</td>
                  <td className="py-3">{it.receipt_type || payload.receiptType || '--'}</td>
                  <td className="py-3">{it.staff_name || payload.staffName || '--'}</td>
                  <td className="py-3">{payload.student?.name || '--'}</td>
                  <td className="py-3 font-semibold">{formatCurrency(locale, payload.total || 0)}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => onOpenReceipt(payload)}
                      className="rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      عرض/طباعة
                    </button>
                  </td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  لا توجد إيصالات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
