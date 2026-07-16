"""
Playwright script body used by mcp_browser_automation to verify that the
visible submit button still completes the user request flow.
"""

await page.set_viewport_size({"width": 1920, "height": 1080})
try:
    marker = "QA UI submit modal 1784206200"
    print("Login and open Demandes")
    await page.goto("https://mspark-employee-hub.preview.emergentagent.com/login", wait_until="networkidle")
    await page.locator('[data-testid="login-email"]').fill("lea.dubois@mspark.fr")
    await page.locator('[data-testid="login-password"]').fill("MSPark@Comm2026!")
    await page.locator('[data-testid="login-btn"]').click()
    await page.wait_for_url("**/dashboard", timeout=15000)
    await page.goto("https://mspark-employee-hub.preview.emergentagent.com/rh/demandes", wait_until="networkidle")

    print("Create a Matériel request through the modal submit button")
    await page.locator('[data-testid="new-request"]').click()
    await page.locator('[data-testid="request-form"]').wait_for(state="visible", timeout=10000)
    await page.locator('[data-testid="type-materiel"]').click()
    await page.locator('[data-testid="start-date"]').fill("2026-08-04")
    await page.locator('[data-testid="end-date"]').fill("2026-08-04")
    await page.locator('[data-testid="comment"]').fill(marker)
    submit = page.locator('[data-testid="submit-request"]')
    await submit.scroll_into_view_if_needed()
    assert await submit.is_visible(), "Submit button is not visible before click"
    async with page.expect_response(lambda r: "/api/requests" in r.url and r.request.method == "POST", timeout=15000) as resp_info:
        await submit.click()
    resp = await resp_info.value
    assert resp.status == 200, f"POST /api/requests returned {resp.status}"
    await page.locator('[data-testid="request-form"]').wait_for(state="hidden", timeout=10000)
    await page.get_by_text(marker, exact=False).wait_for(state="visible", timeout=10000)
    print("PASS: UI submit created request, modal closed, and request appeared in list")

    error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
except Exception as e:
    print(f"UI SUBMIT TEST FAILED: {e}")
    raise