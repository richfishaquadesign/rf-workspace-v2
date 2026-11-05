import re, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {os.path.basename(p): open(p, encoding='utf-8').read() for p in glob.glob(os.path.join(ROOT, 'js', '*.js'))}
code = FILES['Code.js']; L = code.split('\n')

def show(a, b, src=L):
    for i in range(a - 1, min(b, len(src))): print(f'L{i+1}: {src[i].rstrip()[:200]}')

print('=== QC: isKcsPassed definition (syncDeltas)')
for i, l in enumerate(L):
    if re.search(r'isKcsPassed\s*=|var qcStr\b|var isQcPassed|qcStatus\.indexOf', l): print(f'L{i+1}: {l.strip()[:230]}')
print('\n=== syncDeltas BOM trigger L4570-4590'); show(4572, 4586)
print('\n=== syncDeltas forward block L4383-4420'); show(4383, 4420)

# Precise nested-lock: function bodies by line ranges using a proper top-level scan
def top_funcs(src):
    res = {}
    for m in re.finditer(r'^function\s+([A-Za-z0-9_$]+)\s*\(', src, re.M):
        res[m.group(1)] = m.start()
    names = sorted(res.items(), key=lambda x: x[1])
    out = {}
    for k, (n, s) in enumerate(names):
        e = names[k + 1][1] if k + 1 < len(names) else len(src)
        out[n] = src[s:e]
    return out
TF = {}
for fn, src in FILES.items():
    for n, b in top_funcs(src).items(): TF.setdefault(n, (fn, b))

LOCKED = {n for n, (f, b) in TF.items() if re.search(r'(waitLock|tryLock)\s*\(', b) and 'releaseLock' in b}
print('\n=== REAL nested lock (outer acquires lock, then calls locked inner before its own release)')
real = []
for outer in LOCKED:
    f, b = TF[outer]
    acq = re.search(r'(waitLock|tryLock)\s*\(', b).start()
    for inner in LOCKED:
        if inner == outer: continue
        for m in re.finditer(r'(?<![\w.])' + re.escape(inner) + r'\s*\(', b):
            if m.start() > acq:
                real.append((outer, inner, f)); break
for r in sorted(set(real)): print(' ', r)
print('count', len(set(real)))

print('\n=== LayoutStockPolicy functions & lock status')
lsp = FILES['LayoutStockPolicy.js']
for n, b in top_funcs(lsp).items():
    print(f"  {n}: lock={'waitLock' in b or 'tryLock' in b}, writes={bool(re.search(r'applyDeltasToSheet|setValue|appendRow', b))}")
    callers = [c for c, (f, bb) in TF.items() if c != n and re.search(r'(?<![\w.])' + re.escape(n) + r'\s*\(', bb)]
    print('     callers:', [(c, 'locked' if c in LOCKED else 'NO-LOCK') for c in callers][:8])

print('\n=== exact-case-only comparisons of READY status in Tab_Orders/Modals_Orders (no upper fallback on same line)')
for h in ['Tab_Orders.html', 'Modals_Orders.html', 'Tab_Production.html']:
    s = open(os.path.join(ROOT, 'html', h), encoding='utf-8').read()
    for i, l in enumerate(s.split('\n')):
        if re.search(r"===\s*'Sẵn Sàng Đóng Gói'|===\s*'Sẵn sàng đóng gói'", l) and 'SẴN SÀNG' not in l:
            print(f'  {h} L{i+1}: {l.strip()[:200]}')

print('\n=== who writes Title-case READY in backend')
for fn, src in FILES.items():
    for i, l in enumerate(src.split('\n')):
        if "'Sẵn Sàng Đóng Gói'" in l: print(f'  {fn} L{i+1}: {l.strip()[:180]}')

print('\n=== backend exact compares to lowercase READY (would miss Title-case written by frontend/RFBot)')
for fn, src in FILES.items():
    for i, l in enumerate(src.split('\n')):
        if re.search(r"(===|==|indexOf\()\s*'Sẵn sàng đóng gói'|'Sẵn sàng đóng gói'\s*(===|==)", l) and 'SẴN SÀNG' not in l.upper().replace('SẴN SÀNG ĐÓNG GÓI', '', 0):
            print(f'  {fn} L{i+1}: {l.strip()[:180]}')

