import asyncio
import json
from datetime import date
from pathlib import Path

import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values

BASE = "http://localhost:8001/api"
ADMIN_ID = "emp-marcus-simeo"
REPORT = Path("/app/test_reports/bug_verification_20_backend_results.json")

async def main():
    env = dotenv_values("/app/backend/.env")
    client_db = AsyncIOMotorClient(env.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client_db[env.get("DB_NAME", "test_database")]
    created_id = None
    result = {"steps": [], "passed": False, "errors": []}
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            payload = {
                "first_name": "QAPlanning20",
                "last_name": "MonFri",
                "email": "qa.planning20@mspark.fr",
                "personal_email": "qa.planning20@example.test",
                "phone": "+33 1 23 45 67 89",
                "personal_phone": "+33 6 20 20 20 20",
                "statuses": ["bureau"],
                "department": "Web & IT",
                "role": "QA Planning",
                "work_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
                "usual_hours": "9h-17h",
                "admin_role": "employe",
                "force_password_change": False,
            }
            r = await client.post(f"{BASE}/admin/users", json=payload, headers={"X-Employee-Id": ADMIN_ID})
            result["steps"].append({"name": "POST /admin/users", "status_code": r.status_code, "body": r.text[:500]})
            r.raise_for_status()
            created = r.json()["user"]
            created_id = created["id"]
            result["created_user_id"] = created_id
            result["created_weekly_pattern"] = created.get("weekly_pattern")

            r = await client.get(f"{BASE}/schedule", params={"month": "2026-11"}, headers={"X-Employee-Id": created_id})
            result["steps"].append({"name": "GET /schedule?month=2026-11", "status_code": r.status_code})
            r.raise_for_status()
            schedules = r.json()
            nov_entries = [e for e in schedules if e["day"].startswith("2026-11")]
            shifts = [e for e in nov_entries if e.get("type") == "shift"]
            offs = [e for e in nov_entries if e.get("type") == "off"]
            bad_sched = []
            for e in nov_entries:
                wd = date.fromisoformat(e["day"]).weekday()
                if wd < 5:
                    if not (e.get("type") == "shift" and e.get("start") == "09:00" and e.get("end") == "17:00"):
                        bad_sched.append(e)
                else:
                    if e.get("type") != "off":
                        bad_sched.append(e)
            result["schedule_summary"] = {
                "total_returned_with_padding": len(schedules),
                "november_entries": len(nov_entries),
                "november_shifts": len(shifts),
                "november_offs": len(offs),
                "bad_schedule_entries": bad_sched[:10],
            }

            r = await client.get(f"{BASE}/availability", params={"month": "2026-11"}, headers={"X-Employee-Id": created_id})
            result["steps"].append({"name": "GET /availability?month=2026-11", "status_code": r.status_code})
            r.raise_for_status()
            availability = r.json()["days"]
            bad_availability_strict = []
            bad_availability_pattern = []
            for d in availability:
                wd = date.fromisoformat(d["date"]).weekday()
                if wd < 5:
                    if d.get("status") != "worked":
                        bad_availability_strict.append(d)
                    # For the underlying pattern, holiday is an acceptable overlay only if label says Férié.
                    if d.get("status") not in ("worked", "holiday"):
                        bad_availability_pattern.append(d)
                else:
                    if d.get("status") != "off":
                        bad_availability_strict.append(d)
                        bad_availability_pattern.append(d)
            result["availability_summary"] = {
                "days": len(availability),
                "worked": sum(1 for d in availability if d.get("status") == "worked"),
                "off": sum(1 for d in availability if d.get("status") == "off"),
                "holiday": [d for d in availability if d.get("status") == "holiday"],
                "bad_availability_strict": bad_availability_strict[:10],
                "bad_availability_pattern": bad_availability_pattern[:10],
            }
            # The requested contract for this verification is strict: November 2026
            # availability should return worked for every Mon-Fri and off for every
            # Sat-Sun for the created user's pattern.
            result["passed"] = (len(nov_entries) == 30 and not bad_sched and not bad_availability_strict)
        except Exception as exc:
            result["errors"].append(repr(exc))
        finally:
            if created_id:
                await client.delete(f"{BASE}/admin/users/{created_id}", headers={"X-Employee-Id": ADMIN_ID})
                await db.schedules.delete_many({"employee_id": created_id})
                await db.documents.delete_many({"target_employee_id": created_id})
            client_db.close()
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["passed"]:
        raise SystemExit(1)

if __name__ == "__main__":
    asyncio.run(main())
