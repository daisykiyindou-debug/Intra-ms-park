"""Iteration 31 — Messagerie: message edit (10-min window), like/unlike,
notification deep-linking + auto-clear, and smoke regression."""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base.rstrip("/") + "/api"

ADMIN_EMAIL = "marcus.simeo@mspark.fr"
EMP_EMAIL = "idriss.malonga@gmail.com"
ZACK_EMAIL = "zack.testing@mspark.fr"


def client(emp_id=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if emp_id:
        s.headers.update({"X-Employee-Id": emp_id})
    return s


@pytest.fixture(scope="session")
def employees():
    r = client().get(f"{BASE_URL}/employees", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _find(employees, email):
    for e in employees:
        if email in (e.get("email"), e.get("personal_email")):
            return e
    pytest.fail(f"Employee {email} not found")


@pytest.fixture(scope="session")
def admin_id(employees):
    return _find(employees, ADMIN_EMAIL)["id"]


@pytest.fixture(scope="session")
def emp_id(employees):
    return _find(employees, EMP_EMAIL)["id"]


@pytest.fixture(scope="session")
def zack_id(employees):
    return _find(employees, ZACK_EMAIL)["id"]


@pytest.fixture(scope="session")
def dm_channel(admin_id, emp_id):
    """DM between admin and employee."""
    a = client(admin_id)
    r = a.post(f"{BASE_URL}/channels/dm", json={"employee_id": emp_id}, timeout=30)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    cid = data.get("id") or data.get("channel_id")
    assert cid, data
    return cid


def _post_msg(cid, sender_id, content):
    r = client(sender_id).post(f"{BASE_URL}/channels/{cid}/messages",
                              json={"content": content}, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ── Health / basics
class TestBasics:
    def test_root(self):
        r = client().get(f"{BASE_URL}/", timeout=30)
        assert r.status_code == 200

    def test_channels_list(self, admin_id):
        r = client(admin_id).get(f"{BASE_URL}/channels", timeout=30)
        assert r.status_code == 200
        for c in r.json():
            assert "_id" not in c
            assert "unread" in c


# ── Message edit (PUT /api/messages/{mid})
class TestMessageEdit:
    def test_edit_own_message_within_window(self, dm_channel, admin_id):
        msg = _post_msg(dm_channel, admin_id, "TEST_iter31 original")
        mid = msg["id"]
        r = client(admin_id).put(f"{BASE_URL}/messages/{mid}",
                                 json={"content": "TEST_iter31 modifié"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["content"] == "TEST_iter31 modifié"
        assert data.get("edited") is True
        assert data.get("edited_at")
        assert "_id" not in data
        # verify persistence via GET
        lst = client(admin_id).get(f"{BASE_URL}/channels/{dm_channel}/messages", timeout=30).json()
        found = [m for m in lst if m["id"] == mid]
        assert found and found[0]["content"] == "TEST_iter31 modifié"
        assert found[0].get("edited") is True

    def test_edit_others_message_forbidden(self, dm_channel, admin_id, emp_id):
        msg = _post_msg(dm_channel, emp_id, "TEST_iter31 message employe")
        r = client(admin_id).put(f"{BASE_URL}/messages/{msg['id']}",
                                 json={"content": "hack"}, timeout=30)
        assert r.status_code == 403, r.text

    def test_edit_empty_content_rejected(self, dm_channel, admin_id):
        msg = _post_msg(dm_channel, admin_id, "TEST_iter31 vide check")
        r = client(admin_id).put(f"{BASE_URL}/messages/{msg['id']}",
                                 json={"content": "   "}, timeout=30)
        assert r.status_code == 400, r.text

    def test_edit_unknown_message_404(self, admin_id):
        r = client(admin_id).put(f"{BASE_URL}/messages/does-not-exist",
                                 json={"content": "x"}, timeout=30)
        assert r.status_code == 404

    def test_edit_beyond_10_minutes_blocked(self, dm_channel, admin_id):
        """Insert a message then back-date its ts to simulate >10 min."""
        import motor.motor_asyncio  # noqa: F401
        import asyncio
        from datetime import datetime, timedelta, timezone
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import dotenv_values as dv
        benv = dv("/app/backend/.env")
        msg = _post_msg(dm_channel, admin_id, "TEST_iter31 old message")
        mid = msg["id"]
        old_ts = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()

        async def backdate():
            c = AsyncIOMotorClient(benv["MONGO_URL"])
            await c[benv["DB_NAME"]].messages.update_one({"id": mid}, {"$set": {"ts": old_ts}})
            c.close()
        asyncio.run(backdate())
        r = client(admin_id).put(f"{BASE_URL}/messages/{mid}",
                                 json={"content": "trop tard"}, timeout=30)
        assert r.status_code == 423, f"expected 423, got {r.status_code}: {r.text}"


# ── Like / Unlike (POST /api/messages/{mid}/like)
class TestMessageLike:
    def test_like_then_unlike(self, dm_channel, admin_id, emp_id):
        msg = _post_msg(dm_channel, admin_id, "TEST_iter31 like target")
        mid = msg["id"]
        c = client(emp_id)
        r = c.post(f"{BASE_URL}/messages/{mid}/like", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["like_count"] == 1
        assert d["liked_by_me"] is True
        assert emp_id in d["liked_by"]
        # persisted?
        lst = client(emp_id).get(f"{BASE_URL}/channels/{dm_channel}/messages", timeout=30).json()
        m = [x for x in lst if x["id"] == mid][0]
        assert m.get("like_count") == 1 and emp_id in (m.get("liked_by") or [])
        # unlike
        r2 = c.post(f"{BASE_URL}/messages/{mid}/like", timeout=30)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["like_count"] == 0 and d2["liked_by_me"] is False

    def test_like_two_users_counts_two(self, dm_channel, admin_id, emp_id):
        msg = _post_msg(dm_channel, admin_id, "TEST_iter31 multi like")
        mid = msg["id"]
        client(admin_id).post(f"{BASE_URL}/messages/{mid}/like", timeout=30)
        r = client(emp_id).post(f"{BASE_URL}/messages/{mid}/like", timeout=30)
        assert r.status_code == 200
        assert r.json()["like_count"] == 2

    def test_like_non_member_forbidden(self, dm_channel, zack_id):
        msg_list = client(zack_id).get(f"{BASE_URL}/channels/{dm_channel}/messages", timeout=30)
        assert msg_list.status_code == 403

    def test_like_unknown_message_404(self, admin_id):
        r = client(admin_id).post(f"{BASE_URL}/messages/nope/like", timeout=30)
        assert r.status_code == 404


# ── Notification deep-link + auto-clear
class TestNotificationDeepLink:
    def test_message_notification_has_channel_link(self, dm_channel, admin_id, emp_id):
        _post_msg(dm_channel, admin_id, "TEST_iter31 notif deeplink")
        time.sleep(1)
        r = client(emp_id).get(f"{BASE_URL}/notifications", timeout=30)
        assert r.status_code == 200
        notifs = r.json()
        msg_notifs = [n for n in notifs if n.get("type") == "message"
                      and (n.get("link") or "").endswith(dm_channel)]
        assert msg_notifs, f"no message notification with link ?ch={dm_channel}"
        n = msg_notifs[0]
        assert n["link"] == f"/messagerie?ch={dm_channel}"
        assert n.get("read") is False
        assert "_id" not in n

    def test_channel_read_clears_unread_and_notifications(self, dm_channel, admin_id, emp_id):
        _post_msg(dm_channel, admin_id, "TEST_iter31 unread clear")
        time.sleep(1)
        c = client(emp_id)
        chans = c.get(f"{BASE_URL}/channels", timeout=30).json()
        target = [x for x in chans if x["id"] == dm_channel][0]
        assert target["unread"] > 0, "unread badge should be > 0 before read"
        r = c.post(f"{BASE_URL}/channels/{dm_channel}/read", timeout=30)
        assert r.status_code == 200
        chans2 = c.get(f"{BASE_URL}/channels", timeout=30).json()
        target2 = [x for x in chans2 if x["id"] == dm_channel][0]
        assert target2["unread"] == 0, "unread badge should clear after /read"
        notifs = c.get(f"{BASE_URL}/notifications", timeout=30).json()
        leftover = [n for n in notifs if n.get("type") == "message"
                    and (n.get("link") or "").endswith(dm_channel) and not n.get("read")]
        assert not leftover, f"{len(leftover)} message notifications still unread after /read"


# ── Smoke regression
class TestRegression:
    def test_send_and_list_message(self, dm_channel, emp_id):
        msg = _post_msg(dm_channel, emp_id, "TEST_iter31 regression send")
        lst = client(emp_id).get(f"{BASE_URL}/channels/{dm_channel}/messages", timeout=30).json()
        assert any(m["id"] == msg["id"] for m in lst)

    def test_empty_message_rejected(self, dm_channel, emp_id):
        r = client(emp_id).post(f"{BASE_URL}/channels/{dm_channel}/messages",
                                json={"content": "   "}, timeout=30)
        assert r.status_code == 400

    def test_new_user_inbox_isolation(self, zack_id):
        chans = client(zack_id).get(f"{BASE_URL}/channels", timeout=30).json()
        for c in chans:
            assert zack_id in (c.get("members_ids") or []), f"Zack sees non-member channel {c.get('name')}"

    def test_notifications_read_all(self, emp_id):
        c = client(emp_id)
        r = c.post(f"{BASE_URL}/notifications/read-all", timeout=30)
        assert r.status_code == 200
        notifs = c.get(f"{BASE_URL}/notifications", timeout=30).json()
        assert not [n for n in notifs if not n.get("read")]

    def test_newsletters_smoke(self, emp_id):
        r = client(emp_id).get(f"{BASE_URL}/newsletters", timeout=30)
        assert r.status_code in (200, 404), r.text

    def test_badging_smoke(self, emp_id):
        r = client(emp_id).get(f"{BASE_URL}/badging", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), (dict, list))

    def test_my_payslips_smoke(self, emp_id):
        r = client(emp_id).get(f"{BASE_URL}/payslips/mine", timeout=30)
        assert r.status_code == 200, r.text
