/**
 * Anti-drift (issue #7): EVERY row of the README's "Keyboard shortcuts"
 * table must correspond to an entry in src/editor/shortcuts.ts, and vice
 * versa. Greps the checked-in Markdown against the registry so a stray
 * edit on either side fails CI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from '../../src/editor/shortcuts';

const readme = (): string =>
  readFileSync(join(process.cwd(), 'README.md'), 'utf8');

/** Pull "| keys | action |" rows out of the README shortcuts section. */
function readmeRows(): Array<{ keys: string; action: string }> {
  const md = readme();
  const section = md.split(/<!-- BEGIN SHORTCUTS -->/)[1]?.split(
    /<!-- END SHORTCUTS -->/,
  )[0];
  if (section === undefined) {
    throw new Error('README is missing the BEGIN/END SHORTCUTS markers');
  }
  const rows: Array<{ keys: string; action: string }> = [];
  for (const line of section.split('\n')) {
    const m = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/.exec(line.trim());
    if (!m || m[1] === 'Keys' || m[1].startsWith('-')) continue;
    rows.push({ keys: m[1], action: m[2] });
  }
  return rows;
}

describe('README ↔ shortcuts registry sync (issue #7)', () => {
  it('lists exactly the registry entries, same order', () => {
    const expected = SHORTCUTS.map((s) => ({ keys: s.keys, action: s.action }));
    expect(readmeRows()).toEqual(expected);
  });
});
