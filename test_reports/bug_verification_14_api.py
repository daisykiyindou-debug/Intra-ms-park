import json
import os
import uuid
from collections import Counter
from datetime import date, timedelta

import requests


BASE = os.environ.get("MSPARK_API_BASE", "http://localhost:8001/api")
HEADERS = {"X-Employee-Id": "emp-idriss-malonga", "Content-Type": "application/json"}

run_id = uuid.uuid4().hex[:8]
results = {
    "base": BASE,
    "run_id": run_id,
    "checks": [],
    "details": {},
}


def check(name, ok, detail=None):
    row = {"name": name, "ok": bool(ok), "detail": detail}
    results["checks"].append(row)
    print(("PASS" if ok else "FAIL"), name, detail if detail is not None else "")
    return bool(ok)


def post_multi(dates, comment, req_type="conge"):
    return requests.post(
        f"{BASE}/requests/multi",
        headers=HEADERS,
        json={"type": req_type, "dates": dates, "comment": comment},
        timeout=20,
    )


def invalid_dates(resp):
    try:
        detail = resp.json().get("detail")
    except Exception:
        return []
    if isinstance(detail, dict):
        return detail.get("invalid_dates") or []
    return []


def reqs_with_comment(comment):
    r = requests.get(f"{BASE}/requests", headers=HEADERS, timeout=20)
    if not r.ok:
        return []
    return [x for x in r.json() if x.get("comment") == comment]


# Availability for future months beyond SHIFT_HORIZON_CAP.
all_days = []
availability_by_month = {}
for month in ["2026-09", "2026-10", "2026-11"]:
    r = requests.get(f"{BASE}/availability", params={"month": month}, headers=HEADERS, timeout=20)
    check(f"GET /availability {month} returns 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    payload = r.json() if r.ok else {"days": []}
    days = payload.get("days", [])
    all_days.extend(days)
    counts = Counter(d.get("status") for d in days)
    availability_by_month[month] = {
        "month": payload.get("month"),
        "day_count": len(days),
        "status_counts": dict(counts),
        "weekend_samples": [d for d in days if d.get("weekday") in (5, 6)][:6],
    }
    check(f"{month} has no past days", counts.get("past", 0) == 0, dict(counts))
    check(f"{month} has realistic worked days", counts.get("worked", 0) >= 15, dict(counts))
    check(f"{month} has realistic OFF/weekend days", counts.get("off", 0) >= 6, dict(counts))

by_date = {d.get("date"): d for d in all_days}
sept_6 = by_date.get("2026-09-06")
check("2026-09-06 Sunday is status=off and not selectable", bool(sept_6 and sept_6.get("status") == "off" and sept_6.get("selectable") is False), sept_6)
results["details"]["availability"] = availability_by_month


# Pick currently selectable worked days dynamically, so the test is not coupled to old QA data.
available_dates = sorted(
    d["date"] for d in all_days
    if d.get("status") == "worked" and d.get("selectable") is True and d.get("date") >= "2026-09-01"
)
used = set()


def take_available(exclude=None):
    exclude = exclude or set()
    for iso in available_dates:
        if iso not in used and iso not in exclude:
            used.add(iso)
            return iso
    raise RuntimeError("No available worked date left for test")


def find_contiguous_group():
    available_set = set(available_dates)
    for iso in available_dates:
        d = date.fromisoformat(iso)
        iso2 = (d + timedelta(days=1)).isoformat()
        if iso2 not in available_set:
            continue
        for third in available_dates:
            td = date.fromisoformat(third)
            if third in (iso, iso2):
                continue
            if abs((td - d).days) > 2 and abs((td - (d + timedelta(days=1))).days) > 1:
                used.update({iso, iso2, third})
                return [iso, iso2, third]
    raise RuntimeError("No suitable contiguous/non-contiguous worked-date group found")


try:
    atomic_valid = take_available()
    group_dates = find_contiguous_group()
except Exception as exc:
    atomic_valid = None
    group_dates = []
    check("test data has selectable future worked dates", False, str(exc))

results["details"]["selected_test_dates"] = {"atomic_valid": atomic_valid, "group_dates": group_dates}


# Backend #1 validation: past, holiday, off, mixed valid+invalid atomicity.
past_resp = post_multi(["2025-01-01"], f"QA14 past {run_id}")
past_invalid = invalid_dates(past_resp)
check("past date rejected with 400", past_resp.status_code == 400, f"status={past_resp.status_code} body={past_resp.text[:500]}")
check("past rejection includes 'jour passé'", any("jour passé" in x for x in past_invalid), past_invalid)

holiday_resp = post_multi(["2026-08-15"], f"QA14 holiday {run_id}")
holiday_invalid = invalid_dates(holiday_resp)
check("Assomption 2026-08-15 rejected with 400", holiday_resp.status_code == 400, f"status={holiday_resp.status_code} body={holiday_resp.text[:500]}")
check("holiday rejection includes 'jour férié (Assomption)'", any("jour férié (Assomption)" in x for x in holiday_invalid), holiday_invalid)

off_resp = post_multi(["2026-09-06"], f"QA14 off {run_id}")
off_invalid = invalid_dates(off_resp)
check("Idriss OFF Sunday 2026-09-06 rejected with 400", off_resp.status_code == 400, f"status={off_resp.status_code} body={off_resp.text[:500]}")
check("OFF rejection includes 'jour OFF'", any("jour OFF" in x for x in off_invalid), off_invalid)

if atomic_valid:
    atomic_comment = f"QA14 atomic {run_id}"
    before_atomic = len(reqs_with_comment(atomic_comment))
    atomic_resp = post_multi([atomic_valid, "2026-09-06"], atomic_comment)
    atomic_invalid = invalid_dates(atomic_resp)
    after_atomic = len(reqs_with_comment(atomic_comment))
    check("mixed valid+invalid request rejected with 400", atomic_resp.status_code == 400, f"status={atomic_resp.status_code} body={atomic_resp.text[:500]}")
    check("mixed rejection reports invalid OFF date", any("2026-09-06" in x and "jour OFF" in x for x in atomic_invalid), atomic_invalid)
    check("mixed valid+invalid request is atomic (no insertion)", before_atomic == 0 and after_atomic == 0, {"before": before_atomic, "after": after_atomic, "comment": atomic_comment})


# Regression: valid multi-day request still creates contiguous ranges; retrying same date is blocked.
if group_dates:
    valid_comment = f"QA14 valid multi {run_id}"
    valid_resp = post_multi(group_dates, valid_comment, req_type="rtt")
    valid_body = valid_resp.json() if valid_resp.ok else {}
    check("valid selectable worked dates still submit successfully", valid_resp.status_code == 200, f"status={valid_resp.status_code} body={valid_resp.text[:500]}")
    check("valid multi request creates two ranges for contiguous + non-contiguous days", valid_body.get("created") == 2 and len(valid_body.get("ranges", [])) == 2, valid_body)
    matching = reqs_with_comment(valid_comment)
    check("valid multi request persisted two pending request rows", len(matching) == 2 and all(x.get("status") == "pending" for x in matching), matching)

    duplicate_resp = post_multi([group_dates[0]], f"QA14 duplicate {run_id}")
    duplicate_invalid = invalid_dates(duplicate_resp)
    check("already-pending date rejected on retry with 400", duplicate_resp.status_code == 400, f"status={duplicate_resp.status_code} body={duplicate_resp.text[:500]}")
    check("duplicate rejection includes 'déjà en congé ou en attente'", any("déjà en congé ou en attente" in x for x in duplicate_invalid), duplicate_invalid)

results["overall_ok"] = all(c["ok"] for c in results["checks"])

with open("/app/test_reports/bug_verification_14_api_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(json.dumps(results, ensure_ascii=False, indent=2))