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
});
