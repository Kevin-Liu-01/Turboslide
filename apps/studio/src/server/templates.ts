import { createServerFn } from '@tanstack/react-start';
import type { TemplateIndexEntry } from '@turboslide/schema/building-blocks';
import { TEMPLATE_CATEGORIES } from '@turboslide/schema/building-blocks';
import type { Appearance, DeckDocument } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { CreateDeckResult } from '@turboslide/store/templates';

/**
 * The templates' server side (gslides-parity SPEC-5 4.1 to 4.6; MILESTONES-5 B3 day 7): the
 * index rows with a rendered cover per template for the gallery page (/decks/templates) and the
 * home page's strip, and `createFromTemplate`, the deck.create of any id of the index through the
 * store's collection (the same `createDeck` the CLI and the MCP server run; the widened
 * `isTemplateId` of server/decks.ts is the integrator's line, b3.md request B3-11, so this
 * function checks the id against the index itself). The covers render on the server through
 * `@turboslide/render/slide` over the template's own document, so a template needs no deck id and
 * no thumbnail route; a cover with a picture draws without it (the templates' covers are title
 * slides). createServerFn lives only under apps/studio/src/server (SPEC 3.3 item 4).
 */
export type TemplateCard = Omit<TemplateIndexEntry, 'cover'> & {
  /** the cover slide's id, the index row's `cover` */
  coverSlide?: string;
  /** the cover slide's HTML in the light appearance, for a LiveClone; null when the folder cannot be read */
  cover: string | null;
  /** the same in the dark appearance */
  coverDark: string | null;
};

export type TemplateGallery = {
  cards: TemplateCard[];
  /** the gallery's headings in Google's order, each with its cards */
  groups: { category: (typeof TEMPLATE_CATEGORIES)[number]; cards: TemplateCard[] }[];
};

/**
 * A template folder as a validated document: the manifest and the slide files (the same reading
 * `@turboslide/import/lane-node` `templateDocument` does; repeated here because the studio does
 * not depend on the import package yet, b3.md request B3-22).
 */
async function templateDocument(decksDir: string, templateId: string): Promise<DeckDocument> {
  const { existsSync, readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { readTemplate, templatesDir } = await import('@turboslide/store/templates');
  const { parseJson } = await import('@turboslide/schema/json');
  const { validateDeck } = await import('@turboslide/schema/validate');
  const template = readTemplate(join(templatesDir(decksDir), templateId));
  const manifestPath = join(template.dir, template.record.deck);
  const slidesDir = join(template.dir, template.record.slides);
  const deck = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  const slides = existsSync(slidesDir)
    ? readdirSync(slidesDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) =>
          parseJson(readFileSync(join(slidesDir, name), 'utf8'), join(slidesDir, name)),
        )
    : [];
  const result = validateDeck({ deck, slides });
  if (!result.ok || result.deck === null)
    throw new TypeError(`The template ${templateId} does not validate`);
  return { deck: result.deck, slides: result.slides };
}

const listTemplateGalleryFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TemplateGallery> => {
    const { ensureDecks } = await import('./root');
    const { readTemplateIndex } = await import('@turboslide/store/templates');
    const { renderSlide } = await import('./render');
    const decks = await ensureDecks();
    const rows = readTemplateIndex(decks.decksDir);
    const cards: TemplateCard[] = [];
    for (const row of rows) {
      let cover: string | null = null;
      let coverDark: string | null = null;
      try {
        const document = await templateDocument(decks.decksDir, row.id);
        const slideId = row.cover ?? document.deck.sections[0]?.slideIds[0];
        const slide = slideId === undefined ? undefined : document.slides[slideId];
        if (slide !== undefined) {
          const draw = (theme: Appearance): string =>
            renderSlide(document.deck, slide, {
              theme,
              chrome: false,
              assetBase: '',
              blockAttrs: false,
              gtWord: false,
              prompts: true,
            }).html;
          cover = draw('light');
          coverDark = draw('dark');
        }
      } catch {
        // a template folder that cannot be read draws as a plate with its name
      }
      const { cover: coverSlide, ...rest } = row;
      cards.push({
        ...rest,
        ...(coverSlide !== undefined ? { coverSlide } : {}),
        cover,
        coverDark,
      });
    }
    const groups = TEMPLATE_CATEGORIES.map((category) => ({
      category,
      cards: cards.filter((card) => card.category === category),
    })).filter((group) => group.cards.length > 0);
    return { cards, groups };
  },
);

/** The gallery's rows with their covers (the /decks/templates loader and the home strip). */
export async function listTemplateGallery(): Promise<TemplateGallery> {
  return listTemplateGalleryFn();
}

export type CreateFromTemplateInput = { from: string; name?: string };

const createFromTemplateFn = createServerFn({ method: 'POST' })
  .validator((input: CreateFromTemplateInput): CreateFromTemplateInput => {
    if (typeof input.from !== 'string' || !SLUG_PATTERN.test(input.from))
      throw new TypeError('from must be a template id (a slug)');
    if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim() === ''))
      throw new TypeError('name must be a non-empty string');
    return { from: input.from, ...(input.name !== undefined ? { name: input.name } : {}) };
  })
  .handler(async ({ data }): Promise<CreateDeckResult> => {
    const { identityLabel, requestContext } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    const { assertQuota, tierOf } = await import('./ratelimit');
    const { createStoredDeck, ensureDecks } = await import('./root');
    const { isKnownTemplateId, readTemplateIndex } = await import('@turboslide/store/templates');
    const decks = await ensureDecks();
    if (!isKnownTemplateId(decks.decksDir, data.from))
      throw new RangeError(`No template "${data.from}" in the index`);
    const row = readTemplateIndex(decks.decksDir).find((entry) => entry.id === data.from);
    const name = data.name ?? row?.name ?? data.from;
    const ctx = await requestContext();
    const identity = identityLabel(ctx) ?? 'anonymous';
    await assertFlag('readOnly', { identity, action: 'deck.create' });
    await assertQuota('deckCreatesPerDay', {
      identity,
      tier: tierOf(ctx),
      action: 'deck.create',
      transport: 'window',
    });
    // a fresh id per copy: the slug of the name with a short stamp, so two copies of one template never collide
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.random().toString(36).slice(2, 6);
    const created = await createStoredDeck({
      name,
      from: data.from as never,
      id: `${slugOf(name)}-${stamp}-${suffix}`,
    });
    const { recordNewDeck } = await import('./access');
    await recordNewDeck(created.deckId, ctx);
    return created;
  });

function slugOf(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug === '' ? 'presentation' : slug;
}

/** A new deck from any template of the index (the gallery's cards, the home strip). */
export async function createFromTemplate(
  input: CreateFromTemplateInput,
): Promise<CreateDeckResult> {
  return createFromTemplateFn({ data: input });
}
