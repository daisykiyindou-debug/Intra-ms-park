#!/usr/bin/env python3
"""Focused backend check for /api/requests/multi invalid dates."""
import json
import sys
from urllib import request, error

BASE = "https://mspark-employee-hub.preview.emergentagent.com/api"
HEADERS = {
    "Content-Type": "application/json",
    "X-Employee-Id": "emp-idriss-malonga",
    "User-Agent": "Mozilla/5.0 QA bug verification",
}


def post_json(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(BASE + path, data=data, headers=HEADERS, method="POST")
    try:
        with request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body or "{}")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            parsed = json.loads(body or "{}")
        except Exception:
            parsed = {"raw": body}
        return exc.code, parsed


def get_json(path):
    req = request.Request(BASE + path, headers=HEADERS, method="GET")
    with request.urlopen(req, timeout=20) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def main():
    checks = []

    # Explicit regression requested by main agent: Idriss Monday 2026-11-02 is OFF.
    status, body = post_json("/requests/multi", {
        "type": "conge",
        "dates": ["2026-11-02"],
        "comment": "QA invalid OFF day check",
    })
    detail_text = json.dumps(body, ensure_ascii=False)
    checks.append({"case": "off_day_2026_11_02", "status": status, "body": body})
    assert status == 400, f"Expected 400 for OFF day, got {status}: {detail_text}"
    assert "jour OFF" in detail_text, f"Expected 'jour OFF' in error: {detail_text}"

    # Related invalid statuses from the same endpoint: past and holiday.
    for name, day, expected in [
        ("past_day", "2026-01-05", "jour passé"),
        ("holiday_christmas", "2026-12-25", "jour férié"),
    ]:
        status, body = post_json("/requests/multi", {
            "type": "conge",
            "dates": [day],
            "comment": f"QA invalid {name}",
        })
        detail_text = json.dumps(body, ensure_ascii=False)
        checks.append({"case": name, "date": day, "status": status, "body": body})
        assert status == 400, f"Expected 400 for {name}, got {status}: {detail_text}"
        assert expected in detail_text, f"Expected '{expected}' in {name} error: {detail_text}"

    # Sanity: availability exposes the same OFF status for the explicit Monday.
    status, avail = get_json("/availability?month=2026-11")
    assert status == 200
    target = next(d for d in avail["days"] if d["date"] == "2026-11-02")
    checks.append({"case": "availability_2026_11_02", "status": status, "day": target})
    assert target["status"] == "off" and target["selectable"] is False, target

    print(json.dumps({"ok": True, "checks": checks}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        raise