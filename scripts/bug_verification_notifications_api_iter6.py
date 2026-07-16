#!/usr/bin/env python3
"""Focused API verification for iteration 6 notification bugs.

Checks:
- POST /api/channels/ch-accueil/messages no longer 500s and notifies Idriss + Léa.
- GET /api/notifications normalizes content/icon/link to non-null for Idriss.
- Trigger endpoints create notifications with expected links/icons for Idriss.

This script only uses the mocked X-Employee-Id auth contract used by the app.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests


BASE_URL = os.environ.get("MSPARK_BASE_URL", "https://mspark-employee-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OUT = Path("/app/test_reports/backend_notification_api_results_iter6.json")

ADMIN = "emp-marcus-simeo"
IDRISS = "emp-idriss-malonga"
LEA = "emp-lea-comm"


def h(emp_id: str) -> dict[str, str]:
    return {"Content-Type": "application/json", "X-Employee-Id": emp_id}


def call(method: str, path: str, emp_id: str, **kwargs: Any) -> requests.Response:
    url = f"{API}{path}"
    return requests.request(method, url, headers=h(emp_id), timeout=20, **kwargs)


def as_json(resp: requests.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return resp.text[:500]


def get_notifications(emp_id: str) -> list[dict[str, Any]]:
    r = call("GET", "/notifications", emp_id)
    r.raise_for_status()
    return r.json()


def find_notif(emp_id: str, *, type_: str, unique: str, link: str | None = None, icon: str | None = None) -> dict[str, Any] | None:
    for n in get_notifications(emp_id):
        haystack = " ".join(str(n.get(k) or "") for k in ("title", "content", "message")).lower()
        if n.get("type") != type_ or unique.lower() not in haystack:
            continue
        if link is not None and n.get("link") != link:
            continue
        if icon is not None and n.get("icon") != icon:
            continue
        return n
    return None


def assert_resp(results: dict[str, Any], key: str, resp: requests.Response, expected: int = 200) -> Any:
    body = as_json(resp)
    ok = resp.status_code == expected
    results["checks"][key] = {
        "ok": ok,
        "status": resp.status_code,
        "expected_status": expected,
        "body": body,
    }
    if not ok:
        raise AssertionError(f"{key}: expected HTTP {expected}, got {resp.status_code}: {body}")
    return body


def main() -> int:
    unique = f"BUGVERIF6-{int(time.time())}"
    results: dict[str, Any] = {
        "base_url": BASE_URL,
        "unique": unique,
        "checks": {},
        "created_records": [],
        "errors": [],
    }

    try:
        # Baseline normalization contract for Idriss: every returned row must have non-null content, icon, link.
        baseline = get_notifications(IDRISS)
        missing = [
            {"id": n.get("id"), "type": n.get("type"), "content": n.get("content"), "icon": n.get("icon"), "link": n.get("link")}
            for n in baseline
            if not n.get("content") or not n.get("icon") or not n.get("link")
        ]
        results["checks"]["baseline_idriss_notifications_normalized"] = {
            "ok": len(missing) == 0,
            "count": len(baseline),
            "missing_content_icon_or_link": missing,
        }
        if missing:
            raise AssertionError(f"Idriss has notifications missing content/icon/link: {missing[:3]}")

        # 1) Regular channel message by Marcus: must be 200 and notify Idriss + Léa.
        message_content = f"{unique} regular channel message"
        msg = assert_resp(
            results,
            "post_regular_channel_message_200",
            call("POST", "/channels/ch-accueil/messages", ADMIN, json={"content": message_content}),
        )
        results["created_records"].append({"kind": "message", "id": msg.get("id"), "content": message_content})
        for emp_id, label in [(IDRISS, "idriss"), (LEA, "lea")]:
            n = find_notif(emp_id, type_="message", unique=message_content, link="/messagerie?channel=ch-accueil", icon="message-circle")
            results["checks"][f"regular_message_notification_{label}"] = {"ok": bool(n), "notification": n}
            if not n:
                raise AssertionError(f"No regular message notification found for {label}")

        # 2) News trigger.
        news_title = f"{unique} nouvelle actualité"
        news = assert_resp(
            results,
            "post_admin_news_200",
            call("POST", "/admin/news", ADMIN, json={"title": news_title, "content": "Contenu QA", "category": "info", "active": True}),
        )
        results["created_records"].append({"kind": "news", "id": news.get("id"), "title": news_title})
        n = find_notif(IDRISS, type_="news", unique=news_title, link=f"/actualites/{news['id']}", icon="megaphone")
        results["checks"]["news_notification_idriss"] = {"ok": bool(n), "notification": n}
        if not n:
            raise AssertionError("No news notification found for Idriss")

        # 3) Event trigger.
        event_title = f"{unique} événement agenda"
        event = assert_resp(
            results,
            "post_admin_event_200",
            call("POST", "/admin/events", ADMIN, json={"title": event_title, "description": "Event QA", "date": "2026-08-20", "group_targets": ["all"]}),
        )
        results["created_records"].append({"kind": "event", "id": event.get("id"), "title": event_title})
        n = find_notif(IDRISS, type_="event", unique=event_title, link=f"/agenda/event/{event['id']}", icon="calendar")
        results["checks"]["event_notification_idriss"] = {"ok": bool(n), "notification": n}
        if not n:
            raise AssertionError("No event notification found for Idriss")

        # 4) Internal feed post trigger.
        post_title = f"{unique} publication fil"
        post = assert_resp(
            results,
            "post_feed_post_200",
            call("POST", "/posts", ADMIN, json={"title": post_title, "content": "Post QA", "category": "annonce", "posted_as": "personal"}),
        )
        results["created_records"].append({"kind": "post", "id": post.get("id"), "title": post_title})
        n = find_notif(IDRISS, type_="post", unique=post_title, link=f"/actualites/{post['id']}", icon="megaphone")
        results["checks"]["post_notification_idriss"] = {"ok": bool(n), "notification": n}
        if not n:
            raise AssertionError("No post notification found for Idriss")

        # 5) Payslip/document trigger.
        payslip = assert_resp(
            results,
            "post_admin_payslip_200",
            call("POST", "/admin/documents/payslip", ADMIN, json={"employee_id": IDRISS, "year": 2026, "month": 7}),
        )
        results["created_records"].append({"kind": "payslip", "id": payslip.get("id"), "name": payslip.get("name")})
        n = find_notif(IDRISS, type_="document", unique="bulletin de juillet 2026", link="/documents", icon="file-text")
        results["checks"]["payslip_notification_idriss"] = {"ok": bool(n), "notification": n}
        if not n:
            raise AssertionError("No payslip/document notification found for Idriss")

        # 6) Admin broadcast trigger.
        broadcast_content = f"{unique} broadcast accueil"
        broadcast = assert_resp(
            results,
            "post_admin_broadcast_200",
            call("POST", "/admin/broadcast", ADMIN, json={"content": broadcast_content, "channel_id": "ch-accueil"}),
        )
        results["created_records"].append({"kind": "broadcast", "id": broadcast.get("id"), "content": broadcast_content})
        n = find_notif(IDRISS, type_="message", unique=broadcast_content, link="/messagerie?channel=ch-accueil", icon="message-circle")
        results["checks"]["broadcast_notification_idriss"] = {"ok": bool(n), "notification": n}
        if not n:
            raise AssertionError("No broadcast notification found for Idriss")

        # Final normalization after all triggers.
        final_items = get_notifications(IDRISS)
        missing_final = [
            {"id": n.get("id"), "type": n.get("type"), "content": n.get("content"), "icon": n.get("icon"), "link": n.get("link")}
            for n in final_items
            if not n.get("content") or not n.get("icon") or not n.get("link")
        ]
        results["checks"]["final_idriss_notifications_normalized"] = {
            "ok": len(missing_final) == 0,
            "count": len(final_items),
            "missing_content_icon_or_link": missing_final,
        }
        if missing_final:
            raise AssertionError(f"Final Idriss notifications missing content/icon/link: {missing_final[:3]}")

        results["ok"] = all(c.get("ok") for c in results["checks"].values())
    except Exception as exc:  # noqa: BLE001 - test report should contain exact failure
        results["ok"] = False
        results["errors"].append(str(exc))
    finally:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(results, ensure_ascii=False, indent=2))

    return 0 if results.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())