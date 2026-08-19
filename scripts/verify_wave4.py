import io, re, subprocess, sys

def git_show(path):
    return subprocess.check_output(['git', 'show', f'HEAD:{path}'], text=True, encoding='utf-8')

orig = git_show('pos-frontend/src/App.jsx')
cur = io.open(r'pos-frontend/src/App.jsx', encoding='utf-8').read()

def read_file(p):
    return io.open(p, encoding='utf-8').read()

def dedent_compare(a, b):
    ta = '\n'.join(l.strip() for l in a.split('\n') if l.strip())
    tb = '\n'.join(l.strip() for l in b.split('\n') if l.strip())
    return ta == tb

def extract_func(src, decl_re):
    lines = src.split('\n')
    start = next(i for i, l in enumerate(lines) if re.match(decl_re, l))
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth <= 0 and i > start:
            return '\n'.join(lines[start:i + 1])
    raise RuntimeError('unclosed function ' + decl_re)

def head_body(s):
    lines = s.strip().split('\n')
    return '\n'.join(lines[1:]).rstrip() + '\n'

def body_of(s):
    s = re.sub(r'^import.*$', '', s, flags=re.M)
    s = re.sub(r'^export default function ', 'function ', s, flags=re.M)
    lines = s.strip().split('\n')
    return '\n'.join(lines[1:]).rstrip() + '\n'

def unwrap_view(s):
    s = re.sub(r'^import.*$', '', s, flags=re.M).strip()
    s = re.sub(r'^export default function \w+\([^)]*\) \{\s*$', '', s, flags=re.M)
    s = re.sub(r'^[ \t]*const isPickup = .*$', '', s, flags=re.M)
    s = s.strip()
    if s.startswith('return ('):
        s = s[len('return ('):]
    s = s.rstrip()
    while s.endswith('}') or s.endswith(')'):
        s = s.rstrip()
        if s.endswith('}'):
            s = s[:-1]
        elif s.endswith(')'):
            s = s[:-1]
        s = s.rstrip()
    return s

def block_inner(src, marker_re):
    lines = src.split('\n')
    start = next(i for i, l in enumerate(lines) if re.search(marker_re, l))
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth <= 0 and i > start:
            return '\n'.join(lines[start + 1:i])
    raise RuntimeError('unclosed block ' + marker_re)

def replace_selfclosing(s, tag):
    lines = s.split('\n')
    out = []
    depth = 0
    started = None
    for i, l in enumerate(lines):
        if started is None and re.search(r'<' + tag + r'\b', l):
            started = i
            depth = l.count('{') - l.count('}')
            if '/>' in l.split('{')[0] and '}>' not in l:
                out.append('{children}')
                started = None
            continue
        if started is not None:
            depth += l.count('{') - l.count('}')
            if '/>' in l:
                out.append('{children}')
                started = None
            continue
        out.append(l)
    return '\n'.join(out)

def strip_block(s):
    return [l.strip() for l in s.split('\n') if l.strip()]

checks = []

def add(name, ok, detail=''):
    checks.append((name, ok, detail))

FEAT = r'pos-frontend/src/features'

# ---------- 1. POSView: HEAD block inner == new file body ----------
head_pos = block_inner(orig, r"\{activeView === 'pos' && \(")
new_pos = unwrap_view(read_file(FEAT + r'/pos/POSView.jsx'))
ta, tb = strip_block(head_pos), strip_block(new_pos)
pos_ok = ta == tb
if not pos_ok:
    for i in range(min(len(ta), len(tb))):
        if ta[i] != tb[i]:
            add('POSView JSX==original', False, 'first diff at %d: %r vs %r' % (i, ta[i], tb[i]))
            break
    else:
        add('POSView JSX==original', False, 'length %d vs %d' % (len(ta), len(tb)))
else:
    add('POSView JSX==original', True)

# ---------- 2-6. content components + helper: body == HEAD ----------
for name, decl, path in [
    ('findReservationsBySearch', r'^function findReservationsBySearch\b',
     FEAT + r'/reservations/findReservationsBySearch.js'),
    ('PickupReservationContent', r'^function PickupReservationContent\b',
     FEAT + r'/reservations/PickupReservationContent.jsx'),
    ('CancelReservationContent', r'^function CancelReservationContent\b',
     FEAT + r'/reservations/CancelReservationContent.jsx'),
    ('ReturnSaleContent', r'^function ReturnSaleContent\b',
     FEAT + r'/returns/ReturnSaleContent.jsx'),
    ('LegacyReservationModal', r'^function LegacyReservationModal\b',
     FEAT + r'/reservations/LegacyReservationModal.jsx'),
]:
    hb = head_body(extract_func(orig, decl))
    nb = body_of(read_file(path))
    add(f'{name} body==HEAD', hb == nb, detail='' if hb == nb else 'head=%d new=%d' % (len(hb), len(nb)))

# ---------- 7. ReservationsView shell (pickup) ----------
head_pickup = re.search(r"\{activeView === 'pickupReservation' && \((.*?)\n          \)\}", orig, re.S).group(1)
norm_pickup = head_pickup.replace('setPickupSearch', 'onSearchChange').replace('pickupSearch', 'search')
norm_pickup = re.sub(r'<PickupReservationContent.*?/>', '{children}', norm_pickup, flags=re.S)
norm_pickup = norm_pickup.replace("onClick={() => setLegacyReservationModal({ open: true })}", 'onClick={onOpenLegacy}')
norm_pickup = norm_pickup.replace('<PackageCheck className="mx-auto h-12 w-12 text-brand-600" />',
    '<PackageCheck className="mx-auto h-12 w-12 text-brand-600" />')

shell = read_file(FEAT + r'/reservations/ReservationsView.jsx')
shell_pickup = shell
shell_pickup = re.sub(r"\{isPickup \? \(\n(\s*<PackageCheck[^\n]*/>)\n\s*\) : \(\n\s*<PackageX[^\n]*/>\n\s*\)\}",
    r'\1', shell_pickup)
shell_pickup = re.sub(r"\{isPickup \? t\('nav\.pickupReservation'\) : t\('nav\.cancelReservation'\)\}",
    "{t('nav.pickupReservation')}", shell_pickup)
shell_pickup = re.sub(r"\{isPickup && \(\n(.*?)\n\s*\)\}", r'\1', shell_pickup, flags=re.S)
add('ReservationsView pickup shell==original',
    dedent_compare(norm_pickup, unwrap_view(shell_pickup)))

# ---------- 8. ReservationsView shell (cancel) ----------
head_cancel = re.search(r"\{activeView === 'cancelReservation' && \((.*?)\n          \)\}", orig, re.S).group(1)
norm_cancel = head_cancel.replace('setCancelSearch', 'onSearchChange').replace('cancelSearch', 'search')
norm_cancel = re.sub(r'<CancelReservationContent.*?/>', '{children}', norm_cancel, flags=re.S)

shell_cancel = shell
shell_cancel = re.sub(r"\{isPickup \? \(\n(\s*<PackageCheck[^\n]*/>)\n\s*\) : \(\n(\s*<PackageX[^\n]*/>)\n\s*\)\}",
    r'\2', shell_cancel)
shell_cancel = re.sub(r"\{isPickup \? t\('nav\.pickupReservation'\) : t\('nav\.cancelReservation'\)\}",
    "{t('nav.cancelReservation')}", shell_cancel)
shell_cancel = re.sub(r"\{isPickup && \(\n(.*?)\n\s*\)\}", '', shell_cancel, flags=re.S)
add('ReservationsView cancel shell==original',
    dedent_compare(norm_cancel, unwrap_view(shell_cancel)))

# ---------- 9. ReturnsView shell ----------
head_returns = re.search(r"\{activeView === 'returns' && \((.*?)\n          \)\}", orig, re.S).group(1)
norm_returns = re.sub(r'<ReturnSaleContent.*?/>', '{children}', head_returns, flags=re.S)
new_returns = unwrap_view(read_file(FEAT + r'/returns/ReturnsView.jsx'))
add('ReturnsView shell==original', dedent_compare(norm_returns, new_returns))

# ---------- 10. moved functions removed from App.jsx ----------
for pattern, label in [
    (r'^function findReservationsBySearch\b', 'findReservationsBySearch removed from App.jsx'),
    (r'^function PickupReservationContent\b', 'PickupReservationContent removed from App.jsx'),
    (r'^function CancelReservationContent\b', 'CancelReservationContent removed from App.jsx'),
    (r'^function ReturnSaleContent\b', 'ReturnSaleContent removed from App.jsx'),
    (r'^function LegacyReservationModal\b', 'LegacyReservationModal removed from App.jsx'),
]:
    add(label, not re.search(pattern, cur, flags=re.M))

# ---------- 11. new components imported and used in App.jsx ----------
for name in ['POSView', 'ReservationsView', 'PickupReservationContent',
             'CancelReservationContent', 'LegacyReservationModal', 'ReturnsView',
             'ReturnSaleContent']:
    add(f'{name} imported+used in App.jsx',
        len(re.findall(r'<' + name + r'\b', cur)) >= 1 and name + ' from ' in cur)

# ---------- 12. unused icons removed from App.jsx imports ----------
imports = cur.split('\n', 20)[0]
for icon in ['PackageCheck', 'PackageX', 'ArrowUpDown', 'CheckCircle2']:
    add(f'{icon} import removed from App.jsx', icon not in imports)

# ---------- 13. App.jsx shrank ----------
add('App.jsx shrank (3741 -> %d lines)' % len(cur.split('\n')), len(cur.split('\n')) < 3000)

fails = [c for c in checks if not c[1]]
print(f'{len(checks)} checks, {len(fails)} failures')
for name, ok, detail in checks:
    print(('PASS' if ok else 'FAIL'), name, detail)
sys.exit(1 if fails else 0)
