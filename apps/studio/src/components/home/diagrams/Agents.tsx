import { AGENTS } from '../copy';
import type { HomeFacts } from '../facts';

/** The mark's construction (docs/brand.md section 1): the square and the plate cut from it, 16 units. */
const MARK_PATH = 'M0 0h16v16H0z M2 8h8v6H2z';

/**
 * Agents (docs/POLISH.md 3.2 item 6, 3.3 item 2): one table labelled with the action count in
 * the centre, four arrows in from the CLI, MCP, HTTP and the page, one arrow out to a deck frame
 * carrying the mark in `currentColor`. Inline SVG in the grammar, see Present.tsx; the count is a
 * function of the facts (SPEC-4 0.25).
 */
export function AgentsDiagram({ facts }: { facts: HomeFacts }) {
  const d = AGENTS.diagram;
  return (
    <svg
      className="ts-product-diagram"
      viewBox="0 0 612 300"
      width={612}
      height={300}
      role="img"
      aria-label={d.label(facts)}
      data-diagram="agents"
    >
      {/* the four transports in */}
      {d.sources.map((label, index) => {
        const y = 80 + index * 56;
        return (
          <g key={label}>
            <text className="dg-label" x={20} y={y + 4}>
              {label}
            </text>
            <line className="dg-edge" x1={120} y1={y} x2={240} y2={y} />
            <polyline className="dg-edge" points={`234,${y - 5} 240,${y} 234,${y + 5}`} />
          </g>
        );
      })}
      {/* the action table */}
      <rect className="dg-edge" x={240} y={40} width={160} height={240} />
      <line className="dg-hair" x1={240} y1={80} x2={400} y2={80} />
      <text className="dg-label" x={320} y={64} textAnchor="middle">
        {d.table(facts)}
      </text>
      {[120, 160, 200, 240].map((y) => (
        <line key={y} className="dg-hair" x1={240} y1={y} x2={400} y2={y} />
      ))}
      <line className="dg-hair" x1={300} y1={80} x2={300} y2={280} />
      {/* the deck out */}
      <line className="dg-edge" x1={400} y1={160} x2={460} y2={160} />
      <polyline className="dg-edge" points="454,155 460,160 454,165" />
      <rect className="dg-edge" x={460} y={120} width={132} height={74} />
      <path className="dg-mark" transform="translate(472 132)" fillRule="evenodd" d={MARK_PATH} />
      <text className="dg-label" x={460} y={218}>
        {d.deck}
      </text>
    </svg>
  );
}
