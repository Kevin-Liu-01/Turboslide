import { useRef } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { FaqPage } from '../components/site/FaqPage';
import { FAQ_META, siteHead } from '../components/site/meta';
import { SiteBar } from '../components/site/SiteBar';
import { SiteFooter } from '../components/site/SiteFooter';
import siteCss from '../components/site/site.css?url';
import { useMountEffect } from '../components/useMountEffect';

/**
 * /faq (the pages step): the questions a visitor asks, answered from the code and the documentation
 * (components/site/FaqPage.tsx). A site page as /home draws one: the bar, `main` and the footer on
 * the site root, the site stylesheet linked from the head (`site.css?url`, so no rule reaches
 * another route), its own title, description and canonical address (meta.ts siteHead), and its
 * structured data in the page. Prerendered at build (vite.deploy.config.ts).
 */
export const Route = createFileRoute('/faq')({
  head: () => siteHead(FAQ_META, siteCss),
  component: Page,
});

function Page() {
  const root = useRef<HTMLDivElement>(null);
  useMountEffect(() => {
    root.current?.setAttribute('data-hydrated', '');
  });
  return (
    <div ref={root} id="top" className="ts-site" data-page="faq">
      <SiteBar />
      <FaqPage />
      <SiteFooter />
    </div>
  );
}
