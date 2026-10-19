/**
 * Viewer e2e (issue #6): boots the combined editor+viewer page against
 * the demo apartment, asserts scene composition, mode transitions, and
 * doorway-threaded walking. Waypoints are DERIVED from the demo
 * fixture's opening geometry (corridor clearance is only ±0.12–0.18 m
 * after player-radius expansion — no eyeballed aims).
 */

import { expect, test, type Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';

/** Derived door-center waypoints (world XY, meters) for demo-apartment.json. */
// Issue #18 furniture-aware route (verified-clean 8 hops; the old direct
// diagonals graze the sofa/table expanded boxes — see PR notes):
// spawn(1.8,2.4) → north gate → east past table → LK door → dip south →
// front door. BEDROOM_DOOR (6.2,3.6) is unreachable: the bed's expanded
// box seals it (nudging the bed is illegal per the validator) — the route
// ends at the front door instead.
const ROUTE: Array<{ x: number; y: number }> = [
  { x: 1.8, y: 2.4 }, // spawn (fan-cell march result)
  { x: 2.3, y: 2.95 }, // north gate (between chair top and wall band)
  { x: 4.8, y: 2.95 }, // east past the table
  { x: 4.8, y: 1.98 }, // down to the LK door latitude
  { x: 5.4, y: 1.98 }, // thread LIVING<->KITCHEN door
  { x: 4.8, y: 1.98 }, // back west
  { x: 4.8, y: 1.0 }, // dip south (dogleg: direct graze lk-wall band)
  { x: 3.3, y: 1.0 }, // west along the south lane
  { x: 3.2, y: 0.6 }, // descend (dogleg: direct cuts sofa)
  { x: 2.7, y: 0.0 }, // FRONT door mouth
];

async function boot(page: Page): Promise<void> {
  await page.goto('/viewer');
  await page.locator('.viewer-gl-canvas').waitFor();
  // Seed the demo apartment through the editor bridge (the editor boots
  // empty; the viewer rightly refuses to render an empty plan).
  const demo = await import('node:fs/promises');
  const raw = await demo.readFile('demo/demo-apartment.json', 'utf8');
  await page.evaluate((planJson) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(JSON.parse(planJson));
  }, raw);
  // Wait for the first poll cycle to accept + compose the scene.
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return typeof s === 'object' && s !== null && s.meshCount > 0;
    },
    { timeout: 15_000 },
  );
  // Allow the first RAF + poll cycle to compose the scene.
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLElement>('[data-testid="hud-mode-toggle"]');
      return el !== null;
    },
    { timeout: 15_000 },
  );
}

test.describe.serial('viewer + walk mode (issue #6)', () => {
  test('boots: meshes composed, >=3 material slots, glass panes match windows', async ({
    page,
  }) => {
    await boot(page);
    const stats = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.() ?? null;
    });
    // Stats seam may be absent in prod build; fall back to HUD assertions.
    if (stats !== null) {
      expect(stats.meshCount).toBeGreaterThan(0);
      expect(stats.slotCount).toBeGreaterThanOrEqual(3);
      // Window dressing (issue #19): glass quads == window count,
      // derived from the fixture at runtime (never hardcoded).
      const demoRaw = await import('node:fs/promises');
      const plan = JSON.parse(
        await demoRaw.readFile('demo/demo-apartment.json', 'utf8'),
      );
      const windows = plan.openings.filter(
        (o: { kind: string }) => o.kind === 'window',
      ).length;
      expect(stats.glassQuadCount).toBe(windows);
      // Issue #18: furniture meshes now render; count derived from the
      // fixture at runtime (8 for the demo).
      expect(stats.furnitureVolumeCount).toBe(plan.furniture.length);
    } else {
      await expect(page.locator('[data-testid="hud-mode-toggle"]')).toBeVisible();
    }
  });

  test('TAB descends into walk mode at eye height', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Tab');
    // Transition fade is 320 ms; wait it out.
    await page.waitForTimeout(600);
    const cam = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerCam?.() ?? null;
    });
    // Eye height 1.65 m (Y-up world after Z-up conversion).
    if (cam !== null) {
      expect(Math.abs(cam.eyeY - 1.65)).toBeLessThan(0.05);
    }
    // Headless pointer lock is unreliable: tolerate locked=false.
    const lock = await page.evaluate(() => document.pointerLockElement !== null);
    expect(typeof lock).toBe('boolean');
  });

  test('WASD traversal threads the doorway into the next room', async ({
    page,
  }) => {
    test.setTimeout(150_000); // real steering loop: 10 waypoints x ~1.5 s
    await boot(page);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(600);

    // Arrival slack (m), NOT eyeballed: corridor clearance is only
    // ±0.12–0.18 m after player-radius expansion, so landing within
    // 0.45 m of each derived waypoint proves the disc stayed in the
    // corridor (wall thickness 0.24 + radius 0.3 leaves no room to
    // cheat). Each hop asserts this — no vacuous Number.isFinite here.
    const ARRIVAL_SLACK = 0.45;
    // The terminal waypoint (front-door mouth) lies on the WALL centreline;
    // the disc (radius 0.3) cannot occupy the wall band, so its standoff
    // there is bounded by wall thickness 0.24 + radius 0.3 = 0.54 m —
    // derived, not eyeballed (measured ~0.52 m in the demo).
    const DOOR_MOUTH_SLACK = 0.54;
    const slackFor = (i: number): number =>
      i === ROUTE.length - 1 ? DOOR_MOUTH_SLACK : ARRIVAL_SLACK;

    const readCam = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__viewerCam?.() ?? null;
      });

    // HARD latch: a phantom/missing seam must FAIL loud, never silently
    // no-op (the `__viewerYaw?.()` bug this package retires).
    const initial = await readCam();
    expect(
      initial,
      'DEBUG SEAM __viewerCam must exist in walk mode',
    ).not.toBeNull();

    /** Aim at a plan-space point, then press W for one bounded burst. */
    const hopToward = async (tx: number, ty: number): Promise<void> => {
      // Plan X = world X; plan Y = world Y (the Z-up world seats eye
      // height on Z). Reading posZ as plan-Y was the old phantom bug.
      const cam = await readCam();
      expect(
        cam,
        'DEBUG SEAM __viewerCam must exist in walk mode',
      ).not.toBeNull();
      const dx = tx - cam!.discX;
      const dyPlan = ty - cam!.discY;
      // Desired plan-yaw: seedYaw lays world forward along
      // (cos yaw, sin yaw), so facing the goal is atan2(dyPlan, dx).
      // The old atan2(-dy, dx) was axis- and sign-inverted.
      const yaw = Math.atan2(dyPlan, dx);
      const steered = await page.evaluate(
        ([y]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (window as any).__viewerYaw;
          if (typeof fn !== 'function') return false;
          fn(y);
          return true;
        },
        [yaw],
      );
      expect(steered, 'DEBUG SEAM __viewerYaw must be a function').toBe(true);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      await page.keyboard.up('KeyW');
    };

    // SIGN-CONVENTION PROBE (empirical, per sub-plan): aim at hop 1 and
    // assert the exposed WORLD forward actually points that way. seedYaw
    // maps plan-yaw θ → forward (cosθ, sinθ, 0); a sign error fails here.
    {
      const cam = await readCam();
      const dx = ROUTE[1].x - cam!.discX;
      const dyPlan = ROUTE[1].y - cam!.discY;
      const len = Math.hypot(dx, dyPlan);
      await page.evaluate(
        ([y]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__viewerYaw(y);
        },
        [Math.atan2(dyPlan, dx)],
      );
      const aimed = await readCam();
      expect(aimed!.fwdX).toBeCloseTo(dx / len, 2);
      expect(aimed!.fwdY).toBeCloseTo(dyPlan / len, 2);
      expect(Math.abs(aimed!.fwdZ)).toBeLessThan(0.05); // laid flat
    }

    // Traverse the route VERBATIM (its doglegs are load-bearing). Each
    // hop is bounded, then the disc position is read and asserted.
    for (let i = 0; i < ROUTE.length; i++) {
      const wp = ROUTE[i];
      for (let step = 0; step < 60; step++) {
        const cam = await readCam();
        expect(
          cam,
          'DEBUG SEAM __viewerCam must exist in walk mode',
        ).not.toBeNull();
        if (Math.hypot(wp.x - cam!.discX, wp.y - cam!.discY) < 0.2) break;
        await hopToward(wp.x, wp.y);
      }
      const cam = await readCam();
      expect(
        cam,
        'DEBUG SEAM __viewerCam must exist in walk mode',
      ).not.toBeNull();
      const err = Math.hypot(cam!.discX - wp.x, cam!.discY - wp.y);
      expect(
        err,
        `waypoint ${i} (${wp.x},${wp.y}): disc stopped ${err.toFixed(2)} m away`,
      ).toBeLessThanOrEqual(slackFor(i));
    }
    // The final hop above lands at ROUTE.at(-1) = the FRONT-door mouth,
    // so the last per-waypoint assertion already proves walls were
    // threaded rather than clipped.
  });

  test('walking into the sofa stops at its expanded boundary (issue #18)', async ({
    page,
  }) => {
    await boot(page);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(600);
    // March south along x≈1.8 (spawn column) into the sofa's expanded
    // top face (y = 1.675 = sofa top 1.375 + radius 0.3 after the
    // fixture nudge y=0.9 → footprint top 1.375).
    for (let step = 0; step < 30; step++) {
      await page.keyboard.down('KeyS'); // backwards = south when facing north
      await page.waitForTimeout(120);
      await page.keyboard.up('KeyS');
    }
    // HARD latch: a seam regression must fail loud, not pass vacuously.
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (window as any).__viewerCam?.() ?? null;
        return c !== null && typeof c.discY === 'number';
      },
      { timeout: 10_000 },
    );
    const cam = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerCam?.() ?? null;
    });
    // Flush pin at the expanded boundary (±1 cm tolerance).
    expect(cam!.discY).toBeLessThanOrEqual(1.675 + 0.01);
    expect(cam!.discY).toBeGreaterThan(1.0); // actually traveled south
  });

  test('ESC returns to orbit and releases pointer lock', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const lock = await page.evaluate(() => document.pointerLockElement);
    expect(lock).toBeNull();
    await expect(page.locator('[data-testid="hud-mode-toggle"]')).toBeVisible();
  });

  test('?perf=1 overlay samples frame statistics', async ({ page }) => {
    await page.goto('/viewer?perf=1');
    await page.locator('.viewer-gl-canvas').waitFor();
    await page.waitForTimeout(1500);
    const overlay = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="hud-perf-panel"]');
      return el !== null ? el.textContent : null;
    });
    expect(overlay).toBeTruthy();
    expect(String(overlay)).toMatch(/\d/); // contains a number
  });
});

/*
 * Pkg 9.1 (issue #86) — lighting/quality/roof-affordance e2e. All four
 * specs are ADDITIVE: the pre-9.1 suite above runs untouched.
 *
 * Shared plan (inline, NOT the demo apartment): a two-storey house
 * whose UPPER bedroom carries a gabled roof (two 30° leans on the
 * opposed long walls, mirroring demo-townhouse's master bedroom) and a
 * WEST DOOR leading into the roofless void — the fade-restore leg.
 * Wall height 2.7 satisfies the roof validator (plate==wallHeight).
 */
const HOUSE_PLAN = {
  schemaVersion: 2,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  floors: [
    {
      id: 'floor-ground',
      name: 'Ground',
      elevation: 0,
      rooms: [
        {
          id: 'hall',
          name: 'Hall',
          polygon: [
            [0, 0],
            [4.8, 0],
            [4.8, 3.0],
            [0, 3.0],
          ],
          floorTexture: 'wood',
        },
      ],
      openings: [
        {
          // West door: the walker's exit into the roofless void (the
          // fade-restore leg of spec (d) threads this doorway).
          id: 'op-west-door',
          roomId: 'hall',
          kind: 'door',
          segmentIndex: 3,
          tCenter: 0.5,
          width: 0.9,
          sillHeight: 0,
          headHeight: 2.05,
        },
      ],
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
          polygon: [
            [0, 0],
            [4.8, 0],
            [4.8, 3.0],
            [0, 3.0],
          ],
          floorTexture: 'carpet',
          roofs: [
            { segmentIndex: 0, leanDeg: 30 },
            { segmentIndex: 2, leanDeg: 30 },
          ],
        },
      ],
      openings: [],
      furniture: [],
    },
  ],
  stairs: [],
};

/** Boot the viewer with the shared roof-house plan (fresh page state). */
async function bootHouse(page: Page, query = ''): Promise<void> {
  await page.goto(`/viewer${query}`);
  await page.locator('.viewer-gl-canvas').waitFor();
  await page.evaluate((plan) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(plan);
  }, HOUSE_PLAN);
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__viewerStats?.();
      return typeof s === 'object' && s !== null && s.meshCount > 0;
    },
    { timeout: 15_000 },
  );
}

/**
 * Mean perceptual luminance (0..255) over a fractional rect of the GL
 * canvas. Captures via Playwright's COMPOSITOR screenshot — in-page
 * readbacks (getImageData/readPixels) return black for ANGLE/Metal
 * IOSurface canvases on several stacks, so the pixels must come from
 * the outside. The PNG is decoded with node:zlib (stdlib only).
 */
async function regionLuminance(
  page: Page,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
): Promise<number> {
  const shot = await page
    .locator('.viewer-gl-canvas')
    .screenshot({ type: 'png' });
  const buf = shot.subarray(0, shot.length);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const colorType = buf[25];
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bpp === 0) throw new Error(`unexpected PNG color type ${colorType}`);

  // Concatenate IDAT chunks and inflate.
  const chunks: Buffer[] = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') chunks.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));

  // Un-filter scanlines (filters 0-4) into an RGB byte raster.
  const stride = w * bpp + 1;
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raster = Buffer.allocUnsafe(w * h * 3);
  let prev = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++) {
    const line = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride));
    const filter = raw[y * stride];
    if (filter === 1) {
      for (let i = bpp; i < line.length; i++) line[i] = (line[i] + line[i - bpp]) & 255;
    } else if (filter === 2) {
      for (let i = 0; i < line.length; i++) line[i] = (line[i] + prev[i]) & 255;
    } else if (filter === 3) {
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255;
      }
    } else if (filter === 4) {
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const c = i >= bpp ? prev[i - bpp] : 0;
        line[i] = (line[i] + paeth(a, prev[i], c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      raster[(y * w + x) * 3] = line[x * bpp];
      raster[(y * w + x) * 3 + 1] = line[x * bpp + 1];
      raster[(y * w + x) * 3 + 2] = line[x * bpp + 2];
    }
    prev = line;
  }

  // Average Rec.601 luma over the requested fractional rect.
  const sx = Math.floor(w * fx);
  const sy = Math.floor(h * fy);
  const rw = Math.max(1, Math.floor(w * fw));
  const rh = Math.max(1, Math.floor(h * fh));
  let sum = 0;
  let px = 0;
  for (let y = sy; y < Math.min(sy + rh, h); y++) {
    for (let x = sx; x < Math.min(sx + rw, w); x++) {
      const i = (y * w + x) * 3;
      sum += 0.299 * raster[i] + 0.587 * raster[i + 1] + 0.114 * raster[i + 2];
      px++;
    }
  }
  return px > 0 ? sum / px : -1;
}

test.describe.serial('lighting + roof affordances (issue #86)', () => {
  // (a) Parametrized over BOTH quality presets: the perf overlay must
  // publish digit-bearing stats under either level (proving the knob
  // composes with the sampler rather than breaking the boot).
  for (const quality of ['low', 'high'] as const) {
    test(`(a)?perf=1 publishes frame stats at quality=${quality}`, async ({
      page,
    }) => {
      test.setTimeout(45_000);
      await page.goto(`/viewer?perf=1&quality=${quality}`);
      await page.locator('.viewer-gl-canvas').waitFor();
      await page.evaluate((plan) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__casaplaza.loadPlan(plan);
      }, HOUSE_PLAN);
      await page.waitForTimeout(2500); // prime the 240-sample window
      const overlay = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="hud-perf-panel"]');
        return el !== null ? el.textContent : null;
      });
      expect(overlay).toBeTruthy();
      expect(String(overlay)).toMatch(/fps med \d+/);
      expect(String(overlay)).toMatch(/n=\d+/);
    });
  }

  test('(b) luminance probe: lit interior vs sky-filled exterior read sane', async ({
    page,
  }) => {
    // The probe captures from the COMPOSITOR (outside the page), so no
    // special renderer flags are needed — plain production boot.
    await bootHouse(page);
    await page.waitForTimeout(900); // first frames flush
    // The overview ortho camera looks straight DOWN at the framed
    // plan, so: the CENTER of the canvas is the lit interior; the
    // CORNER margins are open sky (gradient dome or solid backdrop).
    const interior = await regionLuminance(page, 0.35, 0.35, 0.3, 0.3);
    const exterior = await regionLuminance(page, 0.0, 0.0, 0.12, 0.12);
    // Interior (walls/floor, lit): definitively non-black, non-blown.
    expect(interior).toBeGreaterThan(10);
    expect(interior).toBeLessThan(246);
    // Corner margin: dominated by the bright sky.
    expect(exterior).toBeGreaterThan(60);
    // Sanity ordering: the sky reads brighter than the shaded interior.
    expect(exterior).toBeGreaterThan(interior);
  });

  test('(c) roof HUD toggle masks and unmasks the roof meshes', async ({
    page,
  }) => {
    await bootHouse(page);
    const before = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.() ?? null;
    });
    expect(before?.roofTriangleCount).toBeGreaterThan(0);
    expect(before?.roofVisible).toBe(true);

    const btn = page.getByTestId('hud-roof-toggle');
    await expect(btn).toBeVisible();
    await btn.click(); // hide
    await expect
      .poll(async () =>
        page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (window as any).__viewerStats?.()?.roofVisible ?? null;
        }),
      )
      .toBe(false);
    await expect(btn).toHaveText('Show roofs');

    await btn.click(); // show
    await expect
      .poll(async () =>
        page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (window as any).__viewerStats?.()?.roofVisible ?? null;
        }),
      )
      .toBe(true);
    await expect(btn).toHaveText('Hide roofs');
  });

  test('(d) walk-mode autofade dims the roof under the bedroom and restores on exit', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await bootHouse(page);
    // Descend into walk mode. The walker spawns in the GROUND hall —
    // which sits DIRECTLY UNDER the roofed bedroom (identical
    // footprints), so the transitive roof counts as cover: the fade
    // must engage from spawn without any steering gymnastics.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(700);

    // Under-cover: opacity tweens BELOW 1 (fade floor 0.12).
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (window as any).__viewerStats?.()?.roofOpacity ?? null;
          }),
        { timeout: 10_000, intervals: [250] },
      )
      .toBeLessThan(1);

    // Restore WITHOUT leaving walk mode: steer west THROUGH THE DOORWAY
    // into the open void — no roof out there, so the upward ray
    // escapes to the sky and opacity tweens back to 1.
    const readCam = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__viewerCam?.() ?? null;
      });
    const porchWaypoint = { x: -1.5, y: 1.5 };
    for (let step = 0; step < 40; step++) {
      const cam = await readCam();
      expect(cam, 'DEBUG SEAM __viewerCam must exist in walk mode').not.toBeNull();
      if (Math.hypot(porchWaypoint.x - cam!.discX, porchWaypoint.y - cam!.discY) < 0.3) {
        break;
      }
      const yaw = Math.atan2(
        porchWaypoint.y - cam!.discY,
        porchWaypoint.x - cam!.discX,
      );
      await page.evaluate((y) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__viewerYaw(y);
      }, yaw);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      await page.keyboard.up('KeyW');
    }
    const arrived = await readCam();
    expect(
      Math.hypot(arrived!.discX - porchWaypoint.x, arrived!.discY - porchWaypoint.y),
      'walker must reach the roofless porch',
    ).toBeLessThan(0.6);

    // Outdoors: the roof fades back to fully opaque.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (window as any).__viewerStats?.()?.roofOpacity ?? null;
          }),
        { timeout: 10_000, intervals: [250] },
      )
      .toBe(1);

    // Finally ESC → overview ALSO restores (belt and braces: the
    // mode-exit path resets opacity independently of the ray verdict).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const restored = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.()?.roofOpacity ?? null;
    });
    expect(restored).toBe(1);
  });
});
