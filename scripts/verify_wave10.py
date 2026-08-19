import io, re, subprocess, sys

APP = io.open(r"pos-frontend/src/App.jsx", encoding="utf-8").read()
SVC = io.open(r"pos-frontend/src/modules/checkout/checkoutService.js", encoding="utf-8").read()

checks = []

def add(name, ok, detail=""):
    checks.append((name, ok, detail))

def stripped(src):
    return [l.strip() for l in src.splitlines() if l.strip() and not l.strip().startswith("//")]

def is_subsequence(lines, hay):
    hay_lines = stripped(hay)
    it = iter(hay_lines)
    try:
        for line in lines:
            while next(it) != line:
                pass
    except StopIteration:
        return False
    return True

# ---------- 1. service file created & exports ----------
add("checkoutService.js created", "buildSaleEntry" in SVC)
add("exports deriveReceiptType", "export function deriveReceiptType" in SVC)
add("exports computeCostTotal", "export function computeCostTotal" in SVC)
add("exports computeNetProfit", "export function computeNetProfit" in SVC)
add("exports buildSaleEntry", "export function buildSaleEntry" in SVC)
add("exports buildReservationRecords", "export function buildReservationRecords" in SVC)
add("exports buildServerReservationPayloads", "export function buildServerReservationPayloads" in SVC)
add("exports buildServerTransactionPayload", "export function buildServerTransactionPayload" in SVC)
add("exports buildSyncTransactionPayload", "export function buildSyncTransactionPayload" in SVC)
add("exports computeBalanceAdjustment", "export function computeBalanceAdjustment" in SVC)
add("exports buildStockDeductionItems", "export function buildStockDeductionItems" in SVC)
add("exports computeNextStock", "export function computeNextStock" in SVC)

# ---------- 2. service is pure (no React / side effects) ----------
def code_only(src):
    return '\n'.join(l for l in src.splitlines() if not l.strip().startswith('//'))
SVC_CODE = code_only(SVC)

add("no React import in service", "from 'react'" not in SVC)
add("no useState in service", 'useState' not in SVC)
add("no useEffect in service", 'useEffect' not in SVC)
add("no useMemo in service", 'useMemo' not in SVC)
add("no useCart in service", 'useCart' not in SVC)
add("no apiRequest in service", 'apiRequest' not in SVC and 'fetch(' not in SVC)
add("no enqueueSync in service", 'enqueueSync' not in SVC_CODE and 'enqueueOperation' not in SVC_CODE)
add("no setStudents in service", 'setStudents' not in SVC)
add("no setBooks in service", 'setBooks' not in SVC)
add("no setWalletLog in service", 'setWalletLog' not in SVC)
add("no localStorage in service", 'localStorage' not in SVC_CODE)
add("no indexedDb in service", 'indexedDb' not in SVC and 'indexedDB' not in SVC)
add("no alert in service", 'alert(' not in SVC)
add("no navigate in service", 'navigate(' not in SVC and 'setActiveView' not in SVC)
add("no auth in service", 'authSession' not in SVC and 'login' not in SVC and 'logout' not in SVC)
add("no Date.now in service", 'Date.now' not in SVC)
add("no new Date() in service", 'new Date(' not in SVC)

# ---------- 3. byte-identical verbatim blocks moved to service ----------
REF_SALE_ENTRY_DATE = "date: now.toISOString(),"
add("saleEntry uses now dependency", REF_SALE_ENTRY_DATE in SVC)
REF_RESERVATION_DATE = "date: now.toISOString(),"
add("reservationRecords uses now dependency", REF_RESERVATION_DATE in SVC)
add('receiptType logic verbatim', "allReservation ? 'reservation' : hasReservation ? 'sale' : 'sale'" in SVC)
REF_BALANCE_DEBT = "if (paidAmount !== '' && paid < totalDue) {"
add("balance debt branch verbatim", REF_BALANCE_DEBT in SVC)
REF_BALANCE_CHANGE = "else if (paidAmount !== '' && paid > totalDue) {"
add("balance change branch verbatim", REF_BALANCE_CHANGE in SVC)
REF_BALANCE_WALLET = "if (paymentMethod === 'wallet' && studentForSale.balance >= totalDue) {"
add("balance wallet branch verbatim", REF_BALANCE_WALLET in SVC)
REF_NEXT_STOCK = "return Math.max((book.stock || 0) - item.qty, 0)"
add("nextStock logic verbatim", REF_NEXT_STOCK in SVC)
REF_SERVER_TX_RESERVATION_ID = "reservation_id: item.linkedReservation?.id != null ? Number(item.linkedReservation.id) : null,"
add("server tx payload reservation_id verbatim", REF_SERVER_TX_RESERVATION_ID in SVC)
REF_LINKED_GUARD = "...soldItems.filter((item) => !item.linkedReservation),"
add("linked reservation stock guard verbatim", REF_LINKED_GUARD in SVC)

def ref_block(name, blk_lines):
    return is_subsequence([l.strip() for l in blk_lines], SVC)
BLK_COSTTOTAL_LOGIC_VERBATIM = ['return cartDetails.items.reduce((sum, item) => {', "      if (item.type === 'reservation') return sum", '      return sum + item.costPrice * item.qty', '    }, 0)']
add("costTotal logic verbatim", ref_block("costTotal logic verbatim", BLK_COSTTOTAL_LOGIC_VERBATIM))
BLK_SYNC_TX_PAYLOAD_CAMELCASE_FIELDS_VERBATIM = ['bookId: item.id,', '      qty: item.qty,', '      reservationId: item.linkedReservation?.id || null,']
add("sync tx payload camelCase fields verbatim", ref_block("sync tx payload camelCase fields verbatim", BLK_SYNC_TX_PAYLOAD_CAMELCASE_FIELDS_VERBATIM))

# ---------- 4. original pure blocks REMOVED from App.jsx ----------
add("App no longer has inline costTotal reduce", "return sum + item.costPrice * item.qty" not in APP)
add("App no longer has inline receiptType ternary", "const receiptType = allReservation" not in APP)
add("App no longer has inline saleEntry object", "const saleEntry = {" not in APP)
add("App no longer has inline newReservations map", "const newReservations = cartDetails.items" not in APP)
add("App no longer has inline server reservation payload", "const reservationItems = cartDetails.items.filter((item) => item.type === 'reservation')" not in APP)
add("App no longer has inline server tx payload", "const saleItems = cartDetails.items" not in APP)
add("App no longer has inline sync tx payload", "const saleItemsForSync = cartDetails.items" not in APP)
add("App no longer has inline stockDeductItems", "const stockDeductItems = [" not in APP)
add("App no longer has inline nextStock Math.max", "const nextStock = Math.max((book.stock || 0) - item.qty, 0)" not in APP)
add("App no longer has inline debt branch", "const debt = totalDue - paid" not in APP)
add("App no longer has inline wallet branch", "nextBalance -= totalDue" not in APP)

# ---------- 5. App.jsx wiring: delegates to controller ----------
# Wave 10.1 moves orchestration into checkoutController.js. App.jsx now
# imports the controller factory and delegates handleCompleteSale to it.
# The service functions are reused by the controller (verified in section 8).
add("App imports createCheckoutController", "createCheckoutController" in APP)
add("App no longer imports buildSaleEntry directly", "buildSaleEntry" not in APP)
add("App no longer imports computeNextStock directly", "computeNextStock" not in APP)
add("App delegates handleCompleteSale to controller", "checkoutController.completeSale()" in APP)

# ---------- 6. orchestration moved to controller ----------
# The controller (not App.jsx) now owns the service calls, API calls,
# setters, auth handling, and committedToServer flag.
SVC = io.open(r"pos-frontend/src/modules/checkout/checkoutController.js", encoding="utf-8").read()
add("controller imports buildSaleEntry", "buildSaleEntry" in SVC)
add("controller imports buildReservationRecords", "buildReservationRecords" in SVC)
add("controller imports buildServerReservationPayloads", "buildServerReservationPayloads" in SVC)
add("controller imports buildServerTransactionPayload", "buildServerTransactionPayload" in SVC)
add("controller imports buildSyncTransactionPayload", "buildSyncTransactionPayload" in SVC)
add("controller imports computeBalanceAdjustment", "computeBalanceAdjustment" in SVC)
add("controller imports buildStockDeductionItems", "buildStockDeductionItems" in SVC)
add("controller imports computeNextStock", "computeNextStock" in SVC)
add("controller calls buildSaleEntry", "buildSaleEntry({" in SVC)
add("controller calls buildReservationRecords", "buildReservationRecords({" in SVC)
add("controller calls buildServerReservationPayloads", "buildServerReservationPayloads({" in SVC)
add("controller calls buildServerTransactionPayload", "buildServerTransactionPayload({" in SVC)
add("controller calls buildSyncTransactionPayload", "buildSyncTransactionPayload({" in SVC)
add("controller calls computeBalanceAdjustment", "computeBalanceAdjustment({" in SVC)
add("controller calls buildStockDeductionItems", "buildStockDeductionItems({ items: cartDetails.items })" in SVC)
add("controller calls computeNextStock", "computeNextStock({ book, item })" in SVC)
add("API in controller", "await apiRequest('/reservations'" in SVC and "await apiRequest('/transactions'" in SVC)
add("enqueueSync in controller", 'enqueueSync({' in SVC)
add("setStudents in controller", 'setStudents(' in SVC)
add("setBooks in controller", 'setBooks(' in SVC)
add("setWalletLog in controller", 'setWalletLog(' in SVC)
add("setSalesHistory in controller", 'setSalesHistory(' in SVC)
add("setPendingReservations in controller", 'setPendingReservations(' in SVC)
add("setTransactionCounter in controller", 'setTransactionCounter(' in SVC)
add("setLastTransaction in controller", 'setLastTransaction(' in SVC)
add("auth handling in controller", 'isAuthError(' in SVC and 'handleSessionExpired' in SVC)
add("online/offline branching in controller", 'if (useBackend)' in SVC)
add("reset block in controller", "setActiveView('receipt')" in SVC)
add("committedToServer flag in controller", 'committedToServer' in SVC)
add("formatTransactionId in controller", 'formatTransactionId' in SVC)
add("Date.now in controller (wallet log id)", 'Date.now()' in SVC)

# ---------- 7. live parity harness ----------
parity = subprocess.run(["node", "scripts/parity_wave10.mjs"], capture_output=True, text=True, encoding="utf-8", cwd=r".")
add("parity harness ran", parity.returncode == 0, parity.stdout.strip()[-200:])
add("parity harness zero failures", "PARITY OK" in parity.stdout)

fails = [c for c in checks if not c[1]]
print(f"{len(checks)} checks, {len(fails)} failures")
for name, ok, detail in checks:
    print(("PASS" if ok else "FAIL"), name, detail)
sys.exit(1 if fails else 0)
