export default function SelectField({ label, options, compact = false, ...props }) {
  return (
    <label className="block text-sm text-slate-600">
      <span className="mb-2 block text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <select
        {...props}
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 ${
          compact ? 'py-2' : 'py-3'
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}