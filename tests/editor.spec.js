import { test, expect } from '@playwright/test';
import {mockLLM} from "./helpers/mockLLM";

test.beforeEach(async ({ page }) => {
    await mockLLM(page);
});

test('Курс из редактора отображает введённые данные', async ({ page }) => {
    const title = `Курс ${Date.now()}`;
    const prompt = `Ситуация ${Date.now()}`;
    const answer = `Ответ ${Date.now()}`;

    await page.goto('/');
    await page.selectOption('#courseSelect', '__create__');
    await page.waitForSelector('#courseEditorContainer:visible');

    await page.fill('#courseTitle', title);
    await page.fill('#validationPrompt', 'Ты — эксперт');

    // Удаляем дефолтное упражнение
    page.once('dialog', dialog => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain('Удалить?');
        dialog.accept();
    });

    // Удаляем дефолтное упражнение
    await page.click('.remove-btn.ex-remove');


    // Ждём карточку модуля
    const moduleCard = page.locator('.module-card').filter({
        has: page.locator('.module-title-input[value="Модуль 1"]')
    });
    await expect(moduleCard).toBeVisible();

// Находим кнопку с ТОЧНЫМ текстом
    const addButton = moduleCard.getByText('+ Упражнение', { exact: true });
    await expect(addButton).toBeVisible();
    await addButton.click();

    await page.fill('.ex-prompt', prompt);
    await page.fill('.ex-expected', answer);

    await page.click('#launchCourse');
    await page.waitForSelector('#chatWrapper');

    await expect(page).toHaveTitle(new RegExp(title));
    await expect(page.locator('.message.coach')).toContainText(prompt);

    // Отправляем ответ и проверяем эталон
    // Отправляем ответ
    await page.fill('#userInput', 'любой');
    await page.click('#sendBtn');

    const coachMessages = page.locator('.message.coach');
    await expect(coachMessages.nth(-3)).toContainText('✅ Верно!');
    await expect(coachMessages.nth(-2)).toContainText('📘 Как можно ответить:');
    await expect(coachMessages.nth(-2)).toContainText(answer);
    await expect(coachMessages.last()).toContainText('Новая ситуация...\n');

});