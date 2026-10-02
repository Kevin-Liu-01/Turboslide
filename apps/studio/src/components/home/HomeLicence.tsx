import { LICENCE } from './copy';
import { HomeLink } from './HomeLink';
import { HomeSection } from './HomeSection';

/**
 * License and hosting (docs/POLISH.md 3.2 item 7): the buyer's questions about cost and control,
 * one heading, one lead and the GitHub button. No picture, so no picture box. The words read
 * "license" (American English, as the deck writes "color"; docs/NEXT.md 4.1.3 item 9) while the
 * file, the component and the ids keep `licence` (`home.licence.*`), which the rows and the
 * earlier rounds' links name.
 */
export function HomeLicence() {
  return (
    <HomeSection
      id={LICENCE.id}
      heading={LICENCE.heading}
      lead={LICENCE.lead}
      single
      after={
        <div className="ts-product-cta">
          <HomeLink
            href={LICENCE.button.href}
            external
            control={LICENCE.button.id}
            className="pt-ib"
          >
            {LICENCE.button.label}
          </HomeLink>
        </div>
      }
    />
  );
}
