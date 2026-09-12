import type { ReactNode } from 'react';
import { useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import { CATALOG, LAYOUT_CATALOG, blockAssetRefs } from '@turboslide/schema/catalog';
import type { Deck, LayoutType, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { BlockId } from '@turboslide/schema/ids';
import { derivedLayout, layoutEntry } from '@turboslide/schema/layouts';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';

import type { EditorDispatch } from './dispatch';
import { Icon } from './icons';
import type { IconName } from './icons';
import {
  FORMAT_SECTIONS,
  FORMAT_SECTION_BY_ID,
  formatSectionOfBlockControl,
  formatSectionOfSlideControl,
  hasAltText,
  hasTextFitting,
} from './inspector/format-sections';
import type { FormatSectionId } from './inspector/format-sections';
import type { ControlSpec, Generated } from './inspector/generate';
import { POSITION_PATH, blockControls, slideControls } from './inspector/generate';
import { withField } from './inspector/position';
import type { ControlContext } from './inspector/props';
import { groupRows, layoutForType } from './Inspector';
import { InspectorControl } from './InspectorControl';
import { cn } from './lib/cn';
import { PANELS, stubClause } from './menus/strings';
import { Panel } from './Panel';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './FormatOptions.css';

/**
 * Format options (gslides-parity SPEC 3.9, 12 "Panels"; R05 B7): the Inspector regrouped at
 * 320 px, opened on demand, one panel at a time, sections named in Google's words where a Google
 * section exists, generated from the same Zod annotations (inspector/generate.ts) and routed by
 * inspector/format-sections.ts. Size & rotation and Position read and write the one position
 * composite (Rotate stays disabled, SPEC 0.12); Layout shows the grammar layout's fields and the
 * layout's name with a Change button that opens the layout grid; Text fitting is the Later row;
 * Alt text edits the picture's description as one asset.set. With nothing selected the panel
 * reads the sentence of SPEC 11.3. No JSON pointer, action id or block id appears in a label or a
 * tooltip; the accessible label and `data-control` stay in the DOM for the window API.
 */
export type FormatOptionsProps = {
  deck: Deck;
  slide: Slide;
  blockId?: BlockId;
  revision: number;
  dispatch: EditorDispatch;
  /** one write of arbitrary mutations (the alt text writes the asset) */
  commit?: (mutations: Mutation[], label: string) => Promise<unknown>;
  findings?: ReadonlyArray<Finding>;
  lintText?: ControlContext['lintText'];
  assetUrl?: (path: string) => string;
  /** the Layout section's Change button */
  onChangeLayout?: (anchor: HTMLElement) => void;
  onClose: () => void;
  busy?: boolean;
  className?: string;
};

/** The section a control shows under, or null when it leaves the panel. */
function routeSlide(spec: ControlSpec): FormatSectionId | null {
  return formatSectionOfSlideControl(spec);
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

/** A number field of the Size & rotation and Position sections. */
function Field({
  label,
  value,
  onCommit,
  control,
  disabled,
  doc,
}: {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  control: string;
  disabled?: boolean;
  doc?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isFinite(n)) onCommit(Math.round(n));
  };
  const tip = tipProps({ name: label, ...(doc === undefined ? {} : { doc }), key: 'Enter' });
  return (
    <label className={cn('ts-fo-field', disabled && 'is-disabled')}>
      <span className="ts-fo-field-label">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={draft ?? (value === undefined ? '' : String(value))}
        aria-label={label}
        data-control={control}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        {...tip}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          tip.onKeyDown(event);
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
        }}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
    </label>
  );
}

export function FormatOptions({
  deck,
  slide,
  blockId,
  revision,
  dispatch,
  commit,
  findings = [],
  lintText,
  assetUrl,
  onChangeLayout,
  onClose,
  busy = false,
  className,
}: FormatOptionsProps) {
  const [closed, setClosed] = useState<ReadonlySet<FormatSectionId>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = (id: FormatSectionId) => {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClosed(next);
  };
  const isOpen = (id: FormatSectionId) => !closed.has(id);

  const report = (promise: Promise<unknown>) => {
    setNotice(null);
    promise.catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : String(error)),
    );
  };

  const freeform = slide.kind === 'content' && slide.layout.type === 'freeform';
  const placed = slideBlocks(slide);
  const selectedPlaced =
    blockId === undefined ? undefined : placed.find(({ block }) => block.id === blockId);
  const selected: Block | undefined = selectedPlaced?.block;

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

  /* the block's controls by section */
  const blockGenerated = selected ? blockControls(selected, { freeform }) : undefined;
  const byBlockSection = new Map<FormatSectionId, Generated>();
  let positionSpec: ControlSpec | undefined;
  if (blockGenerated !== undefined && selected !== undefined) {
    for (const spec of blockGenerated.controls) {
      if (spec.kind === 'position' && spec.path === POSITION_PATH) {
        positionSpec = spec;
        continue;
      }
      const section = formatSectionOfBlockControl(spec, selected);
      if (section === null) continue;
      const entry = byBlockSection.get(section) ?? { controls: [], arrays: [] };
      entry.controls.push(spec);
      byBlockSection.set(section, entry);
    }
    for (const array of blockGenerated.arrays) {
      const section: FormatSectionId =
        selected.type === 'table'
          ? 'table'
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

  const position = positionSpec?.value as Position | undefined;
  const writePosition = (key: 'x' | 'y' | 'w' | 'h', value: number) => {
    if (position === undefined) return;
    writeBlock(POSITION_PATH, withField(position, key, value));
  };

  /* the alt text of the selected picture: the asset's alt, one asset.set */
  const altAsset =
    selected !== undefined && hasAltText(selected)
      ? deck.assets[blockAssetRefs(selected)[0]?.assetId ?? '']
      : 'picture' in slide && selected === undefined
        ? deck.assets[slide.picture.asset]
        : undefined;
  const [altDraft, setAltDraft] = useState<string | null>(null);
  const commitAlt = () => {
    if (altDraft === null || altAsset === undefined) return;
    const alt = altDraft.trim();
    setAltDraft(null);
    if (alt === '' || alt === altAsset.alt) return;
    if (commit === undefined) {
      setNotice('The description cannot be changed here yet');
      return;
    }
    report(commit([{ op: 'asset.set', asset: { ...altAsset, alt } }], 'Alt text'));
  };

  const altTip = tipProps({
    name: 'Description',
    doc: 'What a screen reader says for this picture',
  });
  const layoutName = layoutEntry(derivedLayout(slide)).label;
  const layoutRows = bySlideSection.get('layout') ?? [];
  const slidePictureRows = bySlideSection.get('picture') ?? [];

  const sectionsShown = FORMAT_SECTIONS.filter((section) => {
    switch (section.id) {
      case 'size':
        return (
          selected !== undefined &&
          (position !== undefined || (byBlockSection.get('size')?.controls.length ?? 0) > 0)
        );
      case 'position':
        return selected !== undefined && position !== undefined;
      case 'layout':
        return selected === undefined || !freeform;
      case 'textFitting':
        return selected !== undefined && hasTextFitting(selected);
      case 'altText':
        return altAsset !== undefined;
      case 'picture':
        return (
          (byBlockSection.get('picture')?.controls.length ?? 0) +
            (byBlockSection.get('picture')?.arrays.length ?? 0) >
            0 ||
          (selected === undefined && slidePictureRows.length > 0)
        );
      case 'block': {
        const entry = byBlockSection.get('block');
        return entry !== undefined && entry.controls.length + entry.arrays.length > 0;
      }
      default: {
        const entry = byBlockSection.get(section.id);
        return entry !== undefined && entry.controls.length + entry.arrays.length > 0;
      }
    }
  });

  const empty =
    selected === undefined &&
    sectionsShown.every(
      (section) => section.id === 'layout' || section.id === 'picture' || section.id === 'altText',
    );

  return (
    <Panel
      title={PANELS.formatOptions.title}
      onClose={onClose}
      control="panel.formatOptions"
      className={cn('ts-fo', className)}
    >
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
      {sectionsShown.map((section) => {
        switch (section.id) {
          case 'size':
            return (
              <Section
                key={section.id}
                id="size"
                open={isOpen('size')}
                onToggle={() => toggle('size')}
              >
                {position !== undefined ? (
                  <div className="ts-fo-fields">
                    <Field
                      label="Width"
                      value={position.w}
                      control="formatOptions.size.width"
                      onCommit={(value) => writePosition('w', value)}
                      disabled={busy}
                    />
                    <Field
                      label="Height"
                      value={position.h}
                      control="formatOptions.size.height"
                      onCommit={(value) => writePosition('h', value)}
                      disabled={busy}
                    />
                    <Field
                      label="Rotate"
                      value={0}
                      control="formatOptions.size.rotate"
                      onCommit={() => undefined}
                      disabled
                      doc={stubClause('Rotation is not part of the GT theme')}
                    />
                  </div>
                ) : null}
                {selected !== undefined && byBlockSection.get('size') !== undefined
                  ? renderRows(
                      byBlockSection.get('size') as Generated,
                      selected,
                      writeBlock,
                      blockFindings,
                    )
                  : null}
              </Section>
            );
          case 'position':
            return (
              <Section
                key={section.id}
                id="position"
                open={isOpen('position')}
                onToggle={() => toggle('position')}
              >
                {position !== undefined ? (
                  <div className="ts-fo-fields">
                    <Field
                      label="X"
                      value={position.x}
                      control="formatOptions.position.x"
                      onCommit={(value) => writePosition('x', value)}
                      disabled={busy}
                      doc="From the left edge of the slide"
                    />
                    <Field
                      label="Y"
                      value={position.y}
                      control="formatOptions.position.y"
                      onCommit={(value) => writePosition('y', value)}
                      disabled={busy}
                      doc="From the top edge of the slide"
                    />
                  </div>
                ) : null}
              </Section>
            );
          case 'layout':
            return (
              <Section
                key={section.id}
                id="layout"
                open={isOpen('layout')}
                onToggle={() => toggle('layout')}
              >
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
                {renderRows({ controls: layoutRows, arrays: [] }, slide, writeSlide, slideFindings)}
              </Section>
            );
          case 'textFitting':
            return (
              <Section
                key={section.id}
                id="textFitting"
                open={false}
                onToggle={() => undefined}
                disabled
              />
            );
          case 'altText':
            return (
              <Section
                key={section.id}
                id="altText"
                open={isOpen('altText')}
                onToggle={() => toggle('altText')}
              >
                <label className="ts-fo-alt">
                  <span className="ts-fo-field-label">Description</span>
                  <textarea
                    value={altDraft ?? altAsset?.alt ?? ''}
                    aria-label="Description"
                    data-control="formatOptions.altText"
                    rows={3}
                    disabled={busy || altAsset === undefined}
                    {...altTip}
                    onChange={(event) => setAltDraft(event.target.value)}
                    onBlur={(event) => {
                      altTip.onBlur(event);
                      commitAlt();
                    }}
                  />
                </label>
              </Section>
            );
          case 'picture': {
            const entry = byBlockSection.get('picture');
            return (
              <Section
                key={section.id}
                id="picture"
                open={isOpen('picture')}
                onToggle={() => toggle('picture')}
              >
                {selected !== undefined && entry !== undefined
                  ? renderRows(entry, selected, writeBlock, blockFindings)
                  : null}
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
          }
          case 'block': {
            const entry = byBlockSection.get('block');
            return (
              <Section
                key={section.id}
                id="block"
                title={selected === undefined ? undefined : CATALOG[selected.type].label}
                open={isOpen('block')}
                onToggle={() => toggle('block')}
              >
                {selected !== undefined && entry !== undefined
                  ? renderRows(entry, selected, writeBlock, blockFindings)
                  : null}
              </Section>
            );
          }
          default: {
            const entry = byBlockSection.get(section.id);
            return (
              <Section
                key={section.id}
                id={section.id}
                open={isOpen(section.id)}
                onToggle={() => toggle(section.id)}
              >
                {selected !== undefined && entry !== undefined
                  ? renderRows(entry, selected, writeBlock, blockFindings)
                  : null}
              </Section>
            );
          }
        }
      })}
    </Panel>
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
const PICTURE_LIKE: ReadonlySet<string> = new Set(['shot', 'pair', 'tiles', 'details']);
