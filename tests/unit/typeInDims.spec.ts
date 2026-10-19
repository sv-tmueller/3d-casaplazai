// @vitest-environment happy-dom
/**
 * Issue #100 (Pkg 12.2) checkpoint 2 — the SHARED dim-field component
 * (src/editor/typeInDims.ts): parse/clamp rules, reject-with-flash
 * leaving state untouched, Enter/Tab/Esc keyboard contract, and the
 * Enter↔blur double-commit suppression.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mountDimFields,
  parseDims,
  type DimFields,
} from '../../src/editor/typeInDims';

function fire(
  el: Element,
  type: 'keydown' | 'input' | 'change',
  key?: string,
): void {
  el.dispatchEvent(
    new KeyboardEvent(type === 'keydown' ? 'keydown' : type, {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe('parseDims (issue #100)', () => {
  it('parses plain numbers', () => {
    expect(parseDims('4', '90')).toEqual({ lengthM: 4, angleDeg: 90 });
    expect(parseDims('3.25', '-90')).toEqual({
      lengthM: 3.25,
      angleDeg: 270,
    });
  });

  it('normalizes angles mod 360 (negatives and >360)', () => {
    expect(parseDims('2', '450')?.angleDeg).toBeCloseTo(90, 9);
    expect(parseDims('2', '-0.5')?.angleDeg).toBeCloseTo(359.5, 9);
    expect(parseDims('2', '720')?.angleDeg).toBeCloseTo(0, 9);
  });

  it('rejects non-finite input', () => {
    expect(parseDims('', '90')).toBeNull();
    expect(parseDims('abc', '90')).toBeNull();
    expect(parseDims('4', '')).toBeNull();
    expect(parseDims('NaN', '0')).toBeNull();
  });

  it('rejects zero and negative lengths', () => {
    expect(parseDims('0', '90')).toBeNull();
    expect(parseDims('-2', '90')).toBeNull();
  });
});

describe('mountDimFields (issue #100)', () => {
  let fields: DimFields;
  let commits: Array<{ lengthM: number; angleDeg: number }>;
  let invalids: number;
  let cancels: number;
  let lives: number;

  beforeEach(() => {
    commits = [];
    invalids = 0;
    cancels = 0;
    lives = 0;
    fields = mountDimFields({
      lengthM: 4,
      angleDeg: 90,
      onLive: () => {
        lives += 1;
      },
      onCommit: (d) => {
        commits.push(d);
      },
      onInvalid: () => {
        invalids += 1;
      },
      onCancel: () => {
        cancels += 1;
      },
      testidPrefix: 't',
      lengthLabel: 'Length (m)',
      angleLabel: 'Angle (°)',
    });
    document.body.appendChild(fields.root);
  });

  afterEach(() => {
    fields.root.remove();
  });

  it('renders the seeded values with stable testids/labels', () => {
    const len = fields.root.querySelector<HTMLInputElement>(
      "[data-testid='t-length']",
    );
    const ang = fields.root.querySelector<HTMLInputElement>(
      "[data-testid='t-angle']",
    );
    expect(len?.value).toBe('4');
    expect(ang?.value).toBe('90');
    expect(len?.getAttribute('aria-label')).toBe('Length (m)');
    expect(ang?.getAttribute('aria-label')).toBe('Angle (\u00B0)');
  });

  it('Enter commits the parsed pair; Escape cancels', () => {
    fields.lengthInput.value = '2.5';
    fields.angleInput.value = '135';
    fire(fields.lengthInput, 'keydown', 'Enter');
    expect(commits).toEqual([{ lengthM: 2.5, angleDeg: 135 }]);
    fire(fields.angleInput, 'keydown', 'Escape');
    expect(cancels).toBe(1);
    expect(invals()).toBe(0);
  });

  it('invalid input rejects WITHOUT committing', () => {
    fields.lengthInput.value = '';
    fire(fields.lengthInput, 'keydown', 'Enter');
    expect(commits).toEqual([]);
    expect(invalids).toBe(1);
  });

  it('live input previews only usable drafts', () => {
    fields.lengthInput.value = '3';
    fire(fields.lengthInput, 'input');
    expect(lives).toBe(1);
    fields.lengthInput.value = 'oops';
    fire(fields.lengthInput, 'input');
    expect(lives).toBe(1); // no preview for garbage
  });

  it('Enter swallows the trailing change event (no double commit)', () => {
    fields.lengthInput.value = '5';
    fire(fields.lengthInput, 'keydown', 'Enter');
    // Chromium fires `change` on the imminent blur/refocus.
    fire(fields.lengthInput, 'change');
    expect(commits).toHaveLength(1);
  });

  it('field keydown stops propagation (canvas handlers never see it)', () => {
    const seen: string[] = [];
    fields.root.parentElement!.addEventListener('keydown', (ev) => {
      seen.push((ev as KeyboardEvent).key);
    });
    fire(fields.lengthInput, 'keydown', 'Enter');
    fire(fields.angleInput, 'keydown', 'Escape');
    expect(seen).toEqual([]);
  });

  function invals(): number {
    return invalids;
  }
});
