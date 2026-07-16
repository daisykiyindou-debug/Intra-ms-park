import json, requests
BASE='http://localhost:8001/api'
H={'X-Employee-Id':'emp-idriss-malonga','Content-Type':'application/json'}
results=[]

def post_case(name, dates):
    payload={'type':'conge','dates':dates,'comment':f'QA unavailable edge 13 - {name}'}
    r=requests.post(BASE+'/requests/multi',headers=H,json=payload,timeout=20)
    ok_blocked = r.status_code >= 400
    results.append({'name':name,'dates':dates,'status_code':r.status_code,'blocked':ok_blocked,'body':r.text[:500]})
    print(('PASS blocked' if ok_blocked else 'FAIL allowed'), name, r.status_code, r.text[:200])

post_case('past_day', ['2026-07-01'])
post_case('holiday_assomption', ['2026-08-15'])
# pending date already created by earlier deterministic API test
post_case('already_pending_day', ['2026-09-14'])
with open('/app/test_reports/bug_verification_13_edge_api_results.json','w',encoding='utf-8') as f:
    json.dump({'checks':results,'overall_blocked_all': all(x['blocked'] for x in results)}, f, ensure_ascii=False, indent=2)
