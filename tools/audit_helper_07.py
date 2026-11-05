import os, re, glob, json

# Scan all JS files for functions
js_files = glob.glob('js/*.js')
all_funcs = []

for f in js_files:
    fname = os.path.basename(f)
    with open(f, 'r', encoding='utf-8') as fh:
        lines = fh.readlines()
    for idx, line in enumerate(lines):
        m = re.match(r'^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)', line.strip())
        if m:
            func_name = m.group(1)
            params = m.group(2)
            all_funcs.append({
                'name': func_name,
                'file': fname,
                'line': idx + 1,
                'params': params
            })

print(f'Total declared functions found: {len(all_funcs)}')
with open('tools/all_backend_functions.json', 'w', encoding='utf-8') as out:
    json.dump(all_funcs, out, ensure_ascii=False, indent=2)
print('Saved to tools/all_backend_functions.json')

