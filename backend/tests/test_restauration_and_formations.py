"""
Backend tests for iter22:
 - Admin CRUD /api/admin/products (POST/PUT/DELETE) + non-admin 403
 - Newly created product appears in /api/menu and /api/menu?store=
 - Formation form_url + cover_image round-trip on POST/PUT/GET
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mspark-employee-hub.preview.emergentagent.com").rstrip("/")
ADMIN_ID = "emp-marcus-simeo"
EMP_ID = "emp-idriss-malonga"


def _h(emp_id):
    return {"X-Employee-Id": emp_id, "Content-Type": "application/json"}


# ────────── Products CRUD ──────────
class TestAdminProducts:
    created_pid = None

    def test_admin_create_product(self):
        payload = {
            "name": f"TEST_Frites_{uuid.uuid4().hex[:6]}",
            "description": "auto test",
            "store": "soccer_bar",
            "category": "Accompagnements",
            "points": 5,
            "price_eur": 4.5,
            "image": "",
            "allergens": [],
            "available": True,
        }
        r = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=_h(ADMIN_ID))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["store"] == "soccer_bar"
        assert data["points"] == 5
        assert data["price_eur"] == 4.5
        assert "id" in data
        assert "_id" not in data
        TestAdminProducts.created_pid = data["id"]
        TestAdminProducts.created_name = payload["name"]

    def test_non_admin_forbidden_create(self):
        payload = {
            "name": "TEST_Forbidden",
            "store": "soccer_bar",
            "category": "Accompagnements",
            "points": 1,
            "price_eur": 1.0,
        }
        r = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=_h(EMP_ID))
        assert r.status_code == 403, r.text

    def test_product_visible_in_public_menu(self):
        assert TestAdminProducts.created_pid, "Depends on create test"
        r = requests.get(f"{BASE_URL}/api/menu")
        assert r.status_code == 200
        items = r.json()
        # /api/menu returns dict-like grouped or list? probe both
        found = False
        if isinstance(items, list):
            found = any(it.get("id") == TestAdminProducts.created_pid for it in items)
        elif isinstance(items, dict):
            # possibly grouped
            for v in items.values():
                if isinstance(v, list) and any(it.get("id") == TestAdminProducts.created_pid for it in v):
                    found = True; break
        assert found, f"Newly created product not present in /api/menu. Response={str(items)[:400]}"

    def test_product_visible_in_menu_store_filter(self):
        assert TestAdminProducts.created_pid
        r = requests.get(f"{BASE_URL}/api/menu", params={"store": "soccer_bar"})
        assert r.status_code == 200
        data = r.json()
        if isinstance(data, list):
            ids = [it.get("id") for it in data]
        else:
            ids = []
            for v in data.values():
                if isinstance(v, list):
                    ids.extend([it.get("id") for it in v])
        assert TestAdminProducts.created_pid in ids

    def test_admin_update_product(self):
        assert TestAdminProducts.created_pid
        new_name = TestAdminProducts.created_name + "_UP"
        payload = {
            "name": new_name,
            "description": "updated",
            "store": "soccer_bar",
            "category": "Accompagnements",
            "points": 6,
            "price_eur": 5.0,
            "available": True,
        }
        r = requests.put(f"{BASE_URL}/api/admin/products/{TestAdminProducts.created_pid}",
                         json=payload, headers=_h(ADMIN_ID))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == new_name
        assert data["points"] == 6

    def test_non_admin_forbidden_update(self):
        payload = {"name": "x", "store": "soccer_bar", "category": "c", "points": 1, "price_eur": 1.0}
        r = requests.put(f"{BASE_URL}/api/admin/products/{TestAdminProducts.created_pid}",
                         json=payload, headers=_h(EMP_ID))
        assert r.status_code == 403

    def test_non_admin_forbidden_delete(self):
        r = requests.delete(f"{BASE_URL}/api/admin/products/{TestAdminProducts.created_pid}",
                            headers=_h(EMP_ID))
        assert r.status_code == 403

    def test_admin_delete_product(self):
        r = requests.delete(f"{BASE_URL}/api/admin/products/{TestAdminProducts.created_pid}",
                            headers=_h(ADMIN_ID))
        assert r.status_code == 200
        # confirm removal on public menu
        r2 = requests.get(f"{BASE_URL}/api/menu")
        assert r2.status_code == 200
        data = r2.json()
        ids = []
        if isinstance(data, list):
            ids = [it.get("id") for it in data]
        else:
            for v in data.values():
                if isinstance(v, list):
                    ids.extend([it.get("id") for it in v])
        assert TestAdminProducts.created_pid not in ids


# ────────── Formations form_url + cover_image ──────────
class TestFormationsFormUrl:
    created_fid = None

    def test_create_formation_with_form_url_and_cover(self):
        payload = {
            "title": "TEST_Formation_QA",
            "description": "auto",
            "category": "Sécurité",
            "date": "2027-01-15",
            "time": "10:00",
            "duration_hours": 2,
            "location": "Salle A",
            "instructor": "QA",
            "max_participants": 2,
            "cover_image": "https://example.com/cover.jpg",
            "form_url": "https://example.com/inscr",
        }
        r = requests.post(f"{BASE_URL}/api/admin/formations", json=payload, headers=_h(ADMIN_ID))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("form_url") == payload["form_url"]
        assert data.get("cover_image") == payload["cover_image"]
        TestFormationsFormUrl.created_fid = data["id"]

    def test_form_url_persists_on_get(self):
        assert TestFormationsFormUrl.created_fid
        r = requests.get(f"{BASE_URL}/api/formations")
        assert r.status_code == 200
        arr = r.json()
        f = next((x for x in arr if x.get("id") == TestFormationsFormUrl.created_fid), None)
        assert f is not None
        assert f.get("form_url") == "https://example.com/inscr"
        assert f.get("cover_image") == "https://example.com/cover.jpg"

    def test_update_formation_form_url(self):
        assert TestFormationsFormUrl.created_fid
        payload = {
            "title": "TEST_Formation_QA",
            "description": "auto up",
            "category": "Sécurité",
            "date": "2027-01-15",
            "time": "10:00",
            "duration_hours": 2,
            "location": "Salle A",
            "instructor": "QA",
            "max_participants": 2,
            "cover_image": "https://example.com/cover2.jpg",
            "form_url": "https://example.com/inscr2",
        }
        r = requests.put(f"{BASE_URL}/api/admin/formations/{TestFormationsFormUrl.created_fid}",
                         json=payload, headers=_h(ADMIN_ID))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("form_url") == "https://example.com/inscr2"
        assert d.get("cover_image") == "https://example.com/cover2.jpg"

    def test_cleanup_delete_formation(self):
        if TestFormationsFormUrl.created_fid:
            requests.delete(f"{BASE_URL}/api/admin/formations/{TestFormationsFormUrl.created_fid}",
                            headers=_h(ADMIN_ID))
