/**
 * Single-key shortcuts (issue #143, dispatched from the command registry
 * since #178): V R P D W F T M arm their tools from canvas or body focus;
 * typing and Ctrl/Meta chords never switch tools; keys are swallowed
 * mid-gesture and inert behind dialogs; R rotates selected furniture;
 * 1 to 3 switch views and the segment follows; Plan keys are inert in the
 * Walk view (gap G1).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  CANVAS,
  aim,
  canvasKey,
  command,
  drawRect,
  openWorkspace,
  readDemo,
  seedPlan,
  switchView,
  waitForScene,
} from './fixtures/workspace';

type Plan = {
  rooms: Array<{ id: string; polygon: number[][] }>;
  openings: Array<{ kind: string; roomId: string; tCenter: number }>;
  furniture: Array<{ rotationDeg: number }>;
};

const TOOLS: ReadonlyArray<{ key: string; id: string }> = [
  { key: 'v', id: 'tool.select' },
  { key: 'r', id: 'tool.rectangle' },
  { key: 'p', id: 'tool.polygon' },
  { key: 'd', id: 'tool.door' },
  { key: 'w', id: 'tool.window' },
  { key: 'f', id: 'tool.stamp' },
  { key: 't', id: 'tool.stairs' },
  { key: 'm', id: 'tool.measure' },
];

// A studio right of the floating tool card (world x 5.5 … 8.5).
const STUDIO = { id: 'r1', name: 'Studio', polygon: [[5.5, -0.5], [8.5, -0.5], [8.5, -3.5], [5.5, -3.5]], floorTexture: null };
const SOFA = { id: 'f1', type: 'sofa', roomId: 'r1', position: [6.8, -2.0], rotationDeg: 0, footprint: [2.0, 0.9] };

const getPlan = (page: Page): Promise<Plan> =>
  page.evaluate(() => (window as unknown as { __casaplaza: { getData(): Plan } }).__casaplaza.getData());

const seed = (page: Page, furniture: unknown[] = []) =>
  seedPlan(page, { schemaVersion: 1, units: 'meters', wallHeight: 2.7, wallThickness: 0.24, rooms: [STUDIO], openings: [], furniture });

async function assertArmed(page: Page, id: string): Promise<void> {
  for (const t of TOOLS) {
    await expect(command(page, t.id)).toHaveAttribute('aria-pressed', String(t.id === id));
  }
}

async function clickAt(page: Page, wx: number, wy: number, hover = false): Promise<void> {
  const p = await aim(page, wx, wy);
  await page.mouse.move(p.x, p.y);
  if (hover) await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
}

test.describe('tool hotkeys (issue #143)', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page);
  });

  test('AC1: V R P D W F T M arm their tool from canvas and body focus', async ({ page }) => {
    await page.locator(CANVAS).focus();
    for (const t of TOOLS) {
      await page.keyboard.press(t.key);
      await assertArmed(page, t.id);
    }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const t of TOOLS) {
      await page.keyboard.press(t.key);
      await assertArmed(page, t.id);
    }
    // Controls carry their shortcut from the same registry row.
    await expect(command(page, 'tool.rectangle')).toHaveAttribute('title', /\(R\)$/);
    await expect(command(page, 'tool.measure')).toHaveAttribute('title', /\(M\)$/);
  });

  test('AC2: typing in fields and Ctrl/Meta chords never switch tools', async ({ page }) => {
    await seed(page);
    await canvasKey(page, 'd');
    await assertArmed(page, 'tool.door');
    await page.getByTestId('ws-project-name').click();
    await page.keyboard.type('vrfpdtwm');
    await assertArmed(page, 'tool.door');
    await page.keyboard.press('Escape');

    await canvasKey(page, 'v');
    await clickAt(page, 7.5, -3.35); // near the south wall: room selected
    await expect(page.getByTestId('ws-inspector')).toBeVisible();
    await canvasKey(page, 'l'); // the inspector's lean section
    const lean = page.getByTestId('insp-lean-deg');
    await expect(lean).toBeFocused();
    await page.keyboard.type('dwvt');
    await assertArmed(page, 'tool.select');

    await page.locator(CANVAS).focus();
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Meta+a');
    await assertArmed(page, 'tool.select');
  });

  test('AC3: hotkeys are swallowed mid-gesture, honored after', async ({ page }) => {
    await canvasKey(page, 'r');
    const a = await aim(page, 6, -1);
    const c = await aim(page, 8, -3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await page.keyboard.press('d');
    await page.keyboard.press('2'); // not even a view switch mid-draw
    await assertArmed(page, 'tool.rectangle');
    await page.mouse.up();
    expect((await getPlan(page)).rooms).toHaveLength(1);
    await expect(page.getByTestId('ws-view-plan')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('d');
    await assertArmed(page, 'tool.door');
  });

  test('AC4: R rotates the selected furniture; Esc returns to Select', async ({ page }) => {
    await seed(page, [SOFA]);
    await canvasKey(page, 'r');
    await assertArmed(page, 'tool.rectangle');
    expect((await getPlan(page)).furniture[0].rotationDeg).toBe(0);
    await page.keyboard.press('v');
    await clickAt(page, 6.8, -2.0);
    await page.keyboard.press('r');
    expect((await getPlan(page)).furniture[0].rotationDeg).toBe(90);
    await assertArmed(page, 'tool.select');
    await page.keyboard.press('r');
    expect((await getPlan(page)).furniture[0].rotationDeg).toBe(180);
    await page.keyboard.press('d');
    await assertArmed(page, 'tool.door');
    await canvasKey(page, 'Escape');
    await assertArmed(page, 'tool.select');
    const after = await getPlan(page);
    expect(after.furniture[0].rotationDeg).toBe(180);
    expect(after.openings).toHaveLength(0);
  });

  test('AC5: R with a room selected arms Rectangle (no room rotation)', async ({ page }) => {
    await seed(page);
    await canvasKey(page, 'v');
    await clickAt(page, 7.5, -3.35);
    await expect(page.getByTestId('ws-inspector-delete')).toBeEnabled();
    await page.keyboard.press('r');
    await assertArmed(page, 'tool.rectangle');
    expect((await getPlan(page)).rooms[0].polygon).toEqual(STUDIO.polygon);
  });

  test('AC6: R draws a room, D places a door — no tool-card clicks', async ({ page }) => {
    await canvasKey(page, 'r');
    await drawRect(page, 5.5, -0.5, 8.5, -3.5);
    const drawn = await getPlan(page);
    expect(drawn.rooms).toHaveLength(1);
    await page.keyboard.press('d');
    await assertArmed(page, 'tool.door');
    await clickAt(page, 7.0, -3.5, true);
    const placed = await getPlan(page);
    expect(placed.openings).toHaveLength(1);
    expect(placed.openings[0].kind).toBe('door');
    expect(placed.openings[0].roomId).toBe(drawn.rooms[0].id);
    await canvasKey(page, 'Escape');
    await assertArmed(page, 'tool.select');
  });

  test('AC7: hotkeys are inert while the shortcuts dialog is open', async ({ page }) => {
    await canvasKey(page, 'd');
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('rotates selected furniture');
    await expect(dialog).toContainText('Switch to the Walk view');
    await page.keyboard.press('v');
    await page.keyboard.press('2');
    await assertArmed(page, 'tool.door');
    await expect(page.getByTestId('ws-view-plan')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.keyboard.press('v');
    await assertArmed(page, 'tool.select');
  });

  test('AC8: a hotkey mid opening-drag is swallowed; gesture and undo survive', async ({ page }) => {
    await seed(page);
    await canvasKey(page, 'd');
    await clickAt(page, 7.0, -3.5, true);
    await page.keyboard.press('v');
    expect((await getPlan(page)).openings[0].tCenter).toBeCloseTo(0.5, 2);
    const from = await aim(page, 7.0, -3.5);
    const mid = await aim(page, 7.4, -3.5);
    const to = await aim(page, 7.7, -3.5);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(mid.x, mid.y, { steps: 6 });
    await page.keyboard.press('d');
    await assertArmed(page, 'tool.select');
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    const dragged = await getPlan(page);
    expect(dragged.openings).toHaveLength(1);
    expect(dragged.openings[0].tCenter).not.toBeCloseTo(0.5, 2);
    await page.keyboard.press('Control+z');
    expect((await getPlan(page)).openings[0].tCenter).toBeCloseTo(0.5, 2);
    await page.keyboard.press('d');
    await assertArmed(page, 'tool.door');
    await clickAt(page, 7.0, -0.5, true);
    expect((await getPlan(page)).openings).toHaveLength(2);
  });

  test('AC9: hotkeys are inert while the export dialog is open', async ({ page }) => {
    await seed(page, [SOFA]);
    await canvasKey(page, 'v');
    await clickAt(page, 6.8, -2.0);
    await page.getByTestId('ws-export').click();
    const dialog = page.getByTestId('ws-export-dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('d');
    await page.keyboard.press('r');
    await assertArmed(page, 'tool.select');
    expect((await getPlan(page)).furniture[0].rotationDeg).toBe(0);
    await page.getByTestId('ws-export-cancel').click();
    await expect(dialog).toBeHidden();
    await page.keyboard.press('d');
    await assertArmed(page, 'tool.door');
  });
});

test.describe('view keys (issue #178)', () => {
  test('1 to 3 switch views and the segment follows; Plan keys are inert in Walk (G1)', async ({ page }) => {
    test.setTimeout(90_000); // key round trips are slow while Walk renders
    await openWorkspace(page);
    await seedPlan(page, await readDemo('apartment'));
    const before = JSON.stringify(await getPlan(page));
    await switchView(page, '3d', 'key');
    await waitForScene(page);
    await expect(page.locator(CANVAS)).toBeHidden();
    await switchView(page, 'walk', 'key');
    for (const k of ['d', 'r', 'c', 'Delete']) await page.keyboard.press(k);
    await switchView(page, 'plan', 'key');
    await assertArmed(page, 'tool.select');
    expect(JSON.stringify(await getPlan(page))).toBe(before);
    await expect(page.locator(CANVAS)).toBeVisible();
  });
});
