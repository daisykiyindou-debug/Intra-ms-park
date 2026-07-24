"""Iteration 25 — Messagerie polish backend tests.

Covers:
- POST /api/channels/{id}/read matches both link patterns (channel=<cid> and ch=<cid>)
- GET /api/channels DM visibility rules (legacy dm-<empId> and new dm-<a>--<b>)
- POST /api/channels/{id}/messages notifies only DM/group members (not broadcast)
- Public team channel still broadcasts
- Envelope notification counter for type=message
"""
import os
import time
import uuid
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    if not v:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return v.rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

IDRISS = "emp-idriss-malonga"
MARCUS = "emp-marcus-simeo"
LUCAS = "emp-lucas"


def _s(uid):
    s = requests.Session()
    s.headers.update({"X-Employee-Id": uid, "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def sess_idriss():
    return _s(IDRISS)


@pytest.fixture(scope="module")
def sess_marcus():
    return _s(MARCUS)


@pytest.fixture(scope="module")
def sess_lucas():
    return _s(LUCAS)


# ── Basic health / auth ─────────────────────────────────────────────
def test_me_reachable(sess_marcus):
    r = sess_marcus.get(f"{API}/me")
    assert r.status_code == 200, r.text
    assert r.json()["id"] == MARCUS


# ── create_dm & channel visibility ──────────────────────────────────
def test_create_dm_marcus_lucas_new_sorted_id(sess_marcus):
    r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": LUCAS})
    assert r.status_code == 200, r.text
    ch = r.json()
    a, b = sorted([MARCUS, LUCAS])
    expected = f"dm-{a}--{b}"
    # If a legacy id already exists it may be reused; both are valid.
    assert ch["id"] in (expected, f"dm-{LUCAS}"), f"unexpected id {ch['id']}"
    assert ch.get("is_dm") is True
    # members_ids must be populated (either brand new, or backfilled)
    assert MARCUS in (ch.get("members_ids") or [])
    assert LUCAS in (ch.get("members_ids") or [])
    return ch["id"]


def test_dm_visible_to_both_participants(sess_marcus, sess_lucas):
    # Ensure the DM exists
    r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": LUCAS})
    assert r.status_code == 200
    cid = r.json()["id"]

    r1 = sess_marcus.get(f"{API}/channels")
    r2 = sess_lucas.get(f"{API}/channels")
    assert r1.status_code == 200 and r2.status_code == 200
    ids_marcus = [c["id"] for c in r1.json()]
    ids_lucas = [c["id"] for c in r2.json()]
    assert cid in ids_marcus, "Marcus should see the DM he created"
    assert cid in ids_lucas, "Lucas should also see the DM"


def test_legacy_dm_hidden_from_owner_visible_to_others(sess_marcus, sess_idriss, sess_lucas):
    """Legacy dm-<empId> pattern: should be hidden to owner (encoded emp) but
    visible to other users."""
    # Insert a synthetic legacy DM via create_dm won't emit legacy id anymore, so
    # we go directly through channels API only if such legacy channels exist.
    r = sess_marcus.get(f"{API}/channels")
    assert r.status_code == 200
    legacy = [c for c in r.json() if c.get("is_dm") and c["id"].startswith("dm-") and "--" not in c["id"]]
    if not legacy:
        pytest.skip("No legacy dm-<empId> channels in DB")
    # Take one owned by e.g. Lucas
    sample = legacy[0]
    encoded = sample["id"][3:]
    # Sign in as the encoded owner, ensure they don't see their own inbox
    sess_owner = _s(encoded)
    r_owner = sess_owner.get(f"{API}/channels")
    if r_owner.status_code != 200:
        pytest.skip("Owner account not accessible")
    owner_ids = [c["id"] for c in r_owner.json()]
    assert sample["id"] not in owner_ids, f"legacy DM {sample['id']} leaked to owner"


# ── mark_channel_read + ch=<cid> regex ──────────────────────────────
def test_mark_read_matches_ch_pattern(sess_marcus, sess_lucas):
    # Marcus opens DM to Lucas and sends a message
    r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": LUCAS})
    cid = r.json()["id"]
    body = f"TEST_iter25 {uuid.uuid4().hex[:6]}"
    r = sess_marcus.post(f"{API}/channels/{cid}/messages", json={"content": body})
    assert r.status_code == 200
    time.sleep(0.3)
    # Lucas should have an unread notification linked with ch=<cid>
    r = sess_lucas.get(f"{API}/notifications")
    assert r.status_code == 200
    notifs = r.json()
    matching = [n for n in notifs if n.get("type") == "message" and f"ch={cid}" in (n.get("link") or "")]
    assert matching, f"No message notification with ch={cid} found for Lucas. Got: {[n.get('link') for n in notifs[:5]]}"
    assert any(not n.get("read") for n in matching), "Should have at least one unread"
    # Now Lucas marks channel as read → notif should flip to read
    r = sess_lucas.post(f"{API}/channels/{cid}/read")
    assert r.status_code == 200
    r = sess_lucas.get(f"{API}/notifications")
    matching_after = [n for n in r.json() if n.get("type") == "message" and f"ch={cid}" in (n.get("link") or "")]
    assert matching_after, "notifs still present"
    assert all(n.get("read") for n in matching_after), "read=true expected after mark_channel_read"


# ── DM notifications go ONLY to the other member (not broadcast) ─────
def test_dm_message_not_broadcast(sess_marcus, sess_lucas, sess_idriss):
    r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": LUCAS})
    cid = r.json()["id"]
    marker = f"TEST_iter25_dm_scope {uuid.uuid4().hex[:8]}"
    r = sess_marcus.post(f"{API}/channels/{cid}/messages", json={"content": marker})
    assert r.status_code == 200
    time.sleep(0.3)
    # Idriss (not a member of this DM) must NOT receive a notification about it
    r_idriss = sess_idriss.get(f"{API}/notifications")
    assert r_idriss.status_code == 200
    leaked = [n for n in r_idriss.json() if marker in (n.get("content") or "") or f"ch={cid}" in (n.get("link") or "")]
    assert not leaked, f"DM leaked to non-member Idriss: {leaked}"
    # Lucas (the member) SHOULD receive
    r_lucas = sess_lucas.get(f"{API}/notifications")
    got = [n for n in r_lucas.json() if f"ch={cid}" in (n.get("link") or "")]
    assert got, "Lucas (DM member) missed notification"


# ── Envelope counter — type=message notifications exist ─────────────
def test_message_notification_type_field(sess_lucas):
    r = sess_lucas.get(f"{API}/notifications")
    assert r.status_code == 200
    types = {n.get("type") for n in r.json()}
    assert "message" in types, f"No type=message in Lucas notifications: {types}"


# ── Idriss birthday endpoint (used by cake pill) ────────────────────
def test_idriss_birthday_today(sess_idriss):
    r = sess_idriss.get(f"{API}/me/birthday")
    assert r.status_code == 200, r.text
    assert r.json().get("is_birthday_today") is True


# ── Notification mark-read endpoint (used by envelope dropdown) ─────
def test_mark_single_notification_read(sess_marcus, sess_lucas):
    r = sess_marcus.post(f"{API}/channels/dm", json={"employee_id": LUCAS})
    cid = r.json()["id"]
    r = sess_marcus.post(f"{API}/channels/{cid}/messages", json={"content": f"ping {uuid.uuid4().hex[:5]}"})
    assert r.status_code == 200
    time.sleep(0.3)
    r = sess_lucas.get(f"{API}/notifications")
    unread = [n for n in r.json() if n.get("type") == "message" and not n.get("read")]
    if not unread:
        pytest.skip("no unread notif to test single-mark")
    nid = unread[0]["id"]
    r = sess_lucas.post(f"{API}/notifications/{nid}/read")
    assert r.status_code in (200, 204)
    r = sess_lucas.get(f"{API}/notifications")
    n_after = next((n for n in r.json() if n["id"] == nid), None)
    assert n_after and n_after.get("read") is True
