"""Helper: set Idriss' permissions via the admin API without wiping other fields.
Usage: python iter28_set_perms.py view_payslips publish_news   (no args = reset [])"""
import sys
import requests
from dotenv import dotenv_values

API = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
IDRISS = "emp-idriss-malonga"
FIELDS = [
    "first_name", "last_name", "birth_date", "email", "personal_email", "phone",
    "personal_phone", "address", "postal_code", "city", "country", "avatar",
    "account_status", "statuses", "department", "role", "manager_id",
    "contract_type", "weekly_hours", "hire_date", "contract_end_date",
    "category", "badge_rfid", "badge_expiry", "badge_active", "locker",
    "work_days", "off_days", "usual_hours", "break_time", "gross_salary",
    "net_salary", "hourly_rate", "iban", "bic", "account_holder", "meal_points",
    "contract_url", "admin_role", "permissions", "groups", "role_category",
]
h = {"X-Employee-Id": "emp-marcus-simeo", "Content-Type": "application/json"}
cur = requests.get(f"{API}/admin/users/{IDRISS}", headers=h).json()
payload = {k: cur.get(k) for k in FIELDS if cur.get(k) is not None}
payload["permissions"] = sys.argv[1:]
r = requests.put(f"{API}/admin/users/{IDRISS}", json=payload, headers=h)
print(r.status_code, r.json().get("permissions") if r.ok else r.text[:300])
