/**
 * Share-link e2e (issue #91, Pkg 10.1): proves the ZERO-BACKEND
 * round-trip at the URL level — Share button (keyboard-operated) →
 * clipboard link → fresh browser context → viewer renders the SAME
 * plan — plus the friendly-failure contract for corrupt fragments.
 *
 * Fragment synthesis: the spec runs in NODE, so node:zlib can mint
 * fragments directly. CompressionStream('deflate') is the zlib
 * (RFC 1950) wrapper — the same format zlib.deflateSync emits — and
 * Buffer's 'base64url' encoding is unpadded, so synthesized payloads
 * are byte-identical to the browser codec's output.
 */

import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// Clipboard grants for BOTH directions: write (Share button) and read
// (harvesting the produced link for the fresh-context leg).
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/** Mint a "v1." fragment for an arbitrary payload (byte-identical to the codec). */
function fragFor(payload: unknown): string {
  const zipped = deflateSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `v1.${zipped.toString('base64url')}`;
}

/**
 * Keyboard-only navigation to a testid-tagged control: press Tab until
 * it becomes document.activeElement. Proves the control sits in the
 * tab order (mouseless-first requirement) — no locator.click anywhere.
 */
async function tabToTestId(page: Page, testid: string, maxTabs = 60): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    const active = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.getAttribute('data-testid'),
    );
    if (active === testid) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached data-testid="${testid}"`);
}

/** Collect page errors into an array for no-crash assertions. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

test.describe.serial('share-link round-trip (issue #91)', () => {
  test('Share (keyboard) → clipboard link → fresh context renders the same plan', async ({
    page,
    browser,
  }) => {
    const errors = trackErrors(page);

    // Stage the townhouse through the sanctioned bridge on the EDITOR
    // entry — the Share button lives in the editor toolbar, and "/"
    // (unlike "/viewer") keeps Tab free for focus navigation (the
    // viewer pane globally binds Tab to the walk/overview toggle).
    await page.goto('/');
    await page.locator('.pane-editor').waitFor();
    const raw = await readFile('demo/demo-townhouse.json', 'utf8');
    await page.evaluate((planJson: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__casaplaza.loadPlan(JSON.parse(planJson));
    }, raw);

    // MOUSELESS SHARE: open the File menu first (pkg #142 — a closed menu
    // is `hidden`, so its items are not focusable), Tab to the item,
    // activate with Enter.
    await page.getByTestId('btn-file').click();
    await tabToTestId(page, 'btn-share');
    await page.keyboard.press('Enter');
    await expect(page.locator('.inline-msg')).toContainText('Share link copied');

    // Harvest the produced link straight from the clipboard.
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('#plan=v1.');

    // FRESH CONTEXT: the recipient has no autosave, no state — only the URL.
    const ctx = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const recipient = await ctx.newPage();
    const recipientErrors = trackErrors(recipient);
    await recipient.goto(url);
    await recipient.locator('.viewer-gl-canvas').waitFor();
    await recipient.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__viewerStats?.();
        return typeof s === 'object' && s !== null && s.meshCount > 0;
      },
      { timeout: 15_000 },
    );

    // Scene signature == the townhouse figures pinned by townhouse.spec:
    // 6 furniture volumes (3 ground + 3 upper), 4 glass quads, gable roof.
    const stats = await recipient.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__viewerStats?.();
    });
    expect(stats.furnitureVolumeCount).toBe(6);
    expect(stats.glassQuadCount).toBe(4);
    expect(stats.roofTriangleCount).toBeGreaterThan(0);

    // The shared plan also landed in the recipient's EDITOR pane.
    const current = await recipient.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__casaplaza.getCurrent();
    });
    expect(current.floors.length).toBe(2);

    expect(errors).toEqual([]);
    expect(recipientErrors).toEqual([]);
    await ctx.close();
  });

  test('corrupt fragment (garbage payload) → friendly banner, app keeps booting', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto('/viewer#plan=v1.@@@@');
    await page.locator('.viewer-gl-canvas').waitFor();
    await expect(page.getByTestId('boot-notice')).toContainText(
      'Shared link could not be opened',
    );
    // Dismiss is a real button — keyboard operable.
    await page.getByTestId('boot-notice').getByRole('button', { name: 'Dismiss' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('boot-notice')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('damaged fragment (valid base64, non-deflate bytes) → friendly banner', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    // "hello world" is neither zlib nor JSON — decode must type it.
    const zipped = deflateSync(Buffer.from('hello world', 'utf8'));
    const frag = `v1.${zipped.toString('base64url').slice(0, 8)}`;
    await page.goto(`/viewer#plan=${frag}`);
    await page.locator('.viewer-gl-canvas').waitFor();
    await expect(page.getByTestId('boot-notice')).toContainText(
      'Shared link could not be opened',
    );
    expect(errors).toEqual([]);
  });

  test('wrong-shape fragment (valid deflate of non-plan JSON) → friendly banner', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(`/viewer#plan=${fragFor({ hello: 'world' })}`);
    await page.locator('.viewer-gl-canvas').waitFor();
    await expect(page.getByTestId('boot-notice')).toContainText(
      'Shared link could not be opened',
    );
    expect(errors).toEqual([]);
  });
});

test.describe('share-link adjacent: JSON import (issue #91 AC)', () => {
  test('Import accepts exported-shape JSON through validation', async ({ page }) => {
    await page.goto('/');
    const raw = JSON.parse(await readFile('demo/demo-townhouse.json', 'utf8'));

    // Playwright can set files on the hidden input directly — no picker.
    const file = join(tmpdir(), `casaplaza-import-${Date.now()}.json`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, JSON.stringify(raw, null, 2));

    await page.setInputFiles('[data-testid="import-file-input"]', file);
    await expect(page.locator('.inline-msg')).toContainText('Imported');
    const current = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__casaplaza.getCurrent();
    });
    expect(current.floors.length).toBe(2);
  });

  test('Import of INVALID JSON flashes and leaves the store untouched', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return JSON.stringify((window as any).__casaplaza.getCurrent());
    });
    const file = join(tmpdir(), `casaplaza-badimport-${Date.now()}.json`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, JSON.stringify({ schemaVersion: 2, floors: [] }));

    await page.setInputFiles('[data-testid="import-file-input"]', file);
    await expect(page.locator('.inline-msg')).toContainText('Import failed');
    const after = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return JSON.stringify((window as any).__casaplaza.getCurrent());
    });
    expect(after).toBe(before);
  });
});
