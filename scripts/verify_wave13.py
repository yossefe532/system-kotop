import io, os, subprocess, sys

ROOT = r''
APP = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
RECEIPT_LIB = io.open(r'pos-frontend/src/lib/receipt.js', encoding='utf-8').read()
ARCHIVE_SVC = io.open(r'pos-frontend/src/modules/receipt/receiptArchiveService.js', encoding='utf-8').read()
CHECKOUT_SVC = io.open(r'pos-frontend/src/modules/checkout/checkoutService.js', encoding='utf-8').read()
THERMAL = io.open(r'pos-frontend/src/components/ui/ThermalReceipt.jsx', encoding='utf-8').read()
ARCHIVE_VIEW = io.open(r'pos-frontend/src/features/receipts/ReceiptArchiveView.jsx', encoding='utf-8').read()

checks = []
def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. Existing receipt owners intact (do NOT duplicate) ----------
add('lib/receipt.js owns buildReceiptText', 'export const buildReceiptText' in RECEIPT_LIB)
add('lib/receipt.js owns receiptTypeLabels', 'receiptTypeLabels' in RECEIPT_LIB)
add('lib/receipt.js owns paymentMethodLabels', 'paymentMethodLabels' in RECEIPT_LIB)
add('receiptArchiveService owns archiveReceiptPayload', 'archiveReceiptPayload' in ARCHIVE_SVC)
add('receiptArchiveService owns refreshReceiptArchiveItems', 'refreshReceiptArchiveItems' in ARCHIVE_SVC)
add('checkoutService owns deriveReceiptType', 'export function deriveReceiptType' in CHECKOUT_SVC)
add('ThermalReceipt component present (UI owner)', 'export default function ThermalReceipt' in THERMAL)
add('ReceiptArchiveView component present (UI owner)', 'export default function ReceiptArchiveView' in ARCHIVE_VIEW)

# ---------- 2. Receipt-type special case: getReceiptType preserved & distinct ----------
# getReceiptType (App.jsx) must remain its OWN function, NOT merged with deriveReceiptType.
add('getReceiptType still defined in App.jsx (preserved, not merged)',
    'const getReceiptType = (payload) =>' in APP)
add('getReceiptType keeps sale_reservation branch (mixed cart = sale_reservation)',
    "if (hasReservation && hasSale) return 'sale_reservation'" in APP)
add('deriveReceiptType keeps sale-for-mixed branch (NOT merged)',
    "return allReservation ? 'reservation' : hasReservation ? 'sale' : 'sale'" in CHECKOUT_SVC)
add('deriveReceiptType body does NOT emit sale_reservation',
    "return allReservation ? 'reservation' : hasReservation ? 'sale' : 'sale'" in CHECKOUT_SVC
    and "sale_reservation'" not in CHECKOUT_SVC.replace("getReceiptType returns 'sale_reservation' for mixed carts", ''))

# ---------- 3. No forced extraction (audit found no safe candidate) ----------
add('no receiptService.js created', not os.path.exists(r'pos-frontend/src/modules/receipts/receiptService.js'))
add('no receiptService.test.js created', not os.path.exists(r'pos-frontend/src/modules/receipts/receiptService.test.js'))

# ---------- 4. App.jsx receipt logic classified as non-extractable (still present, untouched) ----------
add('receiptPayload useMemo still in App.jsx (state-coupled, left in place)', 'const receiptPayload = useMemo' in APP)
add('archiveAndPrintReceipt still in App.jsx (side-effect orchestration, left in place)', 'const archiveAndPrintReceipt = async' in APP)
add('fullWhatsAppMessage still in App.jsx (WhatsApp presentation, off-limits this wave)', 'const fullWhatsAppMessage = useMemo' in APP)
add('window.print() still in App.jsx (browser API, off-limits)', 'window.print()' in APP)
add('receipt_archive enqueueSync still in App.jsx (sync infra, off-limits)', "type: 'receipt_archive'" in APP)

# ---------- 5. Protected modules still own their receipts pieces (no change) ----------
add('checkoutController not given receipt logic (only nav)', 'setters.setActiveView' in io.open(r'pos-frontend/src/modules/checkout/checkoutController.js', encoding='utf-8').read())
add('useOfflineSnapshot does not import receipt archive logic',
    'receiptArchive' not in io.open(r'pos-frontend/src/hooks/useOfflineSnapshot.js', encoding='utf-8').read())

# ---------- 6. API / sync / offline behavior unchanged ----------
for route in ['/receipt-archive']:
    add(f'API route {route} preserved', route in ARCHIVE_SVC)
for qop in ['receipt_archive']:
    add(f'queue op {qop} preserved', f"type: '{qop}'" in APP)

# ---------- 7. Previous waves regression ----------
w10 = subprocess.run(['python', 'scripts/verify_wave10.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave10.py passes', w10.returncode == 0, w10.stdout.strip()[-60:])
w101 = subprocess.run(['python', 'scripts/verify_wave10_1.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave10_1.py passes', w101.returncode == 0, w101.stdout.strip()[-60:])
w11 = subprocess.run(['python', 'scripts/verify_wave11.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave11.py passes', w11.returncode == 0, w11.stdout.strip()[-60:])
w12 = subprocess.run(['python', 'scripts/verify_wave12.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave12.py passes', w12.returncode == 0, w12.stdout.strip()[-60:])

w10p = subprocess.run(['node', 'scripts/parity_wave10.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave10.mjs passes', w10p.returncode == 0 and 'PARITY OK' in w10p.stdout, w10p.stdout.strip()[-50:])
w101p = subprocess.run(['node', 'scripts/parity_wave10_1.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave10_1.mjs passes', w101p.returncode == 0 and 'PARITY OK' in w101p.stdout, w101p.stdout.strip()[-50:])
w11p = subprocess.run(['node', 'scripts/parity_wave11.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity_wave11.mjs passes', w11p.returncode == 0 and 'PARITY OK' in w11p.stdout, w11p.stdout.strip()[-50:])

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
