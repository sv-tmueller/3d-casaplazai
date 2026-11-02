#!/usr/bin/env node
/* global console, fetch, URL */
/**
 * Normalise the furniture models (issue #180).
 *
 * Reproduces public/assets/models/<type>.glb from the raw CC0 download:
 *   1. fetch the source archive (sha256-pinned) into the raw cache,
 *   2. extract each model's OBJ + MTL,
 *   3. bake one transform into the vertices: yaw so the front faces glTF
 *      +Z, uniform scale to real-world metres, origin at the floor centre
 *      (x/z centred, lowest point at y=0),
 *   4. write a plain glTF-Transform document, then
 *   5. meshopt-compress it with the glTF-Transform CLI.
 *
 * Output orientation (the runtime in src/viewer/furniture/ relies on it):
 * Y up, front faces +Z, metres, base at y=0, centred on x and z.
 *
 * Usage:
 *   node scripts/normalize-models.mjs            # write public/assets/models
 *   node scripts/normalize-models.mjs --check    # rebuild to a temp dir and
 *                                                # compare sha256 to committed
 *   --raw <dir>   raw download cache (default: <tmpdir>/casaplazai-model-sources)
 *   --out <dir>   output folder (default: public/assets/models)
 */
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { argv, exit, execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI_BIN = join(ROOT, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');

/** Per-file budget, bytes (issue #180: each model under 500 KB). */
const MAX_BYTES = 500_000;

const ARCHIVE = {
  file: 'kenney_furniturePack.zip',
  // Kenney's own upload on OpenGameArt (kenney.nl blocks scripted downloads).
  url: 'https://opengameart.org/sites/default/files/kenney_furniturePack.zip',
  page: 'https://opengameart.org/content/furniture-kit',
  sha256: '68afa4e6dc8a53942379fb47f1e84ec735d46b77bb1c1ceb968e245693dde067',
};

/**
 * Source table, one row per furniture type.
 * - src:     model name inside the archive's Models/ folder (OBJ + MTL)
 * - yawDeg:  turn about +Y that brings the model's front to +Z
 *            (Kenney's front faces -Z: backrest, headboard, tank at +Z)
 * - ref:     one reference dimension fixing the uniform scale to metres:
 *            axis 'x' (width), 'y' (height) or 'z' (depth), and its length
 * The schema has no per-type footprint, so the exact width and depth are
 * fitted per piece at runtime; this scale only sets plausible proportions.
 */
const SOURCES = {
  bed: { src: 'bedDouble', yawDeg: 180, ref: { axis: 'x', metres: 1.6 } },
  sofa: { src: 'loungeSofa', yawDeg: 180, ref: { axis: 'x', metres: 2.0 } },
  table: { src: 'table', yawDeg: 180, ref: { axis: 'y', metres: 0.75 } },
  chair: { src: 'chair', yawDeg: 180, ref: { axis: 'x', metres: 0.45 } },
  counter: { src: 'kitchenCabinet', yawDeg: 180, ref: { axis: 'y', metres: 0.9 } },
  bathtub: { src: 'bathtub', yawDeg: 180, ref: { axis: 'x', metres: 1.7 } },
  toilet: { src: 'toilet', yawDeg: 180, ref: { axis: 'y', metres: 0.75 } },
};

// ---------------------------------------------------------------- helpers

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function parseArgs(args) {
  const opts = {
    check: false,
    raw: join(tmpdir(), 'casaplazai-model-sources'),
    out: join(ROOT, 'public', 'assets', 'models'),
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--check') opts.check = true;
    else if (a === '--raw') opts.raw = resolve(args[++i]);
    else if (a === '--out') opts.out = resolve(args[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

async function ensureArchive(rawDir) {
  mkdirSync(rawDir, { recursive: true });
  const zip = join(rawDir, ARCHIVE.file);
  if (existsSync(zip) && sha256(readFileSync(zip)) === ARCHIVE.sha256) return zip;
  console.log(`downloading ${ARCHIVE.url}`);
  const res = await fetch(ARCHIVE.url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${ARCHIVE.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== ARCHIVE.sha256) {
    throw new Error(`sha256 mismatch for ${ARCHIVE.file}: expected ${ARCHIVE.sha256}, got ${got}`);
  }
  writeFileSync(zip, buf);
  return zip;
}

function extract(zip, rawDir, names) {
  const dest = join(rawDir, 'kenney-furniture');
  const entries = names.flatMap((n) => [`Models/${n}.obj`, `Models/${n}.mtl`]);
  execFileSync('unzip', ['-o', '-q', zip, ...entries, '-d', dest]);
  return join(dest, 'Models');
}

// ------------------------------------------------------------- OBJ / MTL

function parseMtl(text) {
  const mats = new Map();
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'newmtl') {
      cur = { kd: [0.8, 0.8, 0.8] };
      mats.set(t[1], cur);
    } else if (t[0] === 'Kd' && cur) {
      cur.kd = [Number(t[1]), Number(t[2]), Number(t[3])];
    }
  }
  return mats;
}

/** Triangulated faces grouped by material; indices are 0-based. */
function parseObj(text) {
  const pos = [];
  const nrm = [];
  const groups = new Map();
  let mat = 'default';
  const idx = (s, len) => {
    const i = Number(s);
    return i < 0 ? len + i : i - 1;
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') pos.push([Number(t[1]), Number(t[2]), Number(t[3])]);
    else if (t[0] === 'vn') nrm.push([Number(t[1]), Number(t[2]), Number(t[3])]);
    else if (t[0] === 'usemtl') mat = t[1];
    else if (t[0] === 'f') {
      const corners = t.slice(1).map((c) => {
        const [v, , n] = c.split('/');
        return { v: idx(v, pos.length), n: n ? idx(n, nrm.length) : -1 };
      });
      const list = groups.get(mat) ?? [];
      for (let i = 1; i + 1 < corners.length; i++) {
        list.push(corners[0], corners[i], corners[i + 1]);
      }
      groups.set(mat, list);
    }
  }
  return { pos, nrm, groups };
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * Build the normalised, uncompressed glTF-Transform document for one
 * type. Returns the document and the resulting size in metres.
 */
function buildDocument(type, spec, modelsDir) {
  const obj = parseObj(readFileSync(join(modelsDir, `${spec.src}.obj`), 'utf8'));
  const mtl = parseMtl(readFileSync(join(modelsDir, `${spec.src}.mtl`), 'utf8'));

  // Yaw about +Y (CCW seen from above): x' = x cos + z sin, z' = -x sin + z cos.
  const yaw = (spec.yawDeg * Math.PI) / 180;
  const c = Math.round(Math.cos(yaw) * 1e12) / 1e12;
  const s = Math.round(Math.sin(yaw) * 1e12) / 1e12;
  const rotate = ([x, y, z]) => [x * c + z * s, y, -x * s + z * c];

  const used = new Set();
  for (const list of obj.groups.values()) for (const cn of list) used.add(cn.v);
  const rotated = new Map([...used].map((i) => [i, rotate(obj.pos[i])]));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of rotated.values()) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p[a]);
      max[a] = Math.max(max[a], p[a]);
    }
  }
  const axis = { x: 0, y: 1, z: 2 }[spec.ref.axis];
  const scale = spec.ref.metres / (max[axis] - min[axis]);
  const origin = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  const place = (p) => [
    (p[0] - origin[0]) * scale,
    (p[1] - origin[1]) * scale,
    (p[2] - origin[2]) * scale,
  ];

  const doc = new Document();
  doc.getRoot().getAsset().copyright = 'CC0 1.0 (Kenney, kenney.nl)';
  doc.getRoot().setExtras({ source: ARCHIVE.page, model: spec.src, license: 'CC0-1.0' });
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(type);

  for (const [matName, corners] of obj.groups) {
    const kd = mtl.get(matName)?.kd ?? [0.8, 0.8, 0.8];
    const material = doc
      .createMaterial(matName)
      .setBaseColorFactor([...kd.map(srgbToLinear), 1])
      .setRoughnessFactor(0.85)
      .setMetallicFactor(0);

    const keyToIndex = new Map();
    const positions = [];
    const normals = [];
    const indices = [];
    for (let i = 0; i < corners.length; i += 3) {
      const tri = corners.slice(i, i + 3);
      const flat = faceNormal(...tri.map((cn) => obj.pos[cn.v]));
      for (const cn of tri) {
        const n = cn.n >= 0 ? obj.nrm[cn.n] : flat;
        const key = `${cn.v}/${cn.n >= 0 ? cn.n : `f${i}`}`;
        let at = keyToIndex.get(key);
        if (at === undefined) {
          at = positions.length / 3;
          keyToIndex.set(key, at);
          positions.push(...place(rotated.get(cn.v)));
          normals.push(...rotate(n));
        }
        indices.push(at);
      }
    }
    const prim = doc
      .createPrimitive()
      .setMaterial(material)
      .setAttribute(
        'POSITION',
        doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
      )
      .setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
      )
      .setIndices(
        doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
      );
    mesh.addPrimitive(prim);
  }

  const node = doc.createNode(type).setMesh(mesh);
  doc.createScene(type).addChild(node);
  const size = [0, 1, 2].map((a) => (max[a] - min[a]) * scale);
  return { doc, size };
}

// ------------------------------------------------------------------ main

async function build(opts, outDir) {
  const zip = await ensureArchive(opts.raw);
  const modelsDir = extract(zip, opts.raw, Object.values(SOURCES).map((s) => s.src));
  const work = mkdtempSync(join(tmpdir(), 'casaplazai-models-'));
  mkdirSync(outDir, { recursive: true });
  const io = new NodeIO();
  const results = [];
  try {
    for (const [type, spec] of Object.entries(SOURCES)) {
      const { doc, size } = buildDocument(type, spec, modelsDir);
      const plain = join(work, `${type}.glb`);
      await io.write(plain, doc);
      const out = join(outDir, `${type}.glb`);
      execFileSync(execPath, [CLI_BIN, 'meshopt', plain, out, '--level', 'high'], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const bytes = statSync(out).size;
      if (bytes >= MAX_BYTES) throw new Error(`${type}.glb is ${bytes} bytes (budget ${MAX_BYTES})`);
      results.push({ type, src: spec.src, bytes, size, sha: sha256(readFileSync(out)) });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return results;
}

function fmtSize(size) {
  return `${size[0].toFixed(2)} x ${size[2].toFixed(2)} x ${size[1].toFixed(2)} m (w x d x h)`;
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  if (!opts.check) {
    const results = await build(opts, opts.out);
    for (const r of results) {
      console.log(`${r.type}.glb  ${r.bytes} bytes  ${fmtSize(r.size)}  sha256 ${r.sha}`);
    }
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'casaplazai-models-check-'));
  let bad = 0;
  try {
    const results = await build(opts, tmp);
    for (const r of results) {
      const committed = join(opts.out, `${r.type}.glb`);
      const have = existsSync(committed) ? sha256(readFileSync(committed)) : null;
      const ok = have === r.sha;
      if (!ok) bad++;
      console.log(`${ok ? 'OK      ' : 'MISMATCH'} ${r.type}.glb  ${r.bytes} bytes  sha256 ${r.sha}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad === 0 ? 'check: all models reproduce' : `check: ${bad} model(s) differ`);
  if (bad > 0) exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  exit(1);
});
