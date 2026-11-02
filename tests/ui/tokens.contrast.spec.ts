/**
 * Design tokens (issue #178, design §5.1, gap G11): both themes come
 * from src/ui/tokens.css, and every text/surface pairing the shell
 * paints clears WCAG AA. The spec parses the stylesheet itself, so a
 * token edit that breaks a pairing fails here before it ships.
 *
 * Pairs: text (>= 4.5:1) for ink, ink-2, accent-ink on accent-soft,
 * on-accent on accent, danger and warn on the surfaces; non-text
 * (>= 3:1) for the accent as a focus ring / active indicator.
 * ink-3 is for disabled text only (WCAG exempts disabled controls), so
 * it is pinned against nothing but recorded below.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src', 'ui', 'tokens.css'), 'utf8');

/** Custom properties declared inside the first block matching `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`tokens.css has no "${selector} {" block`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function lum(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const ch = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = ch.map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ['--ink', '--surface'],
  ['--ink', '--bg'],
  ['--ink', '--surface-2'],
  ['--ink-2', '--surface'],
  ['--ink-2', '--bg'],
  ['--ink-2', '--surface-2'],
  ['--accent-ink', '--accent-soft'],
  ['--on-accent', '--accent'],
  ['--danger', '--surface'],
  ['--warn', '--surface'],
  ['--accent-ink', '--surface'],
];

const NON_TEXT_PAIRS: Array<[string, string]> = [
  ['--accent', '--surface'],
  ['--accent', '--bg'],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme tokens', (_name, tokens) => {
  it('declares every colour token as a hex value', () => {
    for (const t of [
      '--bg', '--surface', '--surface-2', '--line', '--ink', '--ink-2', '--ink-3',
      '--accent', '--accent-soft', '--accent-ink', '--on-accent', '--danger', '--warn',
    ]) {
      expect(tokens[t], t).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(TEXT_PAIRS)('text %s on %s clears 4.5:1', (fg, bg) => {
    expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('indicator %s on %s clears 3:1', (fg, bg) => {
    expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('design §5.1 values are carried verbatim', () => {
  it('light theme', () => {
    expect(light['--bg']).toBe('#f6f8fb');
    expect(light['--surface']).toBe('#ffffff');
    expect(light['--accent']).toBe('#0f766e');
    expect(light['--ink']).toBe('#111827');
  });
  it('dark theme', () => {
    expect(dark['--bg']).toBe('#0f1318');
    expect(dark['--surface']).toBe('#161b22');
    expect(dark['--accent']).toBe('#2dd4bf');
    expect(dark['--accent-soft']).toBe('#113b37');
  });
});

describe('reduced motion', () => {
  it('zeroes every duration token under prefers-reduced-motion', () => {
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThan(-1);
    const durations = Object.keys(light).filter((k) => k.startsWith('--dur-'));
    expect(durations.length).toBeGreaterThan(0);
    const tail = css.slice(at);
    for (const d of durations) expect(tail).toMatch(new RegExp(`${d}\\s*:\\s*0ms`));
  });
});
