// The read actions of the hosted agent surface (SPEC 7.1: deck.info, slide.list, slide.get,
// lint.run, validate.run) as handlers over a loaded document, framework free, so the studio's
// HTTP and MCP transports register one implementation. The host supplies the document (the
// store's normalized read), the render records the rendered lint layer and slide.get consult, the
// theme's copy lists, and the deck directories validate.run may read. The CLI keeps its own read
// handlers over deck-files.ts (apps/cli/src/commands/mcp.ts); the outputs are the same shapes
// because both are checked against the action table's output schemas by the dispatcher.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { lintDeck, lintStatic, countsBySlide } from '@turboslide/lint/run';
import type { LintLayers } from '@turboslide/lint/run';
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideOrder, slideTitle } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { RenderRecord } from '@turboslide/schema/render';
import type { RuleId } from '@turboslide/schema/rules';
import { validateDeck } from '@turboslide/schema/validate';

import type { Dispatcher } from '../dispatch.ts';

export type LintLists = {
  properNouns: readonly string[];
  tokens: readonly string[];
  iconNames: readonly string[];
};

export type SlideIds = 'all' | string[];

export type ReaderDeps = {
  /** The current normalized document. */
  load: () => Promise<DeckDocument> | DeckDocument;
  /** The theme's copy lists and icon names (SPEC 5.1 copy.ts). */
  lint: LintLists;
  /** The render records of the current revision the rendered layer and slide.get read; none skips that layer. */
  renderRecords?: (document: DeckDocument) => Promise<RenderRecord[]> | RenderRecord[];
  /**
   * The deck directory validate.run reads for a `path`; RangeError for a path this instance does
   * not serve. Absent, validate.run validates the loaded document only and refuses a path.
   */
  deckDirFor?: (path: string) => string;
};

export type OutlineSection = {
  id: string;
  name: string;
  slides: { id: string; n: number; title: string; kind: Slide['kind'] }[];
};

/** Sections with their slides numbered and titled, the `sections` of deck.info. */
export function outlineOf(document: DeckDocument): OutlineSection[] {
  let n = 0;
  return document.deck.sections.map((section) => ({
    id: section.id,
    name: section.name,
    slides: section.slideIds.flatMap((id) => {
      const slide = document.slides[id];
      if (slide === undefined) return [];
      n += 1;
      return [{ id, n, title: slideTitle(slide, n), kind: slide.kind }];
    }),
  }));
}

export function htmlBlockCount(document: DeckDocument): number {
  let count = 0;
  for (const slide of Object.values(document.slides))
    for (const { block } of slideBlocks(slide)) if (block.type === 'html') count += 1;
  return count;
}

/** Asset ids a slide references: the picture and every `asset` or `assets` field in its blocks. */
export function assetIdsOf(slide: Slide): string[] {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'asset' && typeof item === 'string') ids.add(item);
      else if (key === 'assets' && Array.isArray(item))
        item.forEach((id) => typeof id === 'string' && ids.add(id));
      else walk(item);
    }
  };
  walk(slide);
  return [...ids];
}

export function requireSlide(document: DeckDocument, slideId: string): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

/** The slide ids a selection names, in deck order; RangeError for an unknown id. */
export function selectIds(document: DeckDocument, slideIds: SlideIds): string[] {
  const order = slideOrder(document.deck);
  if (slideIds === 'all') return order;
  for (const id of slideIds) requireSlide(document, id);
  return order.filter((id) => slideIds.includes(id));
}

export function lintSelection(
  document: DeckDocument,
  records: readonly RenderRecord[],
  lists: LintLists,
  options: { slideIds: SlideIds; layers?: LintLayers; rule?: RuleId },
): Finding[] {
  const ids = selectIds(document, options.slideIds);
  return lintDeck(document, records, {
    layers: options.layers ?? 'both',
    ...(options.rule !== undefined ? { rules: [options.rule] } : {}),
    ...(options.slideIds === 'all' ? {} : { slideIds: ids }),
    ...lists,
  });
}

export type ValidateIssue = {
  code: string;
  severity: 1 | 2 | 3;
  file: string;
  pointer: string;
  message: string;
};

export type ValidateOutput = { ok: boolean; issues: ValidateIssue[]; revision: number | null };

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** validate.run over a deck directory: the listed files, the orphans and the validator's issues. */
export function validateDeckDir(dir: string): ValidateOutput {
  const manifestPath = join(dir, 'deck.json');
  if (!existsSync(manifestPath)) throw new RangeError(`No deck.json in ${dir}`);
  const rawDeck = readJson(manifestPath) as { sections?: { slideIds?: unknown }[] };
  const order = Array.isArray(rawDeck.sections)
    ? rawDeck.sections.flatMap((section) =>
        Array.isArray(section.slideIds)
          ? section.slideIds.filter((id): id is string => typeof id === 'string')
          : [],
      )
    : [];
  const slidesDir = join(dir, 'slides');
  const slides: Record<string, unknown> = {};
  const issues: ValidateIssue[] = [];
  for (const id of order) {
    const path = join(slidesDir, `${id}.json`);
    if (!existsSync(path)) {
      issues.push({
        code: 'missing_file',
        severity: 3,
        file: `slides/${id}.json`,
        pointer: '',
        message: `slides/${id}.json is listed in deck.json but missing`,
      });
      continue;
    }
    slides[id] = readJson(path);
  }
  if (existsSync(slidesDir)) {
    for (const file of readdirSync(slidesDir)) {
      if (!file.endsWith('.json')) continue;
      const id = basename(file, '.json');
      if (order.includes(id)) continue;
      issues.push({
        code: 'unlisted',
        severity: 2,
        file: `slides/${id}.json`,
        pointer: '',
        message: `slides/${id}.json is not listed in any section`,
      });
    }
  }
  const result = validateDeck({ deck: rawDeck, slides });
  for (const issue of result.issues) {
    issues.push({
      code: issue.code,
      severity: issue.severity,
      file: issue.file,
      pointer: issue.pointer,
      message: issue.message,
    });
  }
  return {
    ok: result.ok && !issues.some((issue) => issue.severity === 3),
    issues,
    revision: result.deck?.revision ?? null,
  };
}

/** validate.run over an already loaded document (a store read): the validator's issues alone. */
export function validateLoaded(document: DeckDocument): ValidateOutput {
  const result = validateDeck({ deck: document.deck, slides: document.slides });
  return {
    ok: result.ok,
    issues: result.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      file: issue.file,
      pointer: issue.pointer,
      message: issue.message,
    })),
    revision: result.deck?.revision ?? null,
  };
}

export type DeckInfo = {
  id: string;
  title: string;
  theme: Deck['theme'];
  revision: number;
  sections: OutlineSection[];
  counts: {
    slides: number;
    sections: number;
    assets: number;
    htmlBlocks: number;
    /** slides with skip set, left out of the slideshow and the downloads unless asked */
    skipped: number;
  };
  /** the deck's defaults as written (gslides-parity SPEC 7.2.3, 7.2.4); absent when none is set */
  defaults?: Deck['defaults'];
  /** the trash stamp (gslides-parity SPEC 7.2.5); absent unless the deck is in the trash */
  trashedAt?: string;
};

export function deckInfo(document: DeckDocument): DeckInfo {
  const order = slideOrder(document.deck).filter((id) => document.slides[id] !== undefined);
  return {
    id: document.deck.id,
    title: document.deck.title,
    theme: document.deck.theme,
    revision: document.deck.revision,
    sections: outlineOf(document),
    counts: {
      slides: order.length,
      sections: document.deck.sections.length,
      assets: Object.keys(document.deck.assets).length,
      htmlBlocks: htmlBlockCount(document),
      skipped: order.filter((id) => document.slides[id]?.skip === true).length,
    },
    ...(document.deck.defaults !== undefined ? { defaults: document.deck.defaults } : {}),
    ...(document.deck.trashedAt !== undefined ? { trashedAt: document.deck.trashedAt } : {}),
  };
}

/** Registers deck.info, slide.list, slide.get, lint.run and validate.run on a dispatcher. */
export function registerReadActions(dispatcher: Dispatcher, deps: ReaderDeps): void {
  const records = async (document: DeckDocument): Promise<RenderRecord[]> =>
    deps.renderRecords === undefined ? [] : await deps.renderRecords(document);

  dispatcher.register('deck.info', async () => deckInfo(await deps.load()));

  dispatcher.register('slide.list', async (input) => {
    const { sectionId } = input as { sectionId?: string };
    const document = await deps.load();
    const counts = countsBySlide(lintStatic(document, deps.lint));
    const rows: {
      id: string;
      n: number;
      section: string;
      title: string;
      kind: Slide['kind'];
      lint: { s3: number; s2: number };
      /** true for a skipped slide (gslides-parity SPEC 7.2.1) */
      skip?: boolean;
      /** the layout the slide was made from, when written (gslides-parity SPEC 7.2.2) */
      template?: Slide['template'];
    }[] = [];
    for (const section of outlineOf(document)) {
      if (sectionId !== undefined && section.id !== sectionId) continue;
      for (const slide of section.slides) {
        const record = document.slides[slide.id];
        rows.push({
          id: slide.id,
          n: slide.n,
          section: section.id,
          title: slide.title,
          kind: slide.kind,
          lint: { s3: counts[slide.id]?.s3 ?? 0, s2: counts[slide.id]?.s2 ?? 0 },
          ...(record?.skip === true ? { skip: true } : {}),
          ...(record?.template !== undefined ? { template: record.template } : {}),
        });
      }
    }
    return rows;
  });

  dispatcher.register('slide.get', async (input) => {
    const { slideId } = input as { slideId: string };
    const document = await deps.load();
    const slide = requireSlide(document, slideId);
    const section = document.deck.sections.find((row) => row.slideIds.includes(slideId));
    if (section === undefined) throw new RangeError(`Slide "${slideId}" is in no section`);
    const assets: Record<string, unknown> = {};
    for (const id of assetIdsOf(slide)) {
      const asset = document.deck.assets[id];
      if (asset !== undefined) assets[id] = asset;
    }
    const mine = (await records(document)).filter((record) => record.slideId === slideId);
    return {
      slide,
      n: slideOrder(document.deck).indexOf(slideId) + 1,
      section: section.id,
      assets,
      render: mine[mine.length - 1] ?? null,
    };
  });

  dispatcher.register('lint.run', async (input) => {
    const options = input as { slideIds: SlideIds; layers?: LintLayers; rule?: RuleId };
    const document = await deps.load();
    const recs = options.layers === 'static' ? [] : await records(document);
    return lintSelection(document, recs, deps.lint, options);
  });

  dispatcher.register('validate.run', async (input) => {
    const { path } = input as { path?: string };
    if (path === undefined) return validateLoaded(await deps.load());
    if (deps.deckDirFor === undefined) {
      throw new RangeError('validate.run: this instance validates its own decks only; omit path');
    }
    return validateDeckDir(deps.deckDirFor(path));
  });
}
