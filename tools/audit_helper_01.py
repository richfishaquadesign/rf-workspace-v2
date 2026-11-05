import os, re, glob, json

with open('html/Index.html', 'r', encoding='utf-8') as f:
    text = f.read()

includes = re.findall(r'include\([\'"]([^\'"]+)[\'"]\)', text)
print('Includes in Index.html:', includes)

# Check precompile_jsx.js to see how Compiled_Core and Compiled_Deferred are built
if os.path.exists('tools/precompile_jsx.js'):
    with open('tools/precompile_jsx.js', 'r', encoding='utf-8') as f:
        print('\n--- tools/precompile_jsx.js excerpt ---')
        lines = f.readlines()
        for l in lines[:40]:
            print(l.rstrip())

