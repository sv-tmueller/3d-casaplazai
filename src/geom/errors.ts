/**
 * Typed compile-error taxonomy (issue #5). Base class plus one subclass
 * per malformed-plan family; every message names the offending ids /
 * indices / measurements so authors can locate the fault.
 */

/** Base class for every geometry-compilation failure. */
export abstract class FloorplanCompileError extends Error {}

/** Polygon winding/sign-area/degeneracy faults. */
export class InvalidPolygonError extends FloorplanCompileError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPolygonError';
  }
}

/** An opening/furniture refers to a room id that does not exist. */
export class MissingRoomReferenceError extends FloorplanCompileError {
  constructor(kind: string, entityId: string, roomId: string) {
    super(
      `${kind} "${entityId}" references unknown roomId "${roomId}". ` +
        'Add the room or fix the reference.',
    );
    this.name = 'MissingRoomReferenceError';
  }
}

/** An opening spills beyond its host segment; reports max usable width. */
export class OpeningOverflowError extends FloorplanCompileError {
  constructor(openingId: string, maxWidth: number) {
    super(
      `Opening "${openingId}" overflows its wall segment; ` +
        `widest fitting opening at this tCenter is ${maxWidth.toFixed(4)} m.`,
    );
    this.name = 'OpeningOverflowError';
  }
}

/** Two openings on one segment intersect longitudinally. */
export class OverlappingOpeningsError extends FloorplanCompileError {
  constructor(firstId: string, secondId: string) {
    super(
      `Openings "${firstId}" and "${secondId}" overlap on the same wall ` +
        'segment; shorten widths or shift tCenters apart.',
    );
    this.name = 'OverlappingOpeningsError';
  }
}

/** Furniture placed outside (or crossing the rim of) its room. */
export class FurnitureOutOfBoundsError extends FloorplanCompileError {
  constructor(itemId: string, roomId: string) {
    super(
      `Furniture "${itemId}" lies partly outside room "${roomId}"; ` +
        'move it inward or shrink its footprint.',
    );
    this.name = 'FurnitureOutOfBoundsError';
  }
}
