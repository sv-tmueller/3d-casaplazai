/**
 * Export dialog (issue #178; replaces editor/exportDialog, #7). Format
 * (PNG / JPEG) and supersample scale (1× / 2× / 3×) for the active
 * floor's image export. All-floors export is #159 (lead ruling C2).
 */
import { el } from '../../ui/el';
import { openDialog } from '../../ui/dialog';
import { Segment } from '../../ui/segment';
import type { ExportChoice } from '../../editor/engine';
import type { ExportFormat, ExportScale } from '../../editor/export';

export function openExportDialog(): Promise<ExportChoice | null> {
  let format: ExportFormat = 'png';
  let scale: ExportScale = 2;
  const formatSeg = Segment<ExportFormat>({
    label: 'Format',
    value: format,
    testid: 'ws-export-format',
    options: [
      { value: 'png', label: 'PNG', testid: 'ws-export-format-png' },
      { value: 'jpeg', label: 'JPEG', testid: 'ws-export-format-jpeg' },
    ],
    onChange: (v) => {
      format = v;
      formatSeg.setValue(v);
    },
  });
  const scaleSeg = Segment<'1' | '2' | '3'>({
    label: 'Scale',
    value: '2',
    testid: 'ws-export-scale',
    options: [
      { value: '1', label: '1×', testid: 'ws-export-scale-1' },
      { value: '2', label: '2×', testid: 'ws-export-scale-2' },
      { value: '3', label: '3×', testid: 'ws-export-scale-3' },
    ],
    onChange: (v) => {
      scale = Number(v) as ExportScale;
      scaleSeg.setValue(v);
    },
  });
  const handle = openDialog<'go'>({
    title: 'Export image',
    testid: 'ws-export-dialog',
    size: 'sm',
    body: [
      el('p', { class: 'ws-dialog-text', text: 'Exports the active floor as an image with a white background and the measurements baked in.' }),
      el('div', { class: 'ws-field-row' }, el('span', { class: 'ws-field-label', text: 'Format' }), formatSeg.root),
      el('div', { class: 'ws-field-row' }, el('span', { class: 'ws-field-label', text: 'Scale' }), scaleSeg.root),
    ],
    actions: [
      { label: 'Cancel', value: null, testid: 'ws-export-cancel' },
      { label: 'Export', value: 'go', variant: 'primary', testid: 'ws-export-confirm' },
    ],
  });
  return handle.result.then((v) => (v === 'go' ? { format, scale } : null));
}
