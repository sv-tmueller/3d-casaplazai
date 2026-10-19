/**
 * Townhouse e2e (issue #76): LOAD-SMOKE only — the two-storey fixture
 * must survive the FULL production path (bridge → migrate → validate →
 * compile → adapt → render) without errors, compose meshes for BOTH
 * storeys, and place the walk camera on the GROUND storey.
 *
 * Deliberately narrower than viewer.spec.ts: no waypoint marching
 * (route derivations belong to the tester's pass), just observable
 * composition + grounding via the sanctioned debug seams.
 */

import { expect, test, type Page } from '@playwright/test';

async function bootTownhouse(page: Page): Promise<void> {
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
}

test.describe.serial('townhouse two-storey load-smoke (issue #76)', () => {
  test('loads without page errors and composes meshes for both storeys', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await bootTownhouse(page);

    const stats = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.() ?? null;
    });
    expect(errors).toEqual([]);
    expect(stats).not.toBeNull();
    expect(stats.meshCount).toBeGreaterThan(0);
    // Both floors' furniture made it through (3 ground + 3 upper).
    expect(stats.furnitureVolumeCount).toBe(6);
    // Three windows across the plan (living, kitchen, bedroom, office)
    // — glass quads must match the WINDOW count, not the opening count.
    expect(stats.glassQuadCount).toBe(4);
  });

  test('walk mode grounds the camera on the GROUND storey (eye 1.65)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await bootTownhouse(page);
    await page.getByTestId('hud-mode-toggle').click();
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cam = (window as any).__viewerCam?.();
        return typeof cam === 'object' && cam !== null && cam.eyeY > 0;
      },
      { timeout: 15_000 },
    );

    const cam = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerCam?.();
    });
    expect(errors).toEqual([]);
    // Ground storey: eye sits at 0 + EYE_HEIGHT (1.65), NOT at 2.7+1.65
    // and not floating between storeys.
    expect(cam.eyeY).toBeCloseTo(1.65, 2);
    // Disc spawned inside the ground floor's biggest room (living:
    // 0..5.2 × 0..3.8).
    expect(cam.discX).toBeGreaterThanOrEqual(0);
    expect(cam.discX).toBeLessThanOrEqual(5.2);
    expect(cam.discY).toBeGreaterThanOrEqual(0);
    expect(cam.discY).toBeLessThanOrEqual(3.8);
  });
});
