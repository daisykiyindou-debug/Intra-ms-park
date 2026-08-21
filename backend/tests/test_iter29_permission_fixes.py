"""Iter 29 — Regression checks for the HIGH issues fixed after iteration 28.

Modules covered:
  * permissions: require_permission() granularity (no communication bleed)
  * permissions: view_stats unlocks Overview endpoints
  * admin_update_user: truly-partial PUT (exclude_unset) must not wipe fields
  * cancel_request: 'cp' alias refunds days + removes injected planning entries
  * unchanged behaviour: no perms => 403 ; is_admin/full_admin => allowed
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
    return copy.deepcopy(r.json())


@pytest.fixture(scope="module")
def set_perms(admin):
    """Partial PUT that only sets permissions (relies on exclude_unset fix)."""
    def _set(perms):
        r = admin.put(f"{API}/admin/users/{IDRISS}", json={"permissions": perms})
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert "_id" not in body
        assert sorted(body.get("permissions") or []) == sorted(perms), body.get("permissions")
        return body
    return _set


@pytest.fixture(scope="module", autouse=True)
def restore(admin, original_doc):
    yield
    r = admin.put(f"{API}/admin/users/{IDRISS}", json={
        "permissions": original_doc.get("permissions") or [],
        "admin_role": original_doc.get("admin_role") or "employe",
        "personal_phone": original_doc.get("personal_phone"),
    })
    assert r.status_code == 200, r.text
    assert not (r.json().get("permissions") or [])


# ─── Fix 1: communication permission bleed
class TestCommPermissionBleed:
    def test_publish_news_does_not_grant_events_or_newsletters(self, idriss, admin, set_perms):
        set_perms(["publish_news"])
        ev = idriss.post(f"{API}/admin/events", json={
            "title": "TEST_bleed_event", "date": "2026-12-10", "type": "evenement",
        })
        assert ev.status_code == 403, f"events -> {ev.status_code} {ev.text[:200]}"

        nl = idriss.post(f"{API}/admin/newsletters", json={
            "title": "TEST_bleed_nl", "content": "TEST", "month": "2026-12",
        })
        assert nl.status_code == 403, f"newsletters -> {nl.status_code} {nl.text[:200]}"

        # still allowed on news
        news = idriss.post(f"{API}/admin/news", json={
            "title": "TEST_iter29_news", "content": "TEST content"})
        assert news.status_code == 200, news.text
        body = news.json()
        assert body.get("title") == "TEST_iter29_news"
        assert "_id" not in body
        admin.delete(f"{API}/admin/news/{body['id']}")

    def test_manage_newsletter_does_not_grant_news(self, idriss, set_perms):
        set_perms(["manage_newsletter"])
        n = idriss.post(f"{API}/admin/news", json={"title": "TEST_x", "content": "TEST_x"})
        assert n.status_code == 403, f"news -> {n.status_code}"
        e = idriss.post(f"{API}/admin/events", json={
            "title": "TEST_x", "date": "2026-12-11", "type": "evenement"})
        assert e.status_code == 403, f"events -> {e.status_code}"

    def test_create_events_grants_events_only(self, idriss, admin, set_perms):
        set_perms(["create_events"])
        e = idriss.post(f"{API}/admin/events", json={
            "title": "TEST_iter29_event", "date": "2026-12-12", "type": "evenement"})
        assert e.status_code == 200, e.text
        ev = e.json()
        assert ev["title"] == "TEST_iter29_event"
        assert "_id" not in ev
        assert idriss.post(f"{API}/admin/news", json={"title": "T", "content": "T"}).status_code == 403
        admin.delete(f"{API}/admin/events/{ev['id']}")


# ─── Fix 2: view_stats unlocks Overview
class TestViewStats:
    def test_view_stats_unlocks_overview_endpoints(self, idriss, set_perms):
        set_perms(["view_stats"])
        st = idriss.get(f"{API}/admin/stats")
        assert st.status_code == 200, st.text
        stats = st.json()
        assert isinstance(stats, dict) and stats, stats
        assert "_id" not in stats

        emps = idriss.get(f"{API}/admin/employees")
        assert emps.status_code == 200, emps.text
        assert isinstance(emps.json(), list) and len(emps.json()) > 0

        reqs = idriss.get(f"{API}/admin/requests?status=pending")
        assert reqs.status_code == 200, reqs.text
        assert isinstance(reqs.json(), list)

    def test_view_stats_still_blocked_elsewhere(self, idriss, set_perms):
        set_perms(["view_stats"])
        assert idriss.post(f"{API}/admin/news", json={"title": "T", "content": "T"}).status_code == 403
        assert idriss.get(f"{API}/admin/payslips").status_code == 403
        assert idriss.get(f"{API}/admin/users").status_code == 403


# ─── Fix 3: partial PUT must not wipe fields
class TestPartialUpdate:
    def test_phone_only_put_preserves_flags(self, admin, original_doc):
        # Full-ish save granting perms + admin flags
        full = admin.put(f"{API}/admin/users/{IDRISS}", json={
            "permissions": ["view_stats", "publish_news"],
            "statuses": ["etudiant"],
            "work_days": ["monday", "tuesday", "wednesday"],
            "admin_role": "superadmin",
        })
        assert full.status_code == 200, full.text
        before = full.json()
        assert before["is_admin"] is True
        assert sorted(before["permissions"]) == ["publish_news", "view_stats"]
        assert before["statuses"] == ["etudiant"]
        assert before["work_days"] == ["monday", "tuesday", "wednesday"]

        # Partial phone-only PUT
        part = admin.put(f"{API}/admin/users/{IDRISS}", json={"personal_phone": "0611223344"})
        assert part.status_code == 200, part.text
        after = part.json()
        assert after["personal_phone"] == "0611223344"
        assert sorted(after.get("permissions") or []) == ["publish_news", "view_stats"], after.get("permissions")
        assert after.get("statuses") == ["etudiant"], after.get("statuses")
        assert after.get("work_days") == ["monday", "tuesday", "wednesday"], after.get("work_days")
        assert after.get("is_admin") is True, after.get("is_admin")

        # GET to confirm persistence
        got = admin.get(f"{API}/admin/users/{IDRISS}").json()
        assert got["personal_phone"] == "0611223344"
        assert sorted(got["permissions"]) == ["publish_news", "view_stats"]
        assert got["is_admin"] is True

        # restore
        rst = admin.put(f"{API}/admin/users/{IDRISS}", json={
            "permissions": [], "admin_role": original_doc.get("admin_role") or "employe",
            "statuses": original_doc.get("statuses") or [],
            "work_days": original_doc.get("work_days") or [],
            "personal_phone": original_doc.get("personal_phone"),
        })
        assert rst.status_code == 200
        assert rst.json().get("is_admin") in (False, None)


# ─── Fix 4: cancel of an approved 'cp' request
class TestCancelCpRequest:
    def test_cancel_cp_refunds_and_clears_planning(self, admin, idriss, original_doc):
        start, end = "2027-01-11", "2027-01-12"  # Mon-Tue, future & never materialized

        # Ensure Idriss has a working weekly pattern so the approval can inject
        # leave entries (his seed doc currently has work_days=[]).
        prep = admin.put(f"{API}/admin/users/{IDRISS}", json={
            "work_days": ["monday", "tuesday", "wednesday", "thursday"],
            "usual_hours": "09:00-17:00",
        })
        assert prep.status_code == 200, prep.text
        assert prep.json()["weekly_pattern"]["0"]["type"] == "shift", prep.json()["weekly_pattern"]

        emp_before = admin.get(f"{API}/admin/users/{IDRISS}").json()
        cp_before = float((emp_before.get("leave_balance") or {}).get("cp_n") or 0)

        rq = idriss.post(f"{API}/requests", json={
            "type": "cp", "start_date": start, "end_date": end, "comment": "TEST_iter29_cp"})
        assert rq.status_code in (200, 201), rq.text
        rid = rq.json()["id"]

        ap = admin.post(f"{API}/admin/requests/{rid}/approve", json={"note": "TEST ok"})
        assert ap.status_code == 200, ap.text

        sched = idriss.get(f"{API}/schedule?month=2027-01")
        assert sched.status_code == 200, sched.text
        leave_days = [e["day"] for e in sched.json()
                      if e["type"] == "leave" and start <= e["day"] <= end]
        assert leave_days, "approval did not inject leave entries into the planning"

        req_after_approve = next(x for x in admin.get(f"{API}/admin/requests").json() if x["id"] == rid)
        consumed = float(req_after_approve.get("days_consumed") or 0)
        assert consumed > 0, req_after_approve

        emp_mid = admin.get(f"{API}/admin/users/{IDRISS}").json()
        cp_mid = float((emp_mid.get("leave_balance") or {}).get("cp_n") or 0)
        assert cp_mid == pytest.approx(cp_before - consumed, abs=0.01), (cp_before, cp_mid, consumed)

        # CANCEL
        cn = idriss.post(f"{API}/requests/{rid}/cancel")
        assert cn.status_code == 200, cn.text
        assert cn.json().get("refunded_days") == req_after_approve.get("days_consumed")

        # balance refunded
        emp_after = admin.get(f"{API}/admin/users/{IDRISS}").json()
        cp_after = float((emp_after.get("leave_balance") or {}).get("cp_n") or 0)
        assert cp_after == pytest.approx(cp_before, abs=0.01), (cp_before, cp_after)

        # planning entries removed
        sched2 = idriss.get(f"{API}/schedule?month=2027-01")
        still = [e["day"] for e in sched2.json()
                 if e["type"] == "leave" and start <= e["day"] <= end]
        assert not still, f"leave entries still present after cancel: {still}"

        # status persisted
        req_final = next(x for x in admin.get(f"{API}/admin/requests").json() if x["id"] == rid)
        assert req_final["status"] == "cancelled"

        # restore the original (empty) pattern
        admin.put(f"{API}/admin/users/{IDRISS}", json={
            "work_days": original_doc.get("work_days") or [],
            "usual_hours": original_doc.get("usual_hours") or "",
        })


# ─── Unchanged behaviour
class TestUnchangedBehaviour:
    def test_no_perms_403_everywhere(self, idriss, set_perms):
        set_perms([])
        calls = [
            ("GET", "/admin/stats", None),
            ("GET", "/admin/employees", None),
            ("GET", "/admin/requests", None),
            ("GET", "/admin/users", None),
            ("GET", "/admin/payslips", None),
            ("POST", "/admin/news", {"title": "T", "content": "T"}),
            ("POST", "/admin/events", {"title": "T", "date": "2026-12-20", "type": "evenement"}),
            ("POST", "/admin/newsletters", {"title": "T", "content": "T", "month": "2026-12"}),
        ]
        failures = [f"{m} {p} -> {idriss.request(m, f'{API}{p}', json=b).status_code}"
                    for m, p, b in calls
                    if idriss.request(m, f"{API}{p}", json=b).status_code != 403]
        assert not failures, failures

    def test_full_admin_unlocks_everything(self, idriss, admin, set_perms):
        set_perms(["full_admin"])
        for path in ("/admin/stats", "/admin/employees", "/admin/requests",
                     "/admin/users", "/admin/payslips", "/admin/expenses"):
            r = idriss.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} -> {r.status_code}"
        ev = idriss.post(f"{API}/admin/events", json={
            "title": "TEST_iter29_fa", "date": "2026-12-21", "type": "evenement"})
        assert ev.status_code == 200, ev.text
        admin.delete(f"{API}/admin/events/{ev.json()['id']}")
        set_perms([])

    def test_admin_unlocks_everything(self, admin):
        for path in ("/admin/stats", "/admin/employees", "/admin/users"):
            r = admin.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} -> {r.status_code}"
