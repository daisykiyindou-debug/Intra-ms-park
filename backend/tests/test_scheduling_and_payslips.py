"""Backend tests for iter23:
- Scheduled publishing of Actualités (posts) & Newsletters
- Full payslip management (CRUD + preview + send)
"""
import os
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

ADMIN = "emp-marcus-simeo"
EMP = "emp-idriss-malonga"


def h(eid):
    return {"X-Employee-Id": eid, "Content-Type": "application/json"}


def iso_in(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


# ────────────────────────────── Posts scheduling ──────────────────────────────

class TestScheduledPosts:
    def test_scheduled_post_hidden_from_employee_visible_to_admin(self):
        future = iso_in(300)
        r = requests.post(f"{BASE_URL}/posts", headers=h(ADMIN), json={
            "title": "TEST_SCHED post future", "content": "hello", "category": "annonce",
            "publish_at": future,
        })
        assert r.status_code == 200, r.text
        post = r.json()
        assert post["publish_at"] == future
        pid = post["id"]

        # Admin sees it with is_scheduled=true
        admin_list = requests.get(f"{BASE_URL}/posts", headers=h(ADMIN)).json()
        me = next((p for p in admin_list if p["id"] == pid), None)
        assert me is not None, "admin should see own scheduled post"
        assert me.get("is_scheduled") is True

        # Employee does NOT see it
        emp_list = requests.get(f"{BASE_URL}/posts", headers=h(EMP)).json()
        assert not any(p["id"] == pid for p in emp_list), "employee should not see future post"

        # Employee GET by id returns 404
        r2 = requests.get(f"{BASE_URL}/posts/{pid}", headers=h(EMP))
        assert r2.status_code == 404

        # Admin GET by id returns 200 with is_scheduled true
        r3 = requests.get(f"{BASE_URL}/posts/{pid}", headers=h(ADMIN))
        assert r3.status_code == 200
        assert r3.json().get("is_scheduled") is True

        # Cleanup
        requests.delete(f"{BASE_URL}/posts/{pid}", headers=h(ADMIN))

    def test_published_immediately_when_publish_at_past_or_null(self):
        # publish_at null → immediate visibility
        r = requests.post(f"{BASE_URL}/posts", headers=h(ADMIN), json={
            "title": "TEST_SCHED immediate", "content": "hi", "category": "annonce",
        })
        assert r.status_code == 200
        pid = r.json()["id"]
        emp_list = requests.get(f"{BASE_URL}/posts", headers=h(EMP)).json()
        got = next((p for p in emp_list if p["id"] == pid), None)
        assert got is not None
        assert got.get("is_scheduled") is False
        requests.delete(f"{BASE_URL}/posts/{pid}", headers=h(ADMIN))

    def test_scheduler_publishes_when_publish_at_passes(self):
        """Create a post scheduled to publish in ~3 seconds, wait, and confirm
        Idriss sees it after GET /posts (which triggers _dispatch_scheduled_posts)."""
        future = iso_in(3)
        r = requests.post(f"{BASE_URL}/posts", headers=h(ADMIN), json={
            "title": "TEST_SCHED near-future", "content": "auto publish",
            "category": "annonce", "publish_at": future,
        })
        assert r.status_code == 200
        pid = r.json()["id"]
        # Immediately: employee cannot see it
        emp_list = requests.get(f"{BASE_URL}/posts", headers=h(EMP)).json()
        assert not any(p["id"] == pid for p in emp_list)
        time.sleep(5)
        emp_list2 = requests.get(f"{BASE_URL}/posts", headers=h(EMP)).json()
        got = next((p for p in emp_list2 if p["id"] == pid), None)
        assert got is not None, "post should be visible after publish_at reached"
        assert got.get("is_scheduled") is False
        requests.delete(f"{BASE_URL}/posts/{pid}", headers=h(ADMIN))


# ─────────────────────────── Newsletter scheduling ────────────────────────────

class TestScheduledNewsletters:
    def test_scheduled_newsletter_hidden_from_employee(self):
        future = iso_in(600)
        r = requests.post(f"{BASE_URL}/admin/newsletters", headers=h(ADMIN), json={
            "title": "TEST_SCHED NL future", "subject": "s", "preheader": "p",
            "category": "Général", "body_html": "<p>hi</p>",
            "published": True, "publish_at": future,
        })
        assert r.status_code == 200, r.text
        nid = r.json()["id"]

        # Admin sees it with is_scheduled=true
        admin_list = requests.get(f"{BASE_URL}/newsletters", headers=h(ADMIN)).json()
        me = next((n for n in admin_list if n["id"] == nid), None)
        assert me is not None and me.get("is_scheduled") is True

        # Employee does NOT see it
        emp_list = requests.get(f"{BASE_URL}/newsletters", headers=h(EMP)).json()
        assert not any(n["id"] == nid for n in emp_list)

        # Cleanup
        requests.delete(f"{BASE_URL}/admin/newsletters/{nid}", headers=h(ADMIN))

    def test_published_newsletter_immediate_visibility(self):
        r = requests.post(f"{BASE_URL}/admin/newsletters", headers=h(ADMIN), json={
            "title": "TEST_SCHED NL now", "subject": "s", "category": "Général",
            "body_html": "<p>go</p>", "published": True,
        })
        assert r.status_code == 200
        nid = r.json()["id"]
        emp_list = requests.get(f"{BASE_URL}/newsletters", headers=h(EMP)).json()
        assert any(n["id"] == nid for n in emp_list)
        requests.delete(f"{BASE_URL}/admin/newsletters/{nid}", headers=h(ADMIN))


# ───────────────────────────────── Payslips ───────────────────────────────────

class TestPayslipsAdmin:
    def test_non_admin_cannot_access(self):
        r = requests.get(f"{BASE_URL}/admin/payslips", headers=h(EMP))
        assert r.status_code == 403

    def test_preview_computes_auto_22pct(self):
        payload = {
            "employee_id": EMP, "year": 2025, "month": 11,
            "lines": [{"label": "Base", "kind": "auto", "amount": 1000.0}],
        }
        r = requests.post(f"{BASE_URL}/admin/payslips/preview", headers=h(ADMIN), json=payload)
        assert r.status_code == 200, r.text
        t = r.json()["totals"]
        assert t["gross"] == 1000.0
        # 15+4+2+1 = 22% => 220
        assert t["total_deductions"] == 220.0
        assert t["net"] == 780.0
        labels = [d["label"] for d in t["deductions_lines"]]
        assert "Sécurité sociale" in labels
        assert "Retraite complémentaire" in labels

    def test_preview_default_lines_for_idriss(self):
        """With no lines and no base_hours, the preview must use Idriss's contract (24h)
        and hourly=12.85 → 24*4.33*12.85 ≈ 1335.87€."""
        r = requests.post(f"{BASE_URL}/admin/payslips/preview", headers=h(ADMIN), json={
            "employee_id": EMP, "year": 2025, "month": 11,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["lines"], "expected auto base line"
        base_line = body["lines"][0]
        assert base_line["label"] == "Salaire de base"
        # 24 * 4.33 = 103.92 ; 103.92 * 12.85 = 1335.37 (rounded)
        assert abs(base_line["amount"] - round(24 * 4.33 * 12.85, 2)) < 1.0
        assert body["totals"]["gross"] == base_line["amount"]

    def test_full_lifecycle_create_list_stats_send_document(self):
        # 1) create
        payload = {
            "employee_id": EMP, "year": 2025, "month": 11,
            "message_subject": "TEST_PS Fiche novembre",
        }
        r = requests.post(f"{BASE_URL}/admin/payslips", headers=h(ADMIN), json=payload)
        assert r.status_code == 200, r.text
        payslip = r.json()
        pid = payslip["id"]
        assert payslip["status"] == "draft"
        assert payslip["totals"]["gross"] > 0
        # 2) list
        lst = requests.get(f"{BASE_URL}/admin/payslips", headers=h(ADMIN)).json()
        assert any(p["id"] == pid for p in lst)
        # 3) stats
        stats = requests.get(f"{BASE_URL}/admin/payslips/stats", headers=h(ADMIN)).json()
        assert stats["total"] >= 1
        assert stats["pending"] >= 1
        # 4) send
        r_send = requests.post(f"{BASE_URL}/admin/payslips/{pid}/send", headers=h(ADMIN))
        assert r_send.status_code == 200, r_send.text
        assert r_send.json()["status"] == "sent"
        # 5) employee sees the document
        docs = requests.get(f"{BASE_URL}/documents", headers=h(EMP)).json()
        matched = [d for d in docs if d.get("payslip_id") == pid]
        assert matched, "employee should see the payslip document after send"
        assert matched[0]["is_payslip"] is True
        # 6) delete the payslip and confirm document removed
        r_del = requests.delete(f"{BASE_URL}/admin/payslips/{pid}", headers=h(ADMIN))
        assert r_del.status_code == 200
        docs2 = requests.get(f"{BASE_URL}/documents", headers=h(EMP)).json()
        assert not any(d.get("payslip_id") == pid for d in docs2), "document should be removed when payslip deleted"

    def test_cannot_send_twice_and_stats_month_filter(self):
        # Create a draft (different month to avoid the sent-duplicate guard)
        r = requests.post(f"{BASE_URL}/admin/payslips", headers=h(ADMIN), json={
            "employee_id": EMP, "year": 2025, "month": 10,
        })
        pid = r.json()["id"]
        # stats with month filter
        s = requests.get(f"{BASE_URL}/admin/payslips/stats?month=2025-10", headers=h(ADMIN)).json()
        assert s["total"] >= 1
        # Send
        requests.post(f"{BASE_URL}/admin/payslips/{pid}/send", headers=h(ADMIN))
        # Duplicate create for same employee+month should be blocked
        r2 = requests.post(f"{BASE_URL}/admin/payslips", headers=h(ADMIN), json={
            "employee_id": EMP, "year": 2025, "month": 10,
        })
        assert r2.status_code == 400
        # Cleanup: delete the sent payslip (removes doc too)
        requests.delete(f"{BASE_URL}/admin/payslips/{pid}", headers=h(ADMIN))
