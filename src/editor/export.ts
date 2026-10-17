/**
 * Export plumbing (issue #7): re-render the CURRENT plan offscreen at a
 * selectable scale, composite onto white, and hand back a PNG/JPEG
 * Blob via canvas.toBlob. Filename scheme: floorplan-YYYY-MM-DD.ext.
 */

export type ExportFormat = 'png' | 'jpeg';
export type ExportScale = 1 | 2 | 3;

export interface ExportRequest {
  format: ExportFormat;
  scale: ExportScale;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
}

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

const EXTENSION_BY_FORMAT: Record<ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
};

/** Local ISO date (UTC-free) for the filename stamp. */
export function isoDateStamp(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  );
}

/** floorplan-2026-10-18.png style slug. */
export function exportFilename(format: ExportFormat, now: Date = new Date()): string {
  return `floorplan-${isoDateStamp(now)}.${EXTENSION_BY_FORMAT[format]}`;
}

/**
 * Render `painter` into an offscreen canvas sized baseSize*scale, filled
 * WHITE underneath (JPEG has no alpha; PNG wants a guaranteed light bg),
 * then encode via toBlob. Throws on encoder rejection.
 */
export function renderOffscreen(
  painter: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  baseWidth: number,
  baseHeight: number,
  request: ExportRequest,
): Promise<ExportResult> {
  const width = Math.max(1, Math.round(baseWidth * request.scale));
  const height = Math.max(1, Math.round(baseHeight * request.scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Cannot acquire 2D context'));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  painter(ctx, width, height);

  const mimeType = MIME_BY_FORMAT[request.format];
  return new Promise<ExportResult>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas encoding failed'));
        return;
      }
      resolve({
        blob,
        filename: exportFilename(request.format),
        mimeType,
        width,
        height,
      });
    }, mimeType);
  });
}

/** Trigger a browser download for an export result. */
export function downloadExport(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
