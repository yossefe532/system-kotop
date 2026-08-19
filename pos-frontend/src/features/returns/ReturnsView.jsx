import { ArrowUpDown } from 'lucide-react'

export default function ReturnsView({ children }) {
  return (
    <div className="rounded-3xl bg-white p-10 text-center shadow">
      <ArrowUpDown className="mx-auto h-12 w-12 text-rose-500" />
      <h3 className="mt-4 text-lg font-semibold">مرتجع فاتورة</h3>
      <p className="mt-2 text-sm text-slate-500">ابحث برقم العملية أو اسم الطالب</p>
      {children}
    </div>
  )
}
