// The prefs lane's handlers (gslides-parity SPEC-5 7.1, 7.7; MILESTONES-5 B5 "Owns"; the
// integrator's day 0 mapping): prefs.get and prefs.set over the caller's preferences record by
// JSON pointer (day 1); text.autocorrect over the document with the record's rules (day 3);
// version.delete with its confirm and the hosted re authentication port (day 7); and the widened
// forms of the remaining rows of SPEC-5 7.7, registered after the store actions so the later
// registration wins (store-actions.ts registerLaneActions): deck.guides with `colors`, text.indent
// with `firstLine` and `hanging`, text.list with `start`, `prefix` and `suffix`, table.cellStyle
// with `edges`. The module stays free of `node:` imports (the editor page imports this graph
// through store-actions.ts); the record, the version files and the re authentication reach the
// handlers as the ports the dispatcher composition injects.
//
// Where the record lives is the composition's business (R10 3.2): `deps.preferences` is a
// `PreferencesStore` over the caller's principal record, the studio's file or Redis store hosted
// (`principalPreferencesStore` with the request's principal) and the CLI's local principal file
// on a checkout, so `turboslide prefs set` on a laptop and the editor on localhost read one file.
// A dispatcher composed without the store answers the sentence below instead of pretending a
// record exists; the two actions are `record` writes (SPEC-5 13), so no `baseRevision` and no
// version entry.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { blockTexts, slideTexts } from '@turboslide/lint/context';
import type {
  CellBorder,
  CellEdgeBorder,
  TableBlock,
  TableCellStyle,
} from '@turboslide/schema/blocks/table';
import { applyGuides } from '@turboslide/schema/canvas';
import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, DeckGuides, Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideOrder } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import type {
  Correction,
  PreferenceWrite,
  Preferences,
  PreferencesStore,
} from '@turboslide/schema/preferences';
import {
  applyCorrection,
  autocorrect,
  autocorrectText,
  defaultPreferences,
  getPreference,
  setPreference,
  smartQuote,
} from '@turboslide/schema/preferences';
import { deckPage } from '@turboslide/schema/render';
import { INDENT_STEP_PX } from '@turboslide/schema/typography';
import { walkBlocks } from '@turboslide/schema/validate';
import type { VersionRecord } from '@turboslide/store/store';

import { commit, deckGuides, tableCellStyle, textIndent, textList } from '../store-actions.ts';
import type {
  DeckGuidesInput,
  SlideResult,
  StoreActionDeps,
  TableCellStyleInput,
  TextIndentInput,
  TextListInput,
  WriteContext,
} from '../store-actions.ts';
import type { LaneDeps } from './deps.ts';

/** The version files a composition offers for version.delete (a Node port on the CLI, the store's hosted). */
export type VersionsPort = {
  /** removes the records numbered `ns` from the log */
  remove: (ns: ReadonlyArray<number>) => Promise<void>;
  /**
   * hosted: true when the caller signed in within 5 minutes or is the agent bearer (SPEC-3 0.45);
   * absent on a checkout, where no rule applies
   */
  reauthenticated?: () => Promise<boolean>;
};

/**
 * The lane's dependencies: the shared lane deps plus the caller's preferences record. The field
 * is optional here and requested on `LaneDeps` (b5.md request 1); until the composition passes
 * it, both actions refuse with `NO_PREFERENCES_STORE`.
 */
export type PrefsLaneDeps = LaneDeps & { preferences?: PreferencesStore; versions?: VersionsPort };

/** The refusal of a dispatcher composed without the caller's record. */
export function noPreferencesStore(id: string): string {
  return `${id} needs the caller's preferences record on this transport (the principal record under .turboslide/principals/ on a checkout, the principal store hosted); the dispatcher was composed without it`;
}

/** The refusal of a dispatcher composed without the version files. */
export function noVersionsPort(): string {
  return 'version.delete needs the version log on this transport (the versions folder on a checkout, the store hosted); the dispatcher was composed without it';
}

/** The sentence a hosted caller gets without a fresh sign in (SPEC-3 0.45, SPEC-5 7.7). */
export const REAUTHENTICATE_SENTENCE =
  'Deleting versions needs a sign in within the last 5 minutes; sign in again and retry';

/** The deck's language, `en-US` when absent (SPEC-5 7.1). */
function deckLanguage(document: DeckDocument): string {
  return document.deck.language ?? 'en-US';
}

function requireSlide(document: DeckDocument, slideId: string): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

function requireBlock(slide: Slide, blockId: string): Block {
  const found = slideBlocks(slide).find(({ block }) => block.id === blockId)?.block;
  if (found === undefined) throw new RangeError(`No block "${blockId}" on slide "${slide.id}"`);
  return found;
}

// ---------------------------------------------------------------------------------------------
// text.autocorrect (SPEC-5 7.1; R10 1.4 "Agent form")

export type TextAutocorrectInput = {
  slideId?: string;
  blockId?: string;
  path?: string;
  dryRun?: boolean;
  baseRevision: number;
};

export type AutocorrectChange = {
  slideId: string;
  blockId: string;
  path: string;
  from: string;
  to: string;
  rule: string;
};

/** The block id a slide field or the notes report in `changes` (the output schema's `blockId` is required; b5.md request 9 makes it optional). */
export const SLIDE_LEVEL_BLOCK_ID = 'slide';

type AutocorrectTarget = {
  slideId: string;
  /** the top level block; `SLIDE_LEVEL_BLOCK_ID` for a slide field or the notes */
  blockId: string;
  path: string;
  text: string;
  plain: boolean;
  write: (value: string) => Mutation;
};

/** Every Text a `text.autocorrect` call may touch, in reading order, with the write that changes it. */
export function autocorrectTargets(
  document: DeckDocument,
  input: TextAutocorrectInput,
): AutocorrectTarget[] {
  const out: AutocorrectTarget[] = [];
  const slides = input.slideId === undefined ? slideOrder(document.deck) : [input.slideId];
  for (const slideId of slides) {
    const slide = requireSlide(document, slideId);
    if (input.blockId === undefined) {
      for (const ref of slideTexts(slide))
        out.push({
          slideId,
          blockId: SLIDE_LEVEL_BLOCK_ID,
          path: ref.path,
          text: ref.text,
          plain: false,
          write: (value) => ({ op: 'slide.set', slideId, path: ref.path, value }),
        });
    }
    const lists: { pointer: string; blocks: Block[] }[] =
      slide.kind === 'content'
        ? Object.entries(slide.slots).map(([slot, blocks]) => ({
            pointer: `/slots/${slot}`,
            blocks,
          }))
        : slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing'
          ? [{ pointer: '/plate/blocks', blocks: slide.plate.blocks }]
          : [];
    for (const list of lists) {
      walkBlocks(list.blocks, list.pointer, (block, pointer) => {
        const rest = pointer.slice(list.pointer.length + 1);
        const slash = rest.indexOf('/');
        const top = list.blocks[Number(slash < 0 ? rest : rest.slice(0, slash))];
        if (top === undefined) return;
        if (input.blockId !== undefined && top.id !== input.blockId && block.id !== input.blockId)
          return;
        const relativeBase = slash < 0 ? '' : rest.slice(slash);
        for (const ref of blockTexts(block)) {
          const path = `${relativeBase}${ref.path}`;
          if (input.path !== undefined && input.path !== path) continue;
          out.push({
            slideId,
            blockId: top.id,
            path,
            text: ref.text,
            plain: false,
            write: (value) => ({ op: 'block.set', slideId, blockId: top.id, path, value }),
          });
        }
      });
    }
    if (
      input.blockId === undefined &&
      input.path === undefined &&
      slide.notes !== undefined &&
      slide.notes !== ''
    ) {
      out.push({
        slideId,
        blockId: SLIDE_LEVEL_BLOCK_ID,
        path: '/notes',
        text: slide.notes,
        plain: true,
        write: (value) => ({ op: 'slide.set', slideId, path: '/notes', value }),
      });
    }
  }
  return out;
}

/** The token rules over a plain string (the notes): no marks, no links, the quotes curled. */
export function autocorrectPlain(
  text: string,
  prefs: Preferences,
  language: string,
  exceptions: ReadonlyArray<string>,
): { text: string; changes: { at: number; from: string; to: string; rule: string }[] } {
  const changes: { at: number; from: string; to: string; rule: string }[] = [];
  const paragraphs = text.split('\n');
  let base = 0;
  const out = paragraphs.map((paragraph) => {
    let working = paragraph;
    const ends: number[] = [];
    for (let i = 1; i <= working.length; i += 1) {
      const next = i < working.length ? working.charAt(i) : ' ';
      if (!/\s/u.test(working.charAt(i - 1)) && /\s/u.test(next)) ends.push(i);
    }
    for (const end of ends.reverse()) {
      let caret = end;
      for (let round = 0; round < 4; round += 1) {
        const correction: Correction | null = autocorrect(working, caret, ' ', prefs, language, {
          exceptions,
        });
        if (correction === null || correction.link !== undefined || correction.list !== undefined)
          break;
        const from = working.slice(correction.at, correction.at + correction.remove);
        working = applyCorrection(working, correction);
        caret += correction.insert.length - correction.remove;
        changes.push({
          at: base + correction.at,
          from,
          to: correction.insert,
          rule: correction.rule,
        });
      }
    }
    // the straight quotes of the paragraph become the language's quotes, from the end backwards
    if (prefs.autocorrect.quotes) {
      for (let i = working.length - 1; i >= 0; i -= 1) {
        const char = working.charAt(i);
        if (char !== '"' && char !== "'") continue;
        const quote = smartQuote(working.slice(0, i) + working.slice(i + 1), i, char, language);
        if (quote === null || quote === char) continue;
        working = working.slice(0, i) + quote + working.slice(i + 1);
        changes.push({ at: base + i, from: char, to: quote, rule: 'quotes' });
      }
    }
    base += paragraph.length + 1;
    return working;
  });
  changes.sort((a, b) => a.at - b.at);
  return { text: out.join('\n'), changes };
}

export async function textAutocorrect(
  deps: PrefsLaneDeps,
  ctx: WriteContext,
  input: TextAutocorrectInput,
): Promise<{ changes: AutocorrectChange[]; revision: number }> {
  const current = (await deps.store.read()).document;
  const prefs =
    deps.preferences === undefined ? defaultPreferences() : await deps.preferences.load();
  const language = deckLanguage(current);
  const exceptions = [...prefs.spelling.dictionary, ...deps.lint.tokens, ...deps.lint.properNouns];
  const changes: AutocorrectChange[] = [];
  const mutations: Mutation[] = [];
  for (const target of autocorrectTargets(current, input)) {
    const result = target.plain
      ? autocorrectPlain(target.text, prefs, language, exceptions)
      : autocorrectText(target.text, prefs, language, { exceptions });
    if (result.changes.length === 0 || result.text === target.text) continue;
    for (const change of result.changes)
      changes.push({
        slideId: target.slideId,
        blockId: target.blockId,
        path: target.path,
        from: change.from,
        to: change.to,
        rule: change.rule,
      });
    mutations.push(target.write(result.text));
  }
  if (input.dryRun === true || mutations.length === 0) {
    if (mutations.length === 0 && input.baseRevision !== current.deck.revision)
      throw new ConflictError(
        `baseRevision ${input.baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    return { changes, revision: current.deck.revision };
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return { changes, revision: committed.revision };
}

// ---------------------------------------------------------------------------------------------
// version.delete (SPEC-5 7.7, 0.42; SPEC-3 0.45)

export type VersionDeleteInput = { upTo?: number; all?: boolean; confirm: true };

/**
 * The records a `version.delete` removes (pure): every record under `all`; with `upTo`, the
 * record and every older one except the named versions, which stay (Google keeps named versions
 * unless the whole history goes). The newest record never goes under `upTo` when it is the only
 * one left, so the log keeps its head.
 */
export function versionDeletePlan(
  records: ReadonlyArray<Pick<VersionRecord, 'n' | 'note'>>,
  input: VersionDeleteInput,
): { remove: number[]; keep: number[] } {
  if (input.all === true) return { remove: records.map((record) => record.n), keep: [] };
  const upTo = input.upTo ?? 0;
  const remove: number[] = [];
  const keep: number[] = [];
  for (const record of records) {
    if (record.n <= upTo && record.note === '') remove.push(record.n);
    else keep.push(record.n);
  }
  return { remove, keep };
}

export async function versionDelete(
  deps: PrefsLaneDeps,
  input: VersionDeleteInput,
): Promise<{ deleted: number; kept: number }> {
  if (input.confirm !== true) throw new TypeError('version.delete needs confirm: true');
  const port = deps.versions;
  if (port === undefined) throw new Error(noVersionsPort());
  if (port.reauthenticated !== undefined && !(await port.reauthenticated())) {
    const error = new Error(REAUTHENTICATE_SENTENCE) as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  const records = await deps.store.records();
  if (input.upTo !== undefined && !records.some((record) => record.n === input.upTo))
    throw new RangeError(`No version ${input.upTo}`);
  const plan = versionDeletePlan(records, input);
  if (plan.remove.length > 0) await port.remove(plan.remove);
  return { deleted: plan.remove.length, kept: plan.keep.length };
}

// ---------------------------------------------------------------------------------------------
// The remaining rows (SPEC-5 7.7): the widened inputs over the existing handlers

/** The guide colour key of `DeckGuides.colors` (integrator.md 7.5): `x:800`, `y:450`. */
export function guideColorKey(axis: 'x' | 'y', at: number): string {
  return `${axis}:${Math.round(at)}`;
}

type GuidesColorsInput = DeckGuidesInput & { colors?: Record<string, string | null> };

/** The guides after the geometry edit and the colour writes, colours of guides that left dropped. */
export function guidesWithColors(
  current: DeckGuides | undefined,
  input: GuidesColorsInput,
  page: ReturnType<typeof deckPage>,
): DeckGuides | undefined {
  const { baseRevision: _base, colors, ...edit } = input;
  const geometry = applyGuides(current, edit, page);
  const merged: Record<string, string> = { ...(current?.colors ?? {}) };
  for (const [key, value] of Object.entries(colors ?? {})) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  if (geometry === undefined) return undefined;
  const present = new Set([
    ...geometry.x.map((at) => guideColorKey('x', at)),
    ...geometry.y.map((at) => guideColorKey('y', at)),
  ]);
  const kept = Object.fromEntries(Object.entries(merged).filter(([key]) => present.has(key)));
  const next: DeckGuides = { x: geometry.x, y: geometry.y };
  if (Object.keys(kept).length > 0) next.colors = kept as DeckGuides['colors'];
  return next;
}

export async function deckGuidesWithColors(
  deps: PrefsLaneDeps,
  ctx: WriteContext,
  input: GuidesColorsInput,
): Promise<{ guides: DeckGuides | null; revision: number }> {
  if (input.colors === undefined) return deckGuides(deps, ctx, input);
  const current = (await deps.store.read()).document;
  const next = guidesWithColors(current.deck.guides, input, deckPage(current.deck));
  if (jsonEqual(next ?? null, current.deck.guides ?? null)) {
    if (input.baseRevision !== current.deck.revision)
      throw new ConflictError(
        `baseRevision ${input.baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    return { guides: current.deck.guides ?? null, revision: current.deck.revision };
  }
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'deck.set', path: '/guides', ...(next !== undefined ? { value: next } : {}) },
  ]);
  return { guides: committed.document.deck.guides ?? null, revision: committed.revision };
}

type TextIndentWideInput = TextIndentInput & { firstLine?: number | null; hanging?: number | null };

/** The typography write of a text block: the fields set, null clearing, an empty record removed. */
function typographyMutation(
  slide: Slide,
  blockId: string,
  edits: Record<string, number | null | undefined>,
): Mutation[] {
  const block = requireBlock(slide, blockId) as Block & { typography?: Record<string, unknown> };
  if (block.type === 'plain' || block.type === 'table' || block.type === 'chart')
    throw new TypeError(`Block "${blockId}" is a ${block.type}; it carries no typography`);
  const typography: Record<string, unknown> = { ...(block.typography ?? {}) };
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue;
    if (value === null) delete typography[key];
    else typography[key] = value;
  }
  const next = Object.keys(typography).length === 0 ? undefined : typography;
  if (jsonEqual(next, block.typography)) return [];
  return [
    {
      op: 'block.set',
      slideId: slide.id,
      blockId,
      path: '/typography',
      ...(next === undefined ? {} : { value: next }),
    },
  ];
}

export async function textIndentWide(
  deps: PrefsLaneDeps,
  ctx: WriteContext,
  input: TextIndentWideInput,
): Promise<SlideResult> {
  if (input.firstLine === undefined && input.hanging === undefined)
    return textIndent(deps, ctx, input);
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const mutations: Mutation[] = [];
  for (const blockId of input.blockIds) {
    const block = requireBlock(slide, blockId) as Block & { typography?: Record<string, unknown> };
    const currentIndent =
      typeof block.typography?.['indent'] === 'number' ? (block.typography['indent'] as number) : 0;
    const indent =
      input.to !== undefined
        ? input.to
        : input.by !== undefined
          ? Math.max(0, currentIndent + input.by * INDENT_STEP_PX)
          : undefined;
    mutations.push(
      ...typographyMutation(slide, blockId, {
        ...(indent === undefined ? {} : { indent: indent === 0 ? null : indent }),
        ...(input.firstLine === undefined
          ? {}
          : { firstLine: input.firstLine === 0 ? null : input.firstLine }),
        ...(input.hanging === undefined
          ? {}
          : { hanging: input.hanging === 0 ? null : input.hanging }),
      }),
    );
  }
  return commitSlide(deps, ctx, input.baseRevision, current, input.slideId, mutations);
}

type TextListWideInput = TextListInput & {
  start?: number | null;
  prefix?: string | null;
  suffix?: string | null;
};

export async function textListWide(
  deps: PrefsLaneDeps,
  ctx: WriteContext,
  input: TextListWideInput,
): Promise<SlideResult> {
  const { start, prefix, suffix, ...base } = input;
  if (start === undefined && prefix === undefined && suffix === undefined)
    return textList(deps, ctx, base);
  if (
    base.marker !== undefined ||
    base.preset !== undefined ||
    base.level !== undefined ||
    base.levelBy !== undefined ||
    base.items !== undefined
  )
    throw new TypeError(
      'text.list writes start, prefix and suffix alone; the marker, the preset and the levels are a second call',
    );
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const block = requireBlock(slide, input.blockId);
  if (block.type !== 'plain')
    throw new TypeError(`Block "${input.blockId}" is a ${block.type}, not a list`);
  const mutations: Mutation[] = [];
  const field = (
    name: 'start' | 'prefix' | 'suffix',
    value: number | string | null | undefined,
  ): void => {
    if (value === undefined) return;
    const currentValue = (block as unknown as Record<string, unknown>)[name];
    const next =
      value === null || (name === 'start' && value === 1) || value === '' ? undefined : value;
    if (jsonEqual(next, currentValue)) return;
    mutations.push({
      op: 'block.set',
      slideId: slide.id,
      blockId: block.id,
      path: `/${name}`,
      ...(next === undefined ? {} : { value: next }),
    });
  };
  field('start', start);
  field('prefix', prefix);
  field('suffix', suffix);
  return commitSlide(deps, ctx, input.baseRevision, current, input.slideId, mutations);
}

/** Google's nine edge selections (SPEC-5 7.7; `CELL_BORDER_EDGES`). */
export type CellBorderEdgeName =
  'all' | 'outer' | 'inner' | 'top' | 'bottom' | 'left' | 'right' | 'horizontal' | 'vertical';

type TableCellStyleWideInput = TableCellStyleInput & { edges?: CellBorderEdgeName[] };

type Edge = 'top' | 'bottom' | 'left' | 'right';

/** The edges of one cell a picker selection paints, over the selection's bounding range. */
export function edgesOfCell(
  cell: [number, number],
  range: { r0: number; c0: number; r1: number; c1: number },
  edges: ReadonlyArray<CellBorderEdgeName>,
): Edge[] {
  const [row, column] = cell;
  const out = new Set<Edge>();
  for (const edge of edges) {
    switch (edge) {
      case 'all':
        out.add('top').add('bottom').add('left').add('right');
        break;
      case 'outer':
        if (row === range.r0) out.add('top');
        if (row === range.r1) out.add('bottom');
        if (column === range.c0) out.add('left');
        if (column === range.c1) out.add('right');
        break;
      case 'inner':
        if (row < range.r1) out.add('bottom');
        if (column < range.c1) out.add('right');
        break;
      case 'horizontal':
        if (row < range.r1) out.add('bottom');
        break;
      case 'vertical':
        if (column < range.c1) out.add('right');
        break;
      case 'top':
        if (row === range.r0) out.add('top');
        break;
      case 'bottom':
        if (row === range.r1) out.add('bottom');
        break;
      case 'left':
        if (column === range.c0) out.add('left');
        break;
      case 'right':
        if (column === range.c1) out.add('right');
        break;
    }
  }
  return [...out];
}

/** The cell styles after an edge picker write: the named edges take the border, null clears them. */
export function cellStylesWithEdges(
  block: TableBlock,
  cells: ReadonlyArray<[number, number]>,
  border: CellBorder | null | undefined,
  edges: ReadonlyArray<CellBorderEdgeName>,
  fill?: TableCellStyle['fill'] | null,
): TableCellStyle[] {
  const rows = block.rows.length;
  const columns = block.columns.length;
  const clamp = ([r, c]: [number, number]): [number, number] => [
    Math.max(0, Math.min(rows - 1, r)),
    Math.max(0, Math.min(columns - 1, c)),
  ];
  const picked = cells.map(clamp);
  const range = {
    r0: Math.min(...picked.map(([r]) => r)),
    r1: Math.max(...picked.map(([r]) => r)),
    c0: Math.min(...picked.map(([, c]) => c)),
    c1: Math.max(...picked.map(([, c]) => c)),
  };
  const styles: TableCellStyle[] = (block.cells ?? []).map((style) => ({
    ...style,
    ...(style.border === undefined ? {} : { border: { ...style.border } }),
  }));
  const edgeValue: CellEdgeBorder | null | undefined =
    border === undefined
      ? undefined
      : border === null
        ? null
        : {
            ...(border.color === undefined ? {} : { color: border.color }),
            ...(border.weight === undefined ? {} : { weight: border.weight }),
            ...(border.dash === undefined ? {} : { dash: border.dash }),
          };
  for (const cell of picked) {
    const [row, column] = cell;
    let index = styles.findIndex((style) => style.row === row && style.column === column);
    if (index < 0) {
      styles.push({ row, column });
      index = styles.length - 1;
    }
    const style = styles[index] as TableCellStyle;
    if (fill === null) delete style.fill;
    else if (fill !== undefined) style.fill = fill;
    const current: CellBorder = { ...(style.border ?? {}) };
    for (const edge of edgesOfCell(cell, range, edges)) {
      if (edgeValue === null || edgeValue === undefined) delete current[edge];
      else current[edge] = { ...edgeValue };
    }
    const hasEdge = (['top', 'bottom', 'left', 'right'] as Edge[]).some(
      (edge) => current[edge] !== undefined,
    );
    const hasBase =
      current.color !== undefined || current.weight !== undefined || current.dash !== undefined;
    if (hasEdge || hasBase) style.border = current;
    else delete style.border;
  }
  return styles.filter((style) => style.fill !== undefined || style.border !== undefined);
}

export async function tableCellStyleWide(
  deps: PrefsLaneDeps,
  ctx: WriteContext,
  input: TableCellStyleWideInput,
): Promise<SlideResult> {
  const { edges, ...base } = input;
  if (edges === undefined || edges.length === 0 || (edges.length === 1 && edges[0] === 'all'))
    return tableCellStyle(deps, ctx, base);
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const block = requireBlock(slide, input.blockId);
  if (block.type !== 'table')
    throw new TypeError(`Block "${input.blockId}" is a ${block.type}, not a table`);
  const styles = cellStylesWithEdges(block, input.cells, input.border, edges, input.fill);
  const mutations: Mutation[] = jsonEqual(styles, block.cells ?? [])
    ? []
    : [
        {
          op: 'block.set',
          slideId: slide.id,
          blockId: block.id,
          path: '/cells',
          ...(styles.length === 0 ? {} : { value: styles }),
        },
      ];
  return commitSlide(deps, ctx, input.baseRevision, current, input.slideId, mutations);
}

async function commitSlide(
  deps: StoreActionDeps,
  ctx: WriteContext,
  baseRevision: number,
  current: DeckDocument,
  slideId: string,
  mutations: Mutation[],
): Promise<SlideResult> {
  if (mutations.length === 0) {
    if (baseRevision !== current.deck.revision)
      throw new ConflictError(
        `baseRevision ${baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    return { slide: requireSlide(current, slideId), revision: current.deck.revision, findings: [] };
  }
  const committed = await commit(deps, ctx, baseRevision, mutations);
  return {
    slide: requireSlide(committed.document, slideId),
    revision: committed.revision,
    findings: [],
  };
}

export function registerPrefsActions(dispatcher: Dispatcher, deps: PrefsLaneDeps): void {
  const storeOf = (id: string): PreferencesStore => {
    const store = deps.preferences;
    if (store === undefined) throw new Error(noPreferencesStore(id));
    return store;
  };

  dispatcher.register('prefs.get', async (input) => {
    const { path = '' } = input as { path?: string };
    const value = getPreference(await storeOf('prefs.get').load(), path);
    return value === undefined ? { path } : { path, value };
  });

  dispatcher.register('prefs.set', async (input) => {
    const { path, value } = input as PreferenceWrite;
    const store = storeOf('prefs.set');
    const next = setPreference(await store.load(), path, value);
    return { preferences: await store.save(next) };
  });

  dispatcher.register('text.autocorrect', (input, ctx) =>
    textAutocorrect(deps, ctx as WriteContext, input as TextAutocorrectInput),
  );
  dispatcher.register('version.delete', (input) =>
    versionDelete(deps, input as VersionDeleteInput),
  );

  /* the remaining rows of SPEC-5 7.7 over the existing handlers (the later registration wins) */
  dispatcher.register('deck.guides', (input, ctx) =>
    deckGuidesWithColors(deps, ctx as WriteContext, input as GuidesColorsInput),
  );
  dispatcher.register('text.indent', (input, ctx) =>
    textIndentWide(deps, ctx as WriteContext, input as TextIndentWideInput),
  );
  dispatcher.register('text.list', (input, ctx) =>
    textListWide(deps, ctx as WriteContext, input as TextListWideInput),
  );
  dispatcher.register('table.cellStyle', (input, ctx) =>
    tableCellStyleWide(deps, ctx as WriteContext, input as TableCellStyleWideInput),
  );
}
