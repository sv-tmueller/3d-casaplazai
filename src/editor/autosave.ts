/**
 * Debounced autosave of FloorplanData to a pluggable Storage backend
 * (typically window.localStorage).
 */
import type { FloorplanData } from '../shared/schema';

export const AUTOSAVE_KEY = 'casaplaza.autosave.v1';
export const DEBOUNCE_MS_DEFAULT = 800;

export class AutosaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingPlan: FloorplanData | null = null;

  constructor(
    private storage: Storage,
    private debounceMs: number = DEBOUNCE_MS_DEFAULT,
  ) {}

  scheduleSave(plan: FloorplanData): void {
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
  loadStoredPlan(isValid: (parsed: unknown) => boolean): FloorplanData | null {
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
