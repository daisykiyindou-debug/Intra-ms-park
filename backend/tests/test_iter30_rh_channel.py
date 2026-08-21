"""Iter 30 — 'Service RH' identity for payslip DMs + welcome DM on user creation.

Modules covered:
  * admin_send_payslip -> DM in rh-{uid} channel, author 'Service RH' (system-rh)
  * admin_create_user  -> welcome DM with 7 link attachments
  * regressions: Sophie channels, Marcus ch-accueil, new user isolation,
    payslip preview gross for Marcus
"""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

MARCUS = "emp-marcus-simeo"
IDRISS = "emp-idriss-malonga"
SOPHIE = "8baf45d6-df9e-4449-b4a9-a588090c6974"

EXPECTED_LINKS = [
    "Mes documents RH",
    "Règlement intérieur",
    "Mon planning",
    "Badgeage",
    "Poser un congé",
    "Points repas & Restauration",
    "CSE & Avantages",
]


def s(emp_id):
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", "X-Employee-Id": emp_id})
    return sess


@pytest.fixture(scope="module")
def admin():
    return s(MARCUS)


@pytest.fixture(scope="module")
def idriss():
    return s(IDRISS)


@pytest.fixture(scope="module")
def state():
    return {}


@pytest.fixture(scope="module", autouse=True)
def pre_cleanup(admin):
    """Make the suite re-runnable: drop artifacts left by a previous run."""
    # existing 10/2026 payslip for Idriss
    r = admin.get(f"{API}/admin/payslips", params={"year": 2026})
    if r.status_code == 200 and isinstance(r.json(), list):
        for p in r.json():
            if p.get("employee_id") == IDRISS and p.get("month") == 10:
                admin.delete(f"{API}/admin/payslips/{p['id']}")
    # existing QA user
    r = admin.get(f"{API}/admin/users")
    if r.status_code == 200 and isinstance(r.json(), list):
        for u in r.json():
            if u.get("last_name") == "TestQA":
                admin.delete(f"{API}/admin/users/{u['id']}")
    yield


# ─────────────── auth sanity
class TestAuth:
    def test_login_idriss(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "idriss.malonga@gmail.com", "password": "Idriss2026!"})
        assert r.status_code == 200, r.text
        assert r.json()["employee_id"] == IDRISS

    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "marcus.simeo@mspark.fr", "password": "MSPark@Admin2026!"})
        assert r.status_code == 200, r.text
        assert r.json()["is_admin"] is True

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "idriss.malonga@gmail.com", "password": "wrong"})
        assert r.status_code == 401


# ─────────────── BUG: payslip DM comes from Service RH
class TestPayslipRhDm:
    def test_create_payslip(self, admin, state):
        r = admin.post(f"{API}/admin/payslips", json={
            "employee_id": IDRISS, "year": 2026, "month": 10})
        assert r.status_code in (200, 201), r.text
        p = r.json()
        assert "_id" not in p
        assert p["employee_id"] == IDRISS
        state["pid"] = p["id"]

    def test_send_payslip(self, admin, state):
        pid = state["pid"]
        r = admin.post(f"{API}/admin/payslips/{pid}/send")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "sent"

    def test_rh_channel_visible_to_employee(self, idriss, state):
        r = idriss.get(f"{API}/channels")
        assert r.status_code == 200, r.text
        chans = r.json()
        rh = [c for c in chans if c["id"] == f"rh-{IDRISS}"]
        assert rh, [c["id"] for c in chans]
        ch = rh[0]
        state["rh_channel"] = ch
        assert ch["name"] == "Service RH", ch
        assert ch.get("is_official") is True
        assert ch.get("unread", 0) >= 1

    def test_rh_message_authored_by_service_rh(self, idriss, state):
        cid = f"rh-{IDRISS}"
        r = idriss.get(f"{API}/channels/{cid}/messages")
        assert r.status_code == 200, r.text
        msgs = r.json()
        assert msgs, "no messages in RH channel"
        last = msgs[-1]
        assert last["author_id"] == "system-rh", last
        assert last["author_name"] == "Service RH", last
        atts = last.get("attachments") or []
        assert len(atts) == 1, atts
        assert atts[0]["kind"] == "payslip"
        assert atts[0]["name"] == "Fiche de paie — Octobre 2026", atts[0]
        assert atts[0]["url"] == f"/documents/payslip/{IDRISS}/2026/10"
        assert atts[0]["payslip_id"] == state["pid"]

    def test_payslip_link_resolves(self, idriss, state):
        r = idriss.get(f"{API}/payslips/{IDRISS}/2026/10")
        if r.status_code == 404:
            r = idriss.get(f"{API}/payslips/mine")
            assert r.status_code == 200, r.text
            found = [p for p in r.json() if p["year"] == 2026 and p["month"] == 10]
            assert found, r.json()
        else:
            assert r.status_code == 200, r.text

    def test_payslip_document_created(self, idriss):
        r = idriss.get(f"{API}/documents")
        assert r.status_code == 200, r.text
        docs = r.json()
        assert any(d.get("name") == "Fiche de paie — Octobre 2026" for d in docs), \
            [d.get("name") for d in docs][:20]

    def test_notification_pushed(self, idriss):
        r = idriss.get(f"{API}/notifications")
        assert r.status_code == 200, r.text
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert any((i.get("title") or "") == "Service RH" for i in items), items[:5]


# ─────────────── FEATURE: welcome DM on user creation
class TestWelcomeDm:
    def test_create_user(self, admin, state):
        r = admin.post(f"{API}/admin/users", json={
            "first_name": "Léa", "last_name": "TestQA",
            "personal_email": "lea.testqa@gmail.com",
            "personal_phone": "0600001111",
            "department": "RH", "role": "Assistante",
            "weekly_hours": "35h", "statuses": ["bureau"],
            "gross_salary": 2200,
        })
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("temp_password"), body
        assert "_id" not in body.get("user", {})
        state["lea_id"] = body["user"]["id"]
        state["lea_pwd"] = body["temp_password"]
        state["lea_email"] = body["user"].get("personal_email")

    def test_lea_can_login(self, state):
        r = requests.post(f"{API}/auth/login", json={
            "email": "lea.testqa@gmail.com", "password": state["lea_pwd"]})
        assert r.status_code == 200, r.text
        assert r.json()["employee_id"] == state["lea_id"]

    def test_lea_has_exactly_one_rh_channel(self, state):
        cl = s(state["lea_id"])
        r = cl.get(f"{API}/channels")
        assert r.status_code == 200, r.text
        chans = r.json()
        assert len(chans) == 1, [c["id"] for c in chans]
        ch = chans[0]
        assert ch["id"] == f"rh-{state['lea_id']}"
        assert ch["name"] == "Service RH"
        assert ch["unread"] == 1, ch

    def test_welcome_message_content(self, state):
        cl = s(state["lea_id"])
        r = cl.get(f"{API}/channels/rh-{state['lea_id']}/messages")
        assert r.status_code == 200, r.text
        msgs = r.json()
        assert len(msgs) == 1, msgs
        m = msgs[0]
        assert m["author_id"] == "system-rh"
        assert m["author_name"] == "Service RH"
        assert "Léa" in m["content"]
        atts = m.get("attachments") or []
        assert len(atts) == 7, atts
        assert [a["name"] for a in atts] == EXPECTED_LINKS
        for a in atts:
            assert a["kind"] == "link", a
            assert a["url"].startswith("/"), a

    def test_new_user_does_not_see_team_channels(self, state):
        cl = s(state["lea_id"])
        r = cl.get(f"{API}/channels")
        ids = [c["id"] for c in r.json()]
        assert "ch-accueil" not in ids, ids

    def test_new_user_cannot_read_foreign_channel(self, state):
        cl = s(state["lea_id"])
        r = cl.get(f"{API}/channels/ch-accueil/messages")
        assert r.status_code == 403, r.status_code


# ─────────────── Regressions
class TestRegressions:
    def test_marcus_sees_accueil(self, admin):
        r = admin.get(f"{API}/channels/ch-accueil/messages")
        assert r.status_code == 200, r.text

    def test_sophie_channels_intact(self):
        r = s(SOPHIE).get(f"{API}/channels")
        assert r.status_code == 200, r.text
        # NOTE: Sophie (wizard-created BEFORE this iteration) has 0 channels by
        # design — new-user isolation. The endpoint must still answer 200 [].
        assert isinstance(r.json(), list)

    def test_payslip_preview_marcus_gross(self, admin):
        r = admin.post(f"{API}/admin/payslips/preview", json={
            "employee_id": MARCUS, "year": 2026, "month": 11})
        assert r.status_code == 200, r.text
        gross = r.json()["totals"]["gross"]
        assert abs(float(gross) - 4549) < 5, gross


# ─────────────── Cleanup
class TestCleanup:
    def test_delete_payslip(self, admin, state):
        pid = state.get("pid")
        if not pid:
            pytest.skip("no payslip created")
        r = admin.delete(f"{API}/admin/payslips/{pid}")
        assert r.status_code in (200, 204), r.text

    def test_delete_lea(self, admin, state):
        uid = state.get("lea_id")
        if not uid:
            pytest.skip("no user created")
        r = admin.delete(f"{API}/admin/users/{uid}")
        assert r.status_code in (200, 204), r.text
