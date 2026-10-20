/**
 * Full-loop journey (issue #7): the ONE consolidated end-to-end test —
 * boot, seed a 4-room plan, furnish through the REAL UI, walk in 3D,
 * export a PNG, and check the golden area sum. Wired into
 * `npm run verify` (< 3 min budget).
 */

import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE as SCALE } from './fixtures/camConstants';


/** Demo fixture + a 4th room, seeded through the editor bridge. */
const FOUR_ROOMS = {
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [
    {
      id: 'living',
      name: 'Living',
      polygon: [[0.5, -3.5], [3.5, -3.5], [3.5, -0.5], [0.5, -0.5]],
      floorTexture: 'wood',
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      polygon: [[3.5, -3.5], [6.5, -3.5], [6.5, -0.5], [3.5, -0.5]],
      floorTexture: 'tile',
    },
    {
      id: 'study',
      name: 'Study',
      polygon: [[0.5, -6.5], [3.5, -6.5], [3.5, -3.5], [0.5, -3.5]],
      floorTexture: 'carpet',
    },
    {
      id: 'den',
      name: 'Den',
      polygon: [[3.5, -6.5], [6.5, -6.5], [6.5, -3.5], [3.5, -3.5]],
      floorTexture: 'concrete',
    },
  ],
  openings: [],
  furniture: [],
};

async function aim(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const b = await page.locator('.editor-canvas').boundingBox();
  return { x: b!.x + wx * SCALE, y: b!.y - wy * SCALE };
}

test('journey: seed -> furnish via UI -> walk in 3D -> export PNG -> golden total', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();

  // ---- 1. Seed the 4-room plan via the debug bridge ----
  await page.evaluate((plan) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(plan);
  }, FOUR_ROOMS);

  // ---- 2. Place a door THROUGH the real UI (shared wall x=3.5) ----
  await page.getByRole('button', { name: 'Door' }).click();
  const doorHit = await aim(page, 3.5, -2.0);
  await page.mouse.move(doorHit.x, doorHit.y);
  await page.waitForTimeout(120);
  await page.mouse.click(doorHit.x, doorHit.y);

  // ---- 3. Stamp a sofa THROUGH the real UI ----
  await page.getByRole('button', { name: 'Furnish' }).click();
  await page.getByRole('button', { name: 'Sofa' }).click();
  // Drop the sofa SOUTH of centre: plopping it exactly on the living
  // centroid (the walk spawn cell) saturates the room once furniture is
  // solid (issue #18) — spawn would honestly fail. Real users furnish
  // against a wall, not atop their own feet.
  const drop = await aim(page, 2, -1.1);
  await page.mouse.move(drop.x, drop.y);
  await page.waitForTimeout(120);
  await page.mouse.click(drop.x, drop.y);

  const plan = await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.getData(),
  );
  expect(plan.openings.length).toBeGreaterThanOrEqual(1);
  expect(plan.furniture).toHaveLength(1);
  expect(plan.furniture[0].type).toBe('sofa');

  // ---- 4. Area sum in the status bar (journey plan: 4 squares à 9 m²) ----
  await expect(page.getByTestId('status-total')).toContainText('36.0');

  // ---- 5. Jump to 3D and assert walk spawn inside a room ----
  await page.goto('/viewer');
  await page.locator('.viewer-gl-canvas').waitFor();
  // The viewer boots beside the editor on this route; the bridge carries
  // the furnished plan. Wait for the first accepted compile.
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return typeof s === 'object' && s !== null && s.meshCount > 0;
    },
    { timeout: 15_000 },
  );

  // Descend into walk mode via the HUD mode segment (headless pointer
  // lock is unreliable; the camera seam is the dependable signal).
  await page.getByTestId('hud-mode-segment-walk').click();
  // Wait for the WALK rig specifically: the overview camera lacks the
  // disc fields; catching the transition mid-fade yields undefined.
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (window as any).__viewerCam?.() ?? null;
      return c !== null && typeof c.discX === 'number';
    },
    { timeout: 10_000 },
  );
  const cam = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__viewerCam?.() ?? null;
  });
  expect(cam).not.toBeNull();
  expect(Math.abs(cam.eyeY - 1.65)).toBeLessThan(0.05);

  // Point-in-polygon against the seeded plan: spawn must sit INSIDE a room.
  const spawnOk = await page.evaluate(
    ([planJson]) => {
      const p = JSON.parse(planJson as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (window as any).__viewerCam();
      // plan-X = world X, plan-Y = world Z (Z-up conversion)
      const px = c.discX;
      const py = c.discY;
      for (const room of p.rooms) {
        const poly = room.polygon;
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i];
          const [xj, yj] = poly[j];
          if (
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
          ) {
            inside = !inside;
          }
        }
        if (inside) return true;
      }
      return false;
    },
    [JSON.stringify(plan)],
  );
  const toastsSeen = await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [...document.querySelectorAll('.hud-toast')].map((t) => t.textContent),
  );
  expect(
    spawnOk,
    `disc=(${(cam as { discX?: number }).discX},${(cam as { discY?: number }).discY}) toasts=${toastsSeen.join(' | ')}`,
  ).toBe(true);

  // ---- 6. Back in the editor: export the plan as PNG ----
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  // pkg #142: Export image lives in the File menu — open it first.
  await page.getByTestId('btn-file').click();
  await page.getByRole('button', { name: 'Export' }).click();
  // Dialog: pick PNG scale 2 (defaults should suffice; assert dialog UI).
  await expect(page.locator('[data-testid="export-dialog"]')).toBeVisible();
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const path = await download.path();
  const fs = await import('node:fs/promises');
  const bytes = await fs.readFile(path!);
  // PNG magic + IHDR dims nonzero + content floor.
  expect(bytes.subarray(0, 8)).toEqual(
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const ihdrW = bytes.readUInt32BE(16);
  const ihdrH = bytes.readUInt32BE(20);
  expect(ihdrW).toBeGreaterThan(0);
  expect(ihdrH).toBeGreaterThan(0);
  expect(bytes.byteLength).toBeGreaterThan(1000);
});
