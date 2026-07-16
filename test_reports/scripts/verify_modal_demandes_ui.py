"""
Playwright script body used by mcp_browser_automation for the focused
Nouvelle demande RH modal regression check.

It assumes it is executed inside the tool-provided async function with a
Playwright `page` object already available.
"""

await page.set_viewport_size({"width": 1920, "height": 1080})
try:
    print("Step 1: Login as communication user")
    await page.goto("https://mspark-employee-hub.preview.emergentagent.com/login", wait_until="networkidle")
    await page.locator('[data-testid="login-email"]').fill("lea.dubois@mspark.fr")
    await page.locator('[data-testid="login-password"]').fill("MSPark@Comm2026!")
    await page.locator('[data-testid="login-btn"]').click()
    await page.wait_for_url("**/dashboard", timeout=15000)
    print("PASS: logged in and reached dashboard")

    print("Step 2: Open Demandes RH and modal")
    await page.goto("https://mspark-employee-hub.preview.emergentagent.com/rh/demandes", wait_until="networkidle")
    await page.locator('[data-testid="new-request"]').click()
    await page.locator('[data-testid="request-form"]').wait_for(state="visible", timeout=10000)
    await page.locator('[data-testid="leave-calendar"]').wait_for(state="visible", timeout=10000)
    print("PASS: request modal and calendar visible")

    async def collect_layout(type_key):
        if type_key:
            await page.locator(f'[data-testid="type-{type_key}"]').click()
            await page.wait_for_timeout(400)
        return await page.evaluate("""() => {
            const rectOf = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return {
                    top: r.top, bottom: r.bottom, left: r.left, right: r.right,
                    width: r.width, height: r.height,
                    visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight,
                    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
                    overflowY: cs.overflowY
                };
            };
            const form = document.querySelector('[data-testid="request-form"]');
            const grid = form ? form.querySelector('.grid.gap-5') : null;
            const left = document.querySelector('[data-testid="type-conge"]')?.closest('.space-y-4');
            const cal = document.querySelector('[data-testid="leave-calendar"]');
            const submit = document.querySelector('[data-testid="submit-request"]');
            const start = document.querySelector('[data-testid="start-date"]');
            const end = document.querySelector('[data-testid="end-date"]');
            const modal = rectOf('[data-testid="request-form"]');
            const calRect = rectOf('[data-testid="leave-calendar"]');
            const submitRect = rectOf('[data-testid="submit-request"]');
            const leftRect = left ? (() => { const r = left.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; })() : null;
            const gridStyle = grid ? getComputedStyle(grid) : null;
            return {
                viewport: {width: window.innerWidth, height: window.innerHeight},
                modal, calRect, submitRect, leftRect,
                calendarPresent: !!cal,
                calendarScrollableOrInScrollableModal: !!cal && (cal.scrollHeight > cal.clientHeight || form.scrollHeight >= form.clientHeight),
                startPresent: !!start,
                endPresent: !!end,
                gridTemplateColumns: gridStyle ? gridStyle.gridTemplateColumns : null,
                bodyScrollY: window.scrollY,
                modalScrollHeight: form ? form.scrollHeight : null,
                modalClientHeight: form ? form.clientHeight : null
            };
        }""")

    results = {}
    for type_key in ["conge", "rtt", "absence"]:
        layout = await collect_layout(type_key)
        results[type_key] = layout
        vh = layout["viewport"]["height"]
        assert layout["modal"]["top"] >= -1, f"{type_key}: modal top outside viewport: {layout['modal']}"
        assert layout["modal"]["bottom"] <= vh + 1, f"{type_key}: modal bottom outside viewport: {layout['modal']}"
        assert layout["submitRect"]["visible"], f"{type_key}: submit not visible: {layout['submitRect']}"
        assert layout["submitRect"]["bottom"] <= vh + 1, f"{type_key}: submit below viewport: {layout['submitRect']}"
        assert layout["calendarPresent"], f"{type_key}: calendar missing"
        assert layout["leftRect"] and layout["calRect"]["left"] > layout["leftRect"]["right"], f"{type_key}: calendar is not to the right of settings: {layout}"
        assert " " in layout["gridTemplateColumns"], f"{type_key}: grid is not multi-column: {layout['gridTemplateColumns']}"
        print(f"PASS: {type_key} 2-column layout, modal fully visible, submit visible")

    print("Step 3: Acompte and Matériel date-input layout")
    for type_key in ["acompte", "materiel"]:
        layout = await collect_layout(type_key)
        results[type_key] = layout
        assert not layout["calendarPresent"], f"{type_key}: calendar should be hidden: {layout}"
        assert layout["startPresent"] and layout["endPresent"], f"{type_key}: date inputs missing: {layout}"
        assert layout["submitRect"]["visible"] and layout["submitRect"]["bottom"] <= layout["viewport"]["height"] + 1, f"{type_key}: submit not visible: {layout}"
        print(f"PASS: {type_key} hides calendar and shows start/end date inputs")

    print("Step 4: Multi-day selection still works")
    await page.locator('[data-testid="type-conge"]').click()
    await page.wait_for_selector('[data-testid="leave-calendar"]')
    await page.wait_for_timeout(1000)
    selected_dates = await page.evaluate("""async () => {
        const buttons = Array.from(document.querySelectorAll('[data-testid^="day-"]'))
          .filter(btn => !btn.disabled && btn.dataset.status !== 'off' && btn.dataset.status !== 'holiday' && btn.dataset.status !== 'past' && btn.dataset.selected !== 'true')
          .slice(0, 3);
        for (const b of buttons) {
          b.scrollIntoView({block: 'center'});
          b.click();
          await new Promise(r => setTimeout(r, 150));
        }
        return buttons.map(b => b.dataset.testid.replace('day-', ''));
    }""")
    await page.wait_for_timeout(800)
    count_selected = await page.locator('[data-selected="true"]').count()
    summary_present = await page.get_by_text("3 jours sélectionnés", exact=True).count()
    assert len(selected_dates) == 3, f"Expected to click 3 selectable days, clicked {selected_dates}"
    assert count_selected >= 3, f"Expected >=3 selected days, got {count_selected}"
    assert summary_present >= 1, "Summary '3 jours sélectionnés' not visible"
    results["selected_dates"] = selected_dates
    print(f"PASS: selected 3 days {selected_dates}, summary visible")

    print("Step 5: Error selector scan")
    error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

    await page.screenshot(path="/app/test_reports/modal_demandes_1920x1080.jpg", quality=40, full_page=False)
    print("RESULTS", results)
    print("UI BUG VERIFICATION PASSED")
except Exception as e:
    print(f"UI BUG VERIFICATION FAILED: {e}")
    await page.screenshot(path="/app/test_reports/modal_demandes_failure.jpg", quality=40, full_page=False)
    raise