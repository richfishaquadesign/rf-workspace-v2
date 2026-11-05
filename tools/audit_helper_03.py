import re

with open('html/App_Main.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Look for tabs navigation in App_Main.html
# Find where tabs list is defined (e.g. const TABS = [...] or sidebar items)
matches = re.findall(r'(\b[a-zA-Z0-9_]*tabs?[a-zA-Z0-9_]*\s*=\s*\[[\s\S]*?\])', text, re.IGNORECASE)
for m in matches:
    print('Tab list match:\n', m[:500])
    print('='*50)

# Also search for switchTab or setActiveTab
sw = re.findall(r'(setActiveTab|switchTab|currentTab|activeTab)[^;]{0,100}', text)
for s in sw[:15]:
    print('ActiveTab usage:', s)

