import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import {
  CATALOG,
  LAYOUT_CATALOG,
  SLIDE_KIND_CATALOG,
  blockAssetRefs,
} from '@turboslide/schema/catalog';
import type { Deck, Layout, LayoutType, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { BlockId } from '@turboslide/schema/ids';
import { blockIdSchema } from '@turboslide/schema/ids';
import type { BlockSlot, Lease, Mutation, Version } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';

import type { EditorDispatch } from './dispatch';
import { authorName } from './dispatch';
import { HistoryPanel } from './HistoryPanel';
import { Icon } from './icons';
import { AssetCard, AssetIntake } from './inspector/asset';
import { DitherSection } from './inspector/dither';
import type { DitherWorkerLike } from './inspector/dither';
import type { ArraySpec, ControlSpec, Generated } from './inspector/generate';
import { blockControls, slideControls } from './inspector/generate';
import { MaterialSection } from './inspector/material';
import type { ControlContext } from './inspector/props';
import {
  BLOCK_ICONS,
  KIND_ICONS,
  SECTION_BY_ID,
  SECTIONS_STORAGE_KEY,
  readClosedSections,
  sectionOfBlockControl,
  sectionOfSlideControl,
  writeClosedSections,
} from './inspector/sections';
import type { SectionId } from './inspector/sections';
import { InspectorControl } from './InspectorControl';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { LintPanel } from './LintPanel';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';
import { VersionsPanel } from './VersionsPanel';

import './Inspector.css';

/**
 * The 460px inspector (SPEC 6.5), taking the index panel's slot and its left-edge line (SPEC
 * 2.2). Every control is generated from the Zod schema of the selected object by
 * inspector/generate.ts; there is no form per block. The sections (inspector/sections.ts), each
 * with an icon, a title and a tooltip, collapsible with the state remembered per browser: Slide,
 * Layout, Block (the selected block's type with its icon, a rename field and its own
 * properties), Text (its text and typography), Color (its palette fields), Position and size
 * (its box, on a freeform slide), Asset (the referenced assets' twins, credit and license, and
 * the intake form), Material, Dither, Lint (this slide's findings with Fix), Versions, History,
 * and the deck's tokens read only when the studio passes them (SPEC 6.8). Every write is one
 * block.set, one slide.update carrying one slide.set, one slide.setLayout for a layout change
 * (docs/freeform.md) or one slide.update carrying block.remove plus block.insert for a rename,
 * dispatched with the revision the inspector was given as baseRevision (SPEC 7.1); the component
 * never touches the document. Lines: the panel's left edge in --pt-hair, section headers in
 * --pt-hair under themselves, rows in --pt-hair-soft, the last row none.
 */
export type InspectorProps = {
  deck: Deck;
  slide: Slide;
  /** the selected block, if any */
  blockId?: BlockId;
  /** the revision the document is at: every write's baseRevision */
  revision: number;
  dispatch: EditorDispatch;
  /** this slide's findings, from the same linter the CLI runs */
  findings?: ReadonlyArray<Finding>;
  versions?: ReadonlyArray<Version>;
  /** the mutation log, newest last */
  history?: ReadonlyArray<Version>;
  leases?: ReadonlyArray<Lease>;
  /** the deck's nine tokens, read only (SPEC 6.8) */
  tokens?: ReadonlyArray<{ name: string; value: string }>;
  onSelectBlock?: (blockId: BlockId | undefined) => void;
  /** History's Undo to here: the editor performs the forward write with the inverse mutations */
  onUndoTo?: (entry: Version) => void;
  lintText?: ControlContext['lintText'];
  assetUrl?: (path: string) => string;
  /** builds the dither preview worker (apps/studio/src/workers/dither.worker.ts); absent shows the committed twins */
  createDitherWorker?: () => DitherWorkerLike;
  /** a toast line from the Dither, Material and intake sections */
  onNotice?: (line: string) => void;
  /** disables every control while a write is in flight */
  busy?: boolean;
  className?: string;
};

/** The material block fields the Material section edits (blocks/material.ts MaterialRecipe). */
const MATERIAL_RECIPE_PATHS = new Set([
  '/materialId',
  '/preset',
  '/uniforms',
  '/anchor',
  '/twoTone',
  '/plate',
]);

type Row =
  | { kind: 'control'; spec: ControlSpec }
  | { kind: 'array'; array: ArraySpec; items: { index: number; controls: ControlSpec[] }[] };

/** Groups the item controls of each array under its ArraySpec, keeping the generated order. */
export function groupRows(generated: Generated): Row[] {
  const rows: Row[] = [];
  const arrays = new Map<string, Row & { kind: 'array' }>();
  for (const spec of generated.controls) {
    const owner = generated.arrays.find((array) => spec.path.startsWith(`${array.path}/`));
    if (!owner) {
      rows.push({ kind: 'control', spec });
      continue;
    }
    let row = arrays.get(owner.path);
    if (!row) {
      row = { kind: 'array', array: owner, items: [] };
      arrays.set(owner.path, row);
      rows.push(row);
    }
    const index = Number(spec.path.slice(owner.path.length + 1).split('/')[0]);
    let item = row.items.find((entry) => entry.index === index);
    if (!item) {
      item = { index, controls: [] };
      row.items.push(item);
    }
    item.controls.push(spec);
  }
  for (const array of generated.arrays) {
    if (!arrays.has(array.path)) rows.push({ kind: 'array', array, items: [] });
  }
  return rows;
}

/** The layout slide.setLayout receives for a picked type: cols needs its ratio, the rest their type. */
export function layoutForType(type: LayoutType): Layout {
  return type === 'cols' ? { type: 'cols', ratio: '5/7' } : { type };
}

function Section({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  /** replaces the table's title (the block section names its block) */
  title?: string;
  count?: number | string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const meta = SECTION_BY_ID[id];
  const name = title ?? meta.title;
  return (
    <section className={cn('ts-insp-section', !open && 'is-closed')} data-section={id}>
      <button
        type="button"
        className="ts-insp-head"
        aria-expanded={open}
        data-control={`inspector.${id}`}
        onClick={onToggle}
        {...tipProps({
          name: meta.title,
          doc: `${meta.doc} Click to ${open ? 'collapse' : 'expand'}; the choice is remembered.`,
        })}
      >
        <span className="ts-insp-head-icon" aria-hidden="true">
          <Icon name={meta.icon} />
        </span>
        <span className="ts-insp-head-name">{name}</span>
        {count !== undefined ? <span className="ts-insp-head-count">{count}</span> : null}
        <Icon name="chevron-down" />
      </button>
      {open ? <div className="ts-insp-body">{children}</div> : null}
    </section>
  );
}

/**
 * The selected block's header: its type glyph and label, then the id as a rename field. Enter
 * or blur with a changed, valid id writes one slide.update carrying block.remove and
 * block.insert at the same place (the reducer refuses block.set on /id), and the selection
 * follows the new id. Escape restores the id.
 */
function BlockHead({
  slide,
  block,
  slot,
  previous,
  revision,
  dispatch,
  busy,
  onRenamed,
  onError,
}: {
  slide: Slide;
  block: Block;
  slot: BlockSlot;
  previous: BlockId | undefined;
  revision: number;
  dispatch: EditorDispatch;
  busy: boolean;
  onRenamed: (id: BlockId) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const entry = CATALOG[block.type];
  const shown = draft ?? block.id;
  const valid = blockIdSchema.safeParse(shown.trim()).success;

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === '' || next === block.id) return;
    const parsed = blockIdSchema.safeParse(next);
    if (!parsed.success) {
      onError(`"${next}" is not a block id: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      return;
    }
    const mutations: Mutation[] = [
      { op: 'block.remove', slideId: slide.id, blockId: block.id },
      {
        op: 'block.insert',
        slideId: slide.id,
        slot,
        ...(previous !== undefined ? { after: previous } : {}),
        block: { ...block, id: parsed.data },
      },
    ];
    dispatch('slide.update', { slideId: slide.id, baseRevision: revision, mutations })
      .then(() => onRenamed(parsed.data))
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      event.currentTarget.blur();
    }
  };

  const renameTip = tipProps({
    name: 'Block id',
    doc: 'Rename the block: lower case letters, digits and hyphens, unique on the slide. Enter commits, Escape restores.',
    key: 'Enter',
  });

  return (
    <div className="ts-insp-blockhead" data-type={block.type}>
      <span className="ts-insp-blocktype" {...tipProps({ name: entry.label, doc: entry.doc })}>
        <Icon name={BLOCK_ICONS[block.type]} />
        <b>{entry.label}</b>
      </span>
      <span className="ts-insp-blockslot" aria-label={`in slot ${slot}`}>
        {slot}
      </span>
      <input
        className={cn('ts-insp-rename', !valid && 'is-invalid')}
        type="text"
        value={shown}
        aria-label={`${block.id}: Id`}
        data-control={`block.${block.id}.id`}
        spellCheck={false}
        autoComplete="off"
        disabled={busy}
        {...renameTip}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          renameTip.onBlur(event);
          commit();
        }}
        onKeyDown={(event) => {
          renameTip.onKeyDown(event);
          onKey(event);
        }}
      />
    </div>
  );
}

export function Inspector({
  deck,
  slide,
  blockId,
  revision,
  dispatch,
  findings = [],
  versions = [],
  history = [],
  leases = [],
  tokens,
  onSelectBlock,
  onUndoTo,
  lintText,
  assetUrl,
  createDitherWorker,
  onNotice,
  busy = false,
  className,
}: InspectorProps) {
  const [closed, setClosed] = useState<ReadonlySet<SectionId>>(() => readClosedSections(null));
  const [notice, setNotice] = useState<string | null>(null);

  /* the reader's folds, read back after mount (the server renders the defaults) */
  useMountEffect(() => {
    try {
      const saved = localStorage.getItem(SECTIONS_STORAGE_KEY);
      if (saved !== null) setClosed(readClosedSections(saved));
    } catch {
      // private mode: the defaults hold
    }
  });

  const toggle = (id: SectionId) => {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClosed(next);
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, writeClosedSections(next));
    } catch {
      // private mode: the state holds for the session
    }
  };
  const isOpen = (id: SectionId) => !closed.has(id);

  const report = (promise: Promise<unknown>) => {
    setNotice(null);
    promise.catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : String(error));
    });
  };

  const freeform = slide.kind === 'content' && slide.layout.type === 'freeform';

  const writeSlide = (path: string, value: unknown) => {
    /* a layout tag is slide.setLayout, which refiles the blocks (docs/freeform.md) */
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

  const writeBlock = (block: Block, path: string, value: unknown) =>
    report(
      dispatch('block.set', {
        slideId: slide.id,
        blockId: block.id,
        path,
        ...(value !== undefined ? { value } : {}),
        baseRevision: revision,
      }),
    );

  const context: ControlContext = {
    assets: deck.assets,
    ...(assetUrl ? { assetUrl } : {}),
    ...(lintText ? { lintText } : {}),
  };

  const placed = slideBlocks(slide);
  const selectedIndex =
    blockId === undefined ? -1 : placed.findIndex(({ block }) => block.id === blockId);
  const selectedPlaced = selectedIndex >= 0 ? placed[selectedIndex] : undefined;
  const selected = selectedPlaced?.block;
  const slideGenerated = slideControls(slide, deck.sections);
  const slideRows = slideGenerated.controls.filter(
    (spec) => sectionOfSlideControl(spec) === 'slide',
  );
  const layoutRows = slideGenerated.controls.filter(
    (spec) => sectionOfSlideControl(spec) === 'layout',
  );
  const slideAssetRows = slideGenerated.controls.filter(
    (spec) => sectionOfSlideControl(spec) === 'asset',
  );
  const blockGenerated = selected ? blockControls(selected, { freeform }) : undefined;
  /* a material block's recipe fields belong to the Material section; the Block section keeps the rest */
  if (blockGenerated !== undefined && selected?.type === 'material') {
    blockGenerated.controls = blockGenerated.controls.filter(
      (spec) => !MATERIAL_RECIPE_PATHS.has(spec.path),
    );
  }
  const blockSection = (section: SectionId): Generated | undefined =>
    blockGenerated === undefined
      ? undefined
      : {
          controls: blockGenerated.controls.filter(
            (spec) => sectionOfBlockControl(spec) === section,
          ),
          /* arrays belong with the block's own properties */
          arrays: section === 'block' ? blockGenerated.arrays : [],
        };
  const blockRows = blockSection('block');
  const textRows = blockSection('text');
  const colorRows = blockSection('color');
  const positionRows = blockSection('position');
  const blockAssetRows = blockSection('asset');
  const lease = leases.find((entry) => entry.slideId === slide.id);
  const blockFindings = selected
    ? findings.filter((finding) => finding.blockId === selected.id)
    : [];
  const slideFindings = findings.filter((finding) => finding.blockId === undefined);

  /* the previous block in the selected block's slot, for a rename's re-insert */
  const previousInSlot =
    selectedPlaced === undefined
      ? undefined
      : placed
          .slice(0, selectedIndex)
          .filter(({ slot }) => slot === selectedPlaced.slot)
          .at(-1)?.block.id;

  /* the assets the selection or the slide references, for the Asset and Dither sections */
  const assetIds = new Set<string>();
  if (selected) for (const ref of blockAssetRefs(selected)) assetIds.add(ref.assetId);
  else if ('picture' in slide) assetIds.add(slide.picture.asset);
  const assets = [...assetIds].map((id) => deck.assets[id]).filter((asset) => asset !== undefined);
  const dithered = assets.filter(
    (asset) =>
      asset.treatment?.kind === 'two-tone' || asset.role === 'opener' || asset.role === 'mood',
  );
  /* the Material section's target: a selected material block, or a picture whose asset is a material */
  const materialBlock = selected?.type === 'material' ? selected : undefined;
  const pictureAsset = 'picture' in slide ? deck.assets[slide.picture.asset] : undefined;
  const plateSide = 'plate' in slide ? slide.plate.side : undefined;
  const materialPicture =
    materialBlock === undefined &&
    pictureAsset?.source.kind === 'material' &&
    plateSide !== undefined
      ? { asset: pictureAsset, plateSide }
      : undefined;
  const intakeRole =
    slide.kind === 'mood' ? 'mood' : slide.kind === 'opener' ? 'opener' : 'capture';

  const renderRows = (
    rows: Row[],
    target: unknown,
    write: (path: string, value: unknown) => void,
    rowFindings: ReadonlyArray<Finding>,
  ) =>
    rows.map((row) => {
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
      const list = getAt(target, row.array.path);
      const items = Array.isArray(list) ? list : [];
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
                      ? `Removes this item from ${row.array.label}; the list keeps at least ${row.array.minItems}.`
                      : `The list keeps at least ${row.array.minItems}, so this item stays.`
                  }
                  ariaLabel={`${row.array.label} remove ${item.index + 1}`}
                  icon="close"
                  className="ts-insp-item-remove"
                  control={`${row.array.control}.${item.index}.remove`}
                  disabled={!canRemove}
                  onClick={() => {
                    if (!canRemove) return;
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
              doc={`Appends a blank item to ${row.array.label}; fill its fields in the rows above the button.`}
              ariaLabel={`${row.array.label} add`}
              label="Add item"
              icon="plus"
              control={`${row.array.control}.add`}
              onClick={() => write(row.array.path, [...items, row.array.blank()])}
            />
          </div>
        </div>
      );
    });

  const controlRows = (generated: Generated | undefined): Row[] =>
    generated === undefined ? [] : groupRows(generated);

  const blockWrite = (path: string, value: unknown) => {
    if (selected) writeBlock(selected, path, value);
  };

  const kindIcon = KIND_ICONS[slide.kind];

  return (
    <aside
      className={cn('ts-inspector ts-chrome', className)}
      aria-label="Inspector"
      data-slide={slide.id}
      data-freeform={freeform ? '' : undefined}
    >
      <div className="ts-insp-scroll pt-scroll">
        {notice ? (
          <p className="ts-insp-notice" role="alert">
            {notice}
          </p>
        ) : null}
        {lease ? (
          <p className="ts-insp-lease">
            Leased by {authorName(lease.holder)} until{' '}
            {new Date(lease.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        ) : null}

        <Section
          id="slide"
          title={`Slide · ${slide.id}`}
          open={isOpen('slide')}
          onToggle={() => toggle('slide')}
        >
          <div className="ts-insp-row is-readonly">
            <span
              className="ts-insp-label"
              {...tipProps({
                name: 'Kind',
                doc: `${SLIDE_KIND_CATALOG[slide.kind].doc} The kind is fixed; insert another slide for a different one.`,
              })}
            >
              <span className="ts-insp-label-icon" aria-hidden="true">
                <Icon name={kindIcon} size={14} />
              </span>
              <span className="ts-insp-label-text">Kind</span>
            </span>
            <div className="ts-insp-field">
              <span className="ts-insp-value" aria-label="slide: Kind" data-control="slide.kind">
                {SLIDE_KIND_CATALOG[slide.kind].label}
              </span>
            </div>
          </div>
          {renderRows(
            slideRows.map((spec) => ({ kind: 'control', spec })),
            slide,
            writeSlide,
            slideFindings,
          )}
        </Section>

        {layoutRows.length > 0 ? (
          <Section
            id="layout"
            title={
              slide.kind === 'content'
                ? `Layout · ${LAYOUT_CATALOG[slide.layout.type].label}`
                : undefined
            }
            open={isOpen('layout')}
            onToggle={() => toggle('layout')}
          >
            {slide.kind === 'content' ? (
              <p className="ts-insp-doc">{LAYOUT_CATALOG[slide.layout.type].doc}</p>
            ) : null}
            {renderRows(
              layoutRows.map((spec) => ({ kind: 'control', spec })),
              slide,
              writeSlide,
              slideFindings,
            )}
          </Section>
        ) : null}

        {selectedPlaced && blockGenerated && selected ? (
          <>
            <Section
              id="block"
              title={`Block · ${CATALOG[selected.type].label}`}
              open={isOpen('block')}
              onToggle={() => toggle('block')}
            >
              <BlockHead
                slide={slide}
                block={selected}
                slot={selectedPlaced.slot}
                previous={previousInSlot}
                revision={revision}
                dispatch={dispatch}
                busy={busy}
                onRenamed={(id) => {
                  onNotice?.(`Renamed ${selected.id} to ${id}`);
                  onSelectBlock?.(id);
                }}
                onError={(message) => setNotice(message)}
              />
              <p className="ts-insp-doc">{CATALOG[selected.type].doc}</p>
              {blockRows && blockRows.controls.length + blockRows.arrays.length > 0 ? (
                renderRows(controlRows(blockRows), selected, blockWrite, blockFindings)
              ) : (
                <p className="ts-insp-doc">This block has no options beyond its text and colors.</p>
              )}
            </Section>
            {textRows && textRows.controls.length > 0 ? (
              <Section id="text" open={isOpen('text')} onToggle={() => toggle('text')}>
                {renderRows(controlRows(textRows), selected, blockWrite, blockFindings)}
              </Section>
            ) : null}
            {colorRows && colorRows.controls.length > 0 ? (
              <Section id="color" open={isOpen('color')} onToggle={() => toggle('color')}>
                {renderRows(controlRows(colorRows), selected, blockWrite, blockFindings)}
              </Section>
            ) : null}
            {positionRows && positionRows.controls.length > 0 ? (
              <Section id="position" open={isOpen('position')} onToggle={() => toggle('position')}>
                {renderRows(controlRows(positionRows), selected, blockWrite, blockFindings)}
              </Section>
            ) : null}
          </>
        ) : (
          <Section id="block" open={isOpen('block')} onToggle={() => toggle('block')}>
            <p className="ts-insp-doc">
              {placed.length === 0
                ? 'This slide has no blocks. Insert one from the Insert menu or the palette.'
                : 'Click a block on the stage, or Tab through them, to edit its properties.'}
            </p>
            {placed.length > 0 ? (
              <ul className="ts-insp-blocks">
                {placed.map(({ slot, block }) => (
                  <li key={block.id}>
                    <button
                      type="button"
                      className="ts-insp-block-row"
                      data-control={`inspector.block.${block.id}`}
                      aria-label={`Select ${block.type} ${block.id}`}
                      onClick={() => onSelectBlock?.(block.id)}
                      {...tipProps({
                        name: `${CATALOG[block.type].label} ${block.id}`,
                        doc: `Selects the block in slot ${slot} and opens its sections.`,
                      })}
                    >
                      <span className="ts-insp-block-icon" aria-hidden="true">
                        <Icon name={BLOCK_ICONS[block.type]} />
                      </span>
                      <span className="ts-insp-block-type">{CATALOG[block.type].label}</span>
                      <span className="ts-insp-block-id">{block.id}</span>
                      <span className="ts-insp-block-slot">{slot}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
        )}

        {materialBlock !== undefined || materialPicture !== undefined ? (
          <Section
            id="material"
            title={
              materialBlock !== undefined ? `Material · ${materialBlock.id}` : 'Material · picture'
            }
            open={isOpen('material')}
            onToggle={() => toggle('material')}
          >
            <MaterialSection
              target={
                materialBlock !== undefined
                  ? { kind: 'block', slideId: slide.id, block: materialBlock }
                  : {
                      kind: 'picture',
                      slideId: slide.id,
                      asset: (materialPicture as { asset: (typeof assets)[number] }).asset,
                      plateSide: (
                        materialPicture as {
                          plateSide: 'lower-left' | 'lower-right' | 'upper-left';
                        }
                      ).plateSide,
                    }
              }
              revision={revision}
              dispatch={dispatch}
              busy={busy}
              onNotice={onNotice}
            />
          </Section>
        ) : null}

        <Section
          id="asset"
          count={assets.length}
          open={isOpen('asset')}
          onToggle={() => toggle('asset')}
        >
          {selected && blockAssetRows
            ? renderRows(controlRows(blockAssetRows), selected, blockWrite, blockFindings)
            : renderRows(
                slideAssetRows.map((spec) => ({ kind: 'control', spec })),
                slide,
                writeSlide,
                slideFindings,
              )}
          {assets.map((asset) => (
            <div key={asset.id} className="ts-insp-row is-wide is-asset">
              <span
                className="ts-insp-label"
                {...tipProps({
                  name: asset.id,
                  doc: `${asset.alt} Role ${asset.role}, ${asset.size[0]} by ${asset.size[1]} px.`,
                })}
              >
                <span className="ts-insp-label-icon" aria-hidden="true">
                  <Icon name="photo" size={14} />
                </span>
                <span className="ts-insp-label-text">{asset.id}</span>
              </span>
              <div className="ts-insp-field">
                <AssetCard asset={asset} assetUrl={assetUrl} />
              </div>
            </div>
          ))}
          <div className="ts-insp-row is-wide is-intake">
            <span
              className="ts-insp-label"
              {...tipProps({
                name: 'Add a picture',
                doc: 'Drop a file, paste one or give a URL; asset.add writes the twins and the credit.',
              })}
            >
              <span className="ts-insp-label-icon" aria-hidden="true">
                <Icon name="plus" size={14} />
              </span>
              <span className="ts-insp-label-text">Add a picture</span>
            </span>
            <div className="ts-insp-field">
              <AssetIntake
                revision={revision}
                dispatch={dispatch}
                defaultRole={intakeRole}
                plate={plateSide}
                busy={busy}
                onNotice={onNotice}
              />
            </div>
          </div>
        </Section>

        {dithered.length > 0 ? (
          <Section
            id="dither"
            count={dithered.length}
            open={isOpen('dither')}
            onToggle={() => toggle('dither')}
          >
            {dithered.map((asset) => (
              <div key={asset.id} className="ts-insp-row is-wide is-dither">
                <span className="ts-insp-label">
                  <span className="ts-insp-label-icon" aria-hidden="true">
                    <Icon name="adjustments" size={14} />
                  </span>
                  <span className="ts-insp-label-text">{asset.id}</span>
                </span>
                <div className="ts-insp-field is-dither">
                  <DitherSection
                    asset={asset}
                    plate={plateSide}
                    revision={revision}
                    dispatch={dispatch}
                    assetUrl={assetUrl}
                    createWorker={createDitherWorker}
                    busy={busy}
                    onNotice={onNotice}
                  />
                </div>
              </div>
            ))}
          </Section>
        ) : null}

        <Section
          id="lint"
          count={findings.length}
          open={isOpen('lint')}
          onToggle={() => toggle('lint')}
        >
          <LintPanel
            findings={findings}
            slideId={slide.id}
            revision={revision}
            dispatch={dispatch}
            selectedBlockId={blockId}
            onSelectBlock={onSelectBlock}
            embedded
          />
        </Section>

        <Section
          id="versions"
          count={versions.length}
          open={isOpen('versions')}
          onToggle={() => toggle('versions')}
        >
          <VersionsPanel versions={versions} revision={revision} dispatch={dispatch} embedded />
        </Section>

        <Section
          id="history"
          count={history.length}
          open={isOpen('history')}
          onToggle={() => toggle('history')}
        >
          <HistoryPanel entries={history} onUndoTo={onUndoTo} embedded />
        </Section>

        {tokens && tokens.length > 0 ? (
          <Section
            id="tokens"
            count={tokens.length}
            open={isOpen('tokens')}
            onToggle={() => toggle('tokens')}
          >
            {tokens.map((token) => (
              <div key={token.name} className="ts-insp-row is-readonly">
                <span className="ts-insp-label">
                  <span className="ts-insp-label-icon" aria-hidden="true">
                    <Icon name="swatch" size={14} />
                  </span>
                  <span className="ts-insp-label-text">{token.name}</span>
                </span>
                <div className="ts-insp-field">
                  <span className="ts-insp-value">{token.value}</span>
                </div>
              </div>
            ))}
          </Section>
        ) : null}
      </div>
    </aside>
  );
}
