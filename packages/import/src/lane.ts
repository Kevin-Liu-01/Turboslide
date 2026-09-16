// The import lane's seam with the dispatchers (gslides-parity SPEC-5 1.6, 5.5; MILESTONES-5 B3
// days 3 to 7; b3.md request B3-7): the Node free types the lane handler modules
// (`apps/cli/src/actions/{import,templates}.ts`) read from `LaneDeps.imports`, the sentences they
// print without the bridge, and the pure helpers both sides share (the five theme cap, the slide
// rows of a template, the theme record pick). `lane-node.ts` composes the bridge over the file
// system for the CLI and the hosted dispatcher; the editor page imports this module through the
// handler graph and never sees `node:`.
import type {
  BuildingBlock,
  BuildingBlockCategory,
  TemplateIndexEntry,
} from '@turboslide/schema/building-blocks';
import type { Deck, DeckDocument, Slide, ThemeRecord } from '@turboslide/schema/deck';
import { IMPORTED_THEMES_MAX, slideOrder, slideTitle } from '@turboslide/schema/deck';
import type {
  ImportReport,
  ImportSheetMode,
  ImportThemeMode,
} from '@turboslide/schema/import-report';
import type { Page } from '@turboslide/schema/render';

/** `import.pptx`'s input as the handler reads it (packages/schema/src/actions.ts). */
export type ImportPptxRequest = {
  /** a path on a checkout, a `data:` URL anywhere, an upload key hosted */
  file: string;
  into?: string;
  theme?: ImportThemeMode;
  sheet?: ImportSheetMode;
  snapLadder?: boolean;
  masterShapes?: boolean;
  comments?: boolean;
  dryRun?: boolean;
};

export type ImportPptxContext = {
  /** the current deck's page, the target of `sheet: 'fit'` */
  currentPage?: Page;
  /** the deck the request was made from (hosted), for the report's sentence */
  deckId?: string;
};

/** The report, plus the document under `dryRun` (b3.md request B3-8) so a dialog can draw the slides. */
export type ImportPptxAnswer = ImportReport & { deck?: Deck; slides?: Slide[] };

export type ThemeImportRequest = { file?: string; deckId?: string; themeIndex?: number };

/** One row of `template.slides`. */
export type TemplateSlideRow = {
  index: number;
  slideId: string;
  title: string;
  kind: Slide['kind'];
};

/** What the lane's handlers take from the Node side, composed by `importLaneDeps` (lane-node.ts). */
export type ImportLaneDeps = {
  /** reads a `.pptx` into a new deck folder, or answers the report and the document under `dryRun` */
  importPptx: (request: ImportPptxRequest, context: ImportPptxContext) => Promise<ImportPptxAnswer>;
  /** the theme records a `.pptx` holds (one per theme part), or another deck's edited theme and imported records */
  themeRecords: (request: ThemeImportRequest) => Promise<ThemeRecord[]>;
  templates: {
    /** the rows of decks/templates/templates.json */
    list: () => TemplateIndexEntry[];
    /** one template's slides in manifest order */
    slides: (id: string) => TemplateSlideRow[];
  };
  buildingBlocks: {
    list: (category?: BuildingBlockCategory) => BuildingBlock[];
    read: (id: string) => BuildingBlock;
  };
};

/** The sentence a handler prints when the dispatcher was composed without the bridge (SPEC-5 1.6). */
export function importBridgeSentence(id: string): string {
  return `${id} needs the import bridge (LaneDeps.imports), which this dispatcher was composed without; the CLI composes it in apps/cli/src/write.ts storeDeps and the hosted dispatcher in apps/studio/src/server/actions.ts (docs/gslides-parity/build-5/b3.md B3-7)`;
}

/** The sixth Import theme (SPEC-5 0.28, 15). */
export const FIVE_THEMES_SENTENCE = 'This presentation already holds five themes';

/**
 * Appends one record to In this presentation (SPEC-5 5.3): at most `IMPORTED_THEMES_MAX`; the
 * sixth is refused with its sentence. Answers the new list and the record's index in it.
 */
export function appendImportedTheme(
  current: ReadonlyArray<ThemeRecord> | undefined,
  record: ThemeRecord,
): { importedThemes: ThemeRecord[]; index: number } {
  const list = [...(current ?? [])];
  if (list.length >= IMPORTED_THEMES_MAX) throw new RangeError(FIVE_THEMES_SENTENCE);
  list.push(record);
  return { importedThemes: list, index: list.length - 1 };
}

/** The record `themeIndex` names among a file's theme parts, the first when absent; a RangeError past the end. */
export function pickThemeRecord(
  records: ReadonlyArray<ThemeRecord>,
  themeIndex: number | undefined,
  source: string,
): ThemeRecord {
  if (records.length === 0) throw new RangeError(`${source} holds no theme`);
  const index = themeIndex ?? 0;
  const record = records[index];
  if (record === undefined)
    throw new RangeError(
      `${source} holds ${records.length} theme${records.length === 1 ? '' : 's'}; themeIndex ${index} is past the end`,
    );
  return record;
}

/** The slide rows of a template document in manifest order (the pane, `template.slides`, `slide.import --template`). */
export function templateSlideRows(document: DeckDocument): TemplateSlideRow[] {
  const rows: TemplateSlideRow[] = [];
  slideOrder(document.deck).forEach((slideId, i) => {
    const slide = document.slides[slideId];
    if (slide === undefined) return;
    rows.push({ index: i + 1, slideId, title: slideTitle(slide, i + 1), kind: slide.kind });
  });
  return rows;
}
