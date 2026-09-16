// The orchestration of one PPTX import (gslides-parity SPEC-5 5.1, 5.2; R04 12): the package
// opened over its inflated entries, validated (a failing package is read anyway and the report
// carries the issues), the presentation walked in `p:sldIdLst` order, every slide read into a
// canvas slide through `slide.ts`, the sections and the assets assembled into a deck, the
// document validated through `validateDeck`, and the report built with the source facts, the
// font run counts and the resolved scheme for Import theme. Node free: the caller inflates the
// zip (`read.ts` on Node) and writes the files this module answers.
import type { Deck, DeckDocument, Section, Slide } from '@turboslide/schema/deck';
import type { ImportReport } from '@turboslide/schema/import-report';
import { slugify } from '@turboslide/schema/ids';
import type { Page } from '@turboslide/schema/render';
import { DEFAULT_PAGE, isDefaultPage } from '@turboslide/schema/render';
import { validateDeck } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';

import {
  AssetCollector,
  BlockIds,
  DEFAULT_MAPPING_OPTIONS,
  parseRoundTripName,
} from './context.ts';
import type { AssetFile, ImportContext, MappingOptions, SlideContext } from './context.ts';
import { slideChain } from './inherit.ts';
import type { PackageEntry, PresentationInfo, SlideRef } from './package.ts';
import { openPackage, readPresentation, shapeTree, validatePackage } from './package.ts';
import { ImportReportBuilder, ROW_CODES } from './report.ts';
import { readSlide } from './slide.ts';
import { readScheme, themeRecordColors } from './theme.ts';
import type { Scheme } from './theme.ts';
import { sheetMapping } from './units.ts';
import type { SheetMode } from './units.ts';
import { attr, child, effectiveChildren, elementChildren, is, path } from './xml.ts';

export type ImportPptxOptions = Partial<MappingOptions> & {
  /** the source file name, for the report and the deck title */
  fileName?: string;
  /** the deck id; the slug of the file name when absent */
  into?: string;
  /** the deck title; the presentation's `dc:title` or the file name when absent */
  title?: string;
  sheet?: SheetMode;
  /** the destination page under `fit` (the current deck's); the default page when absent */
  currentPage?: Page;
  /** the source slide numbers to read, one based; every slide when absent (slide.import's selection) */
  slideIndexes?: readonly number[];
  now?: () => string;
};

export type ImportedDocument = {
  deck: Deck;
  slides: Slide[];
  /** the files to write under the deck folder's `assets/` */
  files: AssetFile[];
  report: ImportReport;
  /** the slide ids in source order (the selection's, under `slideIndexes`) */
  slideIds: string[];
  /** `import-ids.json`: the source `p:sldId id` to the slide id, for a stable re import */
  ids: Record<string, string>;
  /** the validator's issues over the document */
  issues: Issue[];
  /** the source scheme of the first theme, the Import theme record's input */
  scheme?: Scheme;
  /** the source slide count the fidelity table sums against */
  shapeCount: number;
};

/** The slide id a source slide gets: the round trip's from an object name, else the name's slug, else `slide-<n>`. */
function slideIdFor(
  pkg: ReturnType<typeof openPackage>,
  ref: SlideRef,
  taken: Set<string>,
): string {
  const root = pkg.root(ref.part);
  const tree = shapeTree(root);
  if (tree !== undefined) {
    for (const el of effectiveChildren(tree)) {
      const nv = elementChildren(el).find((n) => /^nv[A-Za-z]*Pr$/.test(n.localName ?? ''));
      const cNvPr =
        nv === undefined ? undefined : elementChildren(nv).find((n) => n.localName === 'cNvPr');
      const name = cNvPr?.getAttribute('name') ?? '';
      const trip = parseRoundTripName(name);
      if (trip !== undefined && !taken.has(trip.slideId)) {
        taken.add(trip.slideId);
        return trip.slideId;
      }
    }
  }
  const cSld = child(root, 'p', 'cSld');
  const name = cSld === undefined ? undefined : attr(cSld, 'name');
  let base =
    name !== undefined && !/^(slide|diapositiva|folie|diapositive)\s*\d*$/i.test(name.trim())
      ? slugify(name)
      : '';
  if (base === '' || base === 'templates') base = `slide-${ref.index}`;
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  taken.add(id);
  return id;
}

/** The sections of the deck from the `p14:sectionLst`, or one section named after the deck. */
function sectionsOf(
  presentation: PresentationInfo,
  bySourceId: Map<number, string>,
  title: string,
  kept: Set<string>,
): Section[] {
  const sections: Section[] = [];
  const takenIds = new Set<string>();
  for (const section of presentation.sections) {
    const slideIds = section.slideIds
      .map((id) => bySourceId.get(id))
      .filter((id): id is string => id !== undefined && kept.has(id));
    if (slideIds.length === 0) continue;
    let id = slugify(section.name) || 'section';
    let n = 2;
    const base = id;
    while (takenIds.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    takenIds.add(id);
    sections.push({
      id,
      name: section.name.trim() === '' ? `Section ${sections.length + 1}` : section.name.trim(),
      slideIds,
    });
  }
  const placed = new Set(sections.flatMap((s) => s.slideIds));
  const rest = [...kept].filter((id) => !placed.has(id));
  if (rest.length > 0) {
    if (sections.length === 0) sections.push({ id: 'deck', name: title, slideIds: rest });
    else (sections[sections.length - 1] as Section).slideIds.push(...rest);
  }
  return sections.length === 0 ? [{ id: 'deck', name: title, slideIds: [] }] : sections;
}

/** True when the file was written by Turboslide's own exporter (R04 7): a master named `DECK_PAPER_*` or an object named `ts:`. */
function isRoundTrip(pkg: ReturnType<typeof openPackage>, presentation: PresentationInfo): boolean {
  for (const master of presentation.masters) {
    const cSld = child(pkg.root(master), 'p', 'cSld');
    const name = cSld === undefined ? undefined : attr(cSld, 'name');
    if (name !== undefined && /^DECK_(PAPER|PICTURE)_/.test(name)) return true;
  }
  const first = presentation.slides[0];
  if (first === undefined) return false;
  const tree = shapeTree(pkg.root(first.part));
  return (
    tree !== undefined &&
    effectiveChildren(tree).some((el) => {
      const nv = elementChildren(el).find((n) => /^nv[A-Za-z]*Pr$/.test(n.localName ?? ''));
      const cNvPr =
        nv === undefined ? undefined : elementChildren(nv).find((n) => n.localName === 'cNvPr');
      return (cNvPr?.getAttribute('name') ?? '').startsWith('ts:');
    })
  );
}

/** Reads a PPTX package's entries into a deck document, its asset files and the report. */
export async function importPptx(
  entries: readonly PackageEntry[],
  options: ImportPptxOptions = {},
): Promise<ImportedDocument> {
  const fileName = options.fileName ?? 'presentation.pptx';
  const pkg = openPackage(entries, { fileName });
  const validation = validatePackage(pkg);
  const presentation = readPresentation(pkg);
  const mapping = sheetMapping(
    presentation.size,
    options.sheet ?? 'match',
    options.currentPage ?? DEFAULT_PAGE,
  );
  const mappingOptions: MappingOptions = { ...DEFAULT_MAPPING_OPTIONS, ...stripUndefined(options) };
  const report = new ImportReportBuilder();
  const assets = new AssetCollector();
  const now = (options.now ?? (() => new Date().toISOString()))();
  const stem =
    fileName
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? 'presentation';
  const deckId = options.into ?? (slugify(stem) || 'imported');
  const title = (options.title ?? presentation.title ?? stem).trim() || stem;
  if (!validation.valid) {
    report.row('kept', {
      slideIndex: 1,
      code: ROW_CODES.packageInvalid,
      message: `The package failed ${validation.issues.length} validation check${validation.issues.length === 1 ? '' : 's'} and was read anyway`,
    });
  }
  if (mapping.fallback === 'fit')
    report.row('kept', {
      slideIndex: 1,
      code: ROW_CODES.sheetBars,
      message: `The source page (${Math.round(presentation.size.cx / 7620)} by ${Math.round(presentation.size.cy / 7620)} px) lies outside the page bounds; the slides were fitted onto the current page`,
    });
  else if (mapping.mode === 'fit' && (mapping.bars.x > 0 || mapping.bars.y > 0))
    report.row('kept', {
      slideIndex: 1,
      code: ROW_CODES.sheetBars,
      message: `The source is ${Math.round(presentation.size.cx / 7620)} by ${Math.round(presentation.size.cy / 7620)} px and was fitted onto the ${mapping.page.width} by ${mapping.page.height} px page with ${mapping.bars.x} px bars at the sides and ${mapping.bars.y} px above and below`,
    });

  const roundTrip = isRoundTrip(pkg, presentation);
  const takenSlideIds = new Set<string>(['templates']);
  const slideIds = new Map<number, string>();
  const slideIdsByPart = new Map<string, string>();
  const bySourceId = new Map<number, string>();
  for (const ref of presentation.slides) {
    const id = slideIdFor(pkg, ref, takenSlideIds);
    slideIds.set(ref.index, id);
    slideIdsByPart.set(ref.part, id);
    bySourceId.set(ref.id, id);
  }
  const wanted = options.slideIndexes === undefined ? undefined : new Set(options.slideIndexes);
  const base: ImportContext = {
    pkg,
    presentation,
    mapping,
    options: mappingOptions,
    report,
    assets,
    slideIds,
    slideIdsByPart,
    roundTrip,
  };
  const slides: Slide[] = [];
  const keptIds: string[] = [];
  let shapeCount = 0;
  for (const ref of presentation.slides) {
    if (wanted !== undefined && !wanted.has(ref.index)) continue;
    if (ref.hidden && !mappingOptions.includeHidden) {
      report.row('kept', {
        slideIndex: ref.index,
        code: ROW_CODES.slideHidden,
        message: 'A hidden slide was left out (includeHidden off)',
      });
      continue;
    }
    const slideId = slideIds.get(ref.index) as string;
    const chain = slideChain(pkg, ref.part, presentation);
    let z = 0;
    const ctx: SlideContext = {
      ...base,
      slide: ref,
      slideId,
      chain,
      ids: new BlockIds(),
      nextZ: () => {
        z += 1;
        return z;
      },
      shapeIds: new Map(),
    };
    const reading = await readSlide(ctx);
    shapeCount += reading.shapeCount;
    slides.push(reading.slide);
    keptIds.push(slideId);
  }
  if (wanted !== undefined) {
    for (const index of wanted)
      if (!slideIds.has(index))
        throw new RangeError(
          `The file has no slide ${index}; it holds ${presentation.slides.length}`,
        );
  }
  const kept = new Set(keptIds);
  const sections = sectionsOf(presentation, bySourceId, title, kept);
  const deck: Deck = {
    schemaVersion: 1,
    id: deckId,
    title,
    theme: 'gt-ink-paper',
    sections,
    assets: Object.fromEntries(assets.assets),
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
  if (assets.media.size > 0) deck.media = Object.fromEntries(assets.media);
  if (!isDefaultPage(mapping.page)) deck.page = mapping.page;
  // the round trip and every importer keep the section names; the export's `Deck` names are in the manifest
  const document: DeckDocument = { deck, slides: Object.fromEntries(slides.map((s) => [s.id, s])) };
  const result = validateDeck({ deck, slides });
  const issues = result.issues;
  const blocking = issues.filter((issue) => issue.severity === 3);
  const scheme =
    presentation.themes[0] === undefined ? undefined : readScheme(pkg.xml(presentation.themes[0]));
  for (const master of presentation.masters) {
    // the layouts of the file are not imported as custom layouts this round (SPEC-5 0.28)
    const layouts = pkg.related(
      master,
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
    );
    if (layouts.length > 0) {
      report.row('kept', {
        slideIndex: 1,
        code: ROW_CODES.themeLayouts,
        message: `${layouts.length} layout${layouts.length === 1 ? '' : 's'} of the file were not imported as custom layouts; the slides keep their positions`,
      });
      break;
    }
  }
  // the report names the deck once it is written (`writeImportedDeck`, the CLI); a dry run carries none
  const built = report.build(
    {
      slides: slides.length,
      theme: { mode: mappingOptions.theme, imported: false },
      sheet: mapping.mode,
      source: {
        file: fileName,
        slides: presentation.slides.length,
        page: { width: mapping.page.width, height: mapping.page.height },
        ...(presentation.producer.application !== undefined
          ? { producer: presentation.producer.application }
          : {}),
        sections: presentation.sections.length,
        ...(presentation.embeddedFonts.length > 0
          ? { embeddedFonts: presentation.embeddedFonts }
          : {}),
        modifyVerifier: presentation.modifyVerifier,
      },
      validation: {
        ok: blocking.length === 0 && validation.valid,
        issues: issues.length + validation.issues.length,
      },
    },
    'Inter',
  );
  const reportOut: ImportReport = {
    ...built,
    theme: {
      ...built.theme,
      ...(scheme === undefined
        ? {}
        : {
            scheme: {
              colors: themeRecordColors(scheme),
              fonts: {
                ...(scheme.fonts.major !== undefined ? { major: scheme.fonts.major } : {}),
                ...(scheme.fonts.minor !== undefined ? { minor: scheme.fonts.minor } : {}),
              },
            },
          }),
    },
    validation: {
      ...built.validation,
      ...(validation.issues.length > 0 || blocking.length > 0
        ? {
            lines: [
              ...validation.issues,
              ...blocking.map((issue) => `${issue.file}${issue.pointer}: ${issue.message}`),
            ].slice(0, 50),
          }
        : {}),
    },
  };
  void document;
  void is;
  void path;
  return {
    deck,
    slides,
    files: assets.files,
    report: reportOut,
    slideIds: keptIds,
    ids: Object.fromEntries([...bySourceId.entries()].map(([source, id]) => [String(source), id])),
    issues,
    ...(scheme !== undefined ? { scheme } : {}),
    shapeCount,
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, v] of Object.entries(value) as [keyof T, T[keyof T]][])
    if (v !== undefined) out[key] = v;
  return out;
}

/** The source producer facts a report names, for the CLI's human line. */
export function producerLine(report: ImportReport): string {
  const producer = report.source.producer ?? 'an unknown producer';
  return `${report.source.slides} slide${report.source.slides === 1 ? '' : 's'} from ${producer}, ${report.source.page.width} by ${report.source.page.height} px`;
}
