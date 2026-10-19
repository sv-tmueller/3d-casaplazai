/**
 * E2E for issue #109 (Pkg 13.1: mini-3D inset in the editor).
 *
 * Journeys:
 *  1. TOGGLE ROUNDTRIP — the toolbar button expands the inset (root
 *     visible, aria-pressed true) and collapses it again (hidden,
 *     aria-pressed false).
 *  2. DRAW-A-WALL VISIBILITY WITHOUT FOCUS STEAL — inset opened via
 *     the CANVAS-KEYBOARD path ("3"), then a rect room drawn: the inset
 *     stays live and document.activeElement remains the 2D canvas
 *     throughout (the #101/#100/#99 canvas discipline, asserted for
 *     real — the button path is excluded because a button click
 *     legitimately focuses the button).
 *  3. KEYBOARD COLLAPSE — with canvas focus, "3" collapses the open
 *     inset; canvas focus survives the collapse.
 *  4. FALLBACK STUB — when WebGL context creation fails (getContext
 *     stubbed to throw), the inset shows the fallback stub ("Open 3D
 *     view" → /viewer) and the editor stays fully functional.
 */

import { expect, test, type Page } from '@playwright/test';

import { CAM_SCALE as SCALE } from './fixtures/camConstants';

const ROOT = '[data-testid="mini3d-root"]';
const CANVAS = '[data-testid="mini3d-canvas"]';
const FALLBACK = '[data-testid="mini3d-fallback"]';
const BTN = '[data-testid="btn-mini3d"]';

/** World → ABSOLUTE page coords (camera origin is (0,0) at boot). */
async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

/** Raw rect stroke (tool assumed ACTIVE) in the drawable quadrant. */
async function drawRectStroke(page: Page): Promise<void> {
  const a = await aim(page, 0.5, -0.5);
  const c = await aim(page, 3.5, -3.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.mouse.up();
}

async function roomCount(page: Page): Promise<number> {
  return page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__casaplaza.getData().rooms.length,
  );
}

/** Load a minimal one-room plan so the inset has something to build. */
async function loadStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan({
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [
        {
          id: 'r1',
          name: 'Studio',
          polygon: [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ],
        },
      ],
      openings: [],
      stairs: [],
      furniture: [],
    });
  });
}

test.describe('mini-3D inset (issue #109)', () => {
  test.beforeEach(async ({ page }) => {
    await loadStudio(page);
  });

  test('toolbar button toggles the inset open and closed (roundtrip)', async ({
    page,
  }) => {
    await expect(page.locator(ROOT)).toBeHidden();
    await page.click(BTN);
    await expect(page.locator(ROOT)).toBeVisible();
    await expect(page.locator(CANVAS)).toBeVisible();
    await expect(page.locator(BTN)).toHaveAttribute('aria-pressed', 'true');
    // Collapse via the same button.
    await page.click(BTN);
    await expect(page.locator(ROOT)).toBeHidden();
    await expect(page.locator(BTN)).toHaveAttribute('aria-pressed', 'false');
  });

  test('drawing a wall keeps the inset live without stealing canvas focus', async ({
    page,
  }) => {
    // Rect tool ON, then keyboard-focus the canvas (programmatic focus,
    // no stray stroke), then open the inset VIA THE KEYBOARD PATH.
    await page.getByRole('button', { name: 'Rectangle' }).click();
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('3');
    await expect(page.locator(CANVAS)).toBeVisible();

    const activeClass = () =>
      page.evaluate(
        () => document.activeElement?.className ?? '',
      );
    expect(await activeClass()).toContain('editor-canvas');

    await drawRectStroke(page);

    // The drawn room committed (store grew by one room).
    expect(await roomCount(page)).toBe(2);

    // Focus NEVER left the 2D canvas — no focus steal anywhere in the
    // inset's mount/render path — and the inset survived the rebuild.
    expect(await activeClass()).toContain('editor-canvas');
    await expect(page.locator(CANVAS)).toBeVisible();
    await expect(page.locator(FALLBACK)).toBeHidden();
  });

  test('"3" on the canvas keyboard-collapses the open inset', async ({
    page,
  }) => {
    await page.click(BTN);
    await expect(page.locator(ROOT)).toBeVisible();
    // Restore canvas focus (the button click focused the button).
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('3');
    await expect(page.locator(ROOT)).toBeHidden();
    await expect(page.locator(BTN)).toHaveAttribute('aria-pressed', 'false');
    // Canvas focus preserved through the collapse.
    expect(
      await page.evaluate(() => document.activeElement?.className),
    ).toContain('editor-canvas');
    // Round-trip back open via the keyboard alone.
    await page.keyboard.press('3');
    await expect(page.locator(ROOT)).toBeVisible();
  });

  test('falls back to the stub when WebGL is unavailable', async ({
    page,
  }) => {
    // Kill WebGL context creation BEFORE the app boots: the renderer
    // factory throws → the inset swaps the canvas for the stub.
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value(type: string, ...rest: unknown[]) {
          if (type === 'webgl' || type === 'webgl2') {
            throw new Error('WEBGL_DISABLED_FOR_TEST');
          }
          return orig.call(this, type, ...rest);
        },
      });
    });
    await loadStudio(page);
    await page.click(BTN);
    await expect(page.locator(FALLBACK)).toBeVisible();
    await expect(page.locator(CANVAS)).toBeHidden();
    const link = page.locator('[data-testid="mini3d-fallback-link"]');
    await expect(link).toHaveText('Open 3D view');
    await expect(link).toHaveAttribute('href', /\/viewer$/);
    // Editor still fully functional: draw a room with the stub showing.
    await page.getByRole('button', { name: 'Rectangle' }).click();
    await drawRectStroke(page);
    expect(await roomCount(page)).toBe(2);
  });
});
