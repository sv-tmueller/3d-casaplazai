/**
 * E2E for issue #3 (Pkg 2: 2D editor core — draw, select, transform).
 *
 * Transform contract (verified against controller.worldToScreen /
 * screenToWorld and INITIAL_SCALE=80, origin (0,0)):
 *   screen = ((wx - originX) * scale, (originY - wy) * scale)
 * with screen coords RELATIVE TO THE CANVAS ELEMENT. Origin is (0,0) at
 * boot and panning only happens on explicit alt/middle-drag, so these
 * tests never pan/zoom and can aim directly.
 *
 * Rect tool snaps both corners to the 0.5 m grid; all aims below sit on
 * multiples of 0.5 m so snapping is a no-op.
 */
import { expect, test, type Page } from '@playwright/test';

const SCALE = 80; // INITIAL_SCALE in glue.ts

type Plan = {
  rooms: Array<{ id: string; name: string; polygon: number[][] }>;
};

async function getPlan(page: Page): Promise<Plan> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__casaplaza.getData());
}

/** Map world coords to ABSOLUTE page coords (assumes camera origin 0,0). */
async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

async function drawRect(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<void> {
  const a = await aim(page, x1, y1);
  const c = await aim(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.mouse.up();
}

const PLAN_TEMPLATE = {
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [] as unknown[],
  openings: [],
  furniture: [],
};

async function loadPlan(page: Page, rooms: unknown[]): Promise<void> {
  await page.evaluate(
    ([tpl, rms]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan({ ...tpl, rooms: rms });
    },
    [PLAN_TEMPLATE, rooms],
  );
}

test.describe.serial('editor core', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();
  });

  test('AC1: draw a 3-room apartment with snapped shared walls (mouse only)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Rectangle' }).click();

    // Drawable quadrant: x in [0,+], y in [-,0]; avoid the x/y=0 axes
    // (border rounding makes exact-axis aims unstable).
    // Room A: (0.5,-3.5)-(3.5,-0.5); B shares east wall; C shares north wall.
    await drawRect(page, 0.5, -0.5, 3.5, -3.5);
    await drawRect(page, 3.5, -0.5, 6.5, -3.5);
    await drawRect(page, 0.5, -3.5, 3.5, -6.5);

    const plan = await getPlan(page);
    expect(plan.rooms).toHaveLength(3);

    // Snapping proof: neighbors share identical-coordinate vertices.
    const key = ([x, y]: number[]): string => `${String(x)},${String(y)}`;
    const polys = plan.rooms.map((r) => r.polygon);
    const setA = new Set(polys[0].map(key));
    expect(polys[1].some((p) => setA.has(key(p)))).toBe(true);
    expect(polys[2].some((p) => setA.has(key(p)))).toBe(true);
  });

  test('AC2: overlap badge warns on overlap and hides for mere shared walls', async ({
    page,
  }) => {
    await loadPlan(page, [
      {
        id: 'r1',
        name: 'Left',
        polygon: [[-3, -3], [0, -3], [0, 0], [-3, 0]],
        floorTexture: null,
        wallsOverride: [],
      },
      {
        id: 'r2',
        name: 'Right',
        polygon: [[0, -3], [3, -3], [3, 0], [0, 0]],
        floorTexture: null,
        wallsOverride: [],
      },
    ]);
    await expect(page.locator('.overlap-badge')).toBeHidden();

    // Slide r2 west by 1.5 m -> interiors overlap.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plan = (window as any).__casaplaza.getData();
      plan.rooms[1].polygon = plan.rooms[1].polygon.map(
        ([x, y]: number[]) => [x - 1.5, y],
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan(plan);
    });
    await expect(page.locator('.overlap-badge')).toBeVisible();
  });

  test('AC3: undo/redo roundtrip and reload restores autosaved plan', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Rectangle' }).click();
    await drawRect(page, 0.5, -0.5, 3.5, -3.5);
    expect((await getPlan(page)).rooms).toHaveLength(1);

    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await getPlan(page)).rooms).toHaveLength(0);
    await page.getByRole('button', { name: 'Redo' }).click();
    expect((await getPlan(page)).rooms).toHaveLength(1);

    // Autosave debounce (800 ms) then reload must restore.
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() =>
          localStorage.getItem('casaplaza.autosave.v1'),
        );
        if (raw === null) return 0;
        try {
          return JSON.parse(raw).rooms?.length ?? 0;
        } catch {
          return 0;
        }
      })
      .toBe(1);
    await page.reload();
    expect((await getPlan(page)).rooms).toHaveLength(1);
  });

  test('AC4: closing a 2-point polygon is rejected with an inline message', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Polygon' }).click();
    const p1 = await aim(page, 0.5, -3.5);
    const p2 = await aim(page, 3.5, -3.5);
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.click(p2.x, p2.y);
    // Near-start click would ADD a 3rd point; force close via Enter.
    await page.locator('.editor-canvas').press('Enter');
    await expect(page.locator('.inline-msg')).toContainText('at least 3');
    expect((await getPlan(page)).rooms).toHaveLength(0);
  });

  test('AC5: select, move, delete a room', async ({ page }) => {
    await loadPlan(page, [
      {
        id: 'r1',
        name: 'Solo',
        polygon: [[0, -3], [3, -3], [3, 0], [0, 0]],
        floorTexture: null,
        wallsOverride: [],
      },
    ]);

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const center = await aim(page, 2, -2);
    await page.mouse.click(center.x, center.y);
    expect((await getPlan(page)).rooms).toHaveLength(1);

    // Drag the room 1 m east (1 m = 80 px).
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + SCALE, center.y, { steps: 4 });
    await page.mouse.up();
    const moved = await getPlan(page);
    expect(moved.rooms[0].polygon.every(([x]) => x >= 0.999)).toBe(true);

    await page.getByRole('button', { name: 'Delete Selected' }).click();
    expect((await getPlan(page)).rooms).toHaveLength(0);
  });
});
