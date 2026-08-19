export default function ModalActions({ t }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <button
        type="reset"
        className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
      >
        {t('actions.cancel')}
      </button>
      <button
        type="submit"
        className="rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
      >
        {t('actions.save')}
      </button>
    </div>
  )
}