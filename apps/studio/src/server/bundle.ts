import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { authSummary } from '@turboslide/agent/http/auth';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { BUNDLE_MAX_BYTES } from '@turboslide/store/bundle';
import type { StoreKind } from '@turboslide/store/select';

import {
  ANY_SUBJECT,
  DOWNLOAD_PURPOSE,
  TICKET_QUERY,
  UPLOAD_PURPOSE,
  signTicket,
} from './bundle-core';
import { ensureDecks, isHosted, storeSelection } from './root';

/**
 * The server functions of the deck transfer (docs/deck-transfer.md): the tickets the /decks page
 * and the Export menu use to download and upload bundles through the routes without holding
 * TURBOSLIDE_TOKEN, and the facts the Connect card shows. Everything Node only (the HMAC tickets,
 * the pack and unpack, the Blob push) lives in bundle-core.ts, which only the handlers below and
 * the two routes import, so the pages' client modules never evaluate node:crypto (bundle-core.ts
 * says what happened when they did). createServerFn appears only under apps/studio/src/server
 * (SPEC 3.3 item 4).
 */

const bundleDownloadTicketFn = createServerFn({ method: 'POST' })
  .validator((raw: { deckId: string }): { deckId: string } => {
    if (typeof raw.deckId !== 'string' || !SLUG_PATTERN.test(raw.deckId))
      throw new TypeError('deckId must be a slug');
    return { deckId: raw.deckId };
  })
  .handler(async ({ data }): Promise<{ url: string }> => {
    const decks = await ensureDecks();
    if (!(await decks.has(data.deckId)))
      throw new RangeError(`No deck ${data.deckId} under decks/`);
    const ticket = signTicket(DOWNLOAD_PURPOSE, data.deckId);
    return {
      url: `/api/decks/${encodeURIComponent(data.deckId)}/bundle?${TICKET_QUERY}=${ticket}`,
    };
  });

/** Download deck bundle (the /decks row, the Export menu): the route URL with a ticket, no bearer needed. */
export async function bundleDownloadTicket(input: { deckId: string }): Promise<{ url: string }> {
  return bundleDownloadTicketFn({ data: input });
}

const bundleUploadTicketFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<{ url: string; maxBytes: number }> => ({
    url: `/api/decks/bundle?${TICKET_QUERY}=${signTicket(UPLOAD_PURPOSE, ANY_SUBJECT)}`,
    maxBytes: BUNDLE_MAX_BYTES,
  }),
);

/** Upload deck bundle (the /decks form): the route URL with a ticket; the page posts the zip to it. */
export async function bundleUploadTicket(): Promise<{ url: string; maxBytes: number }> {
  return bundleUploadTicketFn();
}

export type ConnectFacts = {
  /** the origin this studio is reached at, for the commands the Connect card shows */
  url: string;
  /** TURBOSLIDE_TOKEN is set, so push and pull need --token once */
  tokenRequired: boolean;
  store: StoreKind;
  persistent: boolean;
  hosted: boolean;
};

/** The origin of the request being served: the forwarded host and proto, then Host, then the URL. */
function requestOrigin(): string | null {
  try {
    const request = getRequest();
    const headers = request.headers;
    const host =
      headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host')?.trim();
    if (!host) return new URL(request.url).origin;
    const proto =
      headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

const connectFactsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ConnectFacts> => {
    const selection = storeSelection();
    const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const url = requestOrigin() ?? (production ? `https://${production}` : 'http://localhost:4321');
    return {
      url,
      tokenRequired: authSummary(process.env).required,
      store: selection.kind,
      persistent: selection.persistent,
      hosted: isHosted(),
    };
  },
);

/** What the Connect card on /decks shows. */
export async function connectFacts(): Promise<ConnectFacts> {
  return connectFactsFn();
}
