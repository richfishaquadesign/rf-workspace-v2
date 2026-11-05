import glob, re

old_id = '1VGGL53xlS55dJNXYmz9GmqLjbhKh73wjEa1Hq7Holsw'
print(f"Scanning for {old_id} and openById...")

for f in glob.glob('js/*.js') + glob.glob('html/*.html'):
    with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
        lines = fp.readlines()
        for idx, line in enumerate(lines, 1):
            if old_id in line:
                print(f"{f}:{idx}: {line.strip()[:100]}")
            if 'openById' in line:
                print(f"{f}:{idx}: [openById] {line.strip()[:100]}")
            if 'MASTER_SHEET_ID' in line or 'SPREADSHEET_ID' in line:
                print(f"{f}:{idx}: [ID_VAR] {line.strip()[:100]}")

