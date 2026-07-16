#!/usr/bin/env python3
"""Focused backend verification for carousel reorder endpoint."""
import json
import os
import sys
from urllib.request import Request, urlopen


BASE = os.environ.get("TEST_BASE_URL", "https://mspark-employee-hub.preview.emergentagent.com")


def request(method, path, body=None, employee_id="emp-marcus-simeo"):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "X-Employee-Id": employee_id,
        },
    )
    with urlopen(req, timeout=20) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def main():
    status, news = request("GET", "/api/news")
    assert status == 200, status
    assert isinstance(news, list) and len(news) >= 2, "Need at least two news items to reorder"
    original = sorted(news, key=lambda n: (n.get("order") or 100, n.get("date", "")))
    ids = [n["id"] for n in original]
    new_ids = list(reversed(ids))

    status, result = request("POST", "/api/admin/news/reorder", {"ids": new_ids})
    assert status == 200 and result.get("ok") is True, result

    status, after = request("GET", "/api/news")
    assert status == 200, status
    by_id = {n["id"]: n for n in after}
    orders = [by_id[nid]["order"] for nid in new_ids]
    assert orders == [(i + 1) * 10 for i in range(len(new_ids))], orders

    # Restore the initial order so the focused test is non-destructive.
    request("POST", "/api/admin/news/reorder", {"ids": ids})

    print(json.dumps({"ok": True, "tested_ids": len(ids), "verified_orders": orders}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - test script reports exact failure
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)