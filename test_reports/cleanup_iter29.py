import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values

env = dotenv_values("/app/backend/.env")
cli = AsyncIOMotorClient(env["MONGO_URL"])
db = cli[env["DB_NAME"]]
IDRISS = "emp-idriss-malonga"


async def main():
    r = await db.requests.delete_many({"comment": {"$regex": "^(TEST_|DBG_)"}})
    print("deleted test requests:", r.deleted_count)
    n = await db.news.delete_many({"title": {"$in": ["Test", "Test perm", "TEST_iter29_news", "TEST_perm_news", "TEST_nope", "TEST_x"]}})
    print("deleted test news:", n.deleted_count)
    ev = await db.events.delete_many({"title": {"$regex": "^TEST_"}})
    print("deleted test events:", ev.deleted_count)
    nl = await db.newsletters.delete_many({"title": {"$regex": "^TEST_"}})
    print("deleted test newsletters:", nl.deleted_count)
    us = await db.employees.delete_many({"first_name": {"$regex": "^TEST_"}})
    print("deleted test users:", us.deleted_count)
    # remove leave/rtt schedule entries injected by test approvals (future test dates)
    sc = await db.schedules.delete_many({
        "employee_id": IDRISS,
        "type": {"$in": ["leave", "rtt"]},
        "day": {"$gte": "2026-11-01"},
    })
    print("deleted injected schedule entries:", sc.deleted_count)
    await db.employees.update_one({"id": IDRISS}, {"$set": {
        "permissions": [],
        "is_admin": False,
        "can_manage_communication": False,
        "admin_role": "employe",
        "work_days": [],
        "off_days": [],
        "usual_hours": "",
        "weekly_pattern": {str(i): {"type": "off"} for i in range(7)},
        "statuses": [],
        "leave_balance": {"cp_n_1": 0.0, "cp_n": 2.5, "rtt": 0},
    }})
    u = await db.employees.find_one({"id": IDRISS}, {"_id": 0})
    print({k: u.get(k) for k in ("permissions", "is_admin", "work_days", "leave_balance", "personal_phone", "admin_role")})


asyncio.run(main())
