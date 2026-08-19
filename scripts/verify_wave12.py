import io, subprocess, sys

APP = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
FIND_RES = io.open(r'pos-frontend/src/features/reservations/findReservationsBySearch.js', encoding='utf-8').read()
USE_CART = io.open(r'pos-frontend/src/hooks/useCart.js', encoding='utf-8').read()
CART_LIB = io.open(r'pos-frontend/src/lib/cart.js', encoding='utf-8').read()
CHECKOUT_SVC = io.open(r'pos-frontend/src/modules/checkout/checkoutService.js', encoding='utf-8').read()
COREDATA = io.open(r'pos-frontend/src/modules/catalog/coreDataService.js', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. Reservation ownership map — existing modules intact ----------
add('findReservationsBySearch.js exists with search fn', 'findReservationsBySearch' in FIND_RES)
add('findReservationsBySearch has ranking logic', 'const rank' in FIND_RES)
add('useCart.js has computeReservationOutstanding', 'computeReservationOutstanding' in USE_CART)
add('lib/cart.js has clampDeposit', 'clampDeposit' in CART_LIB)
add('lib/cart.js has getDefaultReservationDeposit', 'getDefaultReservationDeposit' in CART_LIB)
add('checkoutService.js has buildReservationRecords', 'buildReservationRecords' in CHECKOUT_SVC)
add('checkoutService.js has buildServerReservationPayloads', 'buildServerReservationPayloads' in CHECKOUT_SVC)
add('coreDataService.js has buildPendingReservations', 'buildPendingReservations' in COREDATA)

# ---------- 2. Known duplication documented (OFF-LIMITS — not extracted) ----------
# The pickup item-building logic is byte-identical in two App.jsx locations:
#   - ReservationsView onComplete (approx lines 1504-1520)
#   - StudentDetailsModal onPickup (approx lines 2177-2193)
# Both build: items = reservations.map(r => { book, qty, pricePerUnit, fullPrice, deposit, remaining, lineTotal })
#             subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
# Per task warning: DO NOT merge pickup implementations. DO NOT change behavior.
# This is documented here and deliberately NOT extracted.
PICKUP_ITEM_BUILD = "pricePerUnit = book ? book.sellingPrice || 0 : 0"
PICKUP_REMAINING = 'const remaining = Math.max(fullPrice - deposit, 0)'
add('pickup item-building duplication exists in App.jsx (documented)',
    APP.count(PICKUP_ITEM_BUILD) == 2 and APP.count(PICKUP_REMAINING) == 2)
add('pickup item-building NOT extracted (still inline in both places)',
    APP.count(PICKUP_ITEM_BUILD) == 2)

# ---------- 3. No new reservation service created (extraction not justified) ----------
import os
svc_path = r'pos-frontend/src/modules/reservations/reservationService.js'
add('no reservationService.js created (audit found no safe candidates)', not os.path.exists(svc_path))

# ---------- 4. App.jsx reservation logic remains state-coupled (correct) ----------
add('pendingReservationMap still in App.jsx (state-coupled)', 'pendingReservationMap' in APP)
add('hasPendingReservation still in App.jsx (state-coupled)', 'hasPendingReservation' in APP)
add('App.jsx still owns reservation orchestration', 'setPendingReservations' in APP)

# ---------- 5. No API / queue / sync changes ----------
# /transactions lives in checkoutController; /reservations & /students in checkoutService/coreData
CHECKOUT_CTRL = io.open(r'pos-frontend/src/modules/checkout/checkoutController.js', encoding='utf-8').read()
for route in ['/reservations', '/transactions', '/students']:
    add(f'API route {route} preserved',
        route in CHECKOUT_SVC or route in COREDATA or route in CHECKOUT_CTRL)
for qop in ['reservation_create', 'reservation_cancel', 'student_balance_set', 'transaction_create']:
    add(f'queue op {qop} preserved',
        f"type: '{qop}'" in APP or f"type: '{qop}'" in CHECKOUT_SVC or f"type: '{qop}'" in CHECKOUT_CTRL)

# ---------- 6. Previous waves regression ----------
w10 = subprocess.run(['python', 'scripts/verify_wave10.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave10.py passes', w10.returncode == 0, w10.stdout.strip()[-60:])
w101 = subprocess.run(['python', 'scripts/verify_wave10_1.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave10_1.py passes', w101.returncode == 0, w101.stdout.strip()[-60:])
w11 = subprocess.run(['python', 'scripts/verify_wave11.py'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('verify_wave11.py passes', w11.returncode == 0, w11.stdout.strip()[-60:])

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
