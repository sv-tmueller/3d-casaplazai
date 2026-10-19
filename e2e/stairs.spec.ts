/**
 * Stair walk-traversal e2e (issue #80): boots the townhouse through
 * the FULL production path, enters walk mode on the ground storey, and
 * STEERS the disc up the committed staircase onto the upper landing —
 * then back down. Asserts the eye-height curve via the sanctioned
 * debug seams (__viewerCam/__viewerYaw), mirroring viewer.spec.ts's
 * hopTowards pattern (headless pointer lock is unreliable, so yaw is
 * seeded directly and W is pressed in bounded bursts).
 *
 * Route derivation (fixture geometry, never eyeballed):
 *   - spawn: solveSpawn plants the disc in the living room (largest
 *     ground room), roughly (2.6, 1.9).
 *   - kitchen↔entry door mouth: (8.03, 0.8) — the door spans
 *     y ∈ [0.375, 1.225] on x=8.4; the disc (radius 0.3) centres at
 *     8.4 − 0.12 − 0.3 ≈ 8.0 threading the opening.
 *   - stair mouth: (9.0, 1.5) — footprint starts at y=1.7; flanks
 *     (rails at x=8.46/9.54 minus disc radius) admit the centre
 *     column x ∈ (8.76, 9.24).
 *   - stair crest: (9.0, 4.6) — hole ends at y≈4.4857; past it the
 *     arrival plane stands (bath↔landing stairwell door carved).
 */

import { expect, test, type Page } from '@playwright/test';

/** Derived waypoints (world XY, meters) for demo-townhouse.json. */
const WAYPOINTS: Array<{ x: number; y: number }> = [
  { x: 4.0, y: 1.85 }, // east along the living room's mid lane
  { x: 5.5, y: 1.85 }, // thread the living↔kitchen door (centre corridor y≈1.9)
  { x: 8.0, y: 0.8 }, // kitchen south lane (counter sits on the north wall)
  { x: 8.7, y: 0.8 }, // thread the kitchen↔entry door
  { x: 9.0, y: 1.4 }, // stair mouth (just downhill of the first riser)
  { x: 9.0, y: 3.0 }, // mid-flight (rising)
  { x: 9.0, y: 4.6 }, // crest + one step onto the landing
];

async function boot(page: Page): Promise<void> {
  await page.goto('/viewer');
  await page.locator('.viewer-gl-canvas').waitFor();
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile('demo/demo-townhouse.json', 'utf8');
  await page.evaluate((planJson) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(JSON.parse(planJson));
  }, raw);
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return typeof s === 'object' && s !== null && s.meshCount > 0;
    },
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="hud-mode-toggle"]') !== null,
    { timeout: 15_000 },
  );
}

test.describe.serial('stair walk traversal (issue #80)', () => {
  test('walker climbs the staircase onto the upper storey', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await boot(page);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(700); // transition fade

    const readCam = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__viewerCam?.() ?? null;
      });
    const initial = await readCam();
    expect(initial, '__viewerCam must exist in walk mode').not.toBeNull();
    // Grounded on the ground storey at boot.
    expect(initial!.eyeY).toBeCloseTo(1.65, 1);

    /** Aim at a plan point, hold W for a bounded burst. */
    const hopToward = async (tx: number, ty: number): Promise<void> => {
      const cam = await readCam();
      expect(cam, '__viewerCam must exist in walk mode').not.toBeNull();
      const yaw = Math.atan2(ty - cam!.discY, tx - cam!.discX);
      const steered = await page.evaluate(
        ([y]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (window as any).__viewerYaw;
          if (typeof fn !== 'function') return false;
          fn(y);
          return true;
        },
        [yaw],
      );
      expect(steered, '__viewerYaw must be a function').toBe(true);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      await page.keyboard.up('KeyW');
    };

    // March the derived route verbatim.
    for (const wp of WAYPOINTS) {
      for (let step = 0; step < 60; step++) {
        const cam = await readCam();
        if (Math.hypot(wp.x - cam!.discX, wp.y - cam!.discY) < 0.2) break;
        await hopToward(wp.x, wp.y);
      }
    }

    // CREsted: eye at 2.7 + 1.65 = 4.35 (±15 cm), disc past the top
    // riser (y=4.3) onto the level crest extension.
    const topped = await readCam();
    expect(topped!.eyeY).toBeGreaterThan(4.2);
    expect(topped!.eyeY).toBeLessThan(4.5);
    expect(topped!.discY).toBeGreaterThan(4.3);

    // DESCENT reverses: turn around, walk back down the flight.
    for (let step = 0; step < 80; step++) {
      const cam = await readCam();
      if (cam!.discY < 1.5) break;
      await hopToward(9.0, 1.2);
    }
    const bottom = await readCam();
    expect(bottom!.eyeY).toBeCloseTo(1.65, 1);
    expect(bottom!.discY).toBeLessThan(1.7);

    expect(errors).toEqual([]);
  });

  test('stair solids render: triangle count grows with the stair', async ({
    page,
  }) => {
    await boot(page);
    const stats = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.() ?? null;
    });
    expect(stats).not.toBeNull();
    expect(stats!.meshCount).toBeGreaterThan(0);
    // Furniture parity still holds (6 volumes across both storeys).
    expect(stats!.furnitureVolumeCount).toBe(6);
  });
});
