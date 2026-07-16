"""
Focused Playwright verification for bug:
"Can't find variable: absoluteUrl @ NewsManager" when opening /management/carrousel.

Run context: script logic was executed through the browser automation tool against
https://mspark-employee-hub.preview.emergentagent.com with admin credentials.
"""

async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    errors = []
    page.on("console", lambda msg: errors.append(f"console:{msg.type}:{msg.text}") if msg.type in ["error", "warning"] else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror:{exc}"))

    await page.goto("/login", wait_until="domcontentloaded")
    await page.get_by_test_id("quickfill-admin").click()
    await page.get_by_test_id("login-btn").click()
    await page.wait_for_url("**/dashboard", timeout=15000)

    await page.goto("/management/carrousel", wait_until="networkidle")
    await page.get_by_text("Ajouter une slide au carrousel", exact=True).wait_for(timeout=15000)
    assert await page.get_by_text("Actualités & carrousel", exact=True).is_visible()

    dom_text = await page.locator("body").inner_text()
    assert "Uncaught runtime errors" not in dom_text
    assert "Can't find variable" not in dom_text
    assert not any("absoluteUrl" in e or "Can't find variable" in e for e in errors), errors

    imgs = await page.locator("img[src]").evaluate_all("els => els.map(i => i.src)")
    assert len(imgs) > 0
    assert all(src.startswith("http") or src.startswith("data:") for src in imgs)

    for route in ["/management", "/management/planning", "/management/demandes", "/management/attributions", "/management/agenda", "/management/formulaires", "/management/documents"]:
        await page.goto(route, wait_until="networkidle")
        assert "Uncaught runtime errors" not in await page.locator("body").inner_text()
        assert not any("Can't find variable" in e for e in errors), errors