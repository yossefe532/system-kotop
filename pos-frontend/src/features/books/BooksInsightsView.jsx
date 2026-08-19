export default function BooksInsightsView({ locale, rows, formatCurrency }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">تحليل الكتب</h3>
        <p className="text-xs text-slate-500">الأكثر مبيعًا · المحجوز · المتاح للبيع</p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="pb-3">الكتاب</th>
              <th className="pb-3">المبيعات</th>
              <th className="pb-3">محجوز (معلّق)</th>
              <th className="pb-3">المخزن</th>
              <th className="pb-3">محجوز من المخزن</th>
              <th className="pb-3">متاح للبيع</th>
              <th className="pb-3">سعر البيع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.book.id} className="text-slate-700">
                <td className="py-3">
                  <div className="font-medium">{row.book.title}</div>
                  <div className="text-xs text-slate-400">{row.book.author}</div>
                </td>
                <td className="py-3 font-semibold">{row.soldQty}</td>
                <td className="py-3 font-semibold text-sky-700">{row.reservedQty}</td>
                <td className="py-3">{row.book.stock}</td>
                <td className="py-3">{row.reservedStock}</td>
                <td className={`py-3 font-semibold ${row.availableToSell <= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{row.availableToSell}</td>
                <td className="py-3">{formatCurrency(locale, row.book.sellingPrice)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  لا توجد بيانات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
