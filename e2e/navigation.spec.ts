/**
 * Navigation, theme and motion (issue #126 / #168 on the workspace since
 * #178): the Pan tool and the Space-hold temporary pan, "0" fitting the
 * plan clear of the tool card, the theme toggle (tokens + canvas palette,
 * persisted, exports stay white), dark chrome surfaces, and reduced
 * motion zeroing every transition.
 */
import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE } from './fixtures/camConstants';
import {
  CANVAS,
  TOOLCARD_INSET,
  command,
  getCam,
  openWorkspace,
  readDemo,
  seedPlan,
} from './fixtures/workspace';

const ONE_ROOM = {
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [{ id: 'r1', name: 'Solo', polygon: [[5, -3], [7, -3], [7, -1], [5, -1]], floorTexture: null, wallsOverride: [] }],
  openings: [],
  furniture: [],
};

/** A seeded room retires the first-run card (it floats over the canvas). */
async function openWithRoom(page: Page): Promise<void> {
  await openWorkspace(page);
  await seedPlan(page, ONE_ROOM);
  await expect(page.getByTestId('ws-empty')).toBeHidden();
}

/** Left-drag from a free spot right of the tool card by (dx, dy) px. */
async function dragCanvas(page: Page, dx: number, dy: number): Promise<void> {
  const box = (await page.locator(CANVAS).boundingBox())!;
  const x = box.x + box.width * 0.75;
  const y = box.y + box.height * 0.75;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

/** Mean RGB of a 9×9 patch at the canvas centre (device px). */
async function canvasCentreMean(page: Page): Promise<number> {
  const values = await page.evaluate(() => {
    const c = document.querySelector('.editor-canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(Math.floor(c.width * 0.75) - 4, Math.floor(c.height * 0.75) - 4, 9, 9).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  });
  return values.reduce((a, v) => a + v, 0) / values.length;
}

const lin = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (css: string): number => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * A chrome surface renders dark and its text clears 4.5:1 on it. Colours
 * transition over the duration tokens after the theme toggle, so both reads
 * poll until the transition has settled instead of sampling once (#191).
 */
async function expectDarkSurface(page: Page, sel: string, textSel?: string): Promise<void> {
  const read = () =>
    page.locator(sel).first().evaluate((el, ts) => {
      const cs = getComputedStyle(el);
      const t = ts ? el.querySelector(ts) : null;
      return { bg: cs.backgroundColor, color: t ? getComputedStyle(t).color : cs.color };
    }, textSel ?? null);
  await expect
    .poll(async () => lum((await read()).bg), { message: `${sel}: background luminance` })
    .toBeLessThan(0.05);
  await expect
    .poll(
      async () => {
        const { bg, color } = await read();
        return contrast(color, bg);
      },
      { message: `${sel}: text contrast on background` },
    )
    .toBeGreaterThanOrEqual(4.5);
}

test('Pan tool: keyboard-reachable button arms pan; left-drag pans the camera', async ({ page }) => {
  await openWithRoom(page);
  const pan = command(page, 'tool.pan');
  await pan.focus();
  await page.keyboard.press('Enter');
  await expect(pan).toHaveAttribute('aria-pressed', 'true');
  await expect(command(page, 'tool.select')).toHaveAttribute('aria-pressed', 'false');
  const before = await getCam(page);
  await dragCanvas(page, 60, 40);
  const after = await getCam(page);
  expect(after.originX).toBeCloseTo(before.originX - 60 / before.scale, 3);
  expect(after.originY).toBeCloseTo(before.originY + 40 / before.scale, 3);
  expect(after.scale).toBeCloseTo(before.scale, 6);
});

test('Space-hold arms Pan temporarily and releasing restores the previous tool', async ({ page }) => {
  await openWithRoom(page);
  await page.locator(CANVAS).focus();
  await page.keyboard.down('Space');
  await expect(command(page, 'tool.pan')).toHaveAttribute('aria-pressed', 'true');
  const before = await getCam(page);
  await dragCanvas(page, -80, 0);
  expect((await getCam(page)).originX).toBeCloseTo(before.originX + 80 / before.scale, 3);
  await page.keyboard.up('Space');
  await expect(command(page, 'tool.select')).toHaveAttribute('aria-pressed', 'true');
  await expect(command(page, 'tool.pan')).toHaveAttribute('aria-pressed', 'false');
});

test('Space released mid-pan-drag finalizes the drag (no stranded pan)', async ({ page }) => {
  await openWithRoom(page);
  const canvas = page.locator(CANVAS);
  await canvas.focus();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.75;
  const y = box.y + box.height * 0.75;
  await page.keyboard.down('Space');
  await expect(canvas).toHaveClass(/pan-armed/);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 30, { steps: 4 });
  await expect(canvas).toHaveClass(/pan-dragging/);
  await page.keyboard.up('Space');
  await page.mouse.up();
  await expect(canvas).not.toHaveClass(/pan-dragging/);
  await expect(command(page, 'tool.select')).toHaveAttribute('aria-pressed', 'true');
});

test('an explicit Pan pick during a Space-hold survives the Space release', async ({ page }) => {
  await openWithRoom(page);
  await page.locator(CANVAS).focus();
  await page.keyboard.down('Space');
  await expect(command(page, 'tool.pan')).toHaveAttribute('aria-pressed', 'true');
  await command(page, 'tool.pan').click();
  await page.keyboard.up('Space');
  await expect(command(page, 'tool.pan')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(CANVAS)).toHaveClass(/pan-armed/);
});

test('"0" keeps the neutral camera on an empty plan and frames a demo clear of the tool card', async ({ page }) => {
  await openWorkspace(page);
  await page.locator(CANVAS).focus();
  await page.keyboard.press('0');
  expect(await getCam(page)).toEqual({ originX: 0, originY: 0, scale: CAM_SCALE });

  await seedPlan(page, await readDemo('apartment'));
  const box = (await page.locator(CANVAS).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.wheel(0, -240);
  const zoomed = await getCam(page);
  await page.locator(CANVAS).focus();
  await page.keyboard.press('0');
  const fitted = await getCam(page);
  expect(Math.abs(fitted.scale - zoomed.scale)).toBeGreaterThan(0.5);
  await page.keyboard.press('0');
  expect(await getCam(page)).toEqual(fitted);
  const inside = await page.evaluate(
    ({ cam, left }) => {
      const plan = (window as unknown as { __casaplaza: { getData(): { rooms: Array<{ polygon: number[][] }> } } }).__casaplaza.getData();
      const c = document.querySelector('.editor-canvas') as HTMLCanvasElement;
      return plan.rooms.flatMap((r) => r.polygon).every(([wx, wy]) => {
        const sx = (wx - cam.originX) * cam.scale;
        const sy = (cam.originY - wy) * cam.scale;
        return sx >= left - 1 && sx <= c.clientWidth + 1 && sy >= -1 && sy <= c.clientHeight + 1;
      });
    },
    { cam: fitted, left: TOOLCARD_INSET },
  );
  expect(inside).toBe(true);
});

test('theme toggle sets data-theme, persists, darkens the canvas, keeps exports white', async ({ page }) => {
  await openWorkspace(page);
  const toggle = command(page, 'theme.toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await canvasCentreMean(page)).toBeGreaterThan(200);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await canvasCentreMean(page)).toBeLessThan(80);

  await page.reload();
  await page.locator(CANVAS).waitFor();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(command(page, 'theme.toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await canvasCentreMean(page)).toBeLessThan(80);

  await page.getByTestId('ws-export').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('ws-export-confirm').click();
  const path = await (await download).path();
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path!);
  const mean = await page.evaluate(async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, off.width, off.height).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 4 * 37) {
      sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      n += 1;
    }
    return sum / n;
  }, `data:image/png;base64,${bytes.toString('base64')}`);
  expect(mean).toBeGreaterThan(220);
});

test('dark theme reaches every chrome surface: bars, cards, inspector, dialogs', async ({ page }) => {
  await openWithRoom(page);
  await command(page, 'theme.toggle').click();
  await expectDarkSurface(page, '[data-testid="ws-topbar"]');
  await expectDarkSurface(page, '[data-testid="ws-statusbar"]', '[data-testid="ws-status-hint"]');
  await expectDarkSurface(page, '[data-testid="ws-toolcard"]', '.ui-tab');
  await page.locator(CANVAS).focus();
  await page.keyboard.press('i');
  await expect(page.getByTestId('ws-inspector')).toBeVisible();
  await expectDarkSurface(page, '[data-testid="ws-inspector"]', '.inspector-section-title');
  await page.getByTestId('ws-help').click();
  await expectDarkSurface(page, '[data-testid="ws-shortcuts"]', 'td');
  await page.keyboard.press('Escape');
  await page.getByTestId('ws-export').click();
  await expectDarkSurface(page, '[data-testid="ws-export-dialog"]', '.ws-dialog-text');
});

test('reduced motion zeroes every transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWithRoom(page);
  const durations = await page.evaluate(() =>
    ['.ui-btn', '.ui-tab', '.ui-segment-item', '.ui-toggle-track', '.ws-fade'].map((sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).transitionDuration : 'missing';
    }),
  );
  expect(durations.every((d) => d.split(',').every((p) => p.trim() === '0s'))).toBe(true);
  // A view switch therefore plays no veil either.
  await page.keyboard.press('2');
  await expect(page.getByTestId('ws-view-3d')).toHaveAttribute('aria-checked', 'true');
  expect(await page.locator('.ws-fade').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});
