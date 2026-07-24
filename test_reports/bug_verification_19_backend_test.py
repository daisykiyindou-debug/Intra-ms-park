#!/usr/bin/env python3
"""Focused backend verification for contract_url persistence and seed password-change auth."""

import json
import os
import time
from datetime import datetime, timezone

import requests
from pymongo import MongoClient


BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BASE_URL}/api"
ADMIN_ID = "emp-marcus-simeo"
IDRISS_ID = "emp-idriss-malonga"
ADMIN_EMAIL = "marcus.simeo@mspark.fr"
ADMIN_PASSWORD = "MSPark@Admin2026!"
IDRISS_EMAIL = "idriss.malonga@gmail.com"
IDRISS_SEED_PASSWORD = "Idriss2026!"
IDRISS_NEW_PASSWORD = "NouveauPass2027!"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def now_tag():
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def call(method, path, *, employee_id=None, expected=None, **kwargs):
    headers = kwargs.pop("headers", {}) or {}
    if employee_id:
        headers["X-Employee-Id"] = employee_id
    if "json" in kwargs:
        headers.setdefault("Content-Type", "application/json")
    resp = requests.request(method, f"{API}{path}", headers=headers, timeout=15, **kwargs)
    body = None
    try:
        body = resp.json()
    except Exception:
        body = resp.text
    if expected is not None and resp.status_code != expected:
        raise AssertionError(f"{method} {path} expected {expected}, got {resp.status_code}: {body}")
    return resp.status_code, body


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    tag = now_tag()
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    results = {"base_url": BASE_URL, "db_name": DB_NAME, "steps": [], "cleanup": []}
    created_user_id = None
    created_email = f"qa.contract.{tag}@example.com"
    created_temp_password = "TempPass2026!"
    created_new_password = "CreatedUserNew2027!"
    contract_url_1 = f"http://x/c-{tag}-1.pdf"
    contract_url_2 = f"http://x/c-{tag}-2.pdf"

    try:
        # Sanity: admin login should be valid (auth is MOCKED/custom header-based in this app).
        status, body = call("POST", "/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, expected=200)
        assert_true(body.get("employee_id") == ADMIN_ID and body.get("is_admin") is True, "Admin login did not return expected admin identity")
        results["steps"].append({"name": "admin_login", "status": status, "employee_id": body.get("employee_id")})

        # 1) POST /admin/users with contract_url -> employee persisted + document visible to target employee.
        payload = {
            "first_name": "QAContract",
            "last_name": tag,
            "email": created_email,
            "personal_email": created_email,
            "phone": "0102030405",
            "personal_phone": "0607080910",
            "address": "1 Rue QA",
            "postal_code": "75001",
            "city": "Paris",
            "country": "France",
            "temp_password": created_temp_password,
            "force_password_change": True,
            "account_status": "active",
            "statuses": ["ops"],
            "department": "QA",
            "role": "Testeur QA",
            "contract_type": "CDI",
            "weekly_hours": "24h",
            "hire_date": "2026-07-01",
            "category": "Employé",
            "badge_rfid": f"QA-{tag}",
            "badge_active": True,
            "work_days": ["monday", "tuesday", "wednesday"],
            "off_days": ["saturday", "sunday"],
            "meal_points": 12,
            "contract_url": contract_url_1,
            "admin_role": "employe",
            "permissions": [],
            "groups": [],
            "role_category": "employe",
        }
        status, body = call("POST", "/admin/users", employee_id=ADMIN_ID, json=payload, expected=200)
        created_user_id = body["user"]["id"]
        assert_true(body["user"].get("contract_url") == contract_url_1, "Created user response did not preserve contract_url")
        assert_true(body.get("temp_password") == created_temp_password, "Admin-created temp password mismatch")
        assert_true(body["user"].get("meal_points") == 12 and body["user"].get("daily_quota") == 12, "Explicit meal_points/daily_quota regression on create")
        assert_true(body["user"].get("badge_active") is True, "badge_active regression on create")
        assert_true(body["user"].get("weekly_pattern", {}).get("0", {}).get("type") == "shift", "weekly_pattern work-day regression on create")
        assert_true(body["user"].get("weekly_pattern", {}).get("5", {}).get("type") == "off", "weekly_pattern off-day regression on create")

        db_doc_1 = db.documents.find_one({"target_employee_id": created_user_id, "category": "Contrat", "url": contract_url_1}, {"_id": 0})
        assert_true(db_doc_1 is not None, "DB document for created contract_url not found with target_employee_id/category/url")
        status, docs = call("GET", "/documents", employee_id=created_user_id, expected=200)
        visible_doc_1 = [d for d in docs if d.get("url") == contract_url_1 and d.get("target_employee_id") == created_user_id]
        assert_true(len(visible_doc_1) == 1, "Contract document from user creation is not visible in GET /documents for that employee")
        status, me_body = call("GET", "/me", employee_id=created_user_id, expected=200)
        assert_true(me_body.get("meal_points") == 12 and me_body.get("daily_quota") == 12, "Profile /me did not expose expected meal_points/daily_quota")
        assert_true(me_body.get("badge_rfid") == f"QA-{tag}" and me_body.get("badge_active") is True, "Profile /me did not expose expected badge fields")
        status, meal_body = call("GET", "/meal-points/today", employee_id=created_user_id, expected=200)
        assert_true(meal_body.get("credited_points") == 12, "meal_points auto/credit endpoint regression for created user")
        results["steps"].append({"name": "create_user_contract_document_and_profile_regressions", "status": status, "user_id": created_user_id, "db_doc": db_doc_1, "visible_count": len(visible_doc_1), "profile_fields_checked": ["meal_points", "daily_quota", "badge_rfid", "badge_active", "weekly_pattern"], "meal_points_today": meal_body})

        # 2) PUT /admin/users/{uid} with a new contract_url -> add a second document, do not overwrite/delete old one.
        status, body = call("PUT", f"/admin/users/{created_user_id}", employee_id=ADMIN_ID, json={"contract_url": contract_url_2}, expected=200)
        assert_true(body.get("contract_url") == contract_url_2, "Updated user response did not contain new contract_url")
        contract_docs = list(db.documents.find({"target_employee_id": created_user_id, "category": "Contrat", "url": {"$in": [contract_url_1, contract_url_2]}}, {"_id": 0}))
        urls = sorted(d.get("url") for d in contract_docs)
        assert_true(urls == sorted([contract_url_1, contract_url_2]), f"Expected two separate contract docs after update, got URLs {urls}")
        status, docs = call("GET", "/documents", employee_id=created_user_id, expected=200)
        visible_urls = sorted(d.get("url") for d in docs if d.get("target_employee_id") == created_user_id and d.get("category") == "Contrat" and d.get("url") in [contract_url_1, contract_url_2])
        assert_true(visible_urls == sorted([contract_url_1, contract_url_2]), f"GET /documents did not show both contract docs after update, got {visible_urls}")
        results["steps"].append({"name": "update_user_adds_new_contract_document", "status": status, "visible_urls": visible_urls})

        # 3) Idriss seed password change: old seed accepted as current, new login works, old seed still works, wrong rejected.
        status, body = call("POST", "/me/change-password", employee_id=IDRISS_ID, json={"current_password": IDRISS_SEED_PASSWORD, "new_password": IDRISS_NEW_PASSWORD}, expected=200)
        assert_true(body.get("ok") is True, "Idriss password change did not return ok")
        status_new, login_new = call("POST", "/auth/login", json={"email": IDRISS_EMAIL, "password": IDRISS_NEW_PASSWORD}, expected=200)
        status_old, login_old = call("POST", "/auth/login", json={"email": IDRISS_EMAIL, "password": IDRISS_SEED_PASSWORD}, expected=200)
        status_wrong, login_wrong = call("POST", "/auth/login", json={"email": IDRISS_EMAIL, "password": "wrong"}, expected=401)
        assert_true(login_new.get("employee_id") == IDRISS_ID, "New Idriss password login returned wrong identity")
        assert_true(login_old.get("employee_id") == IDRISS_ID, "Old Idriss seed password login returned wrong identity")
        results["steps"].append({"name": "idriss_seed_password_change_dual_login", "change_status": status, "new_login_status": status_new, "old_seed_login_status": status_old, "wrong_login_status": status_wrong, "wrong_detail": login_wrong})

        # 4) Regression: an admin-created DB user can change their password and log in with the new password.
        status, body = call("POST", "/me/change-password", employee_id=created_user_id, json={"current_password": created_temp_password, "new_password": created_new_password}, expected=200)
        assert_true(body.get("ok") is True, "Created user password change did not return ok")
        status, body = call("POST", "/auth/login", json={"email": created_email, "password": created_new_password}, expected=200)
        assert_true(body.get("employee_id") == created_user_id, "Created user login with new password returned wrong identity")
        status_wrong_created, _ = call("POST", "/auth/login", json={"email": created_email, "password": created_temp_password}, expected=401)
        results["steps"].append({"name": "created_user_password_change_login", "new_login_status": status, "old_password_rejected_status": status_wrong_created})

        results["verdict"] = "passed"
    except Exception as exc:
        results["verdict"] = "failed"
        results["error"] = repr(exc)
        raise
    finally:
        # Restore Idriss to the documented seed password so shared credentials remain usable.
        try:
            restore_status, restore_body = call("POST", "/me/change-password", employee_id=IDRISS_ID, json={"current_password": IDRISS_NEW_PASSWORD, "new_password": IDRISS_SEED_PASSWORD}, expected=200)
            results["cleanup"].append({"name": "restore_idriss_seed_password", "status": restore_status, "body": restore_body})
            # Confirm both seed and (by dual-accept via DB password now equal to seed) documented credential work; changed new password should now be rejected.
            call("POST", "/auth/login", json={"email": IDRISS_EMAIL, "password": IDRISS_SEED_PASSWORD}, expected=200)
            call("POST", "/auth/login", json={"email": IDRISS_EMAIL, "password": IDRISS_NEW_PASSWORD}, expected=401)
        except Exception as cleanup_exc:
            # Last resort direct DB restore to avoid breaking future tests.
            db.employees.update_one({"id": IDRISS_ID}, {"$set": {"password": IDRISS_SEED_PASSWORD, "must_change_password": False}})
            results["cleanup"].append({"name": "restore_idriss_seed_password_direct_db", "error": repr(cleanup_exc)})

        # Remove transient QA user/docs so reruns stay clean. Evidence is stored in results before cleanup.
        if created_user_id:
            deleted_docs = db.documents.delete_many({"target_employee_id": created_user_id}).deleted_count
            deleted_emp = db.employees.delete_one({"id": created_user_id}).deleted_count
            results["cleanup"].append({"name": "delete_created_user_and_docs", "user_id": created_user_id, "deleted_docs": deleted_docs, "deleted_emp": deleted_emp})

        out_path = "/app/test_reports/bug_verification_19_backend_results.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False, default=str)
        print(json.dumps(results, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()