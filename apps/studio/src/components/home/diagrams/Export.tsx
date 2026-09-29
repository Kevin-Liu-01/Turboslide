import { EXPORT } from '../copy';

/**
 * Export (docs/POLISH.md 3.2 item 5, 3.3 item 2): one slide frame with an arrow that forks to
 * two file tiles labelled pitch.pdf and pitch.pptx, each tile in the mark's proportions (the
 * square and the plate cut from it at the mark's 2, 8, 8 by 6 of 16) with a 1 px frame. Inline
 * SVG in the grammar, see Present.tsx.
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
      {/* the arrow forks to the two files */}
      <line className="dg-edge" x1={260} y1={148} x2={340} y2={148} />
      <line className="dg-edge" x1={340} y1={68} x2={340} y2={208} />
      <line className="dg-edge" x1={340} y1={68} x2={380} y2={68} />
      <polyline className="dg-edge" points="374,63 380,68 374,73" />
      <line className="dg-edge" x1={340} y1={208} x2={380} y2={208} />
      <polyline className="dg-edge" points="374,203 380,208 374,213" />
      {/* the two file tiles in the mark's proportions */}
      <rect className="dg-edge" x={380} y={20} width={96} height={96} />
      <rect className="dg-plate" x={392} y={68} width={48} height={36} />
      <text className="dg-label" x={380} y={140}>
        {d.pdf}
      </text>
      <rect className="dg-edge" x={380} y={160} width={96} height={96} />
      <rect className="dg-plate" x={392} y={208} width={48} height={36} />
      <text className="dg-label" x={380} y={280}>
        {d.pptx}
      </text>
    </svg>
  );
}
