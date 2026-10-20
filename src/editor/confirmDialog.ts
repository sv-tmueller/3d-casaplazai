/**
 * Issue #144 (Pkg 15.1) — promise-based in-app confirm.
 *
 * Replaces `window.confirm` for the two destructive plan swaps (load a
 * demo / New plan). Precedent: helpModal.ts — singleton, role="dialog",
 * aria-modal="true", Escape ⇒ cancel. Two deliberate differences:
 *
 *  1. Key handling registers on WINDOW in the CAPTURE phase, so the
 *     dialog pre-empts the editor's document-capture Escape handlers
 *     (snap/lean popovers, glue.ts): an Escape aimed at the dialog must
 *     not also close a popover behind it.
 *  2. Tab is confined to the two buttons (Cancel ⇄ Confirm) — the
 *     dialog is modal, so focus must not escape into the toolbar.
 *
 * One-way-ness: callers pass CONFIRM_MSG, whose Save JSON lifeline is
 * the only warning the user gets — a plan swap is NOT undoable
 * (replaceAll clears the history stacks by design).
 */

/** The ratified discard copy (issue #144 AC: must mention Save JSON). */
export const CONFIRM_MSG =
  'Replace the current plan? Save JSON first — this cannot be undone.';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ActiveDialog {
  close(result: boolean): void;
}

let active: ActiveDialog | null = null;

export function isConfirmDialogOpen(): boolean {
  return active !== null;
}

/**
 * Show the modal and resolve with the user's choice.
 *
 * A second call while one is open CANCELS the first (resolves false)
 * before opening the fresh dialog: two stacked dialogs would let the
 * outer promise leak forever (nothing left to click).
 */
export function confirmDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'Replace plan',
    cancelLabel = 'Cancel',
  } = opts;

  active?.close(false);

  return new Promise<boolean>((resolve) => {
    const root = document.createElement('div');
    root.className = 'confirm-backdrop';
    root.setAttribute('data-testid', 'confirm-backdrop');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', title);

    const panel = document.createElement('div');
    panel.className = 'confirm-panel';

    const heading = document.createElement('h2');
    heading.className = 'confirm-title';
    heading.textContent = title;

    const body = document.createElement('p');
    body.className = 'confirm-message';
    body.setAttribute('data-testid', 'confirm-message');
    body.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'editor-btn confirm-cancel';
    cancelBtn.setAttribute('data-testid', 'confirm-cancel');
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'editor-btn confirm-confirm';
    confirmBtn.setAttribute('data-testid', 'confirm-confirm');
    confirmBtn.textContent = confirmLabel;

    actions.append(cancelBtn, confirmBtn);
    panel.append(heading, body, actions);
    root.appendChild(panel);
    document.body.appendChild(root);

    const close = (result: boolean): void => {
      // Superseded dialogs were already torn down by their successor's
      // close(false); their late events must be no-ops.
      if (active !== entry) return;
      active = null;
      window.removeEventListener('keydown', onKeyDown, true);
      root.remove();
      resolve(result);
    };

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        close(false);
        return;
      }
      if (ev.key === 'Tab') {
        ev.preventDefault();
        ev.stopPropagation();
        // Two-button focus loop — document.activeElement drives the
        // direction, so Shift+Tab works too (Cancel ⇄ Confirm).
        const next = document.activeElement === cancelBtn ? confirmBtn : cancelBtn;
        next.focus();
      }
    };

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    root.addEventListener('mousedown', (ev) => {
      if (ev.target === root) close(false);
    });
    window.addEventListener('keydown', onKeyDown, true);

    // Initial focus on the SAFE choice (Cancel), matching the modal
    // convention: Enter alone must never destroy the user's plan.
    cancelBtn.focus();

    const entry: ActiveDialog = { close };
    active = entry;
  });
}
