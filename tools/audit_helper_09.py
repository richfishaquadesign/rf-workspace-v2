import re

with open('js/Code.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Find all occurrences of getSheetByName
sheets = re.findall(r"getSheetByName\(['\"]([^'\"]+)['\"]\)", code)
print('Total getSheetByName calls:', len(sheets))
unique_sheets = sorted(list(dict.fromkeys(sheets)))
print('Unique sheets referenced in Code.js (', len(unique_sheets), '):')
for s in unique_sheets:
    print('  -', s)

