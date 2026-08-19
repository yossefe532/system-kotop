import { Pencil, Plus, Printer } from 'lucide-react'

import { formatCurrency } from '../../lib/format'

export default function BooksView({ t, locale, books, onAdd, onEdit, onPrint }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{t('nav.books')}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          {t('actions.add')}
        </button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="pb-3">{t('fields.name')}</th>
              <th className="pb-3">{t('fields.author')}</th>
              <th className="pb-3">{t('labels.costPrice')}</th>
              <th className="pb-3">{t('labels.sellingPrice')}</th>
              <th className="pb-3">تقريبي</th>
              <th className="pb-3">{t('labels.stock')}</th>
              <th className="pb-3">الحالة</th>
              <th className="pb-3">{t('labels.barcode')}</th>
              <th className="pb-3">{t('labels.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {books.map((book) => (
              <tr key={book.id} className="text-slate-700">
                <td className="py-3">{book.title}</td>
                <td className="py-3">{book.author}</td>
                <td className="py-3">{formatCurrency(locale, book.costPrice)}</td>
                <td className="py-3">{formatCurrency(locale, book.sellingPrice)}</td>
                <td className="py-3">{book.estimatedSellingPrice != null ? formatCurrency(locale, book.estimatedSellingPrice) : '--'}</td>
                <td className="py-3">{book.stock}</td>
                <td className="py-3">
                  {book.isArriving ? (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">لم يصل</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">متاح</span>
                  )}
                </td>
                <td className="py-3">{book.barcode}</td>
                <td className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onEdit(book)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600"
                    >
                      <Pencil className="h-4 w-4" />
                      {t('actions.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onPrint(book)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"
                    >
                      <Printer className="h-4 w-4" />
                      {t('actions.barcodePrint')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
