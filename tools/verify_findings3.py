import re, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
code = open('js/Code.js', encoding='utf-8').read(); L = code.split('\n')

print('--- handleApiRequest: lock placements')
i0 = next(i for i, l in enumerate(L) if l.startswith('function handleApiRequest'))
for i in range(i0 + 1, len(L)):
    if L[i].startswith('function '): print('handleApiRequest ends at', i + 1); break
    if 'getScriptLock' in L[i]: print(f'L{i+1}: {L[i].strip()[:80]}')

for name, inner in [('cleanupPhantomBomTickets', 'processMaterialDeduction'), ('processAutoAllocation', 'processBatchAutoForwardSLA'),
                    ('processSPXReturnEmail', 'processCascadeCancelOrder'), ('scanAutoEmails', 'processSPXReturnEmail'),
                    ('syncDeltas', 'updateUserConfigSheet')]:
    s = next(i for i, l in enumerate(L) if l.startswith('function ' + name))
    print('---', name, f'(L{s+1})')
    for i in range(s + 1, len(L)):
        if L[i].startswith('function '): break
        if re.search(r'waitLock|tryLock|releaseLock|\b' + inner + r'\(|for \(|forEach', L[i]) and (inner in L[i] or 'Lock' in L[i]):
            print(f'L{i+1}: {L[i].strip()[:150]}')

print('--- qc_status values written')
for p in glob.glob('html/*.html') + glob.glob('js/*.js'):
    s = open(p, encoding='utf-8').read()
    vals = set(re.findall(r"qc_status\s*[:=]\s*'([^']+)'", s)) | set(re.findall(r"qc_status\s*[:=]\s*\"([^\"]+)\"", s))
    if vals: print(' ', os.path.basename(p), sorted(vals))
print('--- processQCApproval called from frontend?')
for h in glob.glob('html/*.html'):
    t = open(h, encoding='utf-8').read()
    if 'processQCApproval' in t: print(' ', os.path.basename(h), t.count('processQCApproval'))
seg = code[code.find('function checkAndAutoForwardOrder'):code.find('function processQCApproval')]
print('--- checkAndAutoForwardOrder checks qc_status:', 'qc_status' in seg)
seg2 = code[code.find('function processBatchAutoForwardSLA'):]
seg2 = seg2[:seg2.find('\nfunction ', 10)]
print('--- processBatchAutoForwardSLA checks qc_status:', 'qc_status' in seg2 or 'qcStatus' in seg2)

