import { PARTS } from './copy';
import { HOME_FACTS } from './facts';
import { HomeLink } from './HomeLink';
import { BandHead, HomeSection } from './HomeSection';
import { SectionIcon } from './SectionIcon';

/**
 * Turboslide today (docs/LANDING.md 2.9, band 7): the parts list, the page's densest evidence,
 * after the hatch strip where the page turns from demonstrations to evidence. Eight ruled rows of
 * 64 px: the key (a Heroicon 20 solid at 16 px and the name), where to find it (a menu path, or
 * the surface) and the figure, every figure a function of `HomeFacts`. Nothing here moves
 * (OpenAI rule 6; LoveFrom rule 16). "GitHub" links to the repository in a new tab.
 */
export function HomeParts() {
  return (
    <>
      <div className="ts-hatch" aria-hidden="true" />
      <HomeSection id="parts">
        <BandHead id="parts" heading={PARTS.h2} span={12} />
        <dl className="ts-parts" data-parts>
          {PARTS.rows.map((row) => (
            <div key={row.id} className="ts-part" data-part={row.id}>
              <dt className="ts-part-key">
                <SectionIcon name={row.icon} />
                <span>{row.key}</span>
              </dt>
              <dd className="ts-part-where">
                {row.href !== undefined ? (
                  <HomeLink
                    href={row.href}
                    external
                    control={`home.parts.${row.id}`}
                    className="ts-inline-link"
                  >
                    {row.where}
                  </HomeLink>
                ) : (
                  row.where
                )}
              </dd>
              <dd className="ts-part-figure">{row.figure(HOME_FACTS)}</dd>
            </div>
          ))}
        </dl>
      </HomeSection>
    </>
  );
}
