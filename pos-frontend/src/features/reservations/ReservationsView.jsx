import { PackageCheck, PackageX } from 'lucide-react'

export default function ReservationsView({ variant, t, search, onSearchChange, onOpenLegacy, children }) {
  const isPickup = variant === 'pickup'
  return (
    <div className="rounded-3xl bg-white p-10 text-center shadow">
      {isPickup ? (
        <PackageCheck className="mx-auto h-12 w-12 text-brand-600" />
      ) : (
        <PackageX className="mx-auto h-12 w-12 text-amber-500" />
      )}
      <h3 className="mt-4 text-lg font-semibold">{isPickup ? t('nav.pickupReservation') : t('nav.cancelReservation')}</h3>
      <p className="mt-2 text-sm text-slate-500">{t('labels.searchByTxOrPhone')}</p>
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="ED-0001 أو الاسم أو الهاتف"
        className="mt-4 w-full max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      {isPickup && (
        <button
          type="button"
          onClick={onOpenLegacy}
          className="mt-3 rounded-2xl border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700"
        >
          حجز من الدفتر القديم
        </button>
      )}
      {children}
    </div>
  )
}
