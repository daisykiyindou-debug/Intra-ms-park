import json
from collections import Counter
import requests

BASE = "http://localhost:8001/api"
HEADERS = {"X-Employee-Id": "emp-idriss-malonga", "Content-Type": "application/json"}
results = {"checks": [], "details": {}}

def check(name, ok, detail=None):
    results["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS" if ok else "FAIL"), name, detail or "")

# GET /availability month shape/statuses
r = requests.get(f"{BASE}/availability", params={"month": "2026-08"}, headers=HEADERS, timeout=20)
check("GET /availability 2026-08 returns 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
avail = r.json() if r.ok else {}
days = avail.get("days", [])
results["details"]["availability_2026_08"] = {
    "month": avail.get("month"),
    "day_count": len(days),
    "status_counts": Counter(d.get("status") for d in days),
    "sample_days": days[:5] + days[13:16] + days[-3:] if days else []
}
check("availability includes month=2026-08", avail.get("month") == "2026-08", avail.get("month"))
check("availability day count valid", 28 <= len(days) <= 31, len(days))
required_keys = {"date", "status", "label", "selectable", "weekday"}
valid_statuses = {"available", "worked", "off", "cp_approved", "rtt_approved", "pending", "holiday", "past"}
check("each day has required keys", all(required_keys <= set(d) for d in days), [d for d in days if not required_keys <= set(d)][:2])
check("each day has valid status", all(d.get("status") in valid_statuses for d in days), Counter(d.get("status") for d in days))
by_date = {d.get("date"): d for d in days}
aug15 = by_date.get("2026-08-15")
check("Assomption 2026-08-15 marked holiday and disabled", bool(aug15 and aug15.get("status") == "holiday" and aug15.get("selectable") is False), aug15)
counts = Counter(d.get("status") for d in days)
check("August has worked days", counts.get("worked", 0) > 0, counts)
check("August has OFF days", counts.get("off", 0) > 0, counts)

# POST /requests/multi contiguous split + persistence
payload = {"type": "conge", "dates": ["2026-09-14", "2026-09-15", "2026-09-18"], "comment": "QA verification multi-range 13"}
r = requests.post(f"{BASE}/requests/multi", headers=HEADERS, json=payload, timeout=20)
check("POST /requests/multi returns 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
created = r.json() if r.ok else {}
results["details"]["multi_response"] = created
expected_ranges = [{"start": "2026-09-14", "end": "2026-09-15"}, {"start": "2026-09-18", "end": "2026-09-18"}]
check("multi created=2", created.get("created") == 2, created)
check("multi ranges split contiguous/non-contiguous correctly", created.get("ranges") == expected_ranges, created.get("ranges"))

r = requests.get(f"{BASE}/requests", headers=HEADERS, timeout=20)
check("GET /requests returns 200", r.status_code == 200, f"status={r.status_code}")
reqs = r.json() if r.ok else []
matching = [x for x in reqs if x.get("type") == "conge" and x.get("comment") == "QA verification multi-range 13" and x.get("start_date") in {"2026-09-14", "2026-09-18"}]
results["details"]["matching_requests"] = matching
check("GET /requests contains two new pending ranges", len(matching) == 2 and all(x.get("status") == "pending" for x in matching), matching)

results["overall_ok"] = all(c["ok"] for c in results["checks"])
with open("/app/test_reports/bug_verification_13_api_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2, default=lambda o: dict(o) if isinstance(o, Counter) else str(o))
print(json.dumps(results, ensure_ascii=False, indent=2, default=lambda o: dict(o) if isinstance(o, Counter) else str(o)))
