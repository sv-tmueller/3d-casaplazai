/**
 * Export dialog (issue #7): tiny anchored popover offering format
 * (PNG/JPEG) and scale (1×/2×/3×), then hands the chosen request to the
 * caller. No dependencies beyond the DOM.
 */

export interface ExportChoice {
  format: 'png' | 'jpeg';
  scale: 1 | 2 | 3;
}

const DLG_ID = 'export-dialog';

let openInstance: { root: HTMLDivElement; dismiss: () => void } | null = null;

export function isExportDialogOpen(): boolean {
  return openInstance !== null;
}

export function dismissExportDialog(): void {
  openInstance?.dismiss();
}

/**
 * Show the dialog anchored to `anchor`; resolves with the confirmed
 * choice, or null when dismissed (backdrop click / Cancel / Escape).
 */
export function openExportDialog(
  anchor: HTMLElement,
): Promise<ExportChoice | null> {
  if (openInstance) openInstance.dismiss();

  return new Promise((resolve) => {
    let settled = false;
    const settle = (choice: ExportChoice | null): void => {
      if (!settled) {
        settled = true;
        resolve(choice);
      }
    };

    const root = document.createElement('div');
    root.className = 'export-dialog-root';
    root.id = DLG_ID;
    root.setAttribute('data-testid', 'export-dialog');

    const panel = document.createElement('div');
    panel.className = 'export-dialog-panel';

    const title = document.createElement('h3');
    title.textContent = 'Export plan image';
    panel.appendChild(title);

    let fmt: ExportChoice['format'] = 'png';
    let scale: ExportChoice['scale'] = 2;

    const groupFmt = document.createElement('fieldset');
    groupFmt.className = 'export-fieldset';
    const legendFmt = document.createElement('legend');
    legendFmt.textContent = 'Format';
    groupFmt.appendChild(legendFmt);
    for (const [val, label] of [
      ['png', 'PNG'],
      ['jpeg', 'JPEG'],
    ] as const) {
      const lbl = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'export-format';
      radio.value = val;
      radio.checked = val === fmt;
      radio.addEventListener('change', () => {
        fmt = val;
      });
      lbl.append(radio, document.createTextNode(` ${label}`));
      groupFmt.appendChild(lbl);
    }

    const groupScale = document.createElement('fieldset');
    groupScale.className = 'export-fieldset';
    const legendScale = document.createElement('legend');
    legendScale.textContent = 'Scale';
    groupScale.appendChild(legendScale);
    for (const s of [1, 2, 3] as const) {
      const lbl = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'export-scale';
      radio.value = String(s);
      radio.checked = s === scale;
      radio.addEventListener('change', () => {
        scale = s;
      });
      lbl.append(radio, document.createTextNode(` ${s}\u00D7`));
      groupScale.appendChild(lbl);
    }

    const actions = document.createElement('div');
    actions.className = 'export-dialog-actions';
    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'editor-btn';
    btnCancel.textContent = 'Cancel';
    btnCancel.setAttribute('data-testid', 'export-cancel');
    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = 'editor-btn editor-export-confirm';
    btnOk.textContent = 'Download';
    btnOk.setAttribute('data-testid', 'export-confirm');
    actions.append(btnCancel, btnOk);

    panel.append(groupFmt, groupScale, actions);
    root.appendChild(panel);
    document.body.appendChild(root);

    const dismiss = (): void => {
      root.remove();
      document.removeEventListener('keydown', onKey, true);
      openInstance = null;
      settle(null);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        dismiss();
      }
    };

    root.addEventListener('mousedown', (ev) => {
      if (ev.target === root) dismiss();
    });
    btnCancel.addEventListener('click', dismiss);
    btnOk.addEventListener('click', () => {
      root.remove();
      document.removeEventListener('keydown', onKey, true);
      openInstance = null;
      settle({ format: fmt, scale });
    });

    // Anchor roughly beneath the toolbar button.
    const a = anchor.getBoundingClientRect();
    root.style.setProperty('--exp-anchor-x', `${a.right}px`);
    root.style.setProperty('--exp-anchor-y', `${a.bottom}px`);

    document.addEventListener('keydown', onKey, true);
    openInstance = { root, dismiss };
  });
}
