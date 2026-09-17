import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import { STROKE_WIDTHS } from '@turboslide/schema/blocks';
import {
  CHART_KINDS,
  CHART_KIND_LABELS,
  CHART_LEGENDS,
  CHART_NUMBER_FORMATS,
} from '@turboslide/schema/blocks/chart';
import type { ChartBlock } from '@turboslide/schema/blocks/chart';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import { isLineKind } from '@turboslide/schema/shapes';
import type { Color } from '@turboslide/schema/color';
import { BULLET_PRESETS, NUMBER_PRESETS } from '@turboslide/schema/text';
import { TYPE_LADDER } from '@turboslide/schema/typography';

import {
  dashPlan,
  factsOf,
  lineEndPlan,
  listPlan,
  memberWritePlan,
  selectedBlock,
  selectedBlocks,
  shapePickPlan,
  SPACING_STEPS,
  stepLadder,
  tailKindOf as tailOfSelection,
  textStylePlan,
} from './editor-shell';
import type { ActionPlan, ActionRefusal } from './editor-shell';
import { useEditorShell } from './editor-shell-context';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { Menu } from './Menu';
import { evaluate, isPresent, itemById, presentControls, visibleItems } from './menus/model';
import type { MenuItem } from './menus/model';
import {
  HIDE_MENUS_CONTROL,
  MORE_BREAKPOINT_PX,
  TOOLBAR_TAIL_END,
  tailFor,
} from './menus/toolbar-tails';
import { PRESENCE } from './menus/strings';
import type { TailControl, TailKind, TailOp } from './menus/toolbar-tails';
import { ColorPlate, anchoredAt } from './pickers/ColorPlate';
import { DashList } from './pickers/DashList';
import { LineEndPicker } from './pickers/LineEndPicker';
import { ShapePicker } from './pickers/ShapePicker';
import { tablePlan, tableWriteInput } from './table-tools';
import { ToolbarButton, ToolbarDivider, controlTip } from './ToolbarHead';
import { tipProps } from './Tooltip';

/**
 * The toolbar's contextual tail (gslides-parity SPEC 3.1 rows 8 to 18, 3.2 to 3.8; SPEC-2 4.2;
 * R02 section 4): the controls after the first divider, replaced by the family of the selection
 * (a text block, a shape, a picture, a line, a table cell, a chart, a group, another block). Each
 * control is drawn from `menus/toolbar-tails.ts` by the shared `ToolbarButton`; a control with an
 * `item` runs the menu item, one with an `arrow` opens that item's submenu as a dropdown under the
 * button (a list of rows, or the item's dynamic plate: the layout grid, a preset grid, the shape
 * picker), one with an `op` opens the plate this file draws (the colour plate, a list of weights,
 * the alignments with Justify and the vertical alignments, the spacing steps, the dash list, the
 * line decoration grid, the shape picker, the chart dropdowns) or edits the size field. A colour,
 * border or dash op on a group selection writes every member that has the field in one write
 * (SPEC-2 0.102); on word art Border color and Border weight write the outline (0.62); on a table
 * Fill color writes the selected cells through the table plans. At or below 1100 px the tail from
 * position 8 collapses into one More button whose menu lists the same controls with their labels
 * (SPEC 0.6, 1.3); nothing wraps. The Hide the menus chevron sits at the far right of every tail.
 */
export { tailOfSelection as tailKindOf };

type Plate =
  | { kind: 'menu'; items: ReadonlyArray<MenuItem>; label: string; control: TailControl }
  | { kind: 'swatches'; op: TailOp; control: TailControl }
  | { kind: 'list'; op: TailOp; control: TailControl; options: ReadonlyArray<ListOption> }
  | { kind: 'picker'; op: TailOp; control: TailControl; node: ReactNode }
  | { kind: 'dynamic'; control: TailControl; item: MenuItem };

type ListOption = { id: string; label: string; value: unknown; checked?: boolean; doc?: string };

const ALIGN_ITEMS = [
  'format.alignIndent.left',
  'format.alignIndent.center',
  'format.alignIndent.right',
  'format.alignIndent.justified',
];
const SPACING_ITEMS = [
  'format.spacing.single',
  'format.spacing.1_15',
  'format.spacing.1_5',
  'format.spacing.double',
];

const LEGEND_LABELS: Readonly<Record<string, string>> = {
  none: 'None',
  right: 'Right',
  bottom: 'Bottom',
  top: 'Top',
  left: 'Left',
};
const NUMBER_FORMAT_LABELS: Readonly<Record<string, string>> = {
  plain: 'Plain',
  thousands: 'Thousands',
  percent: 'Percent',
  currency: 'Currency',
};

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
  if (block.type === 'text' || block.type === 'box' || block.type === 'shape') return 20;
  return null;
}

/** The nearest ladder step to a typed size (SPEC 3.2 row 13). */
export function nearestStep(size: number): number {
  let best: number = TYPE_LADDER[0];
  for (const step of TYPE_LADDER) if (Math.abs(step - size) < Math.abs(best - size)) best = step;
  return best;
}

/** True for a positioned box, shape or text box, where Top, Middle and Bottom write `valign` (SPEC-2 2.2.18). */
export function takesValign(block: Block | undefined): boolean {
  if (block === undefined) return false;
  if (block.type === 'table') return true;
  return (
    block.pos !== undefined &&
    (block.type === 'box' ||
      block.type === 'text' ||
      (block.type === 'shape' && !isLineKind(block.shape)))
  );
}

/** The controls with an `arrow` to a row the context does not draw read as plain buttons. */
function withPresentArrows(
  controls: ReadonlyArray<TailControl>,
  context: Parameters<typeof isPresent>[1],
): TailControl[] {
  return controls.map((control) => {
    if (control.arrow === undefined || isPresent(itemById(control.arrow), context)) return control;
    const { arrow: _parked, ...rest } = control;
    return rest;
  });
}

/** The two list buttons of the text tail: the button applies the first preset, the arrow picks another (docs/FOCUS.md section 5, rank 9). */
function listButtonOf(
  control: TailControl,
): { marker: 'bullet' | 'number'; preset: string } | null {
  if (control.control === 'toolbar.bulletedList')
    return { marker: 'bullet', preset: BULLET_PRESETS[0] ?? 'disc' };
  if (control.control === 'toolbar.numberedList')
    return { marker: 'number', preset: NUMBER_PRESETS[0] ?? 'decimal' };
  return null;
}

export function ToolbarTail() {
  const shell = useEditorShell();
  const { input, menuContext } = shell;
  const slide = input.document.slides[input.slideId];
  const block = selectedBlock(slide, input.selection);
  const members = selectedBlocks(slide, input.selection);
  const kind: TailKind = tailOfSelection(slide, input.selection);
  const many = kind === 'group' || members.length > 1;
  /* a parked control leaves the tail, and the More button's list, while Tools > Advanced tools is
     off (docs/FOCUS.md 3.1, 3.3); `toolbar.font` stays as a disabled `now` control. A tail parked
     whole (a chart, a table cell, a group) falls back to the default tail, so the bar is never
     empty while a parked block is selected; a control whose arrow opens a parked row (Crop image
     and Mask image) keeps its button and loses the arrow. */
  const controls = withPresentArrows(
    presentControls(tailFor(kind), menuContext).length > 0 || kind === 'default'
      ? presentControls(tailFor(kind), menuContext)
      : presentControls(tailFor('default'), menuContext),
    menuContext,
  );
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

  const fail = (label: string) => (error: unknown) =>
    shell.say(`${label}: ${error instanceof Error ? error.message : String(error)}`);

  const run = (plan: ActionPlan | ActionRefusal) => {
    if ('refused' in plan) {
      shell.say(plan.refused);
      return;
    }
    input.dispatch(plan.action, plan.input).catch(fail(plan.label));
  };

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
      .catch(fail(label));
  };

  const facts = () => factsOf(input, shell.lastLayout);

  /** What a colour op writes for the selected block: the pointer and the current value. */
  const colorTarget = (
    op: TailOp,
  ): { path: string; current: Color | undefined; tones?: true } | null => {
    if (block === undefined) return null;
    switch (op) {
      case 'fillColor':
        if (block.type === 'table') {
          const cell = input.selection?.cell ?? { row: 0, column: 0 };
          const styled = (block as TableBlock).cells?.find(
            (each) => each.row === cell.row && each.column === cell.column,
          );
          return { path: '/cells', current: colorOf(styled?.fill) };
        }
        /* a shape or line drawn by the tool carries no fill or stroke field until one is written
           (the schema's shape block has both optional); the swatch writes the field either way.
           Before this the `in` check answered null on a fresh line and the Line color swatch
           wrote nothing (VERIFICATION.md C2-F11, `lines.tail.colour-weight-dash-ends`) */
        if (block.type === 'shape') return { path: '/fill', current: colorOf(block.fill) };
        return 'fill' in block ? { path: '/fill', current: colorOf(block.fill) } : null;
      case 'borderColor':
      case 'lineColor':
        if (block.type === 'rule') return { path: '/color', current: colorOf(block.color) };
        if (block.type === 'text' && block.outline !== undefined)
          return { path: '/outline', current: block.outline.color };
        if (block.type === 'table')
          return { path: '/border', current: colorOf((block as TableBlock).border?.color) };
        if (block.type === 'shape') return { path: '/stroke', current: colorOf(block.stroke) };
        return 'stroke' in block ? { path: '/stroke', current: colorOf(block.stroke) } : null;
      case 'imageBorder':
        if (block.type === 'shot' || block.type === 'picture')
          return { path: '/frame', current: colorOf(block.frame?.color) };
        return null;
      case 'textColor':
        if (block.type === 'heading' || block.type === 'paragraph')
          return {
            path: '/tone',
            current: 'tone' in block && block.tone === 'muted' ? 'titanium' : 'ink',
            tones: true,
          };
        return 'color' in block ? { path: '/color', current: colorOf(block.color) } : null;
      case 'highlightColor':
        return { path: 'highlight', current: colorOf(input.selection?.marks?.hl) };
      default:
        return null;
    }
  };

  const listOptions = (op: TailOp): ReadonlyArray<ListOption> => {
    switch (op) {
      case 'borderWeight': {
        if (block?.type === 'table') {
          const current = (block as TableBlock).border?.weight ?? 1;
          return [0, 1, 1.5, 2].map((weight) => ({
            id: `weight-${weight}`,
            label: weight === 0 ? 'None' : `${weight} px`,
            value: weight,
            checked: current === weight,
          }));
        }
        if (block?.type === 'text' && block.outline !== undefined) {
          const current = block.outline.width;
          return [1, 1.5, 2].map((weight) => ({
            id: `weight-${weight}`,
            label: `${weight} px`,
            value: weight,
            checked: current === weight,
          }));
        }
        if (block?.type === 'shot' || block?.type === 'picture') {
          const current =
            block.frame?.weight ?? (block.type === 'shot' && block.border === true ? 1 : 0);
          return [0, 1, 1.5, 2].map((weight) => ({
            id: `weight-${weight}`,
            label: weight === 0 ? 'None' : `${weight} px`,
            value: weight,
            checked: current === weight,
          }));
        }
        const current =
          block !== undefined && 'strokeWidth' in block
            ? block.strokeWidth
            : block?.type === 'shape'
              ? block.width
              : undefined;
        const steps: ReadonlyArray<number> =
          block?.type === 'shape' ? [0, 1, 1.5, 2, 3, 4] : STROKE_WIDTHS;
        return steps.map((weight) => ({
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
            current === (item.id.endsWith('justified') ? 'justify' : item.label.toLowerCase()) ||
            (current === undefined && item.label === 'Left'),
          ...(item.id.endsWith('justified') && block?.type === 'table'
            ? { doc: 'Justified applies to a text block' }
            : {}),
        }));
        if (!takesValign(block)) return horizontal;
        const valign =
          block !== undefined && 'valign' in block && block.valign !== undefined
            ? block.valign
            : 'top';
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
      case 'chartType': {
        const current = block?.type === 'chart' ? (block as ChartBlock).kind : undefined;
        return CHART_KINDS.map((chartKind) => ({
          id: chartKind,
          label: CHART_KIND_LABELS[chartKind],
          value: chartKind,
          checked: current === chartKind,
        }));
      }
      case 'legend': {
        const current = block?.type === 'chart' ? ((block as ChartBlock).legend ?? 'none') : 'none';
        return CHART_LEGENDS.map((legend) => ({
          id: legend,
          label: LEGEND_LABELS[legend] ?? legend,
          value: legend,
          checked: current === legend,
        }));
      }
      case 'numberFormat': {
        const current =
          block?.type === 'chart' ? ((block as ChartBlock).numberFormat ?? 'plain') : 'plain';
        return CHART_NUMBER_FORMATS.map((format) => ({
          id: format,
          label: NUMBER_FORMAT_LABELS[format] ?? format,
          value: format,
          checked: current === format,
        }));
      }
      default:
        return [];
    }
  };

  const pickList = (op: TailOp, option: ListOption) => {
    setPlate(null);
    if (block === undefined) return;
    switch (op) {
      case 'borderWeight': {
        const weight = option.value as number;
        if (many) return run(memberWritePlan(facts(), 'strokeWidth', weight, 'Border weight'));
        if (block.type === 'table')
          return write(
            '/border',
            { ...((block as TableBlock).border ?? {}), weight },
            'Border weight',
          );
        if (block.type === 'text' && block.outline !== undefined)
          return write('/outline', { ...block.outline, width: weight }, 'Border weight');
        if (block.type === 'shot' || block.type === 'picture') {
          const frame = { ...(block.frame ?? {}) } as Record<string, unknown>;
          if (weight === 0) delete frame.weight;
          else frame.weight = weight;
          return write(
            '/frame',
            Object.keys(frame).length === 0 ? undefined : frame,
            'Border weight',
          );
        }
        if (block.type === 'shape')
          return write('/width', weight === 0 ? undefined : weight, 'Border weight');
        return write('/strokeWidth', weight, 'Border weight');
      }
      case 'lineWeight':
        return write(block.type === 'rule' ? '/weight' : '/width', option.value, 'Line weight');
      case 'align':
      case 'spacing': {
        const value = option.value;
        if (value !== null && typeof value === 'object' && 'valign' in value)
          return write('/valign', value.valign === 'top' ? undefined : value.valign, 'Align');
        if (value !== null && typeof value === 'object' && 'id' in value)
          shell.runItem(value as MenuItem);
        return;
      }
      case 'chartType':
        input
          .dispatch('chart.setKind', {
            slideId: input.slideId,
            blockId: block.id,
            kind: option.value,
            baseRevision: input.revision,
          })
          .catch(fail('Chart type'));
        return;
      case 'legend':
        return write('/legend', option.value === 'none' ? undefined : option.value, 'Legend');
      case 'numberFormat':
        return write(
          '/numberFormat',
          option.value === 'plain' ? undefined : option.value,
          'Number format',
        );
      default:
        return;
    }
  };

  const pickColor = (op: TailOp, value: Color | 'none') => {
    setPlate(null);
    if (op === 'highlightColor') {
      run(
        textStylePlan(facts(), { highlight: value === 'none' ? null : value }, 'Highlight color'),
      );
      return;
    }
    /* Text color with a range selected in a session (live or parked while the plate was open)
       writes a colour mark on the range, the way Highlight does; with no session on a text box
       or a box the block's own colour is written even though the block carries none yet
       (docs/FOCUS.md rank 12: no colour reached a plain text box) */
    if (op === 'textColor' && input.selection?.range !== undefined && !many) {
      run(textStylePlan(facts(), { color: value === 'none' ? null : value }, 'Text color'));
      return;
    }
    if (
      op === 'textColor' &&
      !many &&
      block !== undefined &&
      (block.type === 'text' || block.type === 'box')
    ) {
      write('/color', value === 'none' ? undefined : value, 'Text color');
      return;
    }
    if (many) {
      const field = op === 'fillColor' ? 'fill' : op === 'textColor' ? 'color' : 'stroke';
      run(memberWritePlan(facts(), field, value === 'none' ? undefined : value, 'Colour'));
      return;
    }
    const target = colorTarget(op);
    if (target === null || block === undefined) return;
    if (target.tones) {
      const tone = value === 'none' || value === 'ink' ? undefined : 'muted';
      write(target.path, tone, 'Text color');
      return;
    }
    if (op === 'fillColor' && block.type === 'table') {
      const cell = input.selection?.cell;
      const plan = tablePlan(
        block as TableBlock,
        {
          ...(cell === undefined ? {} : { cell: [cell.row, cell.column] as [number, number] }),
          ...(input.selection?.cells === undefined ? {} : { cells: input.selection.cells }),
        },
        'cellFill',
        { fill: value === 'none' ? null : value },
      );
      if ('refused' in plan) return shell.say(plan.refused);
      input
        .dispatch(plan.action, tableWriteInput(plan, input.slideId, input.revision))
        .catch(fail('Fill color'));
      return;
    }
    if (target.path === '/outline' && block.type === 'text' && block.outline !== undefined) {
      if (value === 'none') return write('/outline', undefined, 'Border color');
      return write('/outline', { ...block.outline, color: value }, 'Border color');
    }
    if (target.path === '/border' && block.type === 'table') {
      const border = { ...((block as TableBlock).border ?? { weight: 1 }) } as Record<
        string,
        unknown
      >;
      if (value === 'none') delete border.color;
      else border.color = value;
      return write('/border', border, 'Border color');
    }
    if (target.path === '/frame' && (block.type === 'shot' || block.type === 'picture')) {
      const frame = { ...(block.frame ?? {}) } as Record<string, unknown>;
      if (value === 'none') delete frame.color;
      else frame.color = value;
      return write('/frame', Object.keys(frame).length === 0 ? undefined : frame, 'Border color');
    }
    write(target.path, value === 'none' ? undefined : value, 'Colour');
  };

  /** The pickers of round two as plates: the dash list, the line decorations, the shape picker. */
  const pickerNode = (op: TailOp, control: TailControl): ReactNode | null => {
    switch (op) {
      case 'borderDash':
      case 'lineDash': {
        const current = block !== undefined && 'dash' in block ? (block.dash as never) : undefined;
        return (
          <DashList
            picked={current}
            control={control.control}
            autoFocus
            onPick={(dash) => {
              setPlate(null);
              if (many)
                run(
                  memberWritePlan(
                    facts(),
                    'dash',
                    dash === 'solid' ? undefined : dash,
                    'Border dash',
                  ),
                );
              else run(dashPlan(facts(), dash === 'solid' ? null : dash, control.label));
            }}
          />
        );
      }
      case 'lineStart':
      case 'lineEnd': {
        const end = op === 'lineStart' ? 'start' : 'end';
        const picked =
          block?.type === 'shape' ? (end === 'start' ? block.lineStart : block.lineEnd) : undefined;
        return (
          <LineEndPicker
            end={end}
            picked={picked}
            control={control.control}
            autoFocus
            onPick={(lineEnd) => {
              setPlate(null);
              run(lineEndPlan(facts(), end, lineEnd, control.label));
            }}
          />
        );
      }
      case 'changeShape':
        return (
          <ShapePicker
            picked={block?.type === 'shape' ? block.shape : undefined}
            control={control.control}
            autoFocus
            onPick={(shape) => {
              setPlate(null);
              run(
                shapePickPlan({ id: 'toolbar.changeShape', label: control.label }, facts(), shape),
              );
            }}
          />
        );
      default:
        return null;
    }
  };

  const openPlate = (control: TailControl, anchor: HTMLElement) => {
    if (plate !== null && plate.anchor === anchor) {
      setPlate(null);
      return;
    }
    if (control.arrow !== undefined) {
      const item = itemById(control.arrow);
      if (item.effect?.kind === 'submenu' && item.effect.dynamic !== undefined) {
        if (item.effect.dynamic === 'layouts')
          shell.openLayoutGrid({ purpose: 'apply', anchor, returnFocusTo: anchor });
        else if (shell.renderDynamicSubmenu(item, { viaKeyboard: true }) !== null)
          setPlate({ anchor, plate: { kind: 'dynamic', control, item } });
        else if (item.items === undefined || item.items.length === 0) shell.runItem(item, anchor);
        else
          setPlate({
            anchor,
            plate: {
              kind: 'menu',
              items: visibleItems(item.items, { context: menuContext }),
              label: control.label,
              control,
            },
          });
        return;
      }
      /* the rows the context draws: a parked row leaves the dropdown with the switch off
         (docs/FOCUS.md 3.1; the Line arrow lists Line and Arrow). A dropdown whose first visible
         row is a static submenu lists that submenu's rows in its place, so the Shape button offers
         Rectangle, Rounded rectangle and Ellipse directly (docs/FOCUS.md section 4,
         `shapes.insert.named-rows`) instead of one Shapes row to hover; with Tools > Advanced tools
         on the gallery rows (All shapes, Arrows, Callouts, Equation) follow them (VERIFICATION.md
         C2-F11: the row is driven with the switch on while the feature is parked) */
      let rows = visibleItems(item.items ?? [], { context: menuContext });
      const first = rows[0];
      if (
        first !== undefined &&
        first.effect?.kind === 'submenu' &&
        first.effect.dynamic === undefined
      )
        rows = [...visibleItems(first.items ?? [], { context: menuContext }), ...rows.slice(1)];
      setPlate({
        anchor,
        plate: {
          kind: 'menu',
          items: rows,
          label: control.label,
          control,
        },
      });
      return;
    }
    const op = control.op;
    if (op === undefined) return;
    if (
      op === 'fillColor' ||
      op === 'borderColor' ||
      op === 'lineColor' ||
      op === 'textColor' ||
      op === 'highlightColor' ||
      op === 'imageBorder'
    ) {
      setPlate({ anchor, plate: { kind: 'swatches', op, control } });
      return;
    }
    if (op === 'formatOptions') {
      shell.runControl(control, anchor);
      return;
    }
    if (op === 'editData') {
      shell.openPanel('formatOptions', { section: 'chart' });
      return;
    }
    if (op === 'crop') {
      if (input.editor?.cropMode) input.editor.cropMode();
      else shell.say('Double click the picture on the slide to crop it');
      return;
    }
    const node = pickerNode(op, control);
    if (node !== null) {
      setPlate({ anchor, plate: { kind: 'picker', op, control, node } });
      return;
    }
    setPlate({ anchor, plate: { kind: 'list', op, control, options: listOptions(op) } });
  };

  const onControl = (control: TailControl, anchor: HTMLElement) => {
    /* Crop image is a button with the Mask arrow: the button enters crop mode, the arrow opens the shape picker */
    if (control.op === 'crop') {
      openPlate({ ...control, arrow: undefined }, anchor);
      return;
    }
    /* the list buttons write `text.list` with the first preset (docs/FOCUS.md rank 9: the row
       they name is a preset plate, which has nothing to draw on a button); the arrow picks another */
    const list = listButtonOf(control);
    if (list !== null) {
      run(listPlan(facts(), list, control.label));
      return;
    }
    /* the Line button arms the Line tool and its arrow lists the line kinds, the way Text box arms
       the text tool (docs/FOCUS.md `lines.insert.line-drag`, the toolbar route; b3.md R12) */
    if (control.control === 'toolbar.insertLine') {
      shell.runControl(control, anchor);
      return;
    }
    if (
      control.arrow !== undefined ||
      (control.op !== undefined &&
        control.op !== 'formatOptions' &&
        control.op !== 'font' &&
        /* the Select button's op names its pressed state, not a plate: the click is the shell's,
           which clears the selection and returns the stage to the Select tool (docs/FOCUS.md
           `arrange.toolbar.select`: the button opened an empty list and the tool stayed text) */
        control.op !== 'select')
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

  /** The pressed state of a text mark button from the caret's run (SPEC-2 6.2). */
  const markPressed = (control: TailControl): boolean | undefined => {
    const marks = input.selection?.marks;
    if (control.control === 'toolbar.italic') return marks?.i === true;
    if (control.control === 'toolbar.underline') return marks?.u === true;
    if (control.control === 'toolbar.bold') return typography(block).weight === 500;
    return undefined;
  };

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
                    : markPressed(control);
          /* Crop image and the two list buttons: the button and its arrow are two controls
             (SPEC-2 4.2; docs/FOCUS.md rank 9) */
          if (
            (control.op === 'crop' ||
              listButtonOf(control) !== null ||
              control.control === 'toolbar.insertLine') &&
            control.arrow !== undefined
          ) {
            const arrowItem = itemById(control.arrow);
            return (
              <span key={key} className="ts-tb-slot ts-tb-split">
                {divider}
                <ToolbarButton
                  control={control}
                  onClick={(anchor) => onControl(control, anchor)}
                  className="ts-tb-split-main"
                />
                <button
                  type="button"
                  className="pt-ib pt-icon ts-tb ts-tb-split-arrow"
                  aria-label={arrowItem.label}
                  aria-haspopup="menu"
                  aria-expanded={plate?.plate.control.control === `${control.control}.arrow`}
                  data-control={`${control.control}.arrow`}
                  data-menu-item={arrowItem.id}
                  onClick={(event) =>
                    openPlate(
                      { ...control, control: `${control.control}.arrow`, op: undefined },
                      event.currentTarget,
                    )
                  }
                  {...tipProps({
                    name: arrowItem.label,
                    doc:
                      arrowItem.doc ??
                      (control.op === 'crop'
                        ? 'Shows the picture inside a shape'
                        : control.control === 'toolbar.insertLine'
                          ? 'Line or arrow'
                          : 'Another style'),
                  })}
                >
                  <Icon name="chevron-down" />
                </button>
              </span>
            );
          }
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
      {/* the tail's end (SPEC-3 4.4, 6.3, 13.2): the pointer toggle for editors, the View only
          button for a viewer on the editor route; each present only when its predicate says so */}
      {presentControls(TOOLBAR_TAIL_END, menuContext).map((control) => {
        if (control.control === 'toolbar.pointer') {
          const on = input.presence?.pointerMine ?? shell.settings.pointerMine === true;
          return (
            <span key={control.control} className="ts-tb-slot ts-tb-end" data-control="toolbar.end">
              <ToolbarButton
                control={{
                  ...control,
                  label: on ? PRESENCE.showingMyPointer : PRESENCE.showMyPointer,
                }}
                pressed={on}
                onClick={() => {
                  if (input.presence?.onPointer) input.presence.onPointer(!on);
                  else shell.setSetting('pointerMine', !on);
                }}
              />
            </span>
          );
        }
        return (
          <span key={control.control} className="ts-tb-slot ts-tb-end" data-control="toolbar.end">
            <ToolbarButton
              control={control}
              onClick={() => shell.openDialog({ id: 'requestAccess', role: 'editor' })}
            />
          </span>
        );
      })}
      {/* Hide the menus is parked with View > Full screen (docs/FOCUS.md 3.2, 3.3) */}
      {isPresent(hide, menuContext) ? (
        <ToolbarButton control={hideControl} onClick={() => shell.setCompact(true)} />
      ) : null}
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
            renderDynamic={shell.renderDynamicSubmenu}
            id={`ts-menu-${plate.plate.control.control}`}
          />
        ) : plate.plate.kind === 'swatches' ? (
          <ColorPlate
            anchor={plate.anchor}
            label={plate.plate.control.label}
            current={colorTarget(plate.plate.op)?.current}
            tones={colorTarget(plate.plate.op)?.tones === true}
            control={plate.plate.control.control}
            onPick={(
              (op: TailOp) => (value: Color | 'none') =>
                pickColor(op, value)
            )(plate.plate.op)}
            onClose={() => setPlate(null)}
          />
        ) : plate.plate.kind === 'picker' || plate.plate.kind === 'dynamic' ? (
          <AnchoredPlate
            anchor={plate.anchor}
            label={plate.plate.control.label}
            control={plate.plate.control.control}
            onClose={() => setPlate(null)}
          >
            {plate.plate.kind === 'picker'
              ? plate.plate.node
              : shell.renderDynamicSubmenu(plate.plate.item, { viaKeyboard: true })}
          </AnchoredPlate>
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

/** A picker plate anchored under a toolbar button: a dialog that closes on Esc and a click outside. */
function AnchoredPlate({
  anchor,
  label,
  control,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  control: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const at = anchoredAt(anchor, 360, 320);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) || anchor.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);
  return (
    <div
      ref={root}
      className="ts-plate-anchored ts-chrome"
      role="dialog"
      aria-label={label}
      style={{ left: at.left, top: at.top }}
      data-control={`${control}.plate`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          anchor.focus();
        }
      }}
    >
      {children}
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
