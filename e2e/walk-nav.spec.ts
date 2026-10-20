/**
 * Walk-navigation aids e2e (issue #147 CP3/CP4/CP5): one real browser
 * session on the combined /viewer route (editor pane beside the GL
 * pane), where the walkerLink hub is same-page and the whole loop is
 * live:
 *
 *   viewer walker ⇄ HUD room readout + go-to-room picker
 *   editor walker glyph ← mirrored pose
 *   editor place-camera (C) → walker teleport in 3D
 *
 * Fixture: a TWO-STOREY plan whose upper room is deliberately STACKED
 * over the ground floor (same plan footprint). A readout/picker that
 * ignored storeys would still read "Living" upstairs, so the fixture
 * makes storey correctness observable instead of accidental.
 *
 * Geometry band: the editor pane boots at the DEFAULT camera (origin
 * 0,0 / 80 px·m⁻¹), so every room is placed at x ≥ 0, y ≤ 0 — the same
 * negative-y quadrant the demo apartment uses. Rooms north of the plan
 * origin sit off-canvas and a click aimed at them can never land.
 *
 * Headless caveats (matching e2e/viewer.spec.ts): pointer lock is
 * unreliable, so nothing here asserts real lock — walk mode is entered
 * via the HUD toggle or a walkerLink command and every signal comes
 * from the published seams.
 */

import { expect, test, type Page } from '@playwright/test';
import type { FloorplanData } from '../src/shared/schema';

/** See tests/unit/walkNavHud.spec.ts — near-twin fixture, e2e copy
 *  (specs must not import test files); the e2e copy moves the rooms into
 *  the default camera's visible quadrant. */
function ring(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
}

const TWO_STOREY = {
  schemaVersion: 2,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.2,
  floors: [
    {
      id: 'floor-ground',
      name: 'Ground',
      elevation: 0,
      rooms: [
        // Largest room (12 m²) ⇒ the plan-wide spawn solver seats here.
        {
          id: 'living',
          name: 'Living',
          polygon: ring(0, -3, 4, 0),
          floorTexture: 'wood',
        },
        {
          id: 'kitchen',
          name: 'Kitchen',
          polygon: ring(0, -5, 2, -3),
          floorTexture: 'tile',
        },
      ],
      openings: [],
      furniture: [],
    },
    {
      id: 'floor-upper',
      name: 'Upper',
      elevation: 2.7,
      rooms: [
        // Stacked over Living: the same plan point is inside BOTH rooms.
        {
          id: 'belvedere',
          name: 'Belvedere',
          polygon: ring(0, -3, 3, 0),
          floorTexture: 'wood',
        },
      ],
      openings: [],
      furniture: [],
    },
  ],
  stairs: [],
} as unknown as FloorplanData;

/** Boot copied from e2e/viewer.spec.ts:34 (Pkg 1 owns that file). */
async function boot(page: Page): Promise<void> {
  await page.goto('/viewer');
  await page.locator('.viewer-gl-canvas').waitFor();
  await page.evaluate((plan) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(plan);
  }, TWO_STOREY);
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

interface GlyphState {
  visible: boolean;
  armed: boolean;
  hasViewer: boolean;
  pose: {
    x: number;
    y: number;
    yawRad: number;
    floorIdx: number;
    mode: string;
  } | null;
  screenX: number | null;
  screenY: number | null;
}

const glyph = (page: Page): Promise<GlyphState | null> =>
  page.evaluate(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).__walkerGlyph?.() as GlyphState | undefined) ?? null,
  );

interface WalkNavStats {
  roomName: string | null;
  floorIdx: number | null;
}

/** The programmatic twin of the HUD readout (issue #147 CP5 seam). */
const stats = (page: Page): Promise<WalkNavStats> =>
  page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__viewerStats?.() ?? {};
    return {
      roomName: (s.roomName ?? null) as string | null,
      floorIdx: (s.floorIdx ?? null) as number | null,
    };
  });

/** Enter walk mode via the HUD toggle and wait for the walk rig. */
async function enterWalk(page: Page): Promise<void> {
  await page.getByTestId('hud-mode-toggle').click();
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (window as any).__viewerCam?.() ?? null;
      return c !== null && typeof c.discX === 'number';
    },
    { timeout: 10_000 },
  );
}

/**
 * Map a PLAN point to viewport px through the LIVE editor camera (never
 * eyeballed pixels) and assert it lands inside the canvas — a fixture
 * that drifts off-view fails here, loudly, with its coordinates.
 */
async function aimPoint(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const local = await page.evaluate(
    ([x, y]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (window as any).__editorCam() as {
        originX: number;
        originY: number;
        scale: number;
      };
      return { x: (x - c.originX) * c.scale, y: (c.originY - y) * c.scale };
    },
    [wx, wy],
  );
  const box = (await page.locator('.editor-canvas').boundingBox())!;
  expect(
    local.x > 4 && local.x < box.width - 4 && local.y > 4 && local.y < box.height - 4,
    `aim point (${wx}, ${wy}) off-canvas: (${local.x}, ${local.y}) in ${box.width}×${box.height}`,
  ).toBe(true);
  return { x: box.x + local.x, y: box.y + local.y };
}

test.describe.serial('walk navigation aids (issue #147)', () => {
  test('HUD readout follows the walker; the picker teleports across storeys', async ({
    page,
  }) => {
    await boot(page);
    const readout = page.getByTestId('hud-room-readout');
    const picker = page.getByTestId('hud-goto-room');

    // No walker ⇒ no room claim (span hidden, seam honest-null).
    await expect(readout).toBeHidden();
    expect(await stats(page)).toEqual({ roomName: null, floorIdx: null });

    // Picker: one optgroup per storey, one option per room, plus the
    // placeholder. Order follows the plan.
    const labels = await picker
      .locator('optgroup')
      .evaluateAll((gs) => gs.map((g) => g.getAttribute('label')));
    expect(labels).toEqual(['Ground', 'Upper']);
    const values = await picker
      .locator('option')
      .evaluateAll((os) => os.map((o) => o.getAttribute('value')));
    expect(values).toEqual(['', 'living', 'kitchen', 'belvedere']);

    await enterWalk(page);

    // Spawned somewhere on the ground floor: the readout names the room
    // (never blank, never "Outside" for a solved spawn).
    await expect(readout).toBeVisible();
    await expect(readout).toHaveText(/^(Living|Kitchen)$/);

    // Teleport UP: the walker's room is now the stacked upper one, and
    // the readout must say so rather than re-reporting the ground room
    // that shares its footprint.
    await picker.selectOption('belvedere');
    await expect(readout).toHaveText('Belvedere');
    // The programmatic seam agrees with the span (never a second rule).
    expect(await stats(page)).toEqual({ roomName: 'Belvedere', floorIdx: 1 });

    // The editor mirrored the pose on storey 1 and followed it there.
    const up = await glyph(page);
    expect(up?.pose?.floorIdx).toBe(1);
    expect(up?.visible).toBe(true);
    await expect(page.getByTestId('floor-badge')).toContainText('Upper');

    // The disc really moved into the upper room's plan footprint
    // (Belvedere = x 0..3, y -3..0).
    const discUp = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerCam() as { discX: number; discY: number };
    });
    expect(discUp.discX).toBeGreaterThan(-0.5);
    expect(discUp.discX).toBeLessThan(3.5);
    expect(discUp.discY).toBeGreaterThan(-3.5);
    expect(discUp.discY).toBeLessThan(0.5);

    // …and back DOWN: the picker serves both directions.
    await picker.selectOption('kitchen');
    await expect(readout).toHaveText('Kitchen');
    await expect(page.getByTestId('floor-badge')).toContainText('Ground');
    expect(await stats(page)).toEqual({ roomName: 'Kitchen', floorIdx: 0 });

    // Share-link purity: walker state never enters the plan payload.
    const payload = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return JSON.stringify((window as any).__casaplaza.getData());
    });
    expect(payload).not.toContain('walker');
    expect(payload).not.toContain('yawRad');
  });

  test('place camera: C arms, a click seats the walker, a drag aims it; Esc cancels', async ({
    page,
  }) => {
    await boot(page);
    await enterWalk(page);

    // Deterministic target: go to the ground-floor kitchen first.
    await page.getByTestId('hud-goto-room').selectOption('kitchen');
    const readout = page.getByTestId('hud-room-readout');
    await expect(readout).toHaveText('Kitchen');

    const canvas = page.locator('.editor-canvas');
    await canvas.focus();

    // AC half: a PLAIN click (no drag) must KEEP the walker's heading —
    // capture it before arming so the commit can be judged against it.
    const yawBefore = (await glyph(page))!.pose!.yawRad;

    // 'C' arms (a live viewer subscriber exists on this route)…
    await page.keyboard.press('c');
    await expect.poll(async () => (await glyph(page))?.armed).toBe(true);

    // …Esc cancels…
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await glyph(page))?.armed).toBe(false);

    // …and re-arming lets the click commit.
    await page.keyboard.press('c');
    await expect.poll(async () => (await glyph(page))?.armed).toBe(true);

    // Click the kitchen's plan point (1, -4) mapped through the LIVE
    // editor camera (never eyeballed pixels).
    const click = await aimPoint(page, 1, -4);
    await page.mouse.move(click.x, click.y);
    await page.waitForTimeout(80);
    await page.mouse.click(click.x, click.y);

    // Committed: disarmed, walker seated at the click point on storey 0.
    await expect.poll(async () => (await glyph(page))?.armed).toBe(false);
    const placed = await glyph(page);
    expect(placed?.pose?.x).toBeCloseTo(1, 1);
    expect(placed?.pose?.y).toBeCloseTo(-4, 1);
    expect(placed?.pose?.floorIdx).toBe(0);
    await expect(readout).toHaveText('Kitchen');
    // …and the plain click KEPT the published heading (arc difference, so
    // a ±π wrap can never fake a pass or a fail).
    const yawDiff = Math.abs(
      Math.atan2(
        Math.sin(placed!.pose!.yawRad - yawBefore),
        Math.cos(placed!.pose!.yawRad - yawBefore),
      ),
    );
    expect(yawDiff).toBeLessThan(0.1);

    // A DRAG re-arms; the press point seats the walker and the drag
    // direction becomes its heading (due west ⇒ yaw π).
    await page.keyboard.press('c');
    await expect.poll(async () => (await glyph(page))?.armed).toBe(true);
    const from = await aimPoint(page, 1, -4);
    // Drag west, but keep the end point on-canvas (plan x=0 sits exactly
    // on the canvas edge at the default camera) — 0.4 m is still 32 px.
    const to = await aimPoint(page, 0.6, -4);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await glyph(page))?.armed).toBe(false);
    const aimed = await glyph(page);
    // Position is the PRESS point; heading comes from the drag vector.
    expect(aimed?.pose?.x).toBeCloseTo(1, 1);
    expect(aimed?.pose?.y).toBeCloseTo(-4, 1);
    expect(Math.abs(Math.abs(aimed!.pose!.yawRad) - Math.PI)).toBeLessThan(0.2);

    // The glyph is storey-gated: browsing to the upper floor hides a
    // walker that is downstairs (and does NOT follow it back — the
    // follow is edge-triggered on the pose, not per-tick).
    await page.keyboard.press(']');
    await expect(page.getByTestId('floor-badge')).toContainText('Upper');
    await expect.poll(async () => (await glyph(page))?.visible).toBe(false);
    await page.keyboard.press('[');
    await expect(page.getByTestId('floor-badge')).toContainText('Ground');
    await expect.poll(async () => (await glyph(page))?.visible).toBe(true);
  });

  test('walking forward moves the mirrored glyph', async ({ page }) => {
    await boot(page);
    await enterWalk(page);

    // Deterministic seat: the go-to-room solver places the walker at the
    // room's centroid (Living 4×3 ⇒ (2, -1.5)).
    await page.getByTestId('hud-goto-room').selectOption('living');
    const readout = page.getByTestId('hud-room-readout');
    await expect(readout).toHaveText('Living');

    const before = await glyph(page);
    expect(before?.visible).toBe(true);
    expect(before?.pose?.floorIdx).toBe(0);
    const start = { x: before!.pose!.x, y: before!.pose!.y };
    const startScreen = { x: before!.screenX!, y: before!.screenY! };

    // Face plan +X (the room is 4 m wide; the disc needs 0.5 m of
    // clearance, so 1.3 m of travel is available) and hold W.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__viewerYaw(0);
    });
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(
        (p) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const g = (window as any).__walkerGlyph?.();
          const pose = g?.pose;
          return (
            typeof pose?.x === 'number' &&
            Math.hypot(pose.x - p.x, pose.y - p.y) > 0.5
          );
        },
        start,
        { timeout: 8_000 },
      );
    } finally {
      await page.keyboard.up('KeyW');
    }

    const after = await glyph(page);
    // The mirrored glyph followed the walker on the plan…
    expect(
      Math.hypot(after!.screenX! - startScreen.x, after!.screenY! - startScreen.y),
      `glyph stuck at (${after!.screenX}, ${after!.screenY})`,
    ).toBeGreaterThan(15);
    // …and the walker is still inside Living, so the readout holds.
    await expect(readout).toHaveText('Living');
  });

  test('command-seated walk requests no pointer lock; the Walk button still does', async ({
    page,
  }) => {
    await boot(page);

    // House lock-spy pattern (e2e/walk-affordances.spec.ts): stub the
    // prototype and count attempts; headless lock success is irrelevant.
    await page.evaluate(() => {
      const w = window as unknown as { __lockAttempts: number };
      w.__lockAttempts = 0;
      Element.prototype.requestPointerLock = function stubPointerLock() {
        w.__lockAttempts += 1;
        return Promise.resolve();
      } as Element['requestPointerLock'];
    });
    const lockAttempts = (): Promise<number> =>
      page.evaluate(
        () => (window as unknown as { __lockAttempts: number }).__lockAttempts,
      );
    const overlay = page.locator('[data-testid="walk-entry-overlay"]');

    // From OVERVIEW the picker seats walk mode (autoLock=false): zero
    // attempts, and the "Click to walk" invitation stays on screen.
    await page.getByTestId('hud-goto-room').selectOption('kitchen');
    await expect(page.getByTestId('hud-room-readout')).toHaveText('Kitchen');
    expect(await lockAttempts()).toBe(0);
    await expect(overlay).toBeVisible();

    // The 2D pane's place-camera path must not grab the pointer either.
    const canvas = page.locator('.editor-canvas');
    await canvas.focus();
    await page.keyboard.press('c');
    await expect.poll(async () => (await glyph(page))?.armed).toBe(true);
    const click = await aimPoint(page, 2, -1.5); // Living centre
    await page.mouse.move(click.x, click.y);
    await page.waitForTimeout(80);
    await page.mouse.click(click.x, click.y);
    await expect.poll(async () => (await glyph(page))?.armed).toBe(false);
    expect(await lockAttempts()).toBe(0);
    await expect(overlay).toBeVisible();

    // The existing Walk button (issue #30) is untouched: toggling out
    // clears the invitation…
    // #146: the single toggle became the Overview/Walk segment; the
    // OVERVIEW segment is the toggle-out control.
    await page.getByTestId('hud-mode-segment-overview').click();
    await expect(overlay).toBeHidden();
    // …and toggling back in IS a user gesture, so it still auto-locks.
    await page.getByTestId('hud-mode-segment-walk').click();
    await expect.poll(lockAttempts, { timeout: 10_000 }).toBeGreaterThan(0);
  });
});
