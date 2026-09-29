import { CANVAS } from './copy';
import { HomeSection } from './HomeSection';
import { CROP_SIZES, Shot } from './Shot';

/**
 * The canvas (docs/POLISH.md 3.2 item 2): Kevin's rule that anything moves, beside a 1:1 crop of
 * the stage with one picture selected, its ring, its eight handles and the rotation readout,
 * from the product's own render.
 */
export function HomeCanvas() {
  return (
    <HomeSection id={CANVAS.id} icon={CANVAS.icon} heading={CANVAS.heading} lead={CANVAS.lead}>
      <figure className="ts-product-shot">
        <Shot kind={CANVAS.picture.shot} alt={CANVAS.picture.alt} sizes={CROP_SIZES} />
      </figure>
    </HomeSection>
  );
}
