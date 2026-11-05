with open('tools/precompile_jsx.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
core = re.search(r'const CORE_FILES = \[(.*?)\];', text, re.DOTALL)
deferred = re.search(r'const DEFERRED_FILES = \[(.*?)\];', text, re.DOTALL)

print('CORE_FILES:', core.group(1).replace('\n', ' ').strip() if core else 'None')
print('DEFERRED_FILES:', deferred.group(1).replace('\n', ' ').strip() if deferred else 'None')

