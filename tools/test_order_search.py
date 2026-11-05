import json
import re

with open('brain_cache.json', 'r', encoding='utf-8') as f:
    brain = json.load(f)

orders_obj = brain.get('orders', {})
prod_obj = brain.get('production', {})

all_orders = orders_obj.get('todayOrdersList', []) + orders_obj.get('recentOrders', []) + orders_obj.get('exportOrders', [])
pending_prod = prod_obj.get('pendingItems', [])

def search_specific_order(query):
    q = query.upper().strip()
    tokens = re.findall(r'[A-Z0-9]{3,25}', q)
    
    stop_tokens = {'DON', 'HANG', 'KHAU', 'BAN', 'TIM', 'KIEM', 'TRA', 'XEM', 'CHO', 'NAO', 'TIEN', 'DUONG', 'TAM', 'HOM', 'NAY', 'XONG', 'NHAN'}
    filtered_tokens = [t for t in tokens if t not in stop_tokens and not t.isdigit() or len(t) >= 4]
    if not filtered_tokens and tokens:
        filtered_tokens = [t for t in tokens if t not in stop_tokens]
        
    matched_orders = []
    for o in all_orders:
        code = o.get('code', '').upper()
        cust = o.get('customer', '').upper()
        acc = o.get('accessories', '').upper()
        for t in filtered_tokens:
            if code.endswith(t) or t in code or t in cust:
                matched_orders.append((o, t))
                break
    
    return matched_orders, filtered_tokens

tests = [
    'tìm đơn W7SH',
    'đơn 7sh là đơn gì',
    'kiểm tra đơn 261103ANW6W7SH',
    'nhận khâu 1 đơn W7SH',
    'đơn 6418',
    'đơn của vnsip'
]

for t in tests:
    res, tokens = search_specific_order(t)
    print(f'Test: "{t}" (tokens: {tokens}) -> Matched: {len(res)}')
    if res:
        o, matched_tok = res[0]
        print(f'   -> Found: Code={o["code"]}, Customer={o["customer"]}, Channel={o["channel"]}, Acc={o["accessories"][:60]}')

