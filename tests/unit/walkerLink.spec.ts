/**
 * walkerLink channel (issue #147 CP1): the runtime viewer⇄editor link
 * for walk-mode navigation aids. window.__casaplaza is the frozen
 * editor→viewer DATA contract (schema payloads) — live pose/commands
 * do not belong in it, so this tiny DI-free module owns the chatter.
 *
 * One direction since issue #178: the 3D engine publishes the pose
 * stream (glyph), live ('walk') or parked ('overview'); place camera and
 * Go-to-room are shell actions now, so the command stream is gone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPose,
  publishPose,
  resetWalkerLink,
  subscribePose,
  type WalkerPose,
} from '../../src/shared/walkerLink';

const POSE: WalkerPose = { x: 1.5, y: 2.5, yawRad: 0.25, floorIdx: 0, mode: 'walk' };

afterEach(() => {
  resetWalkerLink();
});

describe('poser stream: viewer → editor', () => {
  it('starts empty (no walker until the viewer publishes)', () => {
    expect(getPose()).toBeNull();
  });

  it('publishes a pose to every subscriber', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribePose(a);
    subscribePose(b);
    publishPose(POSE);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(POSE);
    expect(getPose()).toEqual(POSE);
  });

  it('hands the CURRENT pose to a late subscriber (glyph after editor remount)', () => {
    publishPose(POSE);
    const late = vi.fn();
    subscribePose(late);
    expect(late).toHaveBeenCalledWith(POSE);
  });

  it('unsubscribe stops delivery and does not disturb siblings', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribePose(a);
    subscribePose(b);
    offA();
    publishPose({ ...POSE, x: 9 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('publishing null clears the pose (leaving walk hides the glyph)', () => {
    publishPose(POSE);
    const spy = vi.fn();
    subscribePose(spy);
    publishPose(null);
    expect(spy).toHaveBeenCalledWith(null);
    expect(getPose()).toBeNull();
  });

  it('does not notify when the NEW pose is the same reference (cadence guard)', () => {
    const spy = vi.fn();
    subscribePose(spy);
    publishPose(POSE);
    publishPose(POSE);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('pose stream robustness', () => {
  it('a throwing pose subscriber never starves its siblings', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    subscribePose(bad);
    subscribePose(good);
    expect(() => publishPose(POSE)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe('parked pose (issue #178, G4)', () => {
  it('carries the overview mode and stays until the app clears it', () => {
    const seen: Array<WalkerPose | null> = [];
    subscribePose((p) => seen.push(p));
    publishPose({ ...POSE, mode: 'overview' });
    expect(getPose()?.mode).toBe('overview');
    publishPose(null);
    expect(seen.map((p) => p?.mode ?? null)).toEqual(['overview', null]);
  });
});

describe('resetWalkerLink (test hygiene)', () => {
  it('drops the pose and every subscriber', () => {
    publishPose(POSE);
    const spy = vi.fn();
    subscribePose(spy);
    // The late-subscribe replay already fired once; measure only what
    // happens AFTER the reset.
    spy.mockClear();
    resetWalkerLink();
    expect(getPose()).toBeNull();
    publishPose({ ...POSE, x: 3 });
    expect(spy).not.toHaveBeenCalled();
  });
});
