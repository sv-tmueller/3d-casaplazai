/**
 * walkerLink (issue #147 CP1): the runtime viewer ⇄ editor channel for
 * walk-mode navigation aids.
 *
 * Why not window.__casaplaza? That bridge is the FROZEN editor→viewer
 * DATA contract (FloorplanData payloads, see editor/wire.ts). The
 * walker's live pose is runtime chatter, and per docs/schema.md's
 * out-of-schema doctrine it must never enter FloorplanData — which is
 * also why the glyph can never reach a share link. A tiny, DI-free,
 * module-level hub keeps the two panes honest:
 *
 *   viewer → editor : publishPose  (glyph position + heading + floor)
 *   editor → viewer : sendCommand  (place / gotoRoom teleports)
 *
 * Test hygiene: resetWalkerLink() drops every subscriber + the pose.
 */

/** Live walker pose in PLAN space (meters / radians, CCW from +X). */
export interface WalkerPose {
  x: number;
  y: number;
  /** Plan-space heading yaw (radians CCW from +X; north = π/2). */
  yawRad: number;
  /** Index into FloorplanData.floors — the storey the walker stands on. */
  floorIdx: number;
  /**
   * Viewer mode the pose was sampled in. Today the viewer publishes
   * 'walk' poses and RETRACTS by publishing null when the rig goes away
   * (leaving walk mode must not strand a marker); 'overview' is reserved
   * for a future parked/dimmed marker and the editor hides the glyph on
   * either.
   */
  mode: 'walk' | 'overview';
}

/** Editor→viewer teleports. */
export type WalkerCommand =
  | {
      kind: 'place';
      x: number;
      y: number;
      /** Plan-space heading for the teleported walker. */
      yaw: number;
      /** Target storey (the editor's active floor at click time). */
      floorIdx: number;
    }
  | { kind: 'gotoRoom'; roomId: string };

export type PoseListener = (pose: WalkerPose | null) => void;
export type CommandListener = (command: WalkerCommand) => void;

const poseListeners = new Set<PoseListener>();
const commandListeners = new Set<CommandListener>();
let currentPose: WalkerPose | null = null;

/**
 * Viewer → editor: publish the walker's plan pose (or null to clear).
 * Same-reference republishes are swallowed so a caller can publish
 * every frame without a listener storm.
 */
export function publishPose(pose: WalkerPose | null): void {
  if (pose === currentPose) return;
  currentPose = pose;
  for (const listener of [...poseListeners]) {
    try {
      listener(pose);
    } catch {
      /* one broken consumer must not starve the rest */
    }
  }
}

/** The last published pose (null before the viewer has ever walked). */
export function getPose(): WalkerPose | null {
  return currentPose;
}

/**
 * Editor → viewer: subscribe to pose updates. A LIVE pose is replayed
 * immediately so a late subscriber (an editor remounted while walk mode
 * is running) paints the glyph without waiting a frame; null is never
 * replayed — "no walker yet" is the subscriber's own initial state.
 * Returns the unsubscribe.
 */
export function subscribePose(listener: PoseListener): () => void {
  poseListeners.add(listener);
  if (currentPose !== null) {
    try {
      listener(currentPose);
    } catch {
      /* see publishPose */
    }
  }
  return () => {
    poseListeners.delete(listener);
  };
}

/** Editor → viewer: publish a teleport command (no-op with no viewer). */
export function sendCommand(command: WalkerCommand): void {
  for (const listener of [...commandListeners]) {
    try {
      listener(command);
    } catch {
      /* see publishPose */
    }
  }
}

/** Viewer: subscribe to teleport commands. Returns the unsubscribe. */
export function subscribeCommands(listener: CommandListener): () => void {
  commandListeners.add(listener);
  return () => {
    commandListeners.delete(listener);
  };
}

/**
 * True while a viewer is attached — the editor gates the "C"
 * place-camera arming on this (the standalone editor route has no 3D
 * pane to place a camera into).
 */
export function hasViewerSubscriber(): boolean {
  return commandListeners.size > 0;
}

/** TEST-ONLY: drop the pose and every subscriber. */
export function resetWalkerLink(): void {
  currentPose = null;
  poseListeners.clear();
  commandListeners.clear();
}
