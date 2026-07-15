"""Iteration 5: Agenda Admin CRUD + Carousel target routing + Event filtering by role."""
import os
import datetime
import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "marcus.simeo@mspark.fr"
ADMIN_PWD = "MSPark@Admin2026!"
EMP_EMAIL = "idriss.malonga@gmail.com"
EMP_PWD_MAIN = "demo"  # per request
EMP_PWD_ALT = "Idriss2026!"  # per credentials file


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="module")
def admin_id():
    r = _login(ADMIN_EMAIL, ADMIN_PWD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["employee_id"]


@pytest.fixture(scope="module")
def emp_id():
    r = _login(EMP_EMAIL, EMP_PWD_MAIN)
    if r.status_code != 200:
        r = _login(EMP_EMAIL, EMP_PWD_ALT)
    assert r.status_code == 200, f"employee login failed: {r.status_code} {r.text}"
    return r.json()["employee_id"]


def _admin_h(admin_id):
    return {"X-Employee-Id": admin_id}


def _emp_h(emp_id):
    return {"X-Employee-Id": emp_id}


# ─── Agenda / Events


def test_admin_list_events_has_seed(admin_id):
    r = requests.get(f"{API}/admin/events", headers=_admin_h(admin_id), timeout=15)
    assert r.status_code == 200
    events = r.json()
    assert isinstance(events, list)
    assert len(events) >= 6, f"expected at least 6 seed events, got {len(events)}"


def test_admin_create_event_normalizes_fields(admin_id):
    date = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
    payload = {
        "title": "TEST_iter5 Réunion Opérations",
        "description": "test create",
        "category": "meeting",
        "date": date,
        "start_time": "10:00",
        "location": "Salle Test",
        "group_targets": ["ops"],
        "signup_enabled": False,
    }
    r = requests.post(f"{API}/admin/events", json=payload, headers=_admin_h(admin_id), timeout=15)
    assert r.status_code == 200, r.text
    ev = r.json()
    eid = ev["id"]
    # Normalization: category↔type, start_time↔time, signup_enabled↔needs_registration
    assert ev.get("category") == "meeting"
    assert ev.get("type") == "meeting"
    assert ev.get("start_time") == "10:00"
    assert ev.get("time") == "10:00"
    assert ev.get("needs_registration") is False
    # Verify persistence via GET
    r2 = requests.get(f"{API}/admin/events", headers=_admin_h(admin_id), timeout=15)
    assert eid in [e["id"] for e in r2.json()]
    # Also verify singular GET
    r3 = requests.get(f"{API}/events/{eid}", headers=_admin_h(admin_id), timeout=15)
    assert r3.status_code == 200
    assert r3.json()["title"] == payload["title"]
    # cleanup at end via fixture
    pytest.event_id_ops = eid


def test_admin_update_event(admin_id):
    eid = getattr(pytest, "event_id_ops", None)
    assert eid, "prev test did not set event id"
    date = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
    payload = {
        "title": "TEST_iter5 Réunion Opérations MODIFIED",
        "description": "updated desc",
        "category": "meeting",
        "date": date,
        "start_time": "11:30",
        "location": "Salle Test",
        "group_targets": ["ops"],
    }
    r = requests.put(f"{API}/admin/events/{eid}", json=payload, headers=_admin_h(admin_id), timeout=15)
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["title"].endswith("MODIFIED")
    assert ev["start_time"] == "11:30"
    assert ev["time"] == "11:30"
    # verify persisted
    r2 = requests.get(f"{API}/events/{eid}", headers=_admin_h(admin_id), timeout=15)
    assert r2.json()["title"].endswith("MODIFIED")


def test_events_filter_admin_only_hidden_from_employee(admin_id, emp_id):
    # Create admin-only event
    date = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
    payload = {
        "title": "TEST_iter5 Admin Only",
        "category": "meeting",
        "date": date,
        "start_time": "09:00",
        "group_targets": ["admin"],
    }
    r = requests.post(f"{API}/admin/events", json=payload, headers=_admin_h(admin_id), timeout=15)
    assert r.status_code == 200
    admin_only_id = r.json()["id"]
    pytest.event_id_admin = admin_only_id

    # Admin sees it via /events
    r_a = requests.get(f"{API}/events", headers=_admin_h(admin_id), timeout=15).json()
    assert admin_only_id in [e["id"] for e in r_a]

    # Employee must NOT see it
    r_e = requests.get(f"{API}/events", headers=_emp_h(emp_id), timeout=15).json()
    ids = [e["id"] for e in r_e]
    assert admin_only_id not in ids, "Employee should not see admin-only event"


def test_events_filter_ops_visible_to_employee(admin_id, emp_id):
    eid_ops = getattr(pytest, "event_id_ops", None)
    r_e = requests.get(f"{API}/events", headers=_emp_h(emp_id), timeout=15)
    assert r_e.status_code == 200
    ids = [e["id"] for e in r_e.json()]
    # employee (role_category=employe) should see events group_targets=['ops']
    assert eid_ops in ids, "Employee (ops) should see ops-targeted event"


def test_events_filter_all_visible_to_everyone(emp_id, admin_id):
    date = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
    payload = {
        "title": "TEST_iter5 All",
        "category": "info",
        "date": date,
        "start_time": "12:00",
        "group_targets": ["all"],
    }
    r = requests.post(f"{API}/admin/events", json=payload, headers=_admin_h(admin_id), timeout=15)
    assert r.status_code == 200
    eid = r.json()["id"]
    pytest.event_id_all = eid
    r_e = requests.get(f"{API}/events", headers=_emp_h(emp_id), timeout=15).json()
    assert eid in [e["id"] for e in r_e]


def test_admin_delete_events(admin_id):
    for attr in ("event_id_ops", "event_id_admin", "event_id_all"):
        eid = getattr(pytest, attr, None)
        if not eid:
            continue
        r = requests.delete(f"{API}/admin/events/{eid}", headers=_admin_h(admin_id), timeout=15)
        assert r.status_code == 200
        # verify gone via /events/{id}
        r2 = requests.get(f"{API}/events/{eid}", headers=_admin_h(admin_id), timeout=15)
        assert r2.status_code == 404


# ─── Carousel target_type routing


def test_carousel_slide_with_event_target(admin_id):
    # find any existing event
    events = requests.get(f"{API}/admin/events", headers=_admin_h(admin_id), timeout=15).json()
    assert events, "seed events missing"
    target_ev = events[0]
    # create slide targeting that event
    payload = {
        "title": "TEST_iter5 slide event",
        "content": "carousel slide test",
        "featured": True,
        "active": True,
        "cta_text": "Voir",
        "target_type": "event",
        "target_id": target_ev["id"],
    }
    r = requests.post(f"{API}/admin/news", json=payload, headers=_admin_h(admin_id), timeout=15)
    assert r.status_code == 200, r.text
    news = r.json()
    assert news["target_type"] == "event"
    assert news["target_id"] == target_ev["id"]
    # appears in /carousel
    car = requests.get(f"{API}/carousel", headers=_admin_h(admin_id), timeout=15).json()
    assert news["id"] in [n["id"] for n in car]
    # cleanup
    requests.delete(f"{API}/admin/news/{news['id']}", headers=_admin_h(admin_id), timeout=15)


def test_carousel_slide_with_news_target(admin_id):
    all_news = requests.get(f"{API}/news", headers=_admin_h(admin_id), timeout=15).json()
    if not all_news:
        pytest.skip("no seed news to reference")
    target_id = all_news[0]["id"]
    payload = {
        "title": "TEST_iter5 slide news",
        "content": "carousel slide test",
        "featured": True,
        "active": True,
        "cta_text": "Voir",
        "target_type": "news",
        "target_id": target_id,
    }
    r = requests.post(f"{API}/admin/news", json=payload, headers=_admin_h(admin_id), timeout=15)
    assert r.status_code == 200
    news = r.json()
    assert news["target_type"] == "news"
    # cleanup
    requests.delete(f"{API}/admin/news/{news['id']}", headers=_admin_h(admin_id), timeout=15)


def test_admin_endpoints_require_admin(emp_id):
    r = requests.post(
        f"{API}/admin/events",
        json={"title": "x", "date": "2026-01-01", "category": "meeting"},
        headers=_emp_h(emp_id),
        timeout=15,
    )
    assert r.status_code in (401, 403), f"employee should not create events, got {r.status_code}"
