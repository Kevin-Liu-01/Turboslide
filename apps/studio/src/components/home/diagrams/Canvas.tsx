import { CANVAS } from '../copy';
import { Marker } from './Marker';

/** The handles of the moved picture: its corners and the middles of its sides, in its own frame. */
const HANDLES: ReadonlyArray<readonly [number, number]> = [
  [340, 100],
  [430, 100],
  [520, 100],
  [340, 160],
  [520, 160],
  [340, 220],
  [430, 220],
  [520, 220],
];

/**
 * The canvas (docs/POLISH.md 3.2 item 2; docs/NEXT.md 4.1.3 item 9): a slide frame with one
 * picture moved from its first place, drawn as a hairline, to a new place, larger and turned by
 * 8 degrees, with its eight handles and the rotation handle in ink, and the drag drawn as one
 * 1 px line that ends in an 11 unit square marker (no arrowheads, slide 33). The selection is ink
 * on paper here: the accent stays off lines and fills (DECK-GRAMMAR 29). Labels are 20 units in
 * `--pt-ink-2` with at least 12 units of clearance from every line. Inline SVG in the grammar,
 * see Present.tsx.
 */
export function CanvasDiagram() {
  const d = CANVAS.diagram;
  return (
    <svg
      className="ts-product-diagram"
      viewBox="0 0 612 400"
      width={612}
      height={400}
      role="img"
      aria-label={d.label}
      data-diagram="canvas"
    >
      {/* the slide */}
      <rect className="dg-edge" x={20} y={20} width={572} height={322} />
      <text className="dg-label" x={20} y={376}>
        {d.slide}
      </text>
      {/* the picture's first place */}
      <rect className="dg-hair" x={56} y={150} width={150} height={100} />
      <text className="dg-label" x={56} y={278}>
        {d.before}
      </text>
      {/* the drag */}
      <line className="dg-edge" x1={206} y1={200} x2={318} y2={176} />
      <Marker x={318} y={176} />
      <text className="dg-label" x={236} y={164}>
        {d.move}
      </text>
      {/* the picture at its new place, turned, with its handles and the rotation handle */}
      <g transform="rotate(-8 430 160)">
        <rect className="dg-plate dg-ink" x={340} y={100} width={180} height={120} />
        <line className="dg-ink" x1={430} y1={100} x2={430} y2={66} />
        <rect className="dg-handle" x={424.5} y={58.5} width={11} height={11} />
        {HANDLES.map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            className="dg-handle"
            x={x - 4.5}
            y={y - 4.5}
            width={9}
            height={9}
          />
        ))}
      </g>
      <text className="dg-label" x={440} y={52}>
        {d.rotate}
      </text>
      <text className="dg-label" x={490} y={256}>
        {d.resize}
      </text>
    </svg>
  );
}
