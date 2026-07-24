import json
import time
from pathlib import Path

import requests
from pymongo import MongoClient

ROOT = Path('/app')
RESULTS_PATH = ROOT / 'test_reports' / 'bug_verification_18_profile_sync_results.json'

def parse_env(path):
    out = {}
    for raw in Path(path).read_text().splitlines():
        if '=' in raw and not raw.strip().startswith('#'):
            k, v = raw.split('=', 1)
            out[k] = v.strip().strip('"').strip("'")
    return out

fenv = parse_env(ROOT / 'frontend' / '.env')
benv = parse_env(ROOT / 'backend' / '.env')
BASE = fenv['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
db = MongoClient(benv.get('MONGO_URL', 'mongodb://localhost:27017'))[benv.get('DB_NAME', 'test_database')]
ADMIN_HEADERS = {'X-Employee-Id': 'emp-marcus-simeo'}
IDRISS_HEADERS = {'X-Employee-Id': 'emp-idriss-malonga'}

orig = db.employees.find_one({'id': 'emp-idriss-malonga'}, {'_id': 0})
results = {'checks': [], 'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}

def rec(name, passed, details=None):
    results['checks'].append({'name': name, 'passed': bool(passed), 'details': details or {}})
    print(('PASS' if passed else 'FAIL') + ' - ' + name + (f' :: {details}' if details else ''))

try:
    update = dict(orig)
    update.update({
        'personal_phone': '+33 6 18 18 18 18',
        'phone': '+33 1 18 18 18 18',
        'address': '18 avenue Admin Sync',
        'postal_code': '92180',
        'city': 'Antony',
        'country': 'France',
        'manager_id': 'emp-marcus-simeo',
        'weekly_hours': '28h',
        'statuses': ['ops'],
        'work_days': ['monday', 'tuesday', 'wednesday'],
        'usual_hours': '10h-16h',
    })
    for non_payload in ['id', 'password', 'daily_quota', 'created_at']:
        # Extra fields are ignored by Pydantic, but keep payload concise.
        pass
    r = requests.put(BASE + '/admin/users/emp-idriss-malonga', headers=ADMIN_HEADERS, json=update, timeout=30)
    try:
        update_body = r.json()
    except Exception:
        update_body = r.text
    me = requests.get(BASE + '/me', headers=IDRISS_HEADERS, timeout=30).json()
    rec('admin update to Idriss succeeds', r.status_code == 200, {'status': r.status_code, 'body_subset': {k: update_body.get(k) for k in ['personal_phone','phone','postal_code','city','manager_id','weekly_hours','daily_quota'] if isinstance(update_body, dict)}})
    rec('admin modifications reflect on Idriss /me account',
        me.get('personal_phone') == '+33 6 18 18 18 18' and me.get('phone') == '+33 1 18 18 18 18'
        and me.get('postal_code') == '92180' and me.get('city') == 'Antony'
        and me.get('manager_id') == 'emp-marcus-simeo' and me.get('weekly_hours') == '28h'
        and me.get('daily_quota') == 25,
        {k: me.get(k) for k in ['personal_phone','phone','address','postal_code','city','manager_id','weekly_hours','meal_points','daily_quota']})
finally:
    if orig:
        restore = dict(orig)
        # replace user doc exactly, preserving original _id by updating fields and unsetting test-only keys
        current = db.employees.find_one({'id': 'emp-idriss-malonga'}) or {}
        unset = {k: '' for k in current.keys() if k != '_id' and k not in restore}
        db.employees.update_one({'id': 'emp-idriss-malonga'}, {'$set': restore, '$unset': unset})
    results['finished_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    results['passed'] = sum(1 for c in results['checks'] if c['passed'])
    results['failed'] = sum(1 for c in results['checks'] if not c['passed'])
    RESULTS_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f'Wrote {RESULTS_PATH}')