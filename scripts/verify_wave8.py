import io, re, subprocess, sys

APP = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
VIEW = io.open(r'pos-frontend/src/features/students/StudentsView.jsx', encoding='utf-8').read()
RETURN = io.open(r'pos-frontend/src/features/returns/ReturnSaleContent.jsx', encoding='utf-8').read()
HOOK = io.open(r'pos-frontend/src/hooks/useStudentSearch.js', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. hook file structure ----------
add('useStudentSearch.js created', 'export default function useStudentSearch' in HOOK)
add('pure computeStudentSearch exported', 'export function computeStudentSearch' in HOOK)
add('hook wraps computation in useMemo', 'useMemo' in HOOK and 'computeStudentSearch(students, query' in HOOK)
add('hook owns no state', 'useState' not in HOOK)
add('hook has no side effects/API/storage', all(x not in HOOK for x in ['fetch(', 'axios', 'localStorage', 'indexedDb', 'setStudents', 'setCartItems']))
for token in ["(query || '').trim().toLowerCase()", 'term.replace(/\\D/g, \'\')', 'name.includes(effectiveTerm)',
               'effectiveTerm.includes(name)', "(target?.phone || '').replace(/\\D/g, '').includes(termDigits)",
               'termDigits.length >= minPhoneDigits', 'emptyResult === \'all\' ? students : []',
               'students.find(matches)', 'students.filter(matches)', 'filtered.slice(0, limit)',
               'term.length >= minQueryLength', 'matchPhone &&', 'getTarget(item)']:
    add(f'hook contains {token[:50]}', token in HOOK)
for opt in ['minQueryLength', 'emptyResult', 'bidirectional', 'matchPhone', 'minPhoneDigits', 'limit', 'mode', 'getTarget']:
    add(f'option {opt} implemented', re.search(rf'\b{opt}\b', HOOK) is not None)

# ---------- 2. hook imported everywhere ----------
add('App.jsx imports hook', "import useStudentSearch from './hooks/useStudentSearch'" in APP)
add('StudentsView imports hook', "import useStudentSearch from '../../hooks/useStudentSearch'" in VIEW)
add('ReturnSaleContent imports hook', "import useStudentSearch from '../../hooks/useStudentSearch'" in RETURN)

# ---------- 3. every inline implementation removed ----------
add('App: autocomplete memo removed', 'const studentAutocomplete = useMemo' not in APP)
add('App: picker memo removed', 'const filteredStudentsForPicker = useMemo' not in APP)
add('App: no inline name-includes term', "s.name?.toLowerCase().includes(term)" not in APP)
add('App: no inline bidirectional autocomplete', 'name.includes(s.name?.toLowerCase())' not in APP)
add('App: no inline picker phone filter', "digits.length >= 3 && (s.phone || '')" not in APP)
add('StudentsView: inline term filter removed', 's.name?.toLowerCase().includes(term)' not in VIEW)
add('StudentsView: inline phone filter removed', "s.phone?.replace(/\\D/g, '').includes(term.replace(/\\D/g, ''))" not in VIEW)
add('ReturnSaleContent: inline find removed', 's.student?.name?.toLowerCase().includes(term)' not in RETURN)
add('ReturnSaleContent: txId normalization kept', "txId = `ED-${String(parseInt(txMatch[1], 10)).padStart(4, '0')}`" in RETURN)
add('ReturnSaleContent: txMatch regex kept', "term.match(/^ed-?(\\d+)$/i)" in RETURN)

# ---------- 4. migrated call sites use matching options ----------
add('App: autocomplete -> hook (find, min 2, bidirectional, no phone)',
    re.search(r"useStudentSearch\(\{\s*students,\s*query: quickStudent\.name,\s*options: \{ minQueryLength: 2, bidirectional: true, matchPhone: false, mode: 'find' \},\s*\}\)", APP) is not None)
add('App: picker -> hook (empty none, min 3 phone digits, limit 12)',
    re.search(r"useStudentSearch\(\{\s*students,\s*query: studentPickerSearch,\s*options: \{ emptyResult: 'none', minPhoneDigits: 3, limit: 12 \},\s*\}\)", APP) is not None)
add('StudentsView: hook uses default options', "useStudentSearch({ students, query: search })" in VIEW)
add('StudentsView: column filters kept', 's.stage === filterStage' in VIEW and 's.system === filterSystem' in VIEW and 's.gender === filterGender' in VIEW)
add('StudentsView: sorting kept unchanged', 'localeCompare' in VIEW and 'numeric: true' in VIEW and 'sortBy' in VIEW)
add('ReturnSaleContent: getTarget maps sale->student', 'getTarget: (sale) => sale.student' in RETURN)
add('ReturnSaleContent: fallback to hook result', 'if (!sale) sale = saleMatch' in RETURN)
add('App: state ownership unchanged', 'const [studentPickerSearch, setStudentPickerSearch] = useState' in APP
    and 'const [quickStudent, setQuickStudent] = useState' in APP)
add('App: selectedStudent ID lookup untouched', 'const selectedStudent = students.find((student) => student.id === Number(selectedStudentId))' in APP)

# ---------- 5. documented distinct implementations retained (reservation logic) ----------
RES = io.open(r'pos-frontend/src/features/reservations/findReservationsBySearch.js', encoding='utf-8').read()
LEGACY = io.open(r'pos-frontend/src/features/reservations/LegacyReservationModal.jsx', encoding='utf-8').read()
add('reservation lookup module retained', 'export function findReservationsBySearch' in RES)
add('reservation level matching intact (phone >= 7, name >= 2/3)',
    'termDigits.length >= 7' in RES and 'term.length >= 2 && name.startsWith(term)' in RES and 'term.length >= 3 && name.includes(term)' in RES)
add('reservation ranking intact', 'hasRes * 100 + phoneExact * 40 + nameExact * 30 + starts * 10' in RES)
add('reservation candidates logic intact', 'const candidates = sorted.filter((s) => pendingReservations.some((r) => r.studentId === s.id))' in RES)
add('legacy modal exact-phone dedup retained', "s.phone && s.phone.replace(/\\D/g, '') === digits" in LEGACY)
add('legacy modal exact-name dedup retained', 's.name && s.name.trim() === name' in LEGACY)

# ---------- 6. live parity harness ----------
parity = subprocess.run(['node', 'scripts/parity_wave8.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity harness ran', parity.returncode == 0, parity.stdout.strip()[-200:])
add('parity harness zero failures', 'PARITY OK' in parity.stdout)

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
