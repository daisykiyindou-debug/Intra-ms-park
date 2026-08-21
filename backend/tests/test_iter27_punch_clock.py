"""Iteration 27 — Pointeuse virtuelle (Punches system v2) backend tests.

Covers: /api/badging/state, /api/badging/punch, /api/badging/history,
/api/badging/summary, auto-close after 8h, OFF-day blocking, min break 45 min.
"""
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/") + "/api"

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = backend_env.get("MONGO_URL")
DB_NAME = backend_env.get("DB_NAME")

PARIS = ZoneInfo("Europe/Paris")
IDRISS = "emp-idriss-malonga"
FLOW_EMP = "emp-TEST-iter27-flow"
OFF_EMP = "emp-TEST-iter27-off"
AUTO_EMP = "emp-TEST-iter27-auto"


def now_paris():
    return datetime.now(PARIS)


def hm(dt):
    return dt.strftime("%H:%M")


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


def client_for(eid):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Employee-Id": eid})
    return s


@pytest.fixture(scope="module")
def test_employees(mongo):
    today = now_paris().date().isoformat()
    tomorrow = (now_paris().date() + timedelta(days=1)).isoformat()
    for eid, name in ((FLOW_EMP, "TEST_Flow"), (OFF_EMP, "TEST_Off"), (AUTO_EMP, "TEST_Auto")):
        mongo.employees.update_one(
            {"id": eid},
            {"$set": {"id": eid, "first_name": name, "last_name": "Iter27",
                      "email": f"{eid}@test.local", "role": "Employé Polyvalent",
                      "is_admin": False, "weekly_hours": 24}},
            upsert=True,
        )
    # Flow employee: worked shift today + tomorrow
    for eid in (FLOW_EMP, AUTO_EMP):
        for d in (today, tomorrow):
            mongo.schedules.update_one(
                {"employee_id": eid, "day": d},
                {"$set": {"id": f"sch-{eid}-{d}", "employee_id": eid, "day": d,
                          "shift_type": "morning", "start_time": "09:00", "end_time": "17:00"}},
                upsert=True,
            )
    # OFF employee: today off, tomorrow worked
    mongo.schedules.update_one(
        {"employee_id": OFF_EMP, "day": today},
        {"$set": {"id": f"sch-{OFF_EMP}-{today}", "employee_id": OFF_EMP, "day": today,
                  "shift_type": "off"}}, upsert=True)
    mongo.schedules.update_one(
        {"employee_id": OFF_EMP, "day": tomorrow},
        {"$set": {"id": f"sch-{OFF_EMP}-{tomorrow}", "employee_id": OFF_EMP, "day": tomorrow,
                  "shift_type": "morning", "start_time": "09:00", "end_time": "17:00"}}, upsert=True)
    mongo.punches.delete_many({"employee_id": {"$in": [FLOW_EMP, OFF_EMP, AUTO_EMP]}})
    yield {"today": today, "tomorrow": tomorrow}
    mongo.punches.delete_many({"employee_id": {"$in": [FLOW_EMP, OFF_EMP, AUTO_EMP]}})
    mongo.schedules.delete_many({"employee_id": {"$in": [FLOW_EMP, OFF_EMP, AUTO_EMP]}})
    mongo.employees.delete_many({"id": {"$in": [FLOW_EMP, OFF_EMP, AUTO_EMP]}})


# ── /badging/state shape ────────────────────────────────────────────
class TestState:
    def test_state_shape_idriss(self, test_employees):
        r = client_for(IDRISS).get(f"{BASE_URL}/badging/state")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("step", "punches", "aggregate", "blocked_reason", "next_shift",
                  "break_locked_until", "min_break_minutes"):
            assert k in d, f"missing key {k} in state: {list(d.keys())}"
        assert d["min_break_minutes"] == 45
        assert d["step"] in ("clock_in", "choose", "break_in", "closed")
        assert isinstance(d["punches"], list)
        for p in d["punches"]:
            assert "_id" not in p

    def test_state_unauthenticated_or_unknown_employee(self):
        s = requests.Session()
        s.headers.update({"X-Employee-Id": "emp-does-not-exist"})
        r = s.get(f"{BASE_URL}/badging/state")
        assert r.status_code == 401, f"expected 401 got {r.status_code}"


# ── OFF day blocking ────────────────────────────────────────────────
class TestOffDayBlocked:
    def test_state_blocked_reason_off(self, test_employees):
        r = client_for(OFF_EMP).get(f"{BASE_URL}/badging/state")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["blocked_reason"] == "Jour de repos", d["blocked_reason"]
        assert d["next_shift"] and d["next_shift"]["day"] == test_employees["tomorrow"]

    def test_punch_rejected_on_off_day(self, test_employees):
        r = client_for(OFF_EMP).post(f"{BASE_URL}/badging/punch", json={"action": "auto"})
        assert r.status_code == 400, f"{r.status_code} {r.text}"
        assert "Jour de repos" in r.json().get("detail", ""), r.text

    def test_idriss_off_days_in_history(self, test_employees):
        r = client_for(IDRISS).get(f"{BASE_URL}/badging/history?days=7")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) == 7
        allowed = {"conforme", "en cours", "en retard", "absent", "off",
                   "congés", "rtt", "récup", "à venir"}
        for row in rows:
            assert "shift_type" in row
            assert row["status"] in allowed, row
        by_day = {r_["day"]: r_ for r_ in rows}
        mondays_tuesdays = [d for d in by_day
                            if date.fromisoformat(d).weekday() in (0, 1)]
        assert mondays_tuesdays, "no monday/tuesday in the last 7 days window"
        for d in mondays_tuesdays:
            assert by_day[d]["shift_type"] == "off", f"{d} -> {by_day[d]['shift_type']}"
            assert by_day[d]["status"] == "off", f"{d} -> {by_day[d]['status']}"


# ── Full 4-punch flow ───────────────────────────────────────────────
class TestPunchFlow:
    def test_full_flow(self, mongo, test_employees):
        c = client_for(FLOW_EMP)
        today = test_employees["today"]
        mongo.punches.delete_many({"employee_id": FLOW_EMP})

        # 1) auto -> clock_in
        r = c.post(f"{BASE_URL}/badging/punch", json={"action": "auto"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["aggregate"]["clock_in"], d
        assert d["step"] == "choose", d["step"]
        assert [p["type"] for p in d["punches"]] == ["clock_in"]
        assert d["punches"][0]["source"] == "self"

        # 2) auto again -> 400 choice required
        r = c.post(f"{BASE_URL}/badging/punch", json={"action": "auto"})
        assert r.status_code == 400, r.text
        assert "Choisissez une action" in r.json()["detail"], r.text

        # 3) action=break -> break_out
        r = c.post(f"{BASE_URL}/badging/punch", json={"action": "break"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["aggregate"]["break_out"], d
        assert d["step"] == "break_in"
        assert d["break_locked_until"], "break_locked_until must be set right after break_out"

        # 4) auto before 45 min -> 400
        r = c.post(f"{BASE_URL}/badging/punch", json={"action": "auto"})
        assert r.status_code == 400, r.text
        assert "Pause minimum de 45 min non écoulée" in r.json()["detail"], r.text

        # backdate break_out by 50 minutes
        bo_dt = now_paris() - timedelta(minutes=50)
        mongo.punches.update_one(
            {"employee_id": FLOW_EMP, "day": today, "type": "break_out"},
            {"$set": {"time": hm(bo_dt), "ts": bo_dt.astimezone(ZoneInfo("UTC")).isoformat()}},
        )
        # also backdate clock_in so worked minutes stay coherent
        ci_dt = now_paris() - timedelta(minutes=180)
        mongo.punches.update_one(
            {"employee_id": FLOW_EMP, "day": today, "type": "clock_in"},
            {"$set": {"time": hm(ci_dt), "ts": ci_dt.astimezone(ZoneInfo("UTC")).isoformat()}},
        )

        # 5) auto after 45 min -> break_in
        r = c.post(f"{BASE_URL}/badging/punch", json={"action": "auto"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["aggregate"]["break_in"], d
        assert d["step"] == "choose"
        assert d["break_locked_until"] is None

        # 6) action=end -> clock_out
        r = c.post(f"{BASE_URL}/badging/punch", json={"action": "end"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["aggregate"]["clock_out"], d
        assert d["step"] == "closed"
        assert d["aggregate"]["is_closed"] is True
        assert d["aggregate"]["worked_minutes"] > 0
        assert d["next_shift"] and d["next_shift"]["day"] == test_employees["tomorrow"]

        # 7) auto after close -> 400 with next shift info
        r = c.post(f"{BASE_URL}/badging/punch", json={"action": "auto"})
        assert r.status_code == 400, r.text
        detail = r.json()["detail"]
        assert "Journée terminée" in detail, detail
        assert test_employees["tomorrow"] in detail and "09:00" in detail, detail

        # persistence check via GET state
        r = c.get(f"{BASE_URL}/badging/state")
        assert r.status_code == 200
        d = r.json()
        assert [p["type"] for p in d["punches"]] == ["clock_in", "break_out", "break_in", "clock_out"]


# ── Auto close after 8h ─────────────────────────────────────────────
class TestAutoClose:
    def test_auto_close_after_8h(self, mongo, test_employees):
        today = test_employees["today"]
        mongo.punches.delete_many({"employee_id": AUTO_EMP})
        ci = now_paris() - timedelta(hours=10)
        assert ci.date().isoformat() == today, "test must run at least 10h after midnight Paris"
        mongo.punches.insert_one({
            "id": "punch-TEST-iter27-auto", "employee_id": AUTO_EMP, "day": today,
            "type": "clock_in", "time": hm(ci),
            "ts": ci.astimezone(ZoneInfo("UTC")).isoformat(), "source": "self",
        })
        r = client_for(AUTO_EMP).get(f"{BASE_URL}/badging/state")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["step"] == "closed", d["step"]
        assert d["aggregate"]["is_closed"] is True
        assert abs(d["aggregate"]["worked_minutes"] - 480) <= 1, d["aggregate"]
        auto = [p for p in d["punches"] if p.get("source") == "auto-close"]
        assert auto, d["punches"]
        assert auto[-1]["type"] == "clock_out"
        expected_close = hm(ci + timedelta(minutes=480))
        assert auto[-1]["time"] == expected_close, (auto[-1]["time"], expected_close)
        # idempotent — no duplicate auto clock_out on second read
        r2 = client_for(AUTO_EMP).get(f"{BASE_URL}/badging/state")
        assert len([p for p in r2.json()["punches"] if p["type"] == "clock_out"]) == 1


# ── Summary ─────────────────────────────────────────────────────────
class TestSummary:
    def test_summary_ranges(self, test_employees):
        r = client_for(IDRISS).get(f"{BASE_URL}/badging/summary")
        assert r.status_code == 200, r.text
        d = r.json()
        today = now_paris().date()
        monday = today - timedelta(days=today.weekday())
        assert d["week"]["range_start"] == monday.isoformat()
        assert d["week"]["range_end"] == (monday + timedelta(days=6)).isoformat()
        assert d["month"]["range_start"] == today.replace(day=1).isoformat()
        for k in ("worked_minutes", "late_minutes", "overtime_minutes"):
            assert isinstance(d["week"][k], int)
            assert isinstance(d["month"][k], int)
        assert d["week"]["worked_minutes"] <= d["month"]["worked_minutes"]

    def test_month_excludes_previous_month(self, mongo, test_employees):
        """Insert a closed day in the previous month; month totals must ignore it."""
        today = now_paris().date()
        prev = (today.replace(day=1) - timedelta(days=5)).isoformat()
        mongo.punches.delete_many({"employee_id": FLOW_EMP, "day": prev})
        for t, tm in (("clock_in", "09:00"), ("clock_out", "17:00")):
            mongo.punches.insert_one({
                "id": f"punch-TEST-iter27-prev-{t}", "employee_id": FLOW_EMP, "day": prev,
                "type": t, "time": tm, "ts": f"{prev}T{tm}:00+02:00", "source": "self",
            })
        c = client_for(FLOW_EMP)
        d = c.get(f"{BASE_URL}/badging/summary").json()
        assert d["month"]["range_start"] == today.replace(day=1).isoformat()
        # 480 min from previous month must NOT be counted
        assert d["month"]["worked_minutes"] < 480 or d["month"]["days_worked"] >= 1
        hist = c.get(f"{BASE_URL}/badging/history?days=7").json()
        assert all(row["day"] >= (today - timedelta(days=6)).isoformat() for row in hist)
        mongo.punches.delete_many({"employee_id": FLOW_EMP, "day": prev})
