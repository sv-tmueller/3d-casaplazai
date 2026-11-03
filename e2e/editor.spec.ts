/**
 * Plan view core (issue #2 editor ACs and #46 navigation, on the
 * workspace since #178). The tool card floats over the canvas' left
 * edge, so plans are drawn and seeded right of it and every aim reads
 * the live camera. Zoom and Fit live in the View tab (gap G10); Delete
 * lives in the inspector.
 */
import { expect, test, type Page } from '@playwright/test';
import { BTN_ZOOM, CAM_SCALE, FIT_MARGIN } from './fixtures/camConstants';
import {
  CANVAS,
  TOOLCARD_INSET,
  type Cam,
  aim,
  canvasKey,
  command,
  drawRect,
  getCam,
  openWorkspace,
  seedPlan,
  toasts,
} from './fixtures/workspace';

type Plan = { rooms: Array<{ id: string; name: string; polygon: number[][] }> };

const getPlan = (page: Page): Promise<Plan> =>
  page.evaluate(() => (window as unknown as { __casaplaza: { getData(): Plan } }).__casaplaza.getData());

// ROOM_STROKE is #2563eb = rgb(37,99,235) in src/editor/render.ts. These
// thresholds admit it and reject the pale room fill (r≈221): the stroke's
// blue (235) dominates, its red (37) stays low.
const STROKE_MIN_BLUE = 170;
const STROKE_MAX_RED = 160;
const STROKE_MAX_GREEN = 200;

/**
 * Count projected room corners whose canvas pixels carry the room stroke,
 * projected through the live camera. Reads the 2D canvas' own backing
 * store, so the floating tool card over its left edge does not interfere.
 */
async function strokeHits(page: Page, cam: Cam, corners: number[][]): Promise<number> {
  return page.evaluate(
    ({ c, pts, minB, maxR, maxG }) => {
      const cv = document.querySelector('.editor-canvas') as HTMLCanvasElement;
      const ctx = cv.getContext('2d')!;
      const dpr = cv.width / cv.getBoundingClientRect().width;
      const rad = 3;
      let hits = 0;
      for (const [wx, wy] of pts) {
        const sx = Math.round((wx - c.originX) * c.scale * dpr);
        const sy = Math.round((c.originY - wy) * c.scale * dpr);
        const img = ctx.getImageData(sx - rad, sy - rad, rad * 2 + 1, rad * 2 + 1).data;
        for (let i = 0; i < img.length; i += 4) {
          if (img[i + 2] > minB && img[i] < maxR && img[i + 1] < maxG) {
            hits += 1;
            break;
          }
        }
      }
      return hits;
    },
    { c: cam, pts: corners, minB: STROKE_MIN_BLUE, maxR: STROKE_MAX_RED, maxG: STROKE_MAX_GREEN },
  );
}

const room = (id: string, polygon: number[][]) => ({ id, name: id, polygon, floorTexture: null, wallsOverride: [] });
const plan = (rooms: unknown[]) => ({ schemaVersion: 1, units: 'meters', wallHeight: 2.7, wallThickness: 0.24, rooms, openings: [], furniture: [] });

test.describe('plan view core', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page);
  });

  test('AC1: draw a 3-room apartment with snapped shared walls (mouse only)', async ({ page }) => {
    await command(page, 'tool.rectangle').click();
    await drawRect(page, 5, -1, 8, -4);
    await drawRect(page, 8, -1, 11, -4);
    await drawRect(page, 5, -4, 8, -7);
    const { rooms } = await getPlan(page);
    expect(rooms).toHaveLength(3);
    const key = ([x, y]: number[]): string => `${x},${y}`;
    const a = new Set(rooms[0].polygon.map(key));
    expect(rooms[1].polygon.some((p) => a.has(key(p)))).toBe(true);
    expect(rooms[2].polygon.some((p) => a.has(key(p)))).toBe(true);
  });

  test('AC2: the overlap flag warns on overlap and hides for shared walls', async ({ page }) => {
    await seedPlan(page, plan([room('r1', [[5, -3], [8, -3], [8, 0], [5, 0]]), room('r2', [[8, -3], [11, -3], [11, 0], [8, 0]])]));
    await expect(page.getByTestId('ws-overlap')).toBeHidden();
    await seedPlan(page, plan([room('r1', [[5, -3], [8, -3], [8, 0], [5, 0]]), room('r2', [[6.5, -3], [9.5, -3], [9.5, 0], [6.5, 0]])]));
    await expect(page.getByTestId('ws-overlap')).toBeVisible();
  });

  test('AC3: undo/redo round trip, the unsaved dot clears, reload restores', async ({ page }) => {
    await command(page, 'tool.rectangle').click();
    await drawRect(page, 5, -1, 8, -4);
    expect((await getPlan(page)).rooms).toHaveLength(1);
    await page.getByTestId('ws-undo').click();
    expect((await getPlan(page)).rooms).toHaveLength(0);
    await page.getByTestId('ws-redo').click();
    expect((await getPlan(page)).rooms).toHaveLength(1);
    // G8: the dot shows while unsaved and clears once autosave lands.
    await expect(page.getByTestId('ws-unsaved')).toBeHidden({ timeout: 5_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('casaplaza.autosave.v1') ?? '{}'));
    expect(saved.floors?.[0]?.rooms?.length).toBe(1);
    await page.reload();
    await page.locator(CANVAS).waitFor();
    expect((await getPlan(page)).rooms).toHaveLength(1);
  });

  test('AC4: closing a 2-point polygon is refused with a notice', async ({ page }) => {
    await command(page, 'tool.polygon').click();
    const p1 = await aim(page, 5, -3);
    const p2 = await aim(page, 8, -3);
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.click(p2.x, p2.y);
    await canvasKey(page, 'Enter');
    await expect.poll(() => toasts(page)).toContainEqual(expect.stringContaining('at least 3'));
    expect((await getPlan(page)).rooms).toHaveLength(0);
  });

  test('AC5: select, move and delete a room (Delete lives in the inspector)', async ({ page }) => {
    await seedPlan(page, plan([room('r1', [[5, -3], [8, -3], [8, 0], [5, 0]])]));
    const centre = await aim(page, 6.5, -1.5);
    await page.mouse.click(centre.x, centre.y);
    await expect(page.getByTestId('ws-inspector')).toBeVisible();
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + CAM_SCALE, centre.y, { steps: 4 });
    await page.mouse.up();
    expect((await getPlan(page)).rooms[0].polygon.every(([x]) => x >= 5.999)).toBe(true);
    await page.getByTestId('ws-inspector-delete').click();
    expect((await getPlan(page)).rooms).toHaveLength(0);
    await expect(page.getByTestId('ws-inspector')).toBeHidden();
  });
});

test.describe('navigation controls (#46, View tab)', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page);
    await page.getByTestId('ws-tab-view').click();
  });

  test('AC1: Fit refits a perturbed camera to the plan, clear of the tool card', async ({ page }) => {
    const poly = [[1, -3], [5, -3], [5, -1], [1, -1]];
    await seedPlan(page, plan([room('r1', poly)]));
    const box = (await page.locator(CANVAS).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    expect((await getCam(page)).scale).not.toBe(CAM_SCALE);
    await page.getByTestId('ws-fit').click();
    const cam = await getCam(page);
    const freeW = box.width - TOOLCARD_INSET;
    const scale = Math.min(freeW / 4, box.height / 2) * (1 - FIT_MARGIN);
    expect(cam.scale).toBeCloseTo(scale, 6);
    // The plan centre sits in the middle of the free region.
    expect((3 - cam.originX) * cam.scale).toBeCloseTo(TOOLCARD_INSET + freeW / 2, 4);
    expect((cam.originY - -2) * cam.scale).toBeCloseTo(box.height / 2, 4);
    // The fitted plan is really painted where the camera says: the room
    // stroke sits under at least 3 of the 4 projected corners.
    expect(await strokeHits(page, cam, poly)).toBeGreaterThanOrEqual(3);
    // Clicking the framed room selects it (it is really under the cursor;
    // Select is still the armed tool).
    const inside = await aim(page, 3, -2);
    await page.mouse.click(inside.x, inside.y);
    await expect(page.getByTestId('ws-inspector-title')).toHaveText('r1');
  });

  test('AC2: Zoom in ×3 composes to the button step; the status zoom follows', async ({ page }) => {
    await seedPlan(page, plan([room('r1', [[5, -3], [8, -3], [8, 0], [5, 0]])]));
    const before = await getCam(page);
    for (let i = 0; i < 3; i += 1) await page.getByTestId('ws-zoom-in').click();
    const after = await getCam(page);
    expect(after.scale / before.scale).toBeCloseTo(BTN_ZOOM ** 3, 6);
    await expect(page.getByTestId('ws-status-zoom')).toHaveText(`${Math.round(BTN_ZOOM ** 3 * 100)} %`);
    await page.getByTestId('ws-zoom-out').click();
    expect((await getCam(page)).scale / before.scale).toBeCloseTo(BTN_ZOOM ** 2, 6);
  });

  test('AC3: Fit on an empty plan yields the finite neutral camera', async ({ page }) => {
    await page.getByTestId('ws-fit').click();
    expect(await getCam(page)).toEqual({ originX: 0, originY: 0, scale: CAM_SCALE });
  });
});
