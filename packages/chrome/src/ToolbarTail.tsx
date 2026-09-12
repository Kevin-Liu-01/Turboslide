import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import { STROKE_WIDTHS } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import { COLOR_LABELS, COLOR_TOKENS, isHexColor } from '@turboslide/schema/color';
import type { Color } from '@turboslide/schema/color';
import { TYPE_LADDER } from '@turboslide/schema/typography';

import {
  selectedBlock,
  SPACING_STEPS,
  stepLadder,
  tailKindOf as tailOfSelection,
} from './editor-shell';
import { useEditorShell } from './editor-shell-context';
import { Icon } from './icons';
import { swatchPaint } from './inspector/palette';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { Menu } from './Menu';
import { evaluate, itemById, visibleItems } from './menus/model';
import type { MenuItem } from './menus/model';
import { HIDE_MENUS_CONTROL, MORE_BREAKPOINT_PX, tailFor } from './menus/toolbar-tails';
import type { TailControl, TailKind, TailOp } from './menus/toolbar-tails';
import { ToolbarButton, ToolbarDivider, controlTip } from './ToolbarHead';
import { tipProps } from './Tooltip';

/**
 * The toolbar's contextual tail (gslides-parity SPEC 3.1 rows 8 to 18, 3.2 to 3.8; R02 section 4):
 * the controls after the first divider, replaced by the family of the selection (a text block,
 * a shape, a picture, a line, a table cell, another block). Each control is drawn from
 * `menus/toolbar-tails.ts` by the shared `ToolbarButton`; a control with an `item` runs the menu
 * item, one with an `arrow` opens that item's submenu as a dropdown under the button, one with
 * an `op` opens the small plate this file draws (the colour swatches, a list of weights, the
 * alignments, the spacing steps, the line ends, the crop anchor) or edits the size field. At or
 * below 1100 px the tail from position 8 collapses into one More button whose menu lists the
 * same controls with their labels (SPEC 0.6, 1.3); nothing wraps. The Hide the menus chevron sits
 * at the far right of the row on every tail (SPEC 3.1 row 18).
 */
export { tailOfSelection as tailKindOf };

type Plate =
  | { kind: 'menu'; items: ReadonlyArray<MenuItem>; label: string; control: TailControl }
  | { kind: 'swatches'; op: TailOp; control: TailControl }
  | { kind: 'list'; op: TailOp; control: TailControl; options: ReadonlyArray<ListOption> };

type ListOption = { id: string; label: string; value: unknown; checked?: boolean; doc?: string };

const ALIGN_ITEMS = [
  'format.alignIndent.left',
  'format.alignIndent.center',
  'format.alignIndent.right',
];
const SPACING_ITEMS = [
  'format.spacing.single',
  'format.spacing.1_15',
  'format.spacing.1_5',
  'format.spacing.double',
];

/** A typography field of the selected block, or undefined. */
function typography(block: Block | undefined): Record<string, unknown> {
  return block !== undefined &&
    'typography' in block &&
    typeof block.typography === 'object' &&
    block.typography !== null
    ? { ...(block.typography as Record<string, unknown>) }
    : {};
}

function colorOf(value: unknown): Color | undefined {
  return typeof value === 'string' ? (value as Color) : undefined;
}

/** The size the Font size field shows: the override, else the block's ladder step. */
export function shownSize(block: Block | undefined): number | null {
  if (block === undefined) return null;
  const size = typography(block).size;
  if (typeof size === 'number') return size;
  if (block.type === 'heading') return block.level === 'big' ? 88 : block.level === 'h2' ? 34 : 58;
  if (block.type === 'paragraph')
    return block.role === 'lead' ? 26 : block.role === 'cap' ? 17 : 20;
  if (block.type === 'table') return (block as TableBlock).size ?? 20;
  if (block.type === 'text' || block.type === 'box') return 20;
  return null;
}

/** The nearest ladder step to a typed size (SPEC 3.2 row 13). */
export function nearestStep(size: number): number {
  let best: number = TYPE_LADDER[0];
  for (const step of TYPE_LADDER) if (Math.abs(step - size) < Math.abs(best - size)) best = step;
  return best;
}

export function ToolbarTail() {
  const shell = useEditorShell();
  const { input, menuContext } = shell;
  const slide = input.document.slides[input.slideId];
  const block = selectedBlock(slide, input.selection);
  const kind: TailKind = tailOfSelection(slide, input.selection);
  const controls = tailFor(kind);
  const [plate, setPlate] = useState<{ anchor: HTMLElement; plate: Plate } | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);

  useMountEffect(() => {
    const media = window.matchMedia(`(max-width: ${MORE_BREAKPOINT_PX}px)`);
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  });

  /* a change of selection closes any open plate */
  useEffect(() => {
    setPlate(null);
  }, [kind, input.selection?.blockId]);

  const write = (path: string, value: unknown, label: string) => {
    if (block === undefined) return;
    input
      .dispatch('block.set', {
        slideId: input.slideId,
        blockId: block.id,
        path,
        ...(value === undefined ? {} : { value }),
        baseRevision: input.revision,
      })
      .catch((error: unknown) =>
        shell.say(`${label}: ${error instanceof Error ? error.message : String(error)}`),
      );
  };

  /** What a colour op writes for the selected block: the pointer and the current value. */
  const colorTarget = (
    op: TailOp,
  ): { path: string; current: Color | undefined; tones?: true } | null => {
    if (block === undefined) return null;
    switch (op) {
      case 'fillColor':
        if (block.type === 'table') {
          const column = input.selection?.cell?.column ?? 0;
          return {
            path: `/columns/${column}/fill`,
            current: colorOf((block as TableBlock).columns[column]?.fill),
          };
        }
        return 'fill' in block ? { path: '/fill', current: colorOf(block.fill) } : null;
      case 'borderColor':
      case 'lineColor':
        if (block.type === 'rule') return { path: '/color', current: colorOf(block.color) };
        return 'stroke' in block ? { path: '/stroke', current: colorOf(block.stroke) } : null;
      case 'textColor':
        if (block.type === 'heading' || block.type === 'paragraph')
          return {
            path: '/tone',
            current: 'tone' in block && block.tone === 'muted' ? 'titanium' : 'ink',
            tones: true,
          };
        return 'color' in block ? { path: '/color', current: colorOf(block.color) } : null;
      default:
        return null;
    }
  };

  const listOptions = (op: TailOp): ReadonlyArray<ListOption> => {
    switch (op) {
      case 'borderWeight': {
        if (block?.type === 'table') {
          const current = (block as TableBlock).border?.weight ?? 1;
          return [1, 1.5, 2].map((weight) => ({
            id: `weight-${weight}`,
            label: `${weight} px`,
            value: weight,
            checked: current === weight,
          }));
        }
        const current =
          block !== undefined && 'strokeWidth' in block ? block.strokeWidth : undefined;
        return STROKE_WIDTHS.map((weight) => ({
          id: `weight-${weight}`,
          label: weight === 0 ? 'None' : `${weight} px`,
          value: weight,
          checked: (current ?? 1) === weight,
        }));
      }
      case 'lineWeight': {
        const current =
          block?.type === 'rule' ? block.weight : block?.type === 'shape' ? block.width : undefined;
        const steps = block?.type === 'rule' ? [1, 1.5, 2] : [1, 1.5, 2, 3, 4];
        return steps.map((weight) => ({
          id: `line-${weight}`,
          label: `${weight} px`,
          value: weight,
          checked: (current ?? 1) === weight,
        }));
      }
      case 'lineStart':
      case 'lineEnd': {
        const heads =
          block?.type === 'shape'
            ? (block.arrowheads ?? (block.shape === 'arrow' ? 'end' : 'none'))
            : 'none';
        const startOn = heads === 'start' || heads === 'both';
        const endOn = heads === 'end' || heads === 'both';
        const on = op === 'lineStart' ? startOn : endOn;
        return [
          { id: 'none', label: 'None', value: false, checked: !on },
          { id: 'arrow', label: 'Arrow', value: true, checked: on },
        ];
      }
      case 'crop': {
        const current = block?.type === 'shot' ? (block.crop ?? 'center') : 'center';
        return [
          { id: 'top', label: 'Top', value: 'top', checked: current === 'top' },
          { id: 'center', label: 'Centre', value: 'center', checked: current === 'center' },
        ];
      }
      case 'imageBorder': {
        const on = block?.type === 'shot' && block.border === true;
        return [
          { id: 'none', label: 'None', value: false, checked: !on },
          {
            id: 'hairline',
            label: 'Hairline',
            value: true,
            checked: on,
            doc: 'The sheet hairline as the frame',
          },
        ];
      }
      case 'align': {
        const items = ALIGN_ITEMS.map((id) => itemById(id));
        const current =
          typography(block).align ??
          (block?.type === 'table'
            ? (block as TableBlock).columns[input.selection?.cell?.column ?? 0]?.align
            : undefined);
        const horizontal = items.map((item) => ({
          id: item.id,
          label: item.label,
          value: item,
          checked:
            current === item.label.toLowerCase() ||
            (current === undefined && item.label === 'Left'),
        }));
        if (block?.type !== 'table') return horizontal;
        const valign = (block as TableBlock).valign ?? 'top';
        return [
          ...horizontal,
          ...(['top', 'middle', 'bottom'] as const).map((each) => ({
            id: `valign-${each}`,
            label: each === 'top' ? 'Top' : each === 'middle' ? 'Middle' : 'Bottom',
            value: { valign: each },
            checked: valign === each,
          })),
        ];
      }
      case 'spacing': {
        const current = typography(block).leading;
        return SPACING_ITEMS.map((id, index) => {
          const item = itemById(id);
          return {
            id: item.id,
            label: item.label,
            value: item,
            checked: current === SPACING_STEPS[index]?.leading,
          };
        });
      }
      default:
        return [];
    }
  };

  const pickList = (op: TailOp, option: ListOption) => {
    setPlate(null);
    if (block === undefined) return;
    switch (op) {
      case 'borderWeight':
        if (block.type === 'table')
          return write('/border', { weight: option.value }, 'Border weight');
        return write('/strokeWidth', option.value, 'Border weight');
      case 'lineWeight':
        return write(block.type === 'rule' ? '/weight' : '/width', option.value, 'Line weight');
      case 'lineStart':
      case 'lineEnd': {
        if (block.type !== 'shape') return;
        const heads = block.arrowheads ?? (block.shape === 'arrow' ? 'end' : 'none');
        let start = heads === 'start' || heads === 'both';
        let end = heads === 'end' || heads === 'both';
        if (op === 'lineStart') start = option.value === true;
        else end = option.value === true;
        const next = start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
        return write('/arrowheads', next, option.label);
      }
      case 'crop':
        return write('/crop', option.value, 'Crop image');
      case 'imageBorder':
        return write('/border', option.value === true ? true : undefined, 'Border color');
      case 'align':
      case 'spacing': {
        const value = option.value;
        if (value !== null && typeof value === 'object' && 'valign' in value)
          return write('/valign', value.valign, 'Align');
        if (value !== null && typeof value === 'object' && 'id' in value)
          shell.runItem(value as MenuItem);
        return;
      }
      default:
        return;
    }
  };

  const pickColor = (op: TailOp, value: Color | 'none') => {
    setPlate(null);
    const target = colorTarget(op);
    if (target === null) return;
    if (target.tones) {
      const tone = value === 'none' || value === 'ink' ? undefined : 'muted';
      write(target.path, tone, 'Text color');
      return;
    }
    write(target.path, value === 'none' ? undefined : value, 'Colour');
  };

  const openPlate = (control: TailControl, anchor: HTMLElement) => {
    if (plate !== null && plate.anchor === anchor) {
      setPlate(null);
      return;
    }
    if (control.arrow !== undefined) {
      const item = itemById(control.arrow);
      /* a dynamic submenu (Apply layout) is the layout grid, not a list of rows */
      if (item.effect?.kind === 'submenu' && item.effect.dynamic !== undefined) {
        shell.openLayoutGrid({ purpose: 'apply', anchor, returnFocusTo: anchor });
        return;
      }
      setPlate({
        anchor,
        plate: {
          kind: 'menu',
          items: visibleItems(item.items ?? []),
          label: control.label,
          control,
        },
      });
      return;
    }
    const op = control.op;
    if (op === undefined) return;
    if (op === 'fillColor' || op === 'borderColor' || op === 'lineColor' || op === 'textColor') {
      setPlate({ anchor, plate: { kind: 'swatches', op, control } });
      return;
    }
    if (op === 'formatOptions') {
      shell.runControl(control, anchor);
      return;
    }
    setPlate({ anchor, plate: { kind: 'list', op, control, options: listOptions(op) } });
  };

  const onControl = (control: TailControl, anchor: HTMLElement) => {
    if (
      control.arrow !== undefined ||
      (control.op !== undefined && control.op !== 'formatOptions' && control.op !== 'font')
    ) {
      openPlate(control, anchor);
      return;
    }
    shell.runControl(control, anchor);
  };

  const hide = itemById('view.fullScreen');
  const hideControl: TailControl = {
    control: HIDE_MENUS_CONTROL,
    label: 'Hide the menus',
    icon: 'chevron-up',
    key: hide.key,
    status: 'now',
    item: hide.id,
  };

  const moreItems: MenuItem[] = controls.map((control) => ({
    id: `toolbar.more.${control.control}`,
    label: control.label,
    status: control.status,
    ...(control.icon === undefined ? {} : { icon: control.icon }),
    ...(control.key === undefined ? {} : { key: control.key }),
    ...(control.stubReason === undefined ? {} : { stubReason: control.stubReason }),
    ...(control.enabled === undefined ? {} : { enabled: control.enabled }),
    ...(control.disabledReason === undefined ? {} : { disabledReason: control.disabledReason }),
    ...(control.doc === undefined ? {} : { doc: control.doc }),
    ...(control.dividerBefore === undefined ? {} : { dividerBefore: control.dividerBefore }),
    effect: { kind: 'client', handler: 'runAction' },
  }));

  return (
    <div
      className={cn('ts-tb-tail', narrow && 'is-more')}
      data-control="toolbar.tail"
      data-tail={kind}
    >
      {narrow ? (
        <>
          <button
            ref={moreButton}
            type="button"
            className="pt-ib pt-icon ts-tb"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            data-control="toolbar.more"
            onClick={() => setMoreOpen((on) => !on)}
            {...tipProps({ name: 'More', doc: 'The rest of the toolbar' })}
          >
            <Icon name="ellipsis-horizontal" />
          </button>
          {moreOpen && moreButton.current ? (
            <Menu
              items={moreItems}
              context={menuContext}
              label="More"
              anchor={{ kind: 'element', element: moreButton.current }}
              placement="below"
              returnFocusTo={moreButton.current}
              onSelect={(chosen) => {
                const control = controls.find(
                  (each) => `toolbar.more.${each.control}` === chosen.id,
                );
                if (control !== undefined && moreButton.current)
                  onControl(control, moreButton.current);
              }}
              onClose={() => setMoreOpen(false)}
              id="ts-menu-toolbar-more"
            />
          ) : null}
        </>
      ) : (
        controls.map((control, index) => {
          const key = `${control.control}-${index}`;
          if (control.op === 'fontSize')
            return <FontSizeField key={key} control={control} block={block} />;
          const divider =
            control.dividerBefore === true && index > 0 ? (
              <ToolbarDivider key={`${key}-sep`} />
            ) : null;
          const pressed =
            control.op === 'formatOptions'
              ? shell.panel === 'formatOptions'
              : control.control === 'toolbar.theme'
                ? shell.panel === 'themes'
                : control.control === 'toolbar.layout'
                  ? shell.layoutGrid?.purpose === 'apply'
                  : plate?.plate.control.control === control.control
                    ? true
                    : undefined;
          return (
            <span key={key} className="ts-tb-slot">
              {divider}
              <ToolbarButton
                control={control}
                onClick={(anchor) => onControl(control, anchor)}
                pressed={pressed}
                chevron={control.dropdown === true || control.arrow !== undefined}
              />
            </span>
          );
        })
      )}
      <span className="ts-tb-spring" aria-hidden="true" />
      <ToolbarButton control={hideControl} onClick={() => shell.setCompact(true)} />
      {plate !== null ? (
        plate.plate.kind === 'menu' ? (
          <Menu
            items={plate.plate.items}
            context={menuContext}
            label={plate.plate.label}
            anchor={{ kind: 'element', element: plate.anchor }}
            placement="below"
            returnFocusTo={plate.anchor}
            onSelect={(chosen) => shell.runItem(chosen, plate.anchor)}
            onClose={() => setPlate(null)}
            renderDynamic={shell.renderLayoutSubmenu}
            id={`ts-menu-${plate.plate.control.control}`}
          />
        ) : plate.plate.kind === 'swatches' ? (
          <SwatchPlate
            anchor={plate.anchor}
            control={plate.plate.control}
            target={colorTarget(plate.plate.op)}
            onPick={(
              (op: TailOp) => (value: Color | 'none') =>
                pickColor(op, value)
            )(plate.plate.op)}
            onClose={() => setPlate(null)}
          />
        ) : (
          <Menu
            items={plate.plate.options.map((option) => ({
              id: `${plate.plate.control.control}.${option.id}`,
              label: option.label,
              status: 'now' as const,
              effect: { kind: 'client' as const, handler: 'runAction' as const },
              /* the check state rides a private value of the zoom setting in the plate's own context */
              checked: { setting: 'zoom' as const, value: option.checked ? '__on__' : '__off__' },
              ...(option.doc === undefined ? {} : { doc: option.doc }),
            }))}
            context={{ ...menuContext, settings: { ...menuContext.settings, zoom: '__on__' } }}
            label={plate.plate.control.label}
            anchor={{ kind: 'element', element: plate.anchor }}
            placement="below"
            returnFocusTo={plate.anchor}
            onSelect={(chosen) => {
              const list = plate.plate;
              if (list.kind !== 'list') return;
              const option = list.options.find(
                (each) => `${list.control.control}.${each.id}` === chosen.id,
              );
              if (option !== undefined) pickList(list.op, option);
            }}
            onClose={() => setPlate(null)}
            id={`ts-menu-${plate.plate.control.control}`}
          />
        )
      ) : null}
    </div>
  );
}

/** The Font size field with its minus and plus (SPEC 3.2 row 13). */
function FontSizeField({ control, block }: { control: TailControl; block: Block | undefined }) {
  const shell = useEditorShell();
  const enabled =
    control.status === 'now' && evaluate(control.enabled, shell.menuContext) && block !== undefined;
  const size = shownSize(block);
  const [typing, setTyping] = useState<string | null>(null);
  const tip = controlTip(control, shell.platform, enabled);

  const apply = (next: number) => {
    if (block === undefined) return;
    const step = nearestStep(next);
    if (step !== next) shell.say(`Font size ${step}: the nearest step of the type ladder`);
    if (block.type === 'table') {
      shell.input
        .dispatch('block.set', {
          slideId: shell.input.slideId,
          blockId: block.id,
          path: '/size',
          value: step,
          baseRevision: shell.input.revision,
        })
        .catch((error: unknown) =>
          shell.say(error instanceof Error ? error.message : String(error)),
        );
      return;
    }
    shell.input
      .dispatch('block.set', {
        slideId: shell.input.slideId,
        blockId: block.id,
        path: '/typography',
        value: { ...typography(block), size: step },
        baseRevision: shell.input.revision,
      })
      .catch((error: unknown) => shell.say(error instanceof Error ? error.message : String(error)));
  };

  const commit = () => {
    const value = typing;
    setTyping(null);
    if (value === null) return;
    const n = Number(value.trim());
    if (Number.isFinite(n) && n > 0) apply(n);
  };

  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setTyping(null);
      event.currentTarget.blur();
    }
  };

  const fieldTip = tipProps(tip);
  const decrease = itemById('format.text.size.decrease');
  const increase = itemById('format.text.size.increase');
  return (
    <span className={cn('ts-tb-size', !enabled && 'is-disabled')} data-control={control.control}>
      <button
        type="button"
        className="pt-ib pt-icon ts-tb ts-tb-size-step"
        aria-label={decrease.label}
        aria-disabled={enabled ? undefined : true}
        data-control="toolbar.fontSize.minus"
        onClick={() => enabled && size !== null && apply(stepLadder(size, -1))}
        {...tipProps({ name: decrease.label, key: 'Cmd Shift <' })}
      >
        <Icon name="minus" />
      </button>
      <input
        className="ts-tb-size-field"
        type="text"
        inputMode="numeric"
        value={typing ?? (size === null ? '' : String(size))}
        aria-label="Font size"
        aria-disabled={enabled ? undefined : true}
        readOnly={!enabled}
        data-control="toolbar.fontSize.value"
        autoComplete="off"
        spellCheck={false}
        {...fieldTip}
        onFocus={(event) => {
          fieldTip.onFocus(event);
          event.currentTarget.select();
        }}
        onChange={(event) => setTyping(event.target.value)}
        onKeyDown={(event) => {
          fieldTip.onKeyDown(event);
          onKey(event);
        }}
        onBlur={(event) => {
          fieldTip.onBlur(event);
          if (typing !== null) commit();
        }}
      />
      <button
        type="button"
        className="pt-ib pt-icon ts-tb ts-tb-size-step"
        aria-label={increase.label}
        aria-disabled={enabled ? undefined : true}
        data-control="toolbar.fontSize.plus"
        onClick={() => enabled && size !== null && apply(stepLadder(size, 1))}
        {...tipProps({ name: increase.label, key: 'Cmd Shift >' })}
      >
        <Icon name="plus" />
      </button>
    </span>
  );
}

/** The colour plate: the twelve palette swatches, None and a hex field (SPEC 3.2 rows 8, 9, 17). */
function SwatchPlate({
  anchor,
  control,
  target,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  control: TailControl;
  target: { path: string; current: Color | undefined; tones?: true } | null;
  onPick: (value: Color | 'none') => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState('');
  const rect = anchor.getBoundingClientRect();

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) || anchor.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    root.current?.querySelector<HTMLElement>('button')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      anchor.focus();
    }
  };

  const tones = target?.tones === true;
  const hexTip = tipProps({
    name: 'Custom colour',
    doc: 'Six hex digits; Enter applies',
    key: 'Enter',
  });
  const options: ReadonlyArray<{ value: Color | 'none'; label: string }> = tones
    ? [
        { value: 'ink', label: 'Ink' },
        { value: 'titanium', label: 'Muted' },
      ]
    : [
        { value: 'none', label: 'None' },
        ...COLOR_TOKENS.map((token) => ({ value: token, label: COLOR_LABELS[token] })),
      ];
  const current: Color | 'none' = target?.current ?? (tones ? 'ink' : 'none');

  return (
    <div
      ref={root}
      className="ts-tb-swatches ts-chrome"
      role="dialog"
      aria-label={control.label}
      style={{ left: rect.left, top: rect.bottom + 2 }}
      data-control={`${control.control}.plate`}
      onKeyDown={onKey}
    >
      <div className="ts-tb-swatch-grid">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              'ts-tb-swatch',
              current === option.value && 'is-on',
              option.value === 'none' && 'is-none',
            )}
            aria-label={option.label}
            aria-pressed={current === option.value}
            data-control={`${control.control}.${option.value}`}
            style={option.value === 'none' ? undefined : { background: swatchPaint(option.value) }}
            onClick={() => onPick(option.value)}
            {...tipProps({ name: option.label })}
          />
        ))}
      </div>
      {tones ? null : (
        <label className="ts-tb-hex">
          <span>Custom</span>
          <input
            type="text"
            value={hex}
            placeholder="#rrggbb"
            aria-label="Custom colour"
            data-control={`${control.control}.hex`}
            spellCheck={false}
            autoComplete="off"
            {...hexTip}
            onChange={(event) => setHex(event.target.value)}
            onKeyDown={(event) => {
              hexTip.onKeyDown(event);
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const value = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
              if (isHexColor(value)) onPick(value);
            }}
          />
        </label>
      )}
    </div>
  );
}
