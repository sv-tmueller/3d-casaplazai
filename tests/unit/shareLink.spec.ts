/**
 * Unit coverage for the share-link codec (issue #91, Pkg 10.1).
 *
 * Round-trip bar: VALIDATION-EQUIVALENCE, not byte identity — the
 * decoded plan must satisfy the schema barrel's validator exactly like
 * the source plan did (encode/decode may legally reorder nothing, but
 * the assertion pins the guarantee the viewer actually relies on).
 *
 * Runtime: Node ≥ 18 exposes CompressionStream/DecompressionStream,
 * btoa/atob, TextEncoder/TextDecoder and Response as globals, so the
 * codec's native-APIs-only stance doubles as its test harness.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeShare,
  encodeShare,
  SHARE_PREFIX,
  SHARE_WARN_LENGTH,
} from '../../src/shared/shareLink';
import { migrate, validateFloorplan, type FloorplanData } from '../../src/shared/schema';

/** The committed townhouse (multi-floor + stairs + roofs) through the door. */
function townhouse(): FloorplanData {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'),
  ) as unknown;
  const migrated = migrate(raw);
  if (!migrated.ok || !migrated.data) throw new Error('fixture failed to migrate');
  const validated = validateFloorplan(migrated.data);
  if (!validated.ok) throw new Error('fixture failed to validate');
  return validated.value;
}

describe('shareLink.encodeShare / decodeShare round-trip (issue #91)', () => {
  it('round-trips the townhouse validation-equivalently', async () => {
    const plan = townhouse();
    const { fragment } = await encodeShare(plan);
    expect(fragment.startsWith(SHARE_PREFIX)).toBe(true);
    // Unpadded base64url: no '.', '/', '=' after the version prefix.
    expect(fragment.slice(SHARE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);

    const res = await decodeShare(fragment);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Validation-equivalence: the survivor passes the barrel intact…
    const check = validateFloorplan(res.plan);
    expect(check.ok).toBe(true);
    // …and structurally matches the source (floors, stairs, roofs).
    expect(res.plan.floors.map((f) => f.name)).toEqual(plan.floors.map((f) => f.name));
    expect(res.plan.floors.every((f, i) => f.rooms.length === plan.floors[i].rooms.length))
      .toBe(true);
    expect(res.plan.stairs.length).toBe(plan.stairs.length);
    const roofs = res.plan.floors[res.plan.floors.length - 1].rooms.reduce(
      (n, r) => n + (r.roofs?.length ?? 0), 0,
    );
    const roofsSrc = plan.floors[plan.floors.length - 1].rooms.reduce(
      (n, r) => n + (r.roofs?.length ?? 0), 0,
    );
    expect(roofs).toBe(roofsSrc);
    expect(roofs).toBeGreaterThan(0); // the fixture genuinely exercises roofs
  });

  it('produces no length warning for the townhouse-sized plan', async () => {
    const { fragment, warning } = await encodeShare(townhouse());
    expect(fragment.length).toBeLessThan(SHARE_WARN_LENGTH);
    expect(warning).toBeUndefined();
  });
});

describe('shareLink.decodeShare typed failures (issue #91)', () => {
  it('rejects a fragment without the version prefix (badPrefix)', async () => {
    const { fragment } = await encodeShare(townhouse());
    const res = await decodeShare(fragment.slice(SHARE_PREFIX.length));
    expect(res).toMatchObject({ ok: false, reason: 'badPrefix' });
  });

  it('rejects an empty payload (emptyPayload — issue #94)', async () => {
    const res = await decodeShare(SHARE_PREFIX);
    expect(res).toMatchObject({ ok: false, reason: 'emptyPayload' });
  });

  it('rejects non-base64url garbage (badBase64)', async () => {
    const res = await decodeShare(`${SHARE_PREFIX}@@@@****`);
    expect(res).toMatchObject({ ok: false, reason: 'badBase64' });
  });

  it('rejects a TRUNCATED fragment (badDeflate)', async () => {
    const { fragment } = await encodeShare(townhouse());
    const res = await decodeShare(fragment.slice(0, fragment.length - 12));
    expect(res).toMatchObject({ ok: false, reason: 'badDeflate' });
  });

  it('rejects bit-flipped payload bytes (badDeflate or worse — never ok)', async () => {
    const { fragment } = await encodeShare(townhouse());
    // Flip a character mid-payload: whatever layer catches it, decode
    // must return a TYPED failure rather than throwing or succeeding.
    const idx = Math.floor(fragment.length / 2);
    const flipped = (fragment[idx] === 'A' ? 'B' : 'A');
    const res = await decodeShare(
      fragment.slice(0, idx) + flipped + fragment.slice(idx + 1),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(['badBase64', 'badDeflate', 'badJson', 'invalidPlan']).toContain(res.reason);
  });

  it('rejects a valid deflate of NON-JSON bytes (badJson)', async () => {
    // Hand-build a fragment whose payload is deflated gibberish.
    const enc = new TextEncoder();
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    void writer.write(enc.encode('this is not json at all'));
    void writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    const payload = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await decodeShare(SHARE_PREFIX + payload);
    expect(res).toMatchObject({ ok: false, reason: 'badJson' });
  });

  it('rejects a valid deflate of INVALID plan JSON (invalidPlan)', async () => {
    const bogus = { schemaVersion: 2, units: 'meters', wallHeight: 2.7, wallThickness: 0.2, floors: [] };
    const enc = new TextEncoder();
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    void writer.write(enc.encode(JSON.stringify(bogus)));
    void writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    const payload = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await decodeShare(SHARE_PREFIX + payload);
    expect(res).toMatchObject({ ok: false, reason: 'invalidPlan' });
  });

  it('surfaces a friendly message for every typed reason (no raw exceptions)', async () => {
    const samples = [
      await decodeShare('garbage'),
      await decodeShare(SHARE_PREFIX),
      await decodeShare(`${SHARE_PREFIX}zzzz`),
    ];
    for (const s of samples) {
      expect(s.ok).toBe(false);
      if (s.ok) continue;
      expect(s.message.length).toBeGreaterThan(0);
      expect(s.message.endsWith('.')).toBe(true);
    }
  });
});

describe('shareLink length guard tiers (issue #91)', () => {
  /**
   * Plan generator sized to a target JSON magnitude: pads a room name
   * so the PRE-compression JSON crosses the desired kilobyte range.
   * Deflate eats repetitive padding extremely well, so the pad string
   * is randomized per chunk to defeat the dictionary coder.
   */
  function bloatedPlan(kb: number): FloorplanData {
    const base = townhouse();
    let pad = '';
    const chunk = () =>
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    while (pad.length < kb * 1024) pad += chunk();
    return {
      ...base,
      floors: base.floors.map((f, i) =>
        i === 0
          ? { ...f, rooms: f.rooms.map((r) => ({ ...r, name: `${r.name} ${pad}` })) }
          : f,
      ),
    };
  }

  it('warns (but still encodes) past the warn tier', async () => {
    // Hunt for a plan whose finished fragment lands between the tiers.
    let encoded: { fragment: string; warning?: { length: number } } | null = null;
    for (let kb = 6; kb <= 40 && !encoded; kb += 2) {
      const out = await encodeShare(bloatedPlan(kb));
      if (out.fragment.length > SHARE_WARN_LENGTH) encoded = out;
    }
    expect(encoded).not.toBeNull();
    if (!encoded) return;
    expect(encoded.warning).toBeDefined();
    expect(encoded.warning!.length).toBe(encoded.fragment.length);
    // A warned link still decodes — the tier is advisory, not fatal.
    const res = await decodeShare(encoded.fragment);
    expect(res.ok).toBe(true);
  });

  it('hard-refuses past the max tier', async () => {
    await expect(encodeShare(bloatedPlan(900))).rejects.toThrow(/too long/i);
  });
});
