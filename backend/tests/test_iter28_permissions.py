"""Iter 28 — Granular permission enforcement + user data sync (payslips).

Covers:
  * Module: permissions (require_permission / _has_permission)
    - Employee without permissions gets 403 on every admin endpoint
    - Incremental grants: view_payslips, publish_news, manage_users,
      approve_leaves, approve_recovery
  * Module: payslip sync (_resolve_pay_basis / _generate_payslip)
    - gross_salary / hourly_rate / weekly_hours propagated to payslip
  * Cleanup: Idriss restored to his original seed document
"""
import os
import copy

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

IDRISS = "emp-idriss-malonga"
MARCUS = "emp-marcus-simeo"

# Fields accepted by UserUpdate (mirrors UserCreate) — we resend the full doc so
# a PUT does not silently wipe unrelated fields.
UPDATE_FIELDS = [
    "first_name", "last_name", "birth_date", "email", "personal_email", "phone",
    "personal_phone", "address", "postal_code", "city", "country", "avatar",
    "account_status", "statuses", "department", "role", "manager_id",
    "contract_type", "weekly_hours", "hire_date", "contract_end_date",
    "category", "badge_rfid", "badge_expiry", "badge_active", "locker",
    "work_days", "off_days", "usual_hours", "break_time", "gross_salary",
    "net_salary", "hourly_rate", "iban", "bic", "account_holder", "meal_points",
    "contract_url", "admin_role", "permissions", "groups", "role_category",
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
def original_doc(admin):
    r = admin.get(f"{API}/admin/users/{IDRISS}")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def set_perms(admin, original_doc):
    """Return a helper that sets Idriss' permissions (plus optional extra fields)."""
    def _set(perms, **extra):
        payload = {k: original_doc.get(k) for k in UPDATE_FIELDS if original_doc.get(k) is not None}
        payload["permissions"] = perms
        payload.update(extra)
        r = admin.put(f"{API}/admin/users/{IDRISS}", json=payload)
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert "_id" not in body
        assert sorted(body.get("permissions") or []) == sorted(perms), body.get("permissions")
        return body
    return _set


@pytest.fixture(scope="module", autouse=True)
def restore_idriss(admin, original_doc):
    yield
    payload = {k: v for k, v in copy.deepcopy(original_doc).items() if k in UPDATE_FIELDS and v is not None}
    payload["permissions"] = original_doc.get("permissions") or []
    # PUT cannot unset fields; send 0 so the payslip falls back to derived values
    payload["gross_salary"] = original_doc.get("gross_salary") or 0
    payload["hourly_rate"] = original_doc.get("hourly_rate") or 0
    r = admin.put(f"{API}/admin/users/{IDRISS}", json=payload)
    assert r.status_code == 200, r.text


# ─── Module: baseline — no permissions ⇒ 403 everywhere
FORBIDDEN_CALLS = [
    ("GET", "/admin/payslips", None),
    ("POST", "/admin/news", {"title": "TEST_x", "content": "TEST_x"}),
    ("POST", "/admin/documents", {"name": "TEST_doc", "category": "Autre"}),
    ("GET", "/admin/requests", None),
    ("GET", "/admin/expenses", None),
    ("GET", "/admin/users", None),
]


class TestPermissions:
    def test_00_no_permissions_all_admin_endpoints_403(self, idriss, set_perms):
        set_perms([])
        failures = []
        for method, path, body in FORBIDDEN_CALLS:
            r = idriss.request(method, f"{API}{path}", json=body)
            if r.status_code != 403:
                failures.append(f"{method} {path} -> {r.status_code} {r.text[:120]}")
        assert not failures, failures

    def test_01_view_payslips_grants_payslips_only(self, idriss, set_perms):
        set_perms(["view_payslips"])
        r = idriss.get(f"{API}/admin/payslips")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
        # still blocked on news
        rn = idriss.post(f"{API}/admin/news", json={"title": "TEST_nope", "content": "TEST_nope"})
        assert rn.status_code == 403, rn.text
        # and on users
        assert idriss.get(f"{API}/admin/users").status_code == 403

    def test_02_publish_news_grants_news_post(self, admin, idriss, set_perms):
        set_perms(["publish_news"])
        r = idriss.post(f"{API}/admin/news", json={"title": "TEST_perm_news", "content": "TEST content"})
        assert r.status_code == 200, r.text
        created = r.json()
        assert created.get("title") == "TEST_perm_news"
        assert "_id" not in created
        nid = created.get("id")
        assert nid
        # payslips now blocked again
        assert idriss.get(f"{API}/admin/payslips").status_code == 403
        # cleanup
        admin.delete(f"{API}/admin/news/{nid}")

    def test_03_manage_users_grants_user_admin(self, admin, idriss, set_perms):
        set_perms(["manage_users"])
        r = idriss.get(f"{API}/admin/users")
        assert r.status_code == 200, r.text
        assert len(r.json()) > 0
        rc = idriss.post(f"{API}/admin/users", json={
            "first_name": "TEST_Perm", "last_name": "User",
            "personal_email": "test_perm_user@example.test",
            "personal_phone": "0600000000",
            "weekly_hours": "24h", "admin_role": "employe",
        })
        assert rc.status_code == 200, rc.text
        created = rc.json()["user"]
        assert created["first_name"] == "TEST_Perm"
        new_id = created["id"]
        get_r = idriss.get(f"{API}/admin/users/{new_id}")
        assert get_r.status_code == 200
        assert get_r.json()["personal_email"] == "test_perm_user@example.test"
        # cleanup
        d = admin.delete(f"{API}/admin/users/{new_id}")
        assert d.status_code in (200, 204)

    def test_04_approve_leaves_grants_cp_approval(self, admin, idriss, set_perms):
        set_perms(["approve_leaves"])
        assert idriss.get(f"{API}/admin/requests").status_code == 200
        # create a cp request as an employee (Idriss himself)
        rq = idriss.post(f"{API}/requests", json={
            "type": "cp", "start_date": "2026-11-02", "end_date": "2026-11-03",
            "comment": "TEST_perm_cp",
        })
        assert rq.status_code in (200, 201), rq.text
        rid = rq.json().get("id")
        assert rid
        ap = idriss.post(f"{API}/admin/requests/{rid}/approve", json={"note": "TEST ok"})
        assert ap.status_code == 200, ap.text
        lst = idriss.get(f"{API}/admin/requests?status=approved").json()
        assert any(x["id"] == rid for x in lst)

    def test_05_approve_recovery_only_covers_recuperation(self, idriss, set_perms):
        set_perms(["approve_recovery"])
        # cp request must be refused
        rq_cp = idriss.post(f"{API}/requests", json={
            "type": "cp", "start_date": "2026-11-09", "end_date": "2026-11-10",
            "comment": "TEST_perm_cp2",
        })
        assert rq_cp.status_code in (200, 201), rq_cp.text
        cp_id = rq_cp.json()["id"]
        r_cp = idriss.post(f"{API}/admin/requests/{cp_id}/approve", json={})
        assert r_cp.status_code == 403, f"approve_recovery must NOT approve cp: {r_cp.status_code}"

        rq_rec = idriss.post(f"{API}/requests", json={
            "type": "recuperation", "start_date": "2026-11-16", "end_date": "2026-11-16",
            "comment": "TEST_perm_rec",
        })
        assert rq_rec.status_code in (200, 201), rq_rec.text
        rec_id = rq_rec.json()["id"]
        r_rec = idriss.post(f"{API}/admin/requests/{rec_id}/approve", json={})
        assert r_rec.status_code == 200, r_rec.text

    def test_06_full_admin_permission_unlocks_everything(self, idriss, set_perms):
        set_perms(["full_admin"])
        for path in ("/admin/payslips", "/admin/requests", "/admin/expenses", "/admin/users"):
            r = idriss.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} -> {r.status_code}"

    def test_07_reset_permissions_back_to_403(self, idriss, set_perms):
        set_perms([])
        for method, path, body in FORBIDDEN_CALLS:
            r = idriss.request(method, f"{API}{path}", json=body)
            assert r.status_code == 403, f"{method} {path} -> {r.status_code}"


# ─── Module: payslip data sync
class TestPayslipSync:
    def test_08_salary_fields_sync_into_payslip(self, admin, idriss, set_perms):
        set_perms([], gross_salary=2400, hourly_rate=15.5, weekly_hours="28h")
        # verify persisted derivation
        u = admin.get(f"{API}/admin/users/{IDRISS}").json()
        assert u["gross_salary"] == 2400
        assert u["hourly_rate"] == 15.5
        assert u["contract_hours_weekly"] == 28, u.get("contract_hours_weekly")

        r = idriss.get(f"{API}/payslip/{IDRISS}/2026/1")
        assert r.status_code == 200, r.text
        p = r.json()
        assert "_id" not in p
        assert p["totals"]["gross"] == 2400, p["totals"]
        assert p["worked"]["hourly_rate"] == 15.5, p["worked"]
        assert p["worked"]["contract_hours_weekly"] == 28, p["worked"]

    def test_09_employee_cannot_read_other_payslip(self, idriss, set_perms):
        set_perms([])
        r = idriss.get(f"{API}/payslip/{MARCUS}/2026/1")
        assert r.status_code == 403, r.status_code

    def test_10_view_payslips_allows_other_payslip(self, idriss, set_perms):
        set_perms(["view_payslips"])
        r = idriss.get(f"{API}/payslip/{MARCUS}/2026/1")
        assert r.status_code == 200, r.text
        set_perms([])
