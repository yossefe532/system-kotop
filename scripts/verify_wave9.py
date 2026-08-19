import io, re, subprocess, sys

APP = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
HOOK = io.open(r'pos-frontend/src/hooks/useCart.js', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

def stripped(src):
    return [l.strip() for l in src.splitlines() if l.strip() and not l.strip().startswith('//')]

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

# ---------- 1. hook exists, exports, pure ----------
add('useCart.js created', 'export default function useCart' in HOOK)
add('pure computeCartDetails exported', 'export function computeCartDetails' in HOOK)
add('pure computeReservationOutstanding exported', 'export function computeReservationOutstanding' in HOOK)
add('hook owns cart state via useState', 'useState' in HOOK and 'const [cartItems, setCartItems] = useState(initialCartItems)' in HOOK)
add('hook uses useMemo', 'useMemo' in HOOK)
add('hook imports lib/cart helpers', "import { cartKey, clampDeposit, getDefaultReservationDeposit } from '../lib/cart.js'" in HOOK)
add('hook has no API calls', all(x not in HOOK for x in ['fetch(', 'axios', 'apiRequest', 'apiBaseUrl']))
add('hook has no storage', all(x not in HOOK for x in ['localStorage', 'indexedDb', 'loadOfflineBootstrap', 'setOfflineSnapshot']))
add('hook has no sync', all(x not in HOOK for x in ['enqueueOperation', 'persistQueueState', 'processSyncQueue', 'replay']))
add('hook has no receipt logic', all(x not in HOOK for x in ['archiveAndPrintReceipt', 'receiptPayload', 'buildReceiptText']))
add('hook has no checkout', 'handleCompleteSale' not in HOOK)
add('hook has no accounting', all(x not in HOOK for x in ['setFinanceReport', 'refreshAccountingSnapshot', 'createSupplyRecord', 'setSupplies']))
add('hook has no reservation/student state', all(x not in HOOK for x in ['setPendingReservations', 'setStudents', 'setBooks', 'selectedStudent']))

# ---------- 2. cart algorithms byte-identical (verbatim blocks) ----------
REF_CART_DETAILS = '''const items = cartItems
      .map((entry) => {
        const book = books.find((item) => item.id === entry.bookId)
        if (!book) return null
        let lineUnit = book.sellingPrice
        if (entry.type === 'reservation') {
           lineUnit = clampDeposit(entry.deposit)
        } else if (entry.linkedReservation) {
           const deposit = entry.linkedReservation?.deposit || 0
           lineUnit = Math.max(book.sellingPrice - deposit, 0)
        }
        const pendingArrival = entry.type === 'reservation' && Boolean(book.isArriving)
        return {
          ...book,
          lineKey: entry.key,
          qty: entry.qty,
          type: entry.type,
          deposit: clampDeposit(entry.deposit),
          isZeroReservation: Boolean(entry.isZeroReservation),
          lineTotal: entry.qty * lineUnit,
          pendingArrival,
          linkedReservation: entry.linkedReservation
        }
      })
      .filter(Boolean)
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
    const safeDiscount = Number.isNaN(Number(discount)) ? 0 : Number(discount)
    const total = Math.max(subtotal - safeDiscount, 0)
    return { items, subtotal, total, safeDiscount }'''
add('cartDetails computation byte-identical', is_subsequence(stripped(REF_CART_DETAILS), HOOK))

REF_OUTSTANDING = '''.filter((item) => item.type === 'reservation')
      .reduce((sum, item) => sum + Math.max((Number(item.sellingPrice) || 0) * item.qty - (Number(item.deposit) || 0), 0), 0)'''
add('reservationOutstanding computation byte-identical', is_subsequence(stripped(REF_OUTSTANDING), HOOK))

REF_ADDLINE = '''const addCartLine = (bookId, type, options) => {
    const key = cartKey(bookId, type)
    setCartItems((prev) => {
      const existing = prev.find((item) => item.key === key)
      if (existing) {
        return prev.map((item) => (item.key === key ? { ...item, qty: item.qty + 1 } : item))
      }
      return [
        ...prev,
        {
          key,
          bookId,
          qty: 1,
          type,
          deposit: Number(options?.deposit) || 0,
          isZeroReservation: Boolean(options?.isZeroReservation),
          linkedReservation: options?.linkedReservation || null,
        },
      ]
    })
  }'''
add('addCartLine byte-identical', is_subsequence(stripped(REF_ADDLINE), HOOK))

REF_QTY = '''const updateCartQty = (key, delta) => {
    setCartItems((prev) => {
      const updated = prev
        .map((item) => (item.key === key ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
      return updated
    })
  }'''
add('updateCartQty byte-identical', is_subsequence(stripped(REF_QTY), HOOK))

REF_TYPE = '''const updateCartType = (key, nextType) => {
    setCartItems((prev) => {
      const item = prev.find((i) => i.key === key)
      if (!item) return prev
      const book = books.find((b) => b.id === item.bookId)
      const safeType = nextType === 'sale' && book?.isArriving ? 'reservation' : nextType
      const nextKey = cartKey(item.bookId, safeType)
      if (nextKey === item.key) return prev
      const existing = prev.find((i) => i.key === nextKey)
      const nextItem = {
        ...item,
        type: safeType,
        key: nextKey,
        linkedReservation: safeType === 'reservation' ? null : item.linkedReservation,
        deposit: safeType === 'reservation' ? (item.deposit || getDefaultReservationDeposit(book)) : item.deposit,
        isZeroReservation: safeType === 'reservation' ? Boolean(item.isZeroReservation) : false,
      }
      if (!existing) {
        return prev.map((i) => (i.key === item.key ? nextItem : i))
      }
      return prev
        .filter((i) => i.key !== item.key)
        .map((i) => (i.key === existing.key ? { ...i, qty: i.qty + item.qty } : i))
    })
  }'''
add('updateCartType byte-identical', is_subsequence(stripped(REF_TYPE), HOOK))

REF_DEPOSIT = '''const updateCartDeposit = (key, deposit) => {
    setCartItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, deposit, isZeroReservation: Number(deposit) === 0 } : item)),
    )
  }'''
add('updateCartDeposit byte-identical', is_subsequence(stripped(REF_DEPOSIT), HOOK))

# ---------- 3. memos/deps preserved ----------
add('cartDetails deps identical', ', [cartItems, books, discount]' in HOOK)
add('reservationOutstanding deps identical', '[cartDetails.items]' in HOOK)
add('clearCart provided', 'const clearCart = () => setCartItems([])' in HOOK)

# ---------- 4. App.jsx wiring ----------
add('App imports useCart', "import useCart from './hooks/useCart'" in APP)
add('initialCartItems normalization kept in App (storage concern)',
    'const initialCartItems = useMemo(() => {' in APP
    and "if (!Array.isArray(storedSnapshot?.cartItems)) return []" in APP
    and 'key: cartKey(bookId, type),' in APP and '}, [])' in APP)
for name in ['cartItems', 'setCartItems', 'cartDetails', 'reservationOutstandingTotal', 'addCartLine',
             'updateCartQty', 'updateCartType', 'updateCartDeposit', 'clearCart']:
    add(f'App destructures {name}', name in APP)
add('hook call wired with books/discount/initialCartItems',
    'useCart({ books, discount, initialCartItems })' in APP)
for pat in ['const cartDetails = useMemo', 'const reservationOutstandingTotal = useMemo',
            'const addCartLine = (bookId, type, options) => {', 'const updateCartQty = (key, delta) => {',
            'const updateCartType = (key, nextType) => {', 'const updateCartDeposit = (key, deposit) => {']:
    add(f'App no longer defines: {pat[6:30]}', pat not in APP)
add('no setCartItems([]) left in App', 'setCartItems([])' not in APP)
add('clearCart used at both clear sites', APP.count('clearCart()') == 2)
add('offline hydration setter preserved', 'if (Array.isArray(snapshot.cartItems)) setCartItems(snapshot.cartItems)' in APP)

# ---------- 5. orchestrator/checkout/API/sync/receipt stay in App.jsx ----------
add('addToCart orchestrator stays in App', 'const addToCart = (book) => {' in APP
    and 'hasPendingReservation(selectedStudent.id, book.id)' in APP)
add('checkout still in App', 'const handleCompleteSale' in APP and 'archiveAndPrintReceipt' in APP)
add('API still in App', 'createApiRequest' in APP and 'login(' in APP and 'apiRequest' in APP)
add('sync still in App', 'enqueueOperation' in APP and 'processSyncQueue' in APP and 'persistQueueState' in APP)
add('accounting still in App', 'refreshAccountingSnapshot' in APP and 'createSupplyRecord' in APP)
add('receipt still in App', 'receiptPayload' in APP and 'buildReceiptText' in APP)
add('reservation state still in App', 'const [pendingReservations, setPendingReservations] = useState' in APP)

# ---------- 6. live parity harness ----------
parity = subprocess.run(['node', 'scripts/parity_wave9.mjs'], capture_output=True, text=True, encoding='utf-8', cwd=r'.')
add('parity harness ran', parity.returncode == 0, parity.stdout.strip()[-200:])
add('parity harness zero failures', 'PARITY OK' in parity.stdout)

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
