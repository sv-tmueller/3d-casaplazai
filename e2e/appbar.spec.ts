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
    // --- status bar: hovering the canvas publishes cursor coords --------
    // (pkg #144: the first-run empty-state card sits over the canvas
    // center on a fresh profile and eats the hover; arming a drawing
    // tool via the card's own Draw button steps it aside, so the hover
    // reaches the canvas instead of the card.)
    const card = page.getByTestId('empty-state-card');
    if (await card.count()) {
      await page.getByTestId('empty-draw-room').click();
      await expect(card).toBeHidden();
    }
    const cb = (await page.locator('.editor-canvas').boundingBox())!;
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await expect(page.locator('.editor-status')).toBeVisible();
    await expect(page.getByTestId('status-coords')).toHaveText(
      /^-?\d+\.\d{2}, -?\d+\.\d{2} m$/,
    );
    await expect(page.getByTestId('status-total')).toContainText('Total:');

    // --- #142 AC: the retired entity-count debug string stays retired -----
    await expect(page.locator('.editor-status')).not.toHaveText(
      /rooms:|openings:|undo/,
    );

    // --- #142 AC: snap popover sits in its .pop-anchor and closes on -----
    // an outside pointerdown (relocated-popover dismissal sentinel).
    const snap = page.getByTestId('snap-popover');
    await expect(snap).toBeHidden();
    await page.getByTestId('btn-snap').click();
    await expect(snap).toBeVisible();
    expect(await snap.evaluate((el) => el.closest('.pop-anchor') !== null)).toBe(
      true,
    );
    await page.mouse.click(cb.x + 24, cb.y + 24);
    await expect(snap).toBeHidden();

    // --- #142 (finding 1): the icon-only floor trio renders glyphs -----
    // (blank ~30px squares were the defect; pin real svg children).
    for (const id of ['btn-prev-floor', 'btn-next-floor', 'btn-add-floor']) {
      await expect(page.getByTestId(id).locator('svg.editor-btn-icon')).toHaveCount(1);
    }
  });
});
