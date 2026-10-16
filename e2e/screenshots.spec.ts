import { test } from '@playwright/test';

test.skip(process.env.SCREENSHOTS !== '1', 'screenshots are generated on demand');

test('capture README screenshots from the seeded demo account', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@dosecare.local');
  await page.getByLabel('Password').fill('demo-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/img/today.png' });
  await page.getByRole('link', { name: 'Grandma Rose' }).first().click();
  await page.waitForURL(/\/people\//);
  await page.getByText(/your role:/).waitFor();
  await page.getByText('Metformin').first().waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/img/person.png' });
  await page.goto('http://localhost:8026');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/img/mailpit.png' });
});
