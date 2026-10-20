// @vitest-environment happy-dom
/**
 * HUD unit tests (issues #30/#86/#120/#121, panel redesign #146).
 *
 * The HUD is a docked, collapsible control panel: a Mode segment, a
 * Visibility group (roofs + walls transparency), a Sun group (time of
 * day, north offset, compass) and a Floor readout. Every slider is a
 * NATIVE range input with a visible <label for=…> and a live value
 * readout (mouseless mandate); the collapse state persists per browser
 * through an injectable storage seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HUD_STATE_STORAGE_KEY,
  buildHud,
  dismissErrorToasts,
  hoursToClock,
  isHudCollapsed,
  loadHudState,
  onBindCollapse,
  onBindModeSegment,
  onBindRoofToggle,
  onBindSunNorth,
  onBindSunTime,
  onBindWallsAlpha,
  reflectCollapsed,
  reflectFloorName,
  reflectMode,
  reflectRoofVisibility,
  reflectSunSettings,
  reflectWallsAlpha,
  safeHudStorage,
  saveHudState,
  setEmptyState,
  setWalkAffordances,
  setWalkDisabled,
  showHint,
  toast,
  TOAST_TTL_MS,
  wallsAlphaFromSlider,
  type HudHandles,
} from '../../src/viewer/hud';
import { DEFAULT_SUN_SETTINGS } from '../../src/viewer/sun';
import type { ViewMode } from '../../src/viewer/types';

/** In-memory Storage stand-in (never touches the real browser slot). */
function memoryStorage(seed?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (k: string): string | null => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string): void => {
      map.set(k, String(v));
    },
    removeItem: (k: string): void => {
      map.delete(k);
    },
    clear: (): void => map.clear(),
    key: (i: number): string | null => [...map.keys()][i] ?? null,
    get length(): number {
      return map.size;
    },
  } as Storage;
}

/** Storage whose every access throws (privacy mode / sandboxed iframe). */
function hostileStorage(): Storage {
  return {
    getItem(): string | null {
      throw new Error('storage disabled');
    },
    setItem(): void {
      throw new Error('storage disabled');
    },
    removeItem(): void {
      throw new Error('storage disabled');
    },
    clear(): void {
      throw new Error('storage disabled');
    },
    key(): string | null {
      throw new Error('storage disabled');
    },
    length: 0,
  } as unknown as Storage;
}

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

  it('keeps the legacy handles and testids intact through the redesign', () => {
    expect(handles.root).toBeInstanceOf(HTMLElement);
    expect(handles.modeGroup.dataset.testid).toBe('hud-mode-toggle');
    expect(handles.fade.dataset.testid).toBe('hud-fade');
    expect(handles.toasts.dataset.testid).toBe('hud-toasts');
    expect(handles.roofBtn.dataset.testid).toBe('hud-roof-toggle');
    expect(handles.wallsAlpha.dataset.testid).toBe('hud-walls-alpha');
    expect(handles.sunTimeInput.dataset.testid).toBe('hud-sun-time');
    expect(handles.sunNorthInput.dataset.testid).toBe('hud-sun-north');
    expect(handles.compass.dataset.testid).toBe('hud-compass');
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

describe('walls-transparency slider (issue #120)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('renders a NATIVE range input (mouseless: arrows work for free)', () => {
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="hud-walls-alpha"]',
    );
    expect(input).toBe(handles.wallsAlpha);
    expect(input!.getAttribute('type')).toBe('range');
    expect(input!.getAttribute('min')).toBe('0');
    expect(input!.getAttribute('max')).toBe('100');
    expect(input!.getAttribute('step')).toBe('1');
    expect(input!.getAttribute('aria-label')).toBe('Wall transparency');
    expect(input!.value).toBe('0');
  });

  it('ships the % readout beside the slider, reading 0%', () => {
    expect(handles.wallsAlphaLabel.textContent).toBe('0%');
  });

  it('normalizes slider position → SH3D wallsAlpha (0..1)', () => {
    expect(wallsAlphaFromSlider(0)).toBe(0);
    expect(wallsAlphaFromSlider(40)).toBeCloseTo(0.4);
    expect(wallsAlphaFromSlider(100)).toBe(1);
    // Hostile / overshoot values clamp into the unit range.
    expect(wallsAlphaFromSlider(140)).toBe(1);
    expect(wallsAlphaFromSlider(-5)).toBe(0);
    expect(wallsAlphaFromSlider(Number.NaN)).toBe(0);
  });

  it('fires the listener with the NORMALIZED value on input', () => {
    const seen: number[] = [];
    onBindWallsAlpha(handles, (alpha) => seen.push(alpha));
    handles.wallsAlpha.value = '37';
    handles.wallsAlpha.dispatchEvent(new Event('input'));
    handles.wallsAlpha.value = '0';
    handles.wallsAlpha.dispatchEvent(new Event('input'));
    expect(seen).toEqual([0.37, 0]);
  });

  it('reflects state onto slider position and % label (init/reset sync)', () => {
    reflectWallsAlpha(handles, 0.42);
    expect(handles.wallsAlpha.value).toBe('42');
    expect(handles.wallsAlphaLabel.textContent).toBe('42%');
    reflectWallsAlpha(handles, 0);
    expect(handles.wallsAlpha.value).toBe('0');
    expect(handles.wallsAlphaLabel.textContent).toBe('0%');
  });

  it('unbinds cleanly (post-teardown input events are inert)', () => {
    const unbind = onBindWallsAlpha(handles, () => {
      throw new Error('listener fired after unbind');
    });
    unbind();
    handles.wallsAlpha.dispatchEvent(new Event('input')); // must not throw
  });
});

describe('sun controls (issue #121)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('renders keyboard-native range sliders with the sanctioned testids', () => {
    const time = document.querySelector<HTMLInputElement>(
      '[data-testid="hud-sun-time"]',
    );
    const north = document.querySelector<HTMLInputElement>(
      '[data-testid="hud-sun-north"]',
    );
    expect(time).toBe(handles.sunTimeInput);
    expect(north).toBe(handles.sunNorthInput);
    expect(time!.type).toBe('range');
    expect(north!.type).toBe('range');
    // Range inputs are arrow-key operable — the mouseless mandate.
    expect(time!.tabIndex).toBe(0);
    expect(time!.min).toBe('0');
    expect(time!.max).toBe('24');
    expect(time!.value).toBe('12'); // noon preset
    expect(north!.min).toBe('-180');
    expect(north!.max).toBe('180');
    expect(north!.value).toBe('0');
    expect(time!.getAttribute('aria-label')).toBe('Time of day (hours)');
    expect(north!.getAttribute('aria-label')).toBe('North offset (degrees)');
  });

  it('files the sun controls into one labelled group (legacy cluster testid)', () => {
    const cluster = handles.root.querySelector('[data-testid="hud-sun-cluster"]');
    expect(cluster).not.toBeNull();
    expect(cluster!.classList.contains('hud-group')).toBe(true);
    expect(cluster!.contains(handles.sunTimeInput)).toBe(true);
    expect(cluster!.contains(handles.sunNorthInput)).toBe(true);
    expect(cluster!.contains(handles.compass)).toBe(true);
    // The sun group lives INSIDE the collapsible body, not the header.
    expect(handles.panelBody.contains(cluster!)).toBe(true);
  });

  it('plumbs time-of-day input events to the listener', () => {
    const seen: number[] = [];
    const unbind = onBindSunTime(handles, (hours) => seen.push(hours));
    handles.sunTimeInput.value = '7.5';
    handles.sunTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toEqual([7.5]);
    unbind();
    handles.sunTimeInput.value = '9';
    handles.sunTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toEqual([7.5]); // inert after unbind
  });

  it('plumbs north-offset input events to the listener', () => {
    const seen: number[] = [];
    onBindSunNorth(handles, (deg) => seen.push(deg));
    handles.sunNorthInput.value = '-45';
    handles.sunNorthInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toEqual([-45]);
  });

  it('reflects settings onto the sliders, readouts and compass rotation', () => {
    expect(handles.compass.dataset.testid).toBe('hud-compass');
    reflectSunSettings(handles, { timeHours: 8, northOffsetDeg: 30 });
    expect(handles.sunTimeInput.value).toBe('8');
    expect(handles.sunTimeLabel.textContent).toBe('08:00');
    expect(handles.sunNorthInput.value).toBe('30');
    expect(handles.sunNorthLabel.textContent).toBe('30°');
    expect(handles.compass.style.transform).toBe('rotate(-30deg)');
    reflectSunSettings(handles, DEFAULT_SUN_SETTINGS);
    expect(handles.sunTimeInput.value).toBe('12');
    expect(handles.sunTimeLabel.textContent).toBe('12:00');
    expect(handles.sunNorthInput.value).toBe('0');
    expect(handles.sunNorthLabel.textContent).toBe('0°');
    expect(handles.compass.style.transform).toBe('rotate(0deg)');
  });
});

describe('toast de-duplication (issue #148)', () => {
  let handles: HudHandles;

  const nodes = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>('.hud-toast'),
  ];
  const badge = (node: HTMLElement): HTMLElement | null =>
    node.querySelector<HTMLElement>('[data-testid="hud-toast-count"]');

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stacks DISTINCT messages as separate nodes, oldest first', () => {
    toast(handles, 'first thing');
    toast(handles, 'second thing');
    expect(nodes()).toHaveLength(2);
    expect(nodes().map((n) => n.textContent)).toEqual(['first thing', 'second thing']);
  });

  it('collapses a repeated message into one node carrying an ×N counter', () => {
    toast(handles, 'Cannot render plan: boom', 'error');
    toast(handles, 'Cannot render plan: boom', 'error');
    expect(nodes()).toHaveLength(1);
    const node = nodes()[0]!;
    expect(node.textContent).toContain('Cannot render plan: boom');
    expect(badge(node)?.textContent).toBe('×2');
    // A third repeat keeps counting on the same node.
    toast(handles, 'Cannot render plan: boom', 'error');
    expect(nodes()).toHaveLength(1);
    expect(badge(nodes()[0]!)?.textContent).toBe('×3');
  });

  it('treats the same text in a different variant as a separate node', () => {
    toast(handles, 'heads up', 'info');
    toast(handles, 'heads up', 'error');
    expect(nodes()).toHaveLength(2);
    expect(nodes()[0]!.dataset.variant).toBe('info');
    expect(nodes()[1]!.dataset.variant).toBe('error');
  });

  it('resets the TTL on a repeat instead of restarting the stack', () => {
    toast(handles, 'still here');
    vi.advanceTimersByTime(TOAST_TTL_MS - 50);
    toast(handles, 'still here'); // repeat: collapses + pushes the deadline back
    vi.advanceTimersByTime(TOAST_TTL_MS - 50);
    expect(nodes()).toHaveLength(1);
    expect(nodes()[0]!.classList.contains('hud-toast-leaving')).toBe(false);
    vi.advanceTimersByTime(50); // the refreshed deadline elapses exactly
    expect(nodes()[0]!.classList.contains('hud-toast-leaving')).toBe(true);
    vi.advanceTimersByTime(400); // fade-out completes
    expect(nodes()).toHaveLength(0);
  });

  it('starts a FRESH uncounted node when a repeat lands mid-fade', () => {
    toast(handles, 'cycle');
    vi.advanceTimersByTime(TOAST_TTL_MS + 50); // now leaving
    toast(handles, 'cycle');
    expect(nodes()).toHaveLength(2);
    const fresh = nodes()[1]!;
    expect(fresh.classList.contains('hud-toast-leaving')).toBe(false);
    expect(badge(fresh)).toBeNull();
    vi.advanceTimersByTime(400);
    expect(nodes()).toEqual([fresh]);
  });

  it('dismissErrorToasts clears error nodes at once and spares info nodes', () => {
    toast(handles, 'just so you know', 'info');
    toast(handles, 'Cannot render plan: boom', 'error');
    toast(handles, 'Cannot render plan: boom', 'error');
    expect(nodes()).toHaveLength(2);
    dismissErrorToasts(handles);
    expect(nodes().map((n) => n.textContent)).toEqual(['just so you know']);
    expect(nodes()[0]!.classList.contains('hud-toast-leaving')).toBe(false);
    // The dismissal also forgets the message, so a later repeat is fresh.
    toast(handles, 'Cannot render plan: boom', 'error');
    expect(nodes()).toHaveLength(2);
    expect(badge(nodes()[1]!)).toBeNull();
  });
});

describe('empty-plan state affordances (issue #148)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('ships the centered message hidden, with the sanctioned testid and copy', () => {
    expect(handles.emptyState.dataset.testid).toBe('hud-empty-state');
    expect(handles.emptyState.textContent).toBe('Draw a room in the plan to see it here');
    expect(handles.emptyState.hidden).toBe(true);
    expect(document.querySelector('[data-testid="hud-empty-state"]')).toBe(handles.emptyState);
  });

  it('reveals and hides the message via setEmptyState', () => {
    setEmptyState(handles, true);
    expect(handles.emptyState.hidden).toBe(false);
    setEmptyState(handles, false);
    expect(handles.emptyState.hidden).toBe(true);
  });

  it('blocks the Walk toggle via setWalkDisabled (real disabled + aria)', () => {
    setWalkDisabled(handles, true);
    expect(handles.walkBtn.disabled).toBe(true);
    expect(handles.walkBtn.getAttribute('aria-disabled')).toBe('true');
    setWalkDisabled(handles, false);
    expect(handles.walkBtn.disabled).toBe(false);
    expect(handles.walkBtn.getAttribute('aria-disabled')).toBe('false');
  });
});

describe('control panel structure (issue #146)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('docks a titled panel instead of the flat unlabeled bar', () => {
    const panel = document.querySelector('[data-testid="hud-panel"]');
    expect(panel).toBe(handles.panel);
    expect(panel!.classList.contains('hud-panel')).toBe(true);
    // The one-row bar is retired: every control now sits in the panel.
    expect(document.querySelector('.hud-bar')).toBeNull();
    expect(handles.panel.contains(handles.modeGroup)).toBe(true);
    expect(handles.panel.contains(handles.panelBody)).toBe(true);
    expect(handles.panel.querySelector('.hud-panel-title')?.textContent).toBe(
      'View',
    );
  });

  it('keeps the legacy hud-mode-toggle testid on the segment group', () => {
    const group = document.querySelector('[data-testid="hud-mode-toggle"]');
    expect(group).toBe(handles.modeGroup);
    expect(group!.getAttribute('role')).toBe('group');
    expect(group!.getAttribute('aria-label')).toBe('View mode');
    expect(handles.overviewBtn.dataset.testid).toBe(
      'hud-mode-segment-overview',
    );
    expect(handles.walkBtn.dataset.testid).toBe('hud-mode-segment-walk');
    expect(handles.overviewBtn.textContent).toBe('Overview');
    expect(handles.walkBtn.textContent).toBe('Walk');
  });

  it('gives EVERY slider a visible <label for> and a live value readout', () => {
    const pairs = [
      [handles.wallsAlpha, handles.wallsAlphaLabel, 'Walls transparency', '0%'],
      [handles.sunTimeInput, handles.sunTimeLabel, 'Time of day', '12:00'],
      [handles.sunNorthInput, handles.sunNorthLabel, 'North offset', '0°'],
    ] as const;
    for (const [input, readout, text, initial] of pairs) {
      expect(input.getAttribute('type')).toBe('range');
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe(text);
      expect(readout.textContent).toBe(initial);
      // Label, control and readout share one field row.
      const field = input.parentElement;
      expect(field!.contains(label!)).toBe(true);
      expect(field!.contains(readout)).toBe(true);
    }
    // Distinct ids: <label for> pairs must not alias each other.
    expect(
      new Set([
        handles.wallsAlpha.id,
        handles.sunTimeInput.id,
        handles.sunNorthInput.id,
      ]).size,
    ).toBe(3);
  });

  it('files the controls into Visibility / Sun / Floor groups', () => {
    const groups = handles.panelBody.querySelectorAll('.hud-group');
    expect(groups.length).toBe(3);
    const titles = Array.from(handles.panelBody.querySelectorAll('.hud-group-title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['Visibility', 'Sun', 'Floor']);
    const visibility = groups[0]!;
    expect(visibility.contains(handles.roofBtn)).toBe(true);
    expect(visibility.contains(handles.wallsAlpha)).toBe(true);
    expect(groups[2]!.contains(handles.floorReadout)).toBe(true);
  });

  it('keeps the floor readout READ-ONLY (no control, mirrors the render)', () => {
    expect(handles.floorReadout.dataset.testid).toBe('hud-floor-readout');
    expect(handles.floorReadout.textContent).toBe('—'); // nothing rendered yet
    expect(
      handles.panelBody.querySelectorAll('[data-testid="hud-floor-readout"] input'),
    ).toHaveLength(0);
  });
});

describe('mode segment reflects the CURRENT mode (#146)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('marks the live mode and clears the other segment', () => {
    reflectMode(handles, 'overview');
    expect(handles.overviewBtn.getAttribute('aria-pressed')).toBe('true');
    expect(handles.walkBtn.getAttribute('aria-pressed')).toBe('false');
    expect(handles.overviewBtn.classList.contains('hud-segment-active')).toBe(
      true,
    );
    expect(handles.walkBtn.classList.contains('hud-segment-active')).toBe(false);

    reflectMode(handles, 'walk');
    expect(handles.overviewBtn.getAttribute('aria-pressed')).toBe('false');
    expect(handles.walkBtn.getAttribute('aria-pressed')).toBe('true');
    expect(handles.walkBtn.classList.contains('hud-segment-active')).toBe(true);
    expect(handles.overviewBtn.classList.contains('hud-segment-active')).toBe(
      false,
    );
  });

  it('requests the mode of the CLICKED segment (not a blind flip)', () => {
    const seen: ViewMode[] = [];
    const unbind = onBindModeSegment(handles, (next) => seen.push(next));
    handles.overviewBtn.click();
    handles.walkBtn.click();
    handles.overviewBtn.click();
    expect(seen).toEqual(['overview', 'walk', 'overview']);
    unbind();
    handles.walkBtn.click();
    expect(seen).toEqual(['overview', 'walk', 'overview']); // inert after unbind
  });
});

describe('collapsible panel (#146)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('ships expanded, with an aria-wired, keyboard-focusable chevron', () => {
    expect(handles.panelBody.hidden).toBe(false);
    expect(isHudCollapsed(handles)).toBe(false);
    expect(handles.collapseBtn.getAttribute('aria-expanded')).toBe('true');
    expect(handles.collapseBtn.getAttribute('aria-controls')).toBe(
      handles.panelBody.id,
    );
    expect(handles.panelBody.id).not.toBe('');
    expect(handles.collapseBtn.tabIndex).toBe(0); // Enter/Space fire a click
  });

  it('reflectCollapsed hides the body, flips aria-expanded and the chevron', () => {
    reflectCollapsed(handles, true);
    expect(handles.panelBody.hidden).toBe(true);
    expect(handles.collapseBtn.getAttribute('aria-expanded')).toBe('false');
    expect(handles.panel.classList.contains('hud-panel-collapsed')).toBe(true);
    reflectCollapsed(handles, false);
    expect(handles.panelBody.hidden).toBe(false);
    expect(handles.collapseBtn.getAttribute('aria-expanded')).toBe('true');
    expect(handles.panel.classList.contains('hud-panel-collapsed')).toBe(false);
  });

  it('leaves the Mode segment visible while collapsed (always-on control)', () => {
    reflectCollapsed(handles, true);
    expect(handles.panel.contains(handles.modeGroup)).toBe(true);
    // …and the mode group is NOT inside the hidden body.
    expect(handles.panelBody.contains(handles.modeGroup)).toBe(false);
  });

  it('fires the listener with the NEXT state on each click', () => {
    const seen: boolean[] = [];
    onBindCollapse(handles, (collapsed) => {
      reflectCollapsed(handles, collapsed);
      seen.push(collapsed);
    });
    handles.collapseBtn.click();
    handles.collapseBtn.click();
    expect(seen).toEqual([true, false]);
    expect(isHudCollapsed(handles)).toBe(false);
  });

  it('unbinds cleanly (post-teardown clicks are inert)', () => {
    const unbind = onBindCollapse(handles, () => {
      throw new Error('listener fired after unbind');
    });
    unbind();
    handles.collapseBtn.click(); // must not throw
  });
});

describe('collapse persistence (#146)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('round-trips through the injected storage seam (survives a reload)', () => {
    const storage = memoryStorage();
    const first = buildHud(document.body, storage);
    onBindCollapse(first, (collapsed) => {
      reflectCollapsed(first, collapsed);
      saveHudState(storage, { collapsed });
    });
    first.collapseBtn.click();
    expect(JSON.parse(storage.getItem(HUD_STATE_STORAGE_KEY)!)).toEqual({
      collapsed: true,
    });

    // Reload: a fresh HUD in the same browser boots collapsed.
    document.body.innerHTML = '';
    const reborn = buildHud(document.body, storage);
    expect(isHudCollapsed(reborn)).toBe(true);
    expect(reborn.panelBody.hidden).toBe(true);
    expect(reborn.collapseBtn.getAttribute('aria-expanded')).toBe('false');
    expect(reborn.panel.classList.contains('hud-panel-collapsed')).toBe(true);

    // …and expanding again is persisted too.
    onBindCollapse(reborn, (collapsed) => {
      reflectCollapsed(reborn, collapsed);
      saveHudState(storage, { collapsed });
    });
    reborn.collapseBtn.click();
    document.body.innerHTML = '';
    const third = buildHud(document.body, storage);
    expect(isHudCollapsed(third)).toBe(false);
  });

  it('boots expanded with the default (browser) storage seam', () => {
    const fresh = buildHud(document.body);
    expect(isHudCollapsed(fresh)).toBe(false);
  });

  it('fails open to expanded on corrupt or unavailable slots', () => {
    // Corrupt JSON: never throw, never trap the panel closed.
    const corrupt = memoryStorage({ [HUD_STATE_STORAGE_KEY]: '{not json' });
    expect(loadHudState(corrupt)).toEqual({ collapsed: false });
    expect(corrupt.getItem(HUD_STATE_STORAGE_KEY)).toBeNull(); // junk dropped
    // Missing slot / no storage at all.
    expect(loadHudState(memoryStorage())).toEqual({ collapsed: false });
    expect(loadHudState(null)).toEqual({ collapsed: false });
    // Hostile shape: an object without the flag.
    expect(
      loadHudState(memoryStorage({ [HUD_STATE_STORAGE_KEY]: '"ahoy"' })),
    ).toEqual({ collapsed: false });
    expect(
      loadHudState(memoryStorage({ [HUD_STATE_STORAGE_KEY]: '{"collapsed":"yes"}' })),
    ).toEqual({ collapsed: false });
    // Privacy mode: every access throws — reads degrade, writes no-op.
    const hostile = hostileStorage();
    expect(loadHudState(hostile)).toEqual({ collapsed: false });
    expect(() => saveHudState(hostile, { collapsed: true })).not.toThrow();
    expect(() => buildHud(document.body, hostile)).not.toThrow();
  });

  it('resolves the browser slot best-effort (may legitimately be null)', () => {
    // happy-dom exposes window.localStorage; a sandbox may not. The
    // accessor must never throw either way.
    expect(() => safeHudStorage()).not.toThrow();
  });
});

describe('hoursToClock (#146)', () => {
  it('formats slider hours as a wall clock readout', () => {
    expect(hoursToClock(0)).toBe('00:00');
    expect(hoursToClock(7.5)).toBe('07:30');
    expect(hoursToClock(12)).toBe('12:00');
    expect(hoursToClock(14.5)).toBe('14:30');
    expect(hoursToClock(23.5)).toBe('23:30');
    expect(hoursToClock(24)).toBe('24:00');
    expect(hoursToClock(9.25)).toBe('09:15');
  });

  it('clamps hostile values instead of rendering garbage', () => {
    expect(hoursToClock(Number.NaN)).toBe('00:00');
    expect(hoursToClock(Number.POSITIVE_INFINITY)).toBe('00:00');
    expect(hoursToClock(-3)).toBe('00:00');
    expect(hoursToClock(99)).toBe('24:00');
    expect(hoursToClock(23.999)).toBe('24:00');
  });
});

describe('floor readout (#146)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('shows the name of the floor the viewer actually renders', () => {
    reflectFloorName(handles, 'Ground');
    expect(handles.floorReadout.textContent).toBe('Ground');
    reflectFloorName(handles, 'Upper');
    expect(handles.floorReadout.textContent).toBe('Upper');
  });

  it('shows a placeholder when no plan is loaded yet', () => {
    reflectFloorName(handles, '');
    expect(handles.floorReadout.textContent).toBe('—');
    reflectFloorName(handles, '   ');
    expect(handles.floorReadout.textContent).toBe('—');
  });
});

describe('walk hint strip (#146)', () => {
  let handles: HudHandles;

  beforeEach(() => {
    document.body.innerHTML = '';
    handles = buildHud(document.body);
  });

  it('lives in its own bottom strip, NOT inside the control panel', () => {
    const hint = document.querySelector('[data-testid="hud-hint"]');
    expect(hint).toBe(handles.hint);
    expect(handles.panel.contains(handles.hint)).toBe(false);
    expect(handles.hint.closest('.hud-strip')).not.toBeNull();
  });

  it('is driven by showHint (single owner) and starts empty', () => {
    expect(handles.hint.textContent).toBe('');
    showHint(handles, 'WASD to move · Esc to release');
    expect(handles.hint.textContent).toBe('WASD to move · Esc to release');
    showHint(handles, '');
    expect(handles.hint.textContent).toBe('');
  });

  // Fix round for #146: the strip and the toast stack share ONE
  // bottom-anchored column, with the strip LAST — layout keeps the toast
  // stack (which grows upward) from ever reaching the hint, and DOM
  // order keeps the strip painted above the toasts. The compositor
  // geometry itself is pinned in e2e/hud-panel.spec.ts ('hint strip
  // never collides with the toast stack'); this pins the structure.
  it('shares one bottom column with the toast stack, and comes last', () => {
    const column = document.querySelector('[data-testid="hud-bottom"]');
    const strip = handles.hint.closest('.hud-strip');
    expect(column).not.toBeNull();
    expect(strip).not.toBeNull();
    expect(handles.toasts.parentElement).toBe(column);
    expect((strip as Element).parentElement).toBe(column);
    const kids = [...(column as Element).children];
    expect(kids.indexOf(handles.toasts)).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(handles.toasts)).toBeLessThan(kids.indexOf(strip as Element));
  });
});
