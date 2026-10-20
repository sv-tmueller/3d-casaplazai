/**
 * Shared e2e luminance probe (issue #121): moved out of
 * e2e/viewer.spec.ts UNCHANGED so the sun spec and the issue-#86
 * lighting spec decode canvas PNGs with the same code. The decode is
 * split out (captureRegion) so the #152 ceilings spec can read the mean
 * RGB too — hue, not just brightness, separates a lit ceiling from sky.
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
/** Canvas RGB raster plus the clamped fractional probe rect. */
interface CanvasRegion {
  raster: Buffer;
  width: number;
  height: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Screenshot + zlib-decode the GL canvas, then clamp the probe rect. */
async function captureRegion(
  page: Page,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
): Promise<CanvasRegion> {
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

  // Clamp the requested fractional rect to the decoded raster.
  const sx = Math.floor(w * fx);
  const sy = Math.floor(h * fy);
  const rw = Math.max(1, Math.floor(w * fw));
  const rh = Math.max(1, Math.floor(h * fh));
  return { raster, width: w, height: h, x: sx, y: sy, w: rw, h: rh };
}

/**
 * Mean perceptual luminance (0..255) over a fractional rect of the GL
 * canvas (see the fixture header: the pixels come from outside the page).
 */
export async function regionLuminance(
  page: Page,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
): Promise<number> {
  const region = await captureRegion(page, fx, fy, fw, fh);
  let sum = 0;
  let px = 0;
  for (let y = region.y; y < Math.min(region.y + region.h, region.height); y++) {
    for (let x = region.x; x < Math.min(region.x + region.w, region.width); x++) {
      const i = (y * region.width + x) * 3;
      sum +=
        0.299 * region.raster[i] +
        0.587 * region.raster[i + 1] +
        0.114 * region.raster[i + 2];
      px += 1;
    }
  }
  return px > 0 ? sum / px : -1;
}

/**
 * True when the composited canvas carries its OWN pixels over the given
 * FRACTIONAL rect of the canvas (fx/fy/fw/fh, e.g. the luminance probe's
 * interior rect). Proved by contribution: hiding the canvas must change
 * the composited pixels inside that rect. Where the GL pipeline is idle
 * (observed on headless macOS/ANGLE: no clear, no draws, a transparent
 * surface) the canvas contributes nothing and the pane's CSS backdrop
 * shows through — this is how the luminance probe detects that its
 * sample rects would measure the backdrop, not the render.
 *
 * #146 fix round: this replaces a capture-pair diff clipped to the
 * canvas's bottom-left corner. That corner is a TRANSPARENT MARGIN on
 * this stack (the plan does not reach it), so the pair stayed
 * byte-identical even with a seated rig painting and the guard skipped
 * the (b) assertion vacuously. Contribution is measured where the probe
 * actually samples, and it is deterministic — no dependence on turntable
 * motion or capture timing.
 */
export async function regionCarriesCanvasPixels(
  page: Page,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
): Promise<boolean> {
  const box = await page.locator('.viewer-gl-canvas').boundingBox();
  if (!box) throw new Error('viewer-gl-canvas has no box — the viewer did not mount');
  const clip = {
    x: Math.round(box.x + box.width * fx),
    y: Math.round(box.y + box.height * fy),
    width: Math.max(1, Math.round(box.width * fw)),
    height: Math.max(1, Math.round(box.height * fh)),
  };
  const withCanvas = await page.screenshot({ clip });
  await hideCanvas(page, true);
  const withoutCanvas = await page.screenshot({ clip });
  await hideCanvas(page, false);
  return !withCanvas.equals(withoutCanvas);
}

/** Toggle `visibility: hidden` on the GL canvas (contribution probe only). */
async function hideCanvas(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((hide) => {
    const canvas = document.querySelector('.viewer-gl-canvas');
    if (canvas instanceof HTMLElement) {
      canvas.style.visibility = hide ? 'hidden' : '';
    }
  }, hidden);
  await page.waitForTimeout(150);
}

/**
 * Mean RGB channels (0..255) over the same rect (issue #152). The ceiling
 * probe needs the hue, not just the brightness: sky reads b ≫ r through a
 * hole in the roof, a lit ceiling reads neutral-to-warm.
 */
export async function regionMeanRgb(
  page: Page,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
): Promise<{ r: number; g: number; b: number }> {
  const region = await captureRegion(page, fx, fy, fw, fh);
  let r = 0;
  let g = 0;
  let b = 0;
  let px = 0;
  for (let y = region.y; y < Math.min(region.y + region.h, region.height); y++) {
    for (let x = region.x; x < Math.min(region.x + region.w, region.width); x++) {
      const i = (y * region.width + x) * 3;
      r += region.raster[i];
      g += region.raster[i + 1];
      b += region.raster[i + 2];
      px += 1;
    }
  }
  return px > 0
    ? { r: r / px, g: g / px, b: b / px }
    : { r: -1, g: -1, b: -1 };
}
