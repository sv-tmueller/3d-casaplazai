/**
 * First-run journey e2e (issue #144, Pkg 15.1) — the whole first-run
 * experience against the production build:
 *
 *   fresh profile → empty-state card → "Draw a room" arms Rectangle and
 *   hides the card → the card body stays transparent to canvas gestures →
 *   a demo loads (card and Plans menu) without prompting on an empty plan
 *   → demo-over-non-empty prompts, Escape keeps the plan → "New plan"
 *   prompts, Cancel keeps, Confirm resets → the reset survives a reload
 *   (the autosave slot reflects it) → a demo loaded in the editor renders
 *   in the 3D viewer.
 *
 * "Fresh profile" = a fresh browser context per test (Playwright's
 * default), i.e. empty localStorage — exactly the autosave slot the
 * viewer pane polls.
 */
import { expect, test, type Page } from '@playwright/test';

const CARD = '[data-testid="empty-state-card"]';
const POPOVER = '[data-testid="plans-popover"]';
const BACKDROP = '[data-testid="confirm-backdrop"]';
const CONFIRM_BTN = '[data-testid="confirm-confirm"]';
const CANCEL_BTN = '[data-testid="confirm-cancel"]';
const DEMOS = ['apartment', 'duplex', 'townhouse'] as const;

async function roomCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = (window as any).__casaplaza.getCurrent();
    return plan.floors.reduce(
      (n: number, f: { rooms: unknown[] }) => n + f.rooms.length,
      0,
    );
  });
}

async function openPlansMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="plans-button"]').click();
  await expect(page.locator(POPOVER)).toBeVisible();
}

async function loadDemoFromMenu(page: Page, id: string): Promise<void> {
  await openPlansMenu(page);
  await page.locator(`[data-testid="plan-demo-${id}"]`).click();
}

test.describe('first run (issue #144)', () => {
  test('fresh profile shows the card; Draw a room arms Rectangle and hides it', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator(CARD)).toBeVisible();
    expect(await roomCount(page)).toBe(0);
    // Belt and braces: the CARD is the only overlay here, not the popover.
    await expect(page.locator(POPOVER)).toBeHidden();

    // The card body must NOT swallow canvas gestures (editor.spec.ts
    // drags through the canvas centre on an empty plan): hit-testing the
    // card's own centre must reach the canvas, not the card.
    const box = (await page.locator(CARD).boundingBox())!;
    const hitAt = async (px: number, py: number): Promise<string> =>
      page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.className ?? '',
        { x: px, y: py },
      );
    // Card body (padding corner) → the canvas underneath receives it …
    expect(await hitAt(box.x + 6, box.y + 6)).toContain('editor-canvas');
    // … while the buttons themselves stay hit-testable.
    const drawBox = (await page
      .locator('[data-testid="empty-draw-room"]')
      .boundingBox())!;
    expect(
      await hitAt(drawBox.x + drawBox.width / 2, drawBox.y + drawBox.height / 2),
    ).not.toContain('editor-canvas');

    await page.locator('[data-testid="empty-draw-room"]').click();

    // The card steps aside as soon as a drawing tool is armed.
    await expect(page.locator(CARD)).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Rectangle' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('a demo loads from the card and from the Plans menu, silently on an empty plan', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator(CARD)).toBeVisible();

    // Card path: reveal the three-button demo row, then load.
    await page.locator('[data-testid="empty-load-demo"]').click();
    await expect(page.locator('[data-testid="empty-demo-row"]')).toBeVisible();
    await page.locator('[data-testid="empty-demo-apartment"]').click();

    await expect(page.locator(BACKDROP)).toHaveCount(0); // no prompt: plan was empty
    await expect(page.locator(CARD)).toBeHidden();
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);

    // Menu path over a now non-empty plan: prompts.
    await loadDemoFromMenu(page, 'duplex');
    await expect(page.locator(BACKDROP)).toBeVisible();
    await page.locator(CONFIRM_BTN).click();
    await expect(page.locator(BACKDROP)).toHaveCount(0);
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);

    // Every registry demo is reachable from the menu.
    for (const id of DEMOS) {
      await loadDemoFromMenu(page, id);
      await expect(page.locator(BACKDROP)).toBeVisible();
      await page.locator(CONFIRM_BTN).click();
      await expect(page.locator(BACKDROP)).toHaveCount(0);
      await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
    }
  });

  test('demo-over-non-empty prompts and Escape keeps the current plan', async ({
    page,
  }) => {
    await page.goto('/');
    await loadDemoFromMenu(page, 'apartment');
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
    const kept = await roomCount(page);

    await loadDemoFromMenu(page, 'townhouse');
    await expect(page.locator(BACKDROP)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(BACKDROP)).toHaveCount(0);
    expect(await roomCount(page)).toBe(kept);
  });

  test('New plan prompts (Save JSON lifeline), Cancel keeps, Confirm resets, reload reflects autosave', async ({
    page,
  }) => {
    await page.goto('/');
    await loadDemoFromMenu(page, 'townhouse');
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);
    const before = await roomCount(page);

    // Prompt copy carries the Save JSON lifeline.
    await openPlansMenu(page);
    await page.locator('[data-testid="plan-new"]').click();
    await expect(page.locator(BACKDROP)).toBeVisible();
    await expect(page.locator('[data-testid="confirm-message"]')).toContainText(
      'Save JSON',
    );

    // Cancel keeps the plan.
    await page.locator(CANCEL_BTN).click();
    await expect(page.locator(BACKDROP)).toHaveCount(0);
    expect(await roomCount(page)).toBe(before);
    await expect(page.locator(CARD)).toBeHidden();

    // Confirm resets to an empty plan and the card comes back.
    await openPlansMenu(page);
    await page.locator('[data-testid="plan-new"]').click();
    await page.locator(CONFIRM_BTN).click();
    await expect(page.locator(BACKDROP)).toHaveCount(0);
    await expect.poll(() => roomCount(page)).toBe(0);
    await expect(page.locator(CARD)).toBeVisible();

    // The reset is what the autosave slot holds: a reload shows the card.
    await page.reload();
    await expect(page.locator(CARD)).toBeVisible();
    expect(await roomCount(page)).toBe(0);
  });

  test('a demo loaded in the editor renders in the 3D viewer', async ({ page }) => {
    await page.goto('/');
    await loadDemoFromMenu(page, 'apartment');
    await expect.poll(() => roomCount(page)).toBeGreaterThan(0);

    await page.goto('/viewer');
    await page.locator('.viewer-gl-canvas').waitFor();
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__viewerStats?.();
        return typeof s === 'object' && s !== null && s.meshCount > 0;
      },
      { timeout: 15_000 },
    );
  });
});
