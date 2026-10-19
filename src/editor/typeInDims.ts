/**
 * Issue #100 (Pkg 12.2): TYPE-IN DIMENSIONS — the shared length/angle
 * field pair powering BOTH surfaces (mid-draw floating widget and the
 * inspector's wall case).
 *
 * SINGLE SOURCE discipline: parsing/clamping/rejection live HERE, the
 * two surfaces only decide WHERE the committed pair goes (mid-draw:
 * move the pending cursor; inspector: resizeRoom). Both surfaces seed
 * the pair through the same compass helpers (model/angles.ts), so the
 * field values and the canvas pills can never diverge.
 */

/** Parse result: `null` when the raw text is unusable. */
export interface ParsedDims {
  lengthM: number;
  angleDeg: number;
}

/**
 * Parse + validate a raw (length, angle) pair.
 * Rules (SUB_PLAN checkpoint 2):
 * - both must be finite numbers;
 * - length must be STRICTLY > 0 (a zero-length wall is degenerate);
 * - angle accepts ANY finite value and is normalized to [0, 360).
 * Returns null when either rule fails — callers flash and leave all
 * state untouched.
 */
export function parseDims(
  lengthRaw: string,
  angleRaw: string,
): ParsedDims | null {
  // Trimmed NON-EMPTY text required: Number('') coerces to 0, which
  // would sneak past the finiteness check (an empty angle field is a
  // draft, not a 0° bearing).
  if (lengthRaw.trim() === '' || angleRaw.trim() === '') return null;
  const len = Number(lengthRaw);
  const ang = Number(angleRaw);
  if (!Number.isFinite(len) || !Number.isFinite(ang)) return null;
  if (!(len > 0)) return null;
  const angleDeg = ((ang % 360) + 360) % 360;
  return { lengthM: len, angleDeg };
}

/** Options bag for {@link mountDimFields}. */
export interface DimFieldOptions {
  /** Initial values (already derived via the shared helpers). */
  lengthM: number;
  angleDeg: number;
  /**
   * LIVE per-keystroke preview: called with the parsed pair whenever
   * BOTH fields hold usable values (invalid drafts simply don't
   * preview — the ghost keeps the last good cursor).
   */
  onLive?: (dims: ParsedDims) => void;
  /** Commit (Enter in EITHER field): parsed pair in. */
  onCommit: (dims: ParsedDims) => void;
  /** Reject-with-flash for unusable input (state stays untouched). */
  onInvalid: () => void;
  /** Drop/reset (Esc): clear the pending value, keep context alive. */
  onCancel?: () => void;
  /** Refocus the LENGTH field after a commit (chain-alive UX). */
  refocusOnCommit?: boolean;
  /** testid prefix; fields get `<prefix>-length` / `<prefix>-angle`. */
  testidPrefix: string;
  /** Accessible labels (kept textual for getByRole stability). */
  lengthLabel: string;
  angleLabel: string;
}

export interface DimFields {
  root: HTMLElement;
  lengthInput: HTMLInputElement;
  angleInput: HTMLInputElement;
  /** Programmatic re-seed (surface state changed underneath). */
  setValues(lengthM: number, angleDeg: number): void;
  /** Focus the length field (activation autofocus). */
  focus(): void;
}

/**
 * Mount the length(m)/angle(°) input pair. Enter commits from either
 * field; Tab hops length↔angle (native order + an angle-field Enter
 * passthrough keeps the flow one-handed); Esc cancels. Keydown events
 * are stopped AT the field (stopPropagation) so canvas/document
 * handlers (poly-close Enter, Esc cascades, Delete-selection) never
 * double-fire while typing.
 */
export function mountDimFields(opts: DimFieldOptions): DimFields {
  const root = document.createElement('div');
  root.className = 'dim-fields';

  const mk = (
    label: string,
    testid: string,
    initial: number,
  ): HTMLInputElement => {
    const wrap = document.createElement('label');
    wrap.className = 'dim-field';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.lang = 'en';
    input.value = String(initial);
    input.dataset.testid = testid;
    input.setAttribute('aria-label', label);
    input.title = label;
    wrap.append(document.createTextNode(label), input);
    root.appendChild(wrap);
    return input;
  };

  const lengthInput = mk(
    opts.lengthLabel,
    `${opts.testidPrefix}-length`,
    opts.lengthM,
  );
  const angleInput = mk(
    opts.angleLabel,
    `${opts.testidPrefix}-angle`,
    opts.angleDeg,
  );

  const current = (): ParsedDims | null =>
    parseDims(lengthInput.value, angleInput.value);

  // Enter-commit + the browser's blur/change would DOUBLE-commit (two
  // pushed points for one keystroke). An Enter marks a short
  // suppression window; the trailing change event dies in it.
  let suppressChangeUntil = 0;

  const run = (viaKey: boolean): void => {
    const dims = current();
    if (dims === null) {
      opts.onInvalid();
      return;
    }
    opts.onCommit(dims);
    if (opts.refocusOnCommit) lengthInput.focus();
    else if (viaKey) lengthInput.focus();
  };

  for (const input of [lengthInput, angleInput]) {
    input.addEventListener('input', () => {
      const dims = current();
      if (dims !== null) opts.onLive?.(dims);
    });
    input.addEventListener('keydown', (ev) => {
      // Swallow at the field: the canvas Enter (closePolygon) and the
      // Esc cascade must not double-fire while typing (pitfall noted
      // in the SUB_PLAN, glue.ts ~2285/~2295).
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        suppressChangeUntil = Date.now() + 150;
        run(true);
        return;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        opts.onCancel?.();
        return;
      }
      if (ev.key === 'Tab') {
        // Contained hop length↔angle: stop the event AFTER the native
        // default runs (preventDefault would trap focus). We rely on
        // DOM order (length then angle); stopPropagation keeps the
        // browser's own Tab handling intact for the two fields.
        ev.stopPropagation();
      }
    });
    // Blur-committed steppers behave like Enter (no refocus loop).
    input.addEventListener('change', () => {
      if (Date.now() < suppressChangeUntil) return;
      const dims = current();
      if (dims === null) {
        opts.onInvalid();
        return;
      }
      opts.onCommit(dims);
    });
  }

  return {
    root,
    lengthInput,
    angleInput,
    setValues(lengthM: number, angleDeg: number): void {
      lengthInput.value = String(Number(lengthM.toFixed(3)));
      angleInput.value = String(Number(angleDeg.toFixed(1)));
    },
    focus(): void {
      lengthInput.focus();
    },
  };
}
