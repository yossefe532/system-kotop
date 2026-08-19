import { BarChart3 } from 'lucide-react'

import StatCard from '../../components/ui/StatCard'

export default function ReportsView({ t, locale, salesHistory, totalSales, totalWithdrawals, safeBalance, typeCounts, topBooksRows, noSoldBooks, formatCurrency }) {
  return (
    <div className="rounded-3xl bg-white p-10 shadow">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-brand-600" />
        <div>
          <h3 className="text-lg font-semibold">{t('nav.reports')}</h3>
          <p className="text-sm text-slate-500">ملخص سريع للفترة الحالية (من آخر جرد حتى الآن).</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard title="عدد العمليات" value={salesHistory.length} />
        <StatCard title="إجمالي المبيعات" value={formatCurrency(locale, totalSales)} />
        <StatCard title="إجمالي السحوبات" value={formatCurrency(locale, totalWithdrawals)} />
        <StatCard title="رصيد الخزنة" value={formatCurrency(locale, safeBalance)} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-right text-xs text-slate-700">
          <h4 className="text-sm font-semibold text-slate-800">أنواع العمليات</h4>
          <div className="mt-3 space-y-1">
            <p>بيع: {typeCounts.sale || 0}</p>
            <p>حجز: {typeCounts.reservation || 0}</p>
            <p>استلام حجز: {typeCounts.pickup || 0}</p>
            <p>سحب حجز: {typeCounts.cancel || 0}</p>
            <p>مرتجع: {typeCounts.return || 0}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-right text-xs text-slate-700">
          <h4 className="text-sm font-semibold text-slate-800">أفضل الكتب مبيعًا (الفترة الحالية)</h4>
          <div className="mt-3 space-y-1">
            {topBooksRows.map((row) => (
              <div key={row.book.id} className="flex items-center justify-between">
                <span>{row.book.title}</span>
                <span className="font-semibold">{row.soldQty}</span>
              </div>
            ))}
            {noSoldBooks && <p className="text-slate-400">لا توجد كتب مباعة في هذه الفترة.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
