#!/usr/bin/env python3
"""Focused backend verification for admin user management bug."""
import json
import sys
import time
from pathlib import Path

import requests

BASE = "http://localhost:8001/api"
ADMIN_HEADERS = {"X-Employee-Id": "emp-marcus-simeo", "Content-Type": "application/json"}
RUN_ID = int(time.time())
EMAIL = f"qa.backend.{RUN_ID}@example.com"
PHONE = f"0600{str(RUN_ID)[-6:]}"


def req(method, path, *, headers=None, json_body=None, expected=None):
    r = requests.request(method, f"{BASE}{path}", headers=headers or ADMIN_HEADERS, json=json_body, timeout=20)
    try:
        data = r.json()
    except Exception:
        data = r.text
    if expected is not None and r.status_code != expected:
        raise AssertionError(f"{method} {path} expected {expected}, got {r.status_code}: {data}")
    return r.status_code, data


def main():
    results = {"run_id": RUN_ID, "email": EMAIL, "checks": []}
    uid = None
    try:
        payload = {
            "first_name": "QABackend",
            "last_name": str(RUN_ID),
            "personal_email": EMAIL,
            "personal_phone": PHONE,
            "admin_role": "employe",
            "groups": ["QA", "Backend"],
            "permissions": ["view_payslips"],
        }
        _, created = req("POST", "/admin/users", json_body=payload, expected=200)
        user = created["user"]
        temp_password = created["temp_password"]
        uid = user["id"]
        assert user["email"] == EMAIL, user
        assert user["phone"] == PHONE, user
        assert temp_password and len(temp_password) >= 8
        results["checks"].append("create fallback email/phone response ok")

        _, listed = req("GET", "/admin/users", expected=200)
        assert any(u["id"] == uid and u.get("email") == EMAIL and u.get("phone") == PHONE for u in listed)
        results["checks"].append("created user immediately appears in admin list")

        _, login = req("POST", "/auth/login", headers={"Content-Type": "application/json"}, json_body={"email": EMAIL, "password": temp_password}, expected=200)
        assert login["employee_id"] == uid
        results["checks"].append("created user can login with generated password")

        update_payload = dict(payload)
        update_payload.update({"first_name": "QAEdited", "admin_role": "communication", "groups": ["QAEdited"], "personal_phone": PHONE})
        _, updated = req("PUT", f"/admin/users/{uid}", json_body=update_payload, expected=200)
        assert updated["first_name"] == "QAEdited"
        assert updated["admin_role"] == "communication"
        assert updated["groups"] == ["QAEdited"]
        assert updated["can_manage_communication"] is True
        results["checks"].append("edit role/groups/info works")

        _, suspended = req("POST", f"/admin/users/{uid}/status", json_body={"account_status": "suspended"}, expected=200)
        assert suspended["status"] == "suspended"
        status, blocked = req("POST", "/auth/login", headers={"Content-Type": "application/json"}, json_body={"email": EMAIL, "password": temp_password})
        assert status == 403, blocked
        results["checks"].append("suspend blocks login")

        _, active = req("POST", f"/admin/users/{uid}/status", json_body={"account_status": "active"}, expected=200)
        assert active["status"] == "active"
        _, login2 = req("POST", "/auth/login", headers={"Content-Type": "application/json"}, json_body={"email": EMAIL, "password": temp_password}, expected=200)
        assert login2["employee_id"] == uid
        results["checks"].append("reactivate restores login")

        _, reset = req("POST", f"/admin/users/{uid}/reset-password", expected=200)
        new_password = reset["temp_password"]
        assert new_password and new_password != temp_password
        _, login3 = req("POST", "/auth/login", headers={"Content-Type": "application/json"}, json_body={"email": EMAIL, "password": new_password}, expected=200)
        assert login3["employee_id"] == uid
        results["checks"].append("reset password returns a new login-capable password")

        _, deleted = req("DELETE", f"/admin/users/{uid}", expected=200)
        assert deleted["deleted"] == 1
        uid = None
        results["checks"].append("delete works")
        results["status"] = "PASS"
    except Exception as exc:
        results["status"] = "FAIL"
        results["error"] = repr(exc)
        raise
    finally:
        if uid:
            try:
                req("DELETE", f"/admin/users/{uid}")
                results["cleanup"] = "deleted residual test user"
            except Exception as cleanup_exc:
                results["cleanup_error"] = repr(cleanup_exc)
        Path("/app/test_reports/admin_user_backend_iter17_results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        sys.exit(1)
    print("PASS")