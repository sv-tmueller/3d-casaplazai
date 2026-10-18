/**
 * E2E for issue #53 (Pkg 2: rectangle resize affordance).
 *
 * Covers: selecting a room exposes its 4 resize handles (screen-space seam
 * __editorHandles), the cursor is classified per corner (nwse / nesw / move),
 * and a corner drag snaps to the 0.5 m grid exactly like draw-time.
 *
 * Camera is untouched (origin (0,0), INITIAL_SCALE=80), so world->page is
 * x = box.x + wx*80, y = box.y - wy*80. The room sits in the negative-y
 * (on-screen) quadrant to keep aims off the canvas borders.
 */
import { expect, test, type Page } from '@playwright/test';

const SCALE = 80;

type Pt = [number, number];

const ROOM = {
  id: 'r1',
  name: 'Room',
  // CCW ring: v0 SW, v1 SE, v2 NE, v3 NW (world y up).
  polygon: [[0.5, -3.5], [4.5, -3.5], [4.5, -0.5], [0.5, -0.5]],
  floorTexture: null,
};

const PLAN_TEMPLATE = {
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [] as unknown[],
  openings: [],
  furniture: [],
};

async function aim(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

async function selectRoom(page: Page): Promise<void> {
  const c = await aim(page, 2.5, -2); // interior
  await page.mouse.click(c.x, c.y);
}

async function handles(page: Page): Promise<Pt[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__editorHandles());
}

async function cursor(page: Page): Promise<string> {
  return page.evaluate(
    () => document.querySelector<HTMLElement>('.editor-canvas')!.style.cursor,
  );
}

test.describe.serial('rectangle resize affordance (#53)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();
    await page.evaluate(
      ([tpl, rooms]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__casaplaza.loadPlan({ ...(tpl as object), rooms });
      },
      [PLAN_TEMPLATE, [ROOM]],
    );
  });

  test('selecting a room exposes 4 resize handles', async ({ page }) => {
    expect(await handles(page)).toHaveLength(0); // nothing selected yet
    await selectRoom(page);
    const hs = await handles(page);
    expect(hs).toHaveLength(4);
    // Handle centres match the room's screen-space vertices.
    expect(hs[0][0]).toBeCloseTo(0.5 * SCALE, 0);
    expect(hs[2][1]).toBeCloseTo(0.5 * SCALE, 0);
  });

  test('cursor classifies per corner; body shows move', async ({ page }) => {
    await selectRoom(page);

    const ne = await aim(page, 4.5, -0.5); // screen top-right -> nesw
    await page.mouse.move(ne.x, ne.y);
    expect(await cursor(page)).toBe('nesw-resize');

    const nw = await aim(page, 0.5, -0.5); // screen top-left -> nwse
    await page.mouse.move(nw.x, nw.y);
    expect(await cursor(page)).toBe('nwse-resize');

    const se = await aim(page, 4.5, -3.5); // screen bottom-right -> nwse
    await page.mouse.move(se.x, se.y);
    expect(await cursor(page)).toBe('nwse-resize');

    const body = await aim(page, 2.5, -2); // interior -> move
    await page.mouse.move(body.x, body.y);
    expect(await cursor(page)).toBe('move');
  });

  test('corner drag snaps to the 0.5 m grid and changes the room dims', async ({ page }) => {
    await selectRoom(page);

    // Grab INSIDE the handle (boundary points fail roomAt); ~0.11 m from
    // v1 is within the 12 px / 80 = 0.15 m handle tolerance.
    const from = await aim(page, 4.42, -3.42);
    const to = await aim(page, 4.8, -3.3); // off-grid target...
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();

    const poly = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plan = (window as any).__casaplaza.getData();
      return plan.rooms[0].polygon as number[][];
    });
    // ...snapped to (5, -3.5): grid fallback applied during resize.
    expect(poly[1][0]).toBeCloseTo(5, 5);
    expect(poly[1][1]).toBeCloseTo(-3.5, 5);
    // Width grew 4.0 -> 4.5 m.
    const maxX = Math.max(...poly.map((p) => p[0]));
    expect(maxX - 0.5).toBeCloseTo(4.5, 5);
    // Only v1 moved: the other corners are pinned (this is a resize, not a
    // whole-room translate).
    expect(poly[0]).toEqual([0.5, -3.5]);
    expect(poly[2]).toEqual([4.5, -0.5]);
    expect(poly[3]).toEqual([0.5, -0.5]);

    // The whole drag is ONE undo step; Ctrl+Z restores the pre-drag vertex.
    await page.locator('.editor-canvas').press('Control+z');
    const restored = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plan = (window as any).__casaplaza.getData();
      return plan.rooms[0].polygon as number[][];
    });
    expect(restored[1][0]).toBeCloseTo(4.5, 5);
    expect(restored[1][1]).toBeCloseTo(-3.5, 5);
  });
});
