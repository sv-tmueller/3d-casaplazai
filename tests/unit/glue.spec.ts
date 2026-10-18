// @vitest-environment happy-dom
/**
 * Issue #36 — single-sided commit warning. The glue can't widen the
 * dispatch result, so it diffs the opening-row count across the
 * addOpening dispatch: +1 row = the cut pierces only the host wall,
 * +2 rows = silent shared-door success.
 */
import { describe, expect, it } from 'vitest';
import { openingCommitNotice } from '../../src/editor/glue';

describe('openingCommitNotice (#36 single-sided warning)', () => {
  it('warns when a single row was emitted (pierces only this wall)', () => {
    const notice = openingCommitNotice(0, 1);
    expect(notice).not.toBeNull();
    expect(notice).toContain('only this wall');
  });

  it('stays silent when the shared door emitted two rows', () => {
    expect(openingCommitNotice(0, 2)).toBeNull();
    expect(openingCommitNotice(3, 5)).toBeNull();
  });

  it('is silent for a no-op (no row added)', () => {
    expect(openingCommitNotice(2, 2)).toBeNull();
  });
});
