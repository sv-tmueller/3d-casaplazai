/**
 * Full-loop journey (issue #7, on the single workspace since #178): seed a
 * 4-room plan, furnish it through the real tool card, read the golden area
 * total, look at it in 3D, walk it, come back to the Plan view and export
 * a PNG — one page, no route changes.
 */
import { expect, test, type Page } from '@playwright/test';
import { aim, command, fitPlan, seedPlan, switchView, viewerCam, waitForScene, waitForWalker, openWorkspace } from './fixtures/workspace';

const FOUR_ROOMS = {
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [
    { id: 'living', name: 'Living', polygon: [[0.5, -3.5], [3.5, -3.5], [3.5, -0.5], [0.5, -0.5]], floorTexture: 'wood' },
    { id: 'kitchen', name: 'Kitchen', polygon: [[3.5, -3.5], [6.5, -3.5], [6.5, -0.5], [3.5, -0.5]], floorTexture: 'tile' },
    { id: 'study', name: 'Study', polygon: [[0.5, -6.5], [3.5, -6.5], [3.5, -3.5], [0.5, -3.5]], floorTexture: 'carpet' },
    { id: 'den', name: 'Den', polygon: [[3.5, -6.5], [6.5, -6.5], [6.5, -3.5], [3.5, -3.5]], floorTexture: 'concrete' },
  ],
  openings: [],
  furniture: [],
};

type Wire = { rooms: Array<{ polygon: number[][] }>; openings: unknown[]; furniture: Array<{ type: string }> };
const getData = (page: Page): Promise<Wire> =>
  page.evaluate(() => (window as unknown as { __casaplaza: { getData(): Wire } }).__casaplaza.getData());

async function clickWorld(page: Page, wx: number, wy: number): Promise<void> {
  const p = await aim(page, wx, wy);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(120); // hover preview before commit
  await page.mouse.click(p.x, p.y);
}

test('journey: seed → furnish via the tool card → 3D → walk → back to Plan → export PNG', async ({ page }) => {
  test.setTimeout(90_000);
  await openWorkspace(page);

  // 1. Seed through the bridge, then frame it clear of the tool card.
  await seedPlan(page, FOUR_ROOMS);
  await fitPlan(page);

  // 2. A door on the shared wall x = 3.5, through the real tool card.
  await command(page, 'tool.door').click();
  await clickWorld(page, 3.5, -2.0);

  // 3. A sofa, south of the living-room centre (the spawn cell stays free).
  await command(page, 'tool.stamp').click();
  await expect(page.getByTestId('ws-furniture')).toBeVisible();
  await page.getByRole('button', { name: 'Sofa' }).click();
  await clickWorld(page, 2, -1.1);

  const plan = await getData(page);
  expect(plan.openings.length).toBeGreaterThanOrEqual(1);
  expect(plan.furniture).toHaveLength(1);
  expect(plan.furniture[0].type).toBe('sofa');

  // 4. Golden total in the status bar: 4 squares of 9 m².
  await expect(page.getByTestId('ws-status-total')).toContainText('36.0');

  // 5. The same page shows it in 3D, then walks it from the segment.
  await switchView(page, '3d');
  await waitForScene(page);
  await switchView(page, 'walk');
  await waitForWalker(page);
  const cam = (await viewerCam(page))!;
  expect(Math.abs(cam.eyeY - 1.65)).toBeLessThan(0.05);
  const inside = plan.rooms.some(({ polygon }) => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > cam.discY! !== yj > cam.discY! && cam.discX! < ((xj - xi) * (cam.discY! - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  });
  expect(inside, `disc=(${cam.discX},${cam.discY})`).toBe(true);
  await expect(page.getByTestId('ws-walk-pill')).toBeVisible();

  // 6. Back in the Plan view (key 1: the pointer is locked while walking)
  //    and export the plan as a PNG from the top bar.
  await switchView(page, 'plan', 'key');
  await page.getByTestId('ws-export').click();
  await expect(page.getByTestId('ws-export-dialog')).toBeVisible();
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByTestId('ws-export-confirm').click();
  const path = await (await downloadPromise).path();
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8)).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
  expect(bytes.byteLength).toBeGreaterThan(1000);
});
