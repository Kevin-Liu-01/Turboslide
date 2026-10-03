import { EXPORT } from '../copy';
import { Marker } from './Marker';

/**
 * Export (docs/archive/rounds/POLISH.md 3.2 item 5, 3.3 item 2; docs/NEXT.md 4.1.3 item 9): one slide frame with
 * a 1 px line that forks to two file tiles labelled pitch.pdf and pitch.pptx, each fork ending in
 * an 11 unit square marker at its tile (no arrowheads, slide 33), each tile a square with a plate
 * in it and a 1 px frame. Labels are 20 units with at least 12 units of clearance. Inline SVG in
 * the grammar, see Present.tsx.
 */
export function ExportDiagram() {
  const d = EXPORT.diagram;
  return (
    <svg
      className="ts-product-diagram"
      viewBox="0 0 612 300"
      width={612}
      height={300}
      role="img"
      aria-label={d.label}
      data-diagram="export"
    >
      {/* the slide: a title line, a body line and a picture */}
      <rect className="dg-edge" x={20} y={80} width={240} height={135} />
      <line className="dg-hair" x1={44} y1={108} x2={200} y2={108} />
      <line className="dg-hair" x1={44} y1={124} x2={150} y2={124} />
      <rect className="dg-plate" x={44} y={144} width={192} height={52} />
      <text className="dg-label" x={20} y={244}>
        {d.slide}
      </text>
      {/* the line forks to the two files */}
      <line className="dg-edge" x1={260} y1={148} x2={340} y2={148} />
      <line className="dg-edge" x1={340} y1={68} x2={340} y2={208} />
      <line className="dg-edge" x1={340} y1={68} x2={380} y2={68} />
      <Marker x={380} y={68} />
      <line className="dg-edge" x1={340} y1={208} x2={380} y2={208} />
      <Marker x={380} y={208} />
      {/* the two file tiles */}
      <rect className="dg-edge" x={380} y={20} width={96} height={96} />
      <rect className="dg-plate" x={392} y={68} width={48} height={36} />
      <text className="dg-label" x={380} y={145}>
        {d.pdf}
      </text>
      <rect className="dg-edge" x={380} y={160} width={96} height={96} />
      <rect className="dg-plate" x={392} y={208} width={48} height={36} />
      <text className="dg-label" x={380} y={285}>
        {d.pptx}
      </text>
    </svg>
  );
}
