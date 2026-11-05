with open('html/App_Main.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re

# Find navigation items / sidebar items
# Look for id, label, icon, or role checks
matches = re.findall(r"\{\s*id\s*:\s*['\"]([^'\"]+)['\"],\s*label\s*:\s*['\"]([^'\"]+)['\"]", text)
print('Sidebar nav items (id, label):', matches)

if not matches:
    # Try finding setActiveTab('...')
    tabs = re.findall(r"setActiveTab\(['\"]([^'\"]+)['\"]\)", text)
    print('setActiveTab calls:', list(dict.fromkeys(tabs)))
    
    # Try finding case '...': or activeTab === '...'
    cases = re.findall(r"activeTab\s*===?\s*['\"]([^'\"]+)['\"]", text)
    print('activeTab === ...:', list(dict.fromkeys(cases)))

