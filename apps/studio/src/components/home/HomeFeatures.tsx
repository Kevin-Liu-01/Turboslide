import { FEATURES } from './copy';
import { FACTS_DATA } from './facts-data';
import { BandHead, HomeSection } from './HomeSection';
import { SectionIcon } from './SectionIcon';

/**
 * Features and where to find them (docs/LANDING.md 2.14, Kevin's picks "A: Turboslide today" and
 * "B: Features and where to find them, ten rows with menu paths"): one table of ten ruled rows of
 * 56 px, the page's densest evidence and its last band before the close. Each row's key cell holds
 * its Heroicon 20 solid and the feature's name; the where cell and the shortcut are the editor's
 * own, read from `packages/chrome/src/menus/model.ts` and `keys.ts` at build (`facts-data.ts`
 * `features`). The server renders the Mac form of each shortcut; the route rewrites it to the
 * other platforms' form after hydration (`data-shortcut-other`). Every figure the first pass's
 * table carried is said once elsewhere on the page, so this table carries none. Nothing moves.
 */
export function HomeFeatures() {
  return (
    <HomeSection id="features">
      <BandHead id="features" heading={FEATURES.h2} span={12} />
      <table className="ts-features" data-features>
        <thead>
          <tr>
            <th scope="col">{FEATURES.heads.feature}</th>
            <th scope="col">{FEATURES.heads.where}</th>
            <th scope="col">{FEATURES.heads.shortcut}</th>
          </tr>
        </thead>
        <tbody>
          {FEATURES.rows.map((row) => {
            const facts =
              FACTS_DATA.features.find((f) => f.id === row.id) ??
              ({ id: row.id, where: '', mac: '', other: '' } as const);
            return (
              <tr key={row.id} data-feature={row.id}>
                <th scope="row" className="ts-feature-key">
                  <SectionIcon name={row.icon} />
                  <span>{row.key}</span>
                </th>
                <td className="ts-feature-where">{facts.where}</td>
                <td className="ts-feature-shortcut">
                  {facts.mac !== '' ? (
                    <kbd
                      className="pt-kbd"
                      data-shortcut-mac={facts.mac}
                      data-shortcut-other={facts.other}
                    >
                      {facts.mac}
                    </kbd>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </HomeSection>
  );
}
