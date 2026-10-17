/**
 * Scratch diagnostic for sweptHit semantics (kept until diagnosis done).
 */
import { describe, it } from 'vitest';
import { moveDisc } from '../../src/viewer/collision';
import type { CollisionBox } from '../../src/viewer/types';

const WALL_X: CollisionBox = { minX: 4.76, minY: -10, maxX: 5.24, maxY: 10 };

describe('scratch diagnostics', () => {
  it('logs internals', () => {
    const log: string[] = [];
    (globalThis as unknown as Record<string, unknown>)['__COLLISION_DEBUG__'] = true;
    (globalThis as unknown as Record<string, unknown>)['__COLLISION_LOG__'] = log;

    const out = moveDisc(3, 1, 3, 0, 1, [WALL_X], 0.3);
    /* eslint-disable no-console */
    console.log('OUTCOME:', JSON.stringify(out));
    for (const line of log) console.log('TRACE:', line);
    /* eslint-enable no-console */

    delete (globalThis as unknown as Record<string, unknown>)['__COLLISION_DEBUG__'];
    delete (globalThis as unknown as Record<string, unknown>)['__COLLISION_LOG__'];
  });
});
