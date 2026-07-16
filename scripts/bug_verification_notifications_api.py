
#!/usr/bin/env python3
"""Focused backend verification for notifications bug (July 2026)."""
import json
import os
import sys
import time
from pathlib import Path
from datetime import date, timedelta

import requests

BASE = os.environ.get("FRONTEND_URL", "https://mspark-employee-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN = {"X-Employee-Id": "emp-marcus-simeo", "Content-Type": "application/json"}
IDRISS = {"X-Employee-Id": "emp-idriss-malonga", "Content-Type": "application/json"}

run_id = str(int(time.time()))
results = {"run_id": run_id, "api": API, "checks": [], "created": {}}


def check(name, ok, details=None):
    entry = {"name": name, "ok": bool(ok), "details": details or {}}
    results["checks"].append(entry)
    print(("PASS" if ok else "FAIL"), name, json.dumps(details or {}, ensure_ascii=False))
    return ok


def req(method, path, headers=None, **kwargs):
    url = f"{API}{path}"
    r = requests.request(method, url, headers=headers or IDRISS, timeout=25, **kwargs)
    try:
        data = r.json()
    except Exception:
        data = r.text[:500]
    return r, data


def idriss_notifications():
    r, data = req("GET", "/notifications", headers=IDRISS)
    check("GET /notifications responds", r.status_code == 200 and isinstance(data, list), {"status": r.status_code, "count": len(data) if isinstance(data, list) else None})
    return data if isinstance(data, list) else []


def find_new_notif(before_ids, ntype=None, link=None, content_contains=None, icon=None):
    notes = idriss_notifications()
    candidates = [n for n in notes if n.get("id") not in before_ids]
    if ntype:
        candidates = [n for n in candidates if n.get("type") == ntype]
    if link:
        candidates = [n for n in candidates if n.get("link") == link]
    if content_contains:
        candidates = [n for n in candidates if content_contains in (n.get("content") or n.get("message") or "")]
    if icon:
        candidates = [n for n in candidates if n.get("icon") == icon]
    return (candidates[0] if candidates else None), notes

# Baseline
baseline = idriss_notifications()
before_ids = {n.get("id") for n in baseline}

# 1) News -> notification with type/news link/content/icon
news_title = f"TEST notif actualité {run_id}"
r, news = req("POST", "/admin/news", headers=ADMIN, json={
    "title": news_title,
    "content": f"<p>Contenu test notification {run_id}</p>",
    "category": "Test",
    "active": True,
    "featured": False,
})
news_ok = check("POST /admin/news creates news", r.status_code == 200 and isinstance(news, dict) and news.get("id"), {"status": r.status_code, "id": news.get("id") if isinstance(news, dict) else None})
if news_ok:
    results["created"]["news_id"] = news["id"]
    n, _ = find_new_notif(before_ids, "news", f"/actualites/{news['id']}", news_title, "megaphone")
    check("news notification has type= news, content, icon, link", bool(n and n.get("content") and n.get("icon") and n.get("link") and n.get("read") is False), n)
    before_ids.add(n.get("id") if n else None)

# 2) Event all -> notification with /agenda/event/{id}
event_title = f"TEST notif événement {run_id}"
r, ev = req("POST", "/admin/events", headers=ADMIN, json={
    "title": event_title,
    "description": "Event notification test",
    "date": (date.today() + timedelta(days=15)).isoformat(),
    "start_time": "10:30",
    "location": "Salle QA",
    "group_targets": ["all"],
    "category": "event",
})
event_ok = check("POST /admin/events creates event", r.status_code == 200 and isinstance(ev, dict) and ev.get("id"), {"status": r.status_code, "id": ev.get("id") if isinstance(ev, dict) else None})
if event_ok:
    results["created"]["event_id"] = ev["id"]
    n, _ = find_new_notif(before_ids, "event", f"/agenda/event/{ev['id']}", event_title, "calendar")
    check("event notification has type=event, content, icon, link", bool(n and n.get("content") and n.get("icon") and n.get("link") and n.get("read") is False), n)
    before_ids.add(n.get("id") if n else None)

# 3) Post -> notification to other employees with link /actualites/{postId}
post_title = f"TEST notif post {run_id}"
r, post = req("POST", "/posts", headers=ADMIN, json={
    "title": post_title,
    "content": f"<p>Post notification test {run_id}</p>",
    "category": "annonce",
})
post_ok = check("POST /posts creates post", r.status_code == 200 and isinstance(post, dict) and post.get("id"), {"status": r.status_code, "id": post.get("id") if isinstance(post, dict) else None})
if post_ok:
    results["created"]["post_id"] = post["id"]
    n, _ = find_new_notif(before_ids, "post", f"/actualites/{post['id']}", post_title, "megaphone")
    check("post notification has type=post, content, icon, link", bool(n and n.get("content") and n.get("icon") and n.get("link") and n.get("read") is False), n)
    before_ids.add(n.get("id") if n else None)

# 4) Payslip document -> notification icon=file-text link=/documents
r, payslip_doc = req("POST", "/admin/documents/payslip", headers=ADMIN, json={
    "employee_id": "emp-idriss-malonga",
    "year": 2026,
    "month": 7,
})
payslip_ok = check("POST /admin/documents/payslip creates document", r.status_code == 200 and isinstance(payslip_doc, dict) and payslip_doc.get("id"), {"status": r.status_code, "id": payslip_doc.get("id") if isinstance(payslip_doc, dict) else None})
if payslip_ok:
    results["created"]["payslip_doc_id"] = payslip_doc["id"]
    n, _ = find_new_notif(before_ids, "document", "/documents", "Juillet 2026", "file-text")
    check("payslip notification has icon=file-text and link=/documents", bool(n and n.get("content") and n.get("icon") == "file-text" and n.get("link") == "/documents"), n)
    before_ids.add(n.get("id") if n else None)

# 5) Admin broadcast -> message notification link contains channel
broadcast_content = f"TEST broadcast accueil {run_id}"
r, msg = req("POST", "/admin/broadcast", headers=ADMIN, json={"channel_id": "ch-accueil", "content": broadcast_content})
broadcast_ok = check("POST /admin/broadcast creates broadcast", r.status_code == 200 and isinstance(msg, dict) and msg.get("id"), {"status": r.status_code, "id": msg.get("id") if isinstance(msg, dict) else None})
if broadcast_ok:
    results["created"]["broadcast_msg_id"] = msg["id"]
    n, _ = find_new_notif(before_ids, "message", "/messagerie?channel=ch-accueil", broadcast_content, "message-circle")
    check("broadcast message notification has content/icon/link", bool(n and n.get("content") and n.get("icon") == "message-circle" and "channel=ch-accueil" in (n.get("link") or "")), n)
    before_ids.add(n.get("id") if n else None)

# 6) Regular channel message action should create notifications too (reported as message action)
regular_message = f"TEST regular channel msg {run_id}"
r, data = req("POST", "/channels/ch-accueil/messages", headers=ADMIN, json={"content": regular_message})
regular_ok = r.status_code == 200 and isinstance(data, dict) and data.get("id")
check("POST /channels/ch-accueil/messages works for new message action", regular_ok, {"status": r.status_code, "response": data})
if regular_ok:
    n, _ = find_new_notif(before_ids, "message", "/messagerie?channel=ch-accueil", regular_message, "message-circle")
    check("regular channel message notification created", bool(n and n.get("content") and n.get("link") and n.get("icon")), n)
    before_ids.add(n.get("id") if n else None)

# 7) Every returned notification includes content/link/icon fields (for existing returned rows too)
notes = idriss_notifications()
missing = [
    {"id": n.get("id"), "type": n.get("type"), "missing": [k for k in ("content", "link", "icon") if not n.get(k)]}
    for n in notes
    if any(not n.get(k) for k in ("content", "link", "icon"))
]
check("/api/notifications rows all include non-empty content, link, icon", len(missing) == 0, {"missing_count": len(missing), "examples": missing[:5]})

# 8) Mark-one and mark-all as read API behavior
unread = [n for n in notes if not n.get("read")]
if unread:
    target = unread[0]
    r, data = req("POST", f"/notifications/{target['id']}/read", headers=IDRISS)
    notes_after = idriss_notifications()
    target_after = next((n for n in notes_after if n.get("id") == target["id"]), None)
    check("POST /notifications/{id}/read marks one notification read", r.status_code == 200 and target_after and target_after.get("read") is True, {"status": r.status_code, "id": target.get("id"), "after": target_after})
else:
    check("POST /notifications/{id}/read marks one notification read", True, {"skipped": "no unread notifications"})

r, data = req("POST", "/notifications/read-all", headers=IDRISS)
notes_after_all = idriss_notifications()
remaining_unread = [n.get("id") for n in notes_after_all if not n.get("read")]
check("POST /notifications/read-all marks all Idriss notifications read", r.status_code == 200 and not remaining_unread, {"status": r.status_code, "remaining_unread_count": len(remaining_unread)})

results["passed"] = sum(1 for c in results["checks"] if c["ok"])
results["failed"] = sum(1 for c in results["checks"] if not c["ok"])
Path("/app/test_reports/backend_notification_api_results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
print("RESULTS_FILE /app/test_reports/backend_notification_api_results.json")
if results["failed"]:
    sys.exit(1)
