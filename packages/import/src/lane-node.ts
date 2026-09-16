// The Node half of the import lane (gslides-parity SPEC-5 1.6, 4.6, 5.2, 5.5; MILESTONES-5 B3
// days 5 to 7; b3.md requests B3-7 and B3-10): `importLaneDeps` composes the `ImportLaneDeps`
// bridge the lane handlers read from `LaneDeps.imports` over the file system (the CLI's checkout,
// the hosted studio's materialized decks folder), and `slideImportSourceFor` builds the source
// `slide.import` copies from when the input names a `.pptx` (`sourceFile`, the slides by number)
// or a template of the index (`sourceTemplateId`, the slides by id), so the integrator's one
// `slideImport` keeps copying. A path is read on a checkout alone; a `data:` URL anywhere; an
// upload key hosted through the studio's staged uploads (`readUpload`).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import type {
  BuildingBlock,
  BuildingBlockCategory,
  TemplateIndexEntry,
} from '@turboslide/schema/building-blocks';
import type { DeckDocument, ThemeRecord } from '@turboslide/schema/deck';
import { parseJson } from '@turboslide/schema/json';
import type { Page } from '@turboslide/schema/render';
import { validateDeck } from '@turboslide/schema/validate';
import { listBuildingBlocks, readBuildingBlock } from '@turboslide/store/building-blocks';
import { readTemplate, readTemplateIndex, templatesDir } from '@turboslide/store/templates';

import type {
  ImportLaneDeps,
  ImportPptxAnswer,
  ImportPptxContext,
  ImportPptxRequest,
  TemplateSlideRow,
  ThemeImportRequest,
} from './lane.ts';
import { templateSlideRows } from './lane.ts';
import type { ImportedDocument } from './pptx/import-pptx.ts';
import { PackageRefusal } from './pptx/package.ts';
import { importPptxBytes, pptxEntries, readPptxSource, writeImportedDeck } from './pptx/read.ts';
import type { PptxSource } from './pptx/read.ts';
import { themeRecordsOf } from './theme-import.ts';

export type ImportLaneNodeOptions = {
  /** the decks folder the new deck lands under and the templates are read from */
  decksDir: string;
  /** the working directory a relative path resolves against (the CLI's cwd) */
  cwd?: string;
  /** file paths as inputs; true on a checkout, false hosted */
  allowPaths?: boolean;
  /** hosted: the staged upload by key (the studio's `readUpload`) */
  readUpload?: (key: string) => Promise<Uint8Array | null>;
  /** another deck's document, for `theme.import { deckId }`; the folder under decksDir when absent */
  readDeck?: (deckId: string) => Promise<DeckDocument>;
  /** a folder for the staging copy of a written deck */
  stagingDir?: string;
  now?: () => string;
};

/** The upload keys the studio stages: `uploads/<identity>/<uuid>` (apps/studio/src/server/upload.ts). */
const UPLOAD_KEY = /^uploads\/[A-Za-z0-9_.-]{1,80}\/[0-9a-f-]{36}$/;

/**
 * The bytes a `file` input names: a `data:` URL, an upload key through `readUpload`, or a path when
 * paths are allowed. The file name for the report is the path's base name, else `upload.pptx`.
 */
export async function readPptxInput(
  file: string,
  options: ImportLaneNodeOptions & { fileName?: string },
): Promise<PptxSource> {
  if (UPLOAD_KEY.test(file)) {
    if (options.readUpload === undefined)
      throw new TypeError('An upload key needs the studio; on the CLI pass the file path');
    const bytes = await options.readUpload(file);
    if (bytes === null) throw new RangeError(`No upload at ${file}; upload the file again`);
    return { bytes, fileName: options.fileName ?? 'upload.pptx' };
  }
  return readPptxSource(file, {
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.fileName !== undefined ? { fileName: options.fileName } : {}),
    allowPaths: options.allowPaths ?? true,
  });
}

/** A template folder read as a document: the manifest and the slide files, validated. */
export function templateDocument(decksDir: string, templateId: string): DeckDocument {
  const template = readTemplate(join(templatesDir(decksDir), templateId));
  const manifestPath = join(template.dir, template.record.deck);
  const slidesDir = join(template.dir, template.record.slides);
  const deck = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  const slides = existsSync(slidesDir)
    ? readdirSync(slidesDir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) =>
          parseJson(readFileSync(join(slidesDir, name), 'utf8'), join(slidesDir, name)),
        )
    : [];
  const result = validateDeck({ deck, slides });
  if (!result.ok || result.deck === null) {
    const first = result.issues.find((issue) => issue.severity === 3);
    throw new TypeError(
      `The template ${templateId} does not validate: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  return { deck: result.deck, slides: result.slides };
}

/** The template's assets folder on disk (the record's `assets`, relative to its folder). */
export function templateAssetsDir(decksDir: string, templateId: string): string {
  const template = readTemplate(join(templatesDir(decksDir), templateId));
  return resolve(template.dir, template.record.assets);
}

/** `ImportLaneDeps` over the file system: the reader, the theme records, the template index and the building blocks. */
export function importLaneDeps(options: ImportLaneNodeOptions): ImportLaneDeps {
  const { decksDir } = options;
  return {
    async importPptx(
      request: ImportPptxRequest,
      context: ImportPptxContext,
    ): Promise<ImportPptxAnswer> {
      const source = await readPptxInput(request.file, options);
      const document = await importPptxBytes(source.bytes, {
        fileName: source.fileName,
        ...(request.into !== undefined ? { into: request.into } : {}),
        ...(request.theme !== undefined ? { theme: request.theme } : {}),
        ...(request.sheet !== undefined ? { sheet: request.sheet } : {}),
        ...(context.currentPage !== undefined ? { currentPage: context.currentPage } : {}),
        ...(request.snapLadder !== undefined ? { snapLadder: request.snapLadder } : {}),
        ...(request.masterShapes !== undefined ? { masterShapes: request.masterShapes } : {}),
        ...(request.comments !== undefined ? { comments: request.comments } : {}),
        ...(options.now !== undefined ? { now: options.now } : {}),
      });
      if (request.dryRun === true)
        return { ...document.report, deck: document.deck, slides: document.slides };
      const written = writeImportedDeck(document, decksDir, {
        replace: false,
        ...(options.stagingDir !== undefined ? { stagingDir: options.stagingDir } : {}),
      });
      return { ...document.report, deckId: written.deckId };
    },
    async themeRecords(request: ThemeImportRequest): Promise<ThemeRecord[]> {
      if (request.file !== undefined) {
        const source = await readPptxInput(request.file, options);
        return themeRecordsOf(pptxEntries(source.bytes, source.fileName), source.fileName);
      }
      if (request.deckId !== undefined) {
        const { themeRecordsFromDeck } = await import('./theme-import.ts');
        const document =
          options.readDeck !== undefined
            ? await options.readDeck(request.deckId)
            : deckFolderDocument(decksDir, request.deckId);
        return themeRecordsFromDeck(document, request.deckId);
      }
      throw new TypeError('theme.import takes file or deckId');
    },
    templates: {
      list: (): TemplateIndexEntry[] => readTemplateIndex(decksDir),
      slides: (id: string): TemplateSlideRow[] => templateSlideRows(templateDocument(decksDir, id)),
    },
    buildingBlocks: {
      list: (category?: BuildingBlockCategory): BuildingBlock[] =>
        listBuildingBlocks(decksDir, category),
      read: (id: string): BuildingBlock => readBuildingBlock(decksDir, id),
    },
  };
}

/** A deck folder under decksDir as a validated document (the CLI's `theme.import { deckId }`). */
export function deckFolderDocument(decksDir: string, deckId: string): DeckDocument {
  const dir = join(decksDir, deckId);
  const manifestPath = join(dir, 'deck.json');
  if (!existsSync(manifestPath)) throw new RangeError(`No deck ${deckId} under ${decksDir}`);
  const slidesDir = join(dir, 'slides');
  const deck = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  const slides = existsSync(slidesDir)
    ? readdirSync(slidesDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) =>
          parseJson(readFileSync(join(slidesDir, name), 'utf8'), join(slidesDir, name)),
        )
    : [];
  const result = validateDeck({ deck, slides });
  if (!result.ok || result.deck === null) throw new TypeError(`${deckId} does not validate`);
  return { deck: result.deck, slides: result.slides };
}

// ---------------------------------------------------------------------------------------------
// slide.import over a file or a template (SPEC-5 4.6, 5.2; b3.md request B3-10)

export type SlideImportInputLike = {
  sourceDeckId?: string;
  sourceFile?: string;
  sourceTemplateId?: string;
  slideIds?: string[];
  slideIndexes?: number[];
  keepTheme?: boolean;
};

/** What the integrator's `slideImport` takes, plus what the two new sources add. */
export type SlideImportBridge = {
  /** the source document; `slideIds` index into its slides */
  document: DeckDocument;
  /** copies one asset file (`assets/<name>`) into the target deck folder */
  copyAsset: (relative: string) => Promise<void>;
  /** the slide ids to copy, in the order they land (the file's selection by number, the template's by id) */
  slideIds: string[];
  /** the media records the copied slides play (`deck.media`), for the target's map */
  media: Record<string, NonNullable<DeckDocument['deck']['media']>[string]>;
  /** Keep original theme: the source's first theme record, when asked and the source has one */
  theme?: ThemeRecord;
  /** the label the sentences name: the file or the template */
  label: string;
};

export type SlideImportSourceOptions = ImportLaneNodeOptions & {
  /** the target deck folder the asset files land in */
  targetDir: string;
  /** the target deck's page, the `fit` target of a file's slides */
  currentPage?: Page;
  /** the target's own asset write (hosted: the store's putAsset), run before the file lands on disk */
  putAsset?: (relative: string, bytes: Uint8Array) => Promise<unknown>;
};

function writeTarget(targetDir: string, relative: string, bytes: Uint8Array): void {
  const to = join(targetDir, ...relative.split('/'));
  if (existsSync(to)) return;
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, bytes);
}

/** The relative path is `assets/<name>` with no step outside the folder. */
function assertAssetRelative(relative: string, label: string): void {
  if (!/^assets\/[^/\\]+$/.test(relative) || relative.includes('..'))
    throw new RangeError(`${label} names a file outside assets/: ${relative}`);
}

/**
 * The source of a `slide.import` whose input names a `.pptx` or a template. A file is read through
 * the one reader with the selected slide numbers (`slideIndexes`, one based) fitted onto the
 * target's page; its asset files stay in memory until `copyAsset` writes them. A template's
 * document is its folder's; `slideIds` are the input's, every one checked against the template.
 * A `sourceDeckId` input is not this function's: the caller keeps its deck source.
 */
export async function slideImportSourceFor(
  input: SlideImportInputLike,
  options: SlideImportSourceOptions,
): Promise<SlideImportBridge> {
  if (input.sourceFile !== undefined) {
    const source = await readPptxInput(input.sourceFile, options);
    let document: ImportedDocument;
    try {
      document = await importPptxBytes(source.bytes, {
        fileName: source.fileName,
        sheet: 'fit',
        ...(options.currentPage !== undefined ? { currentPage: options.currentPage } : {}),
        ...(input.slideIndexes !== undefined ? { slideIndexes: input.slideIndexes } : {}),
        ...(options.now !== undefined ? { now: options.now } : {}),
      });
    } catch (error) {
      if (error instanceof PackageRefusal) throw new TypeError(error.message);
      throw error;
    }
    if (document.slideIds.length === 0)
      throw new RangeError(`${source.fileName} has no slide at the numbers given`);
    const files = new Map(document.files.map((file) => [file.relative, file.bytes]));
    const label = basename(source.fileName);
    const theme =
      input.keepTheme === true
        ? themeRecordsOf(pptxEntries(source.bytes, source.fileName), source.fileName)[0]
        : undefined;
    return {
      document: {
        deck: document.deck,
        slides: Object.fromEntries(document.slides.map((slide) => [slide.id, slide])),
      },
      slideIds: document.slideIds,
      media: document.deck.media ?? {},
      ...(theme !== undefined ? { theme } : {}),
      label,
      copyAsset: async (relative) => {
        assertAssetRelative(relative, label);
        const bytes = files.get(relative);
        if (bytes === undefined) throw new RangeError(`${label} has no file ${relative}`);
        if (options.putAsset !== undefined) await options.putAsset(relative, bytes);
        writeTarget(options.targetDir, relative, bytes);
      },
    };
  }
  if (input.sourceTemplateId !== undefined) {
    const templateId = input.sourceTemplateId;
    const document = templateDocument(options.decksDir, templateId);
    const assetsDir = templateAssetsDir(options.decksDir, templateId);
    const slideIds = input.slideIds ?? [];
    for (const id of slideIds)
      if (document.slides[id] === undefined)
        throw new RangeError(`No slide "${id}" in the template ${templateId}`);
    const media = document.deck.media ?? {};
    return {
      document,
      slideIds,
      media,
      label: templateId,
      copyAsset: async (relative) => {
        assertAssetRelative(relative, templateId);
        const from = join(assetsDir, relative.slice('assets/'.length));
        if (!existsSync(from)) throw new RangeError(`${templateId} has no file ${relative}`);
        const bytes = new Uint8Array(readFileSync(from));
        if (options.putAsset !== undefined) await options.putAsset(relative, bytes);
        writeTarget(options.targetDir, relative, bytes);
      },
    };
  }
  throw new TypeError(
    'slideImportSourceFor takes sourceFile or sourceTemplateId; a sourceDeckId keeps its deck source',
  );
}

// ---------------------------------------------------------------------------------------------
// The upload route's import (SPEC-5 0.26, 5.2; b3.md request B3-18)

export type ImportIntoFolderOptions = {
  fileName?: string;
  /** the deck id to write under; the file name's slug when absent; freed against `exists` */
  as?: string;
  theme?: ImportPptxRequest['theme'];
  sheet?: ImportPptxRequest['sheet'];
  /** whether the collection holds a deck id already (a hosted collection knows more than the folder) */
  exists?: (deckId: string) => Promise<boolean>;
  stagingDir?: string;
  now?: () => string;
};

export type ImportedIntoFolder = {
  deckId: string;
  title: string;
  dir: string;
  report: ImportPptxAnswer;
  counts: { slides: number; assets: number };
};

/**
 * A `.pptx`'s bytes as a new deck folder under `decksDir`, the id freed against the folder and
 * the collection (`<id>-2`, `<id>-3`), with the report carrying the id. The route pushes the
 * folder to the Blob store afterwards the way `importDeckBundle` does; a package refusal is a
 * TypeError with its sentence.
 */
export async function importPptxIntoFolder(
  bytes: Uint8Array,
  decksDir: string,
  options: ImportIntoFolderOptions = {},
): Promise<ImportedIntoFolder> {
  const fileName = options.fileName ?? 'upload.pptx';
  let document: ImportedDocument;
  try {
    document = await importPptxBytes(bytes, {
      fileName,
      ...(options.as !== undefined ? { into: options.as } : {}),
      ...(options.theme !== undefined ? { theme: options.theme } : {}),
      ...(options.sheet !== undefined ? { sheet: options.sheet } : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  } catch (error) {
    if (error instanceof PackageRefusal) throw new TypeError(error.message);
    throw error;
  }
  const taken = async (id: string): Promise<boolean> =>
    existsSync(join(decksDir, id, 'deck.json')) || ((await options.exists?.(id)) ?? false);
  let deckId = document.deck.id;
  if (await taken(deckId)) {
    let n = 2;
    while (await taken(`${document.deck.id}-${n}`)) n += 1;
    deckId = `${document.deck.id}-${n}`;
    document = { ...document, deck: { ...document.deck, id: deckId } };
  }
  const written = writeImportedDeck(document, decksDir, {
    replace: false,
    ...(options.stagingDir !== undefined ? { stagingDir: options.stagingDir } : {}),
  });
  return {
    deckId: written.deckId,
    title: document.deck.title,
    dir: written.dir,
    report: { ...document.report, deckId: written.deckId },
    counts: { slides: document.slides.length, assets: document.files.length },
  };
}
