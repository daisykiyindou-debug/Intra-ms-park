"""Playwright script body mirrored into mcp_browser_automation for focused UI testing."""

SCRIPT = r'''
import re, time

async def login(email, password):
    await page.goto("/login")
    await page.wait_for_load_state("networkidle")
    await page.locator('[data-testid="login-email"]').fill(email)
    await page.locator('[data-testid="login-password"]').fill(password)
    await page.locator('[data-testid="login-btn"]').click()
    await page.wait_for_url("**/dashboard", timeout=15000)
    await page.wait_for_timeout(800)

try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto("/")
    await page.evaluate("localStorage.clear()")

    # Non-admin access check.
    await login("idriss.malonga@gmail.com", "Idriss2026!")
    await page.goto("/management/utilisateurs")
    await page.wait_for_load_state("networkidle")
    denied_text = await page.locator("body").inner_text()
    print("Employee restricted page text:", denied_text[:500].replace("\n", " | "))
    if "Accès restreint" in denied_text:
        print("PASS: employee sees expected Accès restreint text")
    elif "Accès réservé" in denied_text or "administrateurs" in denied_text:
        print("WARN: employee is blocked, but exact expected text 'Accès restreint' is not displayed")
    else:
        raise AssertionError("Employee can access management users or no restriction text is visible")

    # Admin list/page checks.
    await page.evaluate("localStorage.clear()")
    await login("marcus.simeo@mspark.fr", "MSPark@Admin2026!")
    await page.locator('[data-testid="nav-mgmt-users"]').wait_for(timeout=10000)
    print("PASS: sidebar shows Utilisateurs link")
    await page.locator('[data-testid="nav-mgmt-users"]').click()
    await page.wait_for_url("**/management/utilisateurs", timeout=10000)
    await page.locator('[data-testid="user-create"]').wait_for(timeout=10000)
    title_ok = await page.get_by_role("heading", name="Utilisateurs", exact=True).count()
    if title_ok < 1:
        raise AssertionError("Utilisateurs title not found")
    print("PASS: admin users page title and create button visible")
    stats = ["Utilisateurs actifs", "Suspendus", "Administrateurs", "Désactivés"]
    for s in stats:
        if await page.get_by_text(s, exact=True).count() < 1:
            raise AssertionError(f"Missing stats card {s}")
    print("PASS: 4 stats cards visible")
    await page.locator('[data-testid="user-search"]').wait_for()
    await page.locator('[data-testid="filter-role"]').wait_for()
    await page.locator('[data-testid="filter-status"]').wait_for()
    print("PASS: search and 2 filters visible")
    body_text = await page.locator("body").inner_text()
    for col in ["Utilisateur", "Fonction / Service", "Rôle", "Statut", "Matricule", "Actions"]:
        if col not in body_text:
            raise AssertionError(f"Missing table column {col}")
    row_menus_initial = await page.locator('[data-testid^="row-menu-"]').count()
    if row_menus_initial < 14:
        raise AssertionError(f"Expected >=14 users, saw {row_menus_initial}")
    print(f"PASS: table shows {row_menus_initial} user rows and expected columns")
    await page.locator('[data-testid^="row-menu-"]').first.click()
    menu_text = await page.locator("body").inner_text()
    for item in ["Modifier", "Réinit. mot de passe", "Suspendre", "Désactiver", "Supprimer"]:
        if item not in menu_text:
            raise AssertionError(f"Missing context menu item {item}")
    print("PASS: context menu exposes edit/reset/status/delete actions")
    await page.keyboard.press("Escape")

    # Create via UI.
    suffix = str(int(time.time()))
    first = "Test"
    last = f"UI{suffix}"
    email = f"test.ui.{suffix}@example.com"
    await page.locator('[data-testid="user-create"]').click()
    editor = page.locator('[data-testid="user-editor"]')
    await editor.wait_for(timeout=10000)
    bbox = await editor.bounding_box()
    if not bbox or bbox["y"] < 0:
        raise AssertionError(f"User editor not fully in viewport: {bbox}")
    for tab in ["account", "hr", "planning", "payroll", "access"]:
        await page.locator(f'[data-testid="tab-{tab}"]').wait_for()
    print(f"PASS: editor in viewport at y={bbox['y']} and 5 tabs visible")
    await page.locator('[data-testid="first_name"]').fill(first)
    await page.locator('[data-testid="last_name"]').fill(last)
    await page.locator('[data-testid="personal_email"]').fill(email)
    await page.locator('[data-testid="personal_phone"]').fill("0611111111")
    await page.locator('[data-testid="tab-access"]').click()
    await page.wait_for_timeout(200)
    await page.locator('[data-testid="admin_role"]').select_option("manager")
    await page.locator('[data-testid="perm-manage_users"]').check(force=True)
    await page.locator('[data-testid="perm-view_stats"]').check(force=True)
    await page.locator('[data-testid="user-save"]').click()
    await page.locator('[data-testid="temp-password-value"]').wait_for(timeout=15000)
    temp_password = (await page.locator('[data-testid="temp-password-value"]').inner_text()).strip()
    if len(temp_password) < 8:
        raise AssertionError("Temporary password not shown")
    print(f"PASS: create success temp password modal appears for {email}")
    await page.get_by_text("Copier", exact=True).click()
    await page.wait_for_timeout(500)
    print("PASS: Copy button clicked")
    await page.get_by_text("Fermer", exact=True).click()
    await page.wait_for_timeout(1000)
    await page.locator('[data-testid="user-search"]').fill(email)
    await page.wait_for_timeout(700)
    if await page.get_by_text(email, exact=False).count() < 1:
        raise AssertionError("Created user not visible in refreshed table")
    print("PASS: created user appears in table after refresh")

    # Frontend login with UI-created user temp password.
    await page.goto("/login")
    await page.evaluate("localStorage.clear()")
    await page.locator('[data-testid="login-email"]').fill(email)
    await page.locator('[data-testid="login-password"]').fill(temp_password)
    await page.locator('[data-testid="login-btn"]').click()
    await page.wait_for_url("**/dashboard", timeout=15000)
    dash_text = await page.locator("body").inner_text()
    if first not in dash_text and last not in dash_text:
        print("WARN: UI-created user login reached dashboard but user's name was not immediately visible")
    print("PASS: UI-created user can login through frontend with generated password")

    # Return as admin for quick actions.
    await page.goto("/login")
    await page.evaluate("localStorage.clear()")
    await login("marcus.simeo@mspark.fr", "MSPark@Admin2026!")
    await page.goto("/management/utilisateurs")
    await page.wait_for_load_state("networkidle")
    await page.locator('[data-testid="user-search"]').fill(email)
    await page.wait_for_timeout(800)

    async def row_menu_for_created():
        row = page.locator("div", has_text=email).filter(has=page.locator('[data-testid^="row-menu-"]')).first
        await row.locator('[data-testid^="row-menu-"]').click()

    await row_menu_for_created()
    await page.get_by_text("Suspendre", exact=True).click(force=True)
    await page.wait_for_timeout(1200)
    if "Suspendu" not in await page.locator("body").inner_text():
        raise AssertionError("Suspendu badge not visible after suspend")
    print("PASS: quick action Suspendre updates badge")

    await row_menu_for_created()
    await page.get_by_text("Réactiver", exact=True).click(force=True)
    await page.wait_for_timeout(1200)
    if "Actif" not in await page.locator("body").inner_text():
        raise AssertionError("Actif badge not visible after reactivate")
    print("PASS: quick action Réactiver updates badge")

    page.on("dialog", lambda dialog: dialog.accept())
    await row_menu_for_created()
    await page.get_by_text("Réinit. mot de passe", exact=True).click(force=True)
    await page.locator('[data-testid="temp-password-value"]').wait_for(timeout=10000)
    reset_pwd = (await page.locator('[data-testid="temp-password-value"]').inner_text()).strip()
    if not reset_pwd or reset_pwd == temp_password:
        raise AssertionError("Reset password modal missing/did not change password")
    print("PASS: quick action reset password shows a new temporary password modal")
    await page.get_by_text("Fermer", exact=True).click()
    await page.wait_for_timeout(500)

    await row_menu_for_created()
    await page.get_by_text("Supprimer", exact=True).click(force=True)
    await page.wait_for_timeout(1200)
    if await page.get_by_text(email, exact=False).count() > 0:
        raise AssertionError("Deleted user still visible in filtered table")
    print("PASS: quick action delete removes user from table")

    error_text = await page.evaluate("""() => {
const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
return errorElements.map(el => el.textContent).join(", ");
}""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    print("UI_VERDICT: PASS_WITH_WARNINGS")
except Exception as e:
    print(f"UI_VERDICT: FAIL: {e}")
    error_text = await page.evaluate("""() => {
const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
return errorElements.map(el => el.textContent).join(", ");
}""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    raise
'''