import { expect, test } from '@playwright/test';

// Navigate by route NAME ("/" vs "/viewer"), not by file path with suffix:
// vite preview redirects "/index.html" -> "/" which breaks asset-relative URLs.
const ROUTES = [
  { url: '/', selector: '.pane-editor' },
  { url: '/viewer', selector: '.pane-viewer' },
] as const;

ROUTES.forEach(({ url, selector }) => {
  test(`renders a non-blank pane with no errors (${url})`, async ({ page }) => {
    await page.goto(url);
    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
    await expect(page.locator(selector)).toHaveCount(1);
  });
});

test('console/page errors absent on both entries', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  for (const { url, selector } of ROUTES) {
    await page.goto(url);
    await expect(page.locator(selector)).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});
