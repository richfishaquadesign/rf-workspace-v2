import json
import re

with open('brain_cache.json', 'r', encoding='utf-8') as f:
    brain = json.load(f)

pending_prods = brain.get('production', {}).get('pendingItems', [])
print(f'Pending prod items: {len(pending_prods)}')
for p in pending_prods:
    print(' -', p.get('name'), '| OrderId:', p.get('orderId')[:25])

def normVN(s):
    import unicodedata
    s = str(s or '').lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.replace('đ', 'd')

def match_prod_by_name(query):
    qNorm = normVN(query)
    # Tìm mẫu
    best_match = None
    best_score = 0
    for p in pending_prods:
        pNameNorm = normVN(p.get('name', ''))
        # Tách các từ
        words = [w for w in pNameNorm.split() if len(w) >= 2 and w not in ['ver', 'cm']]
        score = 0
        for w in words:
            if w in qNorm:
                score += 10
        if score > best_score and score >= 10:
            best_score = score
            best_match = p
    return best_match

test_queries = [
    'Dương nhận khâu 1 Biotop Cuội',
    'Nhận khâu 1 Cuội ver 2',
    'Dương nhận khâu 1 Hang Động 4',
    'Xong khâu 1 Hang Động ver 4',
    'Hương hoàn thành đóng gói đơn W7SH',
    'Đã bàn giao đơn W7SH',
    'Chở kho đơn W7SH'
]

print('\nTEST MATCHING:')
for q in test_queries:
    matched = match_prod_by_name(q)
    print(f'Query: "{q}" -> Matched: {matched.get("name") if matched else "None"}')

