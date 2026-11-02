/**
 * Asset manifest spec (issue #179): the committed material files and the
 * manifest that declares them must agree, stay inside the repo-size
 * budget, and every file must be attributed with a source URL and CC0.
 * Attribution rows are matched by file path, so a `## Models` section
 * appended by another package cannot interfere.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSET_BUDGET_BYTES,
  TEXTURE_SET_IDS,
  manifestFiles,
  setFileUrls,
  textureSetSpec,
} from '../../src/viewer/assets/manifest';

const MATERIALS_DIR = join(process.cwd(), 'public', 'assets', 'materials');
const ATTRIBUTION = join(process.cwd(), 'public', 'assets', 'ATTRIBUTION.md');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(relative(MATERIALS_DIR, full).split('\\').join('/'));
  }
  return out;
}

describe('material asset manifest', () => {
  it('every file the manifest declares exists on disk', () => {
    const onDisk = new Set(walk(MATERIALS_DIR));
    for (const file of manifestFiles()) {
      expect(onDisk.has(file), `missing ${file}`).toBe(true);
    }
  });

  it('no stray files sit in the materials folder', () => {
    const declared = new Set(manifestFiles());
    for (const file of walk(MATERIALS_DIR)) {
      expect(declared.has(file), `undeclared ${file}`).toBe(true);
    }
  });

  it('the committed material files stay under the 25 MB budget', () => {
    expect(ASSET_BUDGET_BYTES).toBe(25_000_000);
    const total = walk(MATERIALS_DIR)
      .map((f) => statSync(join(MATERIALS_DIR, f)).size)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(ASSET_BUDGET_BYTES);
  });

  it('every file is listed in ATTRIBUTION.md with an https source URL and CC0', () => {
    const rows = readFileSync(ATTRIBUTION, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('|'));
    for (const file of manifestFiles()) {
      const row = rows.find((r) => r.includes(`public/assets/materials/${file}`));
      expect(row, `no attribution row for ${file}`).toBeDefined();
      expect(row).toMatch(/https:\/\/(polyhaven\.com|ambientcg\.com)\/a\//);
      expect(row).toContain('CC0 1.0');
    }
  });

  it('keeps the shared header so the models section can merge cleanly', () => {
    const lines = readFileSync(ATTRIBUTION, 'utf8').split('\n');
    expect(lines[0]).toBe('# Asset attribution');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe(
      'Every bundled file under `public/assets/` is listed with its source URL and license.',
    );
    expect(lines[3]).toBe('');
    expect(lines[4]).toBe('## Materials (public/assets/materials/)');
  });

  it('declares thirteen sets with positive real-world tile sizes', () => {
    expect(TEXTURE_SET_IDS).toHaveLength(13);
    for (const id of TEXTURE_SET_IDS) {
      expect(textureSetSpec(id).tileMeters).toBeGreaterThan(0);
    }
  });

  it('builds URLs under the assets base for colour, normal and roughness maps', () => {
    const urls = setFileUrls('oak-planks');
    expect(urls.color).toMatch(/assets\/materials\/oak-planks\/color\.jpg$/);
    expect(urls.normal).toMatch(/assets\/materials\/oak-planks\/normal\.jpg$/);
    expect(urls.roughness).toMatch(/assets\/materials\/oak-planks\/arm\.jpg$/);
    expect(setFileUrls('wool-carpet').roughness).toMatch(/wool-carpet\/roughness\.jpg$/);
  });

  it('flags packed ARM sets (AO shares the roughness texture) only where the file is arm.jpg', () => {
    expect(textureSetSpec('oak-planks').packedArm).toBe(true);
    expect(textureSetSpec('wool-carpet').packedArm).toBe(false);
  });
});
