/**
 * Sun/time-of-day e2e (issue #121): the HUD sun cluster drives the
 * viewer's live lighting, and the change must be OBSERVABLE — both in
 * the stats seam (bearing/elevation/intensity read from the LIVE light
 * pose) and in the rendered pixels. The shadow atlas has autoUpdate
 * OFF (#86), so a correct slider path must re-render the shadows and
 * the sky, not merely move the light object.
 *
 * Fix round 1 (tester FAIL): pixels alone cannot pin that refresh. The
 * overview rig is an idle turntable (orbitMode) — with no canvas input
 * a capture pair drifts ~1.4-1.9 luma while the azimuth-only mutant
 * signal is ~1.0 (measured), and the mode-cycle pixel delta is
 * intensity-dominated (mutant only −4%). Every change path therefore
 * also asserts __viewerStats.shadowAtlasGenerations — the number of
 * frames that actually re-baked the atlas. Measured: the deleted
 * needsUpdate freezes it (+0) on slider, north and rebuild, while
 * every pristine path advances it (+1), and the light pose still
 * moves. The walk-half of AC1 additionally pins the visible re-light
 * in a drift-free seated frame (the walk rig does not idle-spin: its
 * same-window re-seat control is byte-identical).
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
  shadowAtlasGenerations: number | null;
}

function sunStats(page: Page): Promise<SunStats> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__viewerStats?.() ?? null;
  });
}

/**
 * Frames that actually re-baked the shadow atlas. With autoUpdate OFF
 * (#86) this only advances when needsUpdate is set, so it is the
 * zero-slack probe for "the refresh happened" on every change path
 * (#121 fix round). Fail loud if the seam is missing.
 */
async function atlasGenerations(page: Page): Promise<number> {
  const stats = await sunStats(page);
  if (typeof stats.shadowAtlasGenerations !== 'number') {
    throw new Error(
      '__viewerStats.shadowAtlasGenerations missing (#121 seam)',
    );
  }
  return stats.shadowAtlasGenerations;
}

/**
 * Wait until the atlas counter advances past `before` — i.e. a rendered
 * frame actually re-baked the shadow atlas after a sun change (#121 fix
 * round). Throws a descriptive error when the refresh never reaches the
 * screen (the stale-atlas mutant parks the counter indefinitely).
 */
async function waitAtlasAdvance(page: Page, before: number): Promise<void> {
  try {
    await page.waitForFunction(
      (prev) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gen = (window as any).__viewerStats?.()?.shadowAtlasGenerations;
        return typeof gen === 'number' && gen > prev;
      },
      before,
      { timeout: 2_500 },
    );
    return;
  } catch {
    // Fall through to a readable failure below.
  }
  const now = await atlasGenerations(page).catch(() => -1);
  if (now > before) return; // raced past the wait window; fine
  throw new Error(
    `shadow atlas not re-baked: counter ${before} -> ${now} ` +
      '(the sun change never reached a rendered frame)',
  );
}

/** Wait for a seated walk rig (disc + velocity probes present). */
async function waitSeatedWalk(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cam = (window as any).__viewerCam?.();
      return (
        cam !== null && cam !== undefined && typeof cam.discX === 'number'
      );
    },
    { timeout: 10_000 },
  );
  // Seat settle (mirrors the walk-affordances spec's seated wait).
  await page.waitForTimeout(900);
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
  // #146: the segment reflects the CURRENT mode — the Walk segment is
  // aria-pressed while walking, instead of a button labeled with the
  // opposite mode.
  const walkSegment = page.getByTestId('hud-mode-segment-walk');
  await page.keyboard.press('Tab'); // → walk
  await expect(walkSegment).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(900);
  await page.keyboard.press('Tab'); // → overview (seats the orbit rig)
  await expect(walkSegment).toHaveAttribute('aria-pressed', 'false');
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
    // The atlas counter seam is live from boot (#121 fix round). It
    // counts RENDERED frames that re-baked the atlas, so 0 is legal
    // here: this boot order seats no rig until a mode cycle, and the
    // change-path tests (slider/north/walk/rebuild) assert its delta.
    expect(typeof stats.shadowAtlasGenerations).toBe('number');
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
    const genBefore = await atlasGenerations(page);
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
    //
    // The pixel probe alone is too blunt to pin that refresh (with
    // needsUpdate deleted the slider delta only drops ~4% — the
    // intensity change dominates), so the zero-slack channel is the
    // atlas counter: the change must reach a rendered frame that
    // re-bakes the atlas.
    await waitAtlasAdvance(page, genBefore);
    expect(Math.abs(planAfter - planBefore)).toBeGreaterThan(3);
  });

  test('north offset shifts the bearing by δ and rotates the compass', async ({
    page,
  }) => {
    await bootSun(page);
    // The counter needs live frames: this boot order seats no rig, so
    // mirror the user (Walk, then back) to get a rendering overview.
    await ensureRenderedOverview(page);
    const before = await sunStats(page);
    const genBefore = await atlasGenerations(page);

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
    // This is the constant-intensity azimuth-only move: the pixel route
    // the tester proposed can't carry it here — the overview turntable
    // drifts ~1.9 luma per capture pair, more than the ~1.0 luma the
    // stale-atlas mutant leaves behind — so the counter pins it (the
    // pivot must reach a rendered frame that re-bakes the atlas even
    // though nothing else changed).
    await waitAtlasAdvance(page, genBefore);
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

  test('a sun change re-lights seated walk mode (AC1 walk-half)', async ({
    page,
  }) => {
    await bootSun(page);
    // Walk mode owns the arrow keys (walkMode keydown), so the change
    // is made from the overview: seat walk for the baseline, cycle out,
    // change, cycle back. The walk spawn is deterministic (same plan →
    // same seat), so the two captures differ by the LIGHT, not the
    // pose — the same-window re-seat control is byte-identical (0.000).
    await page.keyboard.press('Tab'); // → walk
    await expect(page.getByTestId('hud-mode-segment-walk')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitSeatedWalk(page);
    const genBefore = await atlasGenerations(page);
    const interiorBefore = await regionLuminance(page, 0.5, 0.15, 0.5, 0.4);

    await page.keyboard.press('Tab'); // → overview
    await expect(page.getByTestId('hud-mode-segment-walk')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await setTimeByKeyboard(page, 8);
    // Clear the slider focus: a focused input turns Tab into focus
    // navigation instead of the mode toggle.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.keyboard.press('Tab'); // → walk again
    await expect(page.getByTestId('hud-mode-segment-walk')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitSeatedWalk(page);

    const interiorAfter = await regionLuminance(page, 0.5, 0.15, 0.5, 0.4);
    // Calibrated: noon → 08:00 moves the seated interior mean by ~49
    // luma (162 → 113); the no-change re-seat control reads 0.000, so
    // 20 is a ~2.5x-margin floor for "light colour visibly tracks".
    expect(Math.abs(interiorAfter - interiorBefore)).toBeGreaterThan(20);
    // The walk-visible change must also reach a rendered frame that
    // re-bakes the atlas (a stale atlas keeps the interior shading
    // frozen; the mutant parks the counter here).
    await waitAtlasAdvance(page, genBefore);
  });

  test('a plan rebuild re-applies the sun and re-bakes the atlas', async ({
    page,
  }) => {
    await bootSun(page);
    await ensureRenderedOverview(page);
    await setTimeByKeyboard(page, 8);
    await flushFrames(page);
    const before = await sunStats(page);
    const genBefore = await atlasGenerations(page);
    expect(before.sunBearingDeg).toBeCloseTo(SUN_AZ_NOON_DEG - 60, 6);

    // A variant plan (one extra valid furniture item) forces a full
    // scene rebuild through the same path as a real edit. Furniture
    // ships as ONE merged mesh, so meshCount stays flat — the parity
    // figure is furnitureVolumeCount (1 volume per item).
    const volumeBefore = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.().furnitureVolumeCount ?? -1;
    });
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile('demo/demo-apartment.json', 'utf8');
    await page.evaluate((planJson) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = (window as any).__casaplaza;
      const plan = JSON.parse(planJson);
      plan.furniture.push({
        id: 'fur-rebuild-probe',
        type: 'table',
        roomId: 'room-living-room',
        position: [4.6, 2.4],
        rotationDeg: 0,
        footprint: [0.8, 0.8],
      });
      bridge.loadPlan(plan);
    }, raw);
    await page.waitForFunction(
      (expected) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__viewerStats?.();
        return (
          typeof s?.furnitureVolumeCount === 'number' &&
          s.furnitureVolumeCount === expected
        );
      },
      volumeBefore + 1,
      { timeout: 15_000 },
    );
    await flushFrames(page);

    const after = await sunStats(page);
    // The rebuild must NOT snap the sun back: the 08:00 pose and
    // intensity survive the re-apply...
    expect(after.sunBearingDeg).toBeCloseTo(SUN_AZ_NOON_DEG - 60, 6);
    expect(after.sunElevationDeg).toBeCloseTo(sunElevationDeg(8), 6);
    expect(after.sunIntensity).toBeCloseTo(before.sunIntensity ?? 0, 9);
    // ...and the rebuilt scene's atlas was re-baked for that pose.
    await waitAtlasAdvance(page, genBefore);
  });
});
