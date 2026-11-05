import json, subprocess

script_ids = [
    ('RF_Workspace_Pro_Orig', '1HBAO59WHNWys8ug8s1m8CNrE484UPy2mz0msZx3EbsGTPXfyfADNscI0'),
    ('RF_Workspace_Pro_2', '1WSBAbr3zBG1LI7RSzgdaJX9WkrbvQORsY51Ba5lDEOteVDEVLN_bK9GX'),
    ('No_Title', '1a6eSo_kXdufbCLIKmxNYRr9Ps8t_foOXFWCLv1bvIhkKtlADdcWjkXbc'),
    ('RF_Workspace_Staging', '1bbsPkOSpe89UNjkVLFaO6txxJtpis2G72SLTFWgv0N1d7-_S0KcNA7T0')
]

target_deploy_id = 'AKfycbz3BzyRPWT7Ax6pb219NyZfJen0GAFgvvdxNtnUy68Oj4kiPM2-glVAahqTu99ebjrDrQ'

with open('.clasp.json', 'r') as f:
    orig_config = json.load(f)

try:
    for name, sid in script_ids:
        print(f"\n--- Checking {name} ({sid}) ---")
        cfg = dict(orig_config)
        cfg['scriptId'] = sid
        with open('.clasp.json', 'w') as f:
            json.dump(cfg, f, indent=2)
        
        res = subprocess.run(['npx', '@google/clasp', 'deployments'], capture_output=True, text=True, shell=True)
        print(res.stdout)
        if target_deploy_id in res.stdout:
            print(f"🎉 FOUND TARGET DEPLOYMENT IN {name} ({sid})!")
            break
finally:
    with open('.clasp.json', 'w') as f:
        json.dump(orig_config, f, indent=2)
    print("\nRestored original .clasp.json")

