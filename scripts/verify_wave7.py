import io, re, sys

cur = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()
hook = io.open(r'pos-frontend/src/hooks/useOfflineSnapshot.js', encoding='utf-8').read()

REF_GUARDS = [
    "if (typeof snapshot.useBackend === 'boolean') setUseBackend(snapshot.useBackend)",
    "if (typeof snapshot.activeView === 'string') setActiveView(snapshot.activeView)",
    'if (Array.isArray(snapshot.books)) setBooks(snapshot.books)',
    'if (Array.isArray(snapshot.students)) setStudents(snapshot.students)',
    'if (Array.isArray(snapshot.cartItems)) setCartItems(snapshot.cartItems)',
    "if (typeof snapshot.searchTerm === 'string') setSearchTerm(snapshot.searchTerm)",
    "if (typeof snapshot.selectedStudentId === 'string') setSelectedStudentId(snapshot.selectedStudentId)",
    "if (typeof snapshot.discount === 'number') setDiscount(snapshot.discount)",
    'if (Array.isArray(snapshot.pendingReservations)) setPendingReservations(snapshot.pendingReservations)',
    'if (Array.isArray(snapshot.salesHistory)) setSalesHistory(snapshot.salesHistory)',
    'if (Array.isArray(snapshot.withdrawals)) setWithdrawals(snapshot.withdrawals)',
    'if (Array.isArray(snapshot.auditLog)) setAuditLog(snapshot.auditLog)',
    "if (typeof snapshot.adminUnlocked === 'boolean') setAdminUnlocked(snapshot.adminUnlocked)",
    "if (typeof snapshot.transactionCounter === 'number') setTransactionCounter(snapshot.transactionCounter)",
    'if (snapshot.lastTransaction !== undefined) setLastTransaction(snapshot.lastTransaction)',
    "if (snapshot.quickStudent && typeof snapshot.quickStudent === 'object') setQuickStudent(snapshot.quickStudent)",
    "if (snapshot.emergencyForm && typeof snapshot.emergencyForm === 'object') setEmergencyForm(snapshot.emergencyForm)",
    "if (typeof snapshot.auditStaffId === 'string') setAuditStaffId(snapshot.auditStaffId)",
    'if (Array.isArray(snapshot.cancelledReservations)) setCancelledReservations(snapshot.cancelledReservations)',
    "if (typeof snapshot.selectedStaffId === 'string') setSelectedStaffId(snapshot.selectedStaffId)",
    "if (typeof snapshot.isDarkMode === 'boolean') setIsDarkMode(snapshot.isDarkMode)",
    "if (typeof snapshot.followsUs === 'boolean') setFollowsUs(snapshot.followsUs)",
    "if (typeof snapshot.adminCustomFooter === 'string') setAdminCustomFooter(snapshot.adminCustomFooter)",
    'if (snapshot.adminWhatsappLinks !== undefined) _setAdminWhatsappLinks(snapshot.adminWhatsappLinks)',
    'if (snapshot.adminChannelLink !== undefined) _setAdminChannelLink(snapshot.adminChannelLink)',
    "if (typeof snapshot.paymentMethod === 'string') setPaymentMethod(snapshot.paymentMethod)",
    "if (typeof snapshot.auditActualCash === 'string') setAuditActualCash(snapshot.auditActualCash)",
    'if (Array.isArray(snapshot.walletLog)) setWalletLog(snapshot.walletLog)',
]
REF_FALLBACKS = [
    'setSyncQueue(Array.isArray(queue) ? queue : [])',
    "setSyncMap(mappings && typeof mappings === 'object' ? mappings : { students: {}, books: {}, reservations: {} })",
    'setReceiptArchiveItems(Array.isArray(receiptArchive) ? receiptArchive : [])',
]
REF_SMALL = ['useBackend', 'activeView', 'selectedStaffId', 'isDarkMode', 'followsUs', 'adminCustomFooter',
             'adminWhatsappLinks', 'adminChannelLink', 'paymentMethod', 'auditActualCash']
REF_FULL = ['useBackend', 'activeView', 'books', 'students', 'cartItems', 'searchTerm', 'selectedStudentId',
            'discount', 'pendingReservations', 'salesHistory', 'withdrawals', 'auditLog', 'adminUnlocked',
            'transactionCounter', 'lastTransaction', 'quickStudent', 'emergencyForm', 'auditStaffId',
            'cancelledReservations', 'selectedStaffId', 'isDarkMode', 'followsUs', 'adminCustomFooter',
            'adminWhatsappLinks', 'adminChannelLink', 'paymentMethod', 'auditActualCash', 'walletLog']

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

def identifiers(block):
    return re.findall(r'^\s*(\w+)\s*,?\s*$', block, re.M)

# ---------- 1. useOfflineSnapshot.js exists, owns no data, no storage/API logic ----------
add('useOfflineSnapshot.js created', 'export default function useOfflineSnapshot' in hook)
for token in ['useEffect', 'useRef', 'let cancelled = false', 'if (!hydrated) return', '[hydrated, ...deps]',
              'loadRef.current()', 'applyRef.current(data)', 'onHydratedRef.current()',
              'buildSnapshotRef.current()', 'saveRef.current']:
    add(f'hook contains {token}', token in hook)
add('hook owns no state/data', 'useState' not in hook and 'setBooks' not in hook and 'setCartItems' not in hook)
add('hook has no storage-layer calls', all(x not in hook for x in ['loadOfflineBootstrap', "setOfflineSnapshot('", 'indexedDb', 'localStorage']))
add('hook has no field names', all(x not in hook for x in ['useBackend', 'walletLog', 'transactionCounter', 'auditStaffId']))

# ---------- 2. hydration: 28 guarded setters identical + same order ----------
def apply_ifs():
    m = re.search(r"apply: \(\{ snapshot, queue, mappings, receiptArchive \}\) => \{(.*?)setSyncQueue\(", cur, re.S)
    if not m:
        return []
    return [l.strip() for l in re.findall(r'^\s*(if \([^\n]+)\n', m.group(1), re.M) if 'snapshot.' in l]

guards = apply_ifs()
add('apply block has exactly 28 guarded setters', len(guards) == 28, str(len(guards)))
add('hydration guards identical and in same order', guards == REF_GUARDS)
if guards != REF_GUARDS:
    for i, (a, b) in enumerate(zip(guards, REF_GUARDS)):
        if a != b:
            add(f'  guard diff at {i}: {a}  vs  {b}', False)

# ---------- 3. bootstrap fallbacks identical ----------
for fb in REF_FALLBACKS:
    add(f'fallback present: {fb[:40]}...', fb in cur)

# ---------- 4. persistence snapshot branches: field keys + order identical ----------
mp = re.search(r'buildSnapshot: \(\) =>\s*useBackend\s*\?\s*\{([^}]*)\}\s*:\s*\{([^}]*)\}', cur, re.S)
add('buildSnapshot literal found', mp is not None)
if mp:
    small, full = identifiers(mp.group(1)), identifiers(mp.group(2))
    add('useBackend branch field keys identical', small == REF_SMALL, f'{len(small)} fields')
    add('full branch field keys identical', full == REF_FULL, f'{len(full)} fields')

# ---------- 5. persistence deps identical ----------
md = re.search(r'deps: \[\s*((?:\s*\w+\s*,?\s*)+)\]', cur, re.S)
add('deps array found', md is not None)
if md:
    deps = identifiers(md.group(1))
    add('deps identical to snapshot fields', deps == REF_FULL, f'{len(deps)} entries')
add('hydrated flag wired to offlineHydrated', 'hydrated: offlineHydrated' in cur)

# ---------- 6. persistence mechanics: save scope + catch moved into hook ----------
add("save callback keeps scope 'app_state'", "save: (snapshot) => setOfflineSnapshot('app_state', snapshot)" in cur)
add("'app_state' used exactly once in App.jsx", cur.count("'app_state'") == 1)
add('hook swallows persistence errors', '.catch(() => {' in hook and 'Keep runtime behavior' in hook)
add("receipt_archive effect untouched", "setOfflineSnapshot('receipt_archive', receiptArchiveItems)" in cur)

# ---------- 7. originals removed from App.jsx ----------
add('hydrateOfflineState removed', 'hydrateOfflineState' not in cur)
add('standalone persistence effect removed', 'const snapshot = useBackend' not in cur)
add("no useEffect with 'app_state' write remains in App.jsx",
    re.search(r"useEffect\([\s\S]*?setOfflineSnapshot\('app_state'", cur) is None)
add('hook import present', "import useOfflineSnapshot from './hooks/useOfflineSnapshot'" in cur)

# ---------- 8. other offline effects still gated on offlineHydrated ----------
for line in ['persistQueueState(syncQueue).catch(() => {})', 'setIdMappings(syncMap).catch(() => {})']:
    add(f'{line[:40]}... still present', line in cur)
add('offlineHydrated still drives 4 sibling effects',
    len(re.findall(r'if \(!offlineHydrated\) return', cur)) == 4)

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
