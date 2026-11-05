import re, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
code = open(os.path.join(ROOT, 'js', 'Code.js'), encoding='utf-8').read()
lines = code.split('\n')

def where(pattern, ctx=0, maxn=20, src=None, label=None):
    s = src if src is not None else lines
    print(f'\n##### {label or pattern}')
    n = 0
    for i, l in enumerate(s):
        if re.search(pattern, l):
            print(f'L{i+1}: {l.strip()[:170]}')
            for j in range(1, ctx + 1):
                if i + j < len(s): print(f'   L{i+1+j}: {s[i+j].strip()[:170]}')
            n += 1
            if n >= maxn: break
    if n == 0: print('  (none)')

# F. standardizeWarehouseSKU really defined?
where(r'function\s+standardizeWarehouseSKU|standardizeWarehouseSKU\s*\(', label='F standardizeWarehouseSKU')
for p in glob.glob(os.path.join(ROOT, 'js', '*.js')):
    if 'function standardizeWarehouseSKU' in open(p, encoding='utf-8').read(): print('  defined in', p)

# A. handleApiRequest top-level lock?
i0 = next(i for i, l in enumerate(lines) if re.match(r'\s*function handleApiRequest\b', l))
print('\n##### A handleApiRequest head')
for l in lines[i0:i0 + 25]: print('  ', l.rstrip()[:150])
where(r'LockService', label='A locks inside handleApiRequest range', src=lines[i0:i0 + 1500], maxn=5)

# C. QC approval callers & syncDeltas BOM trigger condition
where(r'processQCApproval\s*\(', label='C callers processQCApproval')
where(r'var isDone\s*=', ctx=3, label='C syncDeltas isDone condition')
where(r"qc_status", maxn=30, label='C qc_status usages')

# G. safeDeductInventoryOnHandover callers
for p in glob.glob(os.path.join(ROOT, 'js', '*.js')):
    src = open(p, encoding='utf-8').read().split('\n')
    for i, l in enumerate(src):
        if 'safeDeductInventoryOnHandover(' in l or 'applyDeltasToSheet(' in l and 'function' not in l:
            print(f'G {os.path.basename(p)} L{i+1}: {l.strip()[:150]}')

# D. normalizeStatus fuzzy fallback full
i1 = next(i for i, l in enumerate(lines) if re.match(r'\s*function normalizeStatus\b', l))
print('\n##### D normalizeStatus tail')
for l in lines[i1 + 44:i1 + 62]: print('  ', l.rstrip()[:160])

# B. frontend: does it normalize before comparing 'Sẵn Sàng Đóng Gói'?
core = open(os.path.join(ROOT, 'html', 'Compiled_Core.html'), encoding='utf-8').read()
for m in list(re.finditer(r"S[ẵ]n [Ss]àng [Đđ]óng [Gg]ói", core))[:12]:
    print('B core:', core[max(0, m.start() - 140):m.end() + 30].replace('\n', ' '))

