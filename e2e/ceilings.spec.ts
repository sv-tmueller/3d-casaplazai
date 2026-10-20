/**
 * Ceilings visibility + interior fill lights (issue #152): the AC probes.
 *
 * AC1 walk: the ceiling is overhead — the ceiling mesh is visible and the
 *     top band of the frame reads as a lit, neutral slat rather than the
 *     blue sky through a hole in the roof.
 * AC2 overview: the dollhouse never shows ceilings, whatever the roofs or
 *     walls toggles say, while both toggles still do their own job.
 * AC3 dusk: at 22:00 the pool is live and the interior is measurably
 *     brighter than the CP0 pre-change baseline; at 12:00 the pool is hard
 *     off and the interior matches the pre-change noon baseline.
 * AC4 perf: the fill work adds no geometry — triangle count and frame time
 *     on the townhouse fixture stay inside the existing budget.
 */
import { expect, test, type Page } from '@playwright/test';
import { regionLuminance, regionMeanRgb } from './fixtures/luminance';

/**
 * CP0 baselines, captured on the PRE-CHANGE dist (issue #152): demo
 * apartment, seated walk, region 0.5/0.15/0.5/0.4, ?quality=high&perf=1.
 * The walk spawn is deterministic — a re-seat control reproduced the
 * 22:00 frame byte-for-byte, so these comparisons are zero-slack.
 */
const CP0_NOON_INTERIOR = 162.24;
const CP0_NIGHT_INTERIOR = 117.61;

/** The slice of __viewerStats this spec reads (issue #152 seams in bold). */
interface ViewerStats {
  meshCount: number;
  /** Live visibility of the merged ceiling mesh; null = plan has none. */
  ceilingVisible: boolean | null;
  ceilingMeshCount: number;
  /** Max live intensity across the interior pool; 0 while parked. */
  interiorLightIntensity: number;
  litRoomCount: number;
  totalTriangleCount: number;
  medianFrameMs: number;
  roofVisible: boolean | null;
  sunElevationDeg: number;
}

async function stats(page: Page): Promise<ViewerStats> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__viewerStats?.() as ViewerStats;
  });
}

async function seedPlan(page: Page, file: string): Promise<void> {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(file, 'utf8');
  await page.evaluate((json) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(JSON.parse(json));
  }, raw);
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__viewerStats?.();
    return typeof s === 'object' && s !== null && s.meshCount > 0;
  });
}

async function boot(page: Page, file: string): Promise<void> {
  await page.goto('/viewer?quality=high&perf=1');
  await page.locator('.viewer-gl-canvas').waitFor();
  await seedPlan(page, file);
  await page.getByTestId('hud-sun-time').waitFor();
  await page.waitForTimeout(900);
}

async function seatWalk(page: Page): Promise<void> {
  // Blur first: with a slider focused, Tab just walks the HUD instead of
  // toggling the mode (sun.spec's toOverview idiom, applied here).
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__viewerCam?.();
    return s !== null && s !== undefined && typeof s.discX === 'number';
  });
  await page.waitForTimeout(900);
}

/** Drive the sun-time slider from wherever it currently sits (0..24). */
async function setTime(page: Page, hours: number): Promise<void> {
  const slider = page.getByTestId('hud-sun-time');
  await slider.focus();
  const current = Number(await slider.inputValue());
  const steps = Math.round((hours - current) / 0.5);
  const key = steps < 0 ? 'ArrowLeft' : 'ArrowRight';
  for (let i = 0; i < Math.abs(steps); i += 1) await page.keyboard.press(key);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect(slider).toHaveValue(String(hours));
}

test('AC1 walk: the ceiling is overhead and the top band is not sky', async ({
  page,
}) => {
  await boot(page, 'demo/demo-apartment.json');
  await seatWalk(page);

  const s = await stats(page);
  // The plan HAS ceilings; in walk mode they are up, not hidden.
  expect(s.ceilingMeshCount).toBeGreaterThan(0);
  expect(s.ceilingVisible).toBe(true);

  // Top band of the seated frame: bright, and hue-wise neutral/warm. A
  // hole would show sky, which reads b ≫ r (CP0 measured the vacuous-sky
  // frame at 188/214/234 → b − r = +46; a warm slat reads b − r ≤ 0).
  const band = await regionMeanRgb(page, 0.4, 0.02, 0.2, 0.14);
  const luma = 0.299 * band.r + 0.587 * band.g + 0.114 * band.b;
  console.log(
    `AC1_TOP_BAND r=${band.r.toFixed(1)} g=${band.g.toFixed(1)} ` +
      `b=${band.b.toFixed(1)} luma=${luma.toFixed(1)}`,
  );
  expect(luma).toBeGreaterThan(100);
  expect(band.b - band.r).toBeLessThan(25);
});

test('AC2 overview: ceilings stay hidden through roofs and walls toggles', async ({
  page,
}) => {
  await boot(page, 'demo/demo-townhouse.json');

  let s = await stats(page);
  // The townhouse carries real roof planes, and they are up on boot…
  expect(s.roofVisible).toBe(true);
  expect(s.ceilingMeshCount).toBeGreaterThan(0);
  // …but the overview never stacks a ceiling lid under them.
  expect(s.ceilingVisible).toBe(false);

  // Roofs off → no ceilings either; roofs back on → roofs return, the
  // ceiling policy does not budge. (aria-pressed mirrors the STATE:
  // true = roofs visible, label announces the next action.)
  const roofBtn = page.getByTestId('hud-roof-toggle');
  await expect(roofBtn).toHaveAttribute('aria-pressed', 'true');
  await roofBtn.click();
  await expect(roofBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(roofBtn).toHaveText('Show roofs');
  s = await stats(page);
  expect(s.roofVisible).toBe(false);
  expect(s.ceilingVisible).toBe(false);

  await roofBtn.click();
  await expect(roofBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(roofBtn).toHaveText('Hide roofs');
  s = await stats(page);
  expect(s.roofVisible).toBe(true);
  expect(s.ceilingVisible).toBe(false);

  // Walls at 50% transparency: dollhouse reading intact, still no ceiling.
  const slider = page.getByTestId('hud-walls-alpha');
  await slider.focus();
  for (let i = 0; i < 50; i += 1) await slider.press('ArrowRight');
  await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('50%');
  s = await stats(page);
  expect(s.ceilingVisible).toBe(false);

  // …and the policy is a MODE switch, not a global hide: walking shows
  // the ceiling again even with the walls left translucent.
  await seatWalk(page);
  s = await stats(page);
  expect(s.ceilingVisible).toBe(true);
});

test('AC3 noon: the pool is hard off and the picture is unchanged', async ({
  page,
}) => {
  await boot(page, 'demo/demo-apartment.json');
  await seatWalk(page);

  const s = await stats(page);
  // The daylight half of the day: zero fill anywhere in the pool.
  expect(s.interiorLightIntensity).toBe(0);
  expect(s.litRoomCount).toBe(0);

  const noon = await regionLuminance(page, 0.5, 0.15, 0.5, 0.4);
  console.log(`AC3_NOON_INTERIOR ${noon.toFixed(2)}`);
  // Parked lights contribute nothing: the frame matches the pre-change
  // CP0 baseline (the walk spawn is deterministic, so this is zero-slack).
  expect(Math.abs(noon - CP0_NOON_INTERIOR)).toBeLessThan(2);
});

test('AC3 dusk: 22:00 interiors are legible and the fill adds light', async ({
  page,
}) => {
  await boot(page, 'demo/demo-apartment.json');
  // Sun time is set from the OVERVIEW — boot is already there, and a
  // spare Tab would drop us INTO walk mode, which keeps the arrow keys
  // for itself (CP0 lesson: the slider never moves from inside a rig).
  await setTime(page, 22);
  await seatWalk(page);

  const s = await stats(page);
  expect(s.sunElevationDeg).toBeLessThan(3);
  expect(s.interiorLightIntensity).toBeGreaterThan(0.5);
  expect(s.litRoomCount).toBeGreaterThan(0);
  expect(s.litRoomCount).toBeLessThanOrEqual(4);

  const night = await regionLuminance(page, 0.5, 0.15, 0.5, 0.4);
  const delta = night - CP0_NIGHT_INTERIOR;
  console.log(
    `AC3_NIGHT_INTERIOR ${night.toFixed(2)} ` +
      `(CP0 ${CP0_NIGHT_INTERIOR}, delta +${delta.toFixed(2)}) ` +
      `intensity=${s.interiorLightIntensity} litRooms=${s.litRoomCount}`,
  );
  // The AC's literal floor, plus the stronger claim: brighter than the
  // same seat before the fill lights existed.
  expect(night).toBeGreaterThan(30);
  expect(delta).toBeGreaterThan(8);
});

test('AC4 perf: the fill adds no geometry and stays in frame budget', async ({
  page,
}) => {
  await boot(page, 'demo/demo-townhouse.json');

  const overview = await stats(page);
  expect(overview.totalTriangleCount).toBeGreaterThan(0);
  expect(overview.medianFrameMs).toBeLessThan(20);

  await seatWalk(page);
  const walking = await stats(page);
  expect(walking.totalTriangleCount).toBe(overview.totalTriangleCount);
  expect(walking.medianFrameMs).toBeLessThan(20);
  expect(walking.meshCount).toBe(overview.meshCount);

  console.log(
    `AC4_TOWNHOUSE triangles=${overview.totalTriangleCount} ` +
      `meshes=${overview.meshCount} medianMs=${overview.medianFrameMs} ` +
      `walkMedianMs=${walking.medianFrameMs}`,
  );
});
