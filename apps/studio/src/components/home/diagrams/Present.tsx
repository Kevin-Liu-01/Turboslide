import { PRESENT } from '../copy';

/**
 * Present and share (docs/POLISH.md 3.2 item 4, 3.3 item 2): three frames on a 20 px grid, the
 * editor window with its filmstrip and stage, the presenter window with the timer, the next
 * slide and the notes as labelled boxes, and a phone with the show, joined by hairlines labelled
 * with the S key and the present link. Inline SVG in the grammar: 1 px strokes in `--pt-hair`
 * and `--pt-edge`, fills `--pt-plate` alone, 13 px Inter labels in `--pt-ink-2`, both
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
      <text className="dg-label" x={20} y={384}>
        {d.editor}
      </text>
      {/* the presenter window: the timer, the next slide and the notes */}
      <rect className="dg-edge" x={340} y={20} width={252} height={180} />
      <line className="dg-hair" x1={340} y1={40} x2={592} y2={40} />
      <rect className="dg-hair" x={352} y={52} width={80} height={36} />
      <text className="dg-label" x={392} y={74} textAnchor="middle">
        {d.timer}
      </text>
      <rect className="dg-plate" x={444} y={52} width={136} height={76} />
      <text className="dg-label" x={512} y={94} textAnchor="middle">
        {d.next}
      </text>
      <rect className="dg-hair" x={352} y={140} width={228} height={48} />
      <text className="dg-label" x={466} y={168} textAnchor="middle">
        {d.notes}
      </text>
      <text className="dg-label" x={340} y={224}>
        {d.presenter}
      </text>
      {/* the phone with the show */}
      <rect className="dg-edge" x={520} y={232} width={72} height={140} />
      <rect className="dg-hair" x={528} y={244} width={56} height={116} />
      <rect className="dg-plate" x={532} y={288} width={48} height={27} />
      <text className="dg-label" x={520} y={392}>
        {d.show}
      </text>
      {/* the S key: the editor to the presenter window */}
      <polyline className="dg-edge" points="280,250 310,250 310,110 340,110" />
      <polyline className="dg-edge" points="334,105 340,110 334,115" />
      <text className="dg-label" x={318} y={184}>
        {d.key}
      </text>
      {/* the present link: the editor to the phone */}
      <line className="dg-edge" x1={280} y1={320} x2={520} y2={320} />
      <polyline className="dg-edge" points="514,315 520,320 514,325" />
      <text className="dg-label" x={400} y={310} textAnchor="middle">
        {d.link}
      </text>
    </svg>
  );
}
