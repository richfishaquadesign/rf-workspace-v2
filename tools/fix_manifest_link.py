# -*- coding: utf-8 -*-
import re

p = r'c:\Users\ADMIN\RF_Workspace_Pro\html\Index.html'
with open(p, 'r', encoding='utf-8') as f:
    text = f.read()

new_text = re.sub(r'<link\s+rel=[\'"]manifest[\'"].*?>', '<link rel="manifest" href="/manifest.json">', text)
with open(p, 'w', encoding='utf-8') as f:
    f.write(new_text)

print('Manifest tag replaced successfully')

