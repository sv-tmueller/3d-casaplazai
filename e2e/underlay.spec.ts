/**
 * Blueprint underlay e2e (issue #99, pkg 12.1) — ADDITIVE suite.
 *
 * Journeys, driven mouseless-first (trackpad-only constraint):
 *  1. IMPORT + NUDGE: setInputFiles plants the committed fixture PNG;
 *     arrow keys nudge the selected underlay; the transform is
 *     asserted through the __editorUnderlay seam.
 *  2. LOCK PASS-THROUGH: locking removes the handles seam entirely
 *     (nothing intercepts) — unlocking restores them.
 *  3. RELOAD PERSISTENCE: the debounced casaplaza.underlay.v1 slot
 *     survives a page reload (fresh boot hydration).
 *  4. OPACITY/HIDE: the popover slider updates opacity; hiding blanks
 *     the seam-visible state without losing the slot.
 *
 * The fixture is an 83-byte 32×32 PNG (square aspect ⇒ the import fit
 * makes w == h == UNDERLAY_FIT_M = 6 m).
 */
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const FIXTURE = join(process.cwd(), 'e2e', 'fixtures', 'blueprint-tiny.png');

type UnderlayView = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotDeg: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
};

async function underlay(page: Page): Promise<UnderlayView | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__editorUnderlay?.() ?? null);
}

async function handles(page: Page): Promise<Array<[number, number]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__editorUnderlayHandles?.() ?? []);
}

async function importUnderlay(page: Page): Promise<void> {
  await page.setInputFiles('[data-testid="underlay-file-input"]', FIXTURE);
  await expect
    .poll(() => underlay(page), { timeout: 5_000 })
    .not.toBeNull();
}

test.describe.serial('blueprint underlay (issue #99)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();
    // Isolate this suite's localStorage lane from other specs.
    await page.evaluate(() => localStorage.removeItem('casaplaza.underlay.v1'));
  });

  test('import → nudge → verify (arrow keys move the image)', async ({ page }) => {
    await importUnderlay(page);

    const initial = (await underlay(page))!;
    expect(initial.w).toBeCloseTo(6, 1); // square fixture ⇒ equal sides
    expect(initial.h).toBeCloseTo(6, 1);
    expect(initial.opacity).toBe(60);
    expect(initial.locked).toBe(false);
    // Import selects the underlay: handles are live immediately.
    expect((await handles(page)).length).toBe(4);

    // Focus the canvas, nudge left + up (Shift widens the step).
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await underlay(page))!.cx).toBeLessThan(initial.cx);
    const nudged = (await underlay(page))!;
    expect(nudged.cx).toBeCloseTo(initial.cx - 0.1, 5);
    expect(nudged.cy).toBeCloseTo(initial.cy + 0.1, 5);

    // Undo must NOT rewind the nudge (non-undoable editor state).
    await page.keyboard.press('ControlOrMeta+z');
    expect((await underlay(page))!.cx).toBeCloseTo(nudged.cx, 5);

    // Corner resize: drag the TL handle AWAY from its BR anchor
    // (left+up) — dragging toward the anchor would shrink the rect.
    const h0 = (await handles(page))[0];
    const box = await page.locator('.editor-canvas').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + h0[0], box!.y + h0[1]);
    await page.mouse.down();
    await page.mouse.move(box!.x + h0[0] - 60, box!.y + h0[1] - 60, { steps: 4 });
    await page.mouse.up();
    const resized = (await underlay(page))!;
    expect(resized.w).toBeGreaterThan(initial.w);
    expect(resized.h).toBeGreaterThan(initial.h);
  });

  test('lock ⇒ pass-through: handles vanish, unlock restores', async ({ page }) => {
    await importUnderlay(page);
    expect((await handles(page)).length).toBe(4);

    // Open the popover and lock.
    await page.getByRole('button', { name: 'Underlay' }).click();
    await page.locator('[data-testid="underlay-popover"]').waitFor();
    await page.locator('[data-testid="underlay-lock"]').check();
    await expect.poll(async () => (await underlay(page))!.locked).toBe(true);

    // Locked ⇒ no handles ⇒ nothing can intercept canvas clicks.
    expect(await handles(page)).toEqual([]);

    // The popover stayed open (checking never dismisses it) — unlock
    // directly through the same checkbox.
    await page.locator('[data-testid="underlay-lock"]').uncheck();
    await expect.poll(async () => (await underlay(page))!.locked).toBe(false);
    // Still not "selected" (locking deselected) — a handle grab
    // re-selects, proving hit-testing works again.
    const hs = await handles(page);
    expect(hs.length).toBe(0); // unselected ⇒ gated seam empty…
    // …but clicking near the image's corner handle re-engages: the
    // popover's own geometry is unchanged, so aim at the stored corner.
    const u = (await underlay(page))!;
    const box = await page.locator('.editor-canvas').boundingBox();
    // Screen corner of TL: world (cx−w/2, cy+h/2) at boot camera 80px/m.
    const sx = box!.x + (u.cx - u.w / 2) * 80;
    const sy = box!.y - (u.cy + u.h / 2) * 80;
    await page.mouse.click(sx, sy);
    expect((await handles(page)).length).toBe(4);
  });

  test('reload persistence: the underlay survives a fresh boot', async ({ page }) => {
    await importUnderlay(page);
    const before = (await underlay(page))!;
    // Nudge listens on the CANVAS (mouseless flow: canvas is focused).
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await underlay(page))!.cx)
      .toBeGreaterThan(before.cx);

    // Let the 800 ms debounce fire, then reload the SAME origin.
    await page.waitForTimeout(1_200);
    await page.reload();
    await page.locator('.editor-canvas').waitFor();

    const after = (await underlay(page))!;
    expect(after).not.toBeNull();
    expect(after.cx).toBeCloseTo(before.cx + 0.1, 5);
    expect(after.opacity).toBe(60);
    // Reload deselects (selection is transient) — handles gated off.
    expect(await handles(page)).toEqual([]);
  });

  test('popover opacity + hide', async ({ page }) => {
    await importUnderlay(page);
    await page.getByRole('button', { name: 'Underlay' }).click();
    const popover = page.locator('[data-testid="underlay-popover"]');
    await popover.waitFor();

    // Range inputs don't take .fill() reliably — set + dispatch the
    // same event sequence a real drag produces (input THEN change).
    await page.evaluate(() => {
      const s = document.querySelector('[data-testid="underlay-opacity"]') as HTMLInputElement;
      s.value = '25';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(async () => (await underlay(page))!.opacity).toBe(25);
    await expect(page.locator('[data-testid="underlay-opacity-value"]')).toHaveText('25%');

    // Hide blanks the visible state but keeps the slot.
    await page.locator('[data-testid="underlay-hide"]').check();
    await expect.poll(async () => (await underlay(page))!.hidden).toBe(true);
    expect(await handles(page)).toEqual([]);

    // Remove wipes the slot entirely (debounced write → poll storage).
    await page.getByTestId('btn-underlay-remove').click();
    await expect.poll(() => underlay(page)).toBeNull();
    await expect
      .poll(
        () => page.evaluate(() => localStorage.getItem('casaplaza.underlay.v1')),
        { timeout: 3_000 },
      )
      .toBeNull();
  });
});
