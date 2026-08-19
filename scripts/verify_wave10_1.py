import io, re, subprocess, sys

APP = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
CTRL = io.open(r'pos-frontend/src/modules/checkout/checkoutController.js', encoding='utf-8').read()
SVC = io.open(r'pos-frontend/src/modules/checkout/checkoutService.js', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. controller exists & is a factory ----------
add('checkoutController.js created', 'createCheckoutController' in CTRL)
add('controller is a factory function', 'export function createCheckoutController' in CTRL)
add('controller returns completeSale', 'return { completeSale }' in CTRL)

# ---------- 2. controller has no React imports ----------
add('no React import in controller', "from 'react'" not in CTRL)
add('no useState in controller', 'useState' not in CTRL)
add('no useEffect in controller', 'useEffect' not in CTRL)
add('no useMemo in controller', 'useMemo' not in CTRL)
add('no useContext in controller', 'useContext' not in CTRL)
add('no IndexedDB in controller', 'indexedDB' not in CTRL and 'indexedDb' not in CTRL)
add('no localStorage in controller', 'localStorage' not in CTRL)

# ---------- 3. controller reuses checkoutService ----------
add('controller imports from checkoutService', "from './checkoutService.js'" in CTRL)
reused = ['buildSaleEntry', 'buildReservationRecords', 'buildServerReservationPayloads',
          'buildServerTransactionPayload', 'buildSyncTransactionPayload', 'computeBalanceAdjustment',
          'buildStockDeductionItems', 'computeNextStock']
for fn in reused:
    add('controller reuses ' + fn, fn in CTRL)

# ---------- 4. controller accepts DI deps ----------
ctrl_deps = ['apiRequest', 'enqueueSync', 'isAuthError', 'handleSessionExpired', 'fetchCoreSnapshot',
             'clearCart', 'formatTransactionId', 't', 'mapUiStudentToApi', 'mapApiBookToUi',
             'mapApiStudentToUi', 'alert', 'getCheckoutState', 'setters']
for dep in ctrl_deps:
    add('controller receives ' + dep, dep in CTRL)

# ---------- 5. App.jsx wires the controller ----------
add('App imports createCheckoutController', 'createCheckoutController' in APP)
add('App creates controller via useMemo', 'checkoutController = useMemo' in APP)
add('handleCompleteSale delegates to controller', 'checkoutController.completeSale()' in APP)

# ---------- 6. App.jsx no longer contains orchestration ----------
add('App no longer has inline reservation POST loop', "await apiRequest('/reservations'" not in APP)
add('App no longer has inline transaction POST', "await apiRequest('/transactions'" not in APP)
add('App no longer has inline buildSaleEntry call', 'buildSaleEntry({' not in APP)
add('App no longer has inline computeBalanceAdjustment call', 'computeBalanceAdjustment({' not in APP)
add('App no longer has inline buildStockDeductionItems call', 'buildStockDeductionItems({ items: cartDetails.items })' not in APP)
add('App no longer has committedToServer flag', 'committedToServer' not in APP)

# ---------- 7. state ownership stays in App.jsx ----------
add('App still owns useState', 'useState' in APP)
add('App still owns students state', 'const [students, setStudents] = useState' in APP)
add('App still owns books state', 'const [books, setBooks] = useState' in APP)

# ---------- 8. POSView props unchanged ----------
add('POSView still receives handleCompleteSale', 'handleCompleteSale={handleCompleteSale}' in APP)

# ---------- 9. queue operation names preserved in controller ----------
for qop in ['student_upsert', 'reservation_create', 'student_balance_set', 'transaction_create']:
    add('queue op ' + qop + ' preserved', "type: '" + qop + "'" in CTRL)

# ---------- 10. API routes preserved ----------
for route in ['/reservations', '/transactions', '/students']:
    add('API route ' + route + ' preserved', route in CTRL)

# ---------- 11. auth flow preserved ----------
add('isAuthError branch preserved', 'isAuthError(error)' in CTRL)
add('handleSessionExpired preserved', 'handleSessionExpired()' in CTRL)

# ---------- 12. final reset last ----------
add('final reset: setActiveView(receipt) present', "setActiveView('receipt')" in CTRL)

# ---------- 13. archiveAndPrintReceipt stays separate ----------
add('controller does not import receiptArchiveService', 'receiptArchiveService' not in CTRL)

# ---------- 14. Wave 10 verifier still passes ----------
w10 = subprocess.run(['python', 'scripts/verify_wave10.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave10.py passes', w10.returncode == 0, w10.stdout.strip()[-100:])

# ---------- 15. Wave 10 parity still passes ----------
w10p = subprocess.run(['node', 'scripts/parity_wave10.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave10.mjs passes', w10p.returncode == 0 and 'PARITY OK' in w10p.stdout, w10p.stdout.strip()[-100:])

# ---------- 16. Wave 10.1 parity passes ----------
w101p = subprocess.run(['node', 'scripts/parity_wave10_1.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave10_1.mjs passes', w101p.returncode == 0 and 'PARITY OK' in w101p.stdout, w101p.stdout.strip()[-100:])

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
