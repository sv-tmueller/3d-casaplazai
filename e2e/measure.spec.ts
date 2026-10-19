/**
 * E2E for issue #66 (Pkg 1: measure tool).
 *
 * Screen mapping mirrors e2e/opening-drag.spec.ts: INITIAL_SCALE=80,
 * camera origin (0,0) at boot, screen coords relative to .editor-canvas.
 * Annotations are canvas-drawn (unreadable by DOM locators), so the
 * assertions read the read-only __editorMeasurements / __editorDimsVisible
 * seams — same precedent as __editorHandles (#53).
 *
 * Legs: a=(0,-5) → b=(3,-1) is a 3-4-5 triangle ⇒ hypotenuse label
 * "5.00 m · 53.1°" (atan2(4,3) = 53.13°).
 */
import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE } from './fixtures/camConstants';
import type { Camera } from '../src/editor/controller';
import {
  measureLabelScreenPos,
  measurementLabelText,
  type Measurement,
} from '../src/editor/model/measure';

const BOOT_CAM: Camera = { originX: 0, originY: 0, scale: CAM_SCALE };

/** Far-away room so grid snapping near the measure clicks is unperturbed. */
const FAR_ROOM = {
  id: 'far',
  name: 'Far',
  polygon: [[-8, -8], [-4, -8], [-4, -4], [-8, -4]],
  floorTexture: null,
};

async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * CAM_SCALE, y: b.y - wy * CAM_SCALE };
}

async function loadFarRoom(page: Page): Promise<void> {
  await page.evaluate((room) => {
    (window as unknown as {
      __casaplaza: { loadPlan: (p: unknown) => void };
    }).__casaplaza.loadPlan({
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [room],
      openings: [],
      furniture: [],
    });
  }, FAR_ROOM);
}

async function measurements(page: Page): Promise<Measurement[]> {
  return (await page.evaluate(() =>
    (window as unknown as { __editorMeasurements: () => unknown[] }).__editorMeasurements(),
  )) as Measurement[];
}

async function dimsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (window as unknown as { __editorDimsVisible: () => boolean }).__editorDimsVisible(),
  );
}

async function draw(page: Page): Promise<void> {
  const a = await aim(page, 0, -5);
  await page.mouse.click(a.x, a.y);
  const b = await aim(page, 3, -1);
  await page.mouse.click(b.x, b.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await loadFarRoom(page);
  await page.getByRole('button', { name: 'Measure', exact: true }).click();
});

test('two clicks add a 3-4-5 dimension labelled "5.00 m · 53.1°"', async ({ page }) => {
  await draw(page);
  const ms = await measurements(page);
  expect(ms).toHaveLength(1);
  expect(ms[0].a).toEqual([0, -5]);
  expect(ms[0].b).toEqual([3, -1]);
  expect(measurementLabelText(ms[0])).toBe('5.00 m \u00B7 53.1\u00B0');
});

test('Escape cancels a pending anchor', async ({ page }) => {
  const abandoned = await aim(page, 0, -5);
  await page.mouse.click(abandoned.x, abandoned.y);
  await page.keyboard.press('Escape');
  const b = await aim(page, 1, -5);
  await page.mouse.click(b.x, b.y);
  const c = await aim(page, 1, -2);
  await page.mouse.click(c.x, c.y);
  const ms = await measurements(page);
  expect(ms).toHaveLength(1);
  // The draft was cleared: the surviving annotation is B→C, not A→C.
  expect(ms[0].a).toEqual([1, -5]);
  expect(ms[0].b).toEqual([1, -2]);
});

test('"Clear measurements" wipes every annotation', async ({ page }) => {
  await draw(page);
  const b = await aim(page, 4, -5);
  await page.mouse.click(b.x, b.y);
  const c = await aim(page, 4, -2);
  await page.mouse.click(c.x, c.y);
  expect(await measurements(page)).toHaveLength(2);
  await page.getByTestId('btn-clear-measurements').click();
  expect(await measurements(page)).toEqual([]);
});

test('clicking a label removes that annotation', async ({ page }) => {
  await draw(page);
  const ms = await measurements(page);
  expect(ms).toHaveLength(1);
  const lp = measureLabelScreenPos(ms[0], BOOT_CAM);
  const bb = (await page.locator('.editor-canvas').boundingBox())!;
  await page.mouse.click(bb.x + lp[0], bb.y + lp[1]);
  expect(await measurements(page)).toEqual([]);
});

test('Dimensions toggle hides annotations without deleting them', async ({ page }) => {
  await draw(page);
  expect(await dimsVisible(page)).toBe(true);
  await page.getByTestId('btn-dimensions').click();
  expect(await dimsVisible(page)).toBe(false);
  expect(await measurements(page)).toHaveLength(1); // hidden, not deleted
  await page.getByTestId('btn-dimensions').click();
  expect(await dimsVisible(page)).toBe(true);
});
