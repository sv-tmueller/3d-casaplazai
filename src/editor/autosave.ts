/**
 * Debounced autosave of FloorplanData to a pluggable Storage backend
 * (typically window.localStorage).
 *
 * Since pkg 7.2 (issue #75, ratified decision (a)) the SLOT carries
 * RAW v2 data — multi-floor plans must round-trip; the loader
 * migrates-at-the-door so legacy v1 payloads keep loading. The KEY
 * STRING is unchanged (renaming would orphan every existing save;
 * key ≠ contract). Callers hand in the payload directly; the manager
 * itself stays format-agnostic.
 */
import type { FloorplanData, FloorplanDataV1 } from '../shared/schema';

export const AUTOSAVE_KEY = 'casaplaza.autosave.v1';
export const DEBOUNCE_MS_DEFAULT = 800;

/** Serializable slot payload: current v2 data or the frozen v1 wire. */
export type StoredPlanPayload = FloorplanData | FloorplanDataV1;

export class AutosaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingPlan: StoredPlanPayload | null = null;

  constructor(
    private storage: Storage,
    private debounceMs: number = DEBOUNCE_MS_DEFAULT,
  ) {}

  scheduleSave(plan: StoredPlanPayload): void {
    this.pendingPlan = plan;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.persistPending();
    }, this.debounceMs);
  }

  /** Persist synchronously NOW (called on unload / visibilitychange). */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.persistPending();
  }

  /**
   * Persist synchronously NOW regardless of pending state (used by
   * programmatic plan swaps, e.g. window.__casaplaza.loadPlan).
   */
  persistSync(plan: StoredPlanPayload): void {
    this.storage.setItem(AUTOSAVE_KEY, JSON.stringify(plan, null, 2));
  }

  /** Drop the pending write without saving (e.g. plan invalidated). */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingPlan = null;
  }

  private persistPending(): void {
    if (this.pendingPlan === null) return;
    try {
      this.storage.setItem(AUTOSAVE_KEY, JSON.stringify(this.pendingPlan, null, 2));
    } finally {
      this.pendingPlan = null;
    }
  }

  /**
   * Return the stored plan if present AND the supplied predicate accepts
   * it; otherwise clear the slot and return null.
   */
  loadStoredPlan(isValid: (parsed: unknown) => boolean): StoredPlanPayload | null {
    const raw = this.storage.getItem(AUTOSAVE_KEY);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) return parsed as FloorplanData;
    } catch {
      /* fell through to discard */
    }
    this.storage.removeItem(AUTOSAVE_KEY);
    return null;
  }
}
