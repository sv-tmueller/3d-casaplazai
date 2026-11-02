/**
 * Plan operations (issue #178): Import / Save JSON, New plan, Load demo
 * and Share — moved out of the canvas engine (formerly glue.ts, #91 /
 * #144). Every wholesale swap follows the loadPlan sequence (replaceAll
 * → autosave.stop → persistSync), clears the walk pose (gap G4) and fits
 * the new plan (gap G14). Destructive swaps over a non-empty plan ask
 * first through the kit confirm dialog (Save JSON lifeline copy).
 */
import { migrate, validateFloorplan, type FloorplanData } from '../shared/schema';
import { encodeShare } from '../shared/shareLink';
import { shareUrl } from '../shared/viewerRoute';
import type { AutosaveManager } from '../editor/autosave';
import { demoById, loadDemoPlan, type DemoId } from '../editor/demos';
import type { EditorEngine } from '../editor/engine';
import { emptyPlan, type EditorStore } from '../editor/store';
import { CONFIRM_MSG, confirmDialog, type ConfirmOptions } from './dialogs/confirm';
import { planIsEmpty } from './panels/emptyState';
import type { PlanOps } from './shell';

export interface PlanOpsDeps {
  store: EditorStore;
  autosave: AutosaveManager;
  /** Late-bound: the shell creates the engine after the ops exist. */
  engine: () => EditorEngine;
  notify(text: string, variant?: 'info' | 'error'): void;
  /** A wholesale swap happened (the walk pose no longer applies). */
  onPlanReplaced(): void;
  confirm?: (opts: ConfirmOptions) => Promise<boolean>;
}

export interface PlanOpsImpl extends PlanOps {
  importFile(file: File): Promise<void>;
  swapPlan(plan: FloorplanData, opts?: { clearUnderlays?: boolean; clearMeasurements?: boolean; fit?: boolean }): void;
}

/**
 * Copy text with a graceful degradation ladder: async Clipboard API,
 * then the legacy textarea/execCommand path (#91). False when both fail.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy rung */
    }
  }
  const ta = document.createElement('textarea');
  try {
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

export function createPlanOps(deps: PlanOpsDeps): PlanOpsImpl {
  const { store, autosave, notify } = deps;
  const confirm = deps.confirm ?? confirmDialog;

  const swapPlan: PlanOpsImpl['swapPlan'] = (plan, opts = {}) => {
    store.replaceAll(plan);
    autosave.stop();
    autosave.persistSync(plan);
    deps.engine().resetEditorState({ underlays: opts.clearUnderlays, measurements: opts.clearMeasurements });
    deps.onPlanReplaced();
    if (opts.fit !== false) deps.engine().fitPlan();
  };

  const confirmDiscardIfNeeded = async (): Promise<boolean> => {
    if (planIsEmpty(store.getState().data)) return true;
    return confirm({ title: 'Replace the current plan?', message: CONFIRM_MSG, confirmLabel: 'Replace plan' });
  };

  const importFile = async (file: File): Promise<void> => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      notify('Could not read the selected file.', 'error');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      notify('Not a valid JSON file.', 'error');
      return;
    }
    // migrate + validate DIRECTLY (not normalizeIncoming — it silently
    // falls back to an empty plan, which would wipe the user's work).
    const migrated = migrate(parsed);
    if (!migrated.ok || !migrated.data) {
      notify('Import failed: unsupported schema version.', 'error');
      return;
    }
    const validated = validateFloorplan(migrated.data);
    if (!validated.ok) {
      notify(`Import failed: ${validated.errors[0].message}`, 'error');
      return;
    }
    swapPlan(validated.value);
    notify(`Imported “${file.name}”.`);
  };

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.className = 'ui-sr-only';
  fileInput.tabIndex = -1;
  fileInput.setAttribute('aria-hidden', 'true');
  fileInput.dataset.testid = 'ws-import-file';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void importFile(file);
  });

  return {
    swapPlan,
    importFile,
    importJson(): void {
      if (!fileInput.isConnected) document.body.appendChild(fileInput);
      fileInput.value = ''; // re-picking the same file must re-fire change
      fileInput.click();
    },
    saveJson(): void {
      const blob = new Blob([JSON.stringify(store.getState().data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floorplan-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
      notify('Plan exported as JSON.');
    },
    async newPlan(): Promise<void> {
      if (!(await confirmDiscardIfNeeded())) return;
      swapPlan(emptyPlan(), { clearUnderlays: true, clearMeasurements: true });
      notify('Started a new plan.');
    },
    async loadDemo(id: DemoId): Promise<void> {
      if (!(await confirmDiscardIfNeeded())) return;
      swapPlan(loadDemoPlan(id));
      notify(`Loaded the ${demoById(id).label} demo.`);
    },
    async share(): Promise<void> {
      // Feature-detect at the action: browsers lacking CompressionStream
      // get a clear message instead of a half-encoded link (#91).
      if (typeof CompressionStream === 'undefined') {
        notify('Sharing is unavailable in this browser.');
        return;
      }
      let out: Awaited<ReturnType<typeof encodeShare>>;
      try {
        out = await encodeShare(store.getState().data);
      } catch (err) {
        notify((err as Error).message, 'error');
        return;
      }
      const copied = await copyToClipboard(shareUrl(location.origin, out.fragment));
      if (!copied) {
        notify('Could not copy — clipboard unavailable.', 'error');
        return;
      }
      if (out.warning) {
        notify(`Link copied (${out.warning.length.toLocaleString()} chars — some chats may truncate it).`);
      } else {
        notify('Share link copied to clipboard.');
      }
    },
  };
}
