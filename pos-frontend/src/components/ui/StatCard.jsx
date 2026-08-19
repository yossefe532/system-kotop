export default function StatCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-400">{title}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}