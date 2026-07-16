import requests, json
from collections import Counter
BASE='http://localhost:8001/api'
H={'X-Employee-Id':'emp-idriss-malonga'}
for month in ['2026-09','2026-10']:
    data=requests.get(BASE+'/availability',params={'month':month},headers=H,timeout=20).json()
    counts=Counter(d['status'] for d in data['days'])
    # Idriss employee weekly_pattern in code: Mon/Tue off (weekday 0/1), Wed-Sun shift.
    expected_off_dates=[d['date'] for d in data['days'] if d['weekday'] in (0,1)]
    bad=[d for d in data['days'] if d['weekday'] in (0,1) and d['status'] not in ('off','holiday','cp_approved','rtt_approved','pending','past')]
    print(month, counts, 'expected pattern off count', len(expected_off_dates), 'bad_off_sample', bad[:10])
    with open(f'/app/test_reports/bug_verification_13_{month}_availability.json','w',encoding='utf-8') as f:
        json.dump({'month':month,'counts':dict(counts),'expected_off_dates':expected_off_dates,'bad_expected_off_days':bad,'days':data['days']}, f, ensure_ascii=False, indent=2)
