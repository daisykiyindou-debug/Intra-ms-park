"""
Iteration 24 backend tests:
- Ideas endpoints (list, create, vote, admin moderate/delete, permissions)
- Birthdays endpoints (/birthdays, /me/birthday, /me/birthday/claim, meal-points bonus split)
- Messagerie: /channels/{cid}/read + unread_count in /channels
"""
import os
import uuid
import requests
import pytest
from datetime import date, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

IDRISS = "emp-idriss-malonga"
MARCUS = "emp-marcus-simeo"
KARIM = "emp-karim"


def _hdr(emp_id, admin=False):
    h = {"X-Employee-Id": emp_id, "Content-Type": "application/json"}
    if admin:
        h["X-Admin-Mode"] = "true"
    return h


# ─── Ideas ──────────────────────────────────────────────────────────────
class TestIdeas:
    created_ids = []

    def test_list_ideas(self):
        r = requests.get(f"{API}/ideas", headers=_hdr(IDRISS))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_anonymous_idea(self):
        payload = {"title": f"TEST_anon_{uuid.uuid4().hex[:6]}",
                   "description": "Anonymous idea from Idriss",
                   "is_anonymous": True, "category": "Amélioration"}
        r = requests.post(f"{API}/ideas", json=payload, headers=_hdr(IDRISS))
        assert r.status_code == 200, r.text
        idea = r.json()
        assert idea["title"] == payload["title"]
        assert idea["is_anonymous"] is True
        # author masked
        assert idea.get("author_id") is None
        snap = idea.get("author_snapshot") or {}
        assert snap.get("first_name") == "Anonyme"
        TestIdeas.created_ids.append(idea["id"])

    def test_create_non_anonymous_idea(self):
        payload = {"title": f"TEST_named_{uuid.uuid4().hex[:6]}",
                   "description": "Named idea",
                   "is_anonymous": False, "category": "Événement"}
        r = requests.post(f"{API}/ideas", json=payload, headers=_hdr(KARIM))
        assert r.status_code == 200, r.text
        idea = r.json()
        assert idea["is_anonymous"] is False
        assert idea["author_id"] == KARIM
        TestIdeas.created_ids.append(idea["id"])

    def test_vote_up(self):
        assert TestIdeas.created_ids, "need created idea"
        idea_id = TestIdeas.created_ids[0]
        r = requests.post(f"{API}/ideas/{idea_id}/vote", params={"direction": "up"},
                          headers=_hdr(IDRISS))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["upvotes"] >= 1
        assert data["my_vote"] == "up"

    def test_vote_down(self):
        idea_id = TestIdeas.created_ids[0]
        r = requests.post(f"{API}/ideas/{idea_id}/vote", params={"direction": "down"},
                          headers=_hdr(KARIM))
        assert r.status_code == 200
        assert r.json()["downvotes"] >= 1

    def test_vote_invalid_direction(self):
        idea_id = TestIdeas.created_ids[0]
        r = requests.post(f"{API}/ideas/{idea_id}/vote", params={"direction": "sideways"},
                          headers=_hdr(IDRISS))
        assert r.status_code == 400

    def test_non_admin_cannot_moderate(self):
        idea_id = TestIdeas.created_ids[0]
        r = requests.put(f"{API}/admin/ideas/{idea_id}",
                         json={"status": "accepted"},
                         headers=_hdr(IDRISS))
        assert r.status_code == 403

    def test_non_admin_cannot_delete(self):
        idea_id = TestIdeas.created_ids[0]
        r = requests.delete(f"{API}/admin/ideas/{idea_id}", headers=_hdr(IDRISS))
        assert r.status_code == 403

    def test_admin_moderate(self):
        idea_id = TestIdeas.created_ids[0]
        r = requests.put(f"{API}/admin/ideas/{idea_id}",
                         json={"status": "accepted",
                               "admin_response": "Merci, on prend !"},
                         headers=_hdr(MARCUS, admin=True))
        assert r.status_code == 200, r.text
        idea = r.json()
        assert idea["status"] == "accepted"
        assert idea["admin_response"] == "Merci, on prend !"

    def test_admin_delete(self):
        # delete second (non-anonymous) idea
        if len(TestIdeas.created_ids) < 2:
            pytest.skip("no 2nd idea")
        idea_id = TestIdeas.created_ids[1]
        r = requests.delete(f"{API}/admin/ideas/{idea_id}",
                            headers=_hdr(MARCUS, admin=True))
        assert r.status_code == 200

    def test_cleanup(self):
        # delete first idea
        for iid in TestIdeas.created_ids:
            requests.delete(f"{API}/admin/ideas/{iid}",
                            headers=_hdr(MARCUS, admin=True))


# ─── Birthdays ──────────────────────────────────────────────────────────
class TestBirthdays:
    def test_list_upcoming(self):
        r = requests.get(f"{API}/birthdays", params={"view": "upcoming"},
                         headers=_hdr(IDRISS))
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # First entry should be Idriss (today's birthday)
        first = data[0]
        assert first["days_until"] == 0
        assert first["is_today"] is True
        assert first["id"] == IDRISS

    def test_list_past(self):
        r = requests.get(f"{API}/birthdays", params={"view": "past"},
                         headers=_hdr(IDRISS))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_my_birthday_status_idriss(self):
        r = requests.get(f"{API}/me/birthday", headers=_hdr(IDRISS))
        assert r.status_code == 200
        data = r.json()
        assert data["is_birthday_today"] is True

    def test_my_birthday_status_not_today(self):
        r = requests.get(f"{API}/me/birthday", headers=_hdr(MARCUS))
        assert r.status_code == 200
        assert r.json()["is_birthday_today"] is False

    def test_claim_gift_not_birthday_rejected(self):
        r = requests.post(f"{API}/me/birthday/claim", headers=_hdr(MARCUS))
        assert r.status_code == 400

    def test_claim_gift_idriss(self):
        # Reset state via mongo would require shell; endpoint is idempotent.
        r = requests.post(f"{API}/me/birthday/claim", headers=_hdr(IDRISS))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        bb = data.get("birthday_bonus")
        assert bb is not None
        assert bb["points"] == 10
        assert "expires_at" in bb
        # Verify already_seen_this_year=true now
        r2 = requests.get(f"{API}/me/birthday", headers=_hdr(IDRISS))
        assert r2.status_code == 200
        assert r2.json()["already_seen_this_year"] is True

    def test_meal_points_today_shows_bonus(self):
        r = requests.get(f"{API}/meal-points/today", headers=_hdr(IDRISS))
        assert r.status_code == 200
        data = r.json()
        bb = data.get("birthday_bonus")
        assert bb is not None, "birthday_bonus must appear after claim"
        assert bb["points"] == 10
        # remaining includes daily + bonus
        assert data["remaining"] >= 10


# ─── Messagerie / Channels ──────────────────────────────────────────────
class TestChannelRead:
    def test_list_channels_has_unread_count(self):
        r = requests.get(f"{API}/channels", headers=_hdr(IDRISS))
        assert r.status_code == 200, r.text
        chans = r.json()
        assert isinstance(chans, list) and len(chans) > 0
        assert "unread_count" in chans[0]
        assert isinstance(chans[0]["unread_count"], int)

    def test_mark_channel_read(self):
        chans = requests.get(f"{API}/channels", headers=_hdr(IDRISS)).json()
        cid = chans[0]["id"]
        # Post message from Marcus so unread appears for Idriss
        requests.post(f"{API}/channels/{cid}/messages",
                      json={"content": "TEST_iter24 hello"},
                      headers=_hdr(MARCUS))
        # Mark read from Idriss
        r = requests.post(f"{API}/channels/{cid}/read", headers=_hdr(IDRISS))
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # unread should be 0 now
        chans2 = requests.get(f"{API}/channels", headers=_hdr(IDRISS)).json()
        c = next(c for c in chans2 if c["id"] == cid)
        assert c["unread_count"] == 0

    def test_mark_read_unknown_channel(self):
        r = requests.post(f"{API}/channels/does-not-exist/read",
                          headers=_hdr(IDRISS))
        assert r.status_code == 404


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
