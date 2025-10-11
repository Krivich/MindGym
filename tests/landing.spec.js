import { test, expect } from '@playwright/test';

test('Лендинг содержит ключевую педагогическую фразу', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.core-idea')).toHaveText('Потому что знания — не навыки.');
  await expect(page.locator('.benefits')).toContainText('Пишете ответ самостоятельно');
});
