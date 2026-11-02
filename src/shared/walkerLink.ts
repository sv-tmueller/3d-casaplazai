/**
 * walkerLink (issue #147 CP1; reworked by #178): the runtime pose channel
 * between the 3D engine and the Plan view's walker glyph.
 *
 * Why not window.__casaplaza? That bridge is the FROZEN editor→viewer
 * DATA contract (FloorplanData payloads, see editor/wire.ts). The
 * walker's live pose is runtime chatter, and per docs/schema.md's
 * out-of-schema doctrine it must never enter FloorplanData — which is
 * also why the glyph can never reach a share link.
 *
 *   3D engine → Plan glyph : publishPose (position + heading + storey)
 *
 * Issue #178: the editor→viewer command stream (place / gotoRoom) is
 * gone — the workspace shell owns the view switch (gap G3), so place
 * camera and Go-to-room are shell actions. Leaving Walk now PARKS the
 * pose (mode 'overview') instead of retracting it, so the glyph keeps
 * showing where the camera stood (gap G4); the app clears it with
 * publishPose(null) when the plan is replaced.
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
   * 'walk' while the walker is live; 'overview' for the PARKED pose the
   * 3D engine leaves behind when Walk ends (issue #178, G4). The glyph
   * draws either.
   */
  mode: 'walk' | 'overview';
}

export type PoseListener = (pose: WalkerPose | null) => void;

const poseListeners = new Set<PoseListener>();
let currentPose: WalkerPose | null = null;

/**
 * Publish the walker's plan pose (or null to clear). Same-reference
 * republishes are swallowed so a caller can publish every frame without
 * a listener storm.
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

/** The last published pose (null before anyone walked). */
export function getPose(): WalkerPose | null {
  return currentPose;
}

/**
 * Subscribe to pose updates. A LIVE pose is replayed immediately so a
 * late subscriber paints the glyph without waiting a frame; null is
 * never replayed. Returns the unsubscribe.
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

/** TEST-ONLY: drop the pose and every subscriber. */
export function resetWalkerLink(): void {
  currentPose = null;
  poseListeners.clear();
}
