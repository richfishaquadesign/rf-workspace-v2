import json, os, urllib.request

clasprc_path = os.path.expanduser('~/.clasprc.json')
with open(clasprc_path, 'r', encoding='utf-8') as f:
    creds = json.load(f)

tokens = creds.get('tokens', {}).get('default', {})
refresh_token = tokens.get('refresh_token')
client_id = tokens.get('client_id')
client_secret = tokens.get('client_secret')

if refresh_token and client_id and client_secret:
    data = f'client_id={client_id}&client_secret={client_secret}&refresh_token={refresh_token}&grant_type=refresh_token'.encode('utf-8')
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            token_resp = json.loads(resp.read().decode('utf-8'))
            access_token = token_resp['access_token']
    except Exception as e:
        print('Token refresh error:', e)
        access_token = tokens.get('access_token')
else:
    access_token = tokens.get('access_token')

url = 'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.script%27&fields=files(id%2Cname%2Cparents)'
req2 = urllib.request.Request(url, headers={'Authorization': f'Bearer {access_token}'})
try:
    with urllib.request.urlopen(req2) as resp2:
        files = json.loads(resp2.read().decode('utf-8')).get('files', [])
        print(f"Found {len(files)} script files in Drive:")
        for item in files:
            sid = item.get('id')
            name = item.get('name')
            print(f"  {sid}: {name}")
            # check deployments for this script
            url_dep = f'https://script.googleapis.com/v1/projects/{sid}/deployments'
            req_dep = urllib.request.Request(url_dep, headers={'Authorization': f'Bearer {access_token}'})
            try:
                with urllib.request.urlopen(req_dep) as resp_dep:
                    deps = json.loads(resp_dep.read().decode('utf-8')).get('deployments', [])
                    for d in deps:
                        dep_id = d.get('deploymentId')
                        print(f"    -> Deployment: {dep_id}")
                        if dep_id == 'AKfycbz3BzyRPWT7Ax6pb219NyZfJen0GAFgvvdxNtnUy68Oj4kiPM2-glVAahqTu99ebjrDrQ':
                            print(f"\n🎯 FOUND TARGET SCRIPT ID: {sid} !!!\n")
            except Exception as e2:
                print(f"    -> Deployment check error: {e2}")
except Exception as e:
    print('Drive API error:', e)
