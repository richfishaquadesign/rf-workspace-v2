"""RF_Workspace_Pro - Logic Integrity Audit (read-only).
Checks real invariants in js/*.js and html/*.html. Does not modify any file.
"""
import os, re, json, glob
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = {os.path.basename(p): open(p, encoding='utf-8').read() for p in glob.glob(os.path.join(ROOT, 'js', '*.js'))}
HTML = {os.path.basename(p): open(p, encoding='utf-8').read() for p in glob.glob(os.path.join(ROOT, 'html', '*.html'))}
ALL_JS = '\n'.join(JS.values())


def extract_functions(src):
    out = {}
    for m in re.finditer(r'\bfunction\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{', src):
        depth, i = 0, m.end() - 1
        while i < len(src):
            c = src[i]
            if c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0: break
            i += 1
        out.setdefault(m.group(1), src[m.start():i + 1])
    return out

FUNCS = {}
FUNC_FILE = {}
for fn, src in JS.items():
    for name, body in extract_functions(src).items():
        if name not in FUNCS:
            FUNCS[name] = body
            FUNC_FILE[name] = fn

report = {}

# 1. Write functions without LockService
WRITE_RE = re.compile(r'\.(setValue|setValues|appendRow|deleteRow|deleteRows|insertRowAfter|insertRows|clearContent)\s*\(')
LOCK_RE = re.compile(r'LockService\.getScriptLock\(\)')
nolock = []
for name, body in FUNCS.items():
    if WRITE_RE.search(body) and not LOCK_RE.search(body):
        # check if all callers are locked (heuristic: called only from locked functions)
        callers = [c for c, b in FUNCS.items() if c != name and re.search(r'\b' + re.escape(name) + r'\s*\(', b)]
        locked_callers = [c for c in callers if LOCK_RE.search(FUNCS[c])]
        nolock.append({'fn': name, 'file': FUNC_FILE[name], 'callers': len(callers),
                       'lockedCallers': len(locked_callers),
                       'risk': 'HIGH' if not callers or len(locked_callers) < len(callers) else 'LOW (caller locked)'})
report['1_write_without_lock'] = sorted(nolock, key=lambda x: x['risk'])

# 2. Nested lock: locked function calling another locked function (inner releaseLock frees outer lock early)
nested = []
locked = {n for n, b in FUNCS.items() if LOCK_RE.search(b) and 'releaseLock' in b}
for outer in locked:
    for inner in locked:
        if inner != outer and re.search(r'\b' + re.escape(inner) + r'\s*\(', FUNCS[outer]):
            nested.append({'outer': outer, 'inner': inner})
report['2_nested_lock_release'] = nested

# 3. Status string casing inconsistencies
status_variants = defaultdict(set)
for src in list(JS.values()) + list(HTML.values()):
    for s in re.findall(r"['\"](S[ẵa]n [Ss]àng [Đđ]óng [Gg]ói|Ch[ờo] [Bb]àn [Gg]iao|Đ[ãa] [Bb]àn [Gg]iao|Ch[ờo] [Ss]ản [Xx]uất|Đang [Ss]ản [Xx]uất|Hàng [Hh]oàn|Đơn [Hh]u[ỷỹy]|Đơn [Hh]ủy|Đã [Hh]u[ỷy]|Đã [Hh]ủy|Đối [Ss]oát [Tt]hành [Cc]ông)['\"]", src):
        key = s.lower().replace('ủy', 'uỷ')
        status_variants[key].add(s)
report['3_status_variants'] = {k: sorted(v) for k, v in status_variants.items() if len(v) > 1}

# where each casing of 'Sẵn sàng đóng gói' is written vs compared
ready_usage = []
for fn, src in list(JS.items()) + list(HTML.items()):
    for m in re.finditer(r"(setValue\(|status\s*=\s*|===?\s*|\.status\s*===?\s*)['\"](Sẵn [Ss]àng [Đđ]óng [Gg]ói)['\"]", src):
        ready_usage.append({'file': fn, 'op': m.group(1).strip(), 'value': m.group(2)})
report['3b_ready_to_pack_usage'] = ready_usage

# 4. Case-sensitive status comparisons that will miss the other casing
cs_compare = []
for name, body in FUNCS.items():
    for m in re.finditer(r"indexOf\(\s*currentStatus\s*\)|\[\s*'Chờ Sản Xuất'\s*,\s*'Đang Sản Xuất'[^\]]*\]\.indexOf\(([^)]+)\)", body):
        cs_compare.append({'fn': name, 'snippet': m.group(0)[:120]})
report['4_case_sensitive_status_lists'] = cs_compare

# 5. BOM deduction entry points & idempotency guard
bom_callers = [n for n, b in FUNCS.items() if re.search(r'\b(_processMaterialDeduction_Core|processMaterialDeduction)\s*\(', b) and n not in ('processMaterialDeduction', '_processMaterialDeduction_Core')]
core = FUNCS.get('_processMaterialDeduction_Core', '')
guard = bool(re.search(r'(existingBom|alreadyDeducted|BOM_\w*' + r'|daTru|isDeducted|processedBom|prodId[^;]{0,80}ImportExport)', core))
report['5_bom_deduction'] = {'entry_points': bom_callers, 'core_has_idempotency_guard': guard,
                             'core_snippet_head': core[:600]}

# 6. QC approval does not trigger BOM / forward
qc = FUNCS.get('processQCApproval', '')
report['6_qc_approval'] = {
    'sets_passed': "'Passed'" in qc,
    'calls_bom': 'MaterialDeduction' in qc,
    'calls_forward': 'checkAndAutoForwardOrder' in qc or 'processSlaAutomation' in qc,
    'sets_production_done': "'Done'" in qc,
}

# 7. normalizeStatus exact-match rule violations (fuzzy indexOf fallback)
ns = FUNCS.get('normalizeStatus', '')
report['7_normalize_status_fuzzy'] = re.findall(r"upper\.indexOf\('([^']+)'\)", ns)

# 8. Frontend google.script.run / api actions without backend
front_calls = set()
for fn, src in HTML.items():
    front_calls |= set(re.findall(r'google\.script\.run(?:\s*\.\s*with\w+\([^)]*\))*\s*\.\s*([A-Za-z0-9_]+)\s*\(', src))
    front_calls |= set(re.findall(r"action\s*:\s*['\"]([A-Za-z0-9_]+)['\"]", src))
dispatch = FUNCS.get('handleApiRequest', '')
actions = set(re.findall(r"action\s*===\s*['\"]([A-Za-z0-9_]+)['\"]", dispatch))
missing = sorted(c for c in front_calls if c not in FUNCS and c not in actions
                 and c not in ('withSuccessHandler', 'withFailureHandler', 'withUserObject'))
report['8_frontend_calls_missing_backend'] = missing
report['8b_api_actions_without_function'] = []

# 9. Schema columns referenced via indexOf that are not in SCHEMA
schema_cols = set(re.findall(r"'([A-Za-z_][A-Za-z0-9_]*)'", (re.search(r'var SCHEMA\s*=\s*\{[\s\S]*?\n\};', ALL_JS) or re.search(r'SCHEMA\s*=\s*\{[\s\S]*?\};', ALL_JS)).group(0)))
unknown_cols = defaultdict(set)
for name, body in FUNCS.items():
    for col in re.findall(r"headers?\.indexOf\('([A-Za-z_][A-Za-z0-9_]*)'\)", body):
        if col not in schema_cols:
            unknown_cols[col].add(name)
report['9_columns_not_in_schema'] = {k: sorted(v)[:5] for k, v in unknown_cols.items()}

# 10. Hard-coded external spreadsheet IDs
report['10_hardcoded_ss_ids'] = sorted(set(re.findall(r"openById\(\s*['\"]([A-Za-z0-9_-]{30,})['\"]", ALL_JS)))

out = os.path.join(ROOT, 'tools', 'logic_integrity_report.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print('Functions scanned:', len(FUNCS))
for k, v in report.items():
    n = len(v) if isinstance(v, (list, dict)) else v
    print(f'{k}: {n if not isinstance(v, dict) or k.startswith(("3", "9")) else json.dumps(v, ensure_ascii=False)[:400]}')
print('Report:', out)

