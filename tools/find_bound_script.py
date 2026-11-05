import json, os, urllib.request

clasprc_path = os.path.expanduser('~/.clasprc.json')
with open(clasprc_path, 'r', encoding='utf-8') as f:
    creds = json.load(f)

tokens = creds.get('tokens', {}).get('default', {})
refresh_token = tokens.get('refresh_token')
client_id = tokens.get('client_id')
client_secret = tokens.get('client_secret')

data = f'client_id={client_id}&client_secret={client_secret}&refresh_token={refresh_token}&grant_type=refresh_token'.encode('utf-8')
req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
with urllib.request.urlopen(req) as resp:
    token_resp = json.loads(resp.read().decode('utf-8'))
    access_token = token_resp['access_token']

sheet_id = '1HFdyh5a1sHUYnKvTrSUvLBukMmXV5lYNLmU9_deijys'
print(f"Checking Google Sheet: {sheet_id}")

# 1. Check metadata of the sheet
try:
    url_sheet = f'https://www.googleapis.com/drive/v3/files/{sheet_id}?fields=id,name,owners,permissions'
    req_s = urllib.request.Request(url_sheet, headers={'Authorization': f'Bearer {access_token}'})
    with urllib.request.urlopen(req_s) as resp_s:
        print("Sheet metadata:", json.loads(resp_s.read().decode('utf-8')))
except Exception as e:
    print("Sheet check error:", e)

# 2. Check files in parents or related to sheet
try:
    url_children = f"https://www.googleapis.com/drive/v3/files?q='{sheet_id}'+in+parents&fields=files(id,name,mimeType)"
    req_c = urllib.request.Request(url_children, headers={'Authorization': f'Bearer {access_token}'})
    with urllib.request.urlopen(req_c) as resp_c:
        print("Children of sheet:", json.loads(resp_c.read().decode('utf-8')))
except Exception as e:
    print("Children check error:", e)

# 3. Search all scripts including bound scripts
try:
    url_all_scripts = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.script'&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id,name,parents)"
    req_all = urllib.request.Request(url_all_scripts, headers={'Authorization': f'Bearer {access_token}'})
    with urllib.request.urlopen(req_all) as resp_all:
        all_s = json.loads(resp_all.read().decode('utf-8')).get('files', [])
        print(f"All scripts found ({len(all_s)}):")
        for s in all_s:
            print(" ", s)
except Exception as e:
    print("All scripts error:", e)

