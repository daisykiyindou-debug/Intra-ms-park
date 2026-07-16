"""Focused UI Playwright steps used for bug verification iteration 12.
Run by the browser automation agent against the preview URL.
"""
try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto('https://mspark-employee-hub.preview.emergentagent.com/login')
    await page.wait_for_load_state('networkidle')
    await page.locator('[data-testid="login-email"]').fill('idriss.malonga@gmail.com')
    await page.locator('[data-testid="login-password"]').fill('Idriss2026!')
    await page.locator('[data-testid="login-btn"]').click()
    await page.wait_for_url('**/dashboard', timeout=15000)
    print('PASS - logged in as Idriss')

    await page.goto('https://mspark-employee-hub.preview.emergentagent.com/restaurant')
    await page.wait_for_load_state('networkidle')
    await page.wait_for_selector('text=Menu digital & commandes', timeout=15000)
    balance_text = await page.locator('text=Il vous reste').first.text_content(timeout=10000)
    assert '25 points' in balance_text and '/ 25 pts' in balance_text, balance_text
    print('PASS - restaurant balance shows 25 points / 25 pts')
    await page.locator('button', has_text='Soccer Bar').click()
    await page.locator('button', has_text='Viandes').wait_for(timeout=10000)
    await page.locator('button', has_text='Poissons').wait_for(timeout=10000)
    print('PASS - Viandes and Poissons filters visible')
    await page.locator('button', has_text='Viandes').click()
    await page.wait_for_timeout(500)
    cote_card = page.locator('.ms-card', has_text='Côte de boeuf').first
    await cote_card.wait_for(timeout=10000)
    cote_text = await cote_card.text_content()
    cote_img = await cote_card.locator('img[alt="Côte de boeuf"]').get_attribute('src')
    assert '22 pts' in cote_text and 'cotedeboeufcuire' in (cote_img or ''), (cote_text, cote_img)
    print('PASS - Côte de boeuf card is correct')
    await page.locator('button', has_text='Poissons').click()
    await page.wait_for_timeout(500)
    crevettes_card = page.locator('.ms-card', has_text='Crevettes sautées').first
    await crevettes_card.wait_for(timeout=10000)
    crevettes_text = await crevettes_card.text_content()
    crevettes_img = await crevettes_card.locator('img[alt="Crevettes sautées"]').get_attribute('src')
    assert '16 pts' in crevettes_text and 'crevettes-sautees' in (crevettes_img or ''), (crevettes_text, crevettes_img)
    print('PASS - Crevettes sautées card is correct')

    await page.goto('https://mspark-employee-hub.preview.emergentagent.com/points-repas')
    await page.wait_for_load_state('networkidle')
    await page.wait_for_selector('text=Points Repas MS Park', timeout=15000)
    body = await page.locator('body').inner_text()
    lower = body.lower()
    assert 'solde du jour' in lower, 'Solde du jour label missing'
    assert '/ 25 pts restants' in body, 'main balance missing 25 pts restants'
    assert 'QUOTA JOURNALIER\n25 pts' in body, 'quota stat missing 25 pts'
    assert 'RESTANTS\n25 pts' in body, 'remaining stat missing 25 pts'
    print('PASS - points-repas shows Solde du jour 25, Quota journalier 25 pts, Restants 25 pts')

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    print('SUCCESS - focused UI checks completed')
except Exception as e:
    print(f'FAIL - focused UI checks failed: {e}')
    raise
