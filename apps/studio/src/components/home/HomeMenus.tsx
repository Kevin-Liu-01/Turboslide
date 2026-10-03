import { MENUS } from './copy';
import { HomeSection } from './HomeSection';
import { CROP_SIZES, Shot } from './Shot';

/**
 * The menus (docs/archive/rounds/POLISH.md 3.2 item 3): the seller already knows this editor, beside a 1:1 crop
 * of the title row and the menu bar with the Insert menu open, from the product's own render,
 * under 480 px tall.
 */
export function HomeMenus() {
  return (
    <HomeSection id={MENUS.id} heading={MENUS.heading} lead={MENUS.lead}>
      <figure className="ts-product-shot">
        <Shot kind={MENUS.picture.shot} alt={MENUS.picture.alt} sizes={CROP_SIZES} />
      </figure>
    </HomeSection>
  );
}
