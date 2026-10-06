import { Fragment } from 'react';

import { FEATURES } from './copy';
import { FACTS_DATA } from './facts-data';
import { BandHead, HomeSection } from './HomeSection';

/**
 * Features and where to find them (docs/DESIGN.md 8.13; docs/LANDING.md 2.14): ten ruled rows in
 * two columns of five at 1,024 px and over, one column under it. Each row is the editor's glyph for
 * the feature in a well, its name, its place in the editor as crumbs and its shortcut as key chips
 * (`.pt-kbd`); the glyph, the path and the keys are the editor's own, read from
 * `packages/chrome/src/menus/model.ts` and `keys.ts` at build (`facts-data.ts` `features`), so the
 * table cannot drift from the editor. The server renders the Mac keys; the route rewrites them to
 * the other platforms' keys after hydration (`data-shortcut-other`). No figure here; nothing moves.
 */
export function HomeFeatures() {
  return (
    <HomeSection id="features">
      <BandHead id="features" heading={FEATURES.h2} span={12} />
      <ul className="ts-features" data-features>
        {FEATURES.rows.map((row) => {
          const facts = FACTS_DATA.features.find((f) => f.id === row.id);
          if (facts === undefined) return null;
          return (
            <li key={row.id} className="ts-feature" data-feature={row.id}>
              <span className="ts-feature-well">
                <i className="ts-icon" data-icon={facts.icon} />
              </span>
              <span className="ts-feature-key">{row.key}</span>
              <span className="ts-feature-where ts-crumbs">
                {facts.path.map((step, i) => (
                  <Fragment key={step}>
                    {i > 0 ? <i className="ts-icon" data-icon="next" /> : null}
                    <span>{step}</span>
                  </Fragment>
                ))}
              </span>
              {facts.macKeys.length > 0 ? (
                <span className="ts-feature-keys" data-shortcut-other={facts.otherKeys.join('+')}>
                  {facts.macKeys.map((key, i) => (
                    <kbd key={`${key}${i}`} className="pt-kbd">
                      {key}
                    </kbd>
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </HomeSection>
  );
}
