import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(import.meta.dirname, '../demo-video');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'reduce',
  recordVideo: { dir: output, size: { width: 1600, height: 1000 } }
});
const page = await context.newPage();
const video = page.video()!;

async function caption(title: string, text: string, seconds = 5) {
  if (page.frames().length !== 1 || new URL(page.url()).origin !== 'http://127.0.0.1:5173') {
    throw new Error('Recording is restricted to the local portal without embedded frames.');
  }
  await page.evaluate(({ title, text }) => {
    let overlay = document.getElementById('demo-video-caption');
    if (!overlay) {
      overlay = document.createElement('aside');
      overlay.id = 'demo-video-caption';
      Object.assign(overlay.style, {
        position: 'fixed', bottom: '24px', left: '270px', right: '36px', zIndex: '10000',
        background: '#122037', color: '#ffffff', padding: '20px 26px', borderRadius: '12px',
        boxShadow: '0 8px 30px #00000030', pointerEvents: 'none', fontFamily: 'Arial, sans-serif'
      });
      document.body.append(overlay);
    }
    overlay.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = title;
    Object.assign(heading.style, { display: 'block', fontSize: '22px', marginBottom: '8px' });
    const description = document.createElement('div');
    description.textContent = text;
    Object.assign(description.style, { fontSize: '17px', lineHeight: '1.5', color: '#d5e3f6' });
    overlay.append(heading, description);
  }, { title, text });
  await page.waitForTimeout(seconds * 1000);
}

async function show(selector: string) {
  await page.locator(selector).first().evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await page.waitForTimeout(700);
}

try {
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.getByLabel('Unity identity')).toBeEnabled();
  await caption('Unity + Snowflake | One onboarding, two private deliveries', 'A local portal demo with synthetic Unity data. No Snowflake objects are created.', 6);

  await show('.setup-card');
  await caption('1. Start with a Unity identity', 'The demo selects a studio identity. Production will use trusted Unity authentication.', 5);
  await page.getByLabel('Unity identity').selectOption('studio-orbit');
  await expect(page.locator('.preview-row').filter({ hasText: 'Lunar Quest' })).toBeVisible();
  await caption('Each studio sees its own dataset preview', 'These project records are synthetic. Live data will be filtered on the backend by Unity ID.', 5);

  await page.getByRole('link', { name: 'Create a free trial' }).hover();
  await caption('2. Create or use a Snowflake account', 'New users follow the official trial link, activate via email, then copy their account details from Snowflake.', 6);
  await page.getByLabel('Snowflake account URL or identifier').fill('https://acme-games.snowflakecomputing.com');
  await caption('Paste the account URL or identifier', 'The portal normalizes this URL to ACME.GAMES. Format validation does not verify account ownership.', 5);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simulate private delivery' })).toBeVisible();
  await show('.setup-card');
  await caption('3. Review two independent products', 'One private Native App listing and one private data listing, targeted to the same recipient account.', 6);

  await page.getByRole('button', { name: 'Simulate private delivery' }).click();
  await expect(page.getByText('Your demo connection is ready')).toBeVisible();
  await show('.delivery-list');
  await caption('Two independent deliveries', 'Both products are SIMULATED. Nothing has been published or installed in Snowflake.', 6);

  await page.locator('.sidebar').getByRole('button', { name: 'Deployment flow', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await caption('4. Explain the deployment to Unity', 'The built-in presentation shows the full journey, backend responsibilities, and actual source excerpts.', 5);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await caption('A trusted identity + approved recipient binding', 'Live delivery requires backend identity and account verification before either product is shared.', 5);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await show('.delivery-lanes');
  await caption('Two clearly separated integration modules', 'Native App: existing package to app listing. Data: Unity-filtered secure view to share to data listing.', 7);
  await show('.publish-card');
  await caption('Draft first. Publish explicitly. Consumer accepts.', 'The developer then accepts both listings, installs the app, and mounts the data. Fulfillment can be asynchronous.', 6);

  await page.locator('summary').filter({ hasText: 'Native App delivery stays in its own module' }).click();
  await show('.source-excerpt');
  await caption('Real code: isolated Native App listing preparation', 'The displayed excerpt and file/line reference come directly from the repository at build time.', 6);
  await page.locator('summary').filter({ hasText: 'Native App delivery stays in its own module' }).click();
  await page.locator('summary').filter({ hasText: 'Data is filtered before it is shared' }).click();
  await show('.source-excerpt:nth-of-type(2)');
  await caption('Real code: filter before sharing', 'A fixed Unity ID predicate scopes the secure view. SELECT is granted on that view, not the unfiltered source.', 7);
  await page.locator('summary').filter({ hasText: 'Data is filtered before it is shared' }).click();
  await show('.integration-readiness');
  await caption('Demo works today. Live integration comes next.', 'Remaining: real authentication, provider setup, real dataset, a built/released Native App, and live integration tests.', 7);
  await page.evaluate(() => window.scrollTo(0, 0));
  await caption('One onboarding. Two private deliveries.', 'A simple developer journey, with Native App and data-sharing code kept separate. Local demo only.', 6);
  await page.screenshot({ path: resolve(output, 'demo-poster.png') });
} finally {
  await context.close();
  await video.saveAs(resolve(output, 'unity-snowflake-demo.webm'));
  await browser.close();
}
console.log(`Video recorded: ${resolve(output, 'unity-snowflake-demo.webm')}`);