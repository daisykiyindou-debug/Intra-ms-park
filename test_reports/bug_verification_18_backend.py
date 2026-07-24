import json
import os
import time
from pathlib import Path

import requests
from pymongo import MongoClient


ROOT = Path('/app')
REPORT_DIR = ROOT / 'test_reports'
RESULTS_PATH = REPORT_DIR / 'bug_verification_18_backend_results.json'


def parse_env(path: Path) -> dict:
    out = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        out[k] = v.strip().strip('"').strip("'")
    return out


frontend_env = parse_env(ROOT / 'frontend' / '.env')
backend_env = parse_env(ROOT / 'backend' / '.env')
BASE = frontend_env.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/') + '/api'
ADMIN_HEADERS = {'X-Employee-Id': 'emp-marcus-simeo'}

client = MongoClient(backend_env.get('MONGO_URL', 'mongodb://localhost:27017'))
db = client[backend_env.get('DB_NAME', 'test_database')]

results = {
    'base_url': BASE,
    'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'checks': [],
    'created_user_ids': [],
    'cleanup': {},
}


def record(name, passed, details=None):
    results['checks'].append({'name': name, 'passed': bool(passed), 'details': details or {}})
    print(('PASS' if passed else 'FAIL') + ' - ' + name + (f' :: {details}' if details else ''))


def api(method, path, *, headers=None, expected=None, **kwargs):
    r = requests.request(method, BASE + path, headers=headers or {}, timeout=30, **kwargs)
    data = None
    try:
        data = r.json()
    except Exception:
        data = r.text
    if expected is not None and r.status_code != expected:
        raise AssertionError(f'{method} {path} expected {expected}, got {r.status_code}: {data}')
    return r, data


def user_payload(prefix, **overrides):
    payload = {
        'first_name': prefix.split('.')[0].title(),
        'last_name': prefix.split('.')[-1].upper(),
        'email': f'{prefix}@mspark.fr',
        'personal_email': f'{prefix}@example.com',
        'phone': '+33 1 23 45 67 89',
        'personal_phone': '+33 6 23 45 67 89',
        'address': '18 rue QA',
        'postal_code': '75018',
        'city': 'Paris',
        'country': 'France',
        'account_status': 'active',
        'admin_role': 'employe',
        'temp_password': 'QaIter18!Pwd',
    }
    payload.update(overrides)
    return payload


prefix_base = f'qa.iter18.{int(time.time())}'

# Pre-clean leftovers from any interrupted previous run.
db.employees.delete_many({'$or': [
    {'email': {'$regex': r'^qa\.iter18\.'}},
    {'personal_email': {'$regex': r'^qa\.iter18\.'}},
]})
db.documents.delete_many({'$or': [
    {'employee_id': {'$regex': r'^qa-iter18-'}},
    {'target_employee_id': {'$regex': r'^qa-iter18-'}},
    {'name': {'$regex': r'Iter18|QA18'}},
]})

try:
    # Backend #1 — meal_points auto by statuses + explicit non-zero override.
    meal_cases = [(['bureau'], 35), (['management'], 30), (['ops'], 25)]
    for statuses, expected_points in meal_cases:
        pfx = f'{prefix_base}.meal.{statuses[0]}'
        _, data = api('POST', '/admin/users', headers=ADMIN_HEADERS, expected=200,
                      json=user_payload(pfx, statuses=statuses))
        user = data['user']
        results['created_user_ids'].append(user['id'])
        record(f'meal_points auto {statuses[0]}',
               user.get('meal_points') == expected_points and user.get('daily_quota') == expected_points,
               {'actual_meal_points': user.get('meal_points'), 'actual_daily_quota': user.get('daily_quota')})

    pfx = f'{prefix_base}.meal.explicit'
    _, data = api('POST', '/admin/users', headers=ADMIN_HEADERS, expected=200,
                  json=user_payload(pfx, statuses=['bureau'], meal_points=42))
    explicit_user = data['user']
    results['created_user_ids'].append(explicit_user['id'])
    record('meal_points explicit non-zero preserved',
           explicit_user.get('meal_points') == 42 and explicit_user.get('daily_quota') == 42,
           {'actual_meal_points': explicit_user.get('meal_points'), 'actual_daily_quota': explicit_user.get('daily_quota')})

    # Main user exercises badge, planning, profile sync, contract documents, login, and password change.
    main_prefix = f'{prefix_base}.main'
    main_contract = 'http://example.com/contrat-iter18-create.pdf'
    main_payload = user_payload(
        main_prefix,
        first_name='QA18',
        last_name='CONTRACT',
        statuses=['bureau'],
        manager_id='emp-marcus-simeo',
        weekly_hours='39h',
        badge_rfid='BDG-01',
        badge_expiry='2027-12-31',
        badge_active=True,
        work_days=['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        usual_hours='9h-17h',
        contract_url=main_contract,
        contract_name='contrat-iter18-create.pdf',
        temp_password='QaIter18!Pwd',
    )
    _, data = api('POST', '/admin/users', headers=ADMIN_HEADERS, expected=200, json=main_payload)
    main_user = data['user']
    main_id = main_user['id']
    results['created_user_ids'].append(main_id)
    user_headers = {'X-Employee-Id': main_id}

    _, me = api('GET', '/me', headers=user_headers, expected=200)
    record('badge fields persist and are returned by GET /me',
           me.get('badge_rfid') == 'BDG-01' and me.get('badge_expiry') == '2027-12-31' and me.get('badge_active') is True,
           {'badge_rfid': me.get('badge_rfid'), 'badge_expiry': me.get('badge_expiry'), 'badge_active': me.get('badge_active')})
    record('admin-created profile fields reflect on user /me',
           me.get('personal_phone') == '+33 6 23 45 67 89' and me.get('phone') == '+33 1 23 45 67 89'
           and me.get('postal_code') == '75018' and me.get('city') == 'Paris' and me.get('manager_id') == 'emp-marcus-simeo'
           and me.get('weekly_hours') == '39h',
           {k: me.get(k) for k in ['personal_phone', 'phone', 'postal_code', 'city', 'manager_id', 'weekly_hours']})

    pattern = me.get('weekly_pattern') or {}
    pattern_ok = all(pattern.get(str(i), {}).get('type') == 'shift' for i in range(5)) and \
        all(pattern.get(str(i), {}).get('type') == 'off' for i in [5, 6]) and \
        all(pattern.get(str(i), {}).get('start') == '09:00' and pattern.get(str(i), {}).get('end') == '17:00' for i in range(5))
    record('weekly_pattern Mon-Fri shifts and Sat-Sun off', pattern_ok, {'weekly_pattern': pattern})

    _, avail = api('GET', '/availability?month=2026-09', headers=user_headers, expected=200)
    bad_days = []
    for day in avail.get('days', []):
        wd = day['weekday']
        expected_status = 'worked' if wd <= 4 else 'off'
        if day['status'] != expected_status:
            bad_days.append({'date': day['date'], 'weekday': wd, 'status': day['status'], 'expected': expected_status})
    record('availability 2026-09 follows work_days/off_days', not bad_days, {'bad_days': bad_days[:10]})

    # Backend #4 / user-visible contract document: creation should produce a Documents RH entry visible to the employee.
    expected_doc_name = 'Contrat de travail — QA18 CONTRACT'
    db_contract_docs = list(db.documents.find({'employee_id': main_id}, {'_id': 0}))
    _, docs_api = api('GET', '/documents', headers=user_headers, expected=200)
    visible_names = [d.get('name') for d in docs_api]
    record('contract_url creation creates db.documents entry with employee_id/category Contrat',
           any(d.get('name') == expected_doc_name and d.get('category') == 'Contrat' for d in db_contract_docs),
           {'db_docs_for_employee_id': db_contract_docs, 'expected_name': expected_doc_name})
    record('uploaded contract is visible in employee Documents RH (/documents)',
           expected_doc_name in visible_names,
           {'visible_doc_names': visible_names, 'expected_name': expected_doc_name})

    before_doc_count = db.documents.count_documents({'employee_id': main_id})
    update_payload = dict(main_payload)
    update_payload['contract_url'] = 'http://example.com/contrat-iter18-update.pdf'
    update_payload['contract_name'] = 'contrat-iter18-update.pdf'
    api('PUT', f'/admin/users/{main_id}', headers=ADMIN_HEADERS, expected=200, json=update_payload)
    after_docs = list(db.documents.find({'employee_id': main_id}, {'_id': 0}))
    record('updating contract_url adds a new Documents RH document without overwriting',
           len(after_docs) == before_doc_count + 1,
           {'before_doc_count': before_doc_count, 'after_docs': after_docs})

    # Backend #5 — DB-created user password change and login.
    r_wrong, wrong_data = api('POST', '/me/change-password', headers=user_headers,
                             json={'current_password': 'wrong-password', 'new_password': 'QaIter18New!'}, expected=None)
    record('change-password rejects wrong current password for DB-created user',
           r_wrong.status_code == 401, {'status': r_wrong.status_code, 'body': wrong_data})
    r_short, short_data = api('POST', '/me/change-password', headers=user_headers,
                             json={'current_password': 'QaIter18!Pwd', 'new_password': '123'}, expected=None)
    record('change-password rejects new_password shorter than 6 chars',
           r_short.status_code == 400, {'status': r_short.status_code, 'body': short_data})
    r_ok, ok_data = api('POST', '/me/change-password', headers=user_headers,
                        json={'current_password': 'QaIter18!Pwd', 'new_password': 'QaIter18New!'}, expected=None)
    login_new_status = requests.post(BASE + '/auth/login', json={'email': main_payload['personal_email'], 'password': 'QaIter18New!'}, timeout=30).status_code
    login_old_status = requests.post(BASE + '/auth/login', json={'email': main_payload['personal_email'], 'password': 'QaIter18!Pwd'}, timeout=30).status_code
    record('change-password success allows login with new password and blocks old password for DB-created user',
           r_ok.status_code == 200 and ok_data.get('ok') is True and login_new_status == 200 and login_old_status == 401,
           {'change_status': r_ok.status_code, 'change_body': ok_data, 'login_new_status': login_new_status, 'login_old_status': login_old_status})

    # Idriss-specific profile password edge: seeded/hardcoded login should still validate current password and accept the new password.
    idriss_doc = db.employees.find_one({'id': 'emp-idriss-malonga'}, {'_id': 0, 'password': 1}) or {}
    idriss_had_password = 'password' in idriss_doc
    idriss_original_password = idriss_doc.get('password')
    db.employees.update_one({'id': 'emp-idriss-malonga'}, {'$unset': {'password': ''}})
    idriss_headers = {'X-Employee-Id': 'emp-idriss-malonga'}
    r_idriss_wrong, idriss_wrong_body = api('POST', '/me/change-password', headers=idriss_headers,
                                           json={'current_password': 'definitely-wrong', 'new_password': 'IdrissIter18New!'}, expected=None)
    idriss_login_new = requests.post(BASE + '/auth/login', json={'email': 'idriss.malonga@gmail.com', 'password': 'IdrissIter18New!'}, timeout=30).status_code
    record('Idriss profile password change validates current password before success',
           r_idriss_wrong.status_code == 401,
           {'status': r_idriss_wrong.status_code, 'body': idriss_wrong_body})
    record('Idriss login works with changed password after profile change',
           idriss_login_new == 200,
           {'login_new_status': idriss_login_new, 'note': 'Hardcoded demo auth currently rejects non-original password before DB fallback.'})
    if idriss_had_password:
        db.employees.update_one({'id': 'emp-idriss-malonga'}, {'$set': {'password': idriss_original_password}})
    else:
        db.employees.update_one({'id': 'emp-idriss-malonga'}, {'$unset': {'password': ''}})

finally:
    # Clean all temporary users/documents created by this script. Keep Idriss restored above.
    ids = results.get('created_user_ids', [])
    if ids:
        results['cleanup']['employees_deleted'] = db.employees.delete_many({'id': {'$in': ids}}).deleted_count
        results['cleanup']['documents_deleted'] = db.documents.delete_many({'$or': [
            {'employee_id': {'$in': ids}},
            {'target_employee_id': {'$in': ids}},
        ]}).deleted_count
    results['finished_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    results['passed'] = sum(1 for c in results['checks'] if c['passed'])
    results['failed'] = sum(1 for c in results['checks'] if not c['passed'])
    RESULTS_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f'Wrote {RESULTS_PATH}') 
