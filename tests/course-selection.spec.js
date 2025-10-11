import {expect, test} from '@playwright/test';

test('Курс emotions содержит характерный промпт', async ({ page }) => {
    await page.goto('/');
    // Ждём, пока селект заполнится официальными курсами
    await page.waitForFunction(() => {
        const select = document.getElementById('courseSelect');
        return Array.from(select.options).some(opt => opt.value === 'ta_scenarios.json');
    });
    await page.selectOption('#courseSelect', 'ta_scenarios.json');
    await expect(page.locator('#chatWrapper')).toBeVisible();
    await expect(page.locator('.message.coach')).toContainText('Жена говорит: «Ты опять не вынес мусор! Ты вообще думаешь о других?»');
});