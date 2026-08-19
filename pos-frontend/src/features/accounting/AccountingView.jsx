import { formatCurrency } from '../../lib/format'
import StatCard from '../../components/ui/StatCard'

export default function AccountingView({ locale, books, report, supplies, form, onFormChange, onRefresh, onCreateSupply }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">الحسابات</h3>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
          >
            تحديث
          </button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StatCard title="إجمالي الإيراد" value={formatCurrency(locale, report?.revenue || 0)} />
          <StatCard title="تكلفة البضاعة (COGS)" value={formatCurrency(locale, report?.cogs || 0)} />
          <StatCard title="مجمل الربح" value={formatCurrency(locale, report?.gross_profit || 0)} />
          <StatCard title="إجمالي السحوبات" value={formatCurrency(locale, report?.withdrawals || 0)} />
          <StatCard title="رصيد الخزنة" value={formatCurrency(locale, report?.safe_balance || 0)} />
          <StatCard title="مستحق للمورّد" value={formatCurrency(locale, report?.supplier_due || 0)} />
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow">
        <h4 className="text-base font-semibold">توريد مخزون</h4>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <select
            value={form.bookId}
            onChange={(e) => onFormChange((p) => ({ ...p, bookId: e.target.value }))}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
          >
            <option value="">اختر كتاب</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={form.qty}
            onChange={(e) => onFormChange((p) => ({ ...p, qty: e.target.value }))}
            placeholder="الكمية"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            value={form.unitCost}
            onChange={(e) => onFormChange((p) => ({ ...p, unitCost: e.target.value }))}
            placeholder="سعر التوريد/كتاب"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            value={form.paid}
            onChange={(e) => onFormChange((p) => ({ ...p, paid: e.target.value }))}
            placeholder="المدفوع للمورّد"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
          />
          <input
            type="text"
            value={form.supplier}
            onChange={(e) => onFormChange((p) => ({ ...p, supplier: e.target.value }))}
            placeholder="اسم المورّد (اختياري)"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCreateSupply}
            className="rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            تسجيل التوريد
          </button>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow">
        <h4 className="text-base font-semibold">سجل التوريدات</h4>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="pb-3">التاريخ</th>
                <th className="pb-3">كتاب</th>
                <th className="pb-3">كمية</th>
                <th className="pb-3">تكلفة/كتاب</th>
                <th className="pb-3">الإجمالي</th>
                <th className="pb-3">مدفوع</th>
                <th className="pb-3">متبقي</th>
                <th className="pb-3">المورّد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplies.map((s) => (
                <tr key={s.id} className="text-slate-700">
                  <td className="py-3 text-xs text-slate-500">{new Date(s.timestamp).toLocaleString(locale)}</td>
                  <td className="py-3">{books.find((b) => b.id === s.book_id)?.title || s.book_id}</td>
                  <td className="py-3 font-semibold">{s.quantity}</td>
                  <td className="py-3">{formatCurrency(locale, s.unit_cost)}</td>
                  <td className="py-3 font-semibold">{formatCurrency(locale, s.total_cost)}</td>
                  <td className="py-3">{formatCurrency(locale, s.paid_amount || 0)}</td>
                  <td className="py-3 font-semibold text-rose-700">{formatCurrency(locale, (s.total_cost || 0) - (s.paid_amount || 0))}</td>
                  <td className="py-3">{s.supplier_name || '--'}</td>
                </tr>
              ))}
              {supplies.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                    لا توجد توريدات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
