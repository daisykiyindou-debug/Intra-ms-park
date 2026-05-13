"""MS Park Intranet — backend API tests (no auth, single hardcoded user)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mspark-employee-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
IDRISS = "emp-idriss-malonga"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------- Identity / employees ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_me(s):
    r = s.get(f"{API}/me")
    assert r.status_code == 200
    me = r.json()
    assert me["id"] == IDRISS
    assert me["first_name"] == "Idriss"
    assert me["last_name"] == "MALONGA"
    assert me["role_category"] == "employe"
    assert me["daily_quota"] == 20
    assert "_id" not in me


def test_employees(s):
    r = s.get(f"{API}/employees")
    assert r.status_code == 200
    emps = r.json()
    assert isinstance(emps, list)
    assert len(emps) == 12
    ids = [e["id"] for e in emps]
    for must in [IDRISS, "emp-sophie", "emp-thomas"]:
        assert must in ids
    for e in emps:
        assert "_id" not in e


# ---------- Dashboard ----------
def test_dashboard(s):
    r = s.get(f"{API}/dashboard")
    assert r.status_code == 200
    d = r.json()
    for key in ["employee", "today_schedule", "live_status", "weather",
                "week_minutes", "presence_rate", "upcoming_schedule",
                "unread_notifications", "documents_count"]:
        assert key in d, f"missing {key}"
    assert d["employee"]["id"] == IDRISS
    assert d["weather"]["city"] == "Paris"
    assert isinstance(d["presence_rate"], int)


# ---------- Schedule ----------
def test_schedule_current_month(s):
    r = s.get(f"{API}/schedule")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) > 0
    types = {it["type"] for it in items}
    assert "shift" in types
    assert "off" in types
    # Check Idriss shifts pattern: wed-sun
    for it in items:
        assert it["employee_id"] == IDRISS
        if it["type"] == "shift":
            assert it["break_minutes"] == 45


def test_schedule_month_param(s):
    r = s.get(f"{API}/schedule", params={"month": "2026-01"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Badging ----------
def test_badging_month(s):
    r = s.get(f"{API}/badging", params={"filter_range": "month"})
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    # likely some anomalies in past
    for it in items:
        assert "day" in it
        assert "_id" not in it


def test_badging_week(s):
    r = s.get(f"{API}/badging", params={"filter_range": "week"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Meal points ----------
def test_meal_points_today(s):
    r = s.get(f"{API}/meal-points/today")
    assert r.status_code == 200
    d = r.json()
    assert d["daily_quota"] == 20
    assert d["role_category"] == "employe"
    assert "remaining" in d and "used" in d and "credited" in d
    assert isinstance(d["transactions"], list)


# ---------- Menu ----------
def test_menu_all(s):
    r = s.get(f"{API}/menu")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) > 0
    stores = {p["store"] for p in items}
    assert {"donut_house", "soccer_bar", "stand_bonbons", "stand_crepes"} <= stores
    p = items[0]
    for k in ["image", "points", "price_eur", "category"]:
        assert k in p


def test_menu_soccer_bar(s):
    r = s.get(f"{API}/menu", params={"store": "soccer_bar"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0
    assert all(p["store"] == "soccer_bar" for p in items)


# ---------- Orders ----------
def test_create_order_and_meal_points_update(s):
    menu = s.get(f"{API}/menu", params={"store": "soccer_bar"}).json()
    assert len(menu) >= 1
    prod = menu[0]
    pre = s.get(f"{API}/meal-points/today").json()
    pre_used = pre["used"]

    payload = {
        "items": [{"product_id": prod["id"], "quantity": 1}],
        "pickup_point": "Soccer Bar",
        "pickup_time": "12:30",
    }
    r = s.post(f"{API}/orders", json=payload)
    assert r.status_code == 200
    o = r.json()
    assert o["pickup_point"] == "Soccer Bar"
    assert o["qr_code"].startswith("MSPARK-ORDER-")
    assert o["total_points"] == prod["points"]
    assert "_id" not in o

    # GET /orders returns it
    orders = s.get(f"{API}/orders").json()
    assert any(x["id"] == o["id"] for x in orders)

    # Meal points usage incremented only if credited
    post = s.get(f"{API}/meal-points/today").json()
    if post["credited"]:
        assert post["used"] >= pre_used


# ---------- Posts ----------
def test_posts_crud_like_comment(s):
    r = s.get(f"{API}/posts")
    assert r.status_code == 200
    posts = r.json()
    assert len(posts) >= 4

    # Create new
    payload = {"content": "TEST_post from pytest", "category": "annonce"}
    r = s.post(f"{API}/posts", json=payload)
    assert r.status_code == 200
    new_p = r.json()
    assert new_p["author_id"] == IDRISS
    pid = new_p["id"]

    # Toggle like (adds Idriss)
    r = s.post(f"{API}/posts/{pid}/like")
    assert r.status_code == 200
    assert IDRISS in r.json()["likes"]
    # Toggle again removes
    r = s.post(f"{API}/posts/{pid}/like")
    assert IDRISS not in r.json()["likes"]

    # Add comment
    r = s.post(f"{API}/posts/{pid}/comments", json={"content": "TEST_comment"})
    assert r.status_code == 200
    c = r.json()
    assert c["author_id"] == IDRISS
    assert c["content"] == "TEST_comment"


# ---------- HR Requests ----------
def test_requests_list_and_create_and_filter(s):
    r = s.get(f"{API}/requests")
    assert r.status_code == 200
    base = r.json()
    assert isinstance(base, list)

    # Filter approved
    r = s.get(f"{API}/requests", params={"status": "approved"})
    assert r.status_code == 200
    approved = r.json()
    assert all(x["status"] == "approved" for x in approved)
    assert len(approved) >= 1

    # Create
    payload = {"type": "conge", "start_date": "2026-03-01", "end_date": "2026-03-02", "comment": "TEST_req"}
    r = s.post(f"{API}/requests", json=payload)
    assert r.status_code == 200
    new_r = r.json()
    assert new_r["status"] == "pending"
    assert new_r["type"] == "conge"


# ---------- Documents ----------
def test_documents(s):
    r = s.get(f"{API}/documents")
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) >= 7
    cats = {d["category"] for d in docs}
    assert "Paie" in cats

    r = s.get(f"{API}/documents", params={"category": "Paie"})
    assert r.status_code == 200
    assert all(d["category"] == "Paie" for d in r.json())


# ---------- Notifications ----------
def test_notifications_flow(s):
    r = s.get(f"{API}/notifications")
    assert r.status_code == 200
    notifs = r.json()
    assert len(notifs) >= 5
    # find unread
    unread = [n for n in notifs if not n["read"]]
    if unread:
        nid = unread[0]["id"]
        r = s.post(f"{API}/notifications/{nid}/read")
        assert r.status_code == 200

    r = s.post(f"{API}/notifications/read-all")
    assert r.status_code == 200
    after = s.get(f"{API}/notifications").json()
    assert all(n["read"] for n in after)


# ---------- Partners ----------
def test_partners(s):
    r = s.get(f"{API}/partners")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 6
    for p in items:
        assert "qr_code" in p and p["qr_code"]


# ---------- Channels / messages ----------
def test_channels(s):
    r = s.get(f"{API}/channels")
    assert r.status_code == 200
    chs = r.json()
    ids = {c["id"] for c in chs}
    assert "ch-accueil" in ids and "ch-roller" in ids


def test_channel_messages_and_post(s):
    r = s.get(f"{API}/channels/ch-accueil/messages")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    r = s.post(f"{API}/channels/ch-accueil/messages", json={"content": "TEST_msg"})
    assert r.status_code == 200
    msg = r.json()
    assert msg["author_id"] == IDRISS
    after = s.get(f"{API}/channels/ch-accueil/messages").json()
    assert any(m["id"] == msg["id"] for m in after)


# ---------- Events & news ----------
def test_events(s):
    r = s.get(f"{API}/events")
    assert r.status_code == 200
    assert len(r.json()) >= 5


def test_news(s):
    r = s.get(f"{API}/news")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 4
    for n in items:
        for k in ["title", "image", "summary"]:
            assert k in n
