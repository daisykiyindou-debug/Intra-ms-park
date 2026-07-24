import asyncio
import json
import uuid
from datetime import date, timedelta
from pathlib import Path

import httpx
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient


BASE = "http://localhost:8001/api"
ADMIN_ID = "emp-marcus-simeo"
REPORT = Path("/app/test_reports/bug_verification_21_backend_results.json")


def previous_month() -> str:
    first_this_month = date.today().replace(day=1)
    last_prev_month = first_this_month - timedelta(days=1)
    return last_prev_month.strftime("%Y-%m")


def day_map(days):
    return {d["date"]: d for d in days}


async def create_user(client: httpx.AsyncClient, *, suffix: str, pattern: bool) -> dict:
    payload = {
        "first_name": "QAAvail21",
        "last_name": suffix,
        "email": f"qa.avail21.{suffix.lower()}@mspark.fr",
        "personal_email": f"qa.avail21.{suffix.lower()}@example.test",
        "phone": "+33 1 21 21 21 21",
        "personal_phone": "+33 6 21 21 21 21",
        "statuses": ["bureau"],
        "department": "QA",
        "role": "QA Availability",
        "admin_role": "employe",
        "force_password_change": False,
        "leave_balance": {"cp_n_1": 10, "cp_n": 10, "rtt": 10},
    }
    if pattern:
        payload.update({
            "work_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            "usual_hours": "9h-17h",
        })
    r = await client.post(f"{BASE}/admin/users", json=payload, headers={"X-Employee-Id": ADMIN_ID})
    r.raise_for_status()
    return r.json()["user"]


async def main():
    env = dotenv_values("/app/backend/.env")
    mongo = AsyncIOMotorClient(env.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mongo[env.get("DB_NAME", "test_database")]

    created_ids = []
    inserted_request_ids = []
    result = {
        "passed": False,
        "passed_pattern_precedence": False,
        "passed_status_regression": False,
        "passed_no_pattern_holiday_fallback": False,
        "steps": [],
        "errors": [],
        "calendar_note": "November 2026 has 21 Mon-Fri work days and 9 weekend days.",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            # Main reported bug: weekly pattern must keep worked/off status on holidays.
            patterned = await create_user(client, suffix="Pattern", pattern=True)
            pattern_id = patterned["id"]
            created_ids.append(pattern_id)
            result["pattern_user"] = {
                "id": pattern_id,
                "weekly_pattern": patterned.get("weekly_pattern"),
            }

            r = await client.get(
                f"{BASE}/availability",
                params={"month": "2026-11"},
                headers={"X-Employee-Id": pattern_id},
            )
            result["steps"].append({"name": "GET /availability?month=2026-11 pattern user", "status_code": r.status_code})
            r.raise_for_status()
            days = r.json()["days"]
            by_date = day_map(days)
            holiday_days = [d for d in days if d.get("status") == "holiday"]
            counts = {
                "worked": sum(1 for d in days if d.get("status") == "worked"),
                "off": sum(1 for d in days if d.get("status") == "off"),
                "holiday": len(holiday_days),
                "total": len(days),
            }
            result["pattern_availability"] = {
                "counts": counts,
                "2026-11-01": by_date.get("2026-11-01"),
                "2026-11-02": by_date.get("2026-11-02"),
                "2026-11-07": by_date.get("2026-11-07"),
                "2026-11-11": by_date.get("2026-11-11"),
                "holiday_days": holiday_days,
            }
            pattern_failures = []
            if len(days) != 30:
                pattern_failures.append(f"Expected 30 days, got {len(days)}")
            if by_date.get("2026-11-01", {}).get("status") != "off":
                pattern_failures.append("2026-11-01 should be off, not holiday")
            if "Toussaint" not in (by_date.get("2026-11-01", {}).get("label") or ""):
                pattern_failures.append("2026-11-01 label should mention Toussaint")
            if by_date.get("2026-11-02", {}).get("status") != "worked":
                pattern_failures.append("2026-11-02 should be worked")
            if by_date.get("2026-11-07", {}).get("status") != "off":
                pattern_failures.append("2026-11-07 should be off")
            nov11 = by_date.get("2026-11-11", {})
            if nov11.get("status") != "worked":
                pattern_failures.append("2026-11-11 should be worked, not holiday")
            if "Férié" not in (nov11.get("label") or "") or "Armistice" not in (nov11.get("label") or ""):
                pattern_failures.append("2026-11-11 label should mention Férié / Armistice")
            if holiday_days:
                pattern_failures.append(f"No day should return status=holiday for patterned user, got {holiday_days}")
            if counts != {"worked": 21, "off": 9, "holiday": 0, "total": 30}:
                pattern_failures.append(f"Expected counts worked=21/off=9/holiday=0/total=30, got {counts}")
            result["pattern_failures"] = pattern_failures
            result["passed_pattern_precedence"] = not pattern_failures

            # Regression: past, approved CP, approved RTT, and pending still win over schedule/holiday.
            reg_reqs = [
                {"type": "conge", "status": "approved", "day": "2026-11-03", "label": "cp_approved"},
                {"type": "rtt", "status": "approved", "day": "2026-11-04", "label": "rtt_approved"},
                {"type": "conge", "status": "pending", "day": "2026-11-05", "label": "pending"},
            ]
            for rr in reg_reqs:
                rid = f"qa-avail21-{uuid.uuid4()}"
                inserted_request_ids.append(rid)
                await db.requests.insert_one({
                    "id": rid,
                    "employee_id": pattern_id,
                    "type": rr["type"],
                    "start_date": rr["day"],
                    "end_date": rr["day"],
                    "comment": "QA availability regression",
                    "amount": None,
                    "status": rr["status"],
                    "created_at": date.today().isoformat(),
                    "decided_at": date.today().isoformat() if rr["status"] == "approved" else None,
                })

            r = await client.get(
                f"{BASE}/availability",
                params={"month": "2026-11"},
                headers={"X-Employee-Id": pattern_id},
            )
            result["steps"].append({"name": "GET /availability?month=2026-11 after request seeds", "status_code": r.status_code})
            r.raise_for_status()
            reg_by_date = day_map(r.json()["days"])

            past_month = previous_month()
            r = await client.get(
                f"{BASE}/availability",
                params={"month": past_month},
                headers={"X-Employee-Id": pattern_id},
            )
            result["steps"].append({"name": f"GET /availability?month={past_month} past regression", "status_code": r.status_code})
            r.raise_for_status()
            past_days = r.json()["days"]
            past_sample = next((d for d in past_days if d["date"] < date.today().isoformat()), past_days[0] if past_days else None)

            status_failures = []
            expected_statuses = {
                "2026-11-03": "cp_approved",
                "2026-11-04": "rtt_approved",
                "2026-11-05": "pending",
            }
            for iso, expected in expected_statuses.items():
                if reg_by_date.get(iso, {}).get("status") != expected:
                    status_failures.append(f"{iso} expected {expected}, got {reg_by_date.get(iso)}")
            if not past_sample or past_sample.get("status") != "past":
                status_failures.append(f"Past day expected status=past, got {past_sample}")
            result["status_regression"] = {
                "2026-11-03": reg_by_date.get("2026-11-03"),
                "2026-11-04": reg_by_date.get("2026-11-04"),
                "2026-11-05": reg_by_date.get("2026-11-05"),
                "past_month": past_month,
                "past_sample": past_sample,
                "failures": status_failures,
            }
            result["passed_status_regression"] = not status_failures

            # Regression requested by main agent: when no weekly pattern exists, holidays remain holiday.
            no_pattern = await create_user(client, suffix="NoPattern", pattern=False)
            no_pattern_id = no_pattern["id"]
            created_ids.append(no_pattern_id)
            result["no_pattern_user"] = {
                "id": no_pattern_id,
                "weekly_pattern": no_pattern.get("weekly_pattern"),
                "work_days": no_pattern.get("work_days"),
                "off_days": no_pattern.get("off_days"),
            }
            r = await client.get(
                f"{BASE}/availability",
                params={"month": "2026-11"},
                headers={"X-Employee-Id": no_pattern_id},
            )
            result["steps"].append({"name": "GET /availability?month=2026-11 no-pattern user", "status_code": r.status_code})
            r.raise_for_status()
            np_by_date = day_map(r.json()["days"])
            no_pattern_failures = []
            for iso in ("2026-11-01", "2026-11-11"):
                if np_by_date.get(iso, {}).get("status") != "holiday":
                    no_pattern_failures.append(f"{iso} expected holiday for no-pattern user, got {np_by_date.get(iso)}")
            result["no_pattern_holiday_fallback"] = {
                "2026-11-01": np_by_date.get("2026-11-01"),
                "2026-11-11": np_by_date.get("2026-11-11"),
                "holiday_count": sum(1 for d in np_by_date.values() if d.get("status") == "holiday"),
                "off_count": sum(1 for d in np_by_date.values() if d.get("status") == "off"),
                "failures": no_pattern_failures,
            }
            result["passed_no_pattern_holiday_fallback"] = not no_pattern_failures

            result["passed"] = all([
                result["passed_pattern_precedence"],
                result["passed_status_regression"],
                result["passed_no_pattern_holiday_fallback"],
            ])
        except Exception as exc:
            result["errors"].append(repr(exc))
        finally:
            if inserted_request_ids:
                await db.requests.delete_many({"id": {"$in": inserted_request_ids}})
            for uid in created_ids:
                try:
                    await client.delete(f"{BASE}/admin/users/{uid}", headers={"X-Employee-Id": ADMIN_ID})
                except Exception as exc:
                    result["errors"].append(f"cleanup delete user {uid}: {exc!r}")
                await db.schedules.delete_many({"employee_id": uid})
                await db.documents.delete_many({"target_employee_id": uid})
                await db.badging.delete_many({"employee_id": uid})
                await db.notifications.delete_many({"employee_id": uid})
                await db.requests.delete_many({"employee_id": uid})
            mongo.close()

    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())