"""Iteration 32 — User creation wizard (email pro optional), password reset, login via both emails."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
ADMIN_HEADERS = {"X-Employee-Id": "emp-marcus-simeo", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(client, created_ids):
    yield
    for uid in created_ids:
        client.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=ADMIN_HEADERS)


# ── Module: POST /api/admin/users — email pro optional
@pytest.fixture(scope="module")
def new_user(client, created_ids):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "first_name": "TEST",
        "last_name": f"Wizard{suffix}",
        "personal_email": f"test_wizard_{suffix}@gmail.com",
        "personal_phone": "0612345678",
        "role": "Employé Polyvalent",
        "weekly_hours": "24",
    }
    r = client.post(f"{BASE_URL}/api/admin/users", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code in (200, 201), f"create failed {r.status_code}: {r.text[:400]}"
    data = r.json()
    uid = data.get("id") or (data.get("user") or {}).get("id")
    assert uid, f"no id in response: {data}"
    created_ids.append(uid)
    return {"payload": payload, "resp": data, "uid": uid}


def test_create_user_without_pro_email(new_user, client):
    data = new_user["resp"]
    user = data.get("user", data)
    # email must fall back to personal_email
    assert user.get("email") == new_user["payload"]["personal_email"], f"email fallback missing: {user.get('email')}"
    assert user.get("personal_email") == new_user["payload"]["personal_email"]
    # temp password returned somewhere
    temp = data.get("temp_password") or user.get("temp_password") or data.get("password") or user.get("password")
    assert temp and isinstance(temp, str) and len(temp) >= 8, f"no temp password in response: {data}"
    # verify persistence
    g = client.get(f"{BASE_URL}/api/admin/users/{new_user['uid']}", headers=ADMIN_HEADERS)
    assert g.status_code == 200
    got = g.json()
    assert got["personal_email"] == new_user["payload"]["personal_email"]
    assert got["email"] == new_user["payload"]["personal_email"]
    assert got.get("must_change_password") is True
    assert "_id" not in got


# ── Module: POST /api/admin/users/{uid}/reset-password
@pytest.fixture(scope="module")
def reset_pwd(client, new_user):
    r = client.post(f"{BASE_URL}/api/admin/users/{new_user['uid']}/reset-password", headers=ADMIN_HEADERS)
    assert r.status_code == 200, f"reset failed {r.status_code}: {r.text[:300]}"
    d = r.json()
    assert d.get("temp_password"), f"no temp_password: {d}"
    return d["temp_password"]


def test_reset_password_sets_must_change(client, new_user, reset_pwd):
    assert len(reset_pwd) >= 8
    g = client.get(f"{BASE_URL}/api/admin/users/{new_user['uid']}", headers=ADMIN_HEADERS)
    assert g.json().get("must_change_password") is True


def test_reset_password_unknown_user(client):
    r = client.post(f"{BASE_URL}/api/admin/users/does-not-exist/reset-password", headers=ADMIN_HEADERS)
    assert r.status_code == 404, r.status_code


# ── Module: POST /api/auth/login
def test_login_with_pro_email_and_temp_password(client, new_user, reset_pwd):
    # pro email == personal email fallback here; use stored email field
    g = client.get(f"{BASE_URL}/api/admin/users/{new_user['uid']}", headers=ADMIN_HEADERS)
    email = g.json()["email"]
    r = client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": reset_pwd})
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    d = r.json()
    assert d["employee_id"] == new_user["uid"]
    assert d["must_change_password"] is True
    assert d["first_name"] == "TEST"


def test_login_with_personal_email(client, new_user, reset_pwd):
    r = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": new_user["payload"]["personal_email"], "password": reset_pwd},
    )
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    assert r.json()["employee_id"] == new_user["uid"]


def test_login_wrong_password(client, new_user, reset_pwd):
    r = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": new_user["payload"]["personal_email"], "password": "WrongPwd!123"},
    )
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"


def test_login_case_insensitive_email(client, new_user, reset_pwd):
    r = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": new_user["payload"]["personal_email"].upper(), "password": reset_pwd},
    )
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"


# ── Regression: seed accounts
@pytest.mark.parametrize(
    "email,pwd,eid",
    [
        ("marcus.simeo@mspark.fr", "MSPark@Admin2026!", "emp-marcus-simeo"),
        ("idriss.malonga@gmail.com", "Idriss2026!", None),
        ("lea.dubois@mspark.fr", "MSPark@Comm2026!", "emp-lea-comm"),
        ("superadmin@mspark.fr", "MSPark@Super2026!", "emp-super-admin"),
    ],
)
def test_seed_logins(client, email, pwd, eid):
    r = client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"{email} -> {r.status_code}: {r.text[:200]}"
    d = r.json()
    if eid:
        assert d["employee_id"] == eid
    assert "first_name" in d


def test_admin_endpoint_requires_admin(client):
    r = client.get(f"{BASE_URL}/api/admin/users", headers={"X-Employee-Id": "emp-idriss"})
    assert r.status_code in (401, 403), f"expected 403 got {r.status_code}"
