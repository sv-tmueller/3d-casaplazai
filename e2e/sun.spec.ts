/**
 * Sun/time-of-day e2e (issue #121): the HUD sun cluster drives the
 * viewer's live lighting, and the change must be OBSERVABLE — both in
 * the stats seam (bearing/elevation/intensity read from the LIVE light
 * pose) and in the rendered pixels. The shadow atlas has autoUpdate
 * OFF (#86), so a correct slider path must re-render the shadows and
 * the sky, not merely move the light object.
 */

import { expect, test, type Page } from '@playwright/test';
import { regionLuminance } from './fixtures/luminance';
import {
  AMBIENT_INTENSITY,
  SUN_AZ_NOON_DEG,
  SUN_EL_NOON_RAD,
  SUN_INTENSITY,
} from '../src/viewer/renderConstants';
import { sunElevationDeg, sunState } from '../src/viewer/sun';

/** Live sun stats read from the viewer seam. */
interface SunStats {
  sunBearingDeg: number | null;
  sunElevationDeg: number | null;
  sunIntensity: number | null;
  ambientIntensity: number | null;
}

function sunStats(page: Page): Promise<SunStats> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__viewerStats?.() ?? null;
  });
}

/** Load the demo apartment through the editor bridge (fresh-page safe). */
async function seedDemo(page: Page): Promise<void> {
  const demo = await import('node:fs/promises');
  const raw = await demo.readFile('demo/demo-apartment.json', 'utf8');
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

/** Boot the viewer on the demo plan and let the first frames settle. */
async function bootSun(page: Page, query = ''): Promise<void> {
  await page.goto(`/viewer${query}`);
  await page.locator('.viewer-gl-canvas').waitFor();
  await seedDemo(page);
  await page.getByTestId('hud-sun-time').waitFor();
  // First frames flush (mirrors the #86 luminance probe's settle).
  await page.waitForTimeout(900);
}

/** Two flushed animation frames — a state change must be ON SCREEN. */
async function flushFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Arrow-press the time slider down to a target hour (step 0.5, keyboard). */
async function setTimeByKeyboard(page: Page, hours: number): Promise<void> {
  await page.getByTestId('hud-sun-time').focus();
  const presses = Math.round((12 - hours) / 0.5);
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  const expectedBearing = SUN_AZ_NOON_DEG + 15 * (hours - 12);
  await page.waitForFunction(
    (target) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return (
        typeof s?.sunBearingDeg === 'number' &&
        Math.abs(s.sunBearingDeg - target) < 0.25
      );
    },
    expectedBearing,
  );
}

/** Wait until the live bearing reads `target` (rounded to a tolerant band). */
async function waitBearing(page: Page, target: number): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return (
        typeof s?.sunBearingDeg === 'number' &&
        Math.abs(s.sunBearingDeg - expected) < 0.25
      );
    },
    target,
  );
}

/**
 * Seat the overview rig the way a user does (Walk, then back). In this
 * e2e boot order the plan arrives AFTER start(), so the initial
 * seatRig('overview') no-ops and the overview renders nothing until a
 * mode cycle — a pre-existing seating gap, unrelated to #121 (see
 * report notes). The cycle provably yields a live overview frame
 * (__viewerCam non-null + non-backdrop pixels).
 */
async function ensureRenderedOverview(page: Page): Promise<void> {
  const toggle = page.getByTestId('hud-mode-toggle');
  await page.keyboard.press('Tab'); // → walk
  await expect(toggle).toHaveText('Overview');
  await page.waitForTimeout(900);
  await page.keyboard.press('Tab'); // → overview (seats the orbit rig)
  await expect(toggle).toHaveText('Walk');
  await page
    .waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cam = (window as any).__viewerCam?.();
        return cam !== null && cam !== undefined;
      },
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(900);
}

test.describe.serial('sun time-of-day + north offset (issue #121)', () => {
  test('boot stats equal the default constants (AC3 zero-regression probe)', async ({
    page,
  }) => {
    await bootSun(page);
    const stats = await sunStats(page);
    expect(stats.sunBearingDeg).toBeCloseTo(SUN_AZ_NOON_DEG, 6);
    expect(stats.sunElevationDeg).toBeCloseTo(
      (SUN_EL_NOON_RAD * 180) / Math.PI,
      6,
    );
    expect(stats.sunIntensity).toBeCloseTo(SUN_INTENSITY, 6);
    expect(stats.ambientIntensity).toBeCloseTo(AMBIENT_INTENSITY, 6);
    // The HUD ships at the noon preset.
    await expect(page.getByTestId('hud-sun-time')).toHaveValue('12');
    await expect(page.getByTestId('hud-sun-north')).toHaveValue('0');
    await expect(page.getByTestId('hud-compass')).toHaveAttribute(
      'style',
      /rotate\(0deg\)/,
    );
  });

  test('sliding time moves the sun AND the rendered luminance (shadow refresh)', async ({
    page,
  }) => {
    await bootSun(page);
    await ensureRenderedOverview(page);
    const before = await sunStats(page);
    // The lit plan body: the post-cycle overview frames it centre-right.
    const planBefore = await regionLuminance(page, 0.5, 0.15, 0.5, 0.4);

    // Keyboard-driven (the mouseless mandate): 12:00 → 08:00.
    await setTimeByKeyboard(page, 8);
    await flushFrames(page);

    const after = await sunStats(page);
    expect(after.sunBearingDeg).toBeCloseTo(SUN_AZ_NOON_DEG - 60, 6);
    expect(after.sunElevationDeg).toBeCloseTo(sunElevationDeg(8), 6);
    const expectedIntensity =
      SUN_INTENSITY *
      sunState({ timeHours: 8, northOffsetDeg: 0 }).intensityFactor;
    expect(after.sunIntensity).toBeCloseTo(expectedIntensity, 6);
    expect(after.sunIntensity).toBeLessThan(before.sunIntensity ?? 0);
    // Ambient compensates for the dimmer sun.
    expect(after.ambientIntensity).toBeGreaterThan(
      before.ambientIntensity ?? 0,
    );

    const planAfter = await regionLuminance(page, 0.5, 0.15, 0.5, 0.4);
    // The lit plan must have RE-RENDERED: the shadow atlas has
    // autoUpdate OFF, so needsUpdate must fire or the frame's shading
    // would stay frozen while the light object moves. (The sky dome is
    // BackSide-culled at the overview camera's height, so the plan is
    // the observable surface here.)
    expect(Math.abs(planAfter - planBefore)).toBeGreaterThan(3);
  });

  test('north offset shifts the bearing by δ and rotates the compass', async ({
    page,
  }) => {
    await bootSun(page);
    const before = await sunStats(page);

    // North slider: step 5°, six ArrowRights = +30°.
    await page.getByTestId('hud-sun-north').focus();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await waitBearing(page, SUN_AZ_NOON_DEG + 30);

    const after = await sunStats(page);
    expect(
      (after.sunBearingDeg ?? 0) - (before.sunBearingDeg ?? 0),
    ).toBeCloseTo(30, 6);
    // The offset rotates the whole path; the hour is untouched.
    expect(after.sunElevationDeg).toBeCloseTo(before.sunElevationDeg ?? 0, 9);
    expect(after.sunIntensity).toBeCloseTo(before.sunIntensity ?? 0, 9);
    await expect(page.getByTestId('hud-sun-north')).toHaveValue('30');
    await expect(page.getByTestId('hud-compass')).toHaveAttribute(
      'style',
      /rotate\(-30deg\)/,
    );
  });

  test('reload restores the default sun (settings are not persisted)', async ({
    page,
  }) => {
    await bootSun(page);
    await setTimeByKeyboard(page, 8);

    await page.reload();
    await page.locator('.viewer-gl-canvas').waitFor();
    await seedDemo(page);
    await page.waitForTimeout(900);

    const stats = await sunStats(page);
    expect(stats.sunBearingDeg).toBeCloseTo(SUN_AZ_NOON_DEG, 6);
    expect(stats.sunIntensity).toBeCloseTo(SUN_INTENSITY, 6);
    await expect(page.getByTestId('hud-sun-time')).toHaveValue('12');
    await expect(page.getByTestId('hud-sun-north')).toHaveValue('0');
  });
});
