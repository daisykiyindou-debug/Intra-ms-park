"""Focused API evidence for management carousel verification."""

import os
import sys
import requests

BASE = os.getenv("REACT_APP_BACKEND_URL", "https://mspark-employee-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

def main():
    login = requests.post(
        f"{API}/auth/login",
        json={"email": "marcus.simeo@mspark.fr", "password": "MSPark@Admin2026!"},
        timeout=20,
    )
    print("login_status", login.status_code)
    login.raise_for_status()
    emp_id = login.json()["employee_id"]
    headers = {"X-Employee-Id": emp_id}

    news = requests.get(f"{API}/news", headers=headers, timeout=20)
    print("news_status", news.status_code)
    news.raise_for_status()
    items = news.json()
    featured = [n for n in items if n.get("featured")]
    with_images = [n for n in items if n.get("image")]
    print("news_total", len(items))
    print("featured_total", len(featured))
    print("news_with_images", len(with_images))
    assert items, "Expected existing news/carousel data"
    assert featured, "Expected at least one featured carousel slide"
    assert with_images, "Expected at least one news/carousel image for absoluteUrl rendering proof"

    stats = requests.get(f"{API}/admin/stats", headers=headers, timeout=20)
    print("admin_stats_status", stats.status_code)
    stats.raise_for_status()

if __name__ == "__main__":
    try:
        main()
        print("TEST_RESULT: PASS api carousel data check")
    except Exception as exc:
        print(f"TEST_RESULT: FAIL api carousel data check: {exc}")
        sys.exit(1)