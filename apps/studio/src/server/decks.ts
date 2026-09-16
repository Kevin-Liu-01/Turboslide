import { join } from 'node:path';

import { createServerFn } from '@tanstack/react-start';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';
import type { DeckTemplateId } from '@turboslide/schema/actions';
import { DECK_TEMPLATES } from '@turboslide/schema/actions';
import { deckAppearance, isTrashed, slideTitle } from '@turboslide/schema/deck';
import type { Appearance, DeckDocument } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { deckPage } from '@turboslide/schema/render';
import { slideHasMotion } from '@turboslide/schema/motion';
import { compileMotion, deckMediaLength } from '@turboslide/render/motion';
import { blockParagraphCount, motionTargets } from '@turboslide/schema/motion';
import { usedFontIds } from '@turboslide/fonts/used';
import { readTemplateIndex } from '@turboslide/store/templates';
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

import { htmlFrameFor } from '@turboslide/render/blocks/html-escape';

import type { AuthContext } from './authorize';
import { renderSlide } from './render';
import {
  createStoredDeck,
  deckCardFacts,
  ensureDecks,
  hostingFacts,
  isHosted,
  openDeckStore,
  listStoredDecks,
  repoRoot,
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

/** The author the home page writes as (Rename); the editor's default author (editor/EditorRoot.tsx). */
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
  /**
   * set when `slides: 'first'` left every slide after the first with an empty `html` (gslides-parity
   * SPEC-4 3.11): the viewer routes fetch the rest through `getDeckSlides` behind the document
   */
  partial?: true;
};

/** The rest of a partial payload (SPEC-4 3.11): rendered HTML by slide id for the slides the document left out. */
export type DeckSlidesPayload = {
  revision: number;
  html: Record<string, string>;
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
  /** render the HTML of the first slide alone, or of every slide but the first, or of all (SPEC-4 3.11) */
  slides?: 'all' | 'first' | 'rest';
  /** carry the speaker notes; off for the public view and embed payloads (SPEC 6.6, R10 C3 item 1) */
  notes: boolean;
  /** carry the skipped slides; off for the public payloads and present mode (SPEC 7.2.1) */
  includeSkipped: boolean;
  /** how an `html` block renders (gslides-parity SPEC-3 8.4): inside the sandboxed frame, or as its note */
  htmlPolicy: 'frame' | 'note';
  /** the theme's sheet.css text for the frame's variables; empty when the bundle has none */
  sheetCss: string;
};

let sheetCssCache: string | undefined;

/**
 * The theme's sheet.css text for the frame's variables, loaded once per process through
 * packages/render's theme-node (a node module, so the import is dynamic: this file is imported by
 * the pages for its client stubs and a module level node import would break the browser graph).
 */
async function sheetCss(): Promise<string> {
  if (sheetCssCache === undefined) {
    try {
      const { loadThemeBundle } = await import('@turboslide/render/theme-node');
      sheetCssCache = loadThemeBundle().sheetCss;
    } catch {
      sheetCssCache = '';
    }
  }
  return sheetCssCache;
}

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
      // the document carries the first slide's HTML alone when asked; the viewer fetches the rest
      // after it mounts (SPEC-4 3.11), and the request for the rest leaves the first slide out
      const wanted =
        options.slides === 'first'
          ? out.length === 0
          : options.slides === 'rest'
            ? out.length > 0
            : true;
      const rendered = wanted
        ? renderSlide(deck, slide, {
            theme: options.theme,
            chrome: true,
            assetBase,
            blockAttrs: true,
            gtWord: true,
            // every `html` block lands in the sandboxed frame (SPEC-3 8.4 item 2), or as its note
            htmlFrame: htmlFrameFor({
              theme: options.theme,
              assetUrl: (path: string) => assetBase + path,
              sheetCss: options.sheetCss,
              policy: options.htmlPolicy,
              publicStoreHost: process.env.TURBOSLIDE_PUBLIC_STORE_HOST ?? null,
            }),
          })
        : { html: '' };
      const asset = 'picture' in slide ? deck.assets[slide.picture.asset] : undefined;
      const picture =
        isPictureKind(slide.kind) && asset
          ? 'neutral' in asset.twins
            ? { light: assetBase + asset.twins.neutral, dark: assetBase + asset.twins.neutral }
            : { light: assetBase + asset.twins.light, dark: assetBase + asset.twins.dark }
          : undefined;
      /* round five (gslides-parity SPEC-5 2.2; b1.md request 6): the compiled schedule of a slide
         that moves rides in the payload, so the audience show, Auto-play and the presenter agree */
      const motion = slideHasMotion(slide)
        ? (() => {
            const targets = motionTargets(slide);
            const byId = new Map(targets.map((block) => [block.id, block]));
            return compileMotion(
              slide,
              targets,
              (blockId) => {
                const block = byId.get(blockId);
                return block === undefined ? 0 : blockParagraphCount(block);
              },
              deckMediaLength(deck, slide),
            );
          })()
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
        ...(motion === undefined ? {} : { motion }),
      });
    }
  }
  const kept = new Set(out.map((slide) => slide.id));
  return {
    deck: {
      id: requestedId,
      title: deck.title,
      revision: deck.revision,
      page: deckPage(deck),
      sections: deck.sections
        .map((section) => ({
          id: section.id,
          name: section.name,
          slideIds: section.slideIds.filter((id) => kept.has(id)),
        }))
        // a section whose every slide is skipped leaves the payload with them
        .filter((section) => section.slideIds.length > 0),
      slides: out,
      /* the catalog faces the document uses (SPEC-5-amendments A5 item 3; b7.md request 14) */
      fonts: usedFontIds(deck, Object.values(slides)),
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
  if (typeof value !== 'string') return false;
  if ((DECK_TEMPLATES as ReadonlyArray<string>).includes(value)) return true;
  /* round five (gslides-parity SPEC-5 4.1; b3.md B3-11): any slug of decks/templates/templates.json */
  try {
    return readTemplateIndex(join(repoRoot(), 'decks')).some((entry) => entry.id === value);
  } catch {
    return false;
  }
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
  .handler(async ({ data }): Promise<CreateDeckResult> => {
    // no deck yet, so no authorize(): the read only switch and the deck creates per day quota
    // (SPEC-3 8.3, 8.12); the owner of the new record is B2's `create(input, owner)` (day five)
    const { identityLabel, requestContext } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    const { assertQuota, tierOf } = await import('./ratelimit');
    const ctx = await requestContext();
    const identity = identityLabel(ctx) ?? 'anonymous';
    await assertFlag('readOnly', { identity, action: 'deck.create' });
    await assertQuota('deckCreatesPerDay', {
      identity,
      tier: tierOf(ctx),
      action: 'deck.create',
      transport: 'window',
    });
    const created = await createStoredDeck(data);
    // the record of SPEC-3 6.1: restricted, the creator its owner (VERIFICATION-3 finding 4)
    const { recordNewDeck } = await import('./access');
    await recordNewDeck(created.deckId, ctx);
    return created;
  });

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
    // authorize(rename) first (SPEC-3 6.2); the author is the session's, never the page's
    const { authorizeRequest } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    const { author } = await authorizeRequest(data.deckId, 'rename', {
      action: 'deck.rename',
      fallbackAuthor: HOME_AUTHOR,
    });
    await assertFlag('readOnly', { deckId: data.deckId, action: 'deck.rename' });
    const store = await openDeckStore(data.deckId);
    const baseRevision = data.baseRevision ?? (await store.revision());
    const outcome = await store.write({
      baseRevision,
      author,
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
    const { authorizeRequest, identityLabel } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    const { assertQuota, tierOf } = await import('./ratelimit');
    const { ctx } = await authorizeRequest(data.deckId, 'copy', { action: 'deck.copy' });
    await assertFlag('readOnly', { deckId: data.deckId, action: 'deck.copy' });
    await assertQuota('deckCreatesPerDay', {
      identity: identityLabel(ctx) ?? 'anonymous',
      tier: tierOf(ctx),
      action: 'deck.copy',
      transport: 'window',
    });
    const input: CopyDeckInput = {
      id: data.deckId,
      name: data.name,
      ...(data.slideIds !== undefined ? { slideIds: data.slideIds } : {}),
      ...(data.removeNotes === true ? { removeNotes: true } : {}),
    };
    const copied = await mapStale(async () => (await ensureDecks()).copy(input, data.baseRevision));
    // the copy is a new deck: restricted, the copier its owner (SPEC-3 6.1; VERIFICATION-3 finding 4)
    const { recordNewDeck } = await import('./access');
    await recordNewDeck(copied.deckId, ctx);
    return copied;
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
  .handler(async ({ data }): Promise<TrashState> => {
    const { authorizeRequest } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    await authorizeRequest(data.deckId, 'trash', { action: 'deck.trash' });
    await assertFlag('readOnly', { deckId: data.deckId, action: 'deck.trash' });
    return mapStale(async () => (await ensureDecks()).trash(data.deckId, data.baseRevision));
  });

export async function trashStoredDeck(input: DeckIdRequest): Promise<TrashState> {
  return trashDeckFn({ data: input });
}

/** Restore from the trash (`deck.restore`): the snackbar's Undo and the trash page's Restore. */
const restoreDeckFn = createServerFn({ method: 'POST' })
  .validator(validateDeckId)
  .handler(async ({ data }): Promise<TrashState> => {
    const { authorizeRequest } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    await authorizeRequest(data.deckId, 'restore', { action: 'deck.restore' });
    await assertFlag('readOnly', { deckId: data.deckId, action: 'deck.restore' });
    return mapStale(async () => (await ensureDecks()).restore(data.deckId, data.baseRevision));
  });

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
  .handler(async ({ data }): Promise<{ id: string; removed: true }> => {
    // owner only (SPEC-3 8.2 "removeStoredDeck by anyone" closed): the `remove` cell is the owner's
    const { authorizeRequest } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    await authorizeRequest(data.deckId, 'remove', { action: 'deck.remove' });
    await assertFlag('readOnly', { deckId: data.deckId, action: 'deck.remove' });
    return mapStale(async () => (await ensureDecks()).remove(data.deckId, data.baseRevision));
  });

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
    // a caller who may not read the deck learns nothing: one null for a missing and a restricted deck
    const { authorize, requestContext } = await import('./authorize');
    const ctx = await requestContext();
    const read = await authorize(ctx, data.deckId, 'read', {
      action: 'deck.details',
      transport: 'window',
    });
    if (!read.ok) return null;
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
    const { authorize, requestContext } = await import('./authorize');
    const ctx = await requestContext();
    const read = await authorize(ctx, data.deckId, 'read', {
      action: 'deck.slides',
      transport: 'window',
    });
    if (!read.ok) return null;
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
  /** `?p=` of the published player (gslides-parity SPEC-3 6.4): read in present mode and the embed only */
  publishToken?: string;
  /**
   * the HTML the payload carries (gslides-parity SPEC-4 3.11): every slide's (the default, print
   * and the presenter), or the first slide's alone, the rest fetched by `getDeckSlides`
   */
  slides?: 'all' | 'first';
  /**
   * the revision the caller learned from `deckRevision` (SPEC-4 3.11; PP 5 "The Blob read path"):
   * it names the document in the request's URL, so an answer the CDN keeps is never served for a
   * newer revision; an answer whose document moved past it is not kept
   */
  revision?: number;
};

/** The header of an answer the CDN may keep for a minute and serve stale for an hour (SPEC-4 3.11). */
export const DECK_CDN_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=3600';

/** Whether this handler answers a client's `/_serverFn/` request (a CDN entry) or the page's own render. */
function answersRpc(): boolean {
  try {
    return new URL(getRequest().url).pathname.startsWith('/_serverFn/');
  } catch {
    return false;
  }
}

/**
 * The cache header of a deck read (SPEC-4 3.11): kept by the CDN only when the request names the
 * revision the document is at, the reader reached the deck as anyone would (the general access
 * of the deck, `via: 'open'`, or the published player's token, which is in the URL) and the
 * payload is the public shape (no notes, no skipped slides, the html blocks as notes), so no
 * role's private shape is ever kept under a URL another reader may request. Everything else is
 * `private, no-store`. Set on the server function's own answer alone, never on the document the
 * loader renders in process.
 */
function setDeckCacheHeader(
  input: { revision?: number },
  shape: {
    notes: boolean;
    includeSkipped: boolean;
    htmlPolicy: 'frame' | 'note';
    via: string | null;
  },
  revision: number,
): void {
  if (!answersRpc()) return;
  const isPublicShape = !shape.notes && !shape.includeSkipped && shape.htmlPolicy === 'note';
  const cacheable =
    input.revision === revision &&
    isPublicShape &&
    (shape.via === 'open' || shape.via === 'publish');
  try {
    setResponseHeader('Cache-Control', cacheable ? DECK_CDN_CACHE_CONTROL : 'private, no-store');
  } catch {
    // outside a request (a test): nothing to set
  }
}

/** The payload shaped by role (SPEC-3 6.3): what the caller may read of notes and skipped slides. */
async function shapeByRole(
  ctx: AuthContext,
  deckId: string,
  input: GetDeckInput,
): Promise<{
  notes: boolean;
  includeSkipped: boolean;
  role: string;
  via: string | null;
  htmlPolicy: 'frame' | 'note';
}> {
  const { DeniedError, authorize, denialBody } = await import('./authorize');
  const { flagOn } = await import('./flags');
  const options = { transport: 'window' as const };
  const read = await authorize(ctx, deckId, 'read', { ...options, action: 'deck.view' });
  if (!read.ok) {
    // 410 travels to the page ("This presentation is no longer published"); 401 and 404 are one null
    if (read.status === 410) throw new DeniedError(410, denialBody(read, 'read'));
    return { notes: false, includeSkipped: false, role: 'none', via: null, htmlPolicy: 'note' };
  }
  const notes =
    input.notes === true &&
    (await authorize(ctx, deckId, 'readNotes', { ...options, action: 'deck.view' })).ok;
  const includeSkipped =
    input.includeSkipped === true &&
    (await authorize(ctx, deckId, 'readSkipped', { ...options, action: 'deck.view' })).ok;
  // the html block policy of SPEC-3 8.4: the owner and an unshared deck see the frame; a link or
  // publish visitor sees the note unless the owner's switch is on (the record's settings, through
  // B2's access store, are read by the shadow role's via until the store binds: `open`, `link`
  // and `publish` count as shared beyond the owner)
  const shared = read.via === 'link' || read.via === 'publish';
  const htmlPolicy: 'frame' | 'note' =
    (await flagOn('htmlBlocks')) === false ? 'note' : shared ? 'note' : 'frame';
  return { notes, includeSkipped, role: read.role, via: read.via ?? null, htmlPolicy };
}

type ShapedLoad = {
  loaded: Loaded;
  shape: Awaited<ReturnType<typeof shapeByRole>>;
  theme: 'light' | 'dark';
  holdsHtml: boolean;
};

/**
 * The authorize, the read and the theme every viewer payload starts from: null for a caller
 * without a right, a missing deck or a deck in the trash the route did not ask for (one answer
 * for a missing and a restricted deck, SPEC-3 6.2, 6.3).
 */
async function loadShaped(data: GetDeckInput): Promise<ShapedLoad | null> {
  const { requestContext } = await import('./authorize');
  const ctx = await requestContext();
  if (data.publishToken !== undefined) ctx.publishToken = data.publishToken;
  const shape = await shapeByRole(ctx, data.deckId, data);
  if (shape.role === 'none') return null;
  const loaded = await loadDeck(data.deckId);
  if (!loaded) return null;
  if (isTrashed(loaded.document.deck) && data.includeTrashed !== true) return null;
  // the parser loads once per process, only when the deck holds an html block (SPEC-3 8.4)
  const holdsHtml = Object.values(loaded.document.slides).some((slide) =>
    JSON.stringify(slide).includes('"type":"html"'),
  );
  if (holdsHtml) {
    const { loadPurifier } = await import('@turboslide/render/blocks/html-escape');
    await loadPurifier().catch(() => undefined);
  }
  const theme = data.theme ?? deckAppearance(loaded.document.deck);
  return { loaded, shape, theme, holdsHtml };
}

const deckInputValidator = (input: GetDeckInput): GetDeckInput => {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(input.deckId)) throw new Error('deckId must be a slug');
  if (input.publishToken !== undefined && !/^[A-Za-z0-9_-]{16,64}$/.test(input.publishToken))
    throw new Error('publishToken must be a token');
  if (input.revision !== undefined && (!Number.isInteger(input.revision) || input.revision < 0))
    throw new Error('revision must be a non negative integer');
  if (input.slides !== undefined && input.slides !== 'all' && input.slides !== 'first')
    throw new Error("slides must be 'all' or 'first'");
  return input;
};

/**
 * The revision a deck is at (gslides-parity SPEC-4 3.11; PP 5 "The Blob read path"), read from
 * the manifest after the store synced it (on Blob the open pulls a moved manifest); null for a
 * missing deck. The viewer routes read it first so the `getDeck` and `getDeckSlides` requests
 * carry the revision in their URL, which is the CDN key.
 */
export const deckRevision = createServerFn({ method: 'GET' })
  .validator((input: { deckId: string }) => {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(input.deckId)) throw new Error('deckId must be a slug');
    return input;
  })
  .handler(async ({ data }): Promise<{ revision: number } | null> => {
    if (answersRpc()) {
      try {
        setResponseHeader('Cache-Control', 'private, no-store');
      } catch {
        // outside a request: nothing to set
      }
    }
    const candidates = [data.deckId];
    if (!isHosted() && data.deckId !== FALLBACK_DECK) candidates.push(FALLBACK_DECK);
    for (const servedId of candidates) {
      try {
        return { revision: await (await openDeckStore(servedId)).revision() };
      } catch (error) {
        if (error instanceof RangeError || error instanceof TypeError) continue;
        throw error;
      }
    }
    return null;
  });

/**
 * The rendered deck for the viewer routes, or null when neither the deck nor the fixture exists,
 * and null for a deck in the trash unless asked (SPEC 6.4: `/deck/<id>` of a trashed deck answers
 * 404). The payload carries no speaker notes and no skipped slides unless the route asks for
 * them (R10 C3 item 1, SPEC 6.6), so a view or embed link exposes what the rep meant to share.
 */
export const getDeck = createServerFn({ method: 'GET' })
  .validator(deckInputValidator)
  .handler(async ({ data }): Promise<DeckPayload | null> => {
    // authorize(read) first, the payload shaped by role (SPEC-3 6.2, 6.3): a caller without a
    // right gets null (the You need access page, one answer for a missing and a restricted deck)
    const shaped = await loadShaped(data);
    if (shaped === null) return null;
    const { loaded, shape, theme, holdsHtml } = shaped;
    setDeckCacheHeader(data, shape, loaded.document.deck.revision);
    const built = buildViewerDeck(data.deckId, loaded.servedId, loaded, {
      theme,
      slides: data.slides ?? 'all',
      notes: shape.notes,
      includeSkipped: shape.includeSkipped,
      htmlPolicy: shape.htmlPolicy,
      sheetCss: holdsHtml ? await sheetCss() : '',
    });
    return {
      deck: built.deck,
      sprite: sprite(),
      issues: loaded.issues,
      skipped: built.skipped,
      ...(data.slides === 'first' && built.deck.slides.length > 1 ? { partial: true } : {}),
    };
  });

/**
 * The HTML of every slide but the first (gslides-parity SPEC-4 3.11): the viewer asks for it once
 * it has mounted, through this GET the CDN keeps under the revision's URL, so /deck and /embed
 * carry one slide's markup and the sidebar's clones and the grid fill in when this answers (the
 * round four fixer moved the call out of the loader, where the router had streamed the answer
 * inside the document; VERIFICATION-4 finding 6). The same authorize and the same shape as
 * `getDeck`, so a reader gets the slides the payload would have carried and nothing more; null
 * for the caller who gets null there.
 */
export const getDeckSlides = createServerFn({ method: 'GET' })
  .validator(deckInputValidator)
  .handler(async ({ data }): Promise<DeckSlidesPayload | null> => {
    const shaped = await loadShaped(data);
    if (shaped === null) return null;
    const { loaded, shape, theme, holdsHtml } = shaped;
    setDeckCacheHeader(data, shape, loaded.document.deck.revision);
    const built = buildViewerDeck(data.deckId, loaded.servedId, loaded, {
      theme,
      slides: 'rest',
      notes: shape.notes,
      includeSkipped: shape.includeSkipped,
      htmlPolicy: shape.htmlPolicy,
      sheetCss: holdsHtml ? await sheetCss() : '',
    });
    const html: Record<string, string> = {};
    for (const slide of built.deck.slides) if (slide.html !== '') html[slide.id] = slide.html;
    return { revision: loaded.document.deck.revision, html };
  });
