"""Iteration-2 backend tests for MS Park intranet.

Covers the new endpoints / fields shipped in this iteration:
- /me extra fields (badge_*, leave_balance, personal_email, address)
- PUT /me profile updates
- /meal-points/today always credited
- /meal-points/history (7 entries)
- /poles (6 entries)
- /channels/dm  + persistence in /channels
- /schedule/day is_working_day
- /badge/lost  → request created + badge_active false
- Orders with pickup_date + pickup + cancel
- /schedule contains pause_start / pause_end
- /badging contains pause_out / pause_in
- /news returns 6 + special items
"""
from __future__ import annotations

import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://mspark-employee-hub.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ── /me ────────────────────────────────────────────────────────────────────────
class TestMe:
    def test_me_extra_fields(self, s):
        r = s.get(f"{API}/me")
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["badge_number"] == "MSP-2451"
        assert e["badge_expiry"] == "2027-08-15"
        assert e["badge_active"] is True
        assert e["leave_balance"] == {"cp_n_1": 4, "cp_n": 12.5, "rtt": 3}
        assert e["personal_email"] == "idriss.malonga@gmail.com"
        assert "14 rue des Tilleuls" in e["address"]

    def test_put_me_phone(self, s):
        new_phone = "+33 6 99 00 11 22"
        r = s.put(f"{API}/me", json={"phone": new_phone})
        assert r.status_code == 200, r.text
        assert r.json()["phone"] == new_phone
        # verify persistence
        assert s.get(f"{API}/me").json()["phone"] == new_phone
        # restore
        s.put(f"{API}/me", json={"phone": "+33 6 12 34 56 78"})


# ── meal-points ────────────────────────────────────────────────────────────────
class TestMealPoints:
    def test_today_always_credited(self, s):
        r = s.get(f"{API}/meal-points/today")
        assert r.status_code == 200
        d = r.json()
        assert d["credited"] is True
        assert d["credited_points"] == 20
        assert d["daily_quota"] == 20
        assert d["remaining"] <= 20

    def test_history_returns_7(self, s):
        r = s.get(f"{API}/meal-points/history")
        assert r.status_code == 200
        h = r.json()
        assert isinstance(h, list)
        assert len(h) == 7
        for item in h:
            assert "date" in item and "used" in item
            assert isinstance(item["used"], int)


# ── poles ──────────────────────────────────────────────────────────────────────
class TestPoles:
    def test_six_poles(self, s):
        r = s.get(f"{API}/poles")
        assert r.status_code == 200
        poles = r.json()
        ids = {p["id"] for p in poles}
        assert ids == {"managers", "rh", "direction", "restauration", "securite", "maintenance"}
        for p in poles:
            for k in ("name", "email", "phone", "color", "icon"):
                assert p.get(k), f"missing {k} in {p['id']}"


# ── DM channels ────────────────────────────────────────────────────────────────
class TestDM:
    def test_create_dm(self, s):
        r = s.post(f"{API}/channels/dm", json={"employee_id": "emp-sophie"})
        assert r.status_code == 200, r.text
        ch = r.json()
        assert ch.get("is_dm") is True
        assert ch["name"] == "Sophie BERNARD"
        # listed in channels
        all_ch = s.get(f"{API}/channels").json()
        assert any(c["id"] == ch["id"] for c in all_ch)


# ── schedule/day ───────────────────────────────────────────────────────────────
class TestScheduleDay:
    def test_wed_to_sun_working(self, s):
        today = date.today()
        # next Wednesday
        days_to_wed = (2 - today.weekday()) % 7 or 7
        wed = today + timedelta(days=days_to_wed)
        r = s.get(f"{API}/schedule/day", params={"day": wed.isoformat()}).json()
        assert r["is_working_day"] is True
        # next Monday should NOT be working
        days_to_mon = (0 - today.weekday()) % 7 or 7
        mon = today + timedelta(days=days_to_mon)
        r2 = s.get(f"{API}/schedule/day", params={"day": mon.isoformat()}).json()
        assert r2["is_working_day"] is False


# ── schedule pauses ───────────────────────────────────────────────────────────
class TestSchedulePauses:
    def test_pause_fields(self, s):
        items = s.get(f"{API}/schedule").json()
        shifts = [i for i in items if i.get("type") == "shift"]
        assert shifts, "no shift entries"
        for sh in shifts:
            assert "pause_start" in sh and "pause_end" in sh
            assert sh["pause_start"] and sh["pause_end"]


# ── badging pauses ────────────────────────────────────────────────────────────
class TestBadgingPauses:
    def test_pause_in_out(self, s):
        items = s.get(f"{API}/badging", params={"filter_range": "month"}).json()
        past = [b for b in items if b.get("clock_in") and b.get("clock_out")]
        if past:
            assert any(b.get("pause_out") and b.get("pause_in") for b in past), \
                "expected at least one past shift with pause_out and pause_in"


# ── news ──────────────────────────────────────────────────────────────────────
class TestNews:
    def test_six_news(self, s):
        n = s.get(f"{API}/news").json()
        assert len(n) == 6
        titles = " | ".join(x["title"] for x in n)
        assert "Fermeture exceptionnelle" in titles
        assert "alternants" in titles


# ── orders ────────────────────────────────────────────────────────────────────
class TestOrders:
    def _first_product(self, s):
        return s.get(f"{API}/menu", params={"store": "soccer_bar"}).json()[0]

    def test_order_requires_pickup_date(self, s):
        prod = self._first_product(s)
        # Missing pickup_date should fail (422)
        bad = s.post(f"{API}/orders", json={
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "pickup_point": "Soccer Bar",
            "pickup_time": "12:30",
        })
        assert bad.status_code == 422

    def test_create_pickup_cancel(self, s):
        prod = self._first_product(s)
        pdate = date.today().isoformat()
        r = s.post(f"{API}/orders", json={
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "pickup_point": "Soccer Bar",
            "pickup_date": pdate,
            "pickup_time": "12:30",
        })
        assert r.status_code == 200, r.text
        order = r.json()
        assert "id" in order
        # Spec requires pickup_date to be returned/persisted
        assert order.get("pickup_date") == pdate, \
            f"order missing pickup_date — got keys {list(order.keys())}"

        # Listed
        listing = s.get(f"{API}/orders").json()
        assert any(o["id"] == order["id"] for o in listing)

        # Pickup
        pr = s.post(f"{API}/orders/{order['id']}/pickup")
        assert pr.status_code == 200

        # Cancel (create a new one and cancel it)
        r2 = s.post(f"{API}/orders", json={
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "pickup_point": "Soccer Bar",
            "pickup_date": pdate,
            "pickup_time": "13:00",
        })
        oid2 = r2.json()["id"]
        cr = s.post(f"{API}/orders/{oid2}/cancel")
        assert cr.status_code == 200


# ── badge lost  (run LAST because it deactivates the badge) ───────────────────
class TestBadgeLostZ:
    def test_zz_badge_lost(self, s):
        # ensure starting active
        s.get(f"{API}/me").json()
        r = s.post(f"{API}/badge/lost", json={"reason": "Perdu au vestiaire"})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        me = s.get(f"{API}/me").json()
        assert me["badge_active"] is False
        reqs = s.get(f"{API}/requests").json()
        assert any(rq["type"] == "badge_lost" for rq in reqs)
