import io, re, subprocess, sys

def git_show(path):
    return subprocess.check_output(['git', 'show', f'HEAD:{path}'], text=True, encoding='utf-8')

orig = git_show('pos-frontend/src/App.jsx')
cur = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

# ---------- 1. useViewData.js exists, owns no data, no API/business logic ----------
hook = io.open(r'pos-frontend/src/hooks/useViewData.js', encoding='utf-8').read()
add('useViewData.js created', 'export default function useViewData' in hook)
for token in ['useEffect', 'useRef', 'cancelled', 'activeView !== view', 'loaderRef.current()', 'onSuccessRef.current(result)', 'onErrorRef.current(error)']:
    add(f'hook contains {token}', token in hook)
add('hook owns no state/data', 'useState' not in hook and 'setBooks' not in hook and 'setStudents' not in hook)
add('hook has no API calls', all(x not in hook for x in ['apiRequest', 'fetch(', 'refresh', 'hydrate', 'archive']))
add('hook has no business logic', all(x not in hook for x in ['books', 'students', 'salesHistory', 'wallet', 'cart']))

# ---------- 2. original effects removed from App.jsx ----------
for pat in [r"activeView !== 'receiptArchive'", r"activeView !== 'booksInsights'", r"activeView !== 'accounting'"]:
    add(f'original gate removed ({pat})', not re.search(pat, cur))

# ---------- 3. three useViewData calls with matching views ----------
for view in ['receiptArchive', 'booksInsights', 'accounting']:
    add(f'useViewData call for {view}',
        re.search(r"useViewData\(\{\s*view: '" + view + r"'", cur) is not None)
add('useViewData used exactly 3 times', len(re.findall(r'useViewData\(', cur)) == 3)

# ---------- 4. loader/onSuccess/onError/deps identical to original ----------
def body_of_effect(src, gate):
    m = re.search(r"if \(activeView !== '" + gate + r"'\) return\n(.*?)\n  \}, \[(.*?)\]\)", src, re.S)
    return (m.group(1), m.group(2)) if m else (None, None)

pairs = [
    ('receiptArchive', 'refreshReceiptArchiveItems(apiRequest)', 'setReceiptArchiveItems(data)', 'setReceiptArchiveItems([])', 'authUser, useBackend, activeView, apiRequest', 'authUser, useBackend, apiRequest'),
    ('booksInsights', 'fetchBooksInsights(apiRequest, books)', 'setBooksInsightsRows(merged)', 'setBooksInsightsRows([])', 'authUser, useBackend, activeView, books, apiRequest', 'authUser, useBackend, books, apiRequest'),
    ('accounting', 'refreshAccountingSnapshot(apiRequest)', 'setFinanceReport(finance)\n        setSupplies(suppliesList)', 'setFinanceReport(null)\n        setSupplies([])', 'authUser, useBackend, activeView, apiRequest', 'authUser, useBackend, apiRequest'),
]
for gate, loader, success, error, deps_orig, deps_new in pairs:
    eff, eff_deps = body_of_effect(orig, gate)
    add(f'{gate}: original effect found', eff is not None)
    if eff is None:
        continue
    add(f'{gate}: loader identical', re.search(re.escape(loader), eff) is not None)
    add(f'{gate}: success setters identical', all(s in cur for s in [x.strip() for x in success.split('\n')]))
    add(f'{gate}: error fallbacks identical', all(s in cur for s in [x.strip() for x in error.split('\n')]))
    add(f'{gate}: deps identical (minus activeView)',
        eff_deps == deps_orig and re.search(re.escape(deps_new), cur) is not None)

# ---------- 5. guards equivalent: !authUser / !useBackend -> enabled ----------
add('enabled flag uses authUser && useBackend',
    len(re.findall(r'enabled: Boolean\(authUser && useBackend\)', cur)) == 3)

# ---------- 6. state ownership unchanged: setters still called from App.jsx only ----------
for s in ['setReceiptArchiveItems', 'setBooksInsightsRows', 'setFinanceReport', 'setSupplies']:
    add(f'{s} still used in App.jsx', s in cur)
    add(f'{s} not in hook', s not in hook)

# ---------- 7. useEffect import still required ----------
add('useEffect still used in App.jsx', len(re.findall(r'useEffect\(', cur)) >= 10)

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
