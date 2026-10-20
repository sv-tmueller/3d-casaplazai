/**
 * Walk-mode entry affordances e2e (issue #30): entering walk raises a
 * centered "Click to walk" overlay (reticle hidden); once pointer lock is
 * held the overlay gives way to the center reticle.
 *
 * Headless pointer lock is unreliable (see viewer.spec.ts:105), so lock is
 * MOCKED: the canvas is reported as pointerLockElement and a synthetic
 * pointerlockchange is dispatched. We assert VISIBILITY STATES only, never
 * real lock success; the auto-lock attempt is observed via a prototype spy.
 */

import { expect, test, type Page } from '@playwright/test';

/** Boot copied from e2e/viewer.spec.ts:31 (Pkg 1 owns that file; do not edit). */
async function boot(page: Page): Promise<void> {
  await page.goto('/viewer');
  await page.locator('.viewer-gl-canvas').waitFor();
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
  await page.waitForFunction(
    () => document.querySelector('[data-testid="hud-mode-toggle"]') !== null,
    { timeout: 15_000 },
  );
}

test.describe('walk-mode entry affordances (issue #30)', () => {
  test('overlay prompts on entry; mocked lock swaps it for the reticle', async ({
    page,
  }) => {
    await boot(page);

    // Neutralize the real lock request so the unlocked state is
    // deterministic headless; count attempts to prove the entry path tries.
    await page.evaluate(() => {
      const w = window as unknown as { __lockAttempts: number };
      w.__lockAttempts = 0;
      Element.prototype.requestPointerLock = function stubPointerLock() {
        w.__lockAttempts += 1;
        return Promise.resolve();
      } as Element['requestPointerLock'];
    });

    const overlay = page.locator('[data-testid="walk-entry-overlay"]');
    const reticle = page.locator('[data-testid="walk-reticle"]');
    await expect(overlay).toBeHidden();
    await expect(reticle).toBeHidden();

    // Enter walk via the mode segment, then wait out the 320 ms fade.
    await page.locator('[data-testid="hud-mode-segment-walk"]').click();
    await page.waitForTimeout(700);

    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Click to walk');
    await expect(reticle).toBeHidden();
    expect(
      await page.evaluate(
        () => (window as unknown as { __lockAttempts: number }).__lockAttempts,
      ),
    ).toBeGreaterThan(0);

    // MOCK the lock: report the canvas as locked, then fire the event.
    await page.evaluate(() => {
      const canvas = document.querySelector('.viewer-gl-canvas');
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => canvas,
      });
      document.dispatchEvent(new Event('pointerlockchange'));
    });

    await expect(overlay).toBeHidden();
    await expect(reticle).toBeVisible();
  });
});

test.describe('focused HUD controls keep arrow keys (issue #134)', () => {
  test('ArrowRight moves a focused slider, not the walker', async ({
    page,
  }) => {
    await boot(page);

    // Neutralize the real lock request so the unlocked walk state is
    // deterministic headless (same stub as the entry-affordance leg).
    await page.evaluate(() => {
      Element.prototype.requestPointerLock = function stubPointerLock() {
        return Promise.resolve();
      } as Element['requestPointerLock'];
    });

    // Enter (unlocked) walk mode and wait out the fade.
    await page.locator('[data-testid="hud-mode-toggle"]').click();
    await page.waitForTimeout(700);

    // Focus the walls-transparency slider and read its baseline.
    const slider = page.locator('[data-testid="hud-walls-alpha"]');
    await slider.focus();
    const before = Number(await slider.inputValue());

    // Baseline walker position (unlocked walk still integrates arrows).
    const camBefore = (await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__viewerCam(),
    )) as { discX: number; discY: number };

    await page.keyboard.press('ArrowRight');

    // The slider advanced (native range input consumed the arrow).
    const after = Number(await slider.inputValue());
    expect(after).toBeGreaterThan(before);

    // The walker stayed still: the disc did not integrate the press.
    const camAfter = (await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__viewerCam(),
    )) as { discX: number; discY: number };
    expect(Math.abs(camAfter.discX - camBefore.discX)).toBeLessThan(1e-6);
    expect(Math.abs(camAfter.discY - camBefore.discY)).toBeLessThan(1e-6);
  });

  test('walker arrows still work when no input is focused', async ({
    page,
  }) => {
    await boot(page);
    await page.evaluate(() => {
      Element.prototype.requestPointerLock = function stubPointerLock() {
        return Promise.resolve();
      } as Element['requestPointerLock'];
    });
    await page.locator('[data-testid="hud-mode-toggle"]').click();
    await page.waitForTimeout(700);

    // Make sure nothing in the HUD owns focus.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });

    const before = (await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__viewerCam(),
    )) as { discX: number; discY: number };

    // Hold ArrowRight long enough for the smoothed integrator to move.
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowRight');

    const after = (await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__viewerCam(),
    )) as { discX: number; discY: number };
    const moved =
      Math.abs(after.discX - before.discX) +
      Math.abs(after.discY - before.discY);
    expect(moved).toBeGreaterThan(1e-3);
  });
});
