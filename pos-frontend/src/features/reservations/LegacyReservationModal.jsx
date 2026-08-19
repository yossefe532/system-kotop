import { useMemo, useState } from 'react'
import Modal from '../../components/ui/Modal'
import InputField from '../../components/ui/InputField'
import SelectField from '../../components/ui/SelectField'

export default function LegacyReservationModal({ open, onClose, books, students, setStudents, setPendingReservations }) {
  const defaultDate = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [form, setForm] = useState({
    studentName: '',
    phone: '',
    date: '',
    notebookPage: '',
    notebookLine: '',
    bookId: '',
    qty: '1',
    deposit: '',
  })
  if (!open) return null
  const effectiveDate = form.date || defaultDate
  const effectiveQty = form.qty || '1'
  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }
  const handleSubmit = (event) => {
    event.preventDefault()
    const name = form.studentName.trim()
    const phone = form.phone.trim()
    if (!name) return
    if (!form.bookId) return
    const qty = Math.max(parseInt(effectiveQty, 10) || 1, 1)
    const deposit = Number(form.deposit) || 0
    let existingStudent = null
    if (phone) {
      const digits = phone.replace(/\D/g, '')
      existingStudent = students.find((s) => s.phone && s.phone.replace(/\D/g, '') === digits)
    }
    if (!existingStudent) {
      existingStudent = students.find((s) => s.name && s.name.trim() === name)
    }
    let studentId = existingStudent?.id
    if (!studentId) {
      studentId = Date.now()
      const newStudent = {
        id: studentId,
        name,
        phone,
      }
      setStudents((prev) => [...prev, newStudent])
    }
    const reservation = {
      id: `LEG-${Date.now()}`,
      transactionId: null,
      studentId,
      bookId: form.bookId,
      qty,
      status: 'pending',
      deposit,
      pendingArrival: true,
      date: effectiveDate || new Date().toISOString(),
      notebookPage: form.notebookPage || null,
      notebookLine: form.notebookLine || null,
      legacy: true,
    }
    setPendingReservations((prev) => [...prev, reservation])
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="حجز من الدفتر القديم">
      <form onSubmit={handleSubmit} className="space-y-4 text-right">
        <div className="grid gap-3 md:grid-cols-2">
          <InputField
            name="studentName"
            label="اسم الطالب"
            value={form.studentName}
            onChange={handleChange}
            required
          />
          <InputField
            name="phone"
            label="رقم الهاتف"
            value={form.phone}
            onChange={handleChange}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <InputField
            name="date"
            label="تاريخ الحجز (من الدفتر)"
            type="date"
            value={effectiveDate}
            onChange={handleChange}
          />
          <InputField
            name="notebookPage"
            label="رقم الصفحة"
            value={form.notebookPage}
            onChange={handleChange}
          />
          <InputField
            name="notebookLine"
            label="رقم السطر"
            value={form.notebookLine}
            onChange={handleChange}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField
            label="الكتاب"
            value={form.bookId}
            onChange={(event) => handleChange({ target: { name: 'bookId', value: event.target.value } })}
            options={books.map((book) => ({ value: book.id, label: book.title }))}
          />
          <InputField
            name="qty"
            label="الكمية"
            type="number"
            min="1"
            value={effectiveQty}
            onChange={handleChange}
          />
          <InputField
            name="deposit"
            label="المبلغ المدفوع حجزًا"
            type="number"
            min="0"
            value={form.deposit}
            onChange={handleChange}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            حفظ الحجز
          </button>
        </div>
      </form>
    </Modal>
  )
}
