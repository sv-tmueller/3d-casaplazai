// @vitest-environment happy-dom
/**
 * HUD unit tests (issue #30): walk-mode entry affordances. The overlay
 * prompts "Click to walk" while walk is seated but unlocked; the reticle
 * replaces it once pointer lock is held. Both ship hidden by default.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildHud,
  onBindRoofToggle,
  reflectRoofVisibility,
  setWalkAffordances,
  type HudHandles,
} from '../../src/viewer/hud';

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

describe('roof visibility toggle (issue #86)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('renders a labelled, keyboard-focusable button announcing the live state', () => {
    const btn = document.querySelector<HTMLButtonElement>(
      '[data-testid="hud-roof-toggle"]',
    );
    expect(btn).toBe(handles.roofBtn);
    expect(btn!.getAttribute('aria-label')).toBe('Toggle roof visibility');
    expect(btn!.getAttribute('aria-pressed')).toBe('false');
    // Plain unfocused <button> tabs naturally — the mouseless mandate.
    expect(btn!.tabIndex).toBe(0);
  });

  it('announces the SHOW action while roofs are visible', () => {
    reflectRoofVisibility(handles, true);
    expect(handles.roofBtn.textContent).toBe('Hide roofs');
    expect(handles.roofBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('announces the HIDE action while roofs are masked', () => {
    reflectRoofVisibility(handles, false);
    expect(handles.roofBtn.textContent).toBe('Show roofs');
    expect(handles.roofBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('fires the listener with the flipped state on each click', () => {
    const seen: boolean[] = [];
    let visible = true;
    onBindRoofToggle(handles, () => visible, (next) => {
      visible = next;
      seen.push(next);
    });
    handles.roofBtn.click();
    handles.roofBtn.click();
    expect(seen).toEqual([false, true]);
  });

  it('unbinds cleanly (post-teardown clicks are inert)', () => {
    const unbind = onBindRoofToggle(
      handles,
      () => true,
      () => {
        throw new Error('listener fired after unbind');
      },
    );
    unbind();
    handles.roofBtn.click(); // must not throw
  });
});
