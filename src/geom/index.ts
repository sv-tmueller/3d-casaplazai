/**
 * Public barrel for pkg 4 (issue #5). Consumers (pkg 5 viewer, tests)
 * import exclusively from here; internals stay reachable for white-box
 * tests but the facade is the intended entry point.
 */

export type {
  Aabb,
  CompiledScene,
  FurnitureVolume,
  MeshBuffer,
  QuadCorners,
  RoomMeshes,
  StairSolid,
} from './types';
export {
  FloorplanCompileError,
  InvalidPolygonError,
  MissingRoomReferenceError,
  OpeningOverflowError,
  OverlappingOpeningsError,
  FurnitureOutOfBoundsError,
  OverlappingStairHolesError,
  StairGapMismatchError,
  StairOutOfBoundsException,
  UnknownStairRoomError,
} from './errors';
export { parseValidatedPlan, validateGeometry, validateStairs } from './validate';
export { earClipIndices } from './earclip';
export { buildFloor, buildCeiling, effectiveCeilingHeight } from './surfaces';
export { buildFloorWithHoles } from './floorHole';
export {
  buildStairSteps,
  stairFlankBoxes,
  stairFootprint,
  stairHoleRect,
  stairProgress,
  stairWorldRect,
  STAIR_FLANK_THICKNESS,
} from './stairs';
export {
  buildSlab,
  partitionLongitudinal,
  partitionVertical,
  wallEffectiveHeight,
  wallHeightForSegment,
  type WallPieceSpec,
} from './walls';
export {
  PLAYER_RADIUS,
  buildCollisions,
  collideWallPiece,
  expandPlayerRadius,
  furnitureCollisionBox,
  furnitureCollisionBoxes,
  furnitureZRange,
  roomCollisionPieces,
  segmentHitsBoxes,
} from './collision';
export { packRingFan } from './meshio';
export { compilePlan, countTriangles, countVertices, sceneBounds } from './compile';
export { windowPaneRects, type PaneRect } from './windowpanes';