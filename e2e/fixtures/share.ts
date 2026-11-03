/**
 * Share fragments for e2e (issue #91 codec, issue #178 helper): a "v1."
 * fragment is base64url(deflate(JSON)), byte-identical to the app codec.
 */
import { deflateSync } from 'node:zlib';

export function shareFragment(payload: unknown): string {
  const zipped = deflateSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `v1.${zipped.toString('base64url')}`;
}
