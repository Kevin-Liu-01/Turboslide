import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRef } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import type { DiagramKind, DiagramStyle } from '@turboslide/schema/diagrams';
import {
  DIAGRAM_KINDS,
  DIAGRAM_KIND_LABELS,
  DIAGRAM_STYLES,
  DIAGRAM_STYLE_LABELS,
  DIAGRAM_TEMPLATES,
} from '@turboslide/schema/diagrams';
import type { Position } from '@turboslide/schema/position';

import { cn } from '../lib/cn';
import { tipProps } from '../Tooltip';

import './DiagramPicker.css';

/**
 * The tiles of the Diagram panel (gslides-parity SPEC-2 section 5 "Diagram panel", 2.8.3; R05 A8):
 * the six types as a radio grid of tiles, each drawn from `diagrams.ts` at its smallest count so
 * the picture is the template itself (never Google's artwork), and the three styles as a second
 * radio row drawn the same way. Both move with the arrows, Home and End, pick on Enter or Space,
 * and carry `menuitemradio` names for the window API and the audit (`insert.diagram.type.<kind>`,
 * `insert.diagram.style.<style>`). `DiagramPreview` draws any block list into a 16 by 9 tile,
 * which the panel also uses for its live preview.
 */
export type DiagramTypePickerProps = {
  value: DiagramKind;
  onChange: (kind: DiagramKind) => void;
  control?: string;
  disabled?: boolean;
};

export type DiagramStylePickerProps = {
  kind: DiagramKind;
  count: number;
  value: DiagramStyle;
  onChange: (style: DiagramStyle) => void;
  control?: string;
  disabled?: boolean;
};

/** The sheet box the tiles draw a template into: a 16 by 9 frame with a margin. */
const TILE_BOX: Position = { x: 20, y: 20, w: 280, h: 140 };
const TILE_VIEW = { w: 320, h: 180 };

const FILL_PAINT: Readonly<Record<string, string>> = {
  ink: 'var(--pt-ink)',
  paper: 'var(--pt-paper)',
  'ink-2': 'var(--pt-ink-2)',
  titanium: 'var(--pt-titanium)',
  hair: 'var(--pt-hair)',
  'hair-soft': 'var(--pt-hair-soft)',
  plate: 'var(--pt-plate)',
  edge: 'var(--pt-edge)',
};

function paint(color: string | undefined, fallback: string): string {
  if (color === undefined) return fallback;
  return FILL_PAINT[color] ?? (color.startsWith('#') ? color : fallback);
}

/** The endpoints of a line block's box along its orientation. */
function lineEnds(
  pos: Position,
  orientation: string | undefined,
): [number, number, number, number] {
  switch (orientation) {
    case 'vertical':
      return [pos.x + pos.w / 2, pos.y, pos.x + pos.w / 2, pos.y + pos.h];
    case 'diagonal-down':
      return [pos.x, pos.y, pos.x + pos.w, pos.y + pos.h];
    case 'diagonal-up':
      return [pos.x, pos.y + pos.h, pos.x + pos.w, pos.y];
    case 'horizontal':
    default:
      return [pos.x, pos.y + pos.h / 2, pos.x + pos.w, pos.y + pos.h / 2];
  }
}

/**
 * A block list as a small SVG: rounded rectangles and ellipses with their fill and stroke, lines
 * with an arrow head where the block carries one, no text (a tile is a shape, not a label).
 */
export function DiagramPreview({
  blocks,
  box,
  className,
  label,
}: {
  blocks: ReadonlyArray<Block>;
  /** the sheet box the blocks were made for; the view fits it */
  box: Position;
  className?: string;
  label?: string;
}) {
  const view = `${box.x - box.w * 0.05} ${box.y - box.h * 0.1} ${box.w * 1.1} ${box.h * 1.2}`;
  return (
    <svg
      className={cn('ts-diagram-preview', className)}
      viewBox={view}
      preserveAspectRatio="xMidYMid meet"
      role={label === undefined ? 'presentation' : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {blocks.map((block) => {
        const pos = block.pos;
        if (pos === undefined || block.type !== 'shape') return null;
        const stroke = paint(block.stroke, 'var(--pt-ink)');
        const width = Math.max(1.5, ((block.width ?? 1.5) * box.w) / 480);
        if (block.shape === 'line') {
          const [x1, y1, x2, y2] = lineEnds(pos, block.orientation);
          const head = block.lineEnd === 'fillArrow' || block.lineStart === 'fillArrow';
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const size = Math.max(6, box.w / 60);
          const hx = block.lineStart === 'fillArrow' ? x1 : x2;
          const hy = block.lineStart === 'fillArrow' ? y1 : y2;
          const dir = block.lineStart === 'fillArrow' ? angle + Math.PI : angle;
          const tip = `${hx},${hy}`;
          const left = `${hx - size * Math.cos(dir - Math.PI / 6)},${hy - size * Math.sin(dir - Math.PI / 6)}`;
          const right = `${hx - size * Math.cos(dir + Math.PI / 6)},${hy - size * Math.sin(dir + Math.PI / 6)}`;
          return (
            <g key={block.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} />
              {head ? <polygon points={`${tip} ${left} ${right}`} fill={stroke} /> : null}
            </g>
          );
        }
        const fill = paint(block.fill, 'none');
        if (block.shape === 'ellipse') {
          return (
            <ellipse
              key={block.id}
              cx={pos.x + pos.w / 2}
              cy={pos.y + pos.h / 2}
              rx={pos.w / 2}
              ry={pos.h / 2}
              fill={fill}
              stroke={stroke}
              strokeWidth={width}
            />
          );
        }
        return (
          <rect
            key={block.id}
            x={pos.x}
            y={pos.y}
            width={pos.w}
            height={pos.h}
            rx={block.shape === 'roundRect' ? Math.min(pos.w, pos.h) * 0.12 : 0}
            fill={fill}
            stroke={stroke}
            strokeWidth={width}
          />
        );
      })}
    </svg>
  );
}

function useRadioKeys<T extends string>(
  values: ReadonlyArray<T>,
  value: T,
  onChange: (next: T) => void,
  disabled: boolean,
) {
  const root = useRef<HTMLDivElement>(null);
  const focusValue = (next: T) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-value="${next}"]`);
    el?.focus();
  };
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const index = values.indexOf(value);
    let next: T | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = values[(index + 1) % values.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = values[(index - 1 + values.length) % values.length];
        break;
      case 'Home':
        next = values[0];
        break;
      case 'End':
        next = values[values.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next === undefined) return;
    onChange(next);
    focusValue(next);
  };
  return { root, onKey };
}

/** The six type tiles as one radio group; the picture is the template at its smallest count in the outline style. */
export function DiagramTypePicker({
  value,
  onChange,
  control = 'insert.diagram.type',
  disabled = false,
}: DiagramTypePickerProps) {
  const { root, onKey } = useRadioKeys(DIAGRAM_KINDS, value, onChange, disabled);
  return (
    <div
      ref={root}
      className="ts-diagram-types"
      role="radiogroup"
      aria-label="Diagram type"
      data-control={control}
      onKeyDown={onKey}
    >
      {DIAGRAM_KINDS.map((kind) => {
        const template = DIAGRAM_TEMPLATES[kind];
        const on = kind === value;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={template.label}
            tabIndex={on ? 0 : -1}
            className={cn('ts-diagram-tile', on && 'is-current')}
            data-control={`${control}.${kind}`}
            data-value={kind}
            disabled={disabled}
            onClick={() => onChange(kind)}
            {...tipProps({
              name: template.label,
              doc: `${template.counts.noun} ${template.counts.min} to ${template.counts.max}`,
            })}
          >
            <DiagramPreview
              blocks={template.make(template.counts.min, 'outline', TILE_BOX, 'tile')}
              box={{ ...TILE_BOX, x: 0, y: 0, w: TILE_VIEW.w, h: TILE_VIEW.h }}
            />
            <span className="ts-diagram-tile-label">{DIAGRAM_KIND_LABELS[kind]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The three style tiles for the chosen type at the chosen count. */
export function DiagramStylePicker({
  kind,
  count,
  value,
  onChange,
  control = 'insert.diagram.style',
  disabled = false,
}: DiagramStylePickerProps) {
  const { root, onKey } = useRadioKeys(DIAGRAM_STYLES, value, onChange, disabled);
  const template = DIAGRAM_TEMPLATES[kind];
  return (
    <div
      ref={root}
      className="ts-diagram-styles"
      role="radiogroup"
      aria-label="Diagram style"
      data-control={control}
      onKeyDown={onKey}
    >
      {DIAGRAM_STYLES.map((style) => {
        const on = style === value;
        return (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={DIAGRAM_STYLE_LABELS[style]}
            tabIndex={on ? 0 : -1}
            className={cn('ts-diagram-tile is-style', on && 'is-current')}
            data-control={`${control}.${style}`}
            data-value={style}
            disabled={disabled}
            onClick={() => onChange(style)}
            {...tipProps({
              name: DIAGRAM_STYLE_LABELS[style],
              doc: `The ${template.label.toLowerCase()} in the ${DIAGRAM_STYLE_LABELS[style].toLowerCase()} style`,
            })}
          >
            <DiagramPreview
              blocks={template.make(count, style, TILE_BOX, 'tile')}
              box={{ x: 0, y: 0, w: TILE_VIEW.w, h: TILE_VIEW.h }}
            />
            <span className="ts-diagram-tile-label">{DIAGRAM_STYLE_LABELS[style]}</span>
          </button>
        );
      })}
    </div>
  );
}

export { TILE_BOX as DIAGRAM_TILE_BOX, TILE_VIEW as DIAGRAM_TILE_VIEW };
