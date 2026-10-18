/**
 * Shared camera constants for the #46 nav e2e (#46).
 *
 * These mirror the real values in src/editor/glue.ts. They live here so
 * both the Playwright spec (a browser context) and tests/unit/glue.spec.ts
 * (Node) import the SAME numbers; glue.spec.ts asserts they equal the real
 * glue exports, so any drift fails loudly instead of silently passing.
 */
export const CAM_SCALE = 80; // glue INITIAL_SCALE (neutral camera scale)
export const FIT_MARGIN = 0.1; // glue FIT_MARGIN
export const BTN_ZOOM = 1.2; // glue ZOOM_BUTTON_STEP
