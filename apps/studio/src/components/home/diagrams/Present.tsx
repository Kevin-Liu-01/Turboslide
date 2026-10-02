import { PRESENT } from '../copy';
import { Marker } from './Marker';

/**
 * Present and share (docs/POLISH.md 3.2 item 4, 3.3 item 2; docs/NEXT.md 4.1.3 item 9): three
 * frames on a 20 unit grid, the editor window with its filmstrip and stage, the presenter window
 * with the timer, the next slide and the notes as labelled boxes, and a phone with the show,
 * joined by 1 px lines labelled with the S key and the present link, each ending in an 11 unit
 * square marker where it meets its window (no arrowheads, slide 33). Inline SVG in the grammar:
 * 1 px strokes in `--pt-hair` and `--pt-edge`, fills `--pt-plate` and the ink markers alone,
 * 20 unit Inter labels in `--pt-ink-2` with at least 12 units of clearance from every line, both
 * appearances from the tokens (`home.css` `.ts-product-diagram`), no animation, `role="img"` with
 * one sentence.
 */
export function PresentDiagram() {
  const d = PRESENT.diagram;
  return (
    <svg
      className="ts-product-diagram"
      viewBox="0 0 612 400"
      width={612}
      height={400}
      role="img"
      aria-label={d.label}
      data-diagram="present"
    >
      {/* the editor window: a title rule, the filmstrip and the stage */}
      <rect className="dg-edge" x={20} y={180} width={260} height={180} />
      <line className="dg-hair" x1={20} y1={200} x2={280} y2={200} />
      <rect className="dg-hair" x={32} y={212} width={44} height={26} />
      <rect className="dg-hair" x={32} y={248} width={44} height={26} />
      <rect className="dg-hair" x={32} y={284} width={44} height={26} />
      <rect className="dg-plate" x={96} y={212} width={168} height={96} />
      <text className="dg-label" x={20} y={389}>
        {d.editor}
      </text>
      {/* the presenter window: the timer, the next slide and the notes */}
      <rect className="dg-edge" x={340} y={20} width={252} height={180} />
      <line className="dg-hair" x1={340} y1={40} x2={592} y2={40} />
      <rect className="dg-hair" x={352} y={52} width={80} height={48} />
      <text className="dg-label" x={392} y={83} textAnchor="middle">
        {d.timer}
      </text>
      <rect className="dg-plate" x={444} y={52} width={136} height={76} />
      <text className="dg-label" x={512} y={97} textAnchor="middle">
        {d.next}
      </text>
      <rect className="dg-hair" x={352} y={140} width={228} height={48} />
      <text className="dg-label" x={466} y={171} textAnchor="middle">
        {d.notes}
      </text>
      <text className="dg-label" x={340} y={229}>
        {d.presenter}
      </text>
      {/* the phone with the show */}
      <rect className="dg-edge" x={520} y={252} width={72} height={120} />
      <rect className="dg-hair" x={528} y={264} width={56} height={96} />
      <rect className="dg-plate" x={532} y={298} width={48} height={27} />
      <text className="dg-label" x={520} y={396}>
        {d.show}
      </text>
      {/* the S key: the editor to the presenter window */}
      <polyline className="dg-edge" points="280,250 310,250 310,110 340,110" />
      <Marker x={340} y={110} />
      <text className="dg-label" x={322} y={170}>
        {d.key}
      </text>
      {/* the present link: the editor to the phone */}
      <line className="dg-edge" x1={280} y1={320} x2={520} y2={320} />
      <Marker x={520} y={320} />
      <text className="dg-label" x={400} y={302} textAnchor="middle">
        {d.link}
      </text>
    </svg>
  );
}
