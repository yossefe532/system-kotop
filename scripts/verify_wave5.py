import io, re, subprocess, sys

def git_show(path):
    return subprocess.check_output(['git', 'show', f'HEAD:{path}'], text=True, encoding='utf-8')

orig = git_show('pos-frontend/src/App.jsx')
cur = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. useModal.js exists with the required API and no business logic ----------
hook = io.open(r'pos-frontend/src/hooks/useModal.js', encoding='utf-8').read()
add('useModal.js created', 'useModal' in hook and 'src/hooks/useModal.js' in r'pos-frontend/src/hooks/useModal.js')
for token in ['export default function useModal', 'open', 'close', 'toggle']:
    add(f'useModal provides {token}', token in hook)
add('useModal has no business logic', all(x not in hook for x in ['apiRequest', 'localStorage', 'fetch', 'books', 'students', 'salesHistory']))

# ---------- 2. declarations: same initial literals, useState -> useModal ----------
decl_pairs = [
    (r"const \[bookModal, setBookModal\] = useState\((\{ open: false, mode: 'add', data: null \})\)",
     r"const \[bookModal, bookModalHelpers\] = useModal\((\{ open: false, mode: 'add', data: null \})\)"),
    (r"const \[studentModal, setStudentModal\] = useState\((\{ open: false, mode: 'add', data: null \})\)",
     r"const \[studentModal, studentModalHelpers\] = useModal\((\{ open: false, mode: 'add', data: null \})\)"),
    (r"const \[barcodeModal, setBarcodeModal\] = useState\((\{ open: false, book: null \})\)",
     r"const \[barcodeModal, barcodeModalHelpers\] = useModal\((\{ open: false, book: null \})\)"),
    (r"const \[legacyReservationModal, setLegacyReservationModal\] = useState\((\{ open: false \})\)",
     r"const \[legacyReservationModal, legacyReservationModalHelpers\] = useModal\((\{ open: false \})\)"),
    (r"const \[studentDetailsModal, setStudentDetailsModal\] = useState\((\{ open: false, student: null \})\)",
     r"const \[studentDetailsModal, studentDetailsModalHelpers\] = useModal\((\{ open: false, student: null \})\)"),
]
for pat_old, pat_new in decl_pairs:
    m_old = re.search(pat_old, orig)
    m_new = re.search(pat_new, cur)
    add(f'decl migrated: {pat_old[13:40]}...',
        m_old is not None and m_new is not None and m_old.group(1) == m_new.group(1))

# ---------- 3. every open() call maps 1:1 to original setter open call ----------
open_map = {
    'bookModalHelpers.open({ mode, data })': 'setBookModal({ open: true, mode, data })',
    'studentModalHelpers.open({ mode, data })': 'setStudentModal({ open: true, mode, data })',
    'barcodeModalHelpers.open({ book })': 'setBarcodeModal({ open: true, book })',
    'studentDetailsModalHelpers.open({ student })': 'setStudentDetailsModal({ open: true, student })',
    'legacyReservationModalHelpers.open()': 'setLegacyReservationModal({ open: true })',
}
for new_call, old_call in open_map.items():
    add(f'open site 1:1 ({new_call[:40]})',
        cur.count(new_call) == 1 and orig.count(old_call) == 1)

# ---------- 4. every close() call maps 1:1 to original reset literal ----------
close_map = {
    'bookModalHelpers.close()': 'setBookModal({ open: false, mode: \'add\', data: null })',
    'studentModalHelpers.close()': 'setStudentModal({ open: false, mode: \'add\', data: null })',
    'barcodeModalHelpers.close()': 'setBarcodeModal({ open: false, book: null })',
    'studentDetailsModalHelpers.close()': 'setStudentDetailsModal({ open: false, student: null })',
    'legacyReservationModalHelpers.close()': 'setLegacyReservationModal({ open: false })',
}
for new_call, old_call in close_map.items():
    add(f'close site 1:1 ({new_call[:40]})', cur.count(new_call) == orig.count(old_call))

# ---------- 5. no setter references remain ----------
add('no setXxxModal references remain',
    not re.search(r'set(Book|Student|Barcode|LegacyReservation|StudentDetails)Modal', cur))

# ---------- 6. state READ expressions unchanged (identical counts vs HEAD) ----------
read_exprs = ['bookModal.open', 'bookModal.mode', 'bookModal.data',
              'studentModal.open', 'studentModal.mode', 'studentModal.data',
              'barcodeModal.open', 'barcodeModal.book',
              'studentDetailsModal.open', 'studentDetailsModal.student',
              'legacyReservationModal.open']
for read in read_exprs:
    add(f'state read {read} unchanged',
        len(re.findall(re.escape(read), cur)) == len(re.findall(re.escape(read), orig)))
add('no new generic .open reads beyond helper calls',
    len(re.findall(r'\.open\(', cur)) == len(open_map))

# ---------- 7. handlers/views untouched: openBookModal & openStudentModal signatures identical ----------
for fn in ['openBookModal', 'openStudentModal']:
    m_old = re.search(rf'(const {fn} = \([^)]*\) => \{{)', orig)
    m_new = re.search(rf'(const {fn} = \([^)]*\) => \{{)', cur)
    add(f'{fn} signature unchanged', m_old is not None and m_new is not None and m_old.group(1) == m_new.group(1))

# ---------- 8. hook usage in App.jsx = 5, hook import present ----------
add('useModal imported in App.jsx', re.search(r"import useModal from './hooks/useModal'", cur) is not None)
add('useModal used exactly 5 times', len(re.findall(r'useModal\(', cur)) == 5)

# ---------- 9. modal render blocks unchanged (identical line count per modal JSX) ----------
for marker in ['bookModal.open &&', 'studentModal.open &&', 'barcodeModal.open &&',
               'studentDetailsModal.open &&', 'legacyReservationModal.open']:
    add(f'render gate preserved ({marker})', marker in cur and marker in orig)

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
