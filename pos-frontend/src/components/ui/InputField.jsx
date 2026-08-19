export default function InputField({ label, ...props }) {
  return (
    <label className="block text-sm text-slate-600">
      <span className="mb-2 block text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
      />
    </label>
  )
}