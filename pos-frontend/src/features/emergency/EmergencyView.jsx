import { ShieldAlert } from 'lucide-react'

import InputField from '../../components/ui/InputField'
import SelectField from '../../components/ui/SelectField'

export default function EmergencyView({ t, locale, staffMembers, form, onFormChange, withdrawals, formatCurrency, onSubmit, defaultStaffId = '' }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-amber-500" />
        <div>
          <h3 className="text-lg font-semibold">{t('sections.emergency')}</h3>
          <p className="text-sm text-slate-500">{t('labels.emergencyHint')}</p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <InputField
            name="emergencyAmount"
            label={t('fields.amount')}
            type="number"
            min="1"
            value={form.amount}
            onChange={(event) =>
              onFormChange((prev) => ({ ...prev, amount: event.target.value }))
            }
            required
          />
          <SelectField
            label={t('fields.staff')}
            value={form.staffId || defaultStaffId}
            onChange={(event) =>
              onFormChange((prev) => ({ ...prev, staffId: event.target.value }))
            }
            options={staffMembers.map((member) => ({
              value: member.id,
              label: t(`staff.${member.id}`),
            }))}
          />
        </div>
        <InputField
          name="emergencyReason"
          label={t('fields.reason')}
          value={form.reason}
          onChange={(event) =>
            onFormChange((prev) => ({ ...prev, reason: event.target.value }))
          }
          required
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('labels.safeWarning')}
        </div>
        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white"
        >
          {t('actions.recordWithdrawal')}
        </button>
      </form>
      {withdrawals.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-700">{t('labels.recentWithdrawals')}</h4>
          <div className="mt-3 space-y-2 text-xs text-slate-500">
            {withdrawals.slice(0, 4).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between">
                <span>
                  {t(`staff.${entry.staffId}`)} · {entry.reason}
                </span>
                <span className="font-semibold text-slate-700">
                  {formatCurrency(locale, entry.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
