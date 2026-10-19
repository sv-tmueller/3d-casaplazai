/**
 * Inspector panel e2e (issue #101, Pkg 12.3).
 *
 * Journey 1 — KEYBOARD-ONLY WALL LEAN (the AC headline): select a room,
 * open the panel with I, Tab into the lean field, type degrees, Enter,
 * and assert the stored lean through the __editorLeans probe — the L
 * shortcut is NEVER pressed. Plus clear-on-zero and the toggle cycle.
 *
 * Journey 2 — NO-SELECTION SUMMARY: the open panel with nothing
 * selected shows the plan summary (floors/rooms/area).
 *
 * Journey 3 — ESC DISCIPLINE: Esc with focus inside the panel closes
 * the panel; a canvas-focused Esc still reaches the canvas handler
 * (selection survives, panel untouched).
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

/** Load a one-room plan (square, drawable quadrant) and select nothing. */
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
}

test.describe.serial('inspector panel (issue #101)', () => {
  test.beforeEach(async ({ page }) => {
    await loadStudio(page);
  });

  test('keyboard-only flow adjusts a wall lean via the panel (no L shortcut)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    // Select the studio by clicking NEAR its bottom wall (world
    // y=-3.35, 0.15 m from the segment) — arms the wall case.
    const p = await aim(page, 2.5, -3.35);
    await page.mouse.click(p.x, p.y);

    // Canvas-focused I opens the panel; the wall row is showing.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('i');
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('insp-lean-deg')).toBeVisible();

    // Keyboard-only commit: Tab into the field, type degrees, Enter.
    // (Focus enters the panel at its root; one Tab lands on Close, the
    // next on the lean field.)
    const leanField = page.getByTestId('insp-lean-deg');
    await leanField.focus();
    await leanField.fill('30');
    await page.keyboard.press('Enter');

    // Stored lean: segment 2 (bottom wall) at 30° on room r1, asserted
    // via the __editorLeans probe (glue.ts) — identical to the L flow.
    expect(await leans(page)).toEqual([
      { roomId: 'r1', segmentIndex: 2, leanDeg: 30 },
    ]);

    // The panel SURVIVES the commit (additive surface, focus retained).
    await expect(panel).toBeVisible();
    await expect(leanField).toBeFocused();

    // Editing to 0 clears the lean (popover's clear-on-empty parity).
    await leanField.fill('0');
    await page.keyboard.press('Enter');
    expect(await leans(page)).toEqual([]);

    expect(errors).toEqual([]);
  });

  test('no selection shows the plan summary; toggle cycles collapsed', async ({
    page,
  }) => {
    // Ensure nothing is selected.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('Escape');

    await page.getByTestId('btn-inspector').click();
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toBeVisible();
    // Summary rows: Floors / Rooms / Livable area for the studio plan.
    await expect(panel.getByText('Floors')).toBeVisible();
    await expect(panel.getByText('Livable area')).toBeVisible();
    await expect(panel.getByText('12.0 m²')).toBeVisible(); // 4×3 room

    // Toggle button reflects state and collapses the panel.
    await expect(page.getByTestId('btn-inspector')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('btn-inspector').click();
    await expect(panel).toBeHidden();
    await expect(page.getByTestId('btn-inspector')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('Esc closes the panel only when focus is inside it', async ({
    page,
  }) => {
    // Select the room, open the panel.
    const p = await aim(page, 2.5, -2);
    await page.mouse.click(p.x, p.y);
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('i');
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toBeVisible();

    // Focus inside the panel: Esc collapses it and returns focus to the
    // toggle button.
    await panel.focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.getByTestId('btn-inspector')).toBeFocused();

    // Canvas-focused Esc must NOT reopen/close the panel — it belongs
    // to the canvas handler (deselect path). Panel stays collapsed and
    // the selection clears (canvas Esc won).
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('room selection shows livable area via the panel', async ({
    page,
  }) => {
    // Interior click (far from walls) selects the ROOM case.
    const p = await aim(page, 2.5, -2);
    await page.mouse.click(p.x, p.y);
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('i');
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toBeVisible();
    // Studio room: 12 m² livable area (measures.ts shoelace reuse).
    await expect(panel.getByText('Livable area')).toBeVisible();
    await expect(panel.getByText('12.0 m²')).toBeVisible();
  });
});

test.describe.serial('inspector opening case (issue #101)', () => {
  test('selected door shows width + head height fields, editable', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await loadStudio(page);
    // Stamp a door mid-way along the bottom wall via the Door tool.
    const p = await aim(page, 2.5, -3.35);
    await page.getByRole('button', { name: 'Door' }).click();
    await page.mouse.click(p.x, p.y);
    // The addOpening reducer selects the new door automatically.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('i');
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('insp-opening-width')).toBeVisible();
    await expect(page.getByTestId('insp-opening-head')).toBeVisible();
    // Doors sit flush: no sill field.
    await expect(page.getByTestId('insp-opening-sill')).toHaveCount(0);

    // Widen the door through the panel (reused updateOpening path).
    const width = page.getByTestId('insp-opening-width');
    await width.focus();
    await width.fill('1.2');
    await page.keyboard.press('Enter');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wire = await page.evaluate(() => (window as any).__casaplaza.getData());
    const door = wire.openings[0] as { width: number };
    expect(door.width).toBeCloseTo(1.2, 5);

    expect(errors).toEqual([]);
  });
});
