/**
 * E2E for issue #146 (docked, collapsible HUD control panel).
 *
 * These are the acceptance criteria the happy-dom unit suite cannot
 * reach end-to-end:
 *  - the panel docks top-right, labels every slider with a live readout
 *    (walls %, clock, degrees) and mirrors the rendered floor's name;
 *  - the mode segment marks the CURRENT mode (aria-pressed);
 *  - collapsing hides the body but KEEPS the segment reachable, and the
 *    collapsed state survives a reload (localStorage), as does expanding.
 */
import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page): Promise<void> {
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
      return typeof s === 'object' && s !== null && s.meshCount > 0;
    },
    { timeout: 15_000 },
  );
  await page.getByTestId('hud-collapse-toggle').waitFor();
}

test.describe('docked HUD panel (issue #146)', () => {
  test('labels every slider and mirrors the rendered floor', async ({
    page,
  }) => {
    await boot(page);

    // Live value readouts right after boot (defaults: alpha 0, 12:00, 0°).
    await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('0%');
    await expect(page.getByTestId('hud-sun-time-label')).toHaveText('12:00');
    await expect(page.getByTestId('hud-sun-north-label')).toHaveText('0°');

    // Visible <label for> pairs (the sighted-user gap the redesign closes).
    await expect(page.getByText('Walls transparency')).toBeVisible();
    const labels = await page
      .locator('[data-testid="hud-panel-body"] label')
      .allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Walls transparency',
        'Time of day',
        'North offset',
      ]),
    );

    // Floor readout: no longer the empty placeholder once a plan renders.
    await expect(page.getByTestId('hud-floor-readout')).not.toHaveText('—');
    await expect(page.getByTestId('hud-floor-readout')).toHaveText('Ground');

    // Segment reflects the CURRENT mode: overview is the pressed one.
    await expect(page.getByTestId('hud-mode-segment-overview')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('hud-mode-segment-walk')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('collapses by mouse and keeps the mode segment reachable', async ({
    page,
  }) => {
    await boot(page);

    const body = page.getByTestId('hud-panel-body');
    const collapse = page.getByTestId('hud-collapse-toggle');
    await expect(body).toBeVisible();
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');

    await collapse.click();
    await expect(body).toBeHidden();
    await expect(collapse).toHaveAttribute('aria-expanded', 'false');
    // The always-on segment stays visible while collapsed.
    await expect(page.getByTestId('hud-mode-segment-walk')).toBeVisible();

    // ...and expanding restores the body.
    await collapse.click();
    await expect(body).toBeVisible();
  });

  test('collapsed state survives reload; expanding likewise', async ({
    page,
  }) => {
    await boot(page);

    await page.getByTestId('hud-collapse-toggle').click();
    await expect(page.getByTestId('hud-panel-body')).toBeHidden();

    // Reload: buildHud reads the persisted slot before first paint.
    await page.reload();
    await page.locator('.viewer-gl-canvas').waitFor();
    await expect(page.getByTestId('hud-panel-body')).toBeHidden();
    await expect(page.getByTestId('hud-collapse-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    // Expand, reload again: the expanded state persists too.
    await page.getByTestId('hud-collapse-toggle').click();
    await page.reload();
    await page.locator('.viewer-gl-canvas').waitFor();
    await expect(page.getByTestId('hud-panel-body')).toBeVisible();
  });

  test('sliders stay keyboard-operable while docked', async ({ page }) => {
    await boot(page);

    const walls = page.getByTestId('hud-walls-alpha');
    await walls.focus();
    await walls.press('ArrowRight');
    await walls.press('ArrowRight');
    await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('2%');

    // Home restores the boot state (native range semantics, unchanged).
    await walls.press('Home');
    await expect(page.getByTestId('hud-walls-alpha-label')).toHaveText('0%');
  });

  // Fix round for #146: the pre-fix strip (fixed `bottom: 52px`) was
  // beaten by the FIRST wrapped toast — 78 px tall — so the toast stack
  // (painted above it, DOM order) obscured the WASD/Esc hint. The pin
  // below measures REAL compositor boxes with a REAL stacked toast set,
  // so it fails on the old geometry and holds for any stack height.
  test('hint strip never collides with the toast stack', async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page);

    // Walk mode is where the persistent hint strip is shown.
    await page.getByTestId('hud-mode-segment-walk').click();

    // Raise a toast through the LIVE error path: a plan whose wall
    // thickness violates the schema is rejected by the viewer's
    // validator. #148's de-duplication collapses the 250 ms re-toasts
    // into ONE node with an ×N counter, so the stack never grows past
    // one entry anymore — one tall toast is enough to prove the
    // column-vs-strip geometry (even one entry is taller than the old
    // strip's whole 52 px offset).
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile('demo/demo-apartment.json', 'utf8');
    await page.evaluate((planJson) => {
      const plan = JSON.parse(planJson) as { wallThickness: number };
      plan.wallThickness = -1; // positive-finite rule → schema rejection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan(plan);
    }, raw);
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="hud-toast"]').length >= 1,
      { timeout: 10_000 },
    );

    const geom = await page.evaluate(() => {
      const box = (el: Element) => {
        const b = el.getBoundingClientRect();
        return {
          x: b.x,
          y: b.y,
          right: b.right,
          bottom: b.bottom,
          width: b.width,
          height: b.height,
        };
      };
      const strip = document.querySelector('.hud-strip');
      const stack = document.querySelector('.hud-toasts');
      return {
        strip: strip === null ? null : box(strip),
        hint: strip === null ? null : (strip.querySelector('.hud-hint')?.textContent ?? null),
        stack: stack === null ? null : box(stack),
        toasts: [...document.querySelectorAll('[data-testid="hud-toast"]')].map(box),
      };
    });

    // The strip is a real, visible box carrying a walk hint.
    expect(geom.strip).not.toBeNull();
    const strip = geom.strip!;
    expect(strip.width).toBeGreaterThan(0);
    expect(strip.height).toBeGreaterThan(0);
    expect(['Click to walk', 'WASD to move · Esc to release']).toContain(geom.hint);

    // GEOMETRY PIN: no toast may intersect the strip.
    const overlaps = (a: { x: number; y: number; right: number; bottom: number }, b: typeof strip) =>
      a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
    const collisions = geom.toasts
      .filter((t) => overlaps(t, strip))
      .map((t) => ({ strip, toast: t }));
    expect(collisions).toEqual([]);

    // ...and the column sits clear ABOVE the strip (8 px layout gap).
    expect(geom.stack).not.toBeNull();
    expect(strip.y - geom.stack!.bottom).toBeGreaterThan(1);
  });
});
