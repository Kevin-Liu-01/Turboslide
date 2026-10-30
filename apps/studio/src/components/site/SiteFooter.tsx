import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';
import { applyTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { BUILD_COMMIT } from './build';
import { FOOTER } from './copy';
import { SiteField } from './SiteField';
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
 * a ton better footer using the animated turboslide logo"; full bleed since 2026-10-30, and the
 * product's vector mark in place of the pixel rows: "i like the unpixellated version"). The
 * lockup, the mark with the word, beside four columns of links whose headings
 * (Product, Agents, Docs, Project) are read by assistive technology and not drawn; the maker, the
 * build's commit and the appearance switch; then the name across the window as a field of the
 * lighthouse slide's source (SiteField.tsx `word`), the way the hero draws the slide. On /home
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
              <TurboslideMark size={32} aria-hidden="true" />
              <span>{FOOTER.word}</span>
            </SiteLink>
          </div>
          <nav className="site-foot-cols t-small" aria-label={FOOTER.nav}>
            {FOOTER.columns.map((column) => (
              <div key={column.id}>
                <h2 className="site-sr">{column.title}</h2>
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
      <div className="site-foot-word">
        <SiteField kind="word" />
      </div>
    </footer>
  );
}
