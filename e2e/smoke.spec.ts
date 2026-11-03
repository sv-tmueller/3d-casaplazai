/**
 * Smoke (issue #178): the single workspace boots without errors, the
 * retired /viewer route redirects into it with the 3D view active
 * (query and #plan= fragment kept, gap G13), and a bad share fragment
 * raises the boot notice instead of a white screen.
 */
import { expect, test } from '@playwright/test';
import { shareFragment } from './fixtures/share';
import { openViewerRoute, openWorkspace, readDemo, roomCount, toasts, viewerStats, waitForScene } from './fixtures/workspace';

test('the workspace renders with no console or page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await openWorkspace(page);
  await expect(page.locator('#root')).not.toBeEmpty();
  for (const id of ['ws-topbar', 'ws-toolcard', 'ws-statusbar', 'ws-view']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('ws-view-plan')).toHaveAttribute('aria-checked', 'true');
  // Inter is self-hosted (no missing-font 404 in the console above).
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/^Inter/);
  expect(errors).toEqual([]);
});

test('/viewer?quality=low#plan=… lands on the workspace in 3D with the query and plan', async ({ page }) => {
  const fragment = shareFragment(await readDemo('apartment'));
  await openViewerRoute(page, '?quality=low', `#plan=${fragment}`);
  expect(new URL(page.url()).search).toBe('?quality=low&view=3d');
  expect(new URL(page.url()).hash).toBe(`#plan=${fragment}`);
  await expect(page.getByTestId('ws-view-3d')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
  await waitForScene(page);
  expect((await viewerStats(page))?.qualityLevel).toBe('low');
});

test('a broken share fragment shows the notice and the app keeps booting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await openViewerRoute(page, '', '#plan=not-a-plan');
  await expect.poll(() => toasts(page)).toContainEqual(expect.stringContaining('Shared link could not be opened'));
  await expect(page.locator('[data-testid="ws-toast"][role="alert"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
