import { FileSpreadsheet, Lock } from 'lucide-react'

import InputField from '../../components/ui/InputField'
import MetricBar from '../../components/ui/MetricBar'
import StatCard from '../../components/ui/StatCard'

export default function AdminView({
  t,
  locale,
  customFooter,
  onCustomFooterChange,
  onExport,
  adminUnlocked,
  adminPassword,
  onPasswordChange,
  onUnlock,
  onLock,
  totalSales,
  totalCost,
  totalNet,
  chartMax,
  salesHistory,
  formatCurrency,
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      {!adminUnlocked ? (
        <div className="max-w-lg space-y-4">
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-brand-600" />
            <div>
              <h3 className="text-lg font-semibold">{t('sections.admin')}</h3>
              <p className="text-sm text-slate-500">{t('labels.adminHint')}</p>
            </div>
          </div>
          <form
            onSubmit={onUnlock}
            className="space-y-3"
          >
            <InputField
              name="adminPassword"
              label={t('fields.password')}
              type="password"
              value={adminPassword}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
            />
            <button
              type="submit"
              className="rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {t('actions.unlock')}
            </button>
          </form>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{t('sections.admin')}</h3>
              <p className="text-sm text-slate-500">{t('labels.adminMetrics')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExport}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {t('actions.exportExcel')}
              </button>
              <button
                type="button"
                onClick={onLock}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
              >
                {t('actions.lock')}
              </button>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <label className="block text-sm font-semibold text-slate-700">{(t('labels.customReceiptFooter') || 'نص إضافي للإيصالات')}</label>
            <textarea
              value={customFooter}
              onChange={(e) => onCustomFooterChange(e.target.value)}
              placeholder="سياسات، عروض، إيفنتات..."
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <StatCard title={t('labels.salesTotal')} value={formatCurrency(locale, totalSales)} />
            <StatCard title={t('labels.costTotal')} value={formatCurrency(locale, totalCost)} />
            <StatCard title={t('labels.netProfit')} value={formatCurrency(locale, totalNet)} />
          </div>
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-700">{t('labels.performance')}</h4>
            <div className="mt-4 space-y-3">
              <MetricBar
                label={t('labels.salesTotal')}
                value={totalSales}
                valueLabel={formatCurrency(locale, totalSales)}
                max={chartMax}
                color="bg-emerald-500"
              />
              <MetricBar
                label={t('labels.costTotal')}
                value={totalCost}
                valueLabel={formatCurrency(locale, totalCost)}
                max={chartMax}
                color="bg-amber-500"
              />
              <MetricBar
                label={t('labels.netProfit')}
                value={totalNet}
                valueLabel={formatCurrency(locale, totalNet)}
                max={chartMax}
                color="bg-sky-500"
              />
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-700">{t('labels.recentTransactions')}</h4>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              {salesHistory.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between">
                  <span>
                    {entry.id} · {entry.student?.name || t('labels.walkIn')} ·{' '}
                    {t(`staff.${entry.staffId}`)}
                  </span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(locale, entry.total)}
                  </span>
                </div>
              ))}
              {salesHistory.length === 0 && (
                <p className="text-xs text-slate-400">{t('empty.sales')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
