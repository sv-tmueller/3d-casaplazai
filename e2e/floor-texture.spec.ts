/**
 * Floor-texture e2e (pkg 14.4, issue #119): the inspector's floor-
 * material chooser, walked end to end.
 *
 * The AC headlines: the pick is MOUSELESS (I opens the panel, Tab lands
 * on the checked radio — a radio group is one tab stop — and
 * ArrowLeft/ArrowRight move within it), the 2D canvas paints a VISIBLY
 * different region per material, two rooms keep independent picks, the
 * pick survives the autosave reload, and it rides the share link into a
 * fresh recipient context.
 */

import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE as SCALE } from './fixtures/camConstants';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/** World → ABSOLUTE page coords (camera origin is (0,0) at boot). */
async function aim(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

/** Two-room studio: r1 untextured, r2 pre-painted carpet (per-room proof). */
async function loadTwoRooms(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan({
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [
        {
          id: 'r1',
          name: 'Studio A',
          // CCW winding (positive shoelace) — the autosave hydrate leg
          // VALIDATES the slot, and the v2 validator rejects CW polygons.
          polygon: [
            [0.5, -0.5],
            [0.5, -3.5],
            [4.5, -3.5],
            [4.5, -0.5],
          ],
          floorTexture: null,
        },
        {
          id: 'r2',
          name: 'Studio B',
          polygon: [
            [5, -0.5],
            [5, -3.5],
            [7, -3.5],
            [7, -0.5],
          ],
          floorTexture: 'carpet',
        },
      ],
      openings: [],
      furniture: [],
    });
  });
}

/** Floor materials per room id, straight from the live store. */
async function textures(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (window as any).__casaplaza.getCurrent();
    const out: Record<string, string | null> = {};
    for (const f of cur.floors) for (const r of f.rooms) out[r.id] = r.floorTexture;
    return out;
  });
}

/** 16×16 device-pixel sample at a world point (room interior). */
async function sampleRegion(page: Page, wx: number, wy: number): Promise<number[]> {
  const p = await aim(page, wx, wy);
  return page.evaluate(
    ({ x, y }) => {
      const c = document.querySelector('.editor-canvas') as HTMLCanvasElement;
      const rect = c.getBoundingClientRect();
      const dpr = c.width / rect.width;
      const ctx = c.getContext('2d')!;
      const px = Math.round((x - rect.left) * dpr);
      const py = Math.round((y - rect.top) * dpr);
      return Array.from(ctx.getImageData(px - 8, py - 8, 16, 16).data);
    },
    { x: p.x, y: p.y },
  );
}

function differingChannels(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i]! - b[i]!) > 8) n += 1;
  }
  return n;
}

/** Interior-click a room, focus the canvas, open the panel with I. */
async function openPanelOn(page: Page, wx: number, wy: number): Promise<void> {
  const p = await aim(page, wx, wy);
  await page.mouse.click(p.x, p.y);
  await page.locator('.editor-canvas').focus();
  await page.keyboard.press('i');
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
}

/** Esc with focus inside closes the panel (dismissal discipline). */
async function closePanel(page: Page): Promise<void> {
  await page.getByTestId('btn-close-inspector').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspector-panel')).toBeHidden();
}

test.describe.serial('floor texture picker (issue #119)', () => {
  test.beforeEach(async ({ page }) => {
    await loadTwoRooms(page);
  });

  test('mouseless pick paints patterns; autosave + share-link keep it', async ({
    page,
    browser,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    // Select r1 by an interior click; canvas-focused I opens the panel.
    await openPanelOn(page, 2.5, -2);
    await expect(page.getByTestId('insp-floor-material')).toBeVisible();
    await expect(page.getByTestId('insp-tex-none')).toBeChecked();

    const plain = await sampleRegion(page, 2.5, -2);

    // MOUSELESS: Tab from the panel root lands on Close, then on the
    // group's CHECKED radio (a radio group is a single tab stop).
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('btn-close-inspector')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('insp-tex-none')).toBeFocused();

    // None → wood → tile with ArrowRight only; each pick commits.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('insp-tex-wood')).toBeChecked();
    await expect(page.getByTestId('insp-tex-none')).not.toBeChecked();
    expect(await textures(page)).toMatchObject({ r1: 'wood', r2: 'carpet' });
    // FIX ROUND 1 (finding 3): no fixed sleeps. glue repaints
    // SYNCHRONOUSLY off the store subscribe (glue.ts) and sampleRegion
    // reads the live canvas backing store, so the committed-state
    // assertion above IS the repaint signal.
    const wood = await sampleRegion(page, 2.5, -2);

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('insp-tex-tile')).toBeChecked();
    const tile = await sampleRegion(page, 2.5, -2);

    // The 2D canvas: material vs no-material changes the region, and
    // two materials differ from each other (patterns are per-kind).
    expect(differingChannels(plain, wood)).toBeGreaterThan(50);
    expect(differingChannels(wood, tile)).toBeGreaterThan(50);

    // ArrowLeft walks back; focus stays on the checked radio.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('insp-tex-wood')).toBeChecked();
    expect(await textures(page)).toMatchObject({ r1: 'wood' });
    await expect(page.getByTestId('insp-tex-wood')).toBeFocused();

    // PER-ROOM STATE: clicking r2 flips the open panel to ITS pick…
    const q = await aim(page, 6, -2);
    await page.mouse.click(q.x, q.y);
    await expect(page.getByTestId('insp-tex-carpet')).toBeChecked();
    await expect(page.getByTestId('insp-tex-wood')).not.toBeChecked();

    // …and back to r1: its wood pick is intact.
    const p2 = await aim(page, 2.5, -2);
    await page.mouse.click(p2.x, p2.y);
    await expect(page.getByTestId('insp-tex-wood')).toBeChecked();

    await closePanel(page);

    // AUTOSAVE LEG: poll the SLOT itself instead of waiting out the
    // debounce (fix round 1, finding 3) — "slot holds both picks" is the
    // deterministic signal; the 800 ms debounce is an implementation
    // detail. The slot carries RAW v2 data (pkg 7.2/issue #75), so rooms
    // nest under floors[0] — and an explicit null when untextured
    // (finding 1: the intake backfill keeps this payload reload-safe).
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() =>
          localStorage.getItem('casaplaza.autosave.v1'),
        );
        if (raw === null) return null;
        try {
          const rooms = (
            JSON.parse(raw) as {
              floors?: { rooms?: { id: string; floorTexture?: string | null }[] }[];
            }
          ).floors?.[0]?.rooms ?? [];
          const byId: Record<string, string | null> = {};
          for (const r of rooms) byId[r.id] = r.floorTexture ?? null;
          return { r1: byId['r1'], r2: byId['r2'] };
        } catch {
          return null;
        }
      })
      .toEqual({ r1: 'wood', r2: 'carpet' });
    await page.reload();
    await page.locator('.editor-canvas').waitFor();
    expect(await textures(page)).toMatchObject({ r1: 'wood', r2: 'carpet' });
    await openPanelOn(page, 2.5, -2);
    await expect(page.getByTestId('insp-tex-wood')).toBeChecked();
    await closePanel(page);

    // SHARE-LINK LEG: mouseless share (Tab to the button, Enter), then a
    // fresh recipient context with no state but the URL.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') ?? '',
      );
      if (focused === 'btn-share') break;
    }
    await expect(page.locator(':focus')).toHaveAttribute('data-testid', 'btn-share');
    await page.keyboard.press('Enter');
    await expect(page.locator('.inline-msg')).toContainText('Share link copied');
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('#plan=v1.');

    const ctx = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const recipient = await ctx.newPage();
    const recipientErrors: string[] = [];
    recipient.on('pageerror', (err) => recipientErrors.push(String(err)));
    await recipient.goto(url);
    await recipient.locator('.editor-canvas').waitFor();
    await recipient.waitForFunction(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cur = (window as any).__casaplaza?.getCurrent?.();
      return !!cur && typeof cur.floors?.length === 'number' && cur.floors.length > 0;
    });
    expect(await textures(recipient)).toMatchObject({ r1: 'wood', r2: 'carpet' });
    await openPanelOn(recipient, 2.5, -2);
    await expect(recipient.getByTestId('insp-tex-wood')).toBeChecked();

    expect(errors).toEqual([]);
    expect(recipientErrors).toEqual([]);
    await ctx.close();
  });

  test('raw payload WITHOUT the floorTexture key: None checked, pickable, no crash', async ({
    page,
  }) => {
    // The loadPlan bridge takes raw payloads (the mini-3D specs seed a
    // plan whose rooms omit floorTexture entirely) — the painter AND the
    // picker must tolerate the missing field: no page errors, "None"
    // reads as checked, and the first pick still commits.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan({
        schemaVersion: 1,
        units: 'meters',
        wallHeight: 2.7,
        wallThickness: 0.24,
        rooms: [
          {
            id: 'r1',
            name: 'Studio A',
            polygon: [
              [0.5, -0.5],
              [0.5, -3.5],
              [4.5, -3.5],
              [4.5, -0.5],
            ],
            // floorTexture intentionally OMITTED.
          },
        ],
        openings: [],
        furniture: [],
      });
    });

    await openPanelOn(page, 2.5, -2);
    await expect(page.getByTestId('insp-tex-none')).toBeChecked();

    // FIX ROUND 1 (finding 1, data loss): the keyless payload was
    // persisted WITHOUT the floorTexture key. At tip the next boot's
    // hydrate validation rejected the slot (undefined is not null) and
    // emptyPlan silently replaced the whole plan — reload must keep it,
    // with an explicit null.
    await page.reload();
    await page.locator('.editor-canvas').waitFor();
    expect(await textures(page)).toMatchObject({ r1: null });

    await openPanelOn(page, 2.5, -2);
    await expect(page.getByTestId('insp-tex-none')).toBeChecked();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('insp-tex-wood')).toBeChecked();
    expect(await textures(page)).toMatchObject({ r1: 'wood' });

    expect(errors).toEqual([]);
  });
});
