import { safeEqual } from '@turboslide/identity/safe-equal';
import { hasOwnAssetKey } from '@turboslide/schema/access';

import { storeSelection } from './root';

/**
 * Which twin the assets route serves for a request, and who may keep the answer (hardening
 * HR-SD#6, CRIT-M3; docs/hardening/HARDENING.md 4.4). Before this the route ran no identity check
 * and no `authorize`: anyone who knew a deck id and a file name read the twin, and after K1#3 its
 * 302 would have handed out the deck's asset key, the one capability the keyed store path is.
 *
 * - A checkout's file store keeps its folder rule: every twin by its name.
 * - A deck without a key of its own (the seed, a deck made before K1#3, a bundle upload's deck)
 *   keeps today's path by name until K1#4's `rekey` and `delete` move its twins: the same exposure
 *   its public store path has until then.
 * - A keyed deck's twin at `/decks/<id>/assets/<assetKey>/<file>` is served by the key alone, as
 *   the store's own URL serves it: the key is the capability.
 * - On the blob store, where a keyed deck's twins live under its key, a request by name is
 *   served only to a reader the deck admits (`authorize(read)` with the request's identity), and
 *   the answer is private; anyone else gets the answer a missing file gets. The editor and the
 *   presenter still name twins by name (controller.tsx and PresenterPage.tsx build `/decks/<id>/`
 *   on the client, DROPDOWNS files), so the name stays open to the deck's readers until those
 *   pages take the loader's keyed base; the viewer, the embed and the print pages already load
 *   twins by key from the store (decks.ts `viewerAssetBase`).
 * - A tmp store keeps names: its twins are not stored under the key.
 */

export type TwinRequest =
  /** the twin's path under `assets/`, and whether a shared cache may keep the answer */
  { serve: string; cache: 'public' | 'private' } | { refuse: true };

export type TwinAccessDeps = {
  /** the store this studio runs on: `file` (a checkout), `tmp` or `blob` */
  storeKind: () => string;
  /** the deck's own asset key, or null for a deck that has none */
  keyOf: (deckId: string) => Promise<string | null>;
  /** true when the request's identity may read the deck */
  mayRead: (deckId: string, request: Request) => Promise<boolean>;
};

const REFUSED: TwinRequest = { refuse: true };

export async function twinRequest(
  deckId: string,
  relative: string,
  request: Request,
  deps: TwinAccessDeps,
): Promise<TwinRequest> {
  const kind = deps.storeKind();
  if (kind === 'file') return { serve: relative, cache: 'public' };
  let key: string | null;
  try {
    key = await deps.keyOf(deckId);
  } catch {
    // a record that cannot be read names no key: the blob store refuses rather than guess
    return kind === 'blob' ? REFUSED : { serve: relative, cache: 'public' };
  }
  if (key === null) return { serve: relative, cache: 'public' };
  const slash = relative.indexOf('/');
  if (slash > 0 && safeEqual(relative.slice(0, slash), key))
    return { serve: relative.slice(slash + 1), cache: 'public' };
  if (kind !== 'blob') return { serve: relative, cache: 'public' };
  return (await deps.mayRead(deckId, request)) ? { serve: relative, cache: 'private' } : REFUSED;
}

/** The deployment's dependencies: the store selection, the cached record, `authorize(read)`. */
export function defaultTwinAccessDeps(): TwinAccessDeps {
  return {
    storeKind: () => storeSelection().kind,
    keyOf: async (deckId) => {
      const { readStoredAccess } = await import('./access');
      const stored = await readStoredAccess(deckId);
      return stored !== null && hasOwnAssetKey(stored.record) ? stored.record.assetKey : null;
    },
    mayRead: async (deckId, request) => {
      const { authorize, requestContext } = await import('./authorize');
      const ctx = await requestContext(request);
      const decision = await authorize(ctx, deckId, 'read', {
        action: 'asset.read',
        transport: 'route',
      });
      return decision.ok;
    },
  };
}
