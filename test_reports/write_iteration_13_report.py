import json
report = {
  "verdict": "not_fixed",
  "user_reported_bug": "Améliore l'interface de demande de congés, RTT et autres absences afin qu'elle soit plus intuitive. Actuellement la demande se fait en sélectionnant uniquement une date de début et de fin — l'employé ne visualise pas les jours OFF, congés déjà validés, etc. Proposer un calendrier interactif permettant de sélectionner directement les jours souhaités (OFF, travail, CP validés, RTT validés, en attente, fériés, disponibles) avec couleurs distinctes, sélection multi-jours non-consécutifs, blocage automatique des jours indisponibles.",
  "summary": "No relevant testing skill found. The new RH calendar UI exists and basic multi-day selection/submission works, but the fix is not complete end-to-end: backend POST /api/requests/multi accepts unavailable dates directly (past day, holiday, already pending day), and availability for future months beyond the schedule horizon marks Idriss OFF/work-pattern days as available, so the calendar can allow unavailable days instead of blocking them.",
  "backend_issues": {
    "critical": [
      {
        "endpoint": "POST /api/requests/multi",
        "issue": "No server-side availability validation. Direct API calls successfully created leave requests for an unavailable past date (2026-07-01), the Assomption holiday (2026-08-15), and an already pending date (2026-09-14). This violates automatic blocking of unavailable days and can create duplicate/invalid requests.",
        "priority": "CRITICAL"
      },
      {
        "endpoint": "GET /api/availability?month=2026-09",
        "issue": "Future dates beyond SHIFT_HORIZON_CAP are not materialized from Idriss' schedule pattern, so expected OFF/work days are returned as selectable 'available' (e.g. 2026-09-01, 09-07, 09-08, 09-22, 09-28, 09-29). Users cannot reliably visualize OFF/travail for future request months.",
        "priority": "HIGH"
      }
    ],
    "minor": [
      {
        "endpoint": "GET /api/availability?month=2026-08",
        "issue": "Response shape and Assomption holiday were correct, but the tested environment did not return any 'off' status for August 2026 because existing approved requests covered most of the month; this makes the requested August mix incomplete in current preview data."
      }
    ]
  },
  "frontend_issues": {
    "ui_bugs": [],
    "integration_issues": [
      {
        "flow": "/rh/demandes leave calendar",
        "issue": "Frontend disables days according to backend data and UI behavior passed for visible past/OFF days, but because backend returns future OFF/work-pattern days as available, the UI permits selecting days that should be blocked or labeled OFF/travail.",
        "affected_selectors": ["[data-testid='leave-calendar']", "[data-testid^='day-2026-09-']"]
      }
    ],
    "design_issues": []
  },
  "test_report_links": [
    "/app/test_reports/bug_verification_13_api.py",
    "/app/test_reports/bug_verification_13_api_results.json",
    "/app/test_reports/bug_verification_13_edge_api.py",
    "/app/test_reports/bug_verification_13_edge_api_results.json",
    "/app/test_reports/bug_verification_13_future_off_check.py",
    "/app/test_reports/bug_verification_13_2026-09_availability.json",
    "/app/test_reports/bug_verification_13_2026-10_availability.json",
    "/app/test_reports/bug_verification_13_ui_playwright.py",
    "/app/test_reports/bug_verification_13_ui_results.json"
  ],
  "action_items": [
    "Add server-side validation in POST /api/requests/multi using the same availability rules as GET /api/availability; reject any past, holiday, off, approved, pending, duplicate, or otherwise non-selectable date before inserting ranges.",
    "Fix availability generation for future months used by the calendar: materialize or compute Idriss' schedule pattern beyond the current cap so OFF and worked days are shown correctly instead of all 'available'.",
    "Retest August/September/October calendars after cleaning QA-created invalid requests from this run or using isolated seed data."
  ],
  "critical_code_review_comments": [
    "backend/server.py create_multi_day_request (lines ~1706-1743) sorts/splits dates and inserts requests without checking date validity, holiday/off/past status, existing pending/approved requests, or schedule availability.",
    "backend/server.py _ensure_range only auto-generates schedules through SHIFT_HORIZON_CAP = 2026-08-01, causing /availability for later months to miss schedule-derived OFF/work statuses."
  ],
  "updated_files": [
    "/app/test_reports/bug_verification_13_api.py",
    "/app/test_reports/bug_verification_13_api_results.json",
    "/app/test_reports/bug_verification_13_inspect_requests.py",
    "/app/test_reports/bug_verification_13_edge_api.py",
    "/app/test_reports/bug_verification_13_edge_api_results.json",
    "/app/test_reports/bug_verification_13_future_off_check.py",
    "/app/test_reports/bug_verification_13_2026-09_availability.json",
    "/app/test_reports/bug_verification_13_2026-10_availability.json",
    "/app/test_reports/bug_verification_13_ui_playwright.py",
    "/app/test_reports/bug_verification_13_ui_results.json",
    "/app/test_reports/write_iteration_13_report.py",
    "/app/test_reports/bug_verification_13.json",
    "/app/test_reports/iteration_13.json"
  ],
  "success_rate": {"backend": "55%", "frontend": "80%"},
  "seed_data_creation": "Tester created QA requests in preview via API/UI: valid multi-range conge for 2026-09-14/15 and 2026-09-18, Acompte 2026-09-21, calendar conge for 2026-10-01/03/05, plus invalid edge requests deliberately allowed by the bug for 2026-07-01, 2026-08-15, and duplicate 2026-09-14. Auth is MOCKED via X-Employee-Id/localStorage.",
  "retest_needed": True,
  "should_main_agent_self_test": True,
  "context_for_next_testing_agent": "UI positives: Idriss login, /rh/demandes modal portal, default Congé payé, LeaveCalendar structure/legend/data-status, disabled visible past days, non-consecutive selection/deselection, Acompte fallback inputs/submission, calendar submission/list refresh, and Matériel/Échange/Maladie fallback inputs all passed. Remaining blockers are backend validation and future availability correctness.",
  "rca_of_the_issue": "The calendar component trusts GET /availability for selectable states, but POST /requests/multi does not enforce those same states server-side. Also _ensure_range intentionally stops at 2026-08-01, while the request flow navigates to future months such as September/October 2026, producing 'available' placeholders rather than Idriss' real OFF/work pattern."
}
for path in ["/app/test_reports/bug_verification_13.json", "/app/test_reports/iteration_13.json"]:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
print(json.dumps(report, ensure_ascii=False, indent=2))
