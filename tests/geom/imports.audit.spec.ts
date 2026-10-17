/**
 * Imports audit (issue #5, CP7): src/geom must stay dependency-light —
 * no 'three' (renderer belongs to pkg 5) and no DOM globals (buffers +
 * plain objects travel to the worker/renderer untouched).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bfrom\s+['"]three(?:\/[\w./-]*)?['"]/,
  /^import\s+['"]three(?:\/[\w./-]*)?['"]/m,
  /\brequire\(\s*['"]three(?:\/[\w./-]*)?['"]\s*\)/,
];

const DOM_GLOBAL_PATTERN =
  /\b(document|window|navigator|HTMLElement|HTMLCanvasElement|requestAnimationFrame|localStorage)\b/;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const geomDir = join(process.cwd(), 'src', 'geom');
const files = collectTsFiles(geomDir);

describe('imports audit — src/geom purity', () => {
  it('actually found the geom sources', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(geomDir, f), f]))(
    '%s bans three.js imports',
    (_label, filePath) => {
      const src = readFileSync(filePath as string, 'utf8');
      for (const pat of FORBIDDEN_PATTERNS) {
        expect(src.match(pat)).toBeNull();
      }
    },
  );

  it.each(files.map((f) => [relative(geomDir, f), f]))(
    '%s bans DOM/global browser identifiers',
    (_label, filePath) => {
      const src = readFileSync(filePath as string, 'utf8');
      // Strip /* block */ and // line comments so prose mentioning
      // "window"/"document" (e.g. this sentence!) cannot trip the scan.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((ln) => ln.replace(/^(\s*)\/\/.*$/, '$1'))
        .join('\n');
      expect(stripped.trim()).toBeTruthy();
      expect(DOM_GLOBAL_PATTERN.test(stripped)).toBe(false);
    },
  );

  it('package has no three dependency recorded', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    expect(Object.keys(all)).not.toContain('three');
  });
});
