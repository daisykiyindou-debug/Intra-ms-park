"""Iter4 backend tests for MS Park intranet.

Covers: /api/auth/login, /api/me, /api/carousel, /api/admin/* (schedule,
contract-status, requests approve auto-sync, leave/grant, news CRUD),
/api/orders same-day enforcement.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

EMP_ID = "emp-idriss-malonga"
ADMIN_ID = "emp-marcus-simeo"

H_EMP = {"X-Employee-Id": EMP_ID, "Content-Type": "application/json"}
H_ADM = {"X-Employee-Id": ADMIN_ID, "Content-Type": "application/json"}


class TestAuth:
    def test_login_employee_ok(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "idriss.malonga@gmail.com", "password": "Idriss2026!"})
        assert r.status_code == 200
        d = r.json()
        assert d["employee_id"] == EMP_ID and d["is_admin"] is False

    def test_login_admin_ok(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "marcus.simeo@mspark.fr", "password": "MSPark@Admin2026!"})
        assert r.status_code == 200 and r.json()["is_admin"] is True

    def test_login_bad_password_should_reject(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "idriss.malonga@gmail.com", "password": "wrong-xyz"})
        assert r.status_code == 401, f"got {r.status_code}: {r.text}"

    def test_login_unknown_email(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "nobody@example.com", "password": "x"})
        assert r.status_code == 401


class TestMeCarousel:
    def test_me_employee(self):
        r = requests.get(f"{API}/me", headers=H_EMP)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == EMP_ID and d["contract_hours_weekly"] == 24

    def test_me_admin(self):
        r = requests.get(f"{API}/me", headers=H_ADM)
        assert r.status_code == 200 and r.json()["is_admin"] is True

    def test_carousel_featured_only(self):
        r = requests.get(f"{API}/carousel", headers=H_EMP)
        assert r.status_code == 200
        for it in r.json():
            assert it.get("featured") and it.get("active")


class TestPlanningAdmin:
    day = (date.today() + timedelta(days=30)).isoformat()

    def test_admin_requires_admin(self):
        r = requests.get(f"{API}/admin/employees", headers=H_EMP)
        assert r.status_code in (401, 403)

    def test_admin_employees_ok(self):
        r = requests.get(f"{API}/admin/employees", headers=H_ADM)
        assert r.status_code == 200
        assert any(e["id"] == EMP_ID for e in r.json())

    def test_planning_crud(self):
        payload = {"employee_id": EMP_ID, "day": self.day, "type": "shift",
                   "start": "12:00", "end": "17:00", "note": "TEST_iter4"}
        r = requests.post(f"{API}/admin/schedule", headers=H_ADM, json=payload)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        r = requests.get(f"{API}/admin/schedule/{EMP_ID}", headers=H_ADM)
        m = [e for e in r.json() if e["day"] == self.day]
        assert m and m[0]["start"] == "12:00"

        payload2 = dict(payload, type="off", start=None, end=None)
        assert requests.post(f"{API}/admin/schedule", headers=H_ADM, json=payload2).status_code == 200
        r = requests.get(f"{API}/admin/schedule/{EMP_ID}", headers=H_ADM)
        m = [e for e in r.json() if e["day"] == self.day]
        assert m[0]["type"] == "off"

        assert requests.delete(f"{API}/admin/schedule/{sid}", headers=H_ADM).status_code == 200
        r = requests.get(f"{API}/admin/schedule/{EMP_ID}", headers=H_ADM)
        assert not any(e["day"] == self.day for e in r.json())

    def test_contract_status(self):
        r = requests.get(f"{API}/admin/contract-status/{EMP_ID}", headers=H_ADM)
        assert r.status_code == 200


class TestAutoSyncLeave:
    def test_approve_cp_syncs_planning_and_counter(self):
        start = date.today() + timedelta(days=45)
        end = start + timedelta(days=1)
        r = requests.post(f"{API}/requests", headers=H_EMP, json={
            "type": "cp", "start_date": start.isoformat(),
            "end_date": end.isoformat(), "reason": "TEST_iter4"})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        bal = requests.get(f"{API}/me", headers=H_EMP).json()["leave_balance"]
        total_before = float(bal.get("cp_n_1") or 0) + float(bal.get("cp_n") or 0)

        r = requests.post(f"{API}/admin/requests/{rid}/approve",
                          headers=H_ADM, json={"note": "OK"})
        assert r.status_code == 200, r.text

        entries = {e["day"]: e for e in requests.get(
            f"{API}/admin/schedule/{EMP_ID}", headers=H_ADM).json()}
        for offset in (0, 1):
            d = (start + timedelta(days=offset)).isoformat()
            assert d in entries and entries[d]["type"] == "leave"

        bal2 = requests.get(f"{API}/me", headers=H_EMP).json()["leave_balance"]
        total_after = float(bal2.get("cp_n_1") or 0) + float(bal2.get("cp_n") or 0)
        assert round(total_before - total_after, 1) == 2.0

        # cleanup
        for e in requests.get(f"{API}/admin/schedule/{EMP_ID}", headers=H_ADM).json():
            if e["day"] in [(start + timedelta(days=o)).isoformat() for o in (0, 1)]:
                requests.delete(f"{API}/admin/schedule/{e['id']}", headers=H_ADM)


class TestLeaveGrant:
    def test_grant_rtt_increments_counter(self):
        before = float(requests.get(f"{API}/me", headers=H_EMP).json()["leave_balance"].get("rtt") or 0)
        r = requests.post(f"{API}/admin/leave/grant", headers=H_ADM, json={
            "employee_ids": [EMP_ID], "type": "rtt", "days": 2, "note": "TEST_iter4"})
        assert r.status_code == 200, r.text
        after = float(requests.get(f"{API}/me", headers=H_EMP).json()["leave_balance"].get("rtt") or 0)
        assert round(after - before, 1) == 2.0
        # rollback
        requests.post(f"{API}/admin/leave/grant", headers=H_ADM, json={
            "employee_ids": [EMP_ID], "type": "rtt", "days": -2, "note": "rollback"})


class TestNews:
    def test_news_carousel_toggle(self):
        r = requests.post(f"{API}/admin/news", headers=H_ADM, json={
            "title": f"TEST_iter4 {uuid.uuid4().hex[:6]}",
            "content": "test", "category": "Événement",
            "image": "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200",
            "featured": True, "active": True, "order": 99})
        assert r.status_code == 200, r.text
        nid = r.json()["id"]

        assert any(n["id"] == nid for n in requests.get(f"{API}/carousel", headers=H_EMP).json())

        r = requests.put(f"{API}/admin/news/{nid}", headers=H_ADM, json={"featured": False})
        assert r.status_code == 200
        assert not any(n["id"] == nid for n in requests.get(f"{API}/carousel", headers=H_EMP).json())

        assert requests.delete(f"{API}/admin/news/{nid}", headers=H_ADM).status_code == 200


class TestOrdersSameDay:
    def test_future_pickup_rejected(self):
        r = requests.get(f"{API}/menu", headers=H_EMP)
        if r.status_code != 200:
            pytest.skip("No menu endpoint")
        data = r.json()
        products = data if isinstance(data, list) else (data.get("products") or data.get("items") or [])
        # flatten if grouped
        if products and isinstance(products[0], dict) and "products" in products[0]:
            products = [p for g in products for p in g.get("products", [])]
        if not products:
            pytest.skip("No products")
        p = products[0]
        future = (date.today() + timedelta(days=2)).isoformat()
        r = requests.post(f"{API}/orders", headers=H_EMP, json={
            "items": [{"product_id": p["id"], "quantity": 1}],
            "pickup_point": p.get("store", "restaurant"),
            "pickup_date": future, "pickup_time": "12:30"})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
