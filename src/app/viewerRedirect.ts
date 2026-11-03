/**
 * /viewer redirect stub (issue #178, gap G13): the separate viewer page is
 * retired; send the visitor to the workspace with the 3D view active,
 * keeping the query (e.g. ?quality=low) and any #plan= share fragment.
 */
import { workspaceUrlFromViewer } from '../shared/viewerRoute';

location.replace(workspaceUrlFromViewer(location.search, location.hash));
