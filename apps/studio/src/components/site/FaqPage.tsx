import { useRef, useState } from 'react';

import { SITE } from '@turboslide/theme/brand/site';

import { useMountEffect } from '../useMountEffect';
import { InlineCode } from './InlineCode';
import { JsonLd } from './JsonLd';
import { PageHead } from './PageHead';
import { PageShots } from './PageShots';
import { FAQ_HEAD, FAQ_SHOTS, FAQ_SHOT_FOR, PAGES, QUESTIONS } from './pages-copy';
import type { FaqShotId } from './pages-copy';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';
import { faqData } from './structured-data';

/**
 * /faq (the pages step) on two columns: on the first seven the head (the h1 with "answers" in the
 * accent over New Presentation and Read the Documentation) and then every question as one
 * disclosure list of native `<details>` (the summary is the button a keyboard and a screen reader
 * reach; the answer is in the page for search and find), each answer with the chapters that say
 * more; on the other five, held in view while the list scrolls, the shot of the product the answer
 * opened last is about (FAQ_SHOT_FOR; the sharing dialog first). The FAQPage structured data
 * carries the same questions and answers. An address that names a question (`/faq#privacy`, a
 * shot's link) opens its answer. Under 1024 px the shot sits between the head and the list.
 */
export function FaqPage() {
  const list = useRef<HTMLDivElement>(null);
  const [shot, setShot] = useState<FaqShotId>('share');
  useMountEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id === '') return;
      const item = list.current?.querySelector<HTMLDetailsElement>(
        `details[id="${CSS.escape(id)}"]`,
      );
      if (item !== null && item !== undefined) item.open = true;
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  });
  return (
    <main id="main">
      <JsonLd data={faqData(SITE.origin(), QUESTIONS)} />
      <div className="site-faq-page site-wrap">
        <div className="site-faq-main">
          <PageHead copy={FAQ_HEAD} layout="side" />
          <section className="site-faq-list" aria-label={PAGES.questionsName}>
            <div ref={list} className="site-faq">
              {QUESTIONS.map((entry) => (
                <details
                  key={entry.id}
                  id={entry.id}
                  className="site-faq-item"
                  onToggle={(event) => {
                    const next = FAQ_SHOT_FOR[entry.id];
                    if (event.currentTarget.open && next !== undefined) setShot(next);
                  }}
                >
                  <summary>
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
          </section>
        </div>
        <aside className="site-faq-aside" aria-label={PAGES.shotName}>
          <PageShots key={shot} shots={[FAQ_SHOTS[shot]]} control="site.faq.shot" />
        </aside>
      </div>
    </main>
  );
}
