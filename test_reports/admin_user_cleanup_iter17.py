#!/usr/bin/env python3
"""Cleanup QA users created by focused admin-user verification."""
import json
from pathlib import Path

import requests

BASE = "http://localhost:8001/api"
HEADERS = {"X-Employee-Id": "emp-marcus-simeo"}
PREFIXES = ("qa.ui.", "qa.reset.", "qa.probe.", "qa.backend.", "qa.copy.", "qa.status.", "qa.edit.")

r = requests.get(f"{BASE}/admin/users", headers=HEADERS, timeout=20)
r.raise_for_status()
deleted = []
for u in r.json():
    email = (u.get("personal_email") or u.get("email") or "").lower()
    if email.startswith(PREFIXES):
        d = requests.delete(f"{BASE}/admin/users/{u['id']}", headers=HEADERS, timeout=20)
        deleted.append({"id": u["id"], "email": email, "status": d.status_code, "body": d.text})

Path("/app/test_reports/admin_user_cleanup_iter17_results.json").write_text(
    json.dumps({"deleted": deleted}, indent=2), encoding="utf-8"
)
print(json.dumps({"deleted_count": len(deleted), "deleted": deleted}, indent=2))