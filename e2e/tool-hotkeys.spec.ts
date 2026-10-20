/**
 * E2E for issue #143 (single-key tool hotkeys).
 *
 * Keyboard-first coverage for the V/R/P/D/W/F/T/M tool bindings:
 *   - the arming matrix (each key flips exactly one toolbar button to
 *     .active + aria-pressed="true"), with and without canvas focus;
 *   - the guards (typed letters in a field, ctrl/meta chords, an open
 *     help modal, and mid-gesture presses never retool);
 *   - the dual-purpose R (rotates selected furniture, arms Rectangle
 *     when nothing rotatable is selected) including the rotation seam
 *     of two consecutive presses;
 *   - Esc returning the editor to the safe Select tool;
 *   - a scripted leg that arms BOTH the Rectangle and the Door tool by
 *     hotkey and then draws/places via the canvas only — no toolbar
 *     click anywhere in that leg (the openings seam from
 *     e2e/openings-furniture.spec.ts is the assertion).
 *
 * Screen mapping mirrors e2e/editor.spec.ts (scale 80, camera origin
 * (0,0) at boot): aims stay in the drawable quadrant (x > 0, y < 0),
 * off the x=0 / y=0 axes, and opening aims use wall midpoints so the
 * 0.05 m corner exclusion never bites.
 */
import { expect, test, type Page } from '@playwright/test';
import { CAM_SCALE as SCALE } from './fixtures/camConstants';

type Plan = {
  rooms: Array<{
    id: string;
    name: string;
    polygon: number[][];
    floorTexture: string | null;
  }>;
  openings: Array<{ id: string; roomId: string; kind: string }>;
  furniture: Array<{
    id: string;
    type: string;
    roomId: string;
    position: number[];
    rotationDeg: number;
    footprint: number[];
  }>;
};

/** The eight tool hotkeys paired with the button each one arms. */
const TOOL_MATRIX: ReadonlyArray<{ key: string; name: string }> = [
  { key: 'v', name: 'Select' },
  { key: 'r', name: 'Rectangle' },
  { key: 'p', name: 'Polygon' },
  { key: 'd', name: 'Door' },
  { key: 'w', name: 'Window' },
  { key: 'f', name: 'Furnish' },
  { key: 't', name: 'Stairs' },
  { key: 'm', name: 'Measure' },
];

const STUDIO = {
  id: 'r1',
  name: 'Studio',
  // (0.5,-0.5)-(3.5,-0.5)-(3.5,-3.5)-(0.5,-3.5): 3 m square, south wall
  // y=-3.5 with midpoint x=2.0 (door aim below).
  polygon: [
    [0.5, -0.5],
    [3.5, -0.5],
    [3.5, -3.5],
    [0.5, -3.5],
  ],
  floorTexture: null,
};

const SOFA = {
  id: 'f1',
  type: 'sofa',
  roomId: 'r1',
  // Same piece as openings-furniture AC5 (1.8,-2.0) / footprint 2.0x0.9.
  position: [1.8, -2.0],
  rotationDeg: 0,
  footprint: [2.0, 0.9],
};

async function getPlan(page: Page): Promise<Plan> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__casaplaza.getData());
}

/** Map world coords to ABSOLUTE page coords (camera origin 0,0 assumed). */
async function aim(
  page: Page,
  wx: number,
  wy: number,
): Promise<{ x: number; y: number }> {
  const b = (await page.locator('.editor-canvas').boundingBox())!;
  return { x: b.x + wx * SCALE, y: b.y - wy * SCALE };
}

async function loadPlan(
  page: Page,
  rooms: unknown[],
  furniture: unknown[] = [],
): Promise<void> {
  await page.evaluate(
    ([rms, furn]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan({
        schemaVersion: 1,
        units: 'meters',
        wallHeight: 2.7,
        wallThickness: 0.24,
        rooms: rms,
        openings: [],
        furniture: furn,
      });
    },
    [rooms, furniture],
  );
}

/**
 * Assert the toolbar reflects `name` as the armed tool — and ONLY it:
 * every tool button's aria-pressed/.active pair is checked, so a stray
 * double-arm or a missing disarm both fail here.
 */
async function assertArmed(page: Page, name: string): Promise<void> {
  for (const t of TOOL_MATRIX) {
    const btn = page.getByRole('button', { name: t.name, exact: true });
    const armed = t.name === name;
    await expect(btn).toHaveAttribute('aria-pressed', String(armed));
    if (armed) {
      await expect(btn).toHaveClass(/active/);
    } else {
      await expect(btn).not.toHaveClass(/active/);
    }
  }
}

/** Draw a rectangle by mouse drag (same helper shape as editor.spec.ts). */
async function drawRect(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<void> {
  const a = await aim(page, x1, y1);
  const c = await aim(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.mouse.up();
}

test.describe.serial('single-key tool hotkeys (issue #143)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.editor-canvas').waitFor();
  });

  /**
   * AC1: every hotkey arms exactly its own tool, regardless of where
   * focus sits (the handler lives on document; the canvas need not own
   * the keyboard).
   */
  test('AC1: V R P D W F T M arm their tool (canvas focus and body focus)', async ({
    page,
  }) => {
    await page.locator('.editor-canvas').focus();
    for (const t of TOOL_MATRIX) {
      await page.keyboard.press(t.key);
      await assertArmed(page, t.name);
    }

    // Same matrix with focus parked on the document body: no canvas
    // focus, no canvas click — the binding is global.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    for (const t of TOOL_MATRIX) {
      await page.keyboard.press(t.key);
      await assertArmed(page, t.name);
    }

    // Tooltips advertise the key (mkHintedBtn composition, not
    // TOOL_HINTS — the status-bar sentences stay untouched).
    await expect(
      page.getByRole('button', { name: 'Rectangle', exact: true }),
    ).toHaveAttribute('title', /\(R\)$/);
    await expect(
      page.getByRole('button', { name: 'Measure', exact: true }),
    ).toHaveAttribute('title', /\(M\)$/);
  });

  /**
   * AC2: letters typed into a text/number field are TEXT, never a tool
   * switch (floor-rename input + inspector field), and chords never
   * retool either.
   */
  test('AC2: typing in fields and ctrl/meta chords never switch tools', async ({
    page,
  }) => {
    await loadPlan(page, [STUDIO]);

    // Floor rename input: focus it via the badge popover, then type the
    // whole hotkey alphabet into it.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('d');
    await assertArmed(page, 'Door');
    await page.getByTestId('floor-badge').click();
    await expect(page.getByTestId('floor-rename-input')).toBeFocused();
    await page.keyboard.type('vrfpdtwm');
    await assertArmed(page, 'Door');
    await page.keyboard.press('Escape'); // popover's own Esc path
    await expect(page.getByTestId('floor-rename-input')).toBeHidden();

    // Inspector number field: same discipline inside the panel.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('v');
    await assertArmed(page, 'Select');
    // Select the studio by clicking NEAR its bottom wall (world y=-3.35)
    // — the interior click is a no-op in this editor; the wall-adjacent
    // hit is what arms the room selection.
    const world = await aim(page, 2.5, -3.35);
    await page.mouse.click(world.x, world.y);
    await expect(
      page.getByRole('button', { name: 'Delete Selected' }),
    ).toBeEnabled();
    await page.keyboard.press('i');
    const lean = page.getByTestId('insp-lean-deg');
    await expect(lean).toBeVisible();
    await lean.click();
    await page.keyboard.type('dwvt'); // letters, not tool changes
    await assertArmed(page, 'Select');

    // Chords stay untouched (undo/redo/browser combos).
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Meta+a');
    await assertArmed(page, 'Select');
  });

  /**
   * AC3: mid-gesture hotkeys are SWALLOWED while a draw gesture is live
   * (same discipline as I/3): the armed tool survives and the draft
   * still commits.
   */
  test('AC3: hotkeys are swallowed mid-gesture, honored after', async ({
    page,
  }) => {
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('r');
    await assertArmed(page, 'Rectangle');

    const a = await aim(page, 1.0, -1.0);
    const c = await aim(page, 3.0, -3.0);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y, { steps: 4 });
    // Gesture is live: neither key may retool (setActiveTool would kill
    // the draft), so no strict-mode conflict and no abandoned draw.
    await page.keyboard.press('d');
    await assertArmed(page, 'Rectangle');
    await page.keyboard.press('f');
    await assertArmed(page, 'Rectangle');
    await page.mouse.up();

    // The rectangle committed: the swallow was scoped to the gesture.
    expect((await getPlan(page)).rooms).toHaveLength(1);
    await page.keyboard.press('d');
    await assertArmed(page, 'Door');
  });

  /**
   * AC4: R is dual-purpose — it rotates the selected furniture (twice in
   * a row: the rotation seam), and Esc walks back to Select without
   * touching the plan.
   */
  test('AC4: R rotates selected furniture twice (seam); Esc returns to Select', async ({
    page,
  }) => {
    await loadPlan(page, [STUDIO], [SOFA]);

    // Nothing selected: R arms Rectangle instead of rotating.
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('r');
    await assertArmed(page, 'Rectangle');
    expect((await getPlan(page)).furniture[0].rotationDeg).toBe(0);

    // Select tool by hotkey, then click the sofa to select it.
    await page.keyboard.press('v');
    await assertArmed(page, 'Select');
    const drop = await aim(page, 1.8, -2.0);
    await page.mouse.click(drop.x, drop.y);

    // Two consecutive R presses both rotate (90 -> 180) and neither one
    // re-arms Rectangle (the rotation branch wins over the tool switch).
    await page.keyboard.press('r');
    expect((await getPlan(page)).furniture[0].rotationDeg).toBe(90);
    await assertArmed(page, 'Select');
    await page.keyboard.press('r');
    expect((await getPlan(page)).furniture[0].rotationDeg).toBe(180);

    // Esc disarms the tool back to Select — Pressing it twice is idempotent
    // and never mutates the plan.
    await page.keyboard.press('d');
    await assertArmed(page, 'Door');
    await page.keyboard.press('Escape');
    await assertArmed(page, 'Select');
    await page.keyboard.press('Escape');
    await assertArmed(page, 'Select');
    const after = await getPlan(page);
    expect(after.rooms).toHaveLength(1);
    expect(after.furniture).toHaveLength(1);
    expect(after.furniture[0].rotationDeg).toBe(180);
    expect(after.openings).toHaveLength(0);
  });

  /**
   * AC5: R with a non-furniture selection still arms Rectangle — the
   * rotate branch is furniture-only, and the room geometry is untouched.
   */
  test('AC5: R with a room selected arms Rectangle (no room rotation)', async ({
    page,
  }) => {
    await loadPlan(page, [STUDIO]);

    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('v');
    // Wall-adjacent click selects the room (interior clicks are no-ops).
    const world = await aim(page, 2.5, -3.35);
    await page.mouse.click(world.x, world.y);
    // Selection proven through the toolbar enablement seam, so the R
    // assertion below really covers the ROOM-selected branch.
    await expect(
      page.getByRole('button', { name: 'Delete Selected' }),
    ).toBeEnabled();

    await page.keyboard.press('r');
    await assertArmed(page, 'Rectangle');
    expect((await getPlan(page)).rooms[0].polygon).toEqual(STUDIO.polygon);
    expect((await getPlan(page)).furniture).toHaveLength(0);
  });

  /**
   * AC6 (scripted leg): keyboard-only tool arming drives a real
   * rectangle→door flow. R arms Rectangle, D arms Door; all canvas
   * interaction is mouse-on-canvas. Assertions go through the plan seam.
   */
  test('AC6: R draws a room, D places a door — no toolbar clicks', async ({
    page,
  }) => {
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('r');
    await assertArmed(page, 'Rectangle');
    await drawRect(page, 0.5, -0.5, 3.5, -3.5);
    const drawn = await getPlan(page);
    expect(drawn.rooms).toHaveLength(1);
    const roomId = drawn.rooms[0].id;

    await page.keyboard.press('d');
    await assertArmed(page, 'Door');
    // South wall y=-3.5, midpoint x=2.0 (clears the corner exclusion).
    const hit = await aim(page, 2.0, -3.5);
    await page.mouse.move(hit.x, hit.y);
    await page.waitForTimeout(120); // hover preview before commit
    await page.mouse.click(hit.x, hit.y);

    const placed = await getPlan(page);
    expect(placed.openings).toHaveLength(1);
    expect(placed.openings[0].kind).toBe('door');
    expect(placed.openings[0].roomId).toBe(roomId);

    // Esc disarms the door tool back to Select, leaving the plan intact.
    await page.keyboard.press('Escape');
    await assertArmed(page, 'Select');
    const after = await getPlan(page);
    expect(after.openings).toHaveLength(1);
    expect(after.rooms).toHaveLength(1);
  });

  /**
   * AC7: the "?" cheat sheet owns the keyboard while it is open (no
   * retooling behind it), and the modal renders the registry's Tools
   * section row.
   */
  test('AC7: hotkeys are inert while the help modal is open', async ({ page }) => {
    await page.locator('.editor-canvas').focus();
    await page.keyboard.press('d');
    await assertArmed(page, 'Door');

    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();

    // Registry-driven content: the Tools section row + the dual-purpose
    // R wording both come from shortcuts.ts.
    await expect(page.locator('.help-group').first()).toHaveText('Tools');
    await expect(dialog).toContainText('rotates selected furniture');

    // The cheat sheet owns the keyboard: V and F do NOT retool behind it.
    await page.keyboard.press('v');
    await page.keyboard.press('f');
    await assertArmed(page, 'Door');
    await expect(dialog).toBeVisible();

    // Escape closes the modal (its own capture-phase handler) — and the
    // hotkeys wake up again.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.keyboard.press('v');
    await assertArmed(page, 'Select');
  });
});
