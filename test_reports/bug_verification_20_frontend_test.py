# Playwright script executed via mcp_browser_automation for bug verification 20.
# Scope: admin Utilisateurs last-row menu clipping and avatar cropper flow only.

async def run(page):
    try:
        await page.set_viewport_size({"width": 1920, "height": 1080})
        await page.wait_for_selector('[data-testid="login-email"]', timeout=10000)
        await page.fill('[data-testid="login-email"]', 'marcus.simeo@mspark.fr')
        await page.fill('[data-testid="login-password"]', 'MSPark@Admin2026!')
        await page.click('[data-testid="login-btn"]', force=True)
        await page.wait_for_url('**/dashboard', timeout=15000)

        await page.goto('http://localhost:3000/management/utilisateurs')
        await page.wait_for_selector('[data-testid="user-create"]', timeout=15000)
        await page.wait_for_selector('[data-testid^="row-menu-"]', timeout=15000)
        count = await page.locator('[data-testid^="row-menu-"]').count()
        last_btn = page.locator('[data-testid^="row-menu-"]').nth(count - 1)
        last_testid = await last_btn.get_attribute('data-testid')
        await last_btn.scroll_into_view_if_needed()
        await page.wait_for_timeout(500)
        await last_btn.click(force=True)
        await page.wait_for_timeout(500)
        menu_result = await page.evaluate("""(tid) => {
            const id = tid.replace('row-menu-', '');
            const selectors = [`[data-testid="edit-${id}"]`, `[data-testid="reset-${id}"]`, `[data-testid="suspend-${id}"]`, `[data-testid="deactivate-${id}"]`, `[data-testid="delete-${id}"]`];
            const buttons = selectors.map(sel => document.querySelector(sel));
            const items = buttons.map((el, i) => ({selector: selectors[i], present: !!el, text: el?.textContent?.trim() || null, rect: el ? el.getBoundingClientRect().toJSON() : null}));
            const menu = buttons.find(Boolean)?.parentElement || null;
            return {viewportH: window.innerHeight, menuRect: menu ? menu.getBoundingClientRect().toJSON() : null, items, bodyChild: menu ? menu.parentElement === document.body : false};
        }""", last_testid)
        assert menu_result['menuRect']
        assert menu_result['menuRect']['top'] >= -0.5
        assert menu_result['menuRect']['bottom'] <= menu_result['viewportH'] + 0.5
        assert not [i for i in menu_result['items'] if not i['present']]

        await page.mouse.click(10, 10)
        await page.click('[data-testid="user-create"]', force=True)
        await page.wait_for_selector('[data-testid="user-editor"]', timeout=10000)
        await page.set_input_files('[data-testid="user-avatar-file"]', '/app/test_reports/avatar_crop_test.jpg')
        await page.wait_for_selector('[data-testid="avatar-cropper"]', timeout=10000)
        cropper_info = await page.evaluate("""() => {
            const modal = document.querySelector('[data-testid="avatar-cropper"]');
            const circle = modal?.querySelector('.rounded-full');
            const img = modal?.querySelector('img');
            const zoom = document.querySelector('[data-testid="cropper-zoom"]');
            const apply = document.querySelector('[data-testid="cropper-apply"]');
            const cancel = Array.from(modal?.querySelectorAll('button') || []).find(b => b.textContent.includes('Annuler'));
            return {modal: !!modal, imagePresent: !!img, zoomValue: zoom?.value, applyText: apply?.textContent?.trim() || null, cancelPresent: !!cancel, circleOverflow: circle ? getComputedStyle(circle).overflow : null, circleRect: circle ? circle.getBoundingClientRect().toJSON() : null};
        }""")
        assert cropper_info['modal'] and cropper_info['imagePresent'] and cropper_info['cancelPresent']
        assert cropper_info['circleOverflow'] == 'hidden'
        await page.fill('[data-testid="cropper-zoom"]', '2')
        assert abs(float(await page.locator('[data-testid="cropper-zoom"]').input_value()) - 2.0) < 0.01
        rect = cropper_info['circleRect']
        cx = rect['x'] + rect['width'] / 2
        cy = rect['y'] + rect['height'] / 2
        before_transform = await page.locator('[data-testid="avatar-cropper"] img').evaluate('el => getComputedStyle(el).transform')
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        await page.mouse.move(cx + 80, cy + 30, steps=8)
        await page.mouse.up()
        after_transform = await page.locator('[data-testid="avatar-cropper"] img').evaluate('el => getComputedStyle(el).transform')
        assert before_transform != after_transform
        await page.click('[data-testid="cropper-apply"]', force=True)
        await page.wait_for_timeout(4000)
        assert '/api/uploads/' in await page.locator('[data-testid="user-avatar"]').input_value()
        assert 'Photo recadrée et téléversée' in await page.evaluate("() => document.body.innerText")
    except Exception:
        await page.screenshot(path='/app/test_reports/browser_20/failure.png', quality=40, full_page=False)
        raise