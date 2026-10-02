/**
 * The end of a flow line in the diagrams of /home (docs/NEXT.md 4.1.3 item 9; Prototemplate
 * DECK-GRAMMAR "Diagrams"): a filled 11 unit square in ink centred on the line's end, which the
 * deck uses on its scales in place of an arrowhead (slide 33: arrowheads are never drawn).
 */
export function Marker({ x, y }: { x: number; y: number }) {
  return <rect className="dg-marker" x={x - 5.5} y={y - 5.5} width={11} height={11} />;
}
