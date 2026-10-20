import { expect, test } from '@playwright/test';

// pkg #142 (Toolbar IA) — the headline acceptance criteria in one spec:
//  * the app bar never wraps/overflows horizontally at the 1280px
//    reference viewport (the reason the icon-only exception was granted)
//  * the left rail carries all 8 tools under their preserved names
//  * the File menu opens, exposes its 4 items and closes on Escape
//  * the status bar keeps its three zones (hint | cursor | total)
test.describe('toolbar IA (#142)', () => {
  test('app bar fits, rail carries the tools, File menu + status zones work', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();

    // --- app bar: single row, no horizontal overflow -------------------
    const appbar = page.locator('.editor-appbar');
    await expect(appbar).toBeVisible();
    const overflow = await appbar.evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const height = await appbar.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeLessThan(56); // >56px would mean a wrapped 2nd row

    // --- left rail: the 8 tools keep their accessible names ------------
    await expect(page.locator('.editor-rail')).toBeVisible();
    for (const name of [
      'Select',
      'Rectangle',
      'Polygon',
      'Door',
      'Window',
      'Furnish',
      'Stairs',
      'Measure',
    ]) {
      await expect(
        page.getByRole('button', { name, exact: true }),
      ).toBeVisible();
    }

    // --- File menu: open → items visible → Escape closes ---------------
    const fileMenu = page.getByTestId('file-menu');
    await expect(fileMenu).toBeHidden();
    await page.getByTestId('btn-file').click();
    await expect(fileMenu).toBeVisible();
    for (const id of [
      'btn-import',
      'btn-export-json',
      'btn-export',
      'btn-share',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(fileMenu).toBeHidden();

    // --- status bar: three zones --------------------------------------
    // The middle zone is EMPTY until the pointer is over the canvas (the
    // pointermove cursor meter, CP2) — drive it, then read it.
    const cb = (await page.locator('.editor-canvas').boundingBox())!;
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await expect(page.locator('.editor-status')).toBeVisible();
    await expect(page.getByTestId('status-coords')).toHaveText(
      /^-?\d+\.\d{2}, -?\d+\.\d{2} m$/,
    );
    await expect(page.getByTestId('status-total')).toContainText('Total:');
  });
});
