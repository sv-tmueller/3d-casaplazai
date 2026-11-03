/**
 * 3D and Walk views (issue #6 / #18 / #86 / #87 / #147, in the single
 * workspace since #178). Waypoints are DERIVED from the demo apartment's
 * opening geometry (corridor clearance is ±0.12–0.18 m after the player
 * radius — no eyeballed aims).
 *
 * Changed by the redesign: Walk is entered from the view segment or key
 * 3 (the global Tab toggle is gone, gap G2); Esc releases the pointer and
 * stays in Walk with the prompt (lead ruling C3); place camera is C +
 * click in the Plan view and seats Walk without the lock (G15); leaving
 * Walk parks the pose so the Plan glyph stays (G4). The luminance probe
 * and the roof-autofade porch walk move to batch 2 with the ceilings/sun
 * specs (#179 re-captures the lighting baselines).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  CANVAS,
  aim,
  command,
  fitPlan,
  openWorkspace,
  readDemo,
  seedPlan,
  switchView,
  viewerCam,
  viewerStats,
  waitForScene,
  waitForWalker,
} from './fixtures/workspace';

// spawn(1.8,2.4) → north gate → east past the table → LK door latitude →
// through the LIVING↔KITCHEN door into the kitchen → back west (the
// issue #18 verified route, extended past the door mouth).
const ROUTE: Array<{ x: number; y: number }> = [
  { x: 1.8, y: 2.4 },
  { x: 2.3, y: 2.95 },
  { x: 4.8, y: 2.95 },
  { x: 4.8, y: 1.98 },
  { x: 5.4, y: 1.98 }, // the door mouth (kitchen west wall, t = 0.45)
  { x: 6.0, y: 1.98 }, // through: inside the kitchen
  { x: 4.8, y: 1.98 }, // and back into the living room
];
const ARRIVAL_SLACK = 0.45;

const ROOF_HOUSE = {
  schemaVersion: 2,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  floors: [
    {
      id: 'floor-ground',
      name: 'Ground',
      elevation: 0,
      rooms: [{ id: 'hall', name: 'Hall', polygon: [[0, 0], [4.8, 0], [4.8, 3.0], [0, 3.0]], floorTexture: 'wood' }],
      openings: [{ id: 'op-west-door', roomId: 'hall', kind: 'door', segmentIndex: 3, tCenter: 0.5, width: 0.9, sillHeight: 0, headHeight: 2.05 }],
      furniture: [],
    },
    {
      id: 'floor-upper',
      name: 'Upper',
      elevation: 2.7,
      rooms: [
        {
          id: 'bedroom',
          name: 'Bedroom',
          polygon: [[0, 0], [4.8, 0], [4.8, 3.0], [0, 3.0]],
          floorTexture: 'carpet',
          roofs: [{ segmentIndex: 0, leanDeg: 30 }, { segmentIndex: 2, leanDeg: 30 }],
        },
      ],
      openings: [],
      furniture: [],
    },
  ],
  stairs: [],
};

async function boot3d(page: Page, plan: unknown, path = '/'): Promise<void> {
  await openWorkspace(page, path);
  await seedPlan(page, plan);
  await switchView(page, '3d', 'key');
  await waitForScene(page);
}

async function enterWalk(page: Page): Promise<void> {
  await switchView(page, 'walk');
  await waitForWalker(page);
}

const stat = async (page: Page, key: string) => (await viewerStats(page))?.[key] ?? null;

test.describe.serial('3D and Walk views (issue #6)', () => {
  test('the 3D view composes the plan: slots, glass panes and furniture match the fixture', async ({ page }) => {
    const demo = (await readDemo('apartment')) as { openings: Array<{ kind: string }>; furniture: unknown[] };
    await boot3d(page, demo);
    const stats = (await viewerStats(page))!;
    expect(stats.meshCount as number).toBeGreaterThan(0);
    expect(stats.slotCount as number).toBeGreaterThanOrEqual(3);
    expect(stats.glassQuadCount).toBe(demo.openings.filter((o) => o.kind === 'window').length);
    expect(stats.furnitureVolumeCount).toBe(demo.furniture.length);
    expect(stats.emptyState).toBe(false);
  });

  test('Walk (segment) stands at eye height in a room and names it', async ({ page }) => {
    await boot3d(page, await readDemo('apartment'));
    await enterWalk(page);
    expect(Math.abs((await viewerCam(page))!.eyeY - 1.65)).toBeLessThan(0.05);
    await expect.poll(() => stat(page, 'roomName')).not.toBeNull();
    await expect(page.getByTestId('ws-walk-pill')).toHaveAttribute('aria-label', /^Go to room: /);
  });

  test('WASD traversal threads the living↔kitchen doorway', async ({ page }) => {
    test.setTimeout(120_000);
    await boot3d(page, await readDemo('apartment'));
    await enterWalk(page);
    // Sign probe: the exposed forward points at the aim.
    {
      const cam = (await viewerCam(page))!;
      const dx = ROUTE[1].x - cam.discX!;
      const dy = ROUTE[1].y - cam.discY!;
      await page.evaluate((y) => (window as unknown as { __viewerYaw(y: number): void }).__viewerYaw(y), Math.atan2(dy, dx));
      const aimed = (await viewerCam(page))!;
      expect(aimed.fwdX).toBeCloseTo(dx / Math.hypot(dx, dy), 2);
      expect(aimed.fwdY).toBeCloseTo(dy / Math.hypot(dx, dy), 2);
    }
    // Steer inside the page (one round trip): aim with __viewerYaw, hold W
    // for a few frames through the rig's own window key listeners, re-aim.
    // Frame-paced, so a slow shared machine walks slower, never wrong.
    const errors = await page.evaluate(async (route) => {
      type Cam = { discX: number; discY: number };
      const w = window as unknown as {
        __viewerCam(): Cam;
        __viewerYaw(y: number): void;
        __viewerStats(): { roomName: string | null };
      };
      const frames = (n: number) =>
        new Promise<void>((resolve) => {
          let k = 0;
          const tick = (): void => {
            k += 1;
            if (k >= n) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      const key = (type: 'keydown' | 'keyup') => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', key: 'w' }));
      const out: Array<{ err: number; room: string | null }> = [];
      for (const wp of route) {
        for (let step = 0; step < 200; step += 1) {
          const c = w.__viewerCam();
          const d = Math.hypot(wp.x - c.discX, wp.y - c.discY);
          if (d < 0.15) break;
          w.__viewerYaw(Math.atan2(wp.y - c.discY, wp.x - c.discX));
          key('keydown');
          await frames(d > 0.8 ? 4 : 1);
          key('keyup');
          await frames(1);
        }
        const c = w.__viewerCam();
        out.push({ err: Math.hypot(c.discX - wp.x, c.discY - wp.y), room: w.__viewerStats().roomName });
      }
      return out;
    }, ROUTE);
    errors.forEach(({ err }, i) => {
      expect(err, `waypoint ${i} (${ROUTE[i].x},${ROUTE[i].y}): ${err.toFixed(2)} m away`).toBeLessThanOrEqual(ARRIVAL_SLACK);
    });
    // The doorway was really threaded: the room readout changed on the way
    // through and back.
    const rooms = errors.map((e) => e.room);
    expect(rooms[0]).toBe('Living Room');
    expect(rooms[5]).toBe('Kitchen');
    expect(rooms[6]).toBe('Living Room');
  });

  test('walking into the sofa stops at its expanded boundary (issue #18)', async ({ page }) => {
    test.setTimeout(60_000);
    await boot3d(page, await readDemo('apartment'));
    await enterWalk(page);
    // March south (backwards while facing north) into the sofa's expanded
    // top face, y = 1.675: S held in-page for 3 s and at least 20 frames.
    await page.evaluate(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 's' }));
      const t0 = performance.now();
      let n = 0;
      await new Promise<void>((resolve) => {
        const tick = (): void => {
          n += 1;
          if (n >= 20 && performance.now() - t0 >= 3000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS', key: 's' }));
    });
    const cam = (await viewerCam(page))!;
    expect(cam.discY!).toBeLessThanOrEqual(1.675 + 0.01);
    expect(cam.discY!).toBeGreaterThan(1.0);
  });

  test('Esc releases the pointer and stays in Walk with the prompt (ruling C3)', async ({ page }) => {
    await boot3d(page, await readDemo('apartment'));
    await enterWalk(page);
    await page.keyboard.press('Escape');
    // Headless Chromium does not route Esc to its pointer-lock UI; release
    // the lock the way the browser's Esc does, then check the app's path.
    await page.evaluate(() => {
      if (document.pointerLockElement) document.exitPointerLock();
    });
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
    await expect(page.getByTestId('ws-view-walk')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('ws-walk-prompt')).toBeVisible();
    // Leaving Walk is the segment's (or 1 / 2's) job.
    await page.keyboard.press('2');
    await expect(page.getByTestId('ws-view-3d')).toHaveAttribute('aria-checked', 'true');
  });

  test('C + click in the Plan view seats Walk without the lock; back in Plan the glyph stays', async ({ page }) => {
    await openWorkspace(page);
    await seedPlan(page, await readDemo('apartment'));
    await fitPlan(page);
    await page.keyboard.press('c');
    await expect(command(page, 'camera.place')).toHaveAttribute('aria-pressed', 'true');
    const p = await aim(page, 1.8, 2.4);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('ws-view-walk')).toHaveAttribute('aria-checked', 'true');
    await waitForWalker(page);
    const cam = (await viewerCam(page))!;
    expect(cam.discX!).toBeCloseTo(1.8, 1);
    expect(cam.discY!).toBeCloseTo(2.4, 1);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await expect(page.getByTestId('ws-walk-prompt')).toBeVisible();

    await switchView(page, 'plan', 'key');
    await expect(page.locator(CANVAS)).toBeVisible();
    const glyph = await page.evaluate(
      () => (window as unknown as { __walkerGlyph(): { visible: boolean; pose: { mode: string } | null } }).__walkerGlyph(),
    );
    expect(glyph.visible).toBe(true);
    expect(glyph.pose?.mode).toBe('overview');
  });

  test('?perf=1 overlay samples frame statistics on the 3D stage', async ({ page }) => {
    await boot3d(page, await readDemo('apartment'), '/?perf=1');
    const panel = page.getByTestId('ws-perf-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/\d/);
  });

  test('the View tab Roofs toggle masks and unmasks the roof meshes; Quality switches live', async ({ page }) => {
    await boot3d(page, ROOF_HOUSE);
    expect(await stat(page, 'roofTriangleCount')).toBeGreaterThan(0);
    expect(await stat(page, 'roofVisible')).toBe(true);
    await page.getByTestId('ws-tab-view').click();
    const roofs = command(page, 'viewer.roofs');
    await expect(roofs).toHaveAttribute('aria-checked', 'true');
    await roofs.click();
    await expect.poll(() => stat(page, 'roofVisible')).toBe(false);
    await roofs.click();
    await expect.poll(() => stat(page, 'roofVisible')).toBe(true);

    expect(await stat(page, 'qualityLevel')).toBe('high');
    await page.getByTestId('ws-quality-low').click();
    await expect.poll(() => stat(page, 'qualityLevel')).toBe('low');
    await expect.poll(() => stat(page, 'texturedSlotCount')).toBe(0);
  });

  test('walk autofades the roof overhead; back in 3D it is whole again', async ({ page }) => {
    await boot3d(page, ROOF_HOUSE);
    await enterWalk(page);
    await expect.poll(() => stat(page, 'roofOpacity'), { timeout: 10_000 }).toBeLessThan(1);
    await page.keyboard.press('2');
    await expect.poll(() => stat(page, 'roofOpacity')).toBe(1);
  });
});
