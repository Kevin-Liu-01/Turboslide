import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { Block, PlainBlock, ShapeBlock } from '@turboslide/schema/blocks';
import type { ChartBlock } from '@turboslide/schema/blocks/chart';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import { CATALOG, LAYOUT_CATALOG, blockAssetRefs } from '@turboslide/schema/catalog';
import type { Deck, LayoutType, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { BlockId } from '@turboslide/schema/ids';
import { derivedLayout, layoutEntry } from '@turboslide/schema/layouts';
import type { Mutation } from '@turboslide/schema/mutations';
import { isLineKind } from '@turboslide/schema/shapes';

import type { EditorDispatch } from './dispatch';
import type { EditorHandle, EditorSelection, PictureTarget } from './editor-shell';
import { pseudoBlockOf, selectionGroup } from './editor-shell';
import { Icon } from './icons';
import type { IconName } from './icons';
import { AltTextSection } from './inspector/alt';
import type { SectionWrite } from './inspector/fields';
import { TextFittingSection } from './inspector/fitting';
import {
  FORMAT_SECTIONS,
  presentFormatSections,
  FORMAT_SECTION_BY_ID,
  formatSectionOfBlockControl,
  formatSectionOfSlideControl,
  hasAdjustments,
  hasAltText,
  hasDither,
  hasPicture,
  hasShadow,
  hasTextFitting,
  isOwnSectionPath,
  sectionsInOrderFor,
} from './inspector/format-sections';
import type { FormatSectionId } from './inspector/format-sections';
import type { ControlSpec, Generated } from './inspector/generate';
import { POSITION_PATH, blockControls, slideControls } from './inspector/generate';
import { PositionSection, SizeRotationSection } from './inspector/geometry';
import type { GeometryBox } from './inspector/geometry';
import { LineSection } from './inspector/line';
import { ListSection } from './inspector/list';
import { DitherFormatSection } from './inspector/dither';
import { AdjustmentsSection, PictureSection } from './inspector/picture';
import type { ControlContext } from './inspector/props';
import { ShadowSection } from './inspector/shadow';
import { ShaderSection } from './inspector/shader';
import { ShapeSection } from './inspector/shape';
import { TextMarksSection } from './inspector/text-marks';
import { groupRows, layoutForType } from './Inspector';
import { InspectorControl } from './InspectorControl';
import { cn } from './lib/cn';
import { FORMAT, PANELS } from './menus/strings';
import { Panel } from './Panel';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './FormatOptions.css';

/**
 * Format options (gslides-parity SPEC 3.9, 12 "Panels"; SPEC-2 section 5; R05 B7): the
 * Inspector regrouped at 320 px, opened on demand, one panel at a time, sections in Google's order
 * and named in Google's words. Size & rotation (Width, Height, Lock aspect ratio, Rotate as a
 * field and a dial, the two flips) and Position (From, X, Y) show for every object of every slide
 * kind and for a group over its union; Text fitting, Text, Colour, Picture, Adjustments, Drop
 * shadow, Table, Chart data, Line, Shape, List and Alt text follow as SPEC-2 section 5 lists them;
 * the round one generated rows keep drawing the fields no section covers under the block's own
 * Options. The Chart data grid and the round two Table rows are drawn by another builder's
 * components through `FormatOptionsSlots`, passed by the route. `openSection` opens the panel at a
 * section (Text fitting, Drop shadow, Alt text, Edit data from the menus). No JSON pointer, action
 * id or block id appears in a label or a tooltip; the accessible label and `data-control` stay in
 * the DOM for the window API.
 */
export type ChartSectionProps = {
  block: ChartBlock;
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  busy: boolean;
  /** reports a rejected write in the panel's notice line */
  report: (promise: Promise<unknown>) => void;
};

export type TableSectionProps = {
  block: TableBlock;
  selection: EditorSelection | null | undefined;
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  busy: boolean;
  report: (promise: Promise<unknown>) => void;
};

/** The sections another builder draws inside this panel (SPEC-2 section 5: Chart data, Table). */
export type FormatOptionsSlots = {
  chart?: (props: ChartSectionProps) => ReactNode;
  table?: (props: TableSectionProps) => ReactNode;
};

export type FormatOptionsProps = {
  deck: Deck;
  slide: Slide;
  blockId?: BlockId;
  /** the whole selection, for a group and for the caret's range and marks */
  selection?: EditorSelection | null;
  revision: number;
  dispatch: EditorDispatch;
  /** one write of arbitrary mutations (the alt text writes the asset) */
  commit?: (mutations: Mutation[], label: string) => Promise<unknown>;
  findings?: ReadonlyArray<Finding>;
  lintText?: ControlContext['lintText'];
  assetUrl?: (path: string) => string;
  /** the Layout section's Change button */
  onChangeLayout?: (anchor: HTMLElement) => void;
  /** the Shader section's Change: opens the gallery for the selected block (docs/FEATURES.md 5.3) */
  onChangeShader?: (anchor: HTMLElement) => void;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  /** the canvas gestures the sections drive (crop mode, rotation about a group) */
  editor?: EditorHandle;
  /** the stage's measured boxes for blocks without `pos`, in sheet px */
  measuredBoxes?: Readonly<Record<string, GeometryBox>>;
  /** Replace image's file picker */
  uploadPicture?: (target: PictureTarget) => void;
  say?: (text: string) => void;
  /** the section to open and scroll to when the panel opens from a menu row */
  openSection?: FormatSectionId | null;
  slots?: FormatOptionsSlots;
  /** Tools > Advanced tools: the parked sections (Dither, Drop shadow, Table, Chart data, Shape, Alt text) draw only while on (docs/FOCUS.md 3.2) */
  advancedTools?: boolean;
};

function routeSlide(spec: ControlSpec): FormatSectionId | null {
  return formatSectionOfSlideControl(spec);
}

/**
 * The collapsed sections this browser remembers (docs/PRODUCT.md 3.2; audit-interface 15): the
 * panel reopens with the set a seller left, beside the shell's own `ts-editor-settings` key,
 * which keeps a fixed list of settings (editor-shell.ts readStoredSettings). A read that throws
 * (a private window, no storage) answers an empty set.
 */
export const FORMAT_OPTIONS_STORAGE = 'ts-editor-settings:formatOptions';

/** The remembered collapsed set from a stored value: a JSON array of section ids; anything else is none. */
export function readCollapsedSections(saved: string | null): Set<FormatSectionId> {
  if (saved === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (id): id is FormatSectionId => typeof id === 'string' && id in FORMAT_SECTION_BY_ID,
      ),
    );
  } catch {
    return new Set();
  }
}

/** The stored form of the collapsed set. */
export function writeCollapsedSections(closed: ReadonlySet<FormatSectionId>): string {
  return JSON.stringify([...closed]);
}

function loadCollapsed(): Set<FormatSectionId> {
  if (typeof window === 'undefined') return new Set();
  try {
    return readCollapsedSections(window.localStorage.getItem(FORMAT_OPTIONS_STORAGE));
  } catch {
    return new Set();
  }
}

function storeCollapsed(closed: ReadonlySet<FormatSectionId>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FORMAT_OPTIONS_STORAGE, writeCollapsedSections(closed));
  } catch {
    // no storage: the set lives for this panel alone
  }
}

/**
 * The sections shown collapsed when the panel opens (docs/PRODUCT.md 3.2): from a menu row that
 * names a section (Format > Text fitting) that section alone is open; from the toolbar and on a
 * reopen the remembered set stands. Pure over the ids the panel draws.
 */
export function openingCollapsed(
  shown: ReadonlyArray<FormatSectionId>,
  remembered: ReadonlySet<FormatSectionId>,
  openSection: FormatSectionId | null,
): Set<FormatSectionId> {
  if (openSection === null) return new Set([...remembered].filter((id) => shown.includes(id)));
  return new Set(shown.filter((id) => id !== openSection));
}

function Section({
  id,
  title,
  open,
  onToggle,
  disabled,
  children,
}: {
  id: FormatSectionId;
  title?: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const meta = FORMAT_SECTION_BY_ID[id];
  const icon: IconName = meta.icon;
  const name = title ?? meta.title;
  return (
    <section className={cn('ts-panel-section', !open && 'is-closed')} data-section={id}>
      <button
        type="button"
        className={cn('ts-panel-section-head', disabled && 'is-disabled')}
        aria-expanded={disabled ? undefined : open}
        aria-disabled={disabled ? true : undefined}
        data-control={`formatOptions.${id}`}
        data-section-toggle={`formatOptions.section.${id}.toggle`}
        data-status={disabled ? 'later' : 'now'}
        onClick={disabled ? undefined : onToggle}
        {...tipProps({ name, doc: meta.doc })}
      >
        <Icon name={icon} />
        <span>{name}</span>
        {disabled ? null : <Icon name="chevron-down" />}
      </button>
      {open && !disabled ? <div className="ts-panel-section-body">{children}</div> : null}
    </section>
  );
}

/** The blocks a selection names on the slide, a fixed kind's fields included (SPEC-2 1.1). */
function selectedBlocksOf(
  slide: Slide,
  selection: EditorSelection | null | undefined,
  blockId?: BlockId,
): Block[] {
  const ids = selection?.blockIds ?? (blockId === undefined ? [] : [blockId]);
  const placed = slideBlocks(slide);
  return ids
    .map((id) => placed.find(({ block }) => block.id === id)?.block ?? pseudoBlockOf(slide, id))
    .filter((block): block is Block => block !== undefined);
}

export function FormatOptions({
  deck,
  slide,
  blockId,
  selection,
  revision,
  dispatch,
  findings = [],
  lintText,
  assetUrl,
  onChangeLayout,
  onChangeShader,
  onClose,
  busy = false,
  className,
  editor,
  measuredBoxes,
  uploadPicture,
  say,
  openSection = null,
  slots,
  advancedTools = false,
}: FormatOptionsProps) {
  /* the remembered collapsed set (this browser's) and the set shown now: a menu row that opens
     the panel at one section closes the others for this opening without touching the memory */
  const remembered = useRef<Set<FormatSectionId>>(loadCollapsed());
  const [closed, setClosed] = useState<ReadonlySet<FormatSectionId>>(() =>
    openSection === null
      ? new Set(remembered.current)
      : openingCollapsed(
          FORMAT_SECTIONS.map((section) => section.id),
          remembered.current,
          openSection,
        ),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const toggle = (id: FormatSectionId) => {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClosed(next);
    const memory = new Set(remembered.current);
    if (next.has(id)) memory.add(id);
    else memory.delete(id);
    remembered.current = memory;
    storeCollapsed(memory);
  };
  const isOpen = (id: FormatSectionId) => !closed.has(id);

  /* a menu row opened the panel at a section: that section alone is open, and it comes into view */
  useEffect(() => {
    if (openSection === null) return;
    setClosed(
      openingCollapsed(
        FORMAT_SECTIONS.map((section) => section.id),
        remembered.current,
        openSection,
      ),
    );
    const el = root.current
      ?.closest('.ts-panel')
      ?.querySelector<HTMLElement>(`[data-section="${openSection}"]`);
    if (el !== null && el !== undefined && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'start' });
    el?.querySelector<HTMLElement>('.ts-panel-section-head')?.focus();
  }, [openSection]);

  const report = (promise: Promise<unknown>) => {
    setNotice(null);
    promise.catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : String(error)),
    );
  };

  const freeform = slide.kind === 'content' && slide.layout.type === 'freeform';
  const blocks = selectedBlocksOf(slide, selection, blockId);
  const selected: Block | undefined = blocks.find((block) => block.id === blockId) ?? blocks[0];
  const group = selectionGroup(slide, selection);
  const many = blocks.length > 1;
  const write: SectionWrite = {
    slideId: slide.id,
    revision,
    dispatch,
    busy,
    report,
    ...(editor === undefined ? {} : { editor }),
  };

  const writeSlide = (path: string, value: unknown) => {
    if (path === '/layout' && typeof value === 'string' && value in LAYOUT_CATALOG) {
      report(
        dispatch('slide.setLayout', {
          slideId: slide.id,
          layout: layoutForType(value as LayoutType),
          baseRevision: revision,
        }),
      );
      return;
    }
    report(
      dispatch('slide.update', {
        slideId: slide.id,
        baseRevision: revision,
        mutations: [
          { op: 'slide.set', slideId: slide.id, path, ...(value !== undefined ? { value } : {}) },
        ],
      }),
    );
  };

  const writeBlock = (path: string, value: unknown) => {
    if (!selected) return;
    report(
      dispatch('block.set', {
        slideId: slide.id,
        blockId: selected.id,
        path,
        ...(value !== undefined ? { value } : {}),
        baseRevision: revision,
      }),
    );
  };

  const context: ControlContext = {
    assets: deck.assets,
    ...(assetUrl ? { assetUrl } : {}),
    ...(lintText ? { lintText } : {}),
  };

  const blockFindings = selected
    ? findings.filter((finding) => finding.blockId === selected.id)
    : [];
  const slideFindings = findings.filter((finding) => finding.blockId === undefined);

  const renderRows = (
    generated: Generated,
    target: unknown,
    write: (path: string, value: unknown) => void,
    rowFindings: ReadonlyArray<Finding>,
  ) =>
    groupRows(generated).map((row) => {
      if (row.kind === 'control') {
        return (
          <InspectorControl
            key={row.spec.control}
            spec={row.spec}
            context={context}
            disabled={busy}
            findings={rowFindings}
            onChange={(value) => write(row.spec.path, value)}
          />
        );
      }
      const list = (target as Record<string, unknown> | undefined)?.[row.array.path.slice(1)];
      const items = Array.isArray(list) ? (list as unknown[]) : [];
      const canRemove = items.length > row.array.minItems;
      const itemWord = row.array.label.replace(/^[^:]+:\s*/, '').replace(/s$/, '');
      return (
        <div key={row.array.control} className="ts-insp-array" data-path={row.array.path}>
          {row.items.map((item) => (
            <div key={item.index} className="ts-insp-item">
              <div className="ts-insp-item-head">
                <span>
                  {itemWord} {item.index + 1}
                </span>
                <ToolButton
                  title={`Remove ${itemWord.toLowerCase()} ${item.index + 1}`}
                  doc={
                    canRemove
                      ? 'Removes this item'
                      : `The list keeps at least ${row.array.minItems}`
                  }
                  ariaLabel={`${row.array.label} remove ${item.index + 1}`}
                  icon="close"
                  className="ts-insp-item-remove"
                  control={`${row.array.control}.${item.index}.remove`}
                  disabled={!canRemove}
                  onClick={() => {
                    if (canRemove)
                      write(
                        row.array.path,
                        items.filter((_entry, index) => index !== item.index),
                      );
                  }}
                />
              </div>
              {item.controls.map((spec) => (
                <InspectorControl
                  key={spec.control}
                  spec={spec}
                  context={context}
                  disabled={busy}
                  findings={rowFindings}
                  onChange={(value) => write(spec.path, value)}
                />
              ))}
            </div>
          ))}
          <div className="ts-insp-row is-add">
            <ToolButton
              title={`Add ${itemWord.toLowerCase()}`}
              doc="Appends a blank item"
              ariaLabel={`${row.array.label} add`}
              label="Add"
              icon="plus"
              control={`${row.array.control}.add`}
              onClick={() => write(row.array.path, [...items, row.array.blank()])}
            />
          </div>
        </div>
      );
    });

  /* the slide's own controls: Layout and the picture */
  const slideGenerated = slideControls(slide, deck.sections);
  const bySlideSection = new Map<FormatSectionId, ControlSpec[]>();
  for (const spec of slideGenerated.controls) {
    const section = routeSlide(spec);
    if (section === null) continue;
    bySlideSection.set(section, [...(bySlideSection.get(section) ?? []), spec]);
  }

  /* the block's generated controls by section; the round two fields the sections draw themselves are left out */
  const stored =
    selected !== undefined && slideBlocks(slide).some(({ block }) => block.id === selected.id);
  const blockGenerated =
    selected !== undefined && stored ? blockControls(selected, { freeform }) : undefined;
  const byBlockSection = new Map<FormatSectionId, Generated>();
  if (blockGenerated !== undefined && selected !== undefined) {
    for (const spec of blockGenerated.controls) {
      if (spec.kind === 'position' && spec.path === POSITION_PATH) continue;
      if (isOwnSectionPath(spec.path) && spec.path !== '/marker' && spec.path !== '/preset') {
        /* the chart and table fields go to their slots; the rest are the sections' own */
        if (selected.type !== 'chart' && selected.type !== 'table') continue;
      }
      if (selected.type === 'plain' && (spec.path === '/marker' || spec.path === '/preset'))
        continue;
      const section = formatSectionOfBlockControl(spec, selected);
      if (section === null) continue;
      if (
        section === 'shape' ||
        section === 'line' ||
        section === 'shadow' ||
        section === 'adjustments' ||
        section === 'altText' ||
        section === 'textFitting'
      )
        continue;
      const entry = byBlockSection.get(section) ?? { controls: [], arrays: [] };
      entry.controls.push(spec);
      byBlockSection.set(section, entry);
    }
    for (const array of blockGenerated.arrays) {
      const section: FormatSectionId =
        selected.type === 'table'
          ? 'table'
          : selected.type === 'chart'
            ? 'chart'
            : LIST_LIKE.has(selected.type)
              ? 'list'
              : PICTURE_LIKE.has(selected.type)
                ? 'picture'
                : 'block';
      const entry = byBlockSection.get(section) ?? { controls: [], arrays: [] };
      entry.arrays.push(array);
      byBlockSection.set(section, entry);
    }
  }

  /* the alt text of a block that shows an asset is the asset's description (SPEC-2 0.51) */
  const altAsset =
    selected !== undefined && hasAltText(selected)
      ? deck.assets[blockAssetRefs(selected)[0]?.assetId ?? '']
      : undefined;
  const layoutName = layoutEntry(derivedLayout(slide)).label;
  const layoutRows = bySlideSection.get('layout') ?? [];
  const slidePictureRows = bySlideSection.get('picture') ?? [];
  const isObject = selected !== undefined;
  const textish =
    selected !== undefined &&
    (selected.type === 'heading' ||
      selected.type === 'paragraph' ||
      selected.type === 'text' ||
      selected.type === 'box' ||
      selected.type === 'table' ||
      (selected.type === 'shape' && !isLineKind(selected.shape)));

  const sectionsFiltered = presentFormatSections(FORMAT_SECTIONS, advancedTools).filter(
    (section) => {
      switch (section.id) {
        case 'size':
        case 'position':
          return isObject;
        case 'layout':
          return selected === undefined || !freeform;
        case 'textFitting':
          return (
            selected !== undefined &&
            !many &&
            (hasTextFitting(selected) || selected.type === 'table')
          );
        case 'text':
          return (
            textish ||
            (byBlockSection.get('text')?.controls.length ?? 0) > 0 ||
            (many && blocks.some((b) => 'typography' in b))
          );
        case 'colour':
          return (
            (byBlockSection.get('colour')?.controls.length ?? 0) > 0 ||
            (selected?.type === 'text' && selected.outline !== undefined)
          );
        case 'picture':
          return (
            (selected !== undefined && !many && hasPicture(selected)) ||
            (byBlockSection.get('picture')?.controls.length ?? 0) +
              (byBlockSection.get('picture')?.arrays.length ?? 0) >
              0 ||
            (selected === undefined && slidePictureRows.length > 0)
          );
        case 'adjustments':
          return selected !== undefined && !many && hasAdjustments(selected);
        case 'dither':
          // the deck's two tone screen over a picture object or a shot (gslides-parity SPEC-3 10.3;
          // the integrator at merge 2 for b5.md request 7)
          return selected !== undefined && !many && hasDither(selected);
        case 'shadow':
          return selected !== undefined && (many ? blocks.some(hasShadow) : hasShadow(selected));
        case 'table':
          return selected?.type === 'table' && !many;
        case 'chart':
          return selected?.type === 'chart' && !many;
        case 'shader':
          /* the features round, ship two (docs/FEATURES.md 5.3): one shader block's one home */
          return selected?.type === 'material' && !many;
        case 'line':
          return selected?.type === 'shape' && isLineKind(selected.shape) && !many;
        case 'shape':
          return selected?.type === 'shape' && !isLineKind(selected.shape) && !many;
        case 'list':
          return (
            selected?.type === 'plain' ||
            (byBlockSection.get('list')?.controls.length ?? 0) +
              (byBlockSection.get('list')?.arrays.length ?? 0) >
              0
          );
        case 'altText':
          return selected !== undefined && !many;
        case 'block': {
          const entry = byBlockSection.get('block');
          return entry !== undefined && entry.controls.length + entry.arrays.length > 0;
        }
        default:
          return false;
      }
    },
  );
  /* a chart's data is what a seller opens the panel for (docs/RETURN.md 2.5: "the round makes the
     grid the first thing the panel shows for a chart"), and so is a table's Table section
     (docs/FEATURES.md 2.2 rank 13; audit-objects 22: it sat last, out of view at 900 px): the
     leading section comes first; the sort is stable, so every other section keeps its order
     (return/build/b5.md request 4) */
  const sectionsShown = sectionsInOrderFor(sectionsFiltered, selected);

  const empty =
    selected === undefined &&
    sectionsShown.every((section) => section.id === 'layout' || section.id === 'picture');

  const renderGenerated = (id: FormatSectionId) => {
    const entry = byBlockSection.get(id);
    return selected !== undefined &&
      entry !== undefined &&
      entry.controls.length + entry.arrays.length > 0
      ? renderRows(entry, selected, writeBlock, blockFindings)
      : null;
  };
  /* the generated rows of a chart and a table (the kind again, the categories and series as JSON,
     a second Title and Legend; the table's rows and columns as JSON) repeat what the Chart data
     and Table sections draw as controls (docs/FEATURES.md 2.2 rank 11; audit-objects 16): they
     stay behind Tools > Advanced tools for an agent's reading and never draw beside the section */
  const renderGeneratedAdvanced = (id: FormatSectionId) =>
    advancedTools ? renderGenerated(id) : null;

  return (
    <Panel
      title={PANELS.formatOptions.title}
      onClose={onClose}
      control="panel.formatOptions"
      className={cn('ts-fo', className)}
    >
      <div ref={root}>
        {notice ? (
          <p className="ts-fo-notice" role="alert">
            {notice}
          </p>
        ) : null}
        {empty && sectionsShown.length === 0 ? (
          <p className="ts-panel-empty">{PANELS.formatOptions.empty}</p>
        ) : null}
        {selected === undefined && sectionsShown.length > 0 ? (
          <p className="ts-panel-empty ts-fo-lead">{PANELS.formatOptions.empty}</p>
        ) : null}
        {many ? (
          <p className="ts-fo-lead ts-fo-count" data-control="formatOptions.count">
            {group !== undefined ? 'Group' : `${blocks.length} objects`}
          </p>
        ) : null}
        {sectionsShown.map((section) => {
          /* the key is passed on its own: a key inside a spread props object is a React warning
             the console read on every open (the pictures drive of the product round) */
          const common = {
            id: section.id,
            open: isOpen(section.id),
            onToggle: () => toggle(section.id),
          };
          switch (section.id) {
            case 'size':
              return (
                <Section key={section.id} {...common}>
                  <SizeRotationSection
                    blocks={blocks}
                    measured={measuredBoxes}
                    group={group}
                    write={write}
                  />
                  {renderGenerated('size')}
                </Section>
              );
            case 'position':
              return (
                <Section key={section.id} {...common}>
                  <PositionSection
                    blocks={blocks}
                    measured={measuredBoxes}
                    group={group}
                    write={write}
                  />
                </Section>
              );
            case 'layout':
              return (
                <Section key={section.id} {...common}>
                  <div className="ts-fo-layout">
                    <span className="ts-fo-layout-name">{layoutName}</span>
                    <ToolButton
                      label="Change"
                      title="Change layout"
                      doc="Opens the layouts; your content moves into the new layout"
                      control="formatOptions.layout.change"
                      onClick={() => {
                        const anchor = document.querySelector<HTMLElement>(
                          '[data-control="formatOptions.layout.change"]',
                        );
                        if (anchor) onChangeLayout?.(anchor);
                      }}
                    />
                  </div>
                  {renderRows(
                    { controls: layoutRows, arrays: [] },
                    slide,
                    writeSlide,
                    slideFindings,
                  )}
                </Section>
              );
            case 'textFitting':
              return selected === undefined ? null : (
                <Section key={section.id} {...common}>
                  <TextFittingSection block={selected} write={write} />
                </Section>
              );
            case 'text':
              return (
                <Section key={section.id} {...common}>
                  {renderGenerated('text')}
                  {selected !== undefined && !many && textish ? (
                    <TextMarksSection block={selected} selection={selection} write={write} />
                  ) : null}
                  {many ? (
                    <p className="ts-fo-note">Text controls apply to every member in the toolbar</p>
                  ) : null}
                </Section>
              );
            case 'colour':
              return (
                <Section key={section.id} {...common}>
                  {renderGenerated('colour')}
                  {selected?.type === 'text' && selected.outline !== undefined ? (
                    <OutlineRows block={selected} write={write} />
                  ) : null}
                </Section>
              );
            case 'picture':
              return (
                <Section key={section.id} {...common}>
                  {renderGenerated('picture')}
                  {selected !== undefined && !many && hasPicture(selected) ? (
                    <PictureSection
                      block={selected}
                      write={write}
                      uploadPicture={uploadPicture}
                      say={say ?? (() => undefined)}
                    />
                  ) : null}
                  {selected === undefined
                    ? renderRows(
                        { controls: slidePictureRows, arrays: [] },
                        slide,
                        writeSlide,
                        slideFindings,
                      )
                    : null}
                </Section>
              );
            case 'dither':
              return selected === undefined ? null : (
                <Section key={section.id} {...common}>
                  <DitherFormatSection block={selected} write={write} assets={deck.assets} />
                </Section>
              );
            case 'adjustments':
              return selected === undefined ? null : (
                <Section key={section.id} {...common}>
                  <AdjustmentsSection block={selected} write={write} />
                </Section>
              );
            case 'shadow':
              return (
                <Section key={section.id} {...common}>
                  <ShadowSection
                    blocks={
                      many ? blocks.filter(hasShadow) : selected === undefined ? [] : [selected]
                    }
                    write={write}
                  />
                </Section>
              );
            case 'table':
              return selected?.type !== 'table' ? null : (
                <Section key={section.id} {...common}>
                  {slots?.table?.({
                    block: selected as TableBlock,
                    selection,
                    slideId: slide.id,
                    revision,
                    dispatch,
                    busy,
                    report,
                  }) ?? null}
                  {renderGeneratedAdvanced('table')}
                </Section>
              );
            case 'chart':
              return selected?.type !== 'chart' ? null : (
                <Section key={section.id} {...common}>
                  {slots?.chart?.({
                    block: selected as ChartBlock,
                    slideId: slide.id,
                    revision,
                    dispatch,
                    busy,
                    report,
                  }) ?? <p className="ts-fo-note">{FORMAT.chartSlot}</p>}
                  {renderGeneratedAdvanced('chart')}
                </Section>
              );
            case 'shader':
              /* the features round, ship two (docs/FEATURES.md 5.3; build/b5/integrator-hunks.md R3):
                 the Shader section over the selected material block; the generated rows of the
                 block stay behind Advanced tools as the chart's do */
              return selected?.type !== 'material' ? null : (
                <Section key={section.id} {...common}>
                  <ShaderSection
                    block={selected}
                    deck={deck}
                    write={write}
                    settings={{ advancedTools }}
                    onChange={onChangeShader}
                  />
                  {renderGeneratedAdvanced('shader')}
                </Section>
              );
            case 'line':
              return selected?.type !== 'shape' ? null : (
                <Section key={section.id} {...common}>
                  <LineSection block={selected as ShapeBlock} write={write} />
                </Section>
              );
            case 'shape':
              return selected?.type !== 'shape' ? null : (
                <Section key={section.id} {...common}>
                  <ShapeSection block={selected as ShapeBlock} write={write} />
                </Section>
              );
            case 'list':
              return (
                <Section key={section.id} {...common}>
                  {selected?.type === 'plain' ? (
                    <ListSection block={selected as PlainBlock} write={write} />
                  ) : null}
                  {renderGenerated('list')}
                </Section>
              );
            case 'altText':
              return selected === undefined ? null : (
                <Section key={section.id} {...common}>
                  <AltTextSection block={selected} asset={altAsset} write={write} />
                </Section>
              );
            case 'block':
              return (
                <Section
                  key={section.id}
                  {...common}
                  title={selected === undefined ? undefined : CATALOG[selected.type].label}
                >
                  {renderGenerated('block')}
                </Section>
              );
            default:
              return null;
          }
        })}
      </div>
    </Panel>
  );
}

/** Word art's outline colour and weight (SPEC-2 0.62, 2.2.16) in the Colour section. */
function OutlineRows({ block, write }: { block: Block & { type: 'text' }; write: SectionWrite }) {
  const outline = block.outline;
  if (outline === undefined) return null;
  const set = (value: unknown) =>
    write.report(
      write.dispatch('block.set', {
        slideId: write.slideId,
        blockId: block.id,
        path: '/outline',
        ...(value === undefined ? {} : { value }),
        baseRevision: write.revision,
      }),
    );
  return (
    <div className="ts-fo-row">
      <span className="ts-fo-field-label">{FORMAT.colour.outlineWeight}</span>
      <div
        className="ts-fo-toggles"
        role="radiogroup"
        aria-label={FORMAT.colour.outlineWeight}
        data-control="formatOptions.colour.outlineWeight"
      >
        {[1, 1.5, 2].map((weight) => (
          <button
            key={weight}
            type="button"
            role="radio"
            aria-checked={outline.width === weight}
            className={cn('pt-ib ts-fo-toggle', outline.width === weight && 'is-on')}
            data-control={`formatOptions.colour.outlineWeight.${weight}`}
            onClick={() => set({ ...outline, width: weight })}
            {...tipProps({ name: `${weight} px` })}
          >
            <span className="pt-lb">{weight} px</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const LIST_LIKE: ReadonlySet<string> = new Set([
  'rows',
  'plain',
  'refs',
  'say',
  'scales',
  'spec',
  'lang',
  'ladder',
  'swatches',
  'board',
  'matrix',
  'logoPlates',
]);
const PICTURE_LIKE: ReadonlySet<string> = new Set(['shot', 'pair', 'tiles', 'details', 'picture']);
