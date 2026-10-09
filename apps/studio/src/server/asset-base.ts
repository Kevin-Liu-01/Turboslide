import { hasOwnAssetKey, keyedTwinPrefix } from '@turboslide/schema/access';

import { storeSelection } from './root';

/**
 * The asset base of a viewer payload (hardening K1#3; docs/hardening/HARDENING.md 4.1). Twin paths
 * are relative to the deck directory and start with `assets/` (SPEC 4.1, 4.3). A deck with a key
 * of its own on the blob store keeps its twins under `d/<id>/<assetKey>/` on the public store
 * (packages/store migrate.ts `keyedTwinsClient`), so the page loads each one by key from the
 * store's CDN and no twin URL can be derived from the deck id; every other deck keeps the deck's
 * URL prefix, which the /decks/$deckId/assets/$ route serves.
 *
 * Its own module because only server function handlers call it: decks.ts imports it there, so the
 * client compile drops the import with the handlers and never reaches `./root` or `./access`.
 */
export async function viewerAssetBase(deckId: string): Promise<string> {
  const byRoute = `/decks/${deckId}/`;
  if (storeSelection().kind !== 'blob') return byRoute;
  const [{ publicStoreOrigin }, { readStoredAccess }] = await Promise.all([
    import('./headers'),
    import('./access'),
  ]);
  const origin = publicStoreOrigin();
  if (origin === null) return byRoute;
  const stored = await readStoredAccess(deckId).catch(() => null);
  if (stored === null || !hasOwnAssetKey(stored.record)) return byRoute;
  return `${origin}/${keyedTwinPrefix(deckId, stored.record.assetKey)}`;
}
