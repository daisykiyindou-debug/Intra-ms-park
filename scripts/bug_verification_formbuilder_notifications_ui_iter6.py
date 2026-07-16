#!/usr/bin/env python3
"""Standalone Playwright UI test mirroring the executed MCP browser verification.

It verifies the exact UI symptoms from iteration 6:
- FormBuilder edit modal is fully inside a 1920x1080 viewport and shows header/footer/3 columns.
- Live preview can be hidden and shown with data-testid=toggle-preview.
- Clicking an unread notification redirects to its link and marks it read.
"""

import asyncio
import os

from playwright.async_api import async_playwright


BASE_URL = os.environ.get("MSPARK_BASE_URL", "https://mspark-employee-hub.preview.emergentagent.com").rstrip("/")


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        try:
            await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
            await page.get_by_test_id("login-email").fill("marcus.simeo@mspark.fr")
            await page.get_by_test_id("login-password").fill("MSPark@Admin2026!")
            await page.get_by_test_id("login-btn").click()
            await page.wait_for_url("**/dashboard", timeout=15000)

            await page.goto(f"{BASE_URL}/management/formulaires", wait_until="networkidle")
            edit_buttons = page.locator('[data-testid^="form-edit-"]')
            if await edit_buttons.count() == 0:
                raise AssertionError("No existing form edit button found")
            await edit_buttons.first.click()
            await page.wait_for_selector('[data-testid="form-editor"]', state="visible", timeout=10000)

            rect_info = await page.evaluate(
                """() => {
                    const el = document.querySelector('[data-testid="form-editor"]');
                    const r = el.getBoundingClientRect();
                    const text = document.body.innerText.toLowerCase();
                    const preview = Array.from(document.querySelectorAll('aside')).some(a => a.innerText.toLowerCase().includes('aperçu employé'));
                    return {
                        top: r.top, left: r.left, width: r.width, height: r.height,
                        bottom: r.bottom, windowHeight: window.innerHeight,
                        headerVisible: text.includes('modifier le formulaire'),
                        footerVisible: text.includes('annuler') && text.includes('enregistrer'),
                        settingsVisible: text.includes('titre du formulaire') && text.includes('ajouter un champ'),
                        fieldsEditorVisible: text.includes('champs du formulaire'),
                        previewVisible: preview
                    };
                }"""
            )
            assert rect_info["top"] >= 0 and rect_info["bottom"] <= rect_info["windowHeight"], rect_info
            assert rect_info["headerVisible"] and rect_info["footerVisible"], rect_info
            assert rect_info["settingsVisible"] and rect_info["fieldsEditorVisible"] and rect_info["previewVisible"], rect_info

            await page.get_by_test_id("toggle-preview").click()
            await page.wait_for_timeout(300)
            hidden = await page.evaluate("""() => !Array.from(document.querySelectorAll('aside')).some(a => a.innerText.toLowerCase().includes('aperçu employé'))""")
            assert hidden, "Preview did not hide"
            await page.get_by_test_id("toggle-preview").click()
            await page.wait_for_timeout(300)
            shown = await page.evaluate("""() => Array.from(document.querySelectorAll('aside')).some(a => a.innerText.toLowerCase().includes('aperçu employé'))""")
            assert shown, "Preview did not show"

            await page.locator('[data-testid="form-editor"]').get_by_text("Annuler", exact=True).click()
            created = await page.evaluate(
                """async () => {
                    const unique = 'UI-NOTIF-FILE-' + Date.now();
                    const res = await fetch('/api/channels/ch-accueil/messages', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json', 'X-Employee-Id': 'emp-marcus-simeo'},
                        body: JSON.stringify({content: unique})
                    });
                    return {status: res.status, unique};
                }"""
            )
            assert created["status"] == 200, created
            await page.evaluate("""() => { localStorage.setItem('ms_employee_id', 'emp-idriss-malonga'); localStorage.removeItem('ms_logged_out'); }""")
            await page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle")
            notif = await page.evaluate(
                """async (unique) => {
                    const res = await fetch('/api/notifications', {headers: {'X-Employee-Id': 'emp-idriss-malonga'}});
                    const items = await res.json();
                    return items.find(x => (x.content || x.message || '').includes(unique)) || null;
                }""",
                created["unique"],
            )
            assert notif and notif["read"] is False and notif["link"] == "/messagerie?channel=ch-accueil", notif
            await page.get_by_test_id("notif-button").click()
            await page.get_by_test_id(f"notif-{notif['id']}").click()
            await page.wait_for_timeout(1500)
            assert "/messagerie" in page.url and "channel=ch-accueil" in page.url, page.url
            read_after = await page.evaluate(
                """async (nid) => {
                    const res = await fetch('/api/notifications', {headers: {'X-Employee-Id': 'emp-idriss-malonga'}});
                    const items = await res.json();
                    const n = items.find(x => x.id === nid);
                    return n ? n.read : null;
                }""",
                notif["id"],
            )
            assert read_after is True, read_after
            print("PASS")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())