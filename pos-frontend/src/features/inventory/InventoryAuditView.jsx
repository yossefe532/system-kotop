import { ClipboardList } from 'lucide-react'

import SelectField from '../../components/ui/SelectField'
import StatCard from '../../components/ui/StatCard'

export default function InventoryAuditView({
  t,
  locale,
  safeBalance,
  totalSales,
  totalWithdrawals,
  auditActualCash,
  onActualCashChange,
  auditStaffId,
  onAuditStaffChange,
  auditStaffMembers,
  onAudit,
  auditLog,
  formatCurrency,
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-brand-600" />
        <div>
          <h3 className="text-lg font-semibold">{t('sections.inventory')}</h3>
          <p className="text-sm text-slate-500">{t('labels.inventoryHint')}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard title={t('labels.safeBalance')} value={formatCurrency(locale, safeBalance)} />
        <StatCard title={t('labels.salesTotal')} value={formatCurrency(locale, totalSales)} />
        <StatCard
          title={t('labels.withdrawalsTotal')}
          value={formatCurrency(locale, totalWithdrawals)}
        />
      </div>
      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">{t('labels.auditSession')}</h4>
            <p className="text-xs text-slate-500">{t('labels.auditHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-600">
              <p className="mb-1">الرصيد الفعلي في الدرج</p>
              <input
                type="number"
                min="0"
                value={auditActualCash}
                onChange={(event) => onActualCashChange(event.target.value)}
                className="w-32 rounded-xl border border-slate-300 bg-white px-2 py-1 text-right text-xs"
              />
            </div>
            <SelectField
              label={t('fields.auditStaff')}
              value={auditStaffId}
              onChange={(event) => onAuditStaffChange(event.target.value)}
              options={auditStaffMembers.map((member) => ({
                value: member.id,
                label: t(`staff.${member.id}`),
              }))}
              compact
            />
            <button
              type="button"
              onClick={onAudit}
              disabled={!['heba', 'maryam'].includes(auditStaffId)}
              className="flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {t('actions.audit')}
            </button>
          </div>
        </div>
        {auditLog.length > 0 && (
          <div className="mt-4 space-y-2 text-xs text-slate-500">
            {auditLog.slice(0, 3).map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>
                    {t(`staff.${entry.staffId}`)} ·{' '}
                    {new Date(entry.date).toLocaleString(locale)}
                  </span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(locale, entry.safeBalance)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span>الرصيد المتوقع</span>
                  <span>{formatCurrency(locale, entry.safeBalance)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>الرصيد الفعلي</span>
                  <span>{formatCurrency(locale, entry.actualCash || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>الفرق</span>
                  <span className={entry.diff === 0 ? 'text-emerald-600' : entry.diff > 0 ? 'text-amber-600' : 'text-rose-600'}>
                    {formatCurrency(locale, entry.diff || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
