import { LICENCE } from './copy';
import { HomeLink } from './HomeLink';
import { HomeSection } from './HomeSection';

/**
 * Licence and hosting (docs/POLISH.md 3.2 item 7): the buyer's questions about cost and control,
 * one heading, one lead and the GitHub button. No picture, so no picture box.
 */
export function HomeLicence() {
  return (
    <HomeSection
      id={LICENCE.id}
      icon={LICENCE.icon}
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
