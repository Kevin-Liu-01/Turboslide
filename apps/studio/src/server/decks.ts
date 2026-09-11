import { createServerFn } from '@tanstack/react-start';
import type { DeckTemplateId } from '@turboslide/schema/actions';
import { DECK_TEMPLATES } from '@turboslide/schema/actions';
import { slideTitle } from '@turboslide/schema/deck';
import type { DeckDocument } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { HostingFacts } from '@turboslide/store/hosted';
import type { CreateDeckResult } from '@turboslide/store/templates';
import { spriteMarkup } from '@turboslide/theme/sprite';
import type { ViewerDeck, ViewerSlide } from '@turboslide/viewer/model';
import { isPictureKind } from '@turboslide/viewer/model';

import { renderSlide } from './render';
import { createStoredDeck, hostingFacts, isHosted, listStoredDecks, openDeckStore } from './root';

/**
 * The studio's read side of the document (SPEC 4.1, 5.3): the deck through its store
 * (server/root.ts picks the backend: the checkout's decks/, the hosted overlay, or the Blob
 * mirror), validated by the store's read (SPEC 4.4), rendered once per slide through renderSlide
 * so the client sets innerHTML and never sees the block model. createServerFn lives only under
 * apps/studio/src/server (SPEC 3.3 item 4).
 *
 * Fallback, checkout only: a request for a missing deck id is served from decks/fixture with
 * `fallback` set, so the M1 viewer spec runs against the two-slide fixture before an import. A
 * hosted studio has no fixture and answers 404 for a deck it does not hold.
 */

/** The fixture deck served for a missing id in a checkout. */
const FALLBACK_DECK = 'fixture';

export type DeckSummary = {
  id: string;
  title: string;
  slides: number;
  sections: number;
  revision: number;
  updatedAt: string;
  createdAt: string;
};

export type DeckPayload = {
  deck: ViewerDeck;
  /** the theme's icon sprite (63 Heroicons plus gt-mark), inlined once per page */
  sprite: string;
  /** validation issues at severity 3, for the console and the sidebar later */
  issues: string[];
};

type Loaded = { servedId: string; document: DeckDocument; issues: string[] };

/** Reads a deck through its store; null when neither the deck nor the fixture can be read. */
async function loadDeck(deckId: string): Promise<Loaded | null> {
  const candidates = [deckId];
  if (!isHosted() && deckId !== FALLBACK_DECK) candidates.push(FALLBACK_DECK);
  for (const servedId of candidates) {
    try {
      const read = await (await openDeckStore(servedId)).read();
      return {
        servedId,
        document: read.document,
        issues: read.issues
          .filter((issue) => issue.severity === 3)
          .map((issue) => `${issue.file}${issue.pointer}: ${issue.message}`),
      };
    } catch (error) {
      // a missing deck is a RangeError, a folder that is not a deck a TypeError; anything else
      // (the store unreachable) is the route's error
      if (error instanceof RangeError || error instanceof TypeError) continue;
      throw error;
    }
  }
  return null;
}

/** The sprite the stage carries: the same markup the renderer inlines (SPEC 5.1). */
function sprite(): string {
  return spriteMarkup();
}

function buildViewerDeck(
  requestedId: string,
  servedId: string,
  loaded: Loaded,
  theme: 'light' | 'dark',
): ViewerDeck {
  const { deck, slides } = loaded.document;
  // Twin paths are relative to the deck directory and already start with `assets/` (SPEC 4.1,
  // 4.3), so the base is the deck's URL prefix; the /decks/$deckId/assets/$ route serves the rest.
  const assetBase = `/decks/${servedId}/`;
  const out: ViewerSlide[] = [];
  let n = 0;
  for (const section of deck.sections) {
    for (const slideId of section.slideIds) {
      const slide = slides[slideId];
      if (!slide) continue;
      n += 1;
      const rendered = renderSlide(deck, slide, {
        theme,
        chrome: true,
        assetBase,
        blockAttrs: true,
        gtWord: true,
      });
      const asset = 'picture' in slide ? deck.assets[slide.picture.asset] : undefined;
      const picture =
        isPictureKind(slide.kind) && asset
          ? 'neutral' in asset.twins
            ? { light: assetBase + asset.twins.neutral, dark: assetBase + asset.twins.neutral }
            : { light: assetBase + asset.twins.light, dark: assetBase + asset.twins.dark }
          : undefined;
      out.push({
        id: slideId,
        n,
        title: slideTitle(slide, n),
        kind: slide.kind,
        sectionId: section.id,
        html: rendered.html,
        picture,
        notes: slide.notes,
      });
    }
  }
  return {
    id: requestedId,
    title: deck.title,
    revision: deck.revision,
    sections: deck.sections.map((section) => ({
      id: section.id,
      name: section.name,
      slideIds: section.slideIds.filter((id) => slides[id]),
    })),
    slides: out,
    fallback: servedId === requestedId ? undefined : servedId,
  };
}

/**
 * Every deck the store holds, for the deck list at /decks and the landing redirect, newest first
 * by the updatedAt the store rewrites on every write (templates and folders without a manifest
 * are skipped; @turboslide/store/templates listDeckHeads). Hosted, the first call materializes
 * the bundled seed, so an empty function instance still lists the GT deck.
 */
export const listDecks = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DeckSummary[]> => listStoredDecks(),
);

/** The store facts the deck list and the editor show (the hosting round). */
export const getHostingFacts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HostingFacts> => hostingFacts(),
);

export type CreateDeckInput = { name: string; from: DeckTemplateId; id?: string };

function isTemplateId(value: unknown): value is DeckTemplateId {
  return typeof value === 'string' && (DECK_TEMPLATES as ReadonlyArray<string>).includes(value);
}

/**
 * deck.create for the studio (the /decks form, the landing redirect with no deck, the editor's
 * window API): one call into @turboslide/store/templates createDeck through the collection, the
 * same function the CLI and the MCP server run, over the decks folder the backend owns; the Blob
 * backend uploads the new deck before it answers.
 */
const createDeckFn = createServerFn({ method: 'POST' })
  .validator((input: CreateDeckInput): CreateDeckInput => {
    if (typeof input.name !== 'string' || input.name.trim() === '')
      throw new TypeError('name must be a non-empty string');
    if (!isTemplateId(input.from))
      throw new TypeError(`from must be one of ${DECK_TEMPLATES.join(', ')}`);
    if (input.id !== undefined && (typeof input.id !== 'string' || !SLUG_PATTERN.test(input.id)))
      throw new TypeError('id must be a slug');
    return {
      name: input.name,
      from: input.from,
      ...(input.id !== undefined ? { id: input.id } : {}),
    };
  })
  .handler(async ({ data }): Promise<CreateDeckResult> => createStoredDeck(data));

export async function createNewDeck(input: CreateDeckInput): Promise<CreateDeckResult> {
  return createDeckFn({ data: input });
}

export type GetDeckInput = { deckId: string; theme?: 'light' | 'dark' };

/** The rendered deck for the viewer routes, or null when neither the deck nor the fixture exists. */
export const getDeck = createServerFn({ method: 'GET' })
  .validator((input: GetDeckInput) => {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(input.deckId)) throw new Error('deckId must be a slug');
    return input;
  })
  .handler(async ({ data }): Promise<DeckPayload | null> => {
    const theme = data.theme ?? 'dark';
    const loaded = await loadDeck(data.deckId);
    if (!loaded) return null;
    return {
      deck: buildViewerDeck(data.deckId, loaded.servedId, loaded, theme),
      sprite: sprite(),
      issues: loaded.issues,
    };
  });
