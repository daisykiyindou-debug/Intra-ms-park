"""Iteration-3 backend tests for MS Park intranet.

Covers iteration-3 changes:
- /me avatar URL contains the new Unsplash id 1531123897727
- /events: 6 entries; needs_registration true for event/training, false for maintenance/birthday/meeting
- /channels: ch-ops 'Employés OPS' unread=3 ; no ch-managers/ch-rh/ch-direction
- /channels/ch-ops/messages: 5 seeded messages
- POST /channels/group creates is_group=true grp-* channel
- /schedule: fixed pauses per spec
- POST /orders pickup_point is forced to product.store; line_items have 'store'
- /orders auto-evolves preparing->ready after 5 minutes
- POST /orders/{id}/pickup sets picked_up_at
"""
from __future__ import annotations

import os
import time
from datetime import date

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


class TestMeAvatar:
    def test_avatar_contains_new_unsplash_id(self, s):
        r = s.get(f"{API}/me")
        assert r.status_code == 200, r.text
        avatar = r.json().get("avatar", "")
        assert "1531123897727" in avatar, f"avatar URL changed: {avatar}"


class TestEvents:
    def test_six_events_with_needs_registration(self, s):
        r = s.get(f"{API}/events")
        assert r.status_code == 200, r.text
        events = r.json()
        assert len(events) == 6, f"expected 6 events, got {len(events)}"
        for ev in events:
            assert "needs_registration" in ev, f"event missing needs_registration: {ev}"
            cat = ev.get("category") or ev.get("type")
            if cat in ("event", "training"):
                assert ev["needs_registration"] is True, ev
            elif cat in ("maintenance", "birthday", "meeting"):
                assert ev["needs_registration"] is False, ev


class TestChannels:
    def test_ch_ops_present_and_old_removed(self, s):
        chans = s.get(f"{API}/channels").json()
        ids = {c["id"] for c in chans}
        assert "ch-ops" in ids
        for forbidden in ("ch-managers", "ch-rh", "ch-direction"):
            assert forbidden not in ids, f"deprecated channel still present: {forbidden}"
        ops = next(c for c in chans if c["id"] == "ch-ops")
        assert ops["name"] == "Employés OPS"
        assert ops["unread"] == 3

    def test_ch_ops_has_five_messages(self, s):
        r = s.get(f"{API}/channels/ch-ops/messages")
        assert r.status_code == 200, r.text
        msgs = r.json()
        assert len(msgs) == 5, f"expected 5 messages, got {len(msgs)}"
        authors = {m.get("author_id") or m.get("author") for m in msgs}
        # at least one of the seeded authors should show up
        assert any(a and ("sophie" in str(a).lower() or "karim" in str(a).lower()
                          or "noah" in str(a).lower() or "idriss" in str(a).lower())
                   for a in authors), f"authors: {authors}"


class TestChannelGroup:
    def test_create_group(self, s):
        payload = {"name": "TEST_Groupe iter3", "member_ids": ["emp-sophie", "emp-karim"]}
        r = s.post(f"{API}/channels/group", json=payload)
        assert r.status_code == 200, r.text
        ch = r.json()
        assert ch["id"].startswith("grp-"), ch
        assert ch.get("is_group") is True
        # listed afterwards
        all_ch = s.get(f"{API}/channels").json()
        assert any(c["id"] == ch["id"] for c in all_ch)


class TestSchedulePauses:
    def test_fixed_pauses(self, s):
        items = s.get(f"{API}/schedule").json()
        shifts = [i for i in items if i.get("type") == "shift" and i.get("start")]
        assert shifts, "no shifts in schedule"
        rules = {
            "14:00": ("16:30", "17:15"),
            "12:00": ("15:00", "15:45"),
            "15:00": ("17:00", "17:45"),
        }
        seen = set()
        for sh in shifts:
            st = sh["start"]
            if st in rules:
                exp_ps, exp_pe = rules[st]
                assert sh.get("pause_start") == exp_ps, f"start={st} pause_start={sh.get('pause_start')} expected {exp_ps}"
                assert sh.get("pause_end") == exp_pe, f"start={st} pause_end={sh.get('pause_end')} expected {exp_pe}"
                seen.add(st)
        assert seen, f"none of the expected start times found; got starts={[sh['start'] for sh in shifts]}"


class TestOrders:
    def _soccer_product(self, s):
        return s.get(f"{API}/menu", params={"store": "soccer_bar"}).json()[0]

    def test_pickup_point_forced_and_line_item_store(self, s):
        prod = self._soccer_product(s)
        payload = {
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "pickup_point": "donut_house",  # wrong on purpose
            "pickup_date": date.today().isoformat(),
            "pickup_time": "12:30",
        }
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["pickup_point"] == "soccer_bar", \
            f"pickup_point should be forced to product store; got {order['pickup_point']}"
        for li in order.get("line_items", order.get("items", [])):
            assert li.get("store") == "soccer_bar", f"line_item missing store=soccer_bar: {li}"

    def test_pickup_endpoint_sets_picked_up_at(self, s):
        prod = self._soccer_product(s)
        r = s.post(f"{API}/orders", json={
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "pickup_point": "soccer_bar",
            "pickup_date": date.today().isoformat(),
            "pickup_time": "13:30",
        })
        oid = r.json()["id"]
        pr = s.post(f"{API}/orders/{oid}/pickup")
        assert pr.status_code == 200, pr.text
        # verify state
        listing = s.get(f"{API}/orders").json()
        match = next(o for o in listing if o["id"] == oid)
        assert match.get("status") == "picked_up", match
        assert match.get("picked_up_at"), f"picked_up_at missing: {match}"

    def test_auto_status_evolution_field_present(self, s):
        """After fresh seed there is no >5-min-old order, so we only check that
        the GET /orders endpoint exposes status and updated_at (or created_at)
        fields used by the auto-evolution logic.
        """
        listing = s.get(f"{API}/orders").json()
        # Just ensure structure supports auto evolution (status field exists on entries)
        for o in listing:
            assert "status" in o, o
            # timestamp present for age comparison
            assert any(k in o for k in ("created_at", "createdAt", "placed_at")), o
