import { X } from 'lucide-react'

export default function ModalHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-500">
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}