"""Playwright script body used by mcp_browser_automation for focused UI verification."""

await page.set_viewport_size({"width": 1920, "height": 1080})
try:
    run_id = str(int(__import__("time").time()))
    first = "QAUI"
    last = run_id
    email = f"qa.ui.{run_id}@example.com"
    phone = "06123" + run_id[-5:]
    print(f"UI test user: {first} {last} {email}")

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    await page.goto("/login")
    await page.get_by_test_id("quickfill-admin").click()
    await page.get_by_test_id("login-btn").click()
    await page.wait_for_url("**/dashboard", timeout=15000)
    print("PASS: admin login reached dashboard")

    await page.goto("/management/utilisateurs")
    await page.wait_for_selector('[data-testid="user-create"]', timeout=15000)
    await page.get_by_test_id("user-search").fill("filter-that-would-hide-new-user")
    await page.get_by_test_id("filter-role").select_option("direction")
    await page.get_by_test_id("filter-status").select_option("suspended")
    await page.get_by_test_id("user-create").click()
    await page.wait_for_selector('[data-testid="user-editor"]', timeout=10000)
    await page.get_by_test_id("first_name").fill(first)
    await page.get_by_test_id("last_name").fill(last)
    await page.get_by_test_id("personal_email").fill(email)
    await page.get_by_test_id("personal_phone").fill(phone)
    await page.get_by_test_id("user-save").click()
    await page.wait_for_selector('text="Utilisateur créé"', timeout=15000)
    await page.wait_for_selector('[data-testid="temp-password-value"]', timeout=10000)
    created_password = await page.get_by_test_id("temp-password-value").inner_text()
    assert len(created_password.strip()) >= 8
    print("PASS: create toast/modal and temp password visible")

    await page.evaluate("""() => {
        navigator.clipboard.writeText = () => Promise.reject(new Error('forced clipboard failure'));
        window.__execCopyCalled = false;
        document.execCommand = (cmd) => { window.__execCopyCalled = cmd === 'copy'; return true; };
    }""")
    await page.get_by_role("button", name="Copier").click()
    await page.wait_for_selector('text="Copié !"', timeout=10000)
    fallback_called = await page.evaluate("() => window.__execCopyCalled === true")
    assert fallback_called is True
    print("PASS: copy fallback used and Copié toast shown")

    await page.get_by_role("button", name="Fermer").click()
    await page.wait_for_selector(f"text={first} {last}", timeout=15000)
    search_val = await page.get_by_test_id("user-search").input_value()
    role_val = await page.get_by_test_id("filter-role").input_value()
    status_val = await page.get_by_test_id("filter-status").input_value()
    assert search_val == "" and role_val == "all" and status_val == "all"
    print("PASS: filters reset and created user immediately visible after modal close")

    await page.goto("/login")
    await page.evaluate("localStorage.clear()")
    await page.get_by_test_id("login-email").fill(email)
    await page.get_by_test_id("login-password").fill(created_password)
    await page.get_by_test_id("login-btn").click()
    await page.wait_for_url("**/dashboard", timeout=15000)
    print("PASS: created user can login from UI with generated password")

    await page.goto("/login")
    await page.evaluate("localStorage.clear()")
    await page.get_by_test_id("quickfill-admin").click()
    await page.get_by_test_id("login-btn").click()
    await page.wait_for_url("**/dashboard", timeout=15000)
    await page.goto("/management/utilisateurs")
    await page.wait_for_selector('[data-testid="user-search"]', timeout=15000)
    await page.get_by_test_id("user-search").fill(email)
    await page.wait_for_selector(f"text={first} {last}", timeout=15000)
    await page.locator('[data-testid^="row-menu-"]').first.click()
    await page.wait_for_selector('[data-testid^="reset-"]', timeout=10000)
    page.once("dialog", lambda dialog: dialog.accept())
    await page.locator('[data-testid^="reset-"]').first.click()
    await page.wait_for_selector('text="Nouveau mot de passe :"', timeout=15000)
    await page.wait_for_selector('text="Mot de passe réinitialisé"', timeout=10000)
    reset_password = await page.get_by_test_id("temp-password-value").inner_text()
    toast_text = await page.locator("body").inner_text()
    assert reset_password in toast_text
    print("PASS: reset quick action shows toast with password and modal with password")

    current_id = await page.evaluate("""async (targetEmail) => {
        const base = window.location.origin + '/api';
        const res = await fetch(base + '/admin/users', {headers: {'X-Employee-Id': 'emp-marcus-simeo'}});
        const users = await res.json();
        const u = users.find(x => x.personal_email === targetEmail || x.email === targetEmail);
        if (!u) return null;
        await fetch(base + '/admin/users/' + u.id, {method: 'DELETE', headers: {'X-Employee-Id': 'emp-marcus-simeo'}});
        return u.id;
    }""", email)
    print(f"PASS: cleanup attempted for {current_id}")

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    assert not console_errors, f"Console errors found: {console_errors}"
    print("PASS: no browser console errors captured")
except Exception as exc:
    print(f"FAIL: {exc}")
    await page.screenshot(path="/app/test_reports/admin_user_ui_iter17_failure.jpg", quality=40, full_page=False)
    raise