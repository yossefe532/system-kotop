import { Plus, CheckCircle2 } from 'lucide-react'
import InputField from '../../components/ui/InputField'
import SelectField from '../../components/ui/SelectField'
import ThermalReceipt from '../../components/ui/ThermalReceipt'
import { formatCurrency } from '../../lib/format'
import { getDefaultReservationDeposit } from '../../lib/cart'

export default function POSView({
  t,
  locale,
  openStudentModal,
  studentPickerSearch,
  setStudentPickerSearch,
  selectedStudent,
  filteredStudentsForPicker,
  setSelectedStudentId,
  handleQuickStudentSubmit,
  quickStudent,
  setQuickStudent,
  studentAutocomplete,
  stageOptions,
  genderOptions,
  systemOptions,
  filteredBooks,
  hasPendingReservation,
  addToCart,
  cartDetails,
  updateCartQty,
  updateCartType,
  addCartLine,
  updateCartDeposit,
  paymentMethod,
  setPaymentMethod,
  discount,
  setDiscount,
  reservationOutstandingTotal,
  paidAmount,
  setPaidAmount,
  handleCompleteSale,
  receiptPayload,
  receiptLink,
  whatsappPhone,
  followsUs,
  setFollowsUs,
  whatsappGroupLink,
  channelLink,
  archiveAndPrintReceipt
}) {
  return (
<section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
  <div className="space-y-6">
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('sections.studentSelect')}</h3>
        <button
          type="button"
          onClick={() => openStudentModal('add')}
          className="flex items-center gap-2 text-sm font-semibold text-brand-600"
        >
          <Plus className="h-4 w-4" />
          {t('actions.add')}
        </button>
      </div>
      <InputField
        name="studentPickerSearch"
        label="بحث طالب قديم"
        value={studentPickerSearch}
        onChange={(event) => setStudentPickerSearch(event.target.value)}
        placeholder="اكتب الاسم أو الموبايل"
      />
      {selectedStudent && (
        <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          تم اختيار: {selectedStudent.name} · {selectedStudent.phone || 'بدون هاتف'}
        </div>
      )}
      {studentPickerSearch.trim() && (
        <div className="mt-3 max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white">
          {filteredStudentsForPicker.map((student) => (
            <button
              key={student.id}
              type="button"
              onClick={() => {
                setSelectedStudentId(String(student.id))
                setStudentPickerSearch(student.name || '')
              }}
              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-right text-sm hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-800">{student.name}</span>
              <span className="text-xs text-slate-500">{student.phone || '--'}</span>
            </button>
          ))}
          {filteredStudentsForPicker.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400">لا يوجد مطابقات</p>
          )}
        </div>
      )}
    </div>

    <div className="rounded-3xl border border-brand-100 bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('sections.quickRegister')}</h3>
        <p className="text-xs text-slate-400">{t('labels.quickRegisterHint')}</p>
      </div>
      <form onSubmit={handleQuickStudentSubmit} className="mt-4 grid gap-4">
        <div>
          <InputField
            name="quickName"
            label={t('fields.name')}
            value={quickStudent.name}
            onChange={(event) =>
              setQuickStudent((prev) => ({ ...prev, name: event.target.value }))
            }
            required
          />
          {studentAutocomplete && (
            <button
              type="button"
              onClick={() => {
                setQuickStudent({
                  name: studentAutocomplete.name,
                  phone: studentAutocomplete.phone || '',
                  stage: studentAutocomplete.stage || 'first',
                  gender: studentAutocomplete.gender || 'male',
                  system: studentAutocomplete.system || 'general',
                  specialty: studentAutocomplete.specialty || '',
                })
                setSelectedStudentId(String(studentAutocomplete.id))
              }}
              className="mt-1 text-xs font-semibold text-brand-600"
            >
              {t('labels.useExistingStudent')}
            </button>
          )}
        </div>
        <InputField
          name="quickPhone"
          label={t('fields.phone')}
          value={quickStudent.phone}
          onChange={(event) =>
            setQuickStudent((prev) => ({ ...prev, phone: event.target.value }))
          }
          required
        />
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            label={t('fields.stage')}
            value={quickStudent.stage}
            onChange={(event) =>
              setQuickStudent((prev) => ({ ...prev, stage: event.target.value }))
            }
            options={stageOptions}
          />
          <SelectField
            label={t('fields.gender')}
            value={quickStudent.gender}
            onChange={(event) =>
              setQuickStudent((prev) => ({ ...prev, gender: event.target.value }))
            }
            options={genderOptions}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            label={t('fields.system')}
            value={quickStudent.system}
            onChange={(event) =>
              setQuickStudent((prev) => ({ ...prev, system: event.target.value }))
            }
            options={systemOptions}
          />
          <InputField
            name="specialty"
            label={t('fields.specialty')}
            value={quickStudent.specialty}
            onChange={(event) =>
              setQuickStudent((prev) => ({ ...prev, specialty: event.target.value }))
            }
          />
        </div>
        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          {t('actions.registerStudent')}
        </button>
      </form>
    </div>

    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('sections.products')}</h3>
        <span className="text-xs font-semibold text-slate-400">
          {filteredBooks.length} items
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {filteredBooks.map((book) => {
          const highlightReservation =
            selectedStudent && hasPendingReservation(selectedStudent.id, book.id)
          const reservedStock = Number(book.reservedStock) || 0
          const availableToSell = Math.max((Number(book.stock) || 0) - reservedStock, 0)
          const canAddSale = book.isArriving || availableToSell > 0 || Boolean(highlightReservation)
          return (
            <div
              key={book.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 ${
                highlightReservation
                  ? 'ring-2 ring-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.6)]'
                  : ''
              }`}
            >
              <div>
                <p className="font-semibold text-slate-900">{book.title}</p>
                <p className="text-xs text-slate-500">
                  {book.author} · {t('labels.barcode')}: {book.barcode}
                </p>
                {highlightReservation && (
                  <p className="mt-1 text-xs font-semibold text-sky-600">
                    {t('labels.pendingReservation')} (سيتم خصم العربون تلقائيًا)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <p className="font-semibold text-brand-600">
                    {formatCurrency(locale, book.sellingPrice)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t('labels.stock')}: {book.stock} · محجوز: {reservedStock} · متاح للبيع: {availableToSell}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(book)}
                  disabled={!canAddSale}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white ${canAddSale ? 'bg-brand-600' : 'bg-slate-300 cursor-not-allowed'}`}
                >
                  {t('actions.addToCart')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  </div>

  <div className="space-y-6">
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('sections.cart')}</h3>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
          {cartDetails.items.length} items
        </span>
      </div>

      {cartDetails.items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t('empty.cart')}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {cartDetails.items.map((item) => (
            <div
              key={item.lineKey}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-400">
                    {formatCurrency(locale, item.sellingPrice)} · {t('labels.qty')}{' '}
                    {item.qty}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.lineKey, -1)}
                    className="h-7 w-7 rounded-full border border-slate-200 text-sm"
                  >
                    -
                  </button>
                  <span className="text-sm font-semibold">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.lineKey, 1)}
                    className="h-7 w-7 rounded-full border border-slate-200 text-sm"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={item.isArriving}
                    onClick={() => updateCartType(item.lineKey, 'sale')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.type === 'sale'
                        ? 'bg-brand-600 text-white'
                        : 'border border-slate-200 text-slate-500'
                    } ${item.isArriving ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {t('labels.sale')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCartType(item.lineKey, 'reservation')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.type === 'reservation'
                        ? 'bg-sky-600 text-white'
                        : 'border border-slate-200 text-slate-500'
                    }`}
                  >
                    {t('labels.reservation')}
                  </button>
                  <button
                    type="button"
                    disabled={item.isArriving && item.type !== 'reservation'}
                    onClick={() => {
                      const nextType = item.type === 'sale' ? 'reservation' : 'sale'
                      addCartLine(item.id, nextType, {
                        deposit: nextType === 'reservation' ? getDefaultReservationDeposit(item) : 0,
                        isZeroReservation: false,
                      })
                    }}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    {item.type === 'sale' ? 'إضافة حجز' : 'إضافة شراء'}
                  </button>
                </div>
                {item.type === 'reservation' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{t('labels.deposit')}</span>
                    <input
                      type="number"
                      min="0"
                      value={item.deposit}
                      onChange={(event) =>
                        updateCartDeposit(item.lineKey, event.target.value)
                      }
                      className="w-24 rounded-xl border border-slate-200 bg-white px-2 py-1 text-right text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => updateCartDeposit(item.lineKey, item.isZeroReservation ? getDefaultReservationDeposit(item) : 0)}
                      className="rounded-xl border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600"
                    >
                      {item.isZeroReservation ? 'إلغاء الصفري' : 'حجز صفري'}
                    </button>
                  </div>
                )}
              </div>
              {item.type === 'reservation' && item.pendingArrival && (
                <div className="mt-2 inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {t('labels.pendingArrival')}
                </div>
              )}
              {item.linkedReservation && (
                 <div className="mt-2 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    استكمال حجز (تم خصم {item.linkedReservation.deposit})
                 </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">طريقة الدفع</span>
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm"
          >
            <option value="cash">كاش</option>
            <option value="wallet">فودافون كاش</option>
            <option value="bank">تحويل بنكي</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">{t('labels.subtotal')}</span>
          <span className="font-semibold text-slate-900">
            {formatCurrency(locale, cartDetails.subtotal)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">{t('labels.discount')}</span>
          <input
            type="number"
            min="0"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1 text-right text-sm"
          />
        </div>
        <div className="flex items-center justify-between text-base">
          <span className="text-slate-900">{t('labels.total')}</span>
          <span className="font-semibold text-brand-700">
            {formatCurrency(locale, cartDetails.total)}
          </span>
        </div>
        {reservationOutstandingTotal > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">متبقي على الحجوزات لاحقًا</span>
            <span className="font-semibold text-amber-700">{formatCurrency(locale, reservationOutstandingTotal)}</span>
          </div>
        )}

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">المدفوع</span>
            <input
              type="number"
              min="0"
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
              placeholder={cartDetails.total}
              className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1 text-right text-sm"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm font-semibold">
            <span>
              {Number(paidAmount) >= cartDetails.total ? 'الباقي للعميل' : 'متبقي عليه (دين)'}
            </span>
            <span className={Number(paidAmount) >= cartDetails.total ? 'text-emerald-600' : 'text-rose-600'}>
              {formatCurrency(locale, Math.abs((Number(paidAmount) || 0) - cartDetails.total))}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCompleteSale}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white"
      >
        <CheckCircle2 className="h-4 w-4" />
        {t('actions.completeSale')}
      </button>
    </div>

    <ThermalReceipt
      t={t}
      locale={locale}
      receipt={receiptPayload}
      receiptLink={receiptLink}
      hasPhone={Boolean(whatsappPhone)}
      followsUs={followsUs}
      onFollowsUsChange={setFollowsUs}
      whatsappGroupLink={whatsappGroupLink}
      channelLink={channelLink}
      onPrint={archiveAndPrintReceipt}
    />
  </div>
</section>

  )
}
