import json
import requests

BASE = "http://localhost:8001/api"
HEADERS = {"X-Employee-Id": "emp-idriss-malonga", "Content-Type": "application/json"}

results = {"checks": [], "details": {}}


def check(name, ok, detail=None):
    results["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS" if ok else "FAIL"), name, detail or "")


r = requests.get(f"{BASE}/availability", params={"month": "2026-09"}, headers=HEADERS, timeout=20)
days = {d["date"]: d for d in (r.json().get("days", []) if r.ok else [])}
results["details"]["2026-09-06"] = days.get("2026-09-06")
results["details"]["2026-09-07"] = days.get("2026-09-07")
check("Sunday 2026-09-06 currently exposed as worked/selectable", days.get("2026-09-06", {}).get("status") == "worked", days.get("2026-09-06"))
check("Monday 2026-09-07 currently exposed as off/not selectable", days.get("2026-09-07", {}).get("status") == "off", days.get("2026-09-07"))

r = requests.post(
    f"{BASE}/requests/multi",
    headers=HEADERS,
    json={"type": "conge", "dates": ["2026-09-07"], "comment": "QA14 monday off probe"},
    timeout=20,
)
try:
    body = r.json()
except Exception:
    body = r.text
check("POST rejects currently-patterned OFF Monday 2026-09-07", r.status_code == 400 and "jour OFF" in json.dumps(body, ensure_ascii=False), {"status": r.status_code, "body": body})

results["overall_ok"] = all(c["ok"] for c in results["checks"])
with open("/app/test_reports/bug_verification_14_pattern_probe_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(json.dumps(results, ensure_ascii=False, indent=2))