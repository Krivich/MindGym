import { test, expect } from '@playwright/test';

test('Лендинг → Чат → Лендинг', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#landing')).toBeVisible();

    // Ждём, пока в селекте появятся официальные курсы (минимум 1 кроме служебных)
    await page.waitForFunction(() => {
        const select = document.getElementById('courseSelect');
        // Считаем только "реальные" курсы (не __upload__, не __create__)
        const realOptions = Array.from(select.options).filter(opt =>
            opt.value && !opt.value.startsWith('__')
        );
        return realOptions.length > 0;
    });

    await page.selectOption('#courseSelect', 'ta_scenarios.json');
    await expect(page.locator('#chatWrapper')).toBeVisible();
    await expect(page.locator('#landing')).toBeHidden();

    await page.click('#appLogo');
    await expect(page.locator('#landing')).toBeVisible();
    await expect(page.locator('#chatWrapper')).toBeHidden();
});

test('Чат → Сброс → только первый вопрос', async ({ page }) => {
    await page.goto('/#emotions');
    // Ждём, пока чат полностью загрузится (появится заголовок модуля)
    await page.waitForSelector('.module-title:has-text("Базовые эмоции")');

    await page.fill('#userInput', 'Тест');
    await page.click('#sendBtn');
    await expect(page.locator('.message.user')).toBeVisible();

    await page.click('#courseMenuBtn');

    // ✅ Сначала подписываемся на диалог
    page.once('dialog', dialog => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain('Сбросить прогресс');
        dialog.accept();
    });

    await page.getByText('↺ Сбросить прогресс').click();

    // После сброса должен появиться заголовок модуля (гарантия перезапуска)
    await page.waitForSelector('.module-title:has-text("Базовые эмоции")');
    // И не должно быть сообщений пользователя
    await expect(page.locator('.message.user')).toHaveCount(0);
    // Первый вопрос от коуча должен быть виден
    await expect(page.locator('.message.coach')).toContainText('Ты получил неожиданный комплимент и почувствовал тепло в груди. Что это?');
});