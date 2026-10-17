import { randomUUID } from 'node:crypto';

import { anonymousPrincipalId } from '@turboslide/identity/ids';
import { isTrashed } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import type { DeckCardStanding } from '../routes/-deck-card';
import { authorize } from './authorize';
import type { AuthContext, AuthorizeOptions, Decision } from './authorize';
import { PUBLISH_TOKEN_PATTERN } from './published';
import { isUnsavedDraft, openDeckStore } from './root';

/**
 * The deck card's rule (GF-2.1, the Glyphfield port's wave 2 item 1): a link unfurls with the
 * deck's first slide only when the link already lets anyone read the deck, which is two cases: the
 * deck's general access is open (`via: 'open'`), or the address carries the deck's live publish
 * token (`via: 'publish'`). Every other link (a restricted deck; a link mode deck, whose /s/ token
 * is exchanged for a cookie the picture's request does not carry; a revoked token) keeps the
 * site's card, so nothing a stranger could not open reaches an unfurl.
 *
 * The question is asked as the stranger, never as the reader: a fresh anonymous principal with no
 * link grant and no session, the way an unfurler's first request arrives, holding only the
 * address's publish token. The owner's own view of a restricted deck names the site's card too,
 * and the picture's URL is the same for every reader. The deck route asks through `getDeck`
 * (`card: true`), and the render route asks again on the picture's own request
 * (routes/api/render.$slideId.ts), so the picture is served only while the access that named it
 * holds; who may keep a served copy is thumbs.ts `thumbCacheControl`'s rule for an open or
 * published deck.
 */

/** The context of a stranger's first request that holds only the address. */
export function strangerContext(publishToken?: string): AuthContext {
  const ctx: AuthContext = {
    principal: { id: anonymousPrincipalId(randomUUID()), kind: 'anonymous', admin: false },
    linkGrants: [],
  };
  if (publishToken !== undefined && PUBLISH_TOKEN_PATTERN.test(publishToken))
    ctx.publishToken = publishToken;
  return ctx;
}

/** The standing a decision gives the card: `open` or `publish`, else null. */
function cardStandingOf(decision: Decision): DeckCardStanding | null {
  if (!decision.ok) return null;
  return decision.via === 'open' || decision.via === 'publish' ? decision.via : null;
}

/**
 * Whether a stranger holding only this address may read the deck, and how: the card's standing,
 * or null. `probe` is set by a page that asks for itself (no deny line is logged); the render
 * route's request leaves it unset, since its refusal refuses a caller.
 */
export async function cardStanding(
  deckId: string,
  publishToken: string | undefined,
  options: Pick<AuthorizeOptions, 'probe' | 'transport'> = {},
): Promise<{ standing: DeckCardStanding | null; decision: Decision }> {
  const decision = await authorize(strangerContext(publishToken), deckId, 'read', {
    action: 'deck.card',
    ...options,
  });
  return { standing: cardStandingOf(decision), decision };
}

/**
 * The card's standing for a page a reader opened (`getDeck` with `card: true`): a reader who came
 * in through the deck's general access or the address's publish token is the stranger the card
 * asks about, so the answer is the reader's own `via` and costs nothing; any other reader (the
 * owner, a grant or link holder, an agent, the admin) costs one decision, asked as the stranger,
 * as a probe that logs no denial.
 */
export async function readerCardStanding(
  deckId: string,
  publishToken: string | undefined,
  readerVia: string | null,
): Promise<DeckCardStanding | null> {
  if (readerVia === 'open' || readerVia === 'publish') return readerVia;
  return (await cardStanding(deckId, publishToken, { probe: true, transport: 'window' })).standing;
}

/**
 * The slide a card shows: the deck's first slide in section order that is not skipped, the slide
 * the viewer opens on (a skipped slide is the `readSkipped` capability's, which no stranger has).
 * Null for a deck in the trash, a deck without a shown slide, or a deck the store does not hold.
 */
export async function cardSlideOf(deckId: string): Promise<string | null> {
  if (!SLUG_PATTERN.test(deckId)) return null;
  // an unsaved draft has no folder, and opening its store would make one (thumbs.ts getThumbnail)
  if (await isUnsavedDraft(deckId)) return null;
  let document;
  try {
    ({ document } = await (await openDeckStore(deckId)).read());
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) return null;
    throw error;
  }
  if (isTrashed(document.deck)) return null;
  for (const section of document.deck.sections)
    for (const slideId of section.slideIds)
      if (document.slides[slideId] !== undefined && document.slides[slideId].skip !== true)
        return slideId;
  return null;
}
