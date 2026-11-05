import re

with open('js/Code.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Let's inspect normalizeStatus in Code.js
m = re.search(r'function normalizeStatus\b', code)
if m:
    start = m.start()
    print('=== normalizeStatus ===')
    print(code[start:start + 1500])
