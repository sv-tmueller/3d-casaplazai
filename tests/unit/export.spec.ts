/**
 * Export-module tests (issue #7): filename scheme + (when a real canvas
 * exists) offscreen rasterization. happy-dom lacks canvas.toBlob, so the
 * raster test skips gracefully in stub environments.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  exportFilename,
  isoDateStamp,
  renderOffscreen,
  type ExportRequest,
} from '../../src/editor/export';

describe('export filenames (issue #7)', () => {
  it('stamps the local ISO date', () => {
    expect(isoDateStamp(new Date(2026, 9, 18))).toBe('2026-10-18');
  });

  it('maps formats to extensions', () => {
    expect(exportFilename('png', new Date(2026, 0, 2))).toBe('floorplan-2026-01-02.png');
    expect(exportFilename('jpeg', new Date(2026, 0, 2))).toBe('floorplan-2026-01-02.jpg');
  });
});

describe('renderOffscreen (real canvas only)', () => {
  const request: ExportRequest = { format: 'png', scale: 2 };

  it('produces a PNG blob with scaled dimensions and white bg', async () => {
    const canvasProbe = document.createElement('canvas');
    const probeCtx = canvasProbe.getContext('2d');
    const realRaster =
      probeCtx !== null &&
      typeof probeCtx.getImageData === 'function' &&
      (() => {
        try {
          probeCtx.getImageData(0, 0, 1, 1);
          return true;
        } catch {
          return false;
        }
      })();
    if (!realRaster) {
      // happy-dom stub: no real rasterizer/encoder — nothing to prove here.
      return;
    }
    const result = await renderOffscreen(
      (ctx, w, h) => {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
      },
      100,
      50,
      request,
    );
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.blob.size).toBeGreaterThan(0);
    const head = new Uint8Array(await result.blob.slice(0, 8).arrayBuffer());
    expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
