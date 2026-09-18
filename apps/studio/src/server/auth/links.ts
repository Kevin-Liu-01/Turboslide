// The share link exchange (gslides-parity SPEC-3 0.13, 0.15, 6.4; research 09 3.2, 3.3; report
// 10 F40): `GET /s/<token>` is the one place a share token reaches the server. The route accepts
// a top level navigation only (`Sec-Fetch-Mode: navigate` with a document destination, or a
// browser that sends no fetch metadata), validates the token's grammar, hashes it, finds the
// link through the access store's index (B2's hook; the default reads a deck's access record
// file on a checkout), refuses a revoked, expired or unknown one with the 404 page, writes
// `{ linkId, deckId, role }` on the session's principal record and, for an account, on its index
// through the hook, and redirects with no token in the address: a viewer to `/deck/<id>`, a
// commenter or an editor to `/edit/<id>`. The exchange response carries
// `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` and renders no third party content.
//
// Two facts a probe of this route needs (VERIFICATION-3 finding 18). Node's `fetch` cannot make
// a navigation: undici stamps `sec-fetch-mode: cors` on every request and overwrites a caller's
// `navigate`, so a script that "navigates" with fetch is refused with 403 by the rule below on
// every deployment; a hosted probe sends the request through `node:https.request` or curl with
// `Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`. And the lookup runs with
// `fresh: true`: on the blob tier the access record cache is process local and 60 s long, so a
// link minted or revoked on one instance must still be read as it is by the instance that serves
// the exchange.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LinkGrant } from '@turboslide/identity/access';
import { tokenHash } from '@turboslide/identity/access';
import type { PrincipalRecord } from '@turboslide/identity/principal';
import { accessRecordSchema, linkIsLive, SHARE_TOKEN_PATTERN } from '@turboslide/schema/access';
import type { AccessRecord, GrantRole } from '@turboslide/schema/access';

import type {
  IdentityRuntime,
  RequestIdentity,
  ShareLinkHit,
  ShareLinkLookupOptions,
} from './identity.ts';

/** Where a role lands after the exchange (SPEC-3 0.13). */
export function landingPath(deckId: string, role: GrantRole): string {
  return role === 'viewer' ? `/deck/${deckId}` : `/edit/${deckId}`;
}

export type FetchMetadata = { mode: string | null; dest: string | null; site: string | null };

export function fetchMetadata(request: Request): FetchMetadata {
  return {
    mode: request.headers.get('sec-fetch-mode'),
    dest: request.headers.get('sec-fetch-dest'),
    site: request.headers.get('sec-fetch-site'),
  };
}

/**
 * True for a top level navigation: `navigate` with a `document` destination, or a request with
 * no fetch metadata at all (a browser without the headers, a bare address bar on such a browser,
 * curl). `cors`, `no-cors`, `same-origin` fetches and every subresource destination are refused.
 */
export function isNavigation(request: Request): boolean {
  const { mode, dest } = fetchMetadata(request);
  if (mode === null && dest === null) return true;
  if (mode !== 'navigate') return false;
  return dest === null || dest === 'document';
}

/** A header value echoed into the refusal: a known token, else "other". */
function fetchMetadataWord(value: string | null): string {
  if (value === null) return 'none';
  return /^[a-z-]{1,24}$/.test(value) ? value : 'other';
}

/**
 * The sentence of the 403 a fetch receives (SPEC-3 6.4), naming the metadata the request carried
 * so a probe log reads as its own explanation.
 */
export function notNavigationSentence(request: Request): string {
  const { mode, dest } = fetchMetadata(request);
  return `Share links open by a top level navigation. This request carried Sec-Fetch-Mode ${fetchMetadataWord(mode)} with Sec-Fetch-Dest ${fetchMetadataWord(dest)}, which the exchange refuses. Open the address in a browser tab.`;
}

export type ExchangeOutcome =
  | { kind: 'redirect'; location: string; grant: LinkGrant }
  | { kind: 'not_navigation' }
  | { kind: 'not_found' }
  | { kind: 'no_cookie' };

/** The response headers of the exchange route (SPEC-3 6.4). */
export const EXCHANGE_HEADERS: Readonly<Record<string, string>> = {
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex',
  'cache-control': 'no-store',
};

/** The access record file of a deck on a checkout, either of the two paths B2's store writes. */
export function readAccessRecordFile(deckDir: string): AccessRecord | null {
  for (const path of [join(deckDir, 'access.json'), join(deckDir, '.turboslide', 'access.json')]) {
    if (!existsSync(path)) continue;
    try {
      const parsed = accessRecordSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
      if (parsed.success) return parsed.data;
    } catch {
      // a torn or foreign file is no record
    }
  }
  return null;
}

/** The live link of a record whose hash equals `hash`, or null. */
export function findLinkInRecord(
  record: AccessRecord,
  hash: string,
  now: Date = new Date(),
): ShareLinkHit | null {
  const link = record.links.find((entry) => entry.hash === hash);
  if (link === undefined || !linkIsLive(link, now.toISOString())) return null;
  return { deckId: record.deckId, linkId: link.id, role: link.role };
}

export type LinkLookup = (
  hash: string,
  options: ShareLinkLookupOptions,
) => Promise<ShareLinkHit | null>;

/**
 * The default lookup on a checkout: the access record files of the decks the store lists. B2's
 * access store replaces it hosted through `bindIdentityHooks({ findShareLink })`.
 */
export function fileLinkLookup(
  listDeckDirs: () => Promise<{ deckId: string; dir: string }[]>,
  now: () => Date = () => new Date(),
): LinkLookup {
  return async (hash) => {
    for (const { dir } of await listDeckDirs()) {
      const record = readAccessRecordFile(dir);
      if (record === null) continue;
      const hit = findLinkInRecord(record, hash, now());
      if (hit !== null) return hit;
    }
    return null;
  };
}

export type ExchangeDeps = {
  runtime: IdentityRuntime;
  identity: RequestIdentity;
  lookup: LinkLookup;
  now?: Date;
  /**
   * Records the grant where every instance reads it (the principal's deck index on the Blob
   * store, `server/access.ts` `noteLinkGrant`; the focus round, VERIFICATION.md pass 2
   * F-share-404): the principal record below is this instance's file on the blob tier. A failure
   * here never fails the exchange; the record's grant stands for this instance.
   */
  noteGrant?: (principalId: string, grant: LinkGrant, now: string) => Promise<void>;
};

/**
 * The exchange: the token's grammar, the navigation rule, the lookup, the grant on the record,
 * the redirect. A person whose browser blocks cookies has no principal to write the grant on
 * (`no_cookie`); the page says so (6.4).
 */
export async function exchangeShareToken(
  token: string,
  request: Request,
  deps: ExchangeDeps,
): Promise<ExchangeOutcome> {
  if (!isNavigation(request)) return { kind: 'not_navigation' };
  if (!SHARE_TOKEN_PATTERN.test(token)) return { kind: 'not_found' };
  // fresh: a mint or a revocation seconds old counts on every instance (ShareLinkLookupOptions)
  const hit = await deps.lookup(tokenHash(token), { fresh: true });
  if (hit === null) return { kind: 'not_found' };
  const { identity, runtime } = deps;
  if (
    identity.principalId === null ||
    (identity.kind !== 'anonymous' && identity.kind !== 'account')
  )
    return { kind: 'no_cookie' };
  const grant: LinkGrant = { linkId: hit.linkId, deckId: hit.deckId, role: hit.role };
  const now = deps.now ?? new Date();
  const record: PrincipalRecord | null =
    identity.record ?? (await runtime.principals.touch(identity.principalId, now, true));
  if (record !== null) {
    const others = record.linkGrants.filter((held) => held.linkId !== grant.linkId);
    await runtime.principals.put({
      ...record,
      linkGrants: [...others, grant],
      lastSeenAt: now.toISOString(),
    });
  }
  if (deps.noteGrant !== undefined) {
    await deps.noteGrant(identity.principalId, grant, now.toISOString()).catch(() => undefined);
  }
  if (identity.kind === 'account' && runtime.hooks.onLinkGrant !== null)
    await runtime.hooks.onLinkGrant(identity.principalId, grant);
  return { kind: 'redirect', location: landingPath(hit.deckId, hit.role), grant };
}

/** The 404 page of a dead link (the same page as a missing deck; SPEC-3 6.2, 6.8). */
export const NOT_AVAILABLE = 'This presentation is not available to you, or does not exist.';
/** A browser with cookies blocked cannot follow a share link (6.4). */
export const COOKIES_NEEDED =
  'This link needs cookies to open. Allow cookies for this site and open the link again, or sign in.';
