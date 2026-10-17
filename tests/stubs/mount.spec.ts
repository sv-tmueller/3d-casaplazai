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
    expect((root.firstElementChild as HTMLElement)?.dataset.screen).toBe('viewer');
  });
});
