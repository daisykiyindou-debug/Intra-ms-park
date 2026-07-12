"""Iter4 — MS Park API tests for the latest spec changes.

Focus: pickup_date=today enforcement, channels/group endpoint, /me, /menu, /orders happy path.
"""
import os
from datetime import date, datetime, timedelta

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def first_product(s):
    r = s.get(f"{API}/menu?store=soccer_bar")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    return data[0]


# ───────── /me
def test_me_returns_employee(s):
    r = s.get(f"{API}/me")
    assert r.status_code == 200
    d = r.json()
    assert "personal_email" in d
    assert d["first_name"]
    assert d["last_name"]


def test_put_me_updates_personal_email(s):
    original = s.get(f"{API}/me").json()
    new_email = "TEST_idriss.malonga@gmail.com"
    r = s.put(f"{API}/me", json={"personal_email": new_email})
    assert r.status_code == 200
    assert r.json()["personal_email"] == new_email
    # Verify persistence
    r2 = s.get(f"{API}/me").json()
    assert r2["personal_email"] == new_email
    # Restore
    s.put(f"{API}/me", json={"personal_email": original.get("personal_email", "idriss.malonga@gmail.com")})


# ───────── /orders — same-day-only enforcement
def test_order_rejected_past_date(s, first_product):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    payload = {
        "items": [{"product_id": first_product["id"], "quantity": 1}],
        "pickup_point": first_product["store"],
        "pickup_date": yesterday,
        "pickup_time": "12:00",
    }
    r = s.post(f"{API}/orders", json=payload)
    assert r.status_code == 400
    body = r.json()
    msg = body.get("detail") or body.get("message") or ""
    assert "jour même" in msg or "jour meme" in msg.lower() or "same" in msg.lower(), f"unexpected: {body}"


def test_order_rejected_future_date(s, first_product):
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    payload = {
        "items": [{"product_id": first_product["id"], "quantity": 1}],
        "pickup_point": first_product["store"],
        "pickup_date": tomorrow,
        "pickup_time": "12:00",
    }
    r = s.post(f"{API}/orders", json=payload)
    assert r.status_code == 400


def test_order_today_success(s, first_product):
    today = date.today().isoformat()
    # use time +2h to be safely after the +1h minimum
    pickup = (datetime.now() + timedelta(hours=2)).strftime("%H:%M")
    payload = {
        "items": [{"product_id": first_product["id"], "quantity": 1}],
        "pickup_point": first_product["store"],
        "pickup_date": today,
        "pickup_time": pickup,
    }
    r = s.post(f"{API}/orders", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "preparing"
    assert d["qr_code"].startswith("MSPARK-ORDER-")
    assert d["pickup_date"] == today


# ───────── /channels/group
def test_channels_group_creation(s):
    # Need at least 1 member_id — grab from /employees
    emps = s.get(f"{API}/employees").json()
    assert isinstance(emps, list) and len(emps) >= 2
    members = [e["id"] for e in emps[:2]]
    payload = {"name": "TEST_iter4_group", "member_ids": members}
    r = s.post(f"{API}/channels/group", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("is_group") is True
    assert d["name"] == "TEST_iter4_group"


# ───────── /menu sanity
def test_menu_returns_products(s):
    r = s.get(f"{API}/menu?store=donut_house")
    assert r.status_code == 200
    items = r.json()
    assert all("store" in p for p in items)
    assert all(p["store"] == "donut_house" for p in items)


# ───────── meal points
def test_meal_points_today(s):
    r = s.get(f"{API}/meal-points/today")
    assert r.status_code == 200
    d = r.json()
    assert "remaining" in d
    assert isinstance(d["remaining"], int)
