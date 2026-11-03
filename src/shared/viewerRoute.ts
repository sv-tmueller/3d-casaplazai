/**
 * Workspace routes (issue #178, gap G13). The separate viewer page is
 * retired: `/viewer[?q][#plan=…]` redirects to `/?q&view=3d#plan=…`, and
 * share links target that URL directly.
 */

/** Fragment key carrying a share payload (issue #91). */
export const PLAN_FRAGMENT_PARAM = '#plan=';

/** Redirect target for the retired /viewer route. */
export function workspaceUrlFromViewer(search: string, hash: string): string {
  const query = search.replace(/^\?/, '');
  const parts = query === '' ? [] : query.split('&').filter((p) => p !== '' && !p.startsWith('view='));
  parts.push('view=3d');
  return `/?${parts.join('&')}${hash}`;
}

/** Share link: opens the workspace in the 3D view with the plan. */
export function shareUrl(origin: string, fragment: string): string {
  return `${origin}/?view=3d${PLAN_FRAGMENT_PARAM}${fragment}`;
}

/** The share payload of a location hash, or null when absent. */
export function planFragmentFromHash(hash: string): string | null {
  const idx = hash.indexOf(PLAN_FRAGMENT_PARAM);
  return idx === -1 ? null : hash.slice(idx + PLAN_FRAGMENT_PARAM.length);
}
