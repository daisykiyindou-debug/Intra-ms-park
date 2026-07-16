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
sept_6 = days.get("2026-09-06")
results["details"]["2026-09-06_after_cleanup"] = sept_6
check("After cleanup, 2026-09-06 Sunday should be off per requested contract", bool(sept_6 and sept_6.get("status") == "off" and sept_6.get("selectable") is False), sept_6)

# Use GET-only final probe to avoid adding new requests after cleanup.
results["overall_ok"] = all(c["ok"] for c in results["checks"])
with open("/app/test_reports/bug_verification_14_final_probe_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(json.dumps(results, ensure_ascii=False, indent=2))