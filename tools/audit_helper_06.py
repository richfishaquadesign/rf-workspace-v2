import re

with open('html/Tab_Orders.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Find subtabs / status filters in Tab_Orders
filters = re.findall(r"\{\s*id\s*:\s*['\"]([^'\"]+)['\"],\s*label\s*:\s*['\"]([^'\"]+)['\"]", text)
print('Filters/Tabs in Tab_Orders.html:', filters)

# Look for buttons in Tab_Orders
buttons = re.findall(r'<button[^>]*>(.*?)</button>', text, re.DOTALL)
print(f'Total button elements in Tab_Orders: {len(buttons)}')
btn_texts = []
for b in buttons:
    clean = re.sub(r'<[^>]+>', '', b).strip()
    if clean and len(clean) < 60:
        btn_texts.append(clean)
print('Sample 30 buttons in Tab_Orders:', list(dict.fromkeys(btn_texts))[:30])

