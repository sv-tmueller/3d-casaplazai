/**
 * E2E for issue #61 (Pkg 3: draggable openings).
 *
 * Screen mapping mirrors e2e/openings-furniture.spec.ts: INITIAL_SCALE=80,
 * camera origin (0,0) at boot, screen coords relative to .editor-canvas.
 *
 * Shared wall x=3.5, y ∈ [-3.5, -0.5] (length 3 m): living's seg 1
 * traverses it UP (y = -3.5 → -0.5), kitchen's seg 3 traverses it DOWN.
 * Door midpoint is y = -2.0 ⇒ t = 0.5 on both faces; dragging to
 * y = -1.5 gives living t ≈ 2/3 and kitchen t ≈ 1/3 (complementary).
 */
import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE as SCALE } from './fixtures/camConstants';

const ROOM_A = {
  id: 'living',
  name: 'Living',
  polygon: [[0.5, -3.5], [3.5, -3.5], [3.5, -0.5], [0.5, -0.5]],
  floorTexture: null,
};
const ROOM_B = {
  id: 'kitchen',
  name: 'Kitchen',
  polygon: [[3.5, -3.5], [6.5, -3.5], [6.5, -0.5], [3.5, -0.5]],
  floorTexture: null,
};

type OpeningRow = { id: string; roomId: string; tCenter: number };

async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

async function loadTwoRooms(page: Page): Promise<void> {
  await page.evaluate((rms) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan({
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: rms,
      openings: [],
      furniture: [],
    });
  }, [ROOM_A, ROOM_B]);
}

async function openings(page: Page): Promise<OpeningRow[]> {
  return page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((window as any).__casaplaza.getData().openings as OpeningRow[]),
  );
}

/** Place a shared-wall door at y=-2.0, then arm the Select tool. */
async function placeDoorAndSelect(page: Page): Promise<void> {
  await loadTwoRooms(page);
  await page.getByRole('button', { name: 'Door' }).click();
  const hit = await aim(page, 3.5, -2.0);
  await page.mouse.click(hit.x, hit.y);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
}

test.describe.serial('draggable openings (issue #61)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();
  });

  test('a plain click still only selects (no drag, no undo step)', async ({
    page,
  }) => {
    await placeDoorAndSelect(page);
    const before = await openings(page);
    expect(before).toHaveLength(2);

    const hit = await aim(page, 3.5, -2.0);
    await page.mouse.click(hit.x, hit.y); // down+up, no travel

    const after = await openings(page);
    expect(after.map((o) => o.tCenter)).toEqual(before.map((o) => o.tCenter));
  });

  test('AC: drag slides the pair along the wall; undo restores it', async ({
    page,
  }) => {
    await placeDoorAndSelect(page);
    const before = await openings(page);
    expect(before).toHaveLength(2);

    // Drag the door from y=-2.0 up to y=-1.5 (0.5 m along the wall).
    const from = await aim(page, 3.5, -2.0);
    const to = await aim(page, 3.5, -1.5);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();

    const moved = await openings(page);
    expect(moved).toHaveLength(2);
    const living = moved.find((o) => o.roomId === 'living')!;
    const kitchen = moved.find((o) => o.roomId === 'kitchen')!;
    // Living traverses UP: y=-1.5 ⇒ t = (3.5-1.5)/3 = 2/3.
    expect(living.tCenter).toBeCloseTo(2 / 3, 3);
    // Kitchen traverses DOWN: complementary t = 1/3 (same physical world point).
    expect(kitchen.tCenter).toBeCloseTo(1 / 3, 3);
    expect(living.tCenter + kitchen.tCenter).toBeCloseTo(1, 3);

    // One Ctrl+Z restores the pair to the pre-drag midpoint.
    await page.locator('.editor-canvas').press('Control+z');
    const restored = await openings(page);
    expect(restored.map((o) => o.tCenter)).toEqual(
      before.map((o) => o.tCenter),
    );
    expect(restored.map((o) => o.tCenter)).toEqual([0.5, 0.5]);
  });
});
