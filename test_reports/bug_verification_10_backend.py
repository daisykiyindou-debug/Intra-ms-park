#!/usr/bin/env python3
"""Focused backend/API checks for bug verification iteration 10.

Creates deterministic notification seed data for the Idriss UI flow and verifies
the Soccer Bar menu API contains the newly requested items.
"""
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient


BASE_URL = os.environ.get(
    "PREVIEW_BASE_URL", "https://mspark-employee-hub.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
EMPLOYEE_ID = "emp-idriss-malonga"
ADMIN_ID = "emp-marcus-simeo"

CLICK_TITLE = "QA_NOTIFICATION_CLICK_10"
MARKALL_TITLE = "QA_NOTIFICATION_MARKALL_10"
READ_TITLE = "QA_NOTIFICATION_READ_10"

ASSET_HOST = "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/"
EXPECTED_MENU = {
    "Riz": {"category": "Accompagnements", "points": 4, "image_contains": "Cuire-le-riz-et-le-reussir.webp"},
    "Salade César": {"category": "Salades", "points": 12, "image_contains": "Salade-Cesar-Poulet-Pane-1.jpg"},
    "Cheesecake": {"category": "Desserts", "points": 8, "image_contains": "2-1.jpg"},
    "Flan pâtissier": {"category": "Desserts", "points": 7, "image_contains": "photo_flan_patissier_cuisinovores.webp"},
}


def api_check():
    print(f"Checking API at {API}")
    root = requests.get(f"{API}/", timeout=15)
    root.raise_for_status()
    print("API root OK", root.json())

    for email, password in [
        ("idriss.malonga@gmail.com", "Idriss2026!"),
        ("marcus.simeo@mspark.fr", "MSPark@Admin2026!"),
    ]:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        r.raise_for_status()
        print("Login OK", email, r.json().get("employee_id"))

    menu = requests.get(f"{API}/menu", params={"store": "soccer_bar"}, timeout=15)
    menu.raise_for_status()
    items = menu.json()
    print("Soccer Bar API item count", len(items))
    assert len(items) == 15, f"Expected 15 Soccer Bar items, got {len(items)}"
    by_name = {i["name"]: i for i in items}
    for name, expected in EXPECTED_MENU.items():
        assert name in by_name, f"Missing menu item {name}"
        item = by_name[name]
        assert item["category"] == expected["category"], (name, item["category"])
        assert item["points"] == expected["points"], (name, item["points"])
        assert item["image"].startswith(ASSET_HOST), (name, item["image"])
        assert expected["image_contains"] in item["image"], (name, item["image"])
    print("Expected new menu items OK", json.dumps({n: by_name[n] for n in EXPECTED_MENU}, ensure_ascii=False))


async def seed_notifications():
    env = dotenv_values("/app/backend/.env")
    mongo_url = env.get("MONGO_URL", "mongodb://localhost:27017").strip('"')
    db_name = env.get("DB_NAME", "test_database").strip('"')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    now = datetime.now(timezone.utc).isoformat()
    await db.notifications.delete_many({
        "employee_id": EMPLOYEE_ID,
        "title": {"$in": [CLICK_TITLE, MARKALL_TITLE, READ_TITLE]},
    })
    docs = [
        {
            "id": "qa-notif-click-10",
            "employee_id": EMPLOYEE_ID,
            "type": "post",
            "title": CLICK_TITLE,
            "content": "Unread notification that should disappear after click",
            "message": "Unread notification that should disappear after click",
            "icon": "megaphone",
            "link": "/actualites",
            "read": False,
            "created_at": now,
            "ts": now,
        },
        {
            "id": "qa-notif-markall-10",
            "employee_id": EMPLOYEE_ID,
            "type": "planning",
            "title": MARKALL_TITLE,
            "content": "Unread notification that should be cleared by mark all",
            "message": "Unread notification that should be cleared by mark all",
            "icon": "calendar",
            "link": "/rh/planning",
            "read": False,
            "created_at": now,
            "ts": now,
        },
        {
            "id": "qa-notif-read-10",
            "employee_id": EMPLOYEE_ID,
            "type": "document",
            "title": READ_TITLE,
            "content": "Already-read notification must not be visible in the drawer",
            "message": "Already-read notification must not be visible in the drawer",
            "icon": "file-text",
            "link": "/documents",
            "read": True,
            "created_at": now,
            "ts": now,
        },
    ]
    await db.notifications.insert_many(docs)
    client.close()
    seed_path = Path("/app/test_reports/bug_verification_10_seed.json")
    seed_path.write_text(json.dumps({
        "click_title": CLICK_TITLE,
        "markall_title": MARKALL_TITLE,
        "read_title": READ_TITLE,
        "notification_ids": [d["id"] for d in docs],
    }, indent=2), encoding="utf-8")
    print("Seeded notifications", seed_path)


if __name__ == "__main__":
    api_check()
    asyncio.run(seed_notifications())