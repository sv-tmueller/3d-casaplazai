/**
 * /viewer redirect + share-link target (issue #178, gap G13): the old
 * viewer route lands on the workspace with the 3D view active, keeping
 * its query and the #plan= fragment; share links point there directly.
 */
import { describe, expect, it } from 'vitest';
import { planFragmentFromHash, shareUrl, workspaceUrlFromViewer } from '../../src/shared/viewerRoute';

describe('workspaceUrlFromViewer', () => {
  it('adds view=3d to a bare /viewer', () => {
    expect(workspaceUrlFromViewer('', '')).toBe('/?view=3d');
  });

  it('keeps the query (end-anchored params stay parseable) and the fragment', () => {
    expect(workspaceUrlFromViewer('?quality=low', '#plan=v1.abc')).toBe('/?quality=low&view=3d#plan=v1.abc');
    expect(workspaceUrlFromViewer('?perf=1&quality=high', '')).toBe('/?perf=1&quality=high&view=3d');
  });

  it('replaces any view param already present', () => {
    expect(workspaceUrlFromViewer('?view=walk&a=1', '')).toBe('/?a=1&view=3d');
  });
});

describe('shareUrl', () => {
  it('targets the workspace 3D view directly', () => {
    expect(shareUrl('https://x.test', 'v1.abc')).toBe('https://x.test/?view=3d#plan=v1.abc');
  });
});

describe('planFragmentFromHash', () => {
  it('extracts the payload after #plan=', () => {
    expect(planFragmentFromHash('#plan=v1.abc')).toBe('v1.abc');
    expect(planFragmentFromHash('#other')).toBeNull();
    expect(planFragmentFromHash('')).toBeNull();
  });
});
