import { test, expect } from '@playwright/test';
import { mockLLM } from './helpers/mockLLM.js';

test.beforeEach(async ({ page }) => {
    await mockLLM(page);
});

test('Отправленный ответ отображается в чате', async ({ page }) => {
    const userAnswer = `Тест ${Date.now()}`;
    await page.goto('/#emotions');
    await page.waitForSelector('#chatWrapper');

    // Ждём первого вопроса
    await expect(page.locator('.message.coach')).toContainText('Ты получил неожиданный комплимент и почувствовал тепло в груди. Что это?');

    // Отправляем ответ
    await page.fill('#userInput', userAnswer);
    await page.click('#sendBtn');

    // Проверяем, что ответ пользователя появился
    await expect(page.locator('.message.user')).toContainText(userAnswer);

    const coachMessages = page.locator('.message.coach');
    await expect(coachMessages.nth(-3)).toContainText('✅ Верно!');
    await expect(coachMessages.nth(-2)).toContainText('📘 Как можно ответить:');
    await expect(coachMessages.nth(-2)).toContainText('Радость');
    await expect(coachMessages.last()).toContainText('Сердце колотится, ладони потеют, и ты не можешь сосредоточиться перед выступлением. Что ты испытываешь?');
});