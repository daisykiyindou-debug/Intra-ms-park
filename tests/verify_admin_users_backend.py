#!/usr/bin/env python3
"""Focused API verification for admin user-management/auth flow."""
import json
import os
import re
import sys
import time

import requests


BASE = os.environ.get("BACKEND_API", "http://localhost:8001/api")
ADMIN = {"X-Employee-Id": "emp-marcus-simeo", "Content-Type": "application/json"}
EMPLOYEE = {"X-Employee-Id": "emp-idriss-malonga", "Content-Type": "application/json"}


def check(name, condition, detail=""):
    if not condition:
        raise AssertionError(f"{name} failed: {detail}")
    print(f"PASS: {name}")


def req(method, path, **kwargs):
    url = f"{BASE}{path}"
    r = requests.request(method, url, timeout=20, **kwargs)
    try:
        body = r.json()
    except Exception:
        body = r.text
    print(f"{method} {path} -> {r.status_code} {json.dumps(body, ensure_ascii=False)[:500]}")
    return r, body


def main():
    suffix = int(time.time())
    email = f"qa.admin.users.{suffix}@example.com"
    created_id = None
    old_pwd = None
    new_pwd = None

    payload = {
        "first_name": "QA",
        "last_name": f"AdminFlow{suffix}",
        "personal_email": email,
        "personal_phone": "0611111111",
        "admin_role": "manager",
        "department": "OPS",
        "role": "Manager Test",
    }

    try:
        r, body = req("POST", "/admin/users", headers=EMPLOYEE, json=payload)
        check("non-admin create is forbidden", r.status_code == 403, body)

        r, body = req("POST", "/admin/users", headers=ADMIN, json=payload)
        check("admin create returns 200", r.status_code == 200, body)
        user = body.get("user", {})
        created_id = user.get("id")
        old_pwd = body.get("temp_password")
        check("created user id returned", bool(created_id), body)
        check("temp password returned", isinstance(old_pwd, str) and len(old_pwd) >= 8, body)
        check("matricule auto-generated MSP-XXXXX", bool(re.fullmatch(r"MSP-\d{5}", user.get("matricule", ""))), user)
        check("email persisted from personal email", user.get("email") == email or user.get("personal_email") == email, user)

        r, body = req("POST", "/auth/login", json={"email": email, "password": "wrong-password"})
        check("wrong password rejected", r.status_code == 401, body)

        r, body = req("POST", "/auth/login", json={"email": email, "password": old_pwd})
        check("new user can login with temp password", r.status_code == 200, body)
        check("login returns must_change_password", body.get("must_change_password") is True, body)
        check("login returns created employee id", body.get("employee_id") == created_id, body)

        r, body = req("POST", f"/admin/users/{created_id}/status", headers=ADMIN, json={"account_status": "suspended"})
        check("suspend returns ok", r.status_code == 200 and body.get("ok") is True, body)
        r, body = req("POST", "/auth/login", json={"email": email, "password": old_pwd})
        check("suspended user login blocked with 403", r.status_code == 403, body)
        check("suspended login message", "Ce compte est désactivé" in str(body), body)

        r, body = req("POST", f"/admin/users/{created_id}/status", headers=ADMIN, json={"account_status": "active"})
        check("reactivate returns ok", r.status_code == 200 and body.get("ok") is True, body)
        r, body = req("POST", "/auth/login", json={"email": email, "password": old_pwd})
        check("reactivated user login works", r.status_code == 200, body)

        r, body = req("POST", f"/admin/users/{created_id}/reset-password", headers=ADMIN)
        check("reset password returns ok/temp_password", r.status_code == 200 and body.get("ok") is True and body.get("temp_password"), body)
        new_pwd = body["temp_password"]
        check("new password differs from old", new_pwd != old_pwd, {"old": old_pwd, "new": new_pwd})
        r, body = req("POST", "/auth/login", json={"email": email, "password": old_pwd})
        check("old temp password no longer works", r.status_code == 401, body)
        r, body = req("POST", "/auth/login", json={"email": email, "password": new_pwd})
        check("new reset password works", r.status_code == 200, body)

        r, body = req("PUT", f"/admin/users/{created_id}", headers=ADMIN, json={"role": "Nouveau Poste", "department": "RH"})
        check("update returns 200", r.status_code == 200, body)
        check("role updated", body.get("role") == "Nouveau Poste", body)
        check("department updated", body.get("department") == "RH", body)

        r, body = req("GET", "/admin/users", headers=ADMIN)
        check("list users works", r.status_code == 200 and isinstance(body, list), body)
        check("created user appears in list before delete", any(u.get("id") == created_id for u in body), created_id)

        r, body = req("DELETE", f"/admin/users/{created_id}", headers=ADMIN)
        check("delete returns ok deleted=1", r.status_code == 200 and body.get("ok") is True and body.get("deleted") == 1, body)
        created_id = None

        r, body = req("GET", "/admin/users", headers=ADMIN)
        check("deleted user absent from list", r.status_code == 200 and not any(u.get("personal_email") == email for u in body), body)
        print("BACKEND_VERDICT: PASS")
        return 0
    finally:
        if created_id:
            try:
                req("DELETE", f"/admin/users/{created_id}", headers=ADMIN)
            except Exception as exc:
                print(f"Cleanup failed for {created_id}: {exc}", file=sys.stderr)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"BACKEND_VERDICT: FAIL: {exc}", file=sys.stderr)
        raise