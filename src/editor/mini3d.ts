/**
 * Pkg 13.1 (issue #109): mini-3D inset for the editor pane.
 *
 * Self-contained panel owning a <canvas> + WebGL renderer that mirrors
 * the plan LIVE using the EXACT viewer pipeline (parseValidatedPlan →
 * compilePlan → adaptScene → buildViewerScene — the appController.ts
 * refreshAdaptation pattern, no reimplementation). The heavy viewer
 * modules (three.js included) arrive via DYNAMIC import on first
 * enable, so the editor's initial chunk stays lean (layering law:
 * editor→viewer is the legal direction; src/geom stays three-free).
 *
 * Discipline compliance (#101/#100/#99): ZERO window-level keydown
 * listeners here. Pointer events bind to the inset canvas only; the
 * toggle/close keys live in glue's CANVAS keydown handler (canvas-
 * focused strokes only) — the pinned Esc/Enter/I/L canvas paths are
 * untouched.
 *
 * Judgments disclosed per the SUB_PLAN:
 * - Materials forced LOW (flattened colors) via #109's additive
 *   `forceLowMaterials` param — the inset is a thumbnail; the main 2D
 *   canvas must not fund texture setup.
 * - Drag-look is a ~30-line HAND-ROLL (yaw/pitch spherical orbit),
 *   NOT an OrbitRig retrofit: OrbitRig couples an orthographic camera +
 *   pan-oriented OrbitControls + idle-spin machinery — none of which
 *   fits a perspective drag-look thumbnail without adaptation.
 * - Rebuild throttle: 150 ms debounce + plan-signature skip (same
 *   JSON.stringify fingerprint idea as appController.planSignature) +
 *   a drawGestureInProgress() gate that POSTPONES (re-arms) while a
 *   gesture streams — a mid-draw mutation never triggers a recompile,
 *   and the settled state is picked up right after the gesture ends.
 */

import { compilePlan, parseValidatedPlan } from "../geom";
import type { FloorplanData, Room } from "../shared/schema";
import { flatOpenings, flatRooms } from "../shared/schema";

/** Debounce window for store-notification → rebuild (SUB_PLAN figure). */
export const MINI3D_DEBOUNCE_MS = 150;

/** Device-pixel-ratio ceiling for the inset (SUB_PLAN: min(dpr, 2)). */
export const MINI3D_MAX_DPR = 2;

/** Structural slice of THREE.WebGLRenderer the inset relies on. */
export interface RendererLike {
  render(scene: unknown, camera: unknown): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/** Structural slice of THREE.PerspectiveCamera the inset relies on. */
export interface CameraLike {
  aspect: number;
  position: { set(x: number, y: number, z: number): unknown };
  lookAt(x: number, y: number, z: number): unknown;
  updateProjectionMatrix(): void;
}

/** What buildScene hands back: the opaque scene graph + fit bounds. */
export interface MiniBuiltScene {
  /** THREE.Scene (opaque — only the renderer consumes it). */
  scene: unknown;
  /** Light group — disposal twin (appController dispose pattern). */
  lightGroup: unknown;
  /** Plan bounding box driving camera fit + drag-look pivot. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Injectable viewer surface. Production loads the REAL modules lazily
 * (loadViewerDeps below); unit tests fabricate fakes — the inset never
 * imports three.js statically.
 */
export interface Mini3DDeps {
  /** WebGL renderer on the inset canvas; null when GL is unavailable. */
  makeRenderer(canvas: HTMLCanvasElement): RendererLike | null;
  /** Fresh perspective camera (aspect patched on resize). */
  makeCamera(): CameraLike;
  /**
   * Full viewer pipeline for a CURRENT-schema plan. Null on ANY
   * compile/adapt/build failure (caller keeps the last-good scene).
   */
  buildScene(plan: FloorplanData): MiniBuiltScene | null;
  /** Dispose a built scene graph (geometry + materials + lights). */
  disposeBuilt(built: MiniBuiltScene): void;
}

/**
 * Timer seams so unit tests advance the debounce deterministically. The
 * handle is `unknown` on purpose: browser timers return a number, Node
 * flavoured DOM shims return a Timeout object — the inset only passes
 * the opaque handle back to clearTimeoutFn.
 */
export interface Mini3DTimers {
  setTimeoutFn: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn: (id: unknown) => void;
}

/** Drag-look tuning (hand-rolled spherical orbit). */
const FOV_DEG = 50;
const DEFAULT_PITCH_DEG = 50;
const MIN_PITCH_DEG = 15;
const MAX_PITCH_DEG = 85;
/** Pointer px → radians sensitivity. */
const LOOK_RAD_PER_PX = 0.0075;

/**
 * The mini-3D inset: one DOM subtree (mounted by glue as a flex sibling
 * in the inspector dock), one lazily-created GL stack, one debounced
 * rebuild path. Construct once per editor session; toggle via setOpen.
 */
export class Mini3DInset {
  public readonly root: HTMLDivElement;

  private readonly deps: Mini3DDeps;
  private readonly timers: Mini3DTimers;
  /** Mid-gesture postponement seam (glue's drawGestureInProgress). */
  private readonly gestureGate: () => boolean;

  private readonly canvas: HTMLCanvasElement;
  private readonly bodyEl: HTMLElement;
  private readonly stubEl: HTMLDivElement;

  private open = false;
  private fellBack = false;
  private renderer: RendererLike | null = null;
  private camera: CameraLike | null = null;
  private built: MiniBuiltScene | null = null;
  private lastBuiltSig: string | null = null;
  /** Latest plan reference — signature computed LAZILY on debounce fire. */
  private latestPlan: FloorplanData | null = null;
  private debounceTimer: unknown = null;
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;

  /** Drag-look state (hand-rolled; pointer events on this canvas only). */
  private yawRad = 0;
  private pitchRad = (DEFAULT_PITCH_DEG * Math.PI) / 180;
  private dragging = false;
  private lastPX = 0;
  private lastPY = 0;

  public constructor(
    container: HTMLElement,
    deps: Mini3DDeps,
    opts: Partial<Mini3DTimers> & { gestureGate?: () => boolean } = {},
  ) {
    this.deps = deps;
    this.timers = {
      setTimeoutFn:
        opts.setTimeoutFn ??
        ((cb, ms) => window.setTimeout(cb, ms) as unknown),
      clearTimeoutFn:
        opts.clearTimeoutFn ??
        ((id) => window.clearTimeout(id as number)),
    };
    this.gestureGate = opts.gestureGate ?? (() => false);

    this.root = document.createElement("div");
    this.root.className = "mini3d-panel";
    this.root.dataset.testid = "mini3d-root";
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", "3D inset preview");
    this.root.hidden = true;

    const head = document.createElement("div");
    head.className = "mini3d-head";
    const title = document.createElement("span");
    title.className = "mini3d-title";
    title.textContent = "3D inset";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mini3d-close";
    closeBtn.textContent = "\u00D7";
    closeBtn.title = "Collapse the 3D inset (3)";
    closeBtn.setAttribute("aria-label", "Collapse the 3D inset");
    closeBtn.dataset.testid = "mini3d-close";
    closeBtn.addEventListener("click", () => this.setOpen(false));
    head.append(title, closeBtn);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "mini3d-body";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "mini3d-canvas";
    this.canvas.dataset.testid = "mini3d-canvas";
    this.canvas.setAttribute("aria-label", "3D floorplan preview");
    this.bodyEl.appendChild(this.canvas);

    this.stubEl = document.createElement("div");
    this.stubEl.className = "mini3d-fallback";
    this.stubEl.dataset.testid = "mini3d-fallback";
    const stubMsg = document.createElement("p");
    stubMsg.textContent = "3D preview unavailable.";
    const stubLink = document.createElement("a");
    stubLink.href = "/viewer";
    stubLink.textContent = "Open 3D view";
    stubLink.dataset.testid = "mini3d-fallback-link";
    this.stubEl.append(stubMsg, stubLink);
    this.stubEl.hidden = true;
    this.bodyEl.appendChild(this.stubEl);

    this.root.append(head, this.bodyEl);
    container.appendChild(this.root);
  }

  public isOpen(): boolean {
    return this.open;
  }

  /** True once the GL stack failed (null context / context lost). */
  public isFallback(): boolean {
    return this.fellBack;
  }

  /**
   * Store-notification hook. CHEAP on the hot path: records the plan
   * reference and (when open) arms the 150 ms debounce — the expensive
   * signature stringify happens only when the debounce fires, so
   * mid-gesture streaming notifications cost a timer re-arm.
   */
  public notifyPlanChanged(
    plan: FloorplanData,
    opts: { immediate?: boolean } = {},
  ): void {
    this.latestPlan = plan;
    if (!this.open) return;
    if (opts.immediate) {
      this.fireRebuild();
      return;
    }
    this.armDebounce();
  }

  /** Expand + boot the GL stack (or the fallback stub). */
  public setOpen(next: boolean): void {
    if (next === this.open) return;
    if (next) {
      this.open = true;
      this.root.hidden = false;
      this.boot();
    } else {
      this.teardown();
      this.open = false;
      this.root.hidden = true;
    }
  }

  /** Final teardown (editor unload). */
  public dispose(): void {
    this.setOpen(false);
    this.root.remove();
  }

  /* ------------------------------ internals ------------------------------- */

  private armDebounce(): void {
    if (this.debounceTimer !== null) {
      this.timers.clearTimeoutFn(this.debounceTimer);
    }
    this.debounceTimer = this.timers.setTimeoutFn(() => {
      this.debounceTimer = null;
      this.fireRebuild();
    }, MINI3D_DEBOUNCE_MS);
  }

  /**
   * Debounce fire: postpone while a draw gesture streams (never
   * recompile mid-draw — the settled state arrives moments later),
   * skip when the signature is unchanged, else rebuild. Failures keep
   * the last-good scene (same stance as the viewer).
   */
  private fireRebuild(): void {
    if (!this.open || this.fellBack) return;
    if (this.gestureGate()) {
      this.armDebounce();
      return;
    }
    const plan = this.latestPlan;
    if (plan === null) return;
    const sig = JSON.stringify(plan);
    if (sig === this.lastBuiltSig) return;
    const built = this.deps.buildScene(plan);
    if (built === null) return; // keep last good scene
    if (this.built !== null) this.deps.disposeBuilt(this.built);
    this.built = built;
    this.lastBuiltSig = sig;
    this.fitCamera(built.bounds);
    this.requestRender();
  }

  /** Create renderer + camera (or the fallback stub) on first open. */
  private boot(): void {
    if (this.fellBack) return; // stub already up; reopening stays stubbed
    if (this.renderer === null) {
      this.renderer = this.deps.makeRenderer(this.canvas);
    }
    if (this.renderer === null) {
      this.showFallback();
      return;
    }
    this.camera ??= this.deps.makeCamera();

    // Unrecovered context loss → stub (listener re-added per boot).
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);

    // Stub/DOM-shim environments may lack ResizeObserver — degrade to
    // a single initial sizing pass instead of crashing the editor.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(this.bodyEl);
    }
    this.bindDragLook();
    this.syncSize();
    // First paint: build NOW from the latest plan (no debounce lag).
    if (this.built === null) this.fireRebuild();
    else this.requestRender();
  }

  /** Drop the GL stack + listeners; plan + pose state survive. */
  private teardown(): void {
    if (this.debounceTimer !== null) {
      this.timers.clearTimeoutFn(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.dragging = false;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.built !== null) {
      this.deps.disposeBuilt(this.built);
      this.built = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
    this.camera = null;
  }

  private readonly onContextLost = (ev: Event): void => {
    ev.preventDefault();
    this.teardown();
    this.open = true; // stayed expanded — swap canvas for the stub
    this.showFallback();
  };

  private showFallback(): void {
    this.fellBack = true;
    this.canvas.hidden = true;
    this.stubEl.hidden = false;
  }

  /** Size renderer + camera aspect from the body box (CSS-driven). */
  private syncSize(): void {
    if (this.renderer === null || this.camera === null) return;
    const w = this.bodyEl.clientWidth || 1;
    const h = this.bodyEl.clientHeight || 1;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, MINI3D_MAX_DPR),
    );
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Place the perspective camera on the yaw/pitch sphere over bounds. */
  private fitCamera(bounds: MiniBuiltScene["bounds"]): void {
    if (this.camera === null) return;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const diag = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    const dist = Math.max(diag, 4) * 1.6;
    this.applyCameraPose(cx, cy, dist);
  }

  private applyCameraPose(cx: number, cy: number, dist: number): void {
    const cam = this.camera;
    if (cam === null) return;
    cam.position.set(
      cx + dist * Math.cos(this.pitchRad) * Math.cos(this.yawRad),
      cy + dist * Math.cos(this.pitchRad) * Math.sin(this.yawRad),
      dist * Math.sin(this.pitchRad),
    );
    cam.lookAt(cx, cy, 0);
    cam.updateProjectionMatrix();
  }

  /** Coalesce renders into a single rAF tick (paint-on-demand). */
  private requestRender(): void {
    if (this.renderer === null || this.built === null) return;
    if (this.rafId !== null) return;
    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      if (this.renderer !== null && this.built !== null) {
        this.renderer.render(this.built.scene, this.camera);
      }
    });
  }

  /* --------------------------- drag-look (hand-rolled) -------------------- */

  private bindDragLook(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (this.built === null) return;
    this.dragging = true;
    this.lastPX = ev.clientX;
    this.lastPY = ev.clientY;
    this.canvas.setPointerCapture?.(ev.pointerId);
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (!this.dragging || this.built === null) return;
    const dx = ev.clientX - this.lastPX;
    const dy = ev.clientY - this.lastPY;
    this.lastPX = ev.clientX;
    this.lastPY = ev.clientY;
    this.yawRad -= dx * LOOK_RAD_PER_PX;
    const nextPitch =
      (this.pitchRad * 180) / Math.PI + dy * (LOOK_RAD_PER_PX * 180) / Math.PI;
    this.pitchRad =
      (Math.min(MAX_PITCH_DEG, Math.max(MIN_PITCH_DEG, nextPitch)) *
        Math.PI) /
      180;
    this.fitCamera(this.built.bounds);
    this.requestRender();
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    this.dragging = false;
    this.canvas.releasePointerCapture?.(ev.pointerId);
  };
}

/* ------------------------- production deps loader -------------------------- */

/**
 * Load the REAL viewer modules lazily (first toggle). Static analysis:
 * this is the ONLY three.js touchpoint on the editor side, behind a
 * dynamic import — the editor chunk ships without it.
 */
export async function loadViewerDeps(): Promise<Mini3DDeps> {
  const [
    { PerspectiveCamera, WebGLRenderer },
    { parseValidatedPlan: pv, compilePlan: cp },
    { adaptScene, sceneHasNaN },
    { buildViewerScene, disposeObject },
  ] = await Promise.all([
    import("three"),
    import("../geom"),
    import("../viewer/adapter"),
    import("../viewer/sceneBuilder"),
  ]);

  // Silence lint on the re-aliased twins: geom's barrel is the SOLE
  // legal import surface (repo convention) but the names clash with the
  // static top-of-file schema-style imports used for type clarity.
  void pv;
  void cp;

  const roomsById = (plan: FloorplanData): Map<string, Room> =>
    new Map(flatRooms(plan).map((r) => [r.id, r]));

  return {
    makeRenderer: (canvas) => {
      try {
        return new WebGLRenderer({
          canvas,
          antialias: true,
          powerPreference: "high-performance",
        });
      } catch {
        return null;
      }
    },
    makeCamera: () =>
      new PerspectiveCamera(FOV_DEG, 1, 0.1, 400) as unknown as CameraLike,
    buildScene: (plan) => {
      try {
        // The editor store is v2-NATIVE (main.ts bridge note): unlike
        // the viewer's wire bridge, NO migrate-at-the-door is needed —
        // parseValidatedPlan sees current-shape data directly.
        const validated = parseValidatedPlan(plan);
        const compiled = compilePlan(validated);
        const adapted = adaptScene(
          compiled,
          roomsById(validated),
          flatOpenings(validated),
          validated.wallThickness,
          validated,
        );
        if (
          sceneHasNaN(adapted.buckets.map((b) => b.positions))
        ) {
          return null;
        }
        const built = buildViewerScene(adapted, "low", true);
        return {
          scene: built.scene,
          lightGroup: built.lightGroup,
          bounds: adapted.bounds,
        };
      } catch {
        return null; // keep last-good scene in the caller
      }
    },
    disposeBuilt: (built) => {
      disposeObject(built.lightGroup as never);
      disposeObject(built.scene as never);
    },
  };
}
