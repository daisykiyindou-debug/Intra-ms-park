"""Iteration 26 — Messagerie: group members persistence, add/remove members,
change avatar, attachments, uploads endpoint.

Covers:
- POST /api/channels/group persists members under 'members_ids' (bug fix)
- POST /api/channels/{cid}/members adds a member and it persists on GET /api/channels
- DELETE /api/channels/{cid}/members/{eid} removes and persists
- PATCH /api/channels/{cid} updates name / avatar_url
- POST /api/uploads returns a URL usable as attachment
- POST /api/channels/{cid}/messages accepts attachments list and persists it
- Empty message with no attachments is rejected
"""
import io
import os
import uuid
import pytest
import requests


def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
    return v.rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

IDRISS = "emp-idriss-malonga"
MARCUS = "emp-marcus-simeo"
LUCAS = "emp-lucas"


def _s(uid):
    s = requests.Session()
    s.headers.update({"X-Employee-Id": uid})
    return s


@pytest.fixture(scope="module")
def sess_marcus():
    return _s(MARCUS)


@pytest.fixture(scope="module")
def sess_idriss():
    return _s(IDRISS)


# ─────────────────────────── Group creation persistence ──────────────────────
class TestGroupCreation:
    def test_create_group_persists_members(self, sess_marcus):
        name = f"TEST_iter26_grp_{uuid.uuid4().hex[:6]}"
        r = sess_marcus.post(
            f"{API}/channels/group",
            json={"name": name, "member_ids": [IDRISS, LUCAS]},
        )
        assert r.status_code == 200, r.text
        ch = r.json()
        cid = ch["id"]
        assert cid.startswith("grp-")
        assert ch["name"] == name
        # creator must always be included
        assert ch["members"] == 3, f"expected 3 members incl. creator, got {ch}"

        # Verify persistence: GET /channels for creator must show it with 3 members
        rl = sess_marcus.get(f"{API}/channels")
        assert rl.status_code == 200
        listed = next((c for c in rl.json() if c["id"] == cid), None)
        assert listed is not None, "group missing in creator list"
        assert listed["members"] == 3
        pytest.grp_cid = cid

    def test_group_visible_to_member(self, sess_idriss):
        cid = pytest.grp_cid
        rl = sess_idriss.get(f"{API}/channels")
        assert rl.status_code == 200
        listed = next((c for c in rl.json() if c["id"] == cid), None)
        assert listed is not None, "group not visible to invited member"

    def test_create_group_requires_name_and_members(self, sess_marcus):
        r = sess_marcus.post(f"{API}/channels/group", json={"name": "", "member_ids": [IDRISS]})
        assert r.status_code == 400
        r = sess_marcus.post(f"{API}/channels/group", json={"name": "x", "member_ids": []})
        assert r.status_code == 400


# ─────────────────────────── Add / remove members ────────────────────────────
class TestMemberManagement:
    def test_add_member_persists(self, sess_marcus):
        cid = pytest.grp_cid
        # Add a new employee (pick a stable seed id different from initial ones)
        new_member = "emp-emma"
        r = sess_marcus.post(
            f"{API}/channels/{cid}/members",
            json={"employee_id": new_member},
        )
        assert r.status_code == 200, r.text
        assert r.json()["members"] == 4

        # Cannot add same twice
        r2 = sess_marcus.post(
            f"{API}/channels/{cid}/members",
            json={"employee_id": new_member},
        )
        assert r2.status_code == 400

        # Persistence via GET /channels
        rl = sess_marcus.get(f"{API}/channels")
        listed = next((c for c in rl.json() if c["id"] == cid), None)
        assert listed and listed["members"] == 4

    def test_remove_member_persists(self, sess_marcus):
        cid = pytest.grp_cid
        r = sess_marcus.delete(f"{API}/channels/{cid}/members/emp-emma")
        assert r.status_code == 200, r.text
        assert r.json()["members"] == 3

        # New session again to bypass any client cache
        rl = _s(MARCUS).get(f"{API}/channels")
        listed = next((c for c in rl.json() if c["id"] == cid), None)
        assert listed and listed["members"] == 3

    def test_add_unknown_employee_404(self, sess_marcus):
        cid = pytest.grp_cid
        r = sess_marcus.post(
            f"{API}/channels/{cid}/members",
            json={"employee_id": "emp-does-not-exist"},
        )
        assert r.status_code == 404

    def test_add_member_to_dm_forbidden(self, sess_marcus):
        # Create a DM first
        r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": LUCAS})
        assert r.status_code == 200
        dm_cid = r.json()["id"]
        r2 = sess_marcus.post(
            f"{API}/channels/{dm_cid}/members",
            json={"employee_id": IDRISS},
        )
        assert r2.status_code == 400


# ─────────────────────────── Channel patch (name/avatar) ─────────────────────
class TestChannelPatch:
    def test_patch_channel_name_and_avatar(self, sess_marcus):
        cid = pytest.grp_cid
        new_avatar = "/api/uploads/fake-avatar.png"
        new_name = f"TEST_iter26_renamed_{uuid.uuid4().hex[:4]}"
        r = sess_marcus.patch(
            f"{API}/channels/{cid}",
            json={"name": new_name, "avatar_url": new_avatar},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == new_name
        assert body.get("avatar_url") == new_avatar

        # Persistence via list
        rl = sess_marcus.get(f"{API}/channels")
        listed = next((c for c in rl.json() if c["id"] == cid), None)
        assert listed and listed["name"] == new_name
        assert listed.get("avatar_url") == new_avatar

    def test_patch_dm_forbidden(self, sess_marcus):
        r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": LUCAS})
        dm_cid = r.json()["id"]
        r2 = sess_marcus.patch(f"{API}/channels/{dm_cid}", json={"name": "nope"})
        assert r2.status_code == 400


# ─────────────────────────── Uploads + attachments ───────────────────────────
class TestUploadsAndAttachments:
    def test_upload_returns_url(self, sess_marcus):
        # Send a small PNG-like file
        content = b"\x89PNG\r\n\x1a\n" + b"0" * 32
        files = {"file": ("TEST_iter26.png", io.BytesIO(content), "image/png")}
        # Note: don't pass Content-Type json header for multipart
        r = requests.post(f"{API}/uploads", headers={"X-Employee-Id": MARCUS}, files=files)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["url"].startswith("/api/uploads/")
        assert body["name"] == "TEST_iter26.png"
        pytest.upload_url = body["url"]

    def test_post_message_with_image_attachment(self, sess_marcus):
        cid = pytest.grp_cid
        att = {"url": pytest.upload_url, "name": "TEST_iter26.png", "type": "image/png"}
        r = sess_marcus.post(
            f"{API}/channels/{cid}/messages",
            json={"content": "voici une image", "attachments": [att]},
        )
        assert r.status_code == 200, r.text
        # Verify persistence
        rm = sess_marcus.get(f"{API}/channels/{cid}/messages")
        assert rm.status_code == 200
        msgs = rm.json()
        found = [m for m in msgs if m.get("attachments") and any(a.get("url") == att["url"] for a in m["attachments"])]
        assert found, "message with attachment not persisted"

    def test_post_message_attachment_only_no_content(self, sess_marcus):
        cid = pytest.grp_cid
        att = {"url": pytest.upload_url, "name": "doc.pdf", "type": "application/pdf"}
        r = sess_marcus.post(
            f"{API}/channels/{cid}/messages",
            json={"content": "", "attachments": [att]},
        )
        assert r.status_code == 200, r.text

    def test_empty_message_rejected(self, sess_marcus):
        cid = pytest.grp_cid
        r = sess_marcus.post(
            f"{API}/channels/{cid}/messages",
            json={"content": "   ", "attachments": []},
        )
        assert r.status_code == 400


# ─────────────────────────── DM regression ──────────────────────────────────
class TestDMRegression:
    def test_dm_send_and_read(self, sess_marcus, sess_idriss):
        r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": IDRISS})
        assert r.status_code == 200
        cid = r.json()["id"]
        rp = sess_marcus.post(
            f"{API}/channels/{cid}/messages",
            json={"content": "TEST_iter26 regression dm"},
        )
        assert rp.status_code == 200
        # Idriss marks as read
        rr = sess_idriss.post(f"{API}/channels/{cid}/read")
        assert rr.status_code == 200
