/**
 * First run (issue #144, on the workspace since #178): fresh profile →
 * empty-state card → Draw a room arms Rectangle and hides the card → the
 * card body stays transparent to canvas gestures → demos load from the
 * card and from the logo menu, silently on an empty plan → demo over a
 * non-empty plan asks and Escape keeps it → New plan asks, Cancel keeps,
 * Confirm resets, a reload reflects the autosave → a demo renders in 3D.
 */
import { expect, test, type Page } from '@playwright/test';
import { command, openWorkspace, roomCount, switchView, waitForScene } from './fixtures/workspace';

const CARD = '[data-testid="ws-empty"]';
const DIALOG = '[data-testid="ws-confirm"]';
const DEMOS = ['apartment', 'duplex', 'townhouse'] as const;

async function loadDemoFromMenu(page: Page, id: string): Promise<void> {
  await page.getByTestId('ws-logo-menu').click();
  await expect(page.getByTestId('ws-file-menu')).toBeVisible();
  await command(page, 'file.demo', id).click();
}

test.describe('first run (issue #144)', () => {
  test('fresh profile shows the card; Draw a room arms Rectangle and hides it', async ({ page }) => {
    await openWorkspace(page);
    await expect(page.locator(CARD)).toBeVisible();
    expect(await roomCount(page)).toBe(0);

    // The card body must not swallow canvas gestures; its buttons do.
    const box = (await page.locator(CARD).boundingBox())!;
    const hitAt = (x: number, y: number): Promise<string> =>
      page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', { x, y });
    expect(await hitAt(box.x + 6, box.y + 6)).toContain('editor-canvas');
    const draw = (await page.getByTestId('ws-empty-draw').boundingBox())!;
    expect(await hitAt(draw.x + draw.width / 2, draw.y + draw.height / 2)).not.toContain('editor-canvas');

    await page.getByTestId('ws-empty-draw').click();
    await expect(page.locator(CARD)).toBeHidden();
    await expect(command(page, 'tool.rectangle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a demo loads from the card and from the logo menu, silently on an empty plan', async ({ page }) => {
    await openWorkspace(page);
    await page.getByTestId('ws-empty-demo').click();
    await expect(page.getByTestId('ws-empty-demo-row')).toBeVisible();
    await page.getByTestId('ws-empty-demo-apartment').click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect(page.locator(CARD)).toBeHidden();
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);

    for (const id of DEMOS) {
      await loadDemoFromMenu(page, id);
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.getByTestId('ws-confirm-ok').click();
      await expect(page.locator(DIALOG)).toHaveCount(0);
      await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
    }
  });

  test('demo over a non-empty plan asks, and Escape keeps the plan', async ({ page }) => {
    await openWorkspace(page);
    await loadDemoFromMenu(page, 'apartment');
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
    const kept = await roomCount(page);
    await loadDemoFromMenu(page, 'townhouse');
    await expect(page.locator(DIALOG)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(await roomCount(page)).toBe(kept);
  });

  test('New plan asks (Save JSON lifeline), Cancel keeps, Confirm resets, reload reflects autosave', async ({ page }) => {
    await openWorkspace(page);
    await loadDemoFromMenu(page, 'townhouse');
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
    const before = await roomCount(page);

    await page.getByTestId('ws-logo-menu').click();
    await command(page, 'file.new').click();
    await expect(page.locator(DIALOG)).toBeVisible();
    await expect(page.getByTestId('ws-confirm-message')).toContainText('Save JSON');
    await page.getByTestId('ws-confirm-cancel').click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(await roomCount(page)).toBe(before);
    await expect(page.locator(CARD)).toBeHidden();

    await page.getByTestId('ws-logo-menu').click();
    await command(page, 'file.new').click();
    await page.getByTestId('ws-confirm-ok').click();
    await expect.poll(() => roomCount(page)).toBe(0);
    await expect(page.locator(CARD)).toBeVisible();

    await page.reload();
    await expect(page.locator(CARD)).toBeVisible();
    expect(await roomCount(page)).toBe(0);
  });

  test('a demo loaded in the Plan view renders in the 3D view', async ({ page }) => {
    await openWorkspace(page);
    await loadDemoFromMenu(page, 'apartment');
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
    await switchView(page, '3d');
    await waitForScene(page);
  });
});
