/**
 * Share-link codec (issue #91, Pkg 10.1): packs a validated FloorplanData
 * into a URL-FRAGMENT payload ("v1.<base64url-deflate>") and unpacks it,
 * WITHOUT touching the network layer — fragments never hit servers.
 *
 * Pipeline: JSON.stringify → native CompressionStream('deflate') →
 * base64url (RFC 4648 §5, unpadded — '.' '/' '=' are reserved INSIDE
 * the alphabet precisely so the payload is fragment-safe) → "v1."
 * prefix. Decode reverses it and funnels the result through the schema
 * barrel (migrate → validateFloorplan) — never an ad-hoc shape check.
 *
 * NATIVE APIS ONLY, no polyfills: the repo is Chromium-baseline (e2e is
 * chromium-only) and Node ≥ 18 exposes CompressionStream /
 * DecompressionStream as globals, which is what the vitest suite rides
 * on. Feature detection belongs at the BUTTON (does this browser have
 * the streams?), never inside the codec — a codec that half-encodes
 * would produce links that LOOK valid but decode garbage.
 *
 * Fragment versioning: the "v1." prefix is the escape hatch — when a
 * future schema v3 forces a new payload shape, it ships as "v2.…"
 * while "v1." readers keep refusing politely (reason 'badPrefix'),
 * instead of every old link in the wild turning into a mystery crash.
 */

import {
  migrate,
  validateFloorplan,
  type FloorplanData,
  type ValidationError,
} from './schema';

/** Fragment payload prefix — bumped per wire-format breaking change. */
export const SHARE_PREFIX = 'v1.';

/**
 * Soft ceiling (chars) for the finished "#plan=…" VALUE: messaging apps
 * and some chat clients truncate URLs near 2 kB, so crossing this tier
 * earns the user a heads-up while the link is still produced.
 */
export const SHARE_WARN_LENGTH = 2000;

/**
 * Hard ceiling (chars): beyond this the link is practically unusable
 * (many browsers and servers choke far below the RFC 3986 ideal) and
 * encode refuses outright rather than handing back a dud.
 */
export const SHARE_MAX_LENGTH = 8000;

/** Why a fragment failed to decode — machine-readable, UI renders the message. */
export type DecodeErrorReason =
  | 'badPrefix'
  | 'badBase64'
  | 'badDeflate'
  | 'badJson'
  | 'invalidPlan';

export type DecodeResult =
  | { ok: true; plan: FloorplanData }
  | { ok: false; reason: DecodeErrorReason; message: string };

export interface EncodeWarning {
  /** Total fragment length in characters (prefix included). */
  length: number;
}

/* ---------- byte/string bridges ---------- */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  // Chunked: String.fromCharCode blows the arg limit on big arrays.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  // btoa is universal in browsers; Node ≥ 16 exposes it as a global too.
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array {
  // Re-pad + revert the URL-safe alphabet, then decode.
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(padded);
  } catch {
    throw new Error('SHARE_BAD_BASE64');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Deflate bytes through the native CompressionStream. */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  // Writable-side rejections are swallowed ON PURPOSE: a failing stream
  // surfaces its error on the READABLE side, which the caller awaits —
  // leaving these promises unhandled turns a catchable decode failure
  // into an unhandled-rejection crash.
  writer.write(bytes as BufferSource).catch(() => {});
  writer.close().catch(() => {});
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

/** Inflate bytes through the native DecompressionStream. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(bytes as BufferSource).catch(() => {});
  writer.close().catch(() => {});
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

/* ---------- public API ---------- */

/**
 * Deflate + base64url + version-prefix a plan into a fragment payload.
 * Resolves with `{ fragment, warning? }`; rejects only on engine faults
 * (missing streams — see the feature-detect note in the header). The
 * length tiers are judged on the FINISHED fragment so callers quote the
 * same number the user's URL bar will show.
 */
export async function encodeShare(
  plan: FloorplanData,
): Promise<{ fragment: string; warning?: EncodeWarning }> {
  const json = JSON.stringify(plan);
  const zipped = await deflate(new TextEncoder().encode(json));
  const fragment = SHARE_PREFIX + bytesToBase64Url(zipped);

  if (fragment.length > SHARE_MAX_LENGTH) {
    throw new Error(
      `Share link too long (${fragment.length} chars, hard cap ${SHARE_MAX_LENGTH}); ` +
      'export/import the plan as JSON instead',
    );
  }
  if (fragment.length > SHARE_WARN_LENGTH) {
    return { fragment, warning: { length: fragment.length } };
  }
  return { fragment };
}

/**
 * Reverse of encodeShare: strips the version prefix, inflates, parses,
 * and validates THROUGH THE BARREL (migrate → validateFloorplan) so a
 * decoded plan carries the exact same guarantees as one entered by
 * hand. Every failure is a typed reason — the viewer turns it into a
 * friendly banner, never a white-screen.
 */
export async function decodeShare(inputFragment: string): Promise<DecodeResult> {
  const fragment = inputFragment.trim();
  if (!fragment.startsWith(SHARE_PREFIX)) {
    return {
      ok: false,
      reason: 'badPrefix',
      message: 'This link does not carry a recognizable share payload.',
    };
  }
  const payload = fragment.slice(SHARE_PREFIX.length);
  if (payload.length === 0) {
    return { ok: false, reason: 'badBase64', message: 'The share payload is empty.' };
  }

  let zipped: Uint8Array;
  try {
    zipped = base64UrlToBytes(payload);
  } catch {
    return {
      ok: false,
      reason: 'badBase64',
      message: 'The share payload is corrupted (invalid characters).',
    };
  }

  let json: string;
  try {
    const plain = await inflate(zipped);
    json = new TextDecoder().decode(plain);
  } catch {
    return {
      ok: false,
      reason: 'badDeflate',
      message: 'The share payload is damaged (compressed data unreadable).',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      reason: 'badJson',
      message: 'The share payload is damaged (unreadable plan text).',
    };
  }

  // Barrel funnel: migrate first (links may outlive schema bumps),
  // then validate — identical to the autosave hydration door.
  const migrated = migrate(parsed);
  if (!migrated.ok || !migrated.data) {
    return {
      ok: false,
      reason: 'invalidPlan',
      message: 'The shared plan uses an unsupported schema version.',
    };
  }
  const validated = validateFloorplan(migrated.data);
  if (!validated.ok) {
    return {
      ok: false,
      reason: 'invalidPlan',
      message: summarizeValidationErrors(validated.errors),
    };
  }
  return { ok: true, plan: validated.value };
}

/** One-line digest of validator errors for the friendly banner. */
function summarizeValidationErrors(errors: ValidationError[]): string {
  const first = errors[0];
  return `The shared plan failed validation: ${first.message}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`;
}
