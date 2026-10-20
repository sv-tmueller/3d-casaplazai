/**
 * Popover focus vs. the draw gesture (pkg 155, issue #155) — regression pin.
 *
 * The A/B probe (mid-draw "S", Escape, release) showed the branch stealing
 * focus into the snap popover on a KEYBOARD open, which starved the pkg 8.2
 * (#94) draw-gesture Escape guard: the first Escape no longer reached the
 * canvas draw-cancel handler, so the in-flight rectangle COMMITTED on
 * release and the popover stayed open. Main's order is: Escape#1 cancels
 * the draft (popover survives), Escape#2 closes the popover and hands
 * focus back to the invoker.
 *
 * This spec pins that order together with the focus invariant that makes
 * it work: a popover opened mid-gesture must NOT move focus off the
 * canvas (trapFocus keeps Tab contained either way).
 */
import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Committed (stored) room count through the editor bridge. */
const rooms = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const data = (window as any).__casaplaza?.getData?.();
    return Array.isArray(data?.rooms) ? data.rooms.length : -1;
  });

/** Snap popover open state — the `hidden` attribute is the hiding truth. */
const snapOpen = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const pop = document.querySelector('[data-testid="snap-popover"]') as HTMLElement | null;
    return pop !== null && pop.hidden !== true;
  });

/** Active element: canvas identity (the Escape seam) + testid, if any. */
const active = (page: Page): Promise<{ isCanvas: boolean; testid: string | null }> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      isCanvas: el !== null && el === document.querySelector('.editor-canvas'),
      testid: el?.dataset?.testid ?? null,
    };
  });

test.describe('popover focus vs. draw gesture (pkg 155)', () => {
  test('mid-draw S + Escape cancels the draft; Escape#2 closes and restores focus', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor({ timeout: 20_000 });

    const roomsBefore = await rooms(page);
    expect(roomsBefore).toBeGreaterThanOrEqual(0);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    const box = await page.locator('.editor-canvas').boundingBox();
    if (!box) throw new Error('no canvas box');
    const start = { x: box.x + 60, y: box.y + 60 };
    const end = { x: box.x + 260, y: box.y + 200 };

    // Gesture in flight: the canvas owns the keyboard (Escape's seam).
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    expect((await active(page)).isCanvas, 'canvas must own focus mid-gesture').toBe(true);

    // "S" opens the popover WITHOUT stealing canvas focus — the regression:
    // a focus move into the popover disarms the #94 guard below.
    await page.keyboard.press('s');
    expect(await snapOpen(page), 'S must open the snap popover mid-draw').toBe(true);
    expect(
      (await active(page)).isCanvas,
      'a popover opened mid-draw must not steal canvas focus',
    ).toBe(true);

    // Escape#1: the draw-gesture guard wins — draft dies, popover survives.
    await page.keyboard.press('Escape');
    expect(await snapOpen(page), 'Escape#1 must not close the popover').toBe(true);

    // Release: with the draft cancelled this is a no-op; pre-fix it commits.
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await rooms(page), 'the cancelled draft must not commit a room').toBe(roomsBefore);
    expect(await snapOpen(page), 'the popover must survive the release').toBe(true);

    // Escape#2: now the popover closes and hands focus to its invoker.
    await page.keyboard.press('Escape');
    expect(await snapOpen(page), 'Escape#2 must close the popover').toBe(false);
    expect((await active(page)).testid, 'keyboard close must return focus to btn-snap').toBe(
      'btn-snap',
    );
  });
});
