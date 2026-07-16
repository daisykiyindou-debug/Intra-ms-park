"""
Focused Playwright checks for the Agenda EventEditor modal layout bug.

This script is intended to be run by the browser automation harness inside an
async Playwright context with an existing `page` object.
"""

BASE_URL = "https://mspark-employee-hub.preview.emergentagent.com"

results = []


def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    msg = f"{status}: {name} - {detail}"
    print(msg)
    results.append({"name": name, "passed": passed, "detail": detail})


async def box_for(locator):
    await locator.wait_for(state="visible", timeout=15000)
    return await locator.bounding_box()


async def assert_fits(name, locator, viewport_height=1080):
    box = await box_for(locator)
    top = box["y"]
    bottom = box["y"] + box["height"]
    ok = top >= -0.5 and bottom <= viewport_height + 0.5
    record(name, ok, f"top={top:.1f}, bottom={bottom:.1f}, height={box['height']:.1f}")
    return box


try:
    await page.set_viewport_size({"width": 1920, "height": 1080})

    # Login as admin through the real UI.
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.locator('[data-testid="login-email"]').fill("marcus.simeo@mspark.fr")
    await page.locator('[data-testid="login-password"]').fill("MSPark@Admin2026!")
    await page.locator('[data-testid="login-btn"]').click()
    await page.wait_for_url("**/dashboard", timeout=20000)
    record("admin login", True, page.url)

    # PRIORITY: Agenda create modal must be fully visible and the title field editable.
    await page.goto(f"{BASE_URL}/management/agenda", wait_until="domcontentloaded")
    await page.locator('[data-testid="agenda-create"]').wait_for(state="visible", timeout=20000)
    await page.locator('[data-testid="agenda-create"]').click()
    editor = page.locator('[data-testid="event-editor"]')
    event_box = await assert_fits("agenda create EventEditor fits viewport", editor)

    title_input = page.locator('[data-testid="event-title"]')
    title_box = await box_for(title_input)
    category_box = await box_for(editor.get_by_text("Catégorie", exact=True).first())
    record(
        "event title visible above category",
        title_box["y"] >= 0 and title_box["y"] < category_box["y"],
        f"title_top={title_box['y']:.1f}, category_top={category_box['y']:.1f}",
    )
    record("new event header visible", await editor.get_by_text("Nouvel événement", exact=True).is_visible() and await editor.get_by_text("Créer un événement", exact=True).is_visible())
    close_button = editor.locator('xpath=.//div[contains(@class,"justify-between")][1]//button').first()
    close_box = await box_for(close_button)
    record("event close button visible", close_box["y"] >= 0, f"top={close_box['y']:.1f}")

    created_title = "QA Modal Layout Test 2026"
    edited_title = "QA Modal Layout Test 2026 Edited"
    await title_input.fill(created_title)
    record("event title field editable", await title_input.input_value() == created_title, await title_input.input_value())
    await page.locator('[data-testid="event-save"]').click()
    await editor.wait_for(state="detached", timeout=20000)
    await page.get_by_text(created_title, exact=True).wait_for(state="visible", timeout=20000)
    record("event created and visible", True, created_title)

    # Regression: edit existing event must show the same correctly positioned modal and title can change.
    row = page.locator('[data-testid^="event-row-"]').filter(has_text=created_title).first()
    await row.locator('[data-testid^="event-edit-"]').click()
    editor = page.locator('[data-testid="event-editor"]')
    await assert_fits("agenda edit EventEditor fits viewport", editor)
    edit_title = page.locator('[data-testid="event-title"]')
    edit_title_box = await box_for(edit_title)
    record("edit event title visible", edit_title_box["y"] >= 0, f"title_top={edit_title_box['y']:.1f}")
    await edit_title.fill(edited_title)
    record("existing event title editable", await edit_title.input_value() == edited_title, await edit_title.input_value())
    await page.locator('[data-testid="event-save"]').click()
    await editor.wait_for(state="detached", timeout=20000)
    await page.get_by_text(edited_title, exact=True).wait_for(state="visible", timeout=20000)
    record("event update persisted visibly", True, edited_title)

    # Cleanup test event through the UI.
    async def accept_dialog(dialog):
        await dialog.accept()
    page.on("dialog", accept_dialog)
    cleanup_row = page.locator('[data-testid^="event-row-"]').filter(has_text=edited_title).first()
    await cleanup_row.locator('[data-testid^="event-delete-"]').click()
    try:
        await page.get_by_text(edited_title, exact=True).wait_for(state="detached", timeout=10000)
        record("cleanup event deleted", True, edited_title)
    except Exception as cleanup_err:
        record("cleanup event deleted", False, str(cleanup_err))

    # Regression smoke checks for other portalized modals in Management.
    await page.goto(f"{BASE_URL}/management/planning", wait_until="domcontentloaded")
    await page.locator('[data-testid="week-editor-open"]').wait_for(state="visible", timeout=20000)
    # Prefer editing an existing row to avoid the week cards re-rendering while
    # empty-day add buttons are being hydrated.
    if await page.locator('[data-testid="edit-entry"]').count() > 0:
        await page.locator('[data-testid="edit-entry"]').first.click(force=True)
    else:
        await page.locator('[data-testid^="add-day-"]').first.click(force=True)
    await assert_fits("planning EntryEditor fits viewport", page.locator('[data-testid="entry-editor"]'))
    await page.locator('[data-testid="entry-editor"]').locator('xpath=.//button').first.click()

    await page.locator('[data-testid="week-editor-open"]').click(force=True)
    await assert_fits("planning WeekEditor fits viewport", page.locator('[data-testid="week-editor"]'))
    await page.locator('[data-testid="week-editor"]').locator('xpath=.//button').first.click()

    await page.goto(f"{BASE_URL}/management/carrousel", wait_until="domcontentloaded")
    await page.locator('[data-testid^="edit-slide-"]').first.wait_for(state="visible", timeout=20000)
    await page.locator('[data-testid^="edit-slide-"]').first.click()
    await assert_fits("carousel SlideEditor fits viewport", page.locator('[data-testid="slide-editor"]'))
    await page.locator('[data-testid="slide-editor"]').locator('xpath=.//button').first.click()

    # Requests info modal if pending requests exist.
    await page.goto(f"{BASE_URL}/management/demandes", wait_until="domcontentloaded")
    await page.wait_for_timeout(1000)
    info_buttons = page.locator('[data-testid^="info-"]')
    if await info_buttons.count() > 0:
        await info_buttons.first.click()
        info_card = page.locator('[data-testid="info-note"]').locator('xpath=ancestor::div[contains(@class,"ms-card")][1]')
        await assert_fits("requests info modal fits viewport", info_card)
        await info_card.locator('xpath=.//button').first.click()
    else:
        record("requests info modal fits viewport", True, "skipped: no pending request with Info action")

    # PostEditor regression on /actualites if editable posts exist.
    await page.goto(f"{BASE_URL}/actualites", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    edit_posts = page.locator('[data-testid^="edit-post-"]')
    if await edit_posts.count() > 0:
        await edit_posts.first.click()
        await assert_fits("Actualites PostEditor fits viewport", page.locator('[data-testid="post-editor"]'))
    else:
        record("Actualites PostEditor fits viewport", True, "skipped: no editable post visible")

    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

    failures = [r for r in results if not r["passed"]]
    if failures:
        raise AssertionError(f"Failures: {failures}")
    print("ALL_FOCUSED_MODAL_LAYOUT_CHECKS_PASSED")
except Exception as e:
    print(f"TEST_FAILED: {e}")
    raise