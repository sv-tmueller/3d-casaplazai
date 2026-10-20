/**
 * Stairs editor journey e2e (issue #118): the WHOLE feature through the
 * real UI — boot the apartment, draw a flight in the kitchen, accept the
 * addFloor offer, Flip + edit via the inspector, bounce the two negative
 * cases (hole overlap, rise mismatch), author the arrival storey's slab,
 * then walk the flight UP (and back down) in the viewer.
 *
 * Route derivation (fixture geometry, never eyeballed):
 *   - The stair drag: anchor (8.0, 1.5) → cursor (6.0, 1.5) in the
 *     ground kitchen (5.4..8.6 × 0..3.6): run 2.0, rotation 180; the
 *     inspector Flip turns it uphill-east so the walker enters from the
 *     living↔kitchen door side (west) — kitchen furniture hugs y ≤ 0.8,
 *     the flight occupies y 1.0..2.0, so the lane y = 1.5 is clear of
 *     every expanded collision box, rails included (±0.04 at y 0.96 /
 *     2.04 admit the disc centre column).
 *   - Landing slab: a rectangle (4.5, 0.5) → (9.0, 3.0) drawn on Floor 2
 *     covers the derived landing hole (x 6.0..8.0 + one tread 2.0/12)
 *     and leaves walkable slab east of it (hole edge 8.1667 < the drawn
 *     wall's inner face ≈ 8.88 − disc 0.3).
 *   - Walk-in route reuses viewer.spec.ts's VERIFIED apartment lane:
 *     spawn (1.8, 2.4) → north gate (2.3, 2.95) → east (4.8, 2.95) →
 *     down to door latitude (4.8, 1.98) → thread the LK door (5.4, 1.98)
 *     → the stair mouth, then straight up the lane y = 1.5.
 */

import { expect, test, type Page } from '@playwright/test';

interface Cam {
  originX: number;
  originY: number;
  scale: number;
}

/** World XY → absolute page coords via the live editor camera. */
async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  const cam = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__editorCam() as Cam;
  });
  return {
    x: b.x + (wx - cam.originX) * cam.scale,
    y: b.y + (cam.originY - wy) * cam.scale,
  };
}

/**
 * Load the apartment through the editor bridge (v1 → v2 at the door) and
 * fit the camera so the plan is on screen (the boot camera parks world
 * (0,0) at the canvas' top-left; the apartment lives at y > 0).
 */
async function bootEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.editor-canvas').waitFor();
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile('demo/demo-apartment.json', 'utf8');
  await page.evaluate((planJson) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__casaplaza.loadPlan(JSON.parse(planJson));
  }, raw);
  await page.getByTestId('btn-center').click();
}

/** Drag between two WORLD points with intermediate pointer steps. */
async function worldDrag(
  page: Page,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Promise<void> {
  const a = await aim(page, ax, ay);
  const b = await aim(page, bx, by);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

const readState = (page: Page) =>
  page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__casaplaza.getCurrent();
  });

test.describe.serial('stairs editor journey (issue #118)', () => {
  test('authors, edits, and walks a staircase end-to-end', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await bootEditor(page);

    /* ---- 1. Draw the flight in the kitchen (east → west drag). ---- */
    await page.getByRole('button', { name: 'Stairs' }).click();
    await worldDrag(page, 8.0, 1.5, 6.0, 1.5);

    // No floor above → the inline offer appears instead of a silent
    // auto-mint; accepting runs the EXISTING addFloor flow.
    const offer = page.getByTestId('stair-addfloor-offer');
    await expect(offer).toBeVisible();
    await page.getByTestId('btn-stair-addfloor').click();
    await expect(offer).toHaveCount(0);

    let plan = await readState(page);
    expect(plan.floors).toHaveLength(2);
    expect(plan.floors[1].elevation).toBeCloseTo(3.0, 9);
    expect(plan.stairs).toHaveLength(1);
    const stair = plan.stairs[0];
    expect(stair.roomId).toBe('room-kitchen');
    expect(stair.run).toBeCloseTo(2.0, 6);
    expect(stair.position[0]).toBeCloseTo(7.0, 6);
    expect(stair.position[1]).toBeCloseTo(1.5, 6);
    // Rise is DERIVED from the minted storey gap — never defaulted.
    expect(stair.rise).toBeCloseTo(3.0, 9);
    // The drag ran east→west: uphill faces −x until the Flip below.
    expect(stair.rotationDeg).toBeCloseTo(180, 9);
    expect(stair.stepCount).toBe(7);
    // Back on the departure floor, flight selected (commit contract).
    expect(plan.floors[0].rooms).toHaveLength(3);

    /* ---- 2. Inspector: Flip, then edit the step count. ---- */
    await page.getByTestId('btn-inspector').click();
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toContainText('Staircase');

    await page.getByTestId('btn-flip-stair').click();
    plan = await readState(page);
    expect(plan.stairs[0].rotationDeg).toBeCloseTo(0, 9);
    // Flip is a pure data op: the footprint centre never moves.
    expect(plan.stairs[0].position[0]).toBeCloseTo(7.0, 6);

    await page.getByTestId('insp-stair-steps').fill('12');
    await page.getByTestId('insp-stair-steps').press('Enter');
    plan = await readState(page);
    expect(plan.stairs[0].stepCount).toBe(12);

    /* ---- 3. Negative case: landing-hole overlap is REJECTED. ---- */
    // A second draft whose derived hole (x 6.0..8.2857, y 1.5..2.5)
    // overlaps the committed flight's hole (x 6.0..8.1667, y 1.0..2.0)
    // on the same arrival plane → OverlappingStairHolesError, surfaced
    // verbatim; the store stays untouched.
    await worldDrag(page, 6.0, 2.0, 8.0, 2.0);
    const msg = page.locator('.inline-msg');
    await expect(msg).toBeVisible();
    await expect(msg).toContainText(/overlap/i);
    plan = await readState(page);
    expect(plan.stairs).toHaveLength(1);

    /* ---- 4. Negative case: a rise that matches no gap is REJECTED. ---- */
    await page.getByTestId('insp-stair-rise').fill('2.5');
    await page.getByTestId('insp-stair-rise').press('Enter');
    await expect(msg).toContainText(/matching no higher floor/i);
    plan = await readState(page);
    // Store untouched: the guarded commit never writes invalid state.
    expect(plan.stairs[0].rise).toBeCloseTo(3.0, 9);

    /* ---- 5. Author the arrival slab on Floor 2 (real Rectangle tool). ---- */
    await page.getByTestId('btn-next-floor').click();
    await page.getByRole('button', { name: 'Rectangle' }).click();
    await worldDrag(page, 4.5, 0.5, 9.0, 3.0);
    await page.getByTestId('btn-prev-floor').click();
    plan = await readState(page);
    expect(plan.floors[1].rooms).toHaveLength(1);
    expect(plan.floors[1].rooms[0].polygon[0]).toEqual([4.5, 0.5]);

    /* ---- 6. The viewer walks the committed flight. ---- */
    const planJson = JSON.stringify(plan);
    await page.goto('/viewer');
    await page.locator('.viewer-gl-canvas').waitFor();
    await page.evaluate((json) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan(JSON.parse(json));
    }, planJson);
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__viewerStats?.();
        return typeof s === 'object' && s !== null && s.meshCount > 0;
      },
      { timeout: 15_000 },
    );
    // Tab descends into walk mode at eye height (viewer.spec pattern:
    // the fade is ~320 ms; wait it out, then latch the walk diagnostics).
    await page.keyboard.press('Tab');
    await page.waitForTimeout(700);

    const readCam = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__viewerCam?.() ?? null;
      });
    const spawned = await readCam();
    expect(
      typeof spawned?.discX,
      'walk diagnostics (discX) must exist — walk mode did not engage',
    ).toBe('number');
    expect(spawned!.eyeY).toBeCloseTo(1.65, 1); // grounded on the ground storey

    /** Aim at a plan point, hold W for a bounded burst (stairs.spec pattern). */
    const hopToward = async (tx: number, ty: number): Promise<void> => {
      const cam = await readCam();
      const yaw = Math.atan2(ty - cam!.discY, tx - cam!.discX);
      await page.evaluate(([y]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__viewerYaw(y);
      }, [yaw]);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      await page.keyboard.up('KeyW');
    };

    // viewer.spec.ts's verified lane up to the LK door, then the stair lane.
    const WAYPOINTS: Array<{ x: number; y: number }> = [
      { x: 2.3, y: 2.95 }, // north gate
      { x: 4.8, y: 2.95 }, // east past the table
      { x: 4.8, y: 1.98 }, // door latitude
      { x: 5.4, y: 1.98 }, // thread the living↔kitchen door
      { x: 5.9, y: 1.5 }, // kitchen side, aligned with the flight lane
      { x: 6.8, y: 1.5 }, // on the flight, rising
      { x: 7.6, y: 1.5 }, // mid-flight
      { x: 8.45, y: 1.5 }, // crest + landing on the upper slab
    ];
    for (const wp of WAYPOINTS) {
      for (let step = 0; step < 60; step++) {
        const cam = await readCam();
        if (Math.hypot(wp.x - cam!.discX, wp.y - cam!.discY) < 0.2) break;
        await hopToward(wp.x, wp.y);
      }
    }

    const topped = await readCam();
    // Arrival storey: eye at 3.0 + 1.65, disc past the hole edge (8.1667).
    expect(topped!.eyeY).toBeGreaterThan(4.5);
    expect(topped!.eyeY).toBeLessThan(4.8);
    expect(topped!.discX).toBeGreaterThan(8.17);

    // Descent: back down the flight into the kitchen — keep walking until
    // the disc is clear of the footprint (x < the 6.0 downhill edge), so
    // the eye has fully returned to ground level (z = 0).
    for (let step = 0; step < 80; step++) {
      const cam = await readCam();
      if (cam!.discX < 5.95) break;
      await hopToward(5.9, 1.5);
    }
    const bottom = await readCam();
    expect(bottom!.eyeY).toBeCloseTo(1.65, 1);
    expect(bottom!.discX).toBeLessThan(6.0);

    expect(errors).toEqual([]);
  });
});

test.describe.serial('stairs honesty residuals (issue #139)', () => {
  test('ghost verdict: one validateGeometry per snapped cell, not per pointermove', async ({
    page,
  }) => {
    await bootEditor(page);
    await page.getByRole('button', { name: 'Stairs', exact: true }).click();

    const verdicts = () =>
      page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => (window as any).__editorStairVerdicts?.() ?? -1,
      );

    // Drag a flight in the kitchen (route from the journey leg), but
    // with MANY more intermediate steps than distinct snapped cells —
    // pointer events far outnumber 0.5 m grid cells crossed.
    const before = (await verdicts()) as number;
    expect(before).toBeGreaterThanOrEqual(0);

    const a = await aim(page, 8.0, 1.5);
    const b = await aim(page, 6.0, 1.5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    // 40 micro-moves across a 2.0 m drag (~4 snapped cells at 0.5 m).
    await page.mouse.move(b.x, b.y, { steps: 40 });
    await page.mouse.up();

    const after = (await verdicts()) as number;
    // The drag crossed at most ~5 distinct snapped cursor cells; the
    // throttle guarantees at most one verdict computation EACH. 40+
    // pointermoves costing <= 5 verdicts is the pin; a naive
    // implementation computes 40+.
    expect(after - before).toBeLessThanOrEqual(5);
  });

  test('bulk drag excludes stairs with a visible hint', async ({ page }) => {
    await bootEditor(page);
    // Draw a flight in the kitchen, then stamp a bed in the living room.
    await page.getByRole('button', { name: 'Stairs', exact: true }).click();
    await worldDrag(page, 8.0, 1.5, 6.0, 1.5);
    // Accept the addFloor offer (the journey leg's flow — the offer
    // ALWAYS rises for the apartment: no storey above the ground floor).
    const offer = page.getByTestId('stair-addfloor-offer');
    await expect(offer).toBeVisible();
    await page.getByTestId('btn-stair-addfloor').click();
    await expect(offer).toHaveCount(0);

    await page.getByRole('button', { name: 'Furnish' }).click();
    const bed = await aim(page, 1.5, 2.0);
    await page.mouse.click(bed.x, bed.y);
    await page.getByRole('button', { name: 'Select', exact: true }).click();

    // Arm the multi-set by SHIFT-CLICKING the bed and the stair (the
    // same multiSelected machinery the marquee fills; shift-click is
    // deterministic where a marquee band start-point risks landing
    // inside a room and select-dragging it instead).
    const stairBefore = (await readState(page)) as {
      stairs: Array<{ position: [number, number] }>;
    };
    expect(stairBefore.stairs.length).toBeGreaterThan(0);
    const stairPos0 = stairBefore.stairs[0].position;

    const bedClick = await aim(page, 1.5, 2.0);
    await page.keyboard.down('Shift');
    await page.mouse.click(bedClick.x, bedClick.y);
    await page.keyboard.up('Shift');
    // Stair midpoint (7.0, 1.5) is inside the footprint
    // (stairProgress semantics — the same hit test the select tool
    // uses).
    const stairClick = await aim(page, 7.0, 1.5);
    await page.keyboard.down('Shift');
    await page.mouse.click(stairClick.x, stairClick.y);
    await page.keyboard.up('Shift');

    // Multi-set armed: the inspector shows the aggregate.
    await page.getByTestId('btn-inspector').click();
    const panel = page.getByTestId('inspector-panel');
    await expect(panel).toContainText('Multiple selected');

    // Grab the bed and drag it south-east by ~1 m.
    const from = await aim(page, 1.5, 2.0);
    const to = await aim(page, 2.5, 1.0);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();

    const stairAfter = (await readState(page)) as {
      stairs: Array<{ position: [number, number] }>;
    };
    expect(stairAfter.stairs[0].position).toEqual(stairPos0);

    // The hint flashed (inline-msg visible at some point during the
    // drag; TTL 3.2 s — assert immediately after the drag).
    const msg = page.locator('.inline-msg');
    await expect(msg).toBeVisible();
    await expect(msg).toContainText(/stay put/i);
  });
});
