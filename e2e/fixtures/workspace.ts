/**
 * Workspace e2e helpers (issue #178). The single page hosts Plan, 3D and
 * Walk; the floating tool card covers the canvas' left edge, so every aim
 * goes through the live camera (`__editorCam`) instead of a fixed scale.
 */
import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export type Cam = { originX: number; originY: number; scale: number };
export type View = 'plan' | '3d' | 'walk';

export const CANVAS = '.editor-canvas';
export const GL_CANVAS = '.viewer-gl-canvas';

/** Space the tool card reserves on the left (12 + 280 + 12 px). */
export const TOOLCARD_INSET = 304;

/** Open the workspace and wait for it to mount. */
export async function openWorkspace(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.locator('[data-screen="workspace"]').waitFor();
}

/**
 * Open the retired /viewer route. The redirect runs in the browser, so
 * wait for the workspace URL before the next step can race it.
 */
export async function openViewerRoute(page: Page, query = '', hash = ''): Promise<void> {
  await page.goto(`/viewer${query}${hash}`);
  await page.waitForURL(/[?&]view=3d/);
  await page.locator('[data-screen="workspace"]').waitFor();
}

export async function seedPlan(page: Page, plan: unknown): Promise<void> {
  await page.evaluate((p) => {
    (window as unknown as { __casaplaza: { loadPlan(p: unknown): void } }).__casaplaza.loadPlan(p);
  }, plan);
}

export async function readDemo(name: 'apartment' | 'duplex' | 'townhouse' = 'apartment'): Promise<unknown> {
  return JSON.parse(await readFile(`demo/demo-${name}.json`, 'utf8')) as unknown;
}

export async function getCam(page: Page): Promise<Cam> {
  return page.evaluate(() => (window as unknown as { __editorCam(): Cam }).__editorCam());
}

/** Page coordinates of a plan point under the live camera. */
export async function aim(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const c = await getCam(page);
  const b = (await page.locator(CANVAS).boundingBox())!;
  return { x: b.x + (wx - c.originX) * c.scale, y: b.y + (c.originY - wy) * c.scale };
}

export async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const a = await aim(page, x1, y1);
  const c = await aim(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.mouse.up();
}

/** A tool-card or top-bar control by its registry command id. */
export function command(page: Page, id: string, arg?: string) {
  return page.locator(arg ? `[data-command="${id}"][data-arg="${arg}"]` : `[data-command="${id}"]`).first();
}

/** Press a key with the plan canvas focused. */
export async function canvasKey(page: Page, key: string): Promise<void> {
  await page.locator(CANVAS).press(key);
}

/** Frame the active floor ("0" on the canvas). */
export async function fitPlan(page: Page): Promise<void> {
  await canvasKey(page, '0');
}

export async function currentView(page: Page): Promise<string | null> {
  return page.locator('.ws').getAttribute('data-view');
}

/** Switch views through the top-bar segment or the 1 to 3 keys. */
export async function switchView(page: Page, view: View, via: 'segment' | 'key' = 'segment'): Promise<void> {
  if (via === 'segment') await page.getByTestId(`ws-view-${view}`).click();
  else await page.keyboard.press(view === 'plan' ? '1' : view === '3d' ? '2' : '3');
  await expect(page.getByTestId(`ws-view-${view}`)).toHaveAttribute('aria-checked', 'true');
}

type Stats = Record<string, number | string | boolean | null>;

export async function viewerStats(page: Page): Promise<Stats | null> {
  return page.evaluate(() => (window as unknown as { __viewerStats?: () => Stats }).__viewerStats?.() ?? null);
}

/** Wait until the 3D engine has composed the real plan. */
export async function waitForScene(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => ((window as unknown as { __viewerStats?: () => { meshCount: number } }).__viewerStats?.().meshCount ?? 0) > 0,
    null,
    { timeout },
  );
}

type ViewerCam = { posZ: number; eyeY: number; discX?: number; discY?: number; fwdX: number; fwdY: number; fwdZ: number; locked?: boolean };

export async function viewerCam(page: Page): Promise<ViewerCam | null> {
  return page.evaluate(() => (window as unknown as { __viewerCam?: () => ViewerCam }).__viewerCam?.() ?? null);
}

/** Wait for the WALK rig (the orbit camera has no disc fields). */
export async function waitForWalker(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __viewerCam?: () => { discX?: number } }).__viewerCam?.()?.discX === 'number',
    null,
    { timeout },
  );
}

export async function roomCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const plan = (window as unknown as { __casaplaza: { getCurrent(): { floors: Array<{ rooms: unknown[] }> } } }).__casaplaza.getCurrent();
    return plan.floors.reduce((n, f) => n + f.rooms.length, 0);
  });
}

/** Text of every live toast. */
export async function toasts(page: Page): Promise<string[]> {
  return page.locator('[data-testid="ws-toast"] .ui-toast-text').allTextContents();
}
