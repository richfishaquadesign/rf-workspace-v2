with open('html/App_Main.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re

# Find subtabs inside activeTab === '...' or inside Tab components
prod_subtabs = re.findall(r"(?:activeSubTab|prodTab|subTab)\s*===?\s*['\"]([^'\"]+)['\"]", text)
print('Production or other subtabs in App_Main:', list(dict.fromkeys(prod_subtabs)))

# Look into Tab_Production.html for its internal tabs
with open('html/Tab_Production.html', 'r', encoding='utf-8') as f:
    p_text = f.read()

p_tabs = re.findall(r"(?:activeTab|subTab|currentTab|tab)\s*===?\s*['\"]([^'\"]+)['\"]", p_text)
print('Tabs inside Tab_Production.html:', list(dict.fromkeys(p_tabs)))

# Look for buttons in Tab_Production
p_nav = re.findall(r"\{\s*id\s*:\s*['\"]([^'\"]+)['\"],\s*label\s*:\s*['\"]([^'\"]+)['\"]", p_text)
print('Nav items inside Tab_Production.html:', p_nav)

