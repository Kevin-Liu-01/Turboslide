// importDeck: `turboslide import <Prototemplate deck dir> --into <deckId>` (SPEC 9). Parses
// parts/head.html to confirm the theme, every slides/NN-*.html with parse5, SECTIONS from
// parts/tail.html, shots/OPENERS.md and shots/DETAILS.md for asset provenance; writes decks/<id>/
// with deck.json, one slide per JSON file, the assets with light and dark twins, import-ids.json and
// import-report.json.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Assets } from './assets.ts';
import type { IdMap } from './ids.ts';
import { mapSlide } from './map.ts';
import type { ReportRow } from './map.ts';
import { parseSections, sectionOf } from './sections.ts';
import { derivedSlideTitle } from '@turboslide/schema/deck';
import type { Deck, Section, Slide } from '@turboslide/schema/deck';
import { canonicalJson, readJson, writeIfChanged } from './write.ts';

export type ImportOptions = {
  /** The Prototemplate deck directory (parts/, slides/, shots/). */
  from: string;
  /** The deck id; the output goes to `<decksDir>/<into>/`. */
  into: string;
  /** The decks directory (default `decks` under the current working directory). */
  decksDir?: string;
  /** The deck title (default the source's). */
  title?: string;
  /** Skip copying assets (tests). */
  skipAssets?: boolean;
  now?: () => string;
};

export type ImportReport = {
  from: string;
  into: string;
  importedAt: string;
  slides: number;
  sections: number;
  htmlBlocks: number;
  blocks: number;
  assets: number;
  files: number;
  filesCopied: number;
  rulesConsumed: number;
  rulesLeftOver: number;
  slidesWithResidualCss: string[];
  inlineLeftOver: number;
  warnings: string[];
  rows: ReportRow[];
};

/** The theme check of SPEC 9: head.html must carry the nine tokens of gt-ink-paper (head:11-32). */
export function confirmTheme(headHtml: string): string[] {
  const expected = [
    '--paper: #ffffff',
    '--ink: #070707',
    '--ink-2: #3a3d44',
    '--titanium: #8a8f98',
    '--hair: rgba(7, 7, 7, 0.18)',
    '--paper: #070707',
    '--ink: #f2f2f0',
  ];
  return expected
    .filter((token) => !headHtml.includes(token))
    .map((token) => `head.html lacks ${token}`);
}

export function importDeck(options: ImportOptions): ImportReport {
  const from = options.from;
  const decksDir = options.decksDir ?? join(process.cwd(), 'decks');
  const target = join(decksDir, options.into);
  const now = options.now ?? (() => new Date().toISOString());
  const warnings: string[] = [];

  const head = readFileSync(join(from, 'parts/head.html'), 'utf8');
  warnings.push(...confirmTheme(head));
  const tail = readFileSync(join(from, 'parts/tail.html'), 'utf8');
  const sourceSections = parseSections(tail);
  const files = readdirSync(join(from, 'slides'))
    .filter((f) => /^\d\d-.*\.html$/.test(f))
    .sort();

  const previousIds = readJson<IdMap>(join(target, 'import-ids.json')) ?? {};
  const nextIds: IdMap = {};
  const assets = new Assets(from);
  const previousDeck = readJson<Deck>(join(target, 'deck.json'));

  const rows: ReportRow[] = [];
  const slides: Slide[] = [];
  const sections: Section[] = sourceSections.map((s) => ({ id: s.id, name: s.name, slideIds: [] }));
  files.forEach((file, index) => {
    const n = index + 1;
    const section = sectionOf(sourceSections, n);
    const html = readFileSync(join(from, 'slides', file), 'utf8');
    const mapped = mapSlide({ file, n, html, section, assets, previousIds, nextIds });
    if (mapped.row.html !== null && mapped.slide.title === undefined) {
      // An escape slide has no typed heading, so the stored document carries the title its markup
      // derives (the first h1 or h2, the deck viewer's rule at tail:90-94); without it the sidebar,
      // the sheet labels and the filter would show the slide number or the id (SPEC 4.2).
      const title = derivedSlideTitle(mapped.slide);
      if (title !== undefined) mapped.slide.title = title;
    }
    warnings.push(...mapped.warnings);
    slides.push(mapped.slide);
    rows.push(mapped.row);
    const home = sections.find((s) => s.id === section.id);
    if (home) home.slideIds.push(mapped.slide.id);
  });

  const ids = new Set<string>();
  for (const slide of slides) {
    if (ids.has(slide.id)) warnings.push(`duplicate slide id ${slide.id}`);
    ids.add(slide.id);
  }
  warnings.push(...assets.registry.warnings);

  // Write the deck directory: slides, assets, deck.json, sidecars.
  const slidesDir = join(target, 'slides');
  if (existsSync(slidesDir)) {
    for (const stale of readdirSync(slidesDir)) {
      if (!ids.has(stale.replace(/\.json$/, ''))) rmSync(join(slidesDir, stale));
    }
  }
  for (const slide of slides)
    writeIfChanged(join(slidesDir, `${slide.id}.json`), canonicalJson(slide));
  const filesCopied = options.skipAssets ? 0 : assets.copyTo(target);

  const deck: Deck = {
    schemaVersion: 1,
    id: options.into,
    title: options.title ?? 'GT brand deck',
    theme: 'gt-ink-paper',
    sections,
    assets: sortedAssets(assets.registry.assets),
    revision: (previousDeck?.revision ?? 0) + 1,
    createdAt: previousDeck?.createdAt ?? now(),
    updatedAt: now(),
  };
  writeIfChanged(join(target, 'deck.json'), canonicalJson(deck));
  writeIfChanged(join(target, 'import-ids.json'), canonicalJson(sortKeys(nextIds)));

  const report: ImportReport = {
    from,
    into: options.into,
    importedAt: deck.updatedAt,
    slides: slides.length,
    sections: sections.length,
    htmlBlocks: rows.filter((row) => row.html !== null).length,
    blocks: rows.reduce((sum, row) => sum + row.blocks.length, 0),
    assets: Object.keys(deck.assets).length,
    files: assets.registry.files.size,
    filesCopied,
    rulesConsumed: rows.reduce((sum, row) => sum + row.rulesConsumed, 0),
    rulesLeftOver: rows.reduce((sum, row) => sum + row.rulesLeftOver.length, 0),
    slidesWithResidualCss: rows.filter((row) => row.rulesLeftOver.length > 0).map((row) => row.id),
    inlineLeftOver: rows.reduce((sum, row) => sum + row.inlineLeftOver.length, 0),
    warnings,
    rows,
  };
  writeIfChanged(join(target, 'import-report.json'), canonicalJson(report));
  return report;
}

function sortedAssets<T>(assets: Record<string, T>): Record<string, T> {
  return sortKeys(assets);
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key] as T;
  return out;
}
