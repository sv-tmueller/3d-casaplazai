// @vitest-environment happy-dom
/**
 * Unit tests (issue #109, Pkg 13.1) for the mini-3D inset — STUBBED
 * renderer/deps (no three.js, no WebGL): the behaviors under test are
 * the FALLBACK detection, the DEBOUNCE + SIGNATURE-SKIP rebuild gate,
 * the GESTURE postponement, and the DISPOSE-on-collapse chain.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MINI3D_DEBOUNCE_MS,
  Mini3DInset,
  type CameraLike,
  type MiniBuiltScene,
  type Mini3DDeps,
  type RendererLike,
} from '../../src/editor/mini3d';
import type { FloorplanData } from '../../src/shared/schema';

/* ------------------------------- fixtures --------------------------------- */

const plan = (name: string): FloorplanData =>
  ({
    schemaVersion: 2,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    floors: [
      {
        id: 'f1',
        name: 'Ground',
        rooms: [
          {
            id: 'r1',
            name,
            polygon: [
              [0, 0],
              [4, 0],
              [4, 4],
              [0, 4],
            ],
            floorTexture: null,
            wallsOverride: [],
          },
        ],
        openings: [],
        stairs: [],
        furniture: [],
        underlay: null,
      },
    ],
  }) as unknown as FloorplanData;

/** Fake renderer recording renders/dispose/setSize calls. */
class FakeRenderer implements RendererLike {
  public renders = 0;
  public disposed = false;
  public sized = false;
  render(): void {
    this.renders += 1;
  }
  setSize(): void {
    this.sized = true;
  }
  setPixelRatio(): void {
    /* noop */
  }
  dispose(): void {
    this.disposed = true;
  }
}

const fakeCamera = (): CameraLike => ({
  aspect: 1,
  position: { set: () => undefined },
  lookAt: () => undefined,
  updateProjectionMatrix: () => undefined,
});

interface Harness {
  inset: Mini3DInset;
  container: HTMLElement;
  builds: MiniBuiltScene[];
  disposes: MiniBuiltScene[];
  renderer: FakeRenderer | null;
  timers: { flushed: number; fire(): void };
}

/**
 * Build an inset with fake deps + MANUAL timer pump (setTimeout seam).
 * `withRenderer: false` simulates a GL-less environment.
 */
function makeInset(withRenderer = true, gestureGate?: () => boolean): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const builds: MiniBuiltScene[] = [];
  const disposes: MiniBuiltScene[] = [];
  const renderer = withRenderer ? new FakeRenderer() : null;
  let n = 0;
  const deps: Mini3DDeps = {
    makeRenderer: () => renderer,
    makeCamera: fakeCamera,
    buildScene: (p) => {
      n += 1;
      const built: MiniBuiltScene = {
        scene: { tag: `scene-${n}-${p.floors[0]?.rooms[0]?.name ?? '?'}` },
        lightGroup: { tag: `lights-${n}` },
        bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
      };
      builds.push(built);
      return built;
    },
    disposeBuilt: (b) => disposes.push(b),
  };
  let pending: Array<() => void> = [];
  let flushed = 0;
  const inset = new Mini3DInset(container, deps, {
    setTimeoutFn: (cb, ms) => {
      expect(ms).toBe(MINI3D_DEBOUNCE_MS);
      pending.push(cb);
      return pending.length;
    },
    clearTimeoutFn: (id) => {
      pending = [];
      void id;
    },
    ...(gestureGate ? { gestureGate } : {}),
  });
  return {
    inset,
    container,
    builds,
    disposes,
    renderer,
    timers: {
      get flushed() {
        return flushed;
      },
      fire() {
        // Fire ONE queued callback (the currently armed debounce).
        const cb = pending.shift();
        flushed += 1;
        cb?.();
      },
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

/* ------------------------------- suites ----------------------------------- */

describe('fallback detection (GL-less environment)', () => {
  it('shows the stub (not the canvas) when the renderer cannot be made', () => {
    const h = makeInset(false);
    h.inset.notifyPlanChanged(plan('A'));
    h.inset.setOpen(true);
    expect(h.inset.isFallback()).toBe(true);
    expect(h.inset.isOpen()).toBe(true);
    const stub = h.container.querySelector('[data-testid="mini3d-fallback"]');
    const canvas = h.container.querySelector(
      '[data-testid="mini3d-canvas"]',
    ) as HTMLCanvasElement;
    expect(stub).not.toBeNull();
    expect((stub as HTMLElement).hidden).toBe(false);
    expect(canvas.hidden).toBe(true);
    // No scene was ever attempted — nothing to render.
    expect(h.builds).toHaveLength(0);
  });

  it('links the stub to the full viewer (/viewer route)', () => {
    const h = makeInset(false);
    h.inset.setOpen(true);
    const link = h.container.querySelector(
      '[data-testid="mini3d-fallback-link"]',
    ) as HTMLAnchorElement;
    expect(link.href.endsWith('/viewer')).toBe(true);
    expect(link.textContent).toBe('Open 3D view');
  });

  it('stays stubbed across collapse/expand (no zombie GL retries)', () => {
    const h = makeInset(false);
    h.inset.setOpen(true);
    h.inset.setOpen(false);
    h.inset.setOpen(true);
    expect(h.inset.isFallback()).toBe(true);
  });
});

describe('debounce + signature skip', () => {
  it('collapses bursts into ONE rebuild after the debounce fires', () => {
    const h = makeInset();
    h.inset.setOpen(true);
    h.inset.notifyPlanChanged(plan('A'));
    h.inset.notifyPlanChanged(plan('B'));
    h.inset.notifyPlanChanged(plan('C'));
    expect(h.builds).toHaveLength(0); // nothing synchronous
    h.timers.fire();
    expect(h.builds).toHaveLength(1); // latest plan wins
    expect(JSON.stringify(h.builds[0].scene)).toContain('scene-1-C');
  });

  it('skips the rebuild when the signature is unchanged', () => {
    const h = makeInset();
    h.inset.setOpen(true);
    const p = plan('A');
    h.inset.notifyPlanChanged(p);
    h.timers.fire();
    expect(h.builds).toHaveLength(1);
    h.inset.notifyPlanChanged(structuredClone(p)); // same content
    h.timers.fire();
    expect(h.builds).toHaveLength(1); // signature skip
  });

  it('does NOT arm the debounce while collapsed', () => {
    const h = makeInset();
    h.inset.notifyPlanChanged(plan('A')); // closed: cheap no-op
    h.timers.fire();
    expect(h.builds).toHaveLength(0);
  });

  it('postpones rebuilds while a draw gesture streams, catches up after', () => {
    let gesturing = false;
    const h = makeInset(true, () => gesturing);
    h.inset.setOpen(true);
    h.inset.notifyPlanChanged(plan('A'));
    gesturing = true;
    h.timers.fire(); // gesture gate: re-arms instead of rebuilding
    expect(h.builds).toHaveLength(0);
    gesturing = false;
    h.timers.fire(); // settled state picked up
    expect(h.builds).toHaveLength(1);
  });

  it('keeps the last-good scene when a build fails (invalid intermediate)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const builds: MiniBuiltScene[] = [];
    const disposes: MiniBuiltScene[] = [];
    let fail = false;
    const inset = new Mini3DInset(
      container,
      {
        makeRenderer: () => new FakeRenderer(),
        makeCamera: fakeCamera,
        buildScene: (p) => {
          if (fail) return null;
          const built: MiniBuiltScene = {
            scene: { tag: `ok-${p.floors[0]?.rooms[0]?.name}` },
            lightGroup: {},
            bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
          };
          builds.push(built);
          return built;
        },
        disposeBuilt: (b) => disposes.push(b),
      },
      {
        setTimeoutFn: (cb) => {
          queueMicrotask(cb);
          return 1;
        },
        clearTimeoutFn: () => undefined,
      },
    );
    inset.setOpen(true);
    inset.notifyPlanChanged(plan('good'));
    return new Promise<void>((done) => {
      queueMicrotask(() => {
        expect(builds).toHaveLength(1);
        fail = true;
        inset.notifyPlanChanged(plan('bad'));
        queueMicrotask(() => {
          expect(builds).toHaveLength(1); // last good retained
          expect(disposes).toHaveLength(0); // nothing replaced
          done();
        });
      });
    });
  });
});

describe('dispose on collapse', () => {
  it('tears down the scene graph + renderer when collapsed', async () => {
    const h = makeInset();
    h.inset.setOpen(true);
    h.inset.notifyPlanChanged(plan('A'));
    await new Promise<void>((done) => queueMicrotask(done));
    // Microtask flush covers the immediate build path (microtask timers).
    if (h.builds.length === 0) h.timers.fire();
    expect(h.builds.length).toBeGreaterThanOrEqual(1);
    h.inset.setOpen(false);
    expect(h.disposes).toHaveLength(1); // disposeBuilt(old scene)
    expect(h.renderer?.disposed).toBe(true); // renderer.dispose()
    expect(h.inset.isOpen()).toBe(false);
    expect(h.container.querySelector('[data-testid="mini3d-root"]')).not.toBeNull();
  });

  it('rapid toggle x10 leaks no accumulated scenes (final dispose wins)', async () => {
    const h = makeInset();
    // Immediate-build path via microtask timers: simulate rapid toggling
    // by alternating setOpen — every open builds at most one scene and
    // every close disposes exactly what was built.
    for (let i = 0; i < 10; i += 1) {
      h.inset.setOpen(true);
      h.inset.notifyPlanChanged(plan(`p${i}`));
      h.timers.fire();
      h.inset.setOpen(false);
    }
    expect(h.builds.length).toBe(h.disposes.length); // leak invariant
    // Since the fix-round sig reset, reopen ALWAYS repaints the last-known
    // plan at boot (stale-sig blank-inset bug) — a cycle may build TWICE
    // (boot repaint + debounced newer plan), hence 2-per-cycle bound.
    expect(h.builds.length).toBeLessThanOrEqual(20);
    expect(h.renderer?.disposed).toBe(true);
  });

  it('collapse→reopen with an IDENTICAL plan still rebuilds (regression: stale lastBuiltSig left a blank inset)', () => {
    const h = makeInset();
    h.inset.setOpen(true);
    const p = plan('A');
    h.inset.notifyPlanChanged(p);
    h.timers.fire();
    expect(h.builds).toHaveLength(1);

    h.inset.setOpen(false); // teardown: scene gone…
    expect(h.disposes).toHaveLength(1);

    h.inset.setOpen(true); // …boot must rebuild despite unchanged plan
    expect(h.builds).toHaveLength(2); // ← the fix: sig died with the scene
  });
});
