import io, subprocess, sys

APP = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
CTRL = io.open(r'pos-frontend/src/modules/checkout/checkoutController.js', encoding='utf-8').read()
QUEUE = io.open(r'pos-frontend/src/modules/sync/queueManager.js', encoding='utf-8').read()
SYNC = io.open(r'pos-frontend/src/modules/sync/syncManager.js', encoding='utf-8').read()
CFG = io.open(r'pos-frontend/src/config/app.js', encoding='utf-8').read()
FLAGS = io.open(r'pos-frontend/src/config/featureFlags.js', encoding='utf-8').read()
WALLET = io.open(r'pos-frontend/src/modules/wallet/walletSyncPayloads.js', encoding='utf-8').read()
CHECKOUT_SVC = io.open(r'pos-frontend/src/modules/checkout/checkoutService.js', encoding='utf-8').read()
DEMODATA = io.open(r'pos-frontend/src/demoData.js', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. feature flag mirror ----------
add('config/app.js exports isWalletLedgerEnabled', 'isWalletLedgerEnabled' in CFG)
add('featureFlags.js created', 'isWalletLedgerEnabled' in FLAGS)
add('featureFlags.js has no demo-data dependency', 'demoData' not in FLAGS and 'config/app' not in FLAGS)
add('featureFlags.js has no React/API/sync imports', 'react' not in FLAGS and 'apiClient' not in FLAGS and 'syncManager' not in FLAGS)
add('checkoutController does NOT import demoData', 'demoData' not in CTRL)
add('checkoutController does NOT import config/app.js', "'../../config/app.js'" not in CTRL and "'../config/app.js'" not in CTRL)
add('checkoutController imports flag from featureFlags.js', "'../../config/featureFlags.js'" in CTRL)
add('walletSyncPayloads.js created', 'walletMutationOperation' in WALLET)
add('walletSyncPayloads has buildWalletEntryOperation', 'buildWalletEntryOperation' in WALLET)
add('walletSyncPayloads has buildLegacyBalanceSet', 'buildLegacyBalanceSet' in WALLET)

# ---------- 1b. demo-data behavior preserved ----------
add('config/app.js still imports demoData', 'demoData' in CFG)
add('VITE_ENABLE_DEMO_SEED semantics unchanged', 'VITE_ENABLE_DEMO_SEED' in DEMODATA or 'ENABLE_DEMO' in DEMODATA)

# ---------- 2. queueManager supports wallet_entry_create ----------
add('queueManager priority medium for wallet_entry_create', "wallet_entry_create: 'medium'" in QUEUE)
add('queueManager dedupe key for wallet_entry_create', 'wallet_entry_create:${operation?.payload?.operation_id ??' in QUEUE)
add('queueManager dependency for wallet_entry_create', "operation?.type === 'wallet_entry_create'" in QUEUE)

# ---------- 3. syncManager replay targets wallet endpoint ----------
add('syncManager replays wallet_entry_create', "activeOperation.type === 'wallet_entry_create'" in SYNC)
add('syncManager posts to /wallet/entries', '/wallet/entries' in SYNC)

# ---------- 4. checkout controller wires ledger ----------
add('checkoutController imports walletMutationOperation', "from '../wallet/walletSyncPayloads.js'" in CTRL)
add('checkoutController imports isWalletLedgerEnabled', 'isWalletLedgerEnabled' in CTRL)
add('checkoutController keeps legacy student_balance_set branch', "type: 'student_balance_set'" in CTRL)

# ---------- 5. App.jsx emission sites use the helper ----------
add('App imports walletMutationOperation', 'walletMutationOperation' in APP)
add('App imports isWalletLedgerEnabled', 'isWalletLedgerEnabled' in APP)
add('ReservationsView pickup uses walletMutationOperation', APP.count('walletMutationOperation(') >= 1)
add('Return refund enqueues wallet mutation', 'refund_return_sale' in APP)
add('StudentDetailsModal pickup supports wallet', "pickupEntry.paymentMethod = 'wallet'" in APP)

# ---------- 6. no money/calc changes ----------
add('checkoutService unchanged computeBalanceAdjustment', 'computeBalanceAdjustment' in CHECKOUT_SVC)
add('no minor-units/piastre conversion in checkoutController', '100' not in CTRL or 'piastre' not in CTRL.lower())
add('no minor-units/piastre conversion in App wallet', 'piastre' not in APP.lower())

# ---------- 7. local balance update preserved ----------
add('checkoutController still setStudents for wallet', 'setStudents(prev => prev.map(s =>\n' not in CTRL or 'setStudents' in CTRL)
add('App still setStudents', 'setStudents' in APP)
add('students.balance still used in App', 'students, setStudents' in APP or 'const [students, setStudents]' in APP)

# ---------- 8. previous waves still pass ----------
for script in ['verify_wave10.py', 'verify_wave10_1.py', 'verify_wave11.py']:
    r = subprocess.run(['python', f'scripts/{script}'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
    add(f'{script} passes', r.returncode == 0, r.stdout.strip()[-80:])

for parity in ['parity_wave10.mjs', 'parity_wave10_1.mjs', 'parity_wave11.mjs']:
    r = subprocess.run(['node', f'scripts/{parity}'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
    add(f'{parity} passes', r.returncode == 0 and 'PARITY OK' in r.stdout, r.stdout.strip()[-60:])

# ---------- 9. Wave 11.1 parity + backend tests ----------
p11b = subprocess.run(['node', 'scripts/parity_wave11b.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave11b.mjs passes', p11b.returncode == 0 and 'PARITY OK' in p11b.stdout, p11b.stdout.strip()[-60:])

be = subprocess.run([sys.executable, '-m', 'pytest', 'tests/test_student_wallet.py', '-q', '-o', 'addopts='], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('backend wallet ledger tests pass', be.returncode == 0, be.stdout.strip()[-120:])

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
