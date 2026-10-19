/**
 * E2E for issue #120 (Pkg 14.5: walls-transparency dollhouse slider).
 *
 * Probes the FULL production path via the __viewerStats seam:
 *  - keyboard-driven slider (mouseless mandate — native range input):
 *    wallOpacity follows 1 - alpha, then the opaque fast path restores;
 *  - full-right (100 %) skips the wall mesh entirely (visible=false);
 *  - the applier targets slot 'wall' ONLY — glass roughness untouched;
 *  - the roof toggle (#86) keeps its own state mid-fade;
 *  - a real plan recompile resets slider + state to 0 (stale state
 *    would lie about the fresh, opaque materials).
 */
import { expect, test, type Page } from '@playwright/test';

interface Stats {
  meshCount: number;
  glassRoughness: number;
  roofOpacity: number | null;
  roofVisible: boolean | null;
  wallOpacity: number | null;
  wallVisible: boolean | null;
}

async function bootAndLoad(page: Page): Promise<void> {
  await page.goto('/viewer');
  await page.locator('.viewer-gl-canvas').waitFor();
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile('demo/demo-apartment.json', 'utf8');
  await page.evaluate((planJson) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(JSON.parse(planJson));
  }, raw);
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return (
        typeof s === 'object' &&
        s !== null &&
        s.meshCount > 0 &&
        s.wallOpacity !== undefined
      );
    },
    { timeout: 15_000 },
  );
}

async function stats(page: Page): Promise<Stats> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__viewerStats();
  });
}

/** Boot with a roof-bearing demo variant (the #86 toggle needs a roof). */
async function bootWithRoof(page: Page): Promise<void> {
  await page.goto('/viewer');
  await page.locator('.viewer-gl-canvas').waitFor();
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile('demo/demo-apartment.json', 'utf8');
  await page.evaluate((planJson) => {
    const plan = JSON.parse(planJson);
    // The demo carries no roofs; graft one onto the living room's first
    // segment (v1 rooms ride into floor 0 BY REFERENCE via migrate()).
    plan.rooms[0].roofs = [{ segmentIndex: 0, leanDeg: 30 }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(plan);
  }, raw);
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return (
        typeof s === 'object' &&
        s !== null &&
        s.meshCount > 0 &&
        s.wallOpacity !== undefined &&
        s.roofVisible === true
      );
    },
    { timeout: 15_000 },
  );
}

/** Focus the slider and nudge it right with arrow keys (native range). */
async function nudge(page: Page, presses: number): Promise<void> {
  const slider = page.getByTestId('hud-walls-alpha');
  await slider.focus();
  for (let i = 0; i < presses; i += 1) {
    await slider.press('ArrowRight');
  }
}

test.describe('walls-transparency slider (issue #120)', () => {
  test('keyboard fades walls down and restores the opaque fast path', async ({
    page,
  }) => {
    await bootAndLoad(page);
    const slider = page.getByTestId('hud-walls-alpha');
    await expect(slider).toBeVisible();

    const before = await stats(page);
    expect(before.wallOpacity).toBe(1);
    expect(before.wallVisible).toBe(true);

    await nudge(page, 40);
    await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('40%');
    await expect
      .poll(async () => (await stats(page)).wallOpacity, { timeout: 5_000 })
      .toBeCloseTo(0.6, 5);

    // Back to 0: opacity 1 again (opaque fast path, mesh visible).
    await slider.press('Home');
    await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('0%');
    await expect
      .poll(async () => (await stats(page)).wallOpacity, { timeout: 5_000 })
      .toBe(1);
    expect((await stats(page)).wallVisible).toBe(true);
  });

  test('full-right position skips the wall mesh entirely', async ({ page }) => {
    await bootAndLoad(page);
    const slider = page.getByTestId('hud-walls-alpha');
    await expect(slider).toBeVisible();

    await slider.focus();
    await slider.press('End'); // → 100 %
    await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('100%');
    await expect
      .poll(async () => (await stats(page)).wallVisible, { timeout: 5_000 })
      .toBe(false);
    expect((await stats(page)).wallOpacity).toBe(0);

    // Recoverable: Home restores an operable opaque wall mesh.
    await slider.press('Home');
    await expect
      .poll(async () => (await stats(page)).wallVisible, { timeout: 5_000 })
      .toBe(true);
    expect((await stats(page)).wallOpacity).toBe(1);
  });

  test('glass roughness untouched; roof keeps its own state mid-fade', async ({
    page,
  }) => {
    await bootWithRoof(page);
    const before = await stats(page);
    expect(before.glassRoughness).toBeGreaterThan(0);

    await nudge(page, 40);
    const mid = await stats(page);
    // The applier targets slot 'wall' only — glass material identical.
    expect(mid.glassRoughness).toBe(before.glassRoughness);
    expect(mid.wallOpacity).toBeCloseTo(0.6, 5);

    // Roof toggle (#86) owns independent state: hide it mid-fade …
    await page.getByTestId('hud-roof-toggle').click();
    await expect
      .poll(async () => (await stats(page)).roofVisible, { timeout: 5_000 })
      .toBe(false);
    const after = await stats(page);
    expect(after.wallOpacity).toBeCloseTo(0.6, 5);
    expect(await page.getByTestId('hud-walls-alpha').inputValue()).toBe('40');

    // … and the wall fade still works while the roof is hidden.
    await page.getByTestId('hud-walls-alpha').press('Home');
    await expect
      .poll(async () => (await stats(page)).wallOpacity, { timeout: 5_000 })
      .toBe(1);
    expect((await stats(page)).roofVisible).toBe(false);
  });

  test('plan recompile resets slider and state to 0', async ({ page }) => {
    await bootAndLoad(page);
    await nudge(page, 40);
    await expect
      .poll(async () => (await stats(page)).wallOpacity, { timeout: 5_000 })
      .toBeCloseTo(0.6, 5);

    // Real recompile: mutate the wall height (same trick as #87 heap spec).
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile('demo/demo-apartment.json', 'utf8');
    await page.evaluate((json) => {
      const plan = JSON.parse(json);
      plan.wallHeight = 2.75;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan(plan);
    }, raw);

    // Fresh materials are opaque → state and UI snap back to 0.
    await expect
      .poll(async () => (await stats(page)).wallOpacity, { timeout: 10_000 })
      .toBe(1);
    expect(await page.getByTestId('hud-walls-alpha').inputValue()).toBe('0');
    await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('0%');
  });
});
