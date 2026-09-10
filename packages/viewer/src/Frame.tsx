import { pad2 } from './model';

/**
 * The edge grid every slide sheet carries (SPEC 2.1; head:38-52): two rails
 * and two rules at 56px, four 11 by 11 registration crosses where they meet,
 * the wordmark bottom left and the counter bottom right inside the bottom
 * margin. The classes are the deck's (.frame, .rule, .cross, .wordmark,
 * .counter) and the CSS is the theme's sheet.css, so a rendered slide never
 * redraws them. The renderer emits the same markup from renderStage()
 * (SPEC 5.2); the React Frame exists so the counter follows the active slide
 * in the studio without a re-render of the slide's HTML. Thumbnail and page
 * clones pass wordmark={false} counter={false} to carry the grid alone.
 */
export type FrameProps = {
  /** the 28 by 18 mark at the bottom left, drawn from the sprite's #gt-mark */
  wordmark?: boolean;
  /** the `01 / 85` counter at the bottom right */
  counter?: boolean;
  index?: number;
  total?: number;
};

export function Frame({ wordmark = true, counter = true, index = 0, total = 0 }: FrameProps) {
  return (
    <>
      <div className="frame" aria-hidden="true">
        <div className="rule top" />
        <div className="rule bottom" />
        <span className="cross tl" />
        <span className="cross tr" />
        <span className="cross bl" />
        <span className="cross br" />
      </div>
      {wordmark ? (
        <div className="wordmark" aria-hidden="true">
          <svg width={28} height={18} fill="currentColor" aria-hidden="true">
            <use href="#gt-mark" />
          </svg>
        </div>
      ) : null}
      {counter ? (
        <div className="counter">{`${pad2(Math.max(0, index) + 1)} / ${pad2(total)}`}</div>
      ) : null}
    </>
  );
}
