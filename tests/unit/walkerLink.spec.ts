/**
 * walkerLink channel (issue #147 CP1): the runtime viewer⇄editor link
 * for walk-mode navigation aids. window.__casaplaza is the frozen
 * editor→viewer DATA contract (schema payloads) — live pose/commands
 * do not belong in it, so this tiny DI-free module owns the chatter.
 *
 * Two directions:
 *   viewer → editor : pose stream (glyph) + mode (glyph gating)
 *   editor → viewer : place / gotoRoom commands (teleport engine)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPose,
  hasViewerSubscriber,
  publishPose,
  resetWalkerLink,
  sendCommand,
  subscribeCommands,
  subscribePose,
  type WalkerCommand,
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

describe('command stream: editor → viewer', () => {
  it('reports whether a viewer is listening (the "C" arming gate)', () => {
    expect(hasViewerSubscriber()).toBe(false);
    const off = subscribeCommands(() => {});
    expect(hasViewerSubscriber()).toBe(true);
    off();
    expect(hasViewerSubscriber()).toBe(false);
  });

  it('delivers place commands with point + heading + floor', () => {
    const seen: WalkerCommand[] = [];
    subscribeCommands((cmd) => seen.push(cmd));
    sendCommand({ kind: 'place', x: 2, y: 3, yaw: 0.5, floorIdx: 1 });
    expect(seen).toEqual([{ kind: 'place', x: 2, y: 3, yaw: 0.5, floorIdx: 1 }]);
  });

  it('delivers gotoRoom commands by id', () => {
    const seen: WalkerCommand[] = [];
    subscribeCommands((cmd) => seen.push(cmd));
    sendCommand({ kind: 'gotoRoom', roomId: 'room-kitchen' });
    expect(seen).toEqual([{ kind: 'gotoRoom', roomId: 'room-kitchen' }]);
  });

  it('is a no-op with no viewer attached (editor pane standalone)', () => {
    expect(() => sendCommand({ kind: 'gotoRoom', roomId: 'x' })).not.toThrow();
  });

  it('fans out to every subscriber and honours unsubscribe', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeCommands(a);
    subscribeCommands(b);
    sendCommand({ kind: 'gotoRoom', roomId: 'r' });
    offA();
    sendCommand({ kind: 'gotoRoom', roomId: 'r2' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('a throwing subscriber never starves its siblings', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    subscribeCommands(bad);
    subscribeCommands(good);
    expect(() => sendCommand({ kind: 'gotoRoom', roomId: 'r' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

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

describe('resetWalkerLink (test hygiene)', () => {
  it('drops pose, subscribers, and the viewer flag', () => {
    publishPose(POSE);
    subscribeCommands(() => {});
    const spy = vi.fn();
    subscribePose(spy);
    // The late-subscribe replay already fired once; measure only what
    // happens AFTER the reset.
    spy.mockClear();
    resetWalkerLink();
    expect(getPose()).toBeNull();
    expect(hasViewerSubscriber()).toBe(false);
    publishPose({ ...POSE, x: 3 });
    expect(spy).not.toHaveBeenCalled();
  });
});
