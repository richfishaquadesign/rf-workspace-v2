import json, os, urllib.request

clasprc_path = os.path.expanduser('~/.clasprc.json')
with open(clasprc_path, 'r', encoding='utf-8') as f:
    creds = json.load(f)

access_token = creds.get('tokens', {}).get('access_token') or creds.get('token', {}).get('access_token')

script_ids = [
    '1HBAO59WHNWys8ug8s1m8CNrE484UPy2mz0msZx3EbsGTPXfyfADNscI0',
    '1WSBAbr3zBG1LI7RSzgdaJX9WkrbvQORsY51Ba5lDEOteVDEVLN_bK9GX',
    '1a6eSo_kXdufbCLIKmxNYRr9Ps8t_foOXFWCLv1bvIhkKtlADdcWjkXbc',
    '1bbsPkOSpe89UNjkVLFaO6txxJtpis2G72SLTFWgv0N1d7-_S0KcNA7T0'
]

target_deploy_id = 'AKfycbz3BzyRPWT7Ax6pb219NyZfJen0GAFgvvdxNtnUy68Oj4kiPM2-glVAahqTu99ebjrDrQ'

for sid in script_ids:
    url = f'https://script.googleapis.com/v1/projects/{sid}/deployments'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {access_token}'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            deps = data.get('deployments', [])
            print(f'Script {sid}: {len(deps)} deployments')
            for d in deps:
                dep_id = d.get('deploymentId')
                desc = d.get('deploymentConfig', {}).get('description', '')
                print(f'  - {dep_id} ({desc})')
                if dep_id == target_deploy_id:
                    print(f'  ===> MATCH FOUND FOR TARGET DEPLOYMENT IN {sid}!')
    except Exception as e:
        print(f'Script {sid} error: {e}')
