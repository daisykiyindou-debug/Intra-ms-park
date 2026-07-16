Focused bug verification plan — Modal Nouvelle demande RH

- Exact user bug: the HR “Nouvelle demande” modal was too tall/narrow and the “Envoyer” button could fall outside the vertical viewport.
- Affected flow: login, open `/rh/demandes`, click `Nouvelle demande`, verify the modal is fully visible and the submit button is visible without scrolling; verify the new 2-column arrangement for leave/RTT/absence and alternate layout for Acompte/Matériel.
- Skill lookup: No relevant testing skill found.
- Code inspected: `/app/frontend/src/pages/Demandes.jsx`, `/app/frontend/src/components/LeaveCalendar.jsx`, `/app/backend/server.py`, auth/API plumbing.
- Direct proof needed: DOM bounding boxes at 1920x1080 showing modal top >= 0 and bottom <= viewport height; left settings column left of right calendar; submit button visible in viewport; calendar present; Acompte/Matériel hide calendar and show start/end date inputs; multi-day calendar selection still toggles selected state and summary; `/api/requests/multi` returns 400 with `jour OFF` for Idriss on a Monday.
- Edge cases: types `conge`, `rtt`, `absence`, `acompte`, `materiel`; invalid multi-day request on OFF day.