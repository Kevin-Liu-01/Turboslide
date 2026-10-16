import { applyTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { AnimatedMark } from './AnimatedMark';
import { BUILD_COMMIT } from './build';
import { FOOTER } from './copy';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';

const THEMES: readonly Theme[] = ['light', 'dark'];

/**
 * The appearance switch: Light and Dark as two buttons in one 6 px group. The pressed one is
 * drawn from `html[data-theme]` (site.css), so the first paint is right before any script runs;
 * `aria-pressed` follows the same attribute once the page is hydrated (`useTheme`), and a press
 * goes through `applyTheme`, the way the bar's theme button and the D key do.
 */
function AppearanceSwitch() {
  const theme = useTheme();
  return (
    <div className="site-appear" role="group" aria-label={FOOTER.appearance.name}>
      {THEMES.map((value) => (
        <button
          key={value}
          type="button"
          className="site-appear-opt"
          data-value={value}
          data-control={`site.foot.appearance.${value}`}
          aria-pressed={theme === value}
          onClick={() => applyTheme(value)}
        >
          {FOOTER.appearance[value]}
        </button>
      ))}
    </div>
  );
}

/**
 * The footer of every site page and the docs (docs/SITE.md, the footer; Kevin, 2026-10-15: "make
 * a ton better footer using the animated turboslide logo"). On the 12 column grid: the lockup,
 * the animated T in a box at 80 px (48 px on a phone) with the word, and one sentence under it;
 * four columns of links under capital labels with a solid icon each (Product, Agents, Docs,
 * Project); then on a soft rule the maker, the build's commit and the appearance switch. On /home
 * the lockup goes back to the top (`top`); everywhere else it goes to /home.
 */
export function SiteFooter({ top = false }: { top?: boolean }) {
  return (
    <footer className="site-foot">
      <div className="site-wrap">
        <div className="site-foot-top">
          <div className="site-foot-brand">
            <SiteLink
              href={top ? '#top' : '/home'}
              control="site.foot.lockup"
              className="site-foot-lockup"
              aria-label={top ? FOOTER.top : FOOTER.home}
            >
              <AnimatedMark size={80} />
              <span>{FOOTER.word}</span>
            </SiteLink>
            <p className="site-foot-say t-small">{FOOTER.sentence}</p>
          </div>
          <nav className="site-foot-cols t-small" aria-label={FOOTER.nav}>
            {FOOTER.columns.map((column) => (
              <div key={column.id}>
                <h2 className="t-label site-label">
                  <SiteIcon name={column.icon} />
                  {column.title}
                </h2>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <SiteLink
                        href={link.href}
                        external={link.external}
                        control={`site.foot.${column.id}.${link.label.toLowerCase().replace(/\W+/g, '-')}`}
                      >
                        {link.label}
                      </SiteLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="site-foot-base t-small">
          <p className="site-foot-meta">
            <span>
              {FOOTER.made.before}{' '}
              <SiteLink href={FOOTER.made.href} external control="site.foot.maker">
                {FOOTER.made.name}
              </SiteLink>
            </span>
            {BUILD_COMMIT === null ? null : (
              <SiteLink
                href={FOOTER.build.href(BUILD_COMMIT)}
                external
                control="site.foot.build"
                aria-label={FOOTER.build.name(BUILD_COMMIT)}
              >
                {FOOTER.build.label} <span className="site-foot-sha">{BUILD_COMMIT}</span>
              </SiteLink>
            )}
          </p>
          <AppearanceSwitch />
        </div>
      </div>
    </footer>
  );
}
