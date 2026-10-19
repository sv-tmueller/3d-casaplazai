/**
 * Shared e2e luminance probe (issue #121): moved out of
 * e2e/viewer.spec.ts UNCHANGED so the sun spec and the issue-#86
 * lighting spec decode canvas PNGs with the same code.
 */

import type { Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';

/**
 * Mean perceptual luminance (0..255) over a fractional rect of the GL
 * canvas. Captures via Playwright's COMPOSITOR screenshot — in-page
 * readbacks (getImageData/readPixels) return black for ANGLE/Metal
 * IOSurface canvases on several stacks, so the pixels must come from
 * the outside. The PNG is decoded with node:zlib (stdlib only).
 */
export async function regionLuminance(
  page: Page,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
): Promise<number> {
  const shot = await page
    .locator('.viewer-gl-canvas')
    .screenshot({ type: 'png' });
  const buf = shot.subarray(0, shot.length);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const colorType = buf[25];
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bpp === 0) throw new Error(`unexpected PNG color type ${colorType}`);

  // Concatenate IDAT chunks and inflate.
  const chunks: Buffer[] = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') chunks.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));

  // Un-filter scanlines (filters 0-4) into an RGB byte raster.
  const stride = w * bpp + 1;
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raster = Buffer.allocUnsafe(w * h * 3);
  let prev = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++) {
    const line = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride));
    const filter = raw[y * stride];
    if (filter === 1) {
      for (let i = bpp; i < line.length; i++) line[i] = (line[i] + line[i - bpp]) & 255;
    } else if (filter === 2) {
      for (let i = 0; i < line.length; i++) line[i] = (line[i] + prev[i]) & 255;
    } else if (filter === 3) {
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255;
      }
    } else if (filter === 4) {
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const c = i >= bpp ? prev[i - bpp] : 0;
        line[i] = (line[i] + paeth(a, prev[i], c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      raster[(y * w + x) * 3] = line[x * bpp];
      raster[(y * w + x) * 3 + 1] = line[x * bpp + 1];
      raster[(y * w + x) * 3 + 2] = line[x * bpp + 2];
    }
    prev = line;
  }

  // Average Rec.601 luma over the requested fractional rect.
  const sx = Math.floor(w * fx);
  const sy = Math.floor(h * fy);
  const rw = Math.max(1, Math.floor(w * fw));
  const rh = Math.max(1, Math.floor(h * fh));
  let sum = 0;
  let px = 0;
  for (let y = sy; y < Math.min(sy + rh, h); y++) {
    for (let x = sx; x < Math.min(sx + rw, w); x++) {
      const i = (y * w + x) * 3;
      sum += 0.299 * raster[i] + 0.587 * raster[i + 1] + 0.114 * raster[i + 2];
      px++;
    }
  }
  return px > 0 ? sum / px : -1;
}
