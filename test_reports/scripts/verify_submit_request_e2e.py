#!/usr/bin/env python3
"""Focused positive E2E API check for creating a non-calendar RH request."""
import json
import time
from urllib import request, error, parse

BASE = "https://mspark-employee-hub.preview.emergentagent.com/api"
HEADERS = {
    "Content-Type": "application/json",
    "X-Employee-Id": "emp-lea-comm",
    "User-Agent": "Mozilla/5.0 QA bug verification",
}


def req_json(method, path, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = request.Request(BASE + path, data=data, headers=HEADERS, method=method)
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


def main():
    marker = f"QA modal submit e2e {int(time.time())}"
    payload = {
        "type": "materiel",
        "start_date": "2026-08-03",
        "end_date": "2026-08-03",
        "comment": marker,
        "amount": None,
    }
    status, created = req_json("POST", "/requests", payload)
    assert status == 200, f"POST /requests failed: {status} {created}"
    req_id = created.get("id")
    assert req_id, f"No request id returned: {created}"
    assert created["employee_id"] == "emp-lea-comm"
    assert created["type"] == "materiel"
    assert created["comment"] == marker
    assert created["status"] == "pending"

    status, items = req_json("GET", "/requests?" + parse.urlencode({"status": "pending"}))
    assert status == 200, f"GET /requests failed: {status} {items}"
    found = next((r for r in items if r.get("id") == req_id), None)
    assert found, f"Created request {req_id} not returned in pending requests"
    print(json.dumps({"ok": True, "created": created, "found_in_list": found}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()