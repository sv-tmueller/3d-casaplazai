/**
 * Issue #100 (Pkg 12.2) — TYPE-IN DIMENSIONS e2e (ADDITIVE).
 *
 * Journeys (SUB_PLAN checkpoint 6):
 * (a) THREE consecutive walls drawn purely by typing (keyboard-only
 *     after the single anchoring click).
 * (b) Invalid input rejected + store unchanged (inspector wall case).
 * (c) Snaps honored on NON-typed segments (pointer-clicked points
 *     snap; typed points land verbatim).
 * (d) Pill == typed-value consistency (mid-draw field agrees with the
 *     live angle pill under the unified compass convention).
 * Plus: inspector wall reshape via resizeRoom (side-effect disclosed),
 * and Esc clearing the pending cursor while keeping the chain alive.
 */

import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE as SCALE } from './fixtures/camConstants';

/** World → ABSOLUTE page coords (camera origin (0,0) at boot). */
async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

interface WireRoom {
  id: string;
  polygon: Array<[number, number]>;
}

async function rooms(page: Page): Promise<WireRoom[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__casaplaza.getData().rooms);
}

test.describe.serial('type-in dims: mid-draw (issue #100)', () => {
  test('(a)+(d) three walls typed keyboard-only; pill matches typed value', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();

    // Anchor the chain with ONE click at world (1,-1) — snapped to the
    // 0.5 m grid (already on-grid). The click keeps CANVAS focus (the
    // widget is one Tab away — pointer-initiated mounts never steal
    // focus, preserving the canvas shortcut discipline mid-draw).
    await page.getByRole('button', { name: 'Polygon' }).click();
    const p0 = await aim(page, 1, -1);
    await page.mouse.click(p0.x, p0.y);

    // The floating pair is mounted; Tab hands it the focus.
    const len = page.getByTestId('draw-dims-length');
    const ang = page.getByTestId('draw-dims-angle');
    await expect(len).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(len).toBeFocused();

    // Wall 1: 3 m due EAST (compass 90°). Fields seed EMPTY (degenerate
    // pending segment) — typing starts from scratch.
    await expect(len).toHaveValue('');
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
    await expect(ang).toBeFocused();
    await page.keyboard.type('90');

    // (d) pill == typed value: the live angle pill reads the compass
    // bearing of the pending segment — 90.0° under Interpretation A
    // (the as-you-type ghost moved the cursor to the typed polar
    // point, and the pill derives from the SAME shared helper).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pills = await page.evaluate(() => (window as any).__editorAnglePills());
    expect(pills).toEqual(['90.0\u00B0']);
    await page.keyboard.press('Enter');

    // Chain stayed alive: fields REMOUNTED (still visible, focused
    // back on length, seeded EMPTY for the next pending segment).
    await expect(len).toBeVisible();
    await expect(len).toBeFocused();
    await expect(len).toHaveValue('');

    // Wall 2: 2 m due SOUTH (compass 180°).
    await page.keyboard.type('2');
    await page.keyboard.press('Tab');
    await page.keyboard.type('180');
    await page.keyboard.press('Enter');

    // Wall 3: 2.5 m due WEST (compass 270°).
    await page.keyboard.type('2.5');
    await page.keyboard.press('Tab');
    await page.keyboard.type('270');
    await page.keyboard.press('Enter');

    // Three typed points committed; close the polygon with Enter
    // (canvas handler — focus is in the FIELD, so the field's Enter
    // must NOT have stolen this one... it commits the pair instead.
    // Blur the fields first so the CANVAS Enter closes the chain.)
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('Enter');

    const rs = await rooms(page);
    expect(rs).toHaveLength(1);
    const poly = rs[0].polygon;
    // Anchor + 3 typed points = 4 committed vertices (drawRoom stores
    // the polygon wound CCW — typed CLOCKWISE input comes back
    // REVERSED, vertex SET identical).
    expect(poly).toHaveLength(4);
    const xs = poly.map((p) => p[0]).sort((a, b) => a - b);
    const ys = poly.map((p) => p[1]).sort((a, b) => a - b);
    // Anchor (1,-1) + typed polar points (4,-1),(4,-3),(1.5,-3):
    expect(xs[0]).toBeCloseTo(1, 5);
    expect(xs[1]).toBeCloseTo(1.5, 5);
    expect(xs[2]).toBeCloseTo(4, 5);
    expect(xs[3]).toBeCloseTo(4, 5);
    expect(ys[0]).toBeCloseTo(-3, 5);
    expect(ys[1]).toBeCloseTo(-3, 5);
    expect(ys[2]).toBeCloseTo(-1, 5);
    expect(ys[3]).toBeCloseTo(-1, 5);
    // The typed lengths survived VERBATIM (float-safe pairwise check):
    const d = (p: [number, number], q: [number, number]): number =>
      Math.hypot(p[0] - q[0], p[1] - q[1]);
    const sides = [0, 1, 2, 3].map((i) => d(poly[i], poly[(i + 1) % 4]));
    const wanted = [3, 2, 2.5, Math.hypot(0.5, 2)].sort((a, b) => a - b);
    expect(sides.sort((a, b) => a - b)[0]).toBeCloseTo(wanted[0], 5);
    expect(sides[1]).toBeCloseTo(wanted[1], 5);
    expect(sides[2]).toBeCloseTo(wanted[2], 5);
    expect(sides[3]).toBeCloseTo(wanted[3], 5);

    expect(errors).toEqual([]);
  });

  test('Esc clears the pending cursor; chain stays alive', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();

    await page.getByRole('button', { name: 'Polygon' }).click();
    const p0 = await aim(page, 1, -1);
    await page.mouse.click(p0.x, p0.y);
    const len = page.getByTestId('draw-dims-length');
    await expect(len).toBeVisible();

    // Type a wall but press Esc BEFORE committing.
    await page.keyboard.press('Tab');
    await expect(len).toBeFocused();
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
    await page.keyboard.type('90');
    await page.keyboard.press('Escape');

    // Fields cleared + chain intact: widget STILL mounted, seeded
    // empty; the anchor survived; nothing committed yet.
    await expect(len).toBeVisible();
    await expect(len).toHaveValue('');
    await expect(len).toBeFocused();

    // The chain still commits afterwards (alive, not stranded).
    await page.keyboard.type('2');
    await page.keyboard.press('Tab');
    await page.keyboard.type('0');
    await page.keyboard.press('Enter');
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('Escape'); // cancel the gesture cleanly

    const rs = await rooms(page);
    expect(rs).toHaveLength(0); // cancelled before closePolygon
    expect(errors).toEqual([]);
  });

  test('(c) snaps honored on non-typed segments; typed lands verbatim', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();

    await page.getByRole('button', { name: 'Polygon' }).click();
    // Anchor at a GRID-adjacent spot: (1.03,-1) snaps to (1,-1).
    const p0 = await aim(page, 1.03, -1);
    await page.mouse.click(p0.x, p0.y);
    const len = page.getByTestId('draw-dims-length');
    await expect(len).toBeVisible();

    // Pointer-clicked second point ALSO snaps: aim (2.97,-1) → grid
    // (3,-1). Snap stays engaged on non-typed commits.
    const p1 = await aim(page, 2.97, -1);
    await page.mouse.click(p1.x, p1.y);
    // Deterministic handoff: the remounted widget is one Tab away
    // (pointer-initiated mounts preserve canvas focus).
    await expect(len).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(len).toBeFocused();

    // Then a TYPED wall: 1.23 m at compass 135° (southeast) — lands
    // VERBATIM (1.23 is NOT on the 0.5 m grid; typed overrides snap),
    // and the diagonal keeps the triangle non-degenerate.
    await page.keyboard.type('1.23');
    await page.keyboard.press('Tab');
    await page.keyboard.type('135');
    await page.keyboard.press('Enter');

    // Three points committed (anchor + click + typed) — close.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('Enter'); // closePolygon

    const rs = await rooms(page);
    expect(rs).toHaveLength(1);
    // drawRoom normalizes winding — compare the vertex SET (sorted),
    // not the stored order.
    const poly = (rs[0].polygon as Array<[number, number]>)
      .slice()
      .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    expect(poly[0][0]).toBeCloseTo(1, 5); // snapped anchor (1,-1)
    expect(poly[0][1]).toBeCloseTo(-1, 5);
    expect(poly[1][0]).toBeCloseTo(3, 5); // snapped pointer click (3,-1)
    expect(poly[1][1]).toBeCloseTo(-1, 5);
    // typed, VERBATIM: (3,-1) ⊕ 1.23 m @ 135° (sin/cos of 135°).
    expect(poly[2][0]).toBeCloseTo(3 + 1.23 * Math.SQRT1_2, 5);
    expect(poly[2][1]).toBeCloseTo(-1 - 1.23 * Math.SQRT1_2, 5);

    expect(errors).toEqual([]);
  });
});

test.describe.serial('type-in dims: inspector wall case (issue #100)', () => {
  /** Load the one-room studio and arm the WALL case on segment 0. */
  async function armStudioWall(page: Page): Promise<void> {
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
    // Near-wall interior click upgrades to the WALL case.
    const p = await aim(page, 2.5, -0.65);
    await page.mouse.click(p.x, p.y);
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('i');
    await expect(page.getByTestId('inspector-panel')).toBeVisible();
  }

  test('editable pair reshapes the wall via resizeRoom', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await armStudioWall(page);
    const len = page.getByTestId('insp-wall-length');
    const ang = page.getByTestId('insp-wall-angle');
    await expect(len).toBeVisible();
    // Seeded from the wall's current metrics: 4 m at compass 90°.
    await expect(len).toHaveValue('4');
    await expect(ang).toHaveValue('90');

    // Reshape: 5 m at 90° — vertex 1 moves east by 1 m.
    await len.focus();
    await len.fill('5');
    await page.keyboard.press('Enter');

    const rs = await rooms(page);
    const poly = rs[0].polygon;
    expect(poly[1][0]).toBeCloseTo(5.5, 5);
    expect(poly[1][1]).toBeCloseTo(-0.5, 5);
    // Vertex 0 anchored, vertex 2 untouched (this commit only moved
    // the shared vertex 1).
    expect(poly[0]).toEqual([0.5, -0.5]);

    expect(errors).toEqual([]);
  });

  test('(b) invalid input rejected; store unchanged', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await armStudioWall(page);
    const len = page.getByTestId('insp-wall-length');
    await expect(len).toBeVisible();
    await len.focus();

    const before = JSON.stringify(await rooms(page));

    // Garbage length: rejected with a flash, store untouched.
    await len.fill('0');
    await page.keyboard.press('Enter');
    expect(JSON.stringify(await rooms(page))).toBe(before);

    await len.fill('-2');
    await page.keyboard.press('Enter');
    expect(JSON.stringify(await rooms(page))).toBe(before);

    // Non-numeric text: number inputs reject glyphs at the DOM level —
    // type it keystroke-fashion so the field ends up holding junk
    // Playwright's fill refuses to impose on type=number.
    await len.focus();
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    expect(JSON.stringify(await rooms(page))).toBe(before);

    // The flash banner explained the rejection.
    await expect(page.locator('.inline-msg')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('typing in the panel never deletes the selection (Backspace guard)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await armStudioWall(page);
    const len = page.getByTestId('insp-wall-length');
    await expect(len).toBeVisible();
    await len.focus();

    // Backspaces while editing the field: selection survives.
    await len.fill('3.5');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    await expect(page.getByTestId('insp-wall-length')).toBeVisible();
    await expect(page.getByTestId('inspector-panel')).toBeVisible();
    const rs = await rooms(page);
    expect(rs).toHaveLength(1); // studio still there

    expect(errors).toEqual([]);
  });
});
