/**
 * Imports audit (issue #178, design §5.2): the component kit never
 * imports editor, viewer or app code. Same scan pattern as
 * tests/geom/imports.audit.spec.ts — the kit may depend on src/shared
 * and on itself only, so it can be reviewed (dev/kit.html) and reused
 * without the app.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const uiDir = join(process.cwd(), 'src', 'ui');
const files = collectTsFiles(uiDir);

/** Every module specifier a file imports (static, dynamic, side-effect). */
function specifiers(src: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

describe('imports audit — src/ui is a standalone kit', () => {
  it('actually found the kit sources', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [relative(uiDir, f), f]))(
    '%s imports nothing from editor, viewer or app',
    (_label, filePath) => {
      const src = readFileSync(filePath as string, 'utf8');
      for (const spec of specifiers(src)) {
        expect(spec, `${_label} imports ${spec}`).not.toMatch(/(^|\/)(editor|viewer|app)(\/|$)/);
        expect(spec, `${_label} imports ${spec}`).not.toBe('three');
      }
    },
  );
});
