import { BoxedMark } from './BoxedMark';
import { DOCS_FOOTER, FOOTER } from './copy';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';

/**
 * The footer of /home (docs/SITE.md A.1): the lockup with the T in a box at 32 px, three columns
 * of links under capital labels with a solid icon each (Presentations, Documentation, Source),
 * then the two sentences on a soft rule. The lockup links back to the top of the page.
 */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-wrap">
        <div className="site-foot-top">
          <a className="site-lockup site-lockup-lg" href="#top" aria-label={FOOTER.name}>
            <BoxedMark size={32} />
            <span>Turboslide</span>
          </a>
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
          <p>{FOOTER.made}</p>
          <p>{FOOTER.licence}</p>
        </div>
      </div>
    </footer>
  );
}

/**
 * The docs' footer (docs/SITE.md section 6): one compact row under every docs page, the T in a
 * box linking to /home, the sentence that names the maker, and the repository's three links.
 */
export function DocsFooter() {
  return (
    <footer className="site-foot is-compact">
      <div className="site-wrap site-foot-row t-small">
        <SiteLink
          href="/home"
          control="docs.foot.lockup"
          className="site-lockup"
          aria-label={DOCS_FOOTER.name}
        >
          <BoxedMark size={24} />
        </SiteLink>
        <p>{DOCS_FOOTER.made}</p>
        <nav aria-label={DOCS_FOOTER.nav}>
          {DOCS_FOOTER.links.map((link) => (
            <SiteLink
              key={link.href}
              href={link.href}
              external
              control={`docs.foot.${link.label.toLowerCase().replace(/\W+/g, '-')}`}
            >
              {link.label}
            </SiteLink>
          ))}
        </nav>
      </div>
    </footer>
  );
}
