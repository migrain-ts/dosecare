import { expect, test } from '@playwright/test';

test('register, add a medication, see the dose today and record it as taken', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/Password/).fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByRole('link', { name: 'E2E User' }).first().click(); // the self person card title
  await page.getByRole('button', { name: 'Add medication' }).click();
  await page.getByLabel('Medication name').fill('Aspirin');
  const now = new Date();
  await page.getByLabel(/^Time/).fill(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  await page.keyboard.press('Enter'); // confirms the time picker and submits the form
  await expect(page.getByText(/Every day at \d\d:\d\d/)).toBeVisible();

  await page.goto('/today');
  const taken = page.getByRole('button', { name: 'Taken' }).first();
  await expect(async () => {
    await page.reload();
    await expect(taken).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000, intervals: [3_000] });
  await taken.click();
  await expect(page.getByText('Taken', { exact: true }).first()).toBeVisible();
});
