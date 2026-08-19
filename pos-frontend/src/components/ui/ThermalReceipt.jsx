import { logoUrl } from '../../config/app'
import { formatCurrency } from '../../lib/format'
import { receiptTypeLabels } from '../../lib/receipt'

export default function ThermalReceipt({ t, locale, receipt, receiptLink, hasPhone, followsUs, onFollowsUsChange, whatsappGroupLink, channelLink, onPrint }) {
  const dateLabel = receipt?.date ? new Date(receipt.date).toLocaleString(locale) : '--'
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow">
      <div className="receipt-print-only print-area mx-auto space-y-4" style={{ width: '80mm' }} dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}>
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center">
          <img src={logoUrl} alt="Educon logo" className="mx-auto h-10 object-contain" />
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-600">{t('receipt.academy')}</p>
          <h3 className="text-lg font-semibold">{t('receipt.title')}</h3>
        </div>
        <div className="space-y-1 text-xs text-slate-600">
          {receipt?.receiptType && (
            <div className="flex items-center justify-between">
              <span>{t('labels.receiptType')}</span>
              <span className="font-semibold text-slate-900">{receiptTypeLabels[receipt.receiptType] || receipt.receiptType}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>{t('labels.transaction')}</span>
            <span className="font-semibold text-slate-900">{receipt?.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('labels.date')}</span>
            <span className="font-semibold text-slate-900">{dateLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('labels.staff')}</span>
            <span className="font-semibold text-slate-900">{receipt?.staffName}</span>
          </div>
        </div>
        <div className="text-xs text-slate-600">
          <p>
            {t('labels.student')}: {receipt?.student?.name || '--'}
          </p>
          <p>
            {t('fields.stage')}: {receipt?.student ? t(`stages.${receipt.student.stage}`) : '--'}
          </p>
          <p>
            {t('fields.phone')}: {receipt?.student?.phone || '--'}
          </p>
        </div>
        <div className="space-y-2 border-y border-dashed border-slate-200 py-4 text-xs">
          {receipt?.items?.length === 0 ? (
            <p className="text-slate-400">{t('empty.cart')}</p>
          ) : (
            receipt?.items?.map((item) => (
              <div key={item.lineKey || `${item.type}:${item.id}`} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>
                    {item.title} · {item.qty}x
                  </span>
                  <span className="font-semibold">{formatCurrency(locale, item.lineTotal)}</span>
                </div>
                {item.type === 'reservation' && (
                  <p className="text-[10px] text-sky-700">
                    {t('labels.reservation')} · {t('labels.deposit')}: {item.deposit || 0}
                    {item.pendingArrival ? ` · ${t('labels.pendingArrival')}` : ''}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span>{t('labels.subtotal')}</span>
            <span className="font-semibold">{formatCurrency(locale, receipt?.subtotal || 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('labels.discount')}</span>
            <span className="font-semibold">{formatCurrency(locale, receipt?.discount || 0)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{t('labels.total')}</span>
            <span className="text-brand-700">{formatCurrency(locale, receipt?.total || 0)}</span>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">{t('receipt.thanks')}</p>
      </div>
      <div className="no-print mt-5 space-y-3">
        {onFollowsUsChange && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={followsUs}
              onChange={(e) => onFollowsUsChange(e.target.checked)}
              className="rounded border-slate-300"
            />
            {t('labels.followsUs')}
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onPrint?.()}
          className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
        >
          {t('actions.print')}
        </button>
        {hasPhone && receiptLink ? (
          <a
            href={receiptLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {t('actions.whatsappReceipt')}
          </a>
        ) : (
          <span
            className="flex cursor-not-allowed items-center gap-2 rounded-2xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
            title={t('labels.addPhoneFirst')}
          >
            {t('actions.whatsappReceipt')}
            <span className="text-xs">({t('labels.addPhoneFirst')})</span>
          </span>
        )}
        {whatsappGroupLink && (
          <a
            href={whatsappGroupLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
          >
            {t('actions.whatsappGroup')}
          </a>
        )}
        {channelLink && (
          <a
            href={channelLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
          >
            {t('actions.whatsappChannel')}
          </a>
        )}
        </div>
      </div>
    </div>
  )
}