import { createServerFn } from '@tanstack/react-start';
import type { TemplateIndexEntry } from '@turboslide/schema/actions';
import type { Appearance } from '@turboslide/schema/deck';
import { deckAppearance } from '@turboslide/schema/deck';
import { SLUG_PATTERN, slugify } from '@turboslide/schema/ids';
import type { HostingFacts } from '@turboslide/store/hosted';
import type {
  CreateDeckResult,
  DefaultKit,
  TemplateWriteResult,
} from '@turboslide/store/templates';
import { spriteMarkup } from '@turboslide/theme/sprite';

import type { AuthContext } from './authorize';

/**
 * The templates' server side (docs/PRODUCT.md 4.3; gslides-parity SPEC-5 4.1, ported from the
 * round five branch's server/templates.ts and re pointed at the product round's index): the
 * gallery rows with a rendered cover per template for /decks/templates and the /decks strip,
 * `createFromTemplate` (deck.create over any id of the index through the store's collection, the
 * same `createDeck` the CLI and the MCP server run), `saveDeckAsTemplate` (File > Save as
 * template, the store's `saveTemplate` under the deck's copy right), and the gallery card menu's
 * `renameTemplate`, `deleteTemplate` and `setDefaultTemplate` (Use for new presentations). The
 * covers render on the server through `@turboslide/render/slide` over the template's own
 * document, in the appearance a deck made from it opens in, so a template needs no deck id and no
 * thumbnail route; a cover's pictures draw as empty plates until the template asset route of
 * build/b5b.md lands (the request to the integrator), because a template folder's twins are not
 * served by /decks/<id>/assets. createServerFn lives only under apps/studio/src/server (SPEC 3.3
 * item 4). Every write goes through the collection's folder (`ensureDecks().decksDir`), so the
 * file and tmp stores persist it; on the blob tier the folder lives in this instance's overlay
 * until the collection pushes template folders (b5b.md, the request to B7 and the integrator).
 */
/**
 * One gallery card: the index row without its kit record (the kit travels through `template.list`
 * and the store, never the page's loader, whose payload must be plain JSON), the rendered cover,
 * the appearance it is drawn in, whether the template carries a kit and whether it is the default.
 */
export type TemplateCard = Omit<TemplateIndexEntry, 'brand'> & {
  /** the cover slide's HTML in `coverAppearance`, for a LiveClone; null when the folder cannot be read */
  coverHtml: string | null;
  /** the appearance the cover is drawn in and a deck made from the template opens in */
  coverAppearance: Appearance;
  /** true when the template carries a brand kit record (docs/PRODUCT.md 4.1) */
  hasKit: boolean;
  /** true on the template new presentations start from */
  isDefault: boolean;
};

export type TemplateGallery = {
  /** the templates saved on this deployment, the default first (docs/PRODUCT.md 4.3) */
  organisation: TemplateCard[];
  /** Turboslide's own templates: Blank this round */
  turboslide: TemplateCard[];
  /** the id new presentations start from; `blank` when no default is set */
  default: string;
  defaultName: string;
  /** the store the templates live on; a saved template persists across instances on file and tmp alone this round */
  store: HostingFacts['store'];
  /** the theme's icon sprite, mounted once on the page so a cover's `<use href="#gt-mark">` draws (SPEC 5.1) */
  sprite: string;
};

/** A transparent pixel: a cover's pictures load as empty plates instead of broken image glyphs. */
const EMPTY_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** The one sentence a refused agent write answers. */
const ADMIN_SCOPE_NEEDED =
  'An agent token needs the admin scope to change the templates of this Turboslide';

function requireSlug(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value))
    throw new TypeError(`${name} must be a slug`);
  return value;
}

function requireName(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 120)
    throw new TypeError(`${name} must be a sentence of up to 120 characters`);
  return value;
}

function optionalSentence(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 400)
    throw new TypeError(`${name} must be up to 400 characters`);
  return value;
}

/**
 * The gate of a template write that names no deck (rename, delete, use for new presentations):
 * the read only switch, and an agent token carrying the admin scope; a person editing on this
 * deployment passes, because the marketer's lock is the template itself and a role that gates it
 * comes with sign in (docs/PRODUCT.md 4.1 "Who can change the kit").
 */
async function requireTemplateWriter(action: string): Promise<AuthContext> {
  const { identityLabel, requestContext } = await import('./authorize');
  const { assertFlag } = await import('./flags');
  const ctx = await requestContext();
  const identity = identityLabel(ctx) ?? 'anonymous';
  await assertFlag('readOnly', { identity, action });
  if (ctx.agent !== undefined && !ctx.agent.scopes.includes('admin'))
    throw new TypeError(ADMIN_SCOPE_NEEDED);
  return ctx;
}

const listTemplateGalleryFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TemplateGallery> => {
    const { ensureDecks, hostingFacts } = await import('./root');
    const { readDefaultTemplateId, readTemplateIndex, templateDocument } =
      await import('@turboslide/store/templates');
    const { renderSlide } = await import('./render');
    const decks = await ensureDecks();
    // the saved templates of the other instances first (one head when nothing moved; FR2)
    await decks.templates.pull();
    const rows = readTemplateIndex(decks.decksDir);
    const defaultId = readDefaultTemplateId(decks.decksDir);
    const cards: TemplateCard[] = rows.map((entry) => {
      const { brand, ...row } = entry;
      let coverHtml: string | null = null;
      let coverAppearance: Appearance = row.appearance ?? 'dark';
      try {
        const document = templateDocument(decks.decksDir, row.id);
        coverAppearance = row.appearance ?? deckAppearance(document.deck);
        const slideId = row.cover ?? document.deck.sections[0]?.slideIds[0];
        const slide = slideId === undefined ? undefined : document.slides[slideId];
        if (slide !== undefined) {
          coverHtml = renderSlide(document.deck, slide, {
            theme: coverAppearance,
            chrome: false,
            assetBase: '',
            assetSrc: () => EMPTY_PIXEL,
            blockAttrs: false,
            gtWord: false,
            prompts: true,
          }).html;
        }
      } catch {
        // a template folder that cannot be read draws as a plate with its name
      }
      return {
        ...row,
        coverHtml,
        coverAppearance,
        hasKit: brand !== undefined,
        isDefault: row.id === defaultId,
      };
    });
    const byDefaultFirst = (a: TemplateCard, b: TemplateCard): number =>
      Number(b.isDefault) - Number(a.isDefault);
    const organisation = cards.filter((card) => card.organisation === true).sort(byDefaultFirst);
    const turboslide = cards.filter((card) => card.organisation !== true);
    const facts = hostingFacts();
    return {
      organisation,
      turboslide,
      default: defaultId,
      defaultName: cards.find((card) => card.id === defaultId)?.name ?? defaultId,
      store: facts.store,
      sprite: spriteMarkup(),
    };
  },
);

/** The gallery's rows with their covers (the /decks/templates loader and the /decks strip). */
export async function listTemplateGallery(): Promise<TemplateGallery> {
  return listTemplateGalleryFn();
}

/* the kit travels as JSON text, the way write.ts readDraftDeckFn carries the draft: the framework's
   serializable check does not read through B5a's BrandKit (its hex colour and tuple types) */
const readDefaultKitFn = createServerFn({ method: 'GET' }).handler(async (): Promise<string> => {
  const { ensureDecks } = await import('./root');
  const { readDefaultKit } = await import('@turboslide/store/templates');
  const decks = await ensureDecks();
  await decks.templates.pull();
  return JSON.stringify(readDefaultKit(decks.decksDir));
});

/**
 * What the deployment's default kit is named and looks like (docs/PRODUCT.md 4.1 "The deployment
 * default"; B5a's `DefaultKit` with the template it comes from): the template /new and the Blank
 * card start from, the kit's name for "Reset to <name>", the appearance a new presentation opens
 * in and the kit record itself. The request to the integrator in build/b5b.md has `readDraftDeck`
 * and the first write of /new read the template through `readDefaultTemplateId`.
 */
export async function readDeploymentDefaultKit(): Promise<DefaultKit> {
  return JSON.parse(await readDefaultKitFn()) as DefaultKit;
}

export type CreateFromTemplateInput = {
  /** a template id of the index */
  from: string;
  /** the deck title; the template's name when absent */
  name?: string;
};

/** The deck id a copy of a template takes: the slug of the name with a short stamp, so two copies never collide. */
export function deckIdForTemplateCopy(name: string, now: Date = new Date()): string {
  const slug = slugify(name).slice(0, 40).replace(/-+$/g, '');
  const stamp = now.getTime().toString(36);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug === '' ? 'presentation' : slug}-${stamp}${suffix}`;
}

const createFromTemplateFn = createServerFn({ method: 'POST' })
  .validator((input: CreateFromTemplateInput): CreateFromTemplateInput => {
    const from = requireSlug(input.from, 'from');
    if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim() === ''))
      throw new TypeError('name must be a non-empty string');
    return { from, ...(input.name !== undefined ? { name: input.name } : {}) };
  })
  .handler(async ({ data }): Promise<CreateDeckResult> => {
    const { identityLabel, requestContext } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    const { assertQuota, tierOf } = await import('./ratelimit');
    const { createStoredDeck, ensureDecks } = await import('./root');
    const { isKnownTemplateId, templateEntry } = await import('@turboslide/store/templates');
    const decks = await ensureDecks();
    await decks.templates.pull();
    if (!isKnownTemplateId(decks.decksDir, data.from))
      throw new RangeError(`No template "${data.from}" on this Turboslide`);
    const row = templateEntry(decks.decksDir, data.from);
    const name = (data.name ?? row?.name ?? data.from).trim();
    // no deck yet, so no authorize(): the read only switch and the deck creates per day quota
    // (SPEC-3 8.3, 8.12), the way server/decks.ts createDeckFn gates deck.create
    const ctx = await requestContext();
    const identity = identityLabel(ctx) ?? 'anonymous';
    await assertFlag('readOnly', { identity, action: 'deck.create' });
    await assertQuota('deckCreatesPerDay', {
      identity,
      tier: tierOf(ctx),
      action: 'deck.create',
      transport: 'window',
    });
    const created = await createStoredDeck({
      name,
      from: data.from,
      id: deckIdForTemplateCopy(name),
    });
    // the record of SPEC-3 6.1: the creator its owner (VERIFICATION-3 finding 4)
    const { recordNewDeck } = await import('./access');
    await recordNewDeck(created.deckId, ctx);
    return created;
  });

/** A new deck from any template of the index (the gallery's cards, the /decks strip). */
export async function createFromTemplate(
  input: CreateFromTemplateInput,
): Promise<CreateDeckResult> {
  return createFromTemplateFn({ data: input });
}

export type SaveDeckAsTemplateInput = {
  deckId: string;
  name: string;
  sentence?: string;
};

const saveDeckAsTemplateFn = createServerFn({ method: 'POST' })
  .validator((input: SaveDeckAsTemplateInput): SaveDeckAsTemplateInput => {
    const deckId = requireSlug(input.deckId, 'deckId');
    const name = requireName(input.name, 'name');
    const sentence = optionalSentence(input.sentence, 'sentence');
    return { deckId, name, ...(sentence !== undefined ? { sentence } : {}) };
  })
  .handler(async ({ data }): Promise<TemplateWriteResult> => {
    const { authorize, identityLabel, requestContext } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    const { ensureDecks, openDeckStore } = await import('./root');
    const { saveTemplate } = await import('@turboslide/store/templates');
    const ctx = await requestContext();
    // saving a deck as a template is a copy of it (the `copy` capability of SPEC-3 6.7)
    const decision = await authorize(ctx, data.deckId, 'copy', {
      action: 'template.create',
      transport: 'window',
    });
    if (!decision.ok) throw new TypeError('You cannot save this presentation as a template');
    const identity = identityLabel(ctx) ?? 'anonymous';
    await assertFlag('readOnly', { identity, action: 'template.create', deckId: data.deckId });
    const decks = await ensureDecks();
    // the store syncs the deck's folder first, so the blob tier saves the deck at its head
    await openDeckStore(data.deckId);
    await decks.ensureAssets(data.deckId);
    // a name another instance's template carries replaces that template: its index first
    await decks.templates.pull();
    const result = await saveTemplate(decks.decksDir, {
      deckId: data.deckId,
      name: data.name,
      ...(data.sentence !== undefined ? { sentence: data.sentence } : {}),
    });
    // the folder and the index to the store, so every instance's gallery lists it (FR2); a push
    // the store refuses fails the call, and the next pull removes the local copy
    await decks.templates.push({ id: result.id });
    return result;
  });

/**
 * File > Save as template for the studio: the store's `saveTemplate` over the collection's folder
 * under the deck's copy right. A name an organisation template already carries replaces it and
 * keeps its slug (`replaced: true`); the dialog says so before the click.
 */
export async function saveDeckAsTemplate(
  input: SaveDeckAsTemplateInput,
): Promise<TemplateWriteResult> {
  return saveDeckAsTemplateFn({ data: input });
}

const renameTemplateFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; name: string }) => ({
    id: requireSlug(input.id, 'id'),
    name: requireName(input.name, 'name'),
  }))
  .handler(async ({ data }): Promise<TemplateWriteResult> => {
    await requireTemplateWriter('template.rename');
    const { ensureDecks } = await import('./root');
    const { renameTemplate } = await import('@turboslide/store/templates');
    const decks = await ensureDecks();
    await decks.templates.pull();
    const result = await renameTemplate(decks.decksDir, data);
    await decks.templates.push({ id: data.id });
    return result;
  });

/** Rename on the gallery card's menu (`template.rename`): the id and the folder stay. */
export async function renameStoredTemplate(input: {
  id: string;
  name: string;
}): Promise<TemplateWriteResult> {
  return renameTemplateFn({ data: input });
}

const deleteTemplateFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => ({ id: requireSlug(input.id, 'id') }))
  .handler(async ({ data }): Promise<{ id: string; removed: true }> => {
    await requireTemplateWriter('template.delete');
    const { ensureDecks } = await import('./root');
    const { deleteTemplate } = await import('@turboslide/store/templates');
    const decks = await ensureDecks();
    await decks.templates.pull();
    const result = await deleteTemplate(decks.decksDir, data);
    await decks.templates.push({ id: data.id, removed: true });
    return result;
  });

/** Delete on the gallery card's menu (`template.delete`), after the page's confirm; the default is refused. */
export async function deleteStoredTemplate(input: {
  id: string;
}): Promise<{ id: string; removed: true }> {
  return deleteTemplateFn({ data: input });
}

const setDefaultTemplateFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => ({ id: requireSlug(input.id, 'id') }))
  .handler(async ({ data }): Promise<{ default: string; name: string }> => {
    await requireTemplateWriter('template.setDefault');
    const { ensureDecks } = await import('./root');
    const { setDefaultTemplate } = await import('@turboslide/store/templates');
    const decks = await ensureDecks();
    await decks.templates.pull();
    const result = await setDefaultTemplate(decks.decksDir, data.id);
    await decks.templates.push();
    return result;
  });

/**
 * Use for new presentations (`template.setDefault`): /new and the Blank card start from this
 * template from now on, and every Reset and default logo read its kit; `blank` restores the
 * blank deck.
 */
export async function useTemplateForNew(input: {
  id: string;
}): Promise<{ default: string; name: string }> {
  return setDefaultTemplateFn({ data: input });
}
