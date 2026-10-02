import { AGENTS } from '../copy';
import type { HomeFacts } from '../facts';
import { Marker } from './Marker';

/**
 * Agents (docs/POLISH.md 3.2 item 6, 3.3 item 2; docs/NEXT.md 4.1.3 item 9): one table labelled
 * with the action count in its head, four 1 px lines in from the CLI, MCP, HTTP and the page, one
 * line out to a deck frame with a title line and a body line, each line ending in an 11 unit
 * square marker where it meets the table or the deck (no arrowheads, slide 33). The deck frame
 * draws no product mark: the identity never draws on the customer's slide (docs/brand.md 254).
 * Labels are 20 units with at least 12 units of clearance. Inline SVG in the grammar, see
 * Present.tsx; the count is a function of the facts (SPEC-4 0.25).
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
        const y = 108 + index * 48;
        return (
          <g key={label}>
            <text className="dg-label" x={20} y={y + 7}>
              {label}
            </text>
            <line className="dg-edge" x1={120} y1={y} x2={240} y2={y} />
            <Marker x={240} y={y} />
          </g>
        );
      })}
      {/* the action table */}
      <rect className="dg-edge" x={240} y={30} width={160} height={250} />
      <line className="dg-hair" x1={240} y1={84} x2={400} y2={84} />
      <text className="dg-label" x={320} y={64} textAnchor="middle">
        {d.table(facts)}
      </text>
      {[132, 180, 228].map((y) => (
        <line key={y} className="dg-hair" x1={240} y1={y} x2={400} y2={y} />
      ))}
      <line className="dg-hair" x1={300} y1={84} x2={300} y2={280} />
      {/* the deck out */}
      <line className="dg-edge" x1={400} y1={160} x2={460} y2={160} />
      <Marker x={460} y={160} />
      <rect className="dg-edge" x={460} y={120} width={132} height={74} />
      <line className="dg-hair" x1={474} y1={140} x2={560} y2={140} />
      <line className="dg-hair" x1={474} y1={154} x2={530} y2={154} />
      <text className="dg-label" x={460} y={222}>
        {d.deck}
      </text>
    </svg>
  );
}
