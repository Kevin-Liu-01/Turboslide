import { createServerFn } from '@tanstack/react-start';
import type { DeckTemplateId } from '@turboslide/schema/actions';
import { DECK_TEMPLATES } from '@turboslide/schema/actions';
import { deckAppearance, isTrashed, slideTitle } from '@turboslide/schema/deck';
import type { Appearance, DeckDocument } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Author } from '@turboslide/schema/mutations';
import type { HostingFacts } from '@turboslide/store/hosted';
import type {
  CopyDeckInput,
  CopyDeckResult,
  CreateDeckResult,
  DeckHead,
  TrashState,
} from '@turboslide/store/templates';
import { StaleRevisionError } from '@turboslide/store/templates';
import { spriteMarkup } from '@turboslide/theme/sprite';
import type { ViewerDeck, ViewerSlide } from '@turboslide/viewer/model';
import { isPictureKind } from '@turboslide/viewer/model';

import { renderSlide } from './render';
import {
  createStoredDeck,
  deckCardFacts,
  ensureDecks,
  hostingFacts,
  isHosted,
  listStoredDecks,
  openDeckStore,
} from './root';

/**
 * The studio's read side of the document (SPEC 4.1, 5.3) and the server side of the home page,
 * the trash and the File menu's deck dialogs (gslides-parity SPEC 6.2 to 6.5): the deck through
 * its store (server/root.ts picks the backend: the checkout's decks/, the hosted overlay, or the
 * Blob mirror), validated by the store's read (SPEC 4.4), rendered once per slide through
 * renderSlide so the client sets innerHTML and never sees the block model. Every function below
 * goes through the hosted collection (`ensureDecks`, `openDeckStore`), so it behaves the same on
 * the file, tmp and Blob stores. createServerFn lives only under apps/studio/src/server (SPEC 3.3
 * item 4).
 *
 * Fallback, checkout only: a request for a missing deck id is served from decks/fixture with
 * `fallback` set, so the M1 viewer spec runs against the two-slide fixture before an import. A
 * hosted studio has no fixture and answers 404 for a deck it does not hold.
 */

/** The fixture deck served for a missing id in a checkout. */
const FALLBACK_DECK = 'fixture';

/** The author the home page writes as (Rename); the editor's default author (edit.$deckId.tsx). */
const HOME_AUTHOR: Author = { kind: 'human', name: 'studio' };

/**
 * One card of the home page and the trash (gslides-parity SPEC 6.2): `deck.list`'s head plus the
 * two facts the thumbnail needs, the deck's appearance (SPEC 7.2.3) and its first slide.
 */
export type DeckCard = DeckHead & {
  appearance: Appearance;
  /** the first slide's id, for the 320 by 180 thumbnail; null for a deck without slides */
  firstSlide: string | null;
};

export type DeckPayload = {
  deck: ViewerDeck;
  /** the theme's icon sprite (63 Heroicons plus gt-mark), inlined once per page */
  sprite: string;
  /** validation issues at severity 3, for the console and the sidebar later */
  issues: string[];
  /** the ids of the skipped slides (SPEC 7.2.1), listed so print can name what it left out */
  skipped: string[];
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

type ViewerBuildOptions = {
  theme: 'light' | 'dark';
  /** carry the speaker notes; off for the public view and embed payloads (SPEC 6.6, R10 C3 item 1) */
  notes: boolean;
  /** carry the skipped slides; off for the public payloads and present mode (SPEC 7.2.1) */
  includeSkipped: boolean;
};

function buildViewerDeck(
  requestedId: string,
  servedId: string,
  loaded: Loaded,
  options: ViewerBuildOptions,
): { deck: ViewerDeck; skipped: string[] } {
  const { deck, slides } = loaded.document;
  // Twin paths are relative to the deck directory and already start with `assets/` (SPEC 4.1,
  // 4.3), so the base is the deck's URL prefix; the /decks/$deckId/assets/$ route serves the rest.
  const assetBase = `/decks/${servedId}/`;
  const out: ViewerSlide[] = [];
  const skipped: string[] = [];
  let n = 0;
  for (const section of deck.sections) {
    for (const slideId of section.slideIds) {
      const slide = slides[slideId];
      if (!slide) continue;
      if (slide.skip === true) {
        skipped.push(slideId);
        if (!options.includeSkipped) continue;
      }
      n += 1;
      const rendered = renderSlide(deck, slide, {
        theme: options.theme,
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
        ...(options.notes && slide.notes !== undefined ? { notes: slide.notes } : {}),
      });
    }
  }
  const kept = new Set(out.map((slide) => slide.id));
  return {
    deck: {
      id: requestedId,
      title: deck.title,
      revision: deck.revision,
      sections: deck.sections
        .map((section) => ({
          id: section.id,
          name: section.name,
          slideIds: section.slideIds.filter((id) => kept.has(id)),
        }))
        // a section whose every slide is skipped leaves the payload with them
        .filter((section) => section.slideIds.length > 0),
      slides: out,
      fallback: servedId === requestedId ? undefined : servedId,
    },
    skipped,
  };
}

// ---------------------------------------------------------------------------------------------
// The home page and the trash (gslides-parity SPEC 6.2, 6.4)

/**
 * One card from a head: the two thumbnail facts come from the deck's manifest without validating
 * the whole deck (server/root.ts deckCardFacts; a home page of a dozen decks would otherwise
 * validate a thousand slides on every load). `HostedDecks.list` has synced the folder before.
 */
function cardOf(head: DeckHead): DeckCard {
  return { ...head, ...deckCardFacts(head.id) };
}

/**
 * Every deck the store holds outside the trash, for the home page's Recent presentations, the
 * Open dialog and the Import slides dialog (gslides-parity SPEC 6.2), newest first by the
 * updatedAt the store rewrites on every write. Hosted, the first call materializes the bundled
 * seed, so an empty function instance still lists the GT deck. The same `deck.list` the CLI and
 * MCP answer, through the collection (`HostedDecks.list`), which on Blob syncs every deck so a
 * title or a trash stamp written on another instance shows here at once.
 */
export const listDecks = createServerFn({ method: 'GET' }).handler(async (): Promise<DeckCard[]> =>
  (await listStoredDecks()).map(cardOf),
);

/** The decks in the trash, newest stamp first, for /decks/trash (gslides-parity SPEC 6.4). */
export const listTrashedDecks = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DeckCard[]> => {
    const heads = await (await ensureDecks()).list({ includeTrashed: true });
    return heads
      .filter((head) => head.trashedAt !== undefined)
      .sort((a, b) => (b.trashedAt ?? '').localeCompare(a.trashedAt ?? ''))
      .map(cardOf);
  },
);

/** The store facts the deck list and the editor show (the hosting round). */
export const getHostingFacts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HostingFacts> => hostingFacts(),
);

export type CreateDeckInput = { name: string; from: DeckTemplateId; id?: string };

function isTemplateId(value: unknown): value is DeckTemplateId {
  return typeof value === 'string' && (DECK_TEMPLATES as ReadonlyArray<string>).includes(value);
}

function requireSlug(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value))
    throw new TypeError(`${name} must be a slug`);
  return value;
}

function optionalRevision(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new TypeError(`${name} must be a non-negative integer revision`);
  return value;
}

/** A stale baseRevision against the collection reads as one sentence the page can show. */
async function mapStale<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StaleRevisionError)
      throw new Error(`${error.message}. Reload the page and try again`);
    throw error;
  }
}

/**
 * deck.create for the studio (the home page's GT brand deck card, the editor's window API): one
 * call into @turboslide/store/templates createDeck through the collection, the same function the
 * CLI and the MCP server run, over the decks folder the backend owns; the Blob backend uploads
 * the new deck before it answers.
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

export type RenameDeckInput = { deckId: string; name: string; baseRevision?: number };
export type RenameDeckResult =
  { ok: true; title: string; revision: number } | { ok: false; message: string };

/**
 * Rename from the home page's card menu (gslides-parity SPEC 6.3): one `deck.set /title` through
 * the deck's store, the write `deck.rename` makes in the editor and the CLI, so the version log
 * carries it like any other write. A stale baseRevision comes back as the store's conflict text.
 */
const renameDeckFn = createServerFn({ method: 'POST' })
  .validator((input: RenameDeckInput): RenameDeckInput => {
    const deckId = requireSlug(input.deckId, 'deckId');
    if (typeof input.name !== 'string' || input.name.trim() === '')
      throw new TypeError('name must be a non-empty string');
    const baseRevision = optionalRevision(input.baseRevision, 'baseRevision');
    return {
      deckId,
      name: input.name.trim(),
      ...(baseRevision !== undefined ? { baseRevision } : {}),
    };
  })
  .handler(async ({ data }): Promise<RenameDeckResult> => {
    const store = await openDeckStore(data.deckId);
    const baseRevision = data.baseRevision ?? (await store.revision());
    const outcome = await store.write({
      baseRevision,
      author: HOME_AUTHOR,
      note: 'deck.rename',
      mutations: [{ op: 'deck.set', path: '/title', value: data.name }],
    });
    if (outcome.ok) return { ok: true, title: data.name, revision: outcome.revision };
    return { ok: false, message: outcome.message };
  });

export async function renameStoredDeck(input: RenameDeckInput): Promise<RenameDeckResult> {
  return renameDeckFn({ data: input });
}

export type CopyDeckRequest = {
  deckId: string;
  name: string;
  slideIds?: string[];
  removeNotes?: boolean;
  baseRevision?: number;
};

/**
 * Make a copy (gslides-parity SPEC 6.5, `deck.copy`): the collection copies the deck under the
 * slug of the new name, every slide or the named ones, with or without the speaker notes, and on
 * the Blob backend pushes the copy before it answers. The dialog opens the copy in a new tab.
 */
const copyDeckFn = createServerFn({ method: 'POST' })
  .validator((input: CopyDeckRequest): CopyDeckRequest => {
    const deckId = requireSlug(input.deckId, 'deckId');
    if (typeof input.name !== 'string' || input.name.trim() === '')
      throw new TypeError('name must be a non-empty string');
    if (
      input.slideIds !== undefined &&
      (!Array.isArray(input.slideIds) ||
        input.slideIds.length === 0 ||
        !input.slideIds.every((id) => typeof id === 'string' && SLUG_PATTERN.test(id)))
    )
      throw new TypeError('slideIds must be a non-empty list of slugs');
    const baseRevision = optionalRevision(input.baseRevision, 'baseRevision');
    return {
      deckId,
      name: input.name.trim(),
      ...(input.slideIds !== undefined ? { slideIds: input.slideIds } : {}),
      ...(input.removeNotes === true ? { removeNotes: true } : {}),
      ...(baseRevision !== undefined ? { baseRevision } : {}),
    };
  })
  .handler(async ({ data }): Promise<CopyDeckResult> => {
    const input: CopyDeckInput = {
      id: data.deckId,
      name: data.name,
      ...(data.slideIds !== undefined ? { slideIds: data.slideIds } : {}),
      ...(data.removeNotes === true ? { removeNotes: true } : {}),
    };
    return mapStale(async () => (await ensureDecks()).copy(input, data.baseRevision));
  });

export async function copyStoredDeck(input: CopyDeckRequest): Promise<CopyDeckResult> {
  return copyDeckFn({ data: input });
}

export type DeckIdRequest = { deckId: string; baseRevision?: number };

function validateDeckId(input: DeckIdRequest): DeckIdRequest {
  const deckId = requireSlug(input.deckId, 'deckId');
  const baseRevision = optionalRevision(input.baseRevision, 'baseRevision');
  return { deckId, ...(baseRevision !== undefined ? { baseRevision } : {}) };
}

/** Move to trash (gslides-parity SPEC 6.4, `deck.trash`): the stamp on the manifest, the files stay. */
const trashDeckFn = createServerFn({ method: 'POST' })
  .validator(validateDeckId)
  .handler(async ({ data }): Promise<TrashState> =>
    mapStale(async () => (await ensureDecks()).trash(data.deckId, data.baseRevision)),
  );

export async function trashStoredDeck(input: DeckIdRequest): Promise<TrashState> {
  return trashDeckFn({ data: input });
}

/** Restore from the trash (`deck.restore`): the snackbar's Undo and the trash page's Restore. */
const restoreDeckFn = createServerFn({ method: 'POST' })
  .validator(validateDeckId)
  .handler(async ({ data }): Promise<TrashState> =>
    mapStale(async () => (await ensureDecks()).restore(data.deckId, data.baseRevision)),
  );

export async function restoreStoredDeck(input: DeckIdRequest): Promise<TrashState> {
  return restoreDeckFn({ data: input });
}

/**
 * Delete forever (`deck.remove`): the folder on the file and tmp stores, the prefix and everything
 * under it on Blob. Irreversible; the trash page asks first, and nothing runs it on a schedule
 * (SPEC 0.24).
 */
const removeDeckFn = createServerFn({ method: 'POST' })
  .validator(validateDeckId)
  .handler(async ({ data }): Promise<{ id: string; removed: true }> =>
    mapStale(async () => (await ensureDecks()).remove(data.deckId, data.baseRevision)),
  );

export async function removeStoredDeck(
  input: DeckIdRequest,
): Promise<{ id: string; removed: true }> {
  return removeDeckFn({ data: input });
}

export type DeckDetails = {
  id: string;
  title: string;
  slides: number;
  sections: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string;
};

/**
 * The Details dialog's facts (gslides-parity SPEC 12 "Details": Title, Slides, Sections, Created,
 * Last edit) from the deck's manifest; `deck.info` carries no stamps, so the dialog reads these.
 */
const deckDetailsFn = createServerFn({ method: 'GET' })
  .validator((input: { deckId: string }) => ({ deckId: requireSlug(input.deckId, 'deckId') }))
  .handler(async ({ data }): Promise<DeckDetails | null> => {
    const decks = await ensureDecks();
    const head = (await decks.list({ includeTrashed: true })).find((row) => row.id === data.deckId);
    if (head === undefined) return null;
    return {
      id: head.id,
      title: head.title,
      slides: head.slides,
      sections: head.sections,
      revision: head.revision,
      createdAt: head.createdAt,
      updatedAt: head.updatedAt,
      ...(head.trashedAt !== undefined ? { trashedAt: head.trashedAt } : {}),
    };
  });

export async function deckDetails(input: { deckId: string }): Promise<DeckDetails | null> {
  return deckDetailsFn({ data: input });
}

export type SourceDeckSlides = {
  id: string;
  title: string;
  revision: number;
  slides: { id: string; title: string; n: number; skip?: true }[];
};

/**
 * Another deck's slides in order with titles, for the Import slides dialog's second step
 * (gslides-parity SPEC 6.5) and File > Make a copy > Selected slides; read through the store so
 * the Blob backend syncs the source first. Null for a deck the store does not hold.
 */
const sourceDeckSlidesFn = createServerFn({ method: 'GET' })
  .validator((input: { deckId: string }) => ({ deckId: requireSlug(input.deckId, 'deckId') }))
  .handler(async ({ data }): Promise<SourceDeckSlides | null> => {
    let document: DeckDocument;
    try {
      document = (await (await openDeckStore(data.deckId)).read()).document;
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) return null;
      throw error;
    }
    let n = 0;
    const slides: SourceDeckSlides['slides'] = [];
    for (const section of document.deck.sections) {
      for (const id of section.slideIds) {
        const slide = document.slides[id];
        if (slide === undefined) continue;
        n += 1;
        slides.push({
          id,
          title: slideTitle(slide, n),
          n,
          ...(slide.skip === true ? { skip: true } : {}),
        });
      }
    }
    return {
      id: document.deck.id,
      title: document.deck.title,
      revision: document.deck.revision,
      slides,
    };
  });

export async function readSourceDeckSlides(input: {
  deckId: string;
}): Promise<SourceDeckSlides | null> {
  return sourceDeckSlidesFn({ data: input });
}

// ---------------------------------------------------------------------------------------------
// The rendered payload of /deck, /embed, /present and /print

export type GetDeckInput = {
  deckId: string;
  theme?: 'light' | 'dark';
  /**
   * carry the speaker notes: only /present (the presenter's own window) and /print's "1 slide
   * with notes" ask; the public view and embed payloads never carry them (SPEC 6.6)
   */
  notes?: boolean;
  /** carry the skipped slides, marked in `skipped`: /print asks so its toggle needs no refetch (SPEC 7.2.1) */
  includeSkipped?: boolean;
  /** serve a deck in the trash: /print and /present may; /deck and /embed answer 404 (SPEC 6.4) */
  includeTrashed?: boolean;
};

/**
 * The rendered deck for the viewer routes, or null when neither the deck nor the fixture exists,
 * and null for a deck in the trash unless asked (SPEC 6.4: `/deck/<id>` of a trashed deck answers
 * 404). The payload carries no speaker notes and no skipped slides unless the route asks for
 * them (R10 C3 item 1, SPEC 6.6), so a view or embed link exposes what the rep meant to share.
 */
export const getDeck = createServerFn({ method: 'GET' })
  .validator((input: GetDeckInput) => {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(input.deckId)) throw new Error('deckId must be a slug');
    return input;
  })
  .handler(async ({ data }): Promise<DeckPayload | null> => {
    const loaded = await loadDeck(data.deckId);
    if (!loaded) return null;
    if (isTrashed(loaded.document.deck) && data.includeTrashed !== true) return null;
    const theme = data.theme ?? deckAppearance(loaded.document.deck);
    const built = buildViewerDeck(data.deckId, loaded.servedId, loaded, {
      theme,
      notes: data.notes === true,
      includeSkipped: data.includeSkipped === true,
    });
    return {
      deck: built.deck,
      sprite: sprite(),
      issues: loaded.issues,
      skipped: built.skipped,
    };
  });
