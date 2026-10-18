// @vitest-environment happy-dom
/**
 * HUD unit tests (issue #30): walk-mode entry affordances. The overlay
 * prompts "Click to walk" while walk is seated but unlocked; the reticle
 * replaces it once pointer lock is held. Both ship hidden by default.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { buildHud, setWalkAffordances, type HudHandles } from '../../src/viewer/hud';

describe('walk-mode entry affordances (issue #30)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('ships the overlay and reticle hidden by default', () => {
    expect(handles.walkOverlay.hidden).toBe(true);
    expect(handles.walkReticle.hidden).toBe(true);
  });

  it('exposes the sanctioned testids and prompt copy', () => {
    const overlay = document.querySelector('[data-testid="walk-entry-overlay"]');
    const reticle = document.querySelector('[data-testid="walk-reticle"]');
    expect(overlay).toBe(handles.walkOverlay);
    expect(reticle).toBe(handles.walkReticle);
    expect(handles.walkOverlay.textContent).toContain('Click to walk');
  });

  it('shows the overlay only (unlocked-walk entry state)', () => {
    setWalkAffordances(handles, { overlay: true, reticle: false });
    expect(handles.walkOverlay.hidden).toBe(false);
    expect(handles.walkReticle.hidden).toBe(true);
  });

  it('shows the reticle only (locked-walk state)', () => {
    setWalkAffordances(handles, { overlay: false, reticle: true });
    expect(handles.walkOverlay.hidden).toBe(true);
    expect(handles.walkReticle.hidden).toBe(false);
  });

  it('clears both affordances on unlock/overview', () => {
    setWalkAffordances(handles, { overlay: true, reticle: false });
    setWalkAffordances(handles, { overlay: false, reticle: false });
    expect(handles.walkOverlay.hidden).toBe(true);
    expect(handles.walkReticle.hidden).toBe(true);
  });

  it('appends the affordance fields without disturbing the existing handles', () => {
    expect(handles.root).toBeInstanceOf(HTMLElement);
    expect(handles.toggleBtn.dataset.testid).toBe('hud-mode-toggle');
    expect(handles.fade.dataset.testid).toBe('hud-fade');
    expect(handles.toasts.dataset.testid).toBe('hud-toasts');
  });
});
