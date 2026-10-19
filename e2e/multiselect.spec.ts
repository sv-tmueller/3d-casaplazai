/**
 * E2E for issue #110 (pkg 13.2: multi-select marquee + bulk actions).
 *
 * Screen mapping mirrors e2e/opening-drag.spec.ts: INITIAL_SCALE=80,
 * camera origin (0,0) at boot, screen coords relative to .editor-canvas
 * (world y is NEGATIVE upward in this fixture family).
 *
 * Plan: two rooms side by side (living 0.5..3.5, kitchen 3.5..6.5 on x,
 * y ∈ [-3.5, -0.5]) + two beds stamped inside living. Marquee sweeps
 * empty space ABOVE the rooms (y ∈ (-0.5, 0)), so band membership rides
 * purely on bbox/vertex overlap, never on a click-hit.
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

type FurnRow = { id: string; roomId: string; position: [number, number] };

async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

async function loadPlan(page: Page): Promise<void> {
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

async function furniture(page: Page): Promise<FurnRow[]> {
  return page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((window as any).__casaplaza.getData().furniture as FurnRow[]),
  );
}

async function rooms(page: Page): Promise<Array<{ id: string }>> {
  return page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((window as any).__casaplaza.getData().rooms as Array<{ id: string }>),
  );
}

/**
 * Stamp one bed in living, one in kitchen (real Furnish tool path).
 * Footprint 1.6×2.0 forces one bed per room at these sizes — living's
 * usable x-range for a bed center is only 1.4 m wide.
 */
async function stampTwoBeds(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Furnish' }).click();
  const p1 = await aim(page, 1.5, -2.0);
  await page.mouse.click(p1.x, p1.y);
  const p2 = await aim(page, 5.0, -2.0);
  await page.mouse.click(p2.x, p2.y);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
}

/**
 * Marquee sweep between two WORLD points (must lie on empty space).
 * Steps keep the drag smooth; the band engages past the 3 px threshold.
 */
async function marquee(
  page: Page,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Promise<void> {
  const a = await aim(page, ax, ay);
  const b = await aim(page, bx, by);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test.describe.serial('multi-select marquee (issue #110)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();
    await loadPlan(page);
    await stampTwoBeds(page);
  });

  test('marquee sweeping both rooms selects them; inspector counts', async ({
    page,
  }) => {
    // Band from (0,-0.2) to (7,-3.8): world rect x ∈ [0,7],
    // y ∈ [-3.8,-0.2] — overlaps both rooms' bboxes and both beds'
    // AABBs, so all FOUR entities become members.
    await marquee(page, 0, -0.2, 7, -3.8);

    await page.getByTestId('btn-inspector').click();
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toContainText('Multiple selected');
    await expect(panel).toContainText('Rooms');
    await expect(panel).toContainText('Furniture');
    await expect(panel).toContainText('Total');
    await expect(panel).toContainText('4');
  });

  test('shift-click toggles membership off one bed', async ({ page }) => {
    await marquee(page, 0, -0.2, 7, -3.8);
    // Both beds + both rooms are members. Shift-click one bed to REMOVE it.
    const bed = await furniture(page);
    expect(bed).toHaveLength(2);
    const b1 = await aim(page, bed[0].position[0], bed[0].position[1]);
    await page.keyboard.down('Shift');
    await page.mouse.click(b1.x, b1.y);
    await page.keyboard.up('Shift');

    await page.getByTestId('btn-inspector').click();
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toContainText('Multiple selected');
    // 2 rooms + 1 bed remain.
    await expect(panel).toContainText('3');
  });

  test('bulk move collapses to ONE undo step', async ({ page }) => {
    const before = await furniture(page);
    expect(before).toHaveLength(2);

    await marquee(page, 0, -0.2, 7, -3.8);
    // Grab bed 1 (a member) and drag it 0.5 m LEFT; bed 2 follows by the
    // same delta. Leftward keeps every member inside living (followers
    // move unjudged — the grabbed piece alone is containment-checked).
    const b1 = await aim(page, before[0].position[0], before[0].position[1]);
    const to = await aim(
      page,
      before[0].position[0] - 0.5,
      before[0].position[1],
    );
    await page.mouse.move(b1.x, b1.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();

    const moved = await furniture(page);
    // Both members shifted left by the same (possibly clamped) delta.
    const d0 = before[0].position[0] - moved[0].position[0];
    const d1 = before[1].position[0] - moved[1].position[0];
    expect(d0).toBeGreaterThan(0.1);
    expect(d1).toBeCloseTo(d0, 5);

    // ONE Ctrl+Z rolls the WHOLE bulk move back.
    await page.locator('.editor-canvas').press('Control+z');
    const restored = await furniture(page);
    expect(restored.map((f) => f.position)).toEqual(
      before.map((f) => f.position),
    );
  });

  test('bulk delete removes all members; one undo restores them', async ({
    page,
  }) => {
    const furnBefore = await furniture(page);
    const roomsBefore = await rooms(page);
    expect(furnBefore).toHaveLength(2);
    expect(roomsBefore).toHaveLength(2);

    await marquee(page, 0, -0.2, 7, -3.8);
    await page.locator('.editor-canvas').press('Delete');

    expect(await furniture(page)).toHaveLength(0);
    expect(await rooms(page)).toHaveLength(0);

    await page.locator('.editor-canvas').press('Control+z');
    expect((await furniture(page)).map((f) => f.id).sort()).toEqual(
      furnBefore.map((f) => f.id).sort(),
    );
    expect((await rooms(page)).map((r) => r.id).sort()).toEqual(
      roomsBefore.map((r) => r.id).sort(),
    );
  });

  test('plain empty-space click still deselects (no marquee, no set)', async ({
    page,
  }) => {
    // A plain click on empty space (well under the 3 px threshold).
    // World (0,-0.2) is above the rooms and left of living's west wall.
    const spot = await aim(page, 0, -0.2);
    await page.mouse.click(spot.x, spot.y);
    // Nothing crashed; the plan is untouched.
    expect(await furniture(page)).toHaveLength(2);
    expect(await rooms(page)).toHaveLength(2);
  });

  test('Escape clears an armed multi-set', async ({ page }) => {
    await marquee(page, 0, -0.2, 7, -3.8);
    await page.locator('.editor-canvas').press('Escape');
    // The set is gone: a Delete now does nothing (no single selection
    // was armed by the marquee path).
    await page.locator('.editor-canvas').press('Delete');
    expect(await furniture(page)).toHaveLength(2);
    expect(await rooms(page)).toHaveLength(2);
  });
});
