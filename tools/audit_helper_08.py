import re, json

with open('js/Code.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Look for SCHEMA and SCHEMA_ERP
schema_match = re.search(r'var SCHEMA\s*=\s*(\{[\s\S]*?\n\s*\});', code)
erp_match = re.search(r'var SCHEMA_ERP\s*=\s*(\{[\s\S]*?\n\s*\});', code)

schemas = {}
if schema_match:
    try:
        # evaluate safely
        s_text = schema_match.group(1)
        # convert JS object to JSON
        # replace single quotes with double quotes, trailing commas
        print('Found SCHEMA!')
        print(s_text[:400])
    except Exception as e:
        print('Error parsing SCHEMA:', e)

if erp_match:
    print('Found SCHEMA_ERP!')
    print(erp_match.group(1)[:400])

