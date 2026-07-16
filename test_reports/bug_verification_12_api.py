#!/usr/bin/env python3
"""Focused API checks for bug: Soccer Bar menu additions + Idriss 25 meal points."""
import json
import sys
from urllib.parse import urljoin

import requests

BASE = "https://mspark-employee-hub.preview.emergentagent.com"
API = urljoin(BASE, "/api/")

results = {"base": BASE, "checks": []}

def record(name, passed, details):
    results["checks"].append({"name": name, "passed": bool(passed), "details": details})
    print(("PASS" if passed else "FAIL") + f" - {name}: {details}")

def get(path, employee_id=None, **params):
    headers = {}
    if employee_id:
        headers["X-Employee-Id"] = employee_id
    resp = requests.get(urljoin(API, path.lstrip("/")), headers=headers, params=params, timeout=20)
    return resp

try:
    # Menu API proof
    r = get("menu", store="soccer_bar")
    record("GET /api/menu?store=soccer_bar status", r.status_code == 200, {"status": r.status_code})
    menu = r.json()
    record("Soccer Bar item count", len(menu) == 17, {"count": len(menu)})
    by_name = {item.get("name"): item for item in menu}
    expected = {
        "Côte de boeuf": {"category": "Viandes", "points": 22, "image_substr": "cotedeboeufcuire"},
        "Crevettes sautées": {"category": "Poissons", "points": 16, "image_substr": "crevettes-sautees"},
    }
    for name, exp in expected.items():
        item = by_name.get(name)
        passed = bool(item) and item.get("category") == exp["category"] and item.get("points") == exp["points"] and bool(item.get("image")) and exp["image_substr"] in item.get("image", "")
        record(f"Menu item {name}", passed, item or {"missing": True})
    categories = sorted(set(item.get("category") for item in menu))
    record("Menu categories include Viandes and Poissons", {"Viandes", "Poissons"}.issubset(set(categories)), {"categories": categories})

    # Quota API proof
    r = get("me", employee_id="emp-idriss-malonga")
    idriss_me = r.json()
    record("GET /api/me Idriss daily_quota", r.status_code == 200 and idriss_me.get("daily_quota") == 25, {"status": r.status_code, "daily_quota": idriss_me.get("daily_quota"), "role_category": idriss_me.get("role_category")})

    r = get("meal-points/today", employee_id="emp-idriss-malonga")
    idriss_points = r.json()
    record("GET /api/meal-points/today Idriss quota/credit", r.status_code == 200 and idriss_points.get("daily_quota") == 25 and idriss_points.get("credited_points") == 25, {"status": r.status_code, "daily_quota": idriss_points.get("daily_quota"), "credited_points": idriss_points.get("credited_points"), "used": idriss_points.get("used"), "remaining": idriss_points.get("remaining")})
    record("Idriss remaining is 25 when no spend", idriss_points.get("used") == 0 and idriss_points.get("remaining") == 25, {"used": idriss_points.get("used"), "remaining": idriss_points.get("remaining"), "transactions": idriss_points.get("transactions")})

    r = get("me", employee_id="emp-marcus-simeo")
    marcus_me = r.json()
    record("GET /api/me Marcus default role quota", r.status_code == 200 and marcus_me.get("daily_quota") == 35, {"status": r.status_code, "daily_quota": marcus_me.get("daily_quota"), "role_category": marcus_me.get("role_category")})

except Exception as exc:
    record("Unhandled exception", False, repr(exc))

passed = all(c["passed"] for c in results["checks"])
results["passed"] = passed
with open("/app/test_reports/bug_verification_12_api_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
sys.exit(0 if passed else 1)
