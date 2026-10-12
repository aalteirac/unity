import { expect, test } from '@playwright/test';

test('presentation navigation preserves review and delivery state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Unity identity')).toBeEnabled();
  await page.getByLabel('Snowflake account URL or identifier').fill('ACME.GAMES');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Deployment flow', exact: true }).click();
  await expect(page).toHaveURL(/#deployment-flow$/);
  await expect(page.getByRole('heading', { name: 'One onboarding. Two private deliveries.' })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Deployment flow', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Simulate private delivery' })).toBeVisible();
  await expect(page.getByText('ACME.GAMES', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate private delivery' }).click();
  await expect(page.getByText('Your demo connection is ready')).toBeVisible();
  await page.locator('.portal-page-switch').getByRole('link', { name: 'Deployment flow' }).click();
  await page.getByRole('link', { name: 'Try the onboarding' }).click();
  await expect(page.getByText('Your demo connection is ready')).toBeVisible();
});

test('direct route, guided steps, actual code references, copy and desktop presentation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#deployment-flow');
  await expect(page.getByRole('heading', { name: 'From account to private delivery' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.walkthrough-detail h3')).toHaveText('Confirm identity + account');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.walkthrough-detail h3')).toHaveText('Prepare two products');
  await expect(page.locator('.lane-highlight')).toHaveCount(2);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.locator('.walkthrough-detail h3')).toHaveText('Activate Snowflake');
  await page.screenshot({ path: 'test-results/deployment-desktop.png', fullPage: true });
  await page.locator('summary').filter({ hasText: 'Native App delivery stays in its own module' }).click();
  await expect(page.locator('.source-toolbar').first()).toContainText('NativeAppListingDistributor.ts:16-21');
  await expect(page.getByLabel('Code excerpt: Native App delivery stays in its own module')).toContainText("'APPLICATION PACKAGE'");
  await page.getByRole('button', { name: 'Copy snippet: Native App delivery stays in its own module' }).click();
  await expect(page.getByRole('status')).toContainText('Copied: Native App delivery');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('prepare(binding: DeliveryBinding)');
  await expect(page.getByText('The live adapters are implemented but unverified and disconnected from demo sessions. Nothing on this page deploys or publishes to Snowflake.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('mobile page switch, expanded source containment and clipboard fallback', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await page.locator('.portal-page-switch').getByRole('link', { name: 'Deployment flow' }).click();
  await page.locator('summary').filter({ hasText: 'Data is filtered before it is shared' }).click();
  await expect(page.getByLabel('Code excerpt: Data is filtered before it is shared')).toContainText('CREATE SECURE VIEW');
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('Denied')) }));
  await page.getByRole('button', { name: 'Copy snippet: Data is filtered before it is shared' }).click();
  await expect(page.getByRole('status')).toContainText('Clipboard unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/deployment-mobile.png', fullPage: true });
});