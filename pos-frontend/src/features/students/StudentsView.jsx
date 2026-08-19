import { useMemo, useState } from 'react'
import { ArrowUpDown, FileSpreadsheet, Pencil, Plus, Search, Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import useStudentSearch from '../../hooks/useStudentSearch'

export default function StudentsView({ t, students, stageOptions, genderOptions, systemOptions, onAdd, onEdit, onView }) {
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterSystem, setFilterSystem] = useState('')
  const [filterGender, setFilterGender] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  const { filteredStudents } = useStudentSearch({ students, query: search })

  const filteredAndSorted = useMemo(() => {
    let list = [...filteredStudents]
    if (filterStage) list = list.filter((s) => s.stage === filterStage)
    if (filterSystem) list = list.filter((s) => s.system === filterSystem)
    if (filterGender) list = list.filter((s) => s.gender === filterGender)

    list.sort((a, b) => {
      let va = a[sortBy] ?? ''
      let vb = b[sortBy] ?? ''
      if (sortBy === 'name') {
        va = String(va).toLowerCase()
        vb = String(vb).toLowerCase()
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      va = String(va)
      vb = String(vb)
      const cmp = va.localeCompare(vb, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [filteredStudents, filterStage, filterSystem, filterGender, sortBy, sortDir])

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir('asc') }
  }

  const exportStudentsToExcel = () => {
    const rows = filteredAndSorted.map((s) => ({
      [t('fields.name')]: s.name,
      [t('fields.stage')]: t(`stages.${s.stage || 'first'}`),
      [t('fields.system')]: t(`system.${s.system || 'general'}`),
      [t('fields.gender')]: t(`gender.${s.gender || 'male'}`),
      [t('fields.specialty')]: s.specialty || '--',
      [t('fields.phone')]: s.phone || '--',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t('nav.students'))
    XLSX.writeFile(wb, 'educon-students.xlsx')
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">{t('nav.students')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            {t('actions.add')}
          </button>
          <button
            type="button"
            onClick={exportStudentsToExcel}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('labels.exportStudents')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('labels.searchStudents')}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm rtl:pl-4 rtl:pr-9"
          />
        </div>
        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
        >
          <option value="">{t('labels.filterAll')} ({t('fields.stage')})</option>
          {stageOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filterSystem}
          onChange={(e) => setFilterSystem(e.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
        >
          <option value="">{t('labels.filterAll')} ({t('fields.system')})</option>
          {systemOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filterGender}
          onChange={(e) => setFilterGender(e.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
        >
          <option value="">{t('labels.filterAll')} ({t('fields.gender')})</option>
          {genderOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <SortHeaderCell col="name" label={t('fields.name')} onToggle={toggleSort} />
              <SortHeaderCell col="stage" label={t('fields.stage')} onToggle={toggleSort} />
              <SortHeaderCell col="system" label={t('fields.system')} onToggle={toggleSort} />
              <SortHeaderCell col="gender" label={t('fields.gender')} onToggle={toggleSort} />
              <th className="pb-3">{t('fields.specialty')}</th>
              <SortHeaderCell col="phone" label={t('fields.phone')} onToggle={toggleSort} />
              <th className="pb-3">{t('labels.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAndSorted.map((student) => (
              <tr key={student.id} className="text-slate-700 hover:bg-slate-50/50">
                <td className="py-3 font-medium">{student.name}</td>
                <td className="py-3">{t(`stages.${student.stage || 'first'}`)}</td>
                <td className="py-3">{t(`system.${student.system || 'general'}`)}</td>
                <td className="py-3">{t(`gender.${student.gender || 'male'}`)}</td>
                <td className="py-3">{student.specialty || '--'}</td>
                <td className="py-3">{student.phone || '--'}</td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onView(student)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600"
                    >
                      <Users className="h-4 w-4" />
                      عرض
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(student)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"
                    >
                      <Pencil className="h-4 w-4" />
                      {t('actions.edit')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAndSorted.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">{t('empty.students')}</p>
        )}
      </div>
    </div>
  )
}

function SortHeaderCell({ col, label, onToggle }) {
  return (
    <th
      className="cursor-pointer select-none pb-3 text-left text-xs uppercase tracking-wider text-slate-400 hover:text-slate-600"
      onClick={() => onToggle(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </span>
    </th>
  )
}
