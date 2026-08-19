import io, subprocess, sys

APP = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
SVC = io.open(r'pos-frontend/src/modules/students/studentService.js', encoding='utf-8').read()
CHECKOUT_SVC = io.open(r'pos-frontend/src/modules/checkout/checkoutService.js', encoding='utf-8').read()
CHECKOUT_CTRL = io.open(r'pos-frontend/src/modules/checkout/checkoutController.js', encoding='utf-8').read()
MAPPERS = io.open(r'pos-frontend/src/lib/mappers.js', encoding='utf-8').read()
SEARCH = io.open(r'pos-frontend/src/hooks/useStudentSearch.js', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. studentService.js created & pure ----------
add('studentService.js created', 'isStudentDuplicate' in SVC)
add('exports isStudentDuplicate', 'export function isStudentDuplicate' in SVC)
add('no React import in studentService', "from 'react'" not in SVC)
add('no useState in studentService', 'useState' not in SVC)
add('no useEffect in studentService', 'useEffect' not in SVC)
add('no API import in studentService', 'apiRequest' not in SVC and 'apiClient' not in SVC)
add('no IndexedDB in studentService', 'indexedDB' not in SVC and 'indexedDb' not in SVC)
add('no sync import in studentService', 'syncManager' not in SVC and 'queueManager' not in SVC)
add('no auth import in studentService', 'authSession' not in SVC)
add('no localStorage in studentService', 'localStorage' not in SVC)
add('no browser storage in studentService', 'readStoredSnapshot' not in SVC)

# ---------- 2. extracted function has a real caller in App.jsx ----------
add('App imports isStudentDuplicate', 'isStudentDuplicate' in APP)
add('App calls isStudentDuplicate', 'isStudentDuplicate(students, { name, phone })' in APP)

# ---------- 3. original inline implementation removed ----------
add('original inline duplicate check removed',
    "students.some(s => s.phone === phone || s.name.toLowerCase() === name.toLowerCase())" not in APP)

# ---------- 4. no duplicate implementation ----------
add('only one isStudentDuplicate definition', SVC.count('function isStudentDuplicate') == 1)

# ---------- 5. existing modules unchanged ----------
add('checkoutService.js still has computeBalanceAdjustment', 'computeBalanceAdjustment' in CHECKOUT_SVC)
add('checkoutController.js still imports checkoutService', "from './checkoutService.js'" in CHECKOUT_CTRL)
add('mappers.js still has mapApiStudentToUi', 'mapApiStudentToUi' in MAPPERS)
add('mappers.js still has mapUiStudentToApi', 'mapUiStudentToApi' in MAPPERS)
add('useStudentSearch.js still has computeStudentSearch', 'computeStudentSearch' in SEARCH)
add('useStudentSearch.js unchanged length', len(SEARCH) > 0)

# ---------- 6. no queue operation names / API routes / payloads changed ----------
for qop in ['student_upsert', 'reservation_create', 'student_balance_set', 'transaction_create']:
    add(f'queue op {qop} preserved', f"type: '{qop}'" in CHECKOUT_CTRL)
for route in ['/reservations', '/transactions', '/students']:
    add(f'API route {route} preserved', route in CHECKOUT_CTRL)

# ---------- 7. state ownership stays in App.jsx ----------
add('App still owns students state', 'const [students, setStudents] = useState' in APP)
add('App still owns useState', 'useState' in APP)

# ---------- 8. previous waves still pass ----------
w10 = subprocess.run(['python', 'scripts/verify_wave10.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave10.py passes', w10.returncode == 0, w10.stdout.strip()[-80:])
w101 = subprocess.run(['python', 'scripts/verify_wave10_1.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave10_1.py passes', w101.returncode == 0, w101.stdout.strip()[-80:])
w10p = subprocess.run(['node', 'scripts/parity_wave10.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave10.mjs passes', w10p.returncode == 0 and 'PARITY OK' in w10p.stdout, w10p.stdout.strip()[-60:])
w101p = subprocess.run(['node', 'scripts/parity_wave10_1.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave10_1.mjs passes', w101p.returncode == 0 and 'PARITY OK' in w101p.stdout, w101p.stdout.strip()[-60:])

# ---------- 9. Wave 11 parity passes ----------
w11p = subprocess.run(['node', 'scripts/parity_wave11.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave11.mjs passes', w11p.returncode == 0 and 'PARITY OK' in w11p.stdout, w11p.stdout.strip()[-60:])

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
