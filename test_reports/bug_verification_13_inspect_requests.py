import requests, json
from collections import Counter
BASE='http://localhost:8001/api'
H={'X-Employee-Id':'emp-idriss-malonga'}
reqs=requests.get(BASE+'/requests',headers=H,timeout=20).json()
aug=[]
for r in reqs:
    s=r.get('start_date'); e=r.get('end_date') or s
    if s <= '2026-08-31' and e >= '2026-08-01':
        aug.append(r)
print('total',len(reqs),'aug overlap',len(aug),'status counts',Counter((r['type'],r['status']) for r in aug))
print(json.dumps(aug[:40], ensure_ascii=False, indent=2))
