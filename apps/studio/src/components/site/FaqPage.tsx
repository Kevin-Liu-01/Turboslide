import { SITE } from '@turboslide/theme/brand/site';

import { InlineCode } from './InlineCode';
import { JsonLd } from './JsonLd';
import { PageHead } from './PageHead';
import { FAQ_HEAD, PAGES, QUESTIONS } from './pages-copy';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';
import { faqData } from './structured-data';

/**
 * /faq (the pages step): the page's name and lead, then every question as one disclosure list of
 * native `<details>` (the summary is the button a keyboard and a screen reader reach; the answer
 * is in the page for search and find), each answer with the chapters that say more; the FAQPage
 * structured data carries the same questions and answers.
 */
export function FaqPage() {
  return (
    <main id="main">
      <JsonLd data={faqData(SITE.origin(), QUESTIONS)} />
      <PageHead copy={FAQ_HEAD} />
      <section className="site-screen site-wrap" aria-labelledby="site-faq-title">
        <div className="site-faq-grid">
          <h2 id="site-faq-title" className="t-label site-label site-faq-label">
            <SiteIcon name="question-mark-circle" />
            <span className="site-num">{String(QUESTIONS.length).padStart(2, '0')}</span>
            {PAGES.questionsName}
          </h2>
          <div className="site-faq">
            {QUESTIONS.map((entry, i) => (
              <details key={entry.id} id={entry.id} className="site-faq-item">
                <summary>
                  <span className="site-faq-n" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="site-faq-q">{entry.question}</span>
                  <SiteIcon name="chevron-down" size={20} />
                </summary>
                <div className="site-faq-a">
                  {entry.answer.map((paragraph) => (
                    <p key={paragraph}>
                      <InlineCode text={paragraph} />
                    </p>
                  ))}
                  <ul className="site-faq-links t-small">
                    {entry.links.map((link) => (
                      <li key={link.href}>
                        <SiteLink
                          href={link.href}
                          external={link.href.startsWith('https://')}
                          control={`site.faq.${entry.id}.link`}
                        >
                          {link.label}
                          <SiteIcon name="arrow-right" />
                        </SiteLink>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
