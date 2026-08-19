import { computeStudentSearch } from '../pos-frontend/src/hooks/useStudentSearch.js'

// ---- fixtures (names/phones mirror production data shape) ----
const students = [
  { id: 1, name: 'محمد أحمد', phone: '+20 100 123 4567' },
  { id: 2, name: 'Mohamed Ali', phone: '01001234567' },
  { id: 3, name: 'سارة أحمد', phone: '0111-222-333' },
  { id: 4, name: 'Ali', phone: '01234567890' },
  { id: 5, phone: '01555555555' },
  { id: 6, name: '', phone: '' },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: 100 + i,
    name: `Ali${i}`,
    phone: `0100${String(i).padStart(6, '0')}`,
  })),
]
const namedStudents = students.filter((s) => s.name)
const sales = [
  { id: 'ED-0001', student: { name: 'محمد أحمد', phone: '01001234567' } },
  { id: 'ED-0002', student: { name: 'علي', phone: '' } },
  { id: 'ED-0003' },
  { id: 'ED-0004', student: { name: 'Sam', phone: '0111-222-333' } },
  { id: 'ED-0005', student: { name: undefined, phone: '01234567890' } },
]

// ---------------- ORIGINAL implementations (verbatim from audit) ----------------
const refPicker = (q) => {
  const term = q.trim().toLowerCase()
  if (!term) return []
  const digits = term.replace(/\D/g, '')
  return students
    .filter(
      (s) =>
        s.name?.toLowerCase().includes(term) ||
        (digits.length >= 3 && (s.phone || '').replace(/\D/g, '').includes(digits)),
    )
    .slice(0, 12)
    .map((s) => s.id)
}
const refAutocomplete = (q) => {
  const name = q?.trim().toLowerCase()
  if (!name || name.length < 2) return null
  const found = namedStudents.find((s) => s.name?.toLowerCase().includes(name) || name.includes(s.name?.toLowerCase()))
  return found == null ? null : found.id
}
const refTable = (q) => {
  const term = q.trim().toLowerCase()
  if (!term) return students.map((s) => s.id)
  return students
    .filter(
      (s) => s.name?.toLowerCase().includes(term) || s.phone?.replace(/\D/g, '').includes(term.replace(/\D/g, '')),
    )
    .map((s) => s.id)
}
const refReturn = (q) => {
  const term = q.trim().toLowerCase()
  if (!term) return null
  const found = sales.find(
    (s) =>
      s.student?.name?.toLowerCase().includes(term) ||
      term.includes(s.student?.name?.toLowerCase() || '') ||
      (s.student?.phone && s.student.phone.replace(/\D/g, '').includes(term.replace(/\D/g, ''))),
  )
  return found == null ? null : found.id
}

// ---------------- Hook-driven implementations ----------------
const hookPicker = (q) =>
  computeStudentSearch(students, q, { emptyResult: 'none', minPhoneDigits: 3, limit: 12 }).filteredStudents.map(getId)
const hookAutocomplete = (q) => {
  const r = computeStudentSearch(namedStudents, q, {
    minQueryLength: 2,
    bidirectional: true,
    matchPhone: false,
    mode: 'find',
  }).filteredStudents
  return r == null ? null : getId(r)
}
const hookTable = (q) => computeStudentSearch(students, q, {}).filteredStudents.map(getId)
const hookReturn = (q) => {
  const r = computeStudentSearch(sales, q, {
    mode: 'find',
    bidirectional: true,
    emptyResult: 'none',
    getTarget: (sale) => sale.student,
  }).filteredStudents
  return r == null ? null : getId(r)
}

const getId = (x) => x?.id

const queries = ['', '   ', 'محمد', 'محمد أحمد', ' محمد ', 'mohamed', 'MOHAMED', 'ali', 'al', 'سارة',
  '0100', '0111', '0', '012', '987', '0123456789', 'x', 'unknown']
const min2 = ['', 'a', 'm', 'mo', 'al', 'محمد', 'ali', 'Ali', 'MOHAMED ALI', 'zz', 'سارة']

const pairs = [
  ['picker', refPicker, hookPicker, queries],
  ['autocomplete', refAutocomplete, hookAutocomplete, min2],
  ['table', refTable, hookTable, queries],
  ['return-sale', refReturn, hookReturn, queries],
]

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
let failures = 0
for (const [name, ref, hook, qs] of pairs) {
  for (const q of qs) {
    const expected = ref(q)
    const actual = hook(q)
    if (!eq(expected, actual)) {
      failures += 1
      console.log(`FAIL ${name} query=${JSON.stringify(q)} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
    }
  }
}
console.log(failures === 0 ? `PARITY OK (${pairs.reduce((n, p) => n + p[3].length, 0)} cases)` : `PARITY FAILURES: ${failures}`)
process.exit(failures ? 1 : 0)