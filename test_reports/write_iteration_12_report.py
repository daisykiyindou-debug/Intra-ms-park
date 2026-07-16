import json
from pathlib import Path
report = {
  "verdict": "fixed",
  "user_reported_bug": "dans restauration rajoute cote de boeuf, et crevettes sautées (avec les images jointes). et mets les points employés (Idriss MALONGA) a 25 points",
  "summary": "No relevant testing skill found. Focused verification covered the Restaurant/Soccer Bar menu additions and Idriss MALONGA's personalized meal-points quota via API and UI. API returned 17 Soccer Bar items including Côte de boeuf and Crevettes sautées with the expected categories, points, and non-empty image URLs. Idriss API/UI showed 25 daily quota/credited/remaining points, and Marcus retained 35 points.",
  "backend_issues": {
    "critical": [],
    "minor": []
  },
  "frontend_issues": {
    "ui_bugs": [
      {
        "component": "PointsRepas quota descriptor chip",
        "issue": "Minor copy inconsistency: the main balance and stats correctly show 25 pts for Idriss, but the role descriptor chip still says 'EMPLOYÉ · 20 PTS/JOUR' because it reflects role default rather than the personal override.",
        "selector": "PointsRepas .ms-chip near Solde du jour",
        "priority": "LOW"
      }
    ],
    "integration_issues": [],
    "design_issues": []
  },
  "test_report_links": [
    "/app/test_reports/bug_verification_12_api.py",
    "/app/test_reports/bug_verification_12_api_results.json",
    "/app/test_reports/bug_verification_12_ui_playwright.py"
  ],
  "action_items": [
    "Optional: update the role quota label on /points-repas to avoid showing 'Employé · 20 pts/jour' for Idriss when daily_quota is personalized to 25. This did not block the requested quota/balance behavior."
  ],
  "critical_code_review_comments": [],
  "updated_files": [
    "/app/test_reports/bug_verification_12_api.py",
    "/app/test_reports/bug_verification_12_api_results.json",
    "/app/test_reports/bug_verification_12_ui_playwright.py",
    "/app/test_reports/write_iteration_12_report.py",
    "/app/test_reports/bug_verification_12.json",
    "/app/test_reports/iteration_12.json"
  ],
  "success_rate": {"backend": "100%", "frontend": "100%"},
  "seed_data_creation": "No seed data created by tester. Used existing preview seed/auth mock with X-Employee-Id; DB is in-memory/reseeded by app startup.",
  "retest_needed": False,
  "should_main_agent_self_test": False,
  "context_for_next_testing_agent": "Backend script passed all checks. UI automation confirmed Idriss login, /restaurant balance 25/25, Soccer Bar Viandes/Poissons filters, Côte de boeuf 22 pts with cotedeboeufcuire image, Crevettes sautées 16 pts with crevettes-sautees image, and /points-repas main quota/remaining stats 25 pts. There is a minor UI copy inconsistency: role descriptor still says Employé · 20 pts/jour.",
  "rca_of_the_issue": "Fix appears to add two Soccer Bar products in _seed_extra_products and set Idriss daily_quota=25; endpoints /api/me and /api/meal-points/today now use emp.daily_quota override before ROLE_QUOTAS fallback. Auth is MOCKED via X-Employee-Id as noted in the request."
}
for name in ["bug_verification_12.json", "iteration_12.json"]:
    p = Path("/app/test_reports") / name
    p.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
