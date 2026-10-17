// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountEditor } from '../../src/editor/main';
import { mountViewer } from '../../src/viewer/main';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

describe('entry stubs mount without crashing', () => {
  it('mountEditor fills #root', () => {
    const root = document.getElementById('root')!;
    mountEditor(root);
    expect(root.children.length).toBeGreaterThan(0);
    expect((root.firstElementChild as HTMLElement)?.dataset.screen).toBe('editor');
  });

  it('mountViewer fills #root', () => {
    const root = document.getElementById('root')!;
    mountViewer(root);
    expect(root.children.length).toBeGreaterThan(0);
    // The viewer entry nests panes under a .stage wrapper; the pane
    // contract is positional (any descendant), not first-child.
    const pane = root.querySelector<HTMLElement>(
      'section[data-screen="viewer"]',
    );
    expect(pane).not.toBeNull();
    expect(pane?.dataset.screen).toBe('viewer');
  });
});
