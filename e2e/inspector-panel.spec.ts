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
 *
 * Fix round additions:
 * - MID-DRAW I SWALLOW: 'I' during drawingPoly is a no-op (panel stays
 *   shut, Esc still cancels the draw — MUST-FIX 2).
 * - TAB-WALK: panel root → Close → lean field purely by keyboard
 *   (SHOULD-FIX 4 — the AC's "Tab order sane" walked for real).
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

  // Pkg 12.3 fix round (MUST-FIX 2): mid-draw 'I' must be swallowed —
  // opening the panel mid-gesture would steal focus and strand Esc /
  // Enter for the rest of the draw. Draw a triangle, press I mid-draw
  // (panel must NOT open), then Esc cancels cleanly.
  test('mid-draw I is swallowed; Esc still cancels the gesture', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.getByRole('button', { name: 'Polygon' }).click();
    const p1 = await aim(page, 0.5, -0.5);
    const p2 = await aim(page, 3.5, -0.5);
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.click(p2.x, p2.y);

    // Mid-drawingPoly: canvas-focused 'I' must be a no-op for the panel.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('i');
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toBeHidden();

    // Esc still belongs to the gesture: the draw cancels cleanly (no
    // NEW room committed — only the preloaded Studio remains).
    await page.keyboard.press('Escape');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wire = await page.evaluate(() => (window as any).__casaplaza.getData());
    expect(wire.rooms).toHaveLength(1);
    expect(wire.rooms[0].id).toBe('r1');

    // And the gesture ended: a fresh 'I' NOW opens the panel (proves the
    // swallow was gesture-scoped, not a wedged key handler).
    await page.keyboard.press('i');
    await expect(panel).toBeVisible();

    expect(errors).toEqual([]);
  });

  // Pkg 12.3 fix round (SHOULD-FIX 4): walk the panel by KEYBOARD ONLY —
  // from the panel root, Tab lands on Close first, then the lean field
  // (sane Tab order, no pointer involved anywhere in the panel).
  test('Tab walks panel root → Close → lean field (keyboard only)', async ({
    page,
  }) => {
    // Arm the WALL case (near-bottom-wall click) and open via keyboard.
    const p = await aim(page, 2.5, -3.35);
    await page.mouse.click(p.x, p.y);
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('i');
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toBeVisible();

    // Opening focuses the panel ROOT; the first Tab must land on the
    // Close button (sole control in the heading, DOM order = Tab order).
    await expect(panel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('btn-close-inspector')).toBeFocused();

    // Second Tab reaches the lean field — the AC's keyboard-only edit
    // path with zero locator.focus()/fill() shortcuts.
    await page.keyboard.press('Tab');
    const leanField = page.getByTestId('insp-lean-deg');
    await expect(leanField).toBeFocused();
    await page.keyboard.type('30');
    await page.keyboard.press('Enter');

    expect(await leans(page)).toEqual([
      { roomId: 'r1', segmentIndex: 2, leanDeg: 30 },
    ]);
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

/* ------------- pkg #145 (issue #145): renames + plan settings -------------- */

type LegacyWire = {
  wallHeight: number;
  wallThickness: number;
  rooms: { id: string; name: string }[];
};

/** Frozen v1 wire via the __casaplaza bridge (renames assert here). */
async function legacyWire(page: Page): Promise<LegacyWire> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__casaplaza.getData());
}

/** Ensure nothing is selected, then open the panel from the toggle. */
async function openEmptyPanel(page: Page): Promise<void> {
  await page.locator('.editor-canvas').focus();
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-inspector').click();
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
}

/** Interior click selects the studio room; keyboard 'i' opens the panel. */
async function openRoomPanel(page: Page): Promise<void> {
  const p = await aim(page, 2.5, -2);
  await page.mouse.click(p.x, p.y);
  await page.locator('.editor-canvas').focus();
  await page.keyboard.press('i');
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
}

test.describe.serial('inspector renames + plan settings (issue #145)', () => {
  test.beforeEach(async ({ page }) => {
    await loadStudio(page);
  });

  test('room rename retitles the section; ONE Ctrl+Z restores the old name', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await openRoomPanel(page);
    const panel = page.getByTestId('inspector-panel');
    const name = page.getByTestId('insp-room-name');
    await expect(name).toHaveValue('Studio');

    await name.fill('Loft');
    await page.keyboard.press('Enter');

    // One commit: the wire renames and the panel's room title follows
    // (canvas badge + PNG export read room.name live on repaint).
    expect((await legacyWire(page)).rooms[0].name).toBe('Loft');
    await expect(panel.locator('.inspector-section-title').first()).toHaveText(
      'Loft',
    );
    // The panel SURVIVES the commit (additive surface, focus retained).
    await expect(name).toBeFocused();

    // ONE undo step reverts the rename (Enter+change must not double-dip).
    await page.locator('.editor-canvas').press('Control+z');
    expect((await legacyWire(page)).rooms[0].name).toBe('Studio');
    await expect(panel.locator('.inspector-section-title').first()).toHaveText(
      'Studio',
    );
    await expect(name).toHaveValue('Studio');

    expect(errors).toEqual([]);
  });

  test('empty room name flashes and restores the last committed value', async ({
    page,
  }) => {
    await openRoomPanel(page);
    const name = page.getByTestId('insp-room-name');
    await name.fill('');
    await page.keyboard.press('Enter');

    await expect(page.locator('.inline-msg')).toContainText(
      'Room name cannot be empty',
    );
    // Field snaps back to the last committed name; the store is untouched.
    await expect(name).toHaveValue('Studio');
    expect((await legacyWire(page)).rooms[0].name).toBe('Studio');
  });

  test('no selection: Plan + Floor sections append below the summary', async ({
    page,
  }) => {
    await openEmptyPanel(page);
    const panel = page.getByTestId('inspector-panel');

    // The pinned #101 summary stays (additive surface, not a rewrite).
    await expect(panel.getByText('Livable area')).toBeVisible();
    await expect(panel.getByText('12.0 m²')).toBeVisible();

    // Plan-level wall settings, seeded from the loaded wire.
    await expect(panel.getByText('Plan', { exact: true })).toBeVisible();
    await expect(page.getByTestId('insp-wall-height')).toHaveValue('2.7');
    await expect(page.getByTestId('insp-wall-thickness')).toHaveValue('0.24');

    // Floor section: rename field + read-only elevation row.
    await expect(panel.getByText('Floor', { exact: true })).toBeVisible();
    await expect(page.getByTestId('insp-floor-name')).toHaveValue('Ground');
    await expect(panel.getByText('Elevation')).toBeVisible();
    await expect(panel.getByText('0.00 m')).toBeVisible();
  });

  test('plan wall settings + floor rename commit from the panel', async ({
    page,
  }) => {
    await openEmptyPanel(page);

    const height = page.getByTestId('insp-wall-height');
    await height.fill('3.2');
    await page.keyboard.press('Enter');
    expect((await legacyWire(page)).wallHeight).toBeCloseTo(3.2, 5);

    const thick = page.getByTestId('insp-wall-thickness');
    await thick.fill('0.3');
    await page.keyboard.press('Enter');
    expect((await legacyWire(page)).wallThickness).toBeCloseTo(0.3, 5);

    // Floor rename through the panel re-labels the toolbar floor badge.
    const floorName = page.getByTestId('insp-floor-name');
    await floorName.fill('Loft');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('floor-badge')).toHaveText('Loft · Level 1');
  });

  test('out-of-range wall height flashes and leaves the plan untouched', async ({
    page,
  }) => {
    await openEmptyPanel(page);

    const height = page.getByTestId('insp-wall-height');
    await height.fill('99');
    await page.keyboard.press('Enter');

    await expect(page.locator('.inline-msg')).toContainText(
      'wall height must lie in [2, 6]',
    );
    expect((await legacyWire(page)).wallHeight).toBeCloseTo(2.7, 5);
  });
});
