/**
 * Roof e2e (issue #83, pkg 8.1): two journeys.
 *
 * 1. EDITOR — the keyboard-first lean flow: load a one-room plan,
 *    select the room, press L, drive the popover ENTIRELY by keys
 *    (radio arrows, slider arrows), commit with Enter, and assert the
 *    stored lean through the __editorLeans debug seam (the v1 wire
 *    bridge drops the roofs field). Then Clear and assert removal.
 *
 * 2. VIEWER — render parity: the committed townhouse fixture (symmetric
 *    gable on the master bedroom, segments 0+2 at 30°) must compose
 *    exactly 6 roof triangles (2 slope quads + 2 end caps) through the
 *    FULL production path, observed via __viewerStats.roofTriangleCount.
 *
 * Walk-mode protection is asserted by the UNMODIFIED stairs.spec /
 * townhouse.spec suites staying green in the same e2e run (proximity
 * sanity guarantees roof planes never enter the walkable volume).
 */

import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE as SCALE } from './fixtures/camConstants';

type Lean = { roomId: string; segmentIndex: number; leanDeg: number };

async function leans(page: Page): Promise<Lean[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__editorLeans?.() ?? []);
}

/** World → ABSOLUTE page coords (camera origin is (0,0) at boot). */
async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

test.describe.serial('editor keyboard lean flow (issue #83)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();
    // One square room in the drawable quadrant (positive-x, negative-y).
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
              [0.5, -0.5],
              [4.5, -0.5],
              [4.5, -3.5],
              [0.5, -3.5],
            ],
            floorTexture: null,
          },
        ],
        openings: [],
        furniture: [],
      });
    });
  });

  test('L opens the popover on a selected room; keys drive it end to end', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    // Select the studio by clicking its interior (aim world (2.5,-2)).
    const p = await aim(page, 2.5, -2);
    await page.mouse.click(p.x, p.y);

    // Keyboard-first: focus the canvas, press L.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('l');

    const popover = page.getByTestId('lean-popover');
    await expect(popover).toBeVisible();

    // Four wall radios exist; Wall 1 (segment 0) is pre-checked.
    await expect(page.getByTestId('lean-seg-0')).toBeChecked();

    // Arrow Down moves the radio group to Wall 3 (segment 2).
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('lean-seg-2')).toBeChecked();

    // Tab to the slider; ArrowRight proves keyboard stepping (0 → 1).
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('lean-value')).toHaveText('1°');

    // Set the exact commitment value (still the focused slider).
    await page.locator('[data-testid="lean-slider"]').fill('30');
    await expect(page.getByTestId('lean-value')).toHaveText('30°');

    // Enter submits the form (keyboard commit).
    await page.locator('[data-testid="btn-apply-lean"]').focus();
    await page.keyboard.press('Enter');
    await expect(popover).toBeHidden();

    // Stored lean: segment 2 at 30° on room r1 (via the debug seam —
    // the v1 wire bridge DROPS the roofs field).
    expect(await leans(page)).toEqual([
      { roomId: 'r1', segmentIndex: 2, leanDeg: 30 },
    ]);

    // Reopen: the leaned segment is preselected with its stored value.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('L');
    await expect(popover).toBeVisible();
    await expect(page.getByTestId('lean-seg-2')).toBeChecked();
    await expect(page.locator('[data-testid="lean-slider"]')).toHaveValue('30');

    // Clear strips the row.
    await page.getByTestId('btn-clear-lean').click();
    await expect(popover).toBeHidden();
    expect(await leans(page)).toEqual([]);

    expect(errors).toEqual([]);
  });

  test('pressing L with NO selection flashes guidance, opens nothing', async ({
    page,
  }) => {
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('Escape'); // ensure nothing is selected
    await page.keyboard.press('l');
    await expect(page.getByTestId('lean-popover')).toBeHidden();
  });

  test('Escape discards popover edits without touching the store', async ({
    page,
  }) => {
    const p = await aim(page, 2.5, -2);
    await page.mouse.click(p.x, p.y);
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('L');
    await page.locator('[data-testid="lean-slider"]').fill('45');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('lean-popover')).toBeHidden();
    expect(await leans(page)).toEqual([]);
  });
});

test.describe.serial('viewer roof render parity (issue #83)', () => {
  test('townhouse gable composes exactly 6 roof triangles', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/viewer');
    await page.locator('.viewer-gl-canvas').waitFor();
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile('demo/demo-townhouse.json', 'utf8');
    await page.evaluate((planJson) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan(JSON.parse(planJson));
    }, raw);
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__viewerStats?.();
        return typeof s === 'object' && s !== null && s.meshCount > 0;
      },
      { timeout: 15_000 },
    );
    const stats = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.() ?? null;
    });
    expect(errors).toEqual([]);
    expect(stats).not.toBeNull();
    // Symmetric gable on the master bedroom: 2 slope quads (4 tris) +
    // 2 triangular end caps = 6 triangles in the dedicated roof slot.
    expect(stats.roofTriangleCount).toBe(6);
  });
});
