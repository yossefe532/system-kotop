export default function MetricBar({ label, value, valueLabel, max, color }) {
  const width = Math.round((value / max) * 100)
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{valueLabel}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}