// The addresses this browser minted, by deck and link id, in `localStorage` (docs/FOCUS.md 2.7;
// docs/PRODUCT.md section 2 rank 3). A share token is stored hashed on the record (SPEC-3 6.4),
// so the address exists only where it was minted: here, so Copy link sends the same address
// twice instead of rotating the link (which would stop the address the seller already sent),
// and so the field holds the general link's address at the dialog's first open when the deck's
// creation handed the page its token (b7.md FR1; EditorRoot remembers it through
// `rememberLinkUrl`). A browser that never minted the link mints another one with the same label;
// the earlier address keeps opening until it is revoked. Kept apart from Share.tsx so the studio
// can remember an address without the dialog's module.
export const LINK_URLS_KEY = 'ts-share-links';

type LinkUrlStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): LinkUrlStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLinkUrls(
  deckId: string,
  storage: LinkUrlStore | null = defaultStorage(),
): Record<string, string> {
  if (storage === null) return {};
  try {
    const raw = storage.getItem(LINK_URLS_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
    const mine = parsed[deckId];
    return mine !== null && typeof mine === 'object' ? { ...mine } : {};
  } catch {
    return {};
  }
}

function writeLinkUrls(
  deckId: string,
  urls: Record<string, string>,
  storage: LinkUrlStore | null,
): void {
  if (storage === null) return;
  try {
    const raw = storage.getItem(LINK_URLS_KEY);
    const parsed = (raw === null ? {} : JSON.parse(raw)) as Record<string, Record<string, string>>;
    if (Object.keys(urls).length === 0) delete parsed[deckId];
    else parsed[deckId] = urls;
    storage.setItem(LINK_URLS_KEY, JSON.stringify(parsed));
  } catch {
    // a full or refused storage forgets the address; the next Copy link mints another link
  }
}

export function rememberLinkUrl(
  deckId: string,
  linkId: string,
  url: string,
  storage: LinkUrlStore | null = defaultStorage(),
): void {
  writeLinkUrls(deckId, { ...readLinkUrls(deckId, storage), [linkId]: url }, storage);
}

/** Keeps the addresses of the live links alone (a revoked or rotated link's address is dead). */
export function pruneLinkUrls(
  deckId: string,
  liveIds: ReadonlyArray<string>,
  storage: LinkUrlStore | null = defaultStorage(),
): Record<string, string> {
  const kept: Record<string, string> = {};
  const known = readLinkUrls(deckId, storage);
  for (const id of liveIds) if (known[id] !== undefined) kept[id] = known[id];
  if (Object.keys(kept).length !== Object.keys(known).length) writeLinkUrls(deckId, kept, storage);
  return kept;
}

/**
 * The remembered address of a live general link (the row the first Copy link rotates or the deck's
 * creation minted): the newest live link carrying the general label whose id this browser
 * remembers, else null. `links` are the record's links as the dialog's view lists them.
 */
export function rememberedGeneralUrl(
  deckId: string,
  links: ReadonlyArray<{
    id: string;
    label?: string;
    createdAt: string;
    revokedAt?: string | null;
  }>,
  storage: LinkUrlStore | null = defaultStorage(),
): string | null {
  const known = readLinkUrls(deckId, storage);
  const live = links
    .filter(
      (link) =>
        link.label === GENERAL_LINK_LABEL &&
        (link.revokedAt === undefined || link.revokedAt === null),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const link of live) {
    const url = known[link.id];
    if (url !== undefined) return url;
  }
  return null;
}

/** The label of the general access link, as the record carries it (`@turboslide/store/access-store` GENERAL_LINK_LABEL). */
export const GENERAL_LINK_LABEL = 'Anyone with the link';
