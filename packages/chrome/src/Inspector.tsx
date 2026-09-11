import { useState } from 'react';
import type { ReactNode } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import { CATALOG, SLIDE_KIND_CATALOG, blockAssetRefs } from '@turboslide/schema/catalog';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { BlockId } from '@turboslide/schema/ids';
import type { Lease, Version } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';

import type { EditorDispatch } from './dispatch';
import { authorName } from './dispatch';
import { HistoryPanel } from './HistoryPanel';
import { Icon } from './icons';
import { AssetCard } from './inspector/asset';
import type { ArraySpec, ControlSpec, Generated } from './inspector/generate';
import { blockControls, slideControls } from './inspector/generate';
import type { ControlContext } from './inspector/props';
import { InspectorControl } from './InspectorControl';
import { cn } from './lib/cn';
import { LintPanel } from './LintPanel';
import { ToolButton } from './ToolButton';
import { VersionsPanel } from './VersionsPanel';

import './Inspector.css';

/**
 * The 460px inspector (SPEC 6.5), taking the index panel's slot and its left-edge line (SPEC
 * 2.2). Every control is generated from the Zod schema of the selected object by
 * inspector/generate.ts; there is no form per block. Sections: Slide, Layout, Block (the
 * selected block's properties), Asset (the referenced assets' twins, credit and license), Lint
 * (this slide's findings with Fix), Versions, History, and the deck's tokens read only when the
 * studio passes them (SPEC 6.8). Every write is one block.set or one slide.update carrying one
 * slide.set, dispatched with the revision the inspector was given as baseRevision (SPEC 7.1);
 * the component never touches the document. Lines: the panel's left edge in --pt-hair, section
 * headers in --pt-hair under themselves, rows in --pt-hair-soft, the last row none.
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
  /** disables every control while a write is in flight */
  busy?: boolean;
  className?: string;
};

type SectionId =
  'slide' | 'layout' | 'block' | 'asset' | 'lint' | 'versions' | 'history' | 'tokens';

/** The groups of the slide's own controls that belong to the Slide section; the rest is Layout. */
const SLIDE_GROUPS = new Set(['Slide', 'Text', 'Advanced']);

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

function Section({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  count?: number | string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={cn('ts-insp-section', !open && 'is-closed')} data-section={id}>
      <button
        type="button"
        className="ts-insp-head"
        aria-expanded={open}
        title={open ? `Collapse ${title}` : `Expand ${title}`}
        data-control={`inspector.${id}`}
        onClick={onToggle}
      >
        <Icon name="chevron-down" />
        <span className="ts-insp-head-name">{title}</span>
        {count !== undefined ? <span className="ts-insp-head-count">{count}</span> : null}
      </button>
      {open ? <div className="ts-insp-body">{children}</div> : null}
    </section>
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
  busy = false,
  className,
}: InspectorProps) {
  const [closed, setClosed] = useState<ReadonlySet<SectionId>>(
    () => new Set(['history', 'tokens']),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (id: SectionId) => {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClosed(next);
  };
  const isOpen = (id: SectionId) => !closed.has(id);

  const report = (promise: Promise<unknown>) => {
    setNotice(null);
    promise.catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : String(error));
    });
  };

  const writeSlide = (path: string, value: unknown) =>
    report(
      dispatch('slide.update', {
        slideId: slide.id,
        baseRevision: revision,
        mutations: [
          { op: 'slide.set', slideId: slide.id, path, ...(value !== undefined ? { value } : {}) },
        ],
      }),
    );

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
  const selected =
    blockId === undefined ? undefined : placed.find(({ block }) => block.id === blockId)?.block;
  const slideGenerated = slideControls(slide, deck.sections);
  const slideRows = slideGenerated.controls.filter((spec) => SLIDE_GROUPS.has(spec.group));
  const layoutRows = slideGenerated.controls.filter((spec) => !SLIDE_GROUPS.has(spec.group));
  const blockGenerated = selected ? blockControls(selected) : undefined;
  const lease = leases.find((entry) => entry.slideId === slide.id);

  /* the assets the selection or the slide references, for the Asset section */
  const assetIds = new Set<string>();
  if (selected) for (const ref of blockAssetRefs(selected)) assetIds.add(ref.assetId);
  else if ('picture' in slide) assetIds.add(slide.picture.asset);
  const assets = [...assetIds].map((id) => deck.assets[id]).filter((asset) => asset !== undefined);

  const renderRows = (
    rows: Row[],
    target: unknown,
    write: (path: string, value: unknown) => void,
  ) =>
    rows.map((row) => {
      if (row.kind === 'control') {
        return (
          <InspectorControl
            key={row.spec.control}
            spec={row.spec}
            context={context}
            disabled={busy}
            onChange={(value) => write(row.spec.path, value)}
          />
        );
      }
      const list = getAt(target, row.array.path);
      const items = Array.isArray(list) ? list : [];
      const canRemove = items.length > row.array.minItems;
      return (
        <div key={row.array.control} className="ts-insp-array" data-path={row.array.path}>
          {row.items.map((item) => (
            <div key={item.index} className="ts-insp-item">
              <div className="ts-insp-item-head">
                <span>
                  {row.array.label.replace(/^[^:]+:\s*/, '').replace(/s$/, '')} {item.index + 1}
                </span>
                <ToolButton
                  title={`Remove item ${item.index + 1}`}
                  ariaLabel={`${row.array.label} remove ${item.index + 1}`}
                  icon="close"
                  className="ts-insp-item-remove"
                  control={`${row.array.control}.${item.index}.remove`}
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
                  onChange={(value) => write(spec.path, value)}
                />
              ))}
            </div>
          ))}
          <div className="ts-insp-row is-add">
            <ToolButton
              title={`Add an item to ${row.array.label}`}
              ariaLabel={`${row.array.label} add`}
              label="Add item"
              control={`${row.array.control}.add`}
              onClick={() => write(row.array.path, [...items, row.array.blank()])}
            />
          </div>
        </div>
      );
    });

  return (
    <aside
      className={cn('ts-inspector ts-chrome', className)}
      aria-label="Inspector"
      data-slide={slide.id}
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
            <span className="ts-insp-label">Kind</span>
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
          )}
        </Section>

        {layoutRows.length > 0 ? (
          <Section
            id="layout"
            title="Layout"
            open={isOpen('layout')}
            onToggle={() => toggle('layout')}
          >
            {renderRows(
              layoutRows.map((spec) => ({ kind: 'control', spec })),
              slide,
              writeSlide,
            )}
          </Section>
        ) : null}

        {selected && blockGenerated ? (
          <Section
            id="block"
            title={`Block · ${CATALOG[selected.type].label} · ${selected.id}`}
            open={isOpen('block')}
            onToggle={() => toggle('block')}
          >
            <p className="ts-insp-doc">{CATALOG[selected.type].doc}</p>
            {renderRows(groupRows(blockGenerated), selected, (path, value) =>
              writeBlock(selected, path, value),
            )}
          </Section>
        ) : (
          <Section id="block" title="Block" open={isOpen('block')} onToggle={() => toggle('block')}>
            <p className="ts-insp-doc">
              {placed.length === 0
                ? 'This slide has no blocks.'
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
                      title={`Select ${block.type} ${block.id}`}
                      onClick={() => onSelectBlock?.(block.id)}
                    >
                      <span className="ts-insp-block-type">{block.type}</span>
                      <span className="ts-insp-block-id">{block.id}</span>
                      <span className="ts-insp-block-slot">{slot}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
        )}

        {assets.length > 0 ? (
          <Section
            id="asset"
            title="Asset"
            count={assets.length}
            open={isOpen('asset')}
            onToggle={() => toggle('asset')}
          >
            {assets.map((asset) => (
              <div key={asset.id} className="ts-insp-row is-wide is-asset">
                <span className="ts-insp-label">{asset.id}</span>
                <div className="ts-insp-field">
                  <AssetCard asset={asset} assetUrl={assetUrl} />
                </div>
              </div>
            ))}
          </Section>
        ) : null}

        <Section
          id="lint"
          title="Lint"
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
          title="Versions"
          count={versions.length}
          open={isOpen('versions')}
          onToggle={() => toggle('versions')}
        >
          <VersionsPanel versions={versions} revision={revision} dispatch={dispatch} embedded />
        </Section>

        <Section
          id="history"
          title="History"
          count={history.length}
          open={isOpen('history')}
          onToggle={() => toggle('history')}
        >
          <HistoryPanel entries={history} onUndoTo={onUndoTo} embedded />
        </Section>

        {tokens && tokens.length > 0 ? (
          <Section
            id="tokens"
            title="Deck tokens"
            count={tokens.length}
            open={isOpen('tokens')}
            onToggle={() => toggle('tokens')}
          >
            {tokens.map((token) => (
              <div key={token.name} className="ts-insp-row is-readonly">
                <span className="ts-insp-label">{token.name}</span>
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
