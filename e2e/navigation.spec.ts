/**
 * Issue #126 (Pkg 14.x) e2e: Pan tool, fit-to-plan "0", dark theme.
 *
 * Additive-green: pins only the NEW surfaces (#126) — btn-pan, the
 * Space-hold temp pan, the "0" shortcut (folded into the Center button's
 * fitToPlan seam) and the editor theme preference — plus the standing
 * export-stays-white guarantee under a dark canvas.
 */
import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE } from './fixtures/camConstants';

type Cam = { originX: number; originY: number; scale: number };

async function getCam(page: Page): Promise<Cam> {
  return page.evaluate(
    () => (window as unknown as { __editorCam: () => Cam }).__editorCam(),
  );
}

async function canvasBox(page: Page) {
  const box = await page.locator('.editor-canvas').boundingBox();
  if (!box) throw new Error('editor canvas has no bounding box');
  return box;
}

/** Left-drag from the canvas centre by (dx, dy) CSS px. */
async function dragCanvas(page: Page, dx: number, dy: number): Promise<void> {
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
  await page.mouse.up();
}

async function loadDemoPlan(page: Page): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile('demo/demo-apartment.json', 'utf8');
  await page.evaluate((planJson) => {
    (
      window as unknown as { __casaplaza: { loadPlan: (p: unknown) => void } }
    ).__casaplaza.loadPlan(JSON.parse(planJson) as unknown);
  }, raw);
}

/** Mean RGB of a 9x9 patch at the canvas centre (device px). */
async function canvasCentreMean(page: Page): Promise<number> {
  const values = await page.evaluate(() => {
    const c = document.querySelector('.editor-canvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const x = Math.floor(c.width / 2);
    const y = Math.floor(c.height / 2);
    const d = ctx.getImageData(x - 4, y - 4, 9, 9).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  });
  return values.reduce((a, v) => a + v, 0) / values.length;
}

/* --------------- fix round (PR #168 findings 1-3) below --------------- */

/** sRGB channel (0..255) -> linear light (WCAG 2.x). */
function linearChannel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0..1) of a computed 'rgb(r, g, b)' colour. */
function relLuminance(css: string): number {
  const ch = css.match(/[\d.]+/g);
  if (!ch || ch.length < 3) throw new Error(`not an rgb() colour: ${css}`);
  const [r, g, b] = ch.slice(0, 3).map(Number);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/** WCAG contrast ratio between two computed 'rgb(r, g, b)' colours. */
function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Computed background + text colour of a selector. */
async function surfaceColors(page: Page, sel: string): Promise<{ bg: string; color: string }> {
  return page.locator(sel).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  });
}

/** #168: a chrome surface must render dark (white scores 1.0) with >=4.5:1 text. */
async function expectDarkSurface(page: Page, sel: string): Promise<void> {
  const { bg, color } = await surfaceColors(page, sel);
  expect(bg.startsWith('rgb('), `${sel}: background ${bg} must be opaque`).toBe(true);
  expect(relLuminance(bg), `${sel}: still-light background ${bg}`).toBeLessThan(0.05);
  expect(contrastRatio(color, bg), `${sel}: text ${color} on ${bg}`).toBeGreaterThanOrEqual(4.5);
}

/** #168: text element (when present) must clear 4.5:1 on its own surface. */
async function expectTextOnSurface(page: Page, textSel: string, surfaceSel: string): Promise<void> {
  const { bg, color } = await surfaceColors(page, surfaceSel);
  const text = page.locator(textSel);
  const own = (await text.count()) > 0 ? await text.first().evaluate((el) => getComputedStyle(el).color) : color;
  expect(contrastRatio(own, bg), `${textSel}: text ${own} on ${surfaceSel} ${bg}`).toBeGreaterThanOrEqual(4.5);
}

test('dark theme tokenizes the chrome panels (Inspector / Help modal / Export dialog)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  await page.getByTestId('btn-theme').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  // Inspector panel: the dark tokens must reach it with no JS involved.
  const inspector = page.locator('.inspector-panel');
  if (!(await inspector.isVisible())) await page.getByTestId('btn-inspector').click();
  await expect(inspector).toBeVisible();
  await expectDarkSurface(page, '.inspector-panel');
  // Muted panel text was hardcoded slate before the tokenization.
  await expectTextOnSurface(page, '.inspector-section-title', '.inspector-panel');
  await expectTextOnSurface(page, '.inspector-summary dt', '.inspector-panel');

  // Help modal (opened from the toolbar, closed again with Escape).
  await page.getByTestId('btn-help').click();
  await expect(page.locator('.help-modal-panel')).toBeVisible();
  await expectDarkSurface(page, '.help-modal-panel');
  await expectTextOnSurface(page, '.help-modal-table .help-keys', '.help-modal-panel');
  await page.keyboard.press('Escape');
  await expect(page.locator('.help-modal-panel')).toBeHidden();

  // Export dialog (anchored panel over the canvas).
  // #142 folded Export into the File popover; open it first.
  await page.getByTestId('btn-file').click();
  await page.getByTestId('btn-export').click();
  await expect(page.locator('.export-dialog-panel')).toBeVisible();
  await expectDarkSurface(page, '.export-dialog-panel');
  await expectTextOnSurface(page, '.export-fieldset legend', '.export-dialog-panel');
});

/** Composite a possibly-translucent 'rgba(r, g, b, a)' over an opaque backdrop. */
function compositeOver(fg: string, backdrop: string): string {
  const f = (fg.match(/[\d.]+/g) ?? []).map(Number);
  const b = (backdrop.match(/[\d.]+/g) ?? []).map(Number);
  if (f.length < 3 || b.length < 3) throw new Error(`not rgb colours: ${fg} / ${backdrop}`);
  const alpha = f.length > 3 ? f[3] : 1;
  return `rgb(${[0, 1, 2].map((i) => Math.round(alpha * f[i] + (1 - alpha) * b[i])).join(', ')})`;
}

/**
 * #168 fix round 2: viewer-HUD ink must clear 4.5:1 over its own (pinned
 * light) backdrop — the element's background composited over the viewer
 * pane's light backdrop, or the pane itself for ink with no chip of its own.
 */
async function expectHudInkLegible(page: Page, sel: string): Promise<void> {
  const { ink, chip, pane } = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const paneEl = document.querySelector('.pane-viewer');
    if (!el || !paneEl) throw new Error(`missing ${s} or .pane-viewer`);
    const cs = getComputedStyle(el);
    return {
      ink: cs.color,
      chip: cs.backgroundColor,
      pane: getComputedStyle(paneEl).backgroundColor,
    };
  }, sel);
  const effective = compositeOver(chip, pane);
  expect(
    relLuminance(effective),
    `${sel}: HUD backdrop ${effective} must stay light (fixed-palette island)`,
  ).toBeGreaterThan(0.5);
  expect(
    contrastRatio(ink, effective),
    `${sel}: HUD ink ${ink} on ${effective} — the dark theme must not flip pinned HUD ink`,
  ).toBeGreaterThanOrEqual(4.5);
}

test('viewer HUD stays legible where the dark theme reaches the viewer page', async ({ page }) => {
  // Production path: a dark-preference user opens /viewer; the embedded
  // editor mirrors casaplaza.theme.v1 onto <html data-theme> at boot
  // (glue.ts), and the HUD's pinned light chips must stay readable under it.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('casaplaza.theme.v1', JSON.stringify('dark'));
    } catch {
      /* opaque-origin first pass; the page navigation re-runs this */
    }
  });
  await page.goto('/viewer');
  await page.locator('[data-testid="hud-mode-toggle"]').waitFor();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  // The re-tester's seam: computed colours of HUD surfaces in dark mode.
  await expectHudInkLegible(page, '[data-testid="hud-mode-toggle"]');
  await expectHudInkLegible(page, '[data-testid="hud-roof-toggle"]');
  await expectHudInkLegible(page, '[data-testid="hud-hint"]');
  await expectHudInkLegible(page, '[data-testid="hud-walls-alpha-label"]');
});

test('Space released mid-pan-drag finalizes the drag (no stranded pan)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  await page.locator('.editor-canvas').click();
  const canvas = page.locator('.editor-canvas');
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.keyboard.down('Space');
  await expect(canvas).toHaveClass(/pan-armed/);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy + 30, { steps: 4 });
  await expect(canvas).toHaveClass(/pan-dragging/);

  // The #168 edge: Space goes up while the button is still down.
  await page.keyboard.up('Space');
  await page.mouse.up();
  await expect(canvas).not.toHaveClass(/pan-dragging/);
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Nothing stays latched in the phase machine: the next Space-hold drag
  // pans the camera exactly as a clean one does.
  const before = await getCam(page);
  await page.keyboard.down('Space');
  await dragCanvas(page, 40, 20);
  const after = await getCam(page);
  await page.keyboard.up('Space');
  expect(after.originX).toBeCloseTo(before.originX - 40 / before.scale, 3);
  expect(after.originY).toBeCloseTo(before.originY + 20 / before.scale, 3);
});

test('an explicit Pan pick during a Space-hold survives the Space release', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  await page.locator('.editor-canvas').click();
  const btnPan = page.getByTestId('btn-pan');
  const btnSelect = page.getByRole('button', { name: 'Select', exact: true });

  await page.keyboard.down('Space');
  await expect(btnPan).toHaveAttribute('aria-pressed', 'true');

  // Explicit pick while Space is still held: it must stick, because the
  // Space release only unwinds a pan that Space itself armed (#168).
  await btnPan.click();
  await page.keyboard.up('Space');
  await expect(btnPan).toHaveAttribute('aria-pressed', 'true');
  await expect(btnSelect).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.editor-canvas')).toHaveClass(/pan-armed/);
});


test('Pan tool: keyboard-focusable button arms pan; left-drag pans the camera', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  const btnPan = page.getByTestId('btn-pan');
  await expect(btnPan).toBeVisible();

  // Tab-reachable + operable from the keyboard (#126 a11y floor).
  await btnPan.focus();
  await expect(btnPan).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(btnPan).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  const before = await getCam(page);
  await dragCanvas(page, 60, 40);
  const after = await getCam(page);
  expect(after.originX).toBeCloseTo(before.originX - 60 / before.scale, 3);
  expect(after.originY).toBeCloseTo(before.originY + 40 / before.scale, 3);
  expect(after.scale).toBeCloseTo(before.scale, 6);
});

test('Space-hold temporarily arms the Pan tool and releasing restores the previous tool', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  await page.locator('.editor-canvas').click();
  const btnPan = page.getByTestId('btn-pan');
  const btnSelect = page.getByRole('button', { name: 'Select', exact: true });

  await page.keyboard.down('Space');
  await expect(btnPan).toHaveAttribute('aria-pressed', 'true');
  const before = await getCam(page);
  await dragCanvas(page, -80, 0);
  const after = await getCam(page);
  expect(after.originX).toBeCloseTo(before.originX + 80 / before.scale, 3);

  await page.keyboard.up('Space');
  await expect(btnSelect).toHaveAttribute('aria-pressed', 'true');
  await expect(btnPan).toHaveAttribute('aria-pressed', 'false');
});

test('"0" fits the empty plan and the seeded demo plan', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  await page.locator('.editor-canvas').click();

  // Empty plan boots neutral; "0" keeps it neutral (idempotent fit).
  await page.keyboard.press('0');
  const empty = await getCam(page);
  expect(empty.originX).toBeCloseTo(0, 6);
  expect(empty.originY).toBeCloseTo(0, 6);
  expect(empty.scale).toBeCloseTo(CAM_SCALE, 6);

  // Seed the demo, zoom in, then "0" must frame the whole plan.
  await loadDemoPlan(page);
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -240);
  const zoomed = await getCam(page);
  expect(zoomed.scale).toBeGreaterThan(CAM_SCALE);

  await page.keyboard.press('0');
  const fitted = await getCam(page);
  expect(Math.abs(fitted.scale - zoomed.scale)).toBeGreaterThan(0.5);

  // Repeat press is stable...
  await page.keyboard.press('0');
  const again = await getCam(page);
  expect(again.originX).toBeCloseTo(fitted.originX, 6);
  expect(again.originY).toBeCloseTo(fitted.originY, 6);
  expect(again.scale).toBeCloseTo(fitted.scale, 6);

  // ...and every room corner lands inside the viewport.
  const allInside = await page.evaluate((cam) => {
    const plan = (
      window as unknown as {
        __casaplaza: { getData: () => { rooms: Array<{ polygon: number[][] }> } };
      }
    ).__casaplaza.getData();
    const canvas = document.querySelector('.editor-canvas') as HTMLCanvasElement;
    return plan.rooms
      .flatMap((room) => room.polygon)
      .every(([wx, wy]) => {
        const sx = (wx - cam.originX) * cam.scale;
        const sy = (cam.originY - wy) * cam.scale;
        return sx >= -1 && sx <= canvas.clientWidth + 1 && sy >= -1 && sy <= canvas.clientHeight + 1;
      });
  }, fitted);
  expect(allInside).toBe(true);
});

test('theme toggle sets data-theme, persists across reload, darkens the canvas, keeps exports white', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  const btnTheme = page.getByTestId('btn-theme');
  await expect(btnTheme).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  const lightMean = await canvasCentreMean(page);
  expect(lightMean).toBeGreaterThan(200);

  await btnTheme.click();
  await expect(btnTheme).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const darkMean = await canvasCentreMean(page);
  expect(darkMean).toBeLessThan(80);

  // Preference persists (own localStorage slot, casaplaza.theme.v1).
  await page.reload();
  await page.locator('.editor-canvas').waitFor();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByTestId('btn-theme')).toHaveAttribute('aria-pressed', 'true');
  expect(await canvasCentreMean(page)).toBeLessThan(80);

  // Export stays white by construction (export.ts paints on its own
  // #ffffff canvas with the light palette; the dark theme never leaks).
  // #142 folded Export into the File popover; open it first.
  await page.getByTestId('btn-file').click();
  await page.getByTestId('btn-export').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const filePath = await download.path();
  if (!filePath) throw new Error('download has no path');
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(filePath);
  // Decode in the browser (no PNG-parser dependency): the exported sheet
  // must stay white — a dark leak would score a mean luma near ~27.
  const exportMean = await page.evaluate(async (dataUrl: string) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext('2d');
    if (!ctx) throw new Error('no 2d context for export decode');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, off.width, off.height).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < px.length; i += 4 * 37) {
      sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      count += 1;
    }
    return sum / count;
  }, `data:image/png;base64,${bytes.toString('base64')}`);
  expect(exportMean).toBeGreaterThan(220);
});
