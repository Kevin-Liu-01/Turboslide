import { useRef } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { AboutPage } from '../components/site/AboutPage';
import { ABOUT_META, siteHead } from '../components/site/meta';
import { SiteBar } from '../components/site/SiteBar';
import { SiteFooter } from '../components/site/SiteFooter';
import siteCss from '../components/site/site.css?url';
import { useMountEffect } from '../components/useMountEffect';

/**
 * /about (the pages step): what Turboslide is, why it is agent native, its principles, the source,
 * the maker and how to reach the project (components/site/AboutPage.tsx). A site page as /home
 * draws one: the bar, `main` and the footer on the site root, the site stylesheet linked from the
 * head (`site.css?url`, so no rule reaches another route), its own title, description and canonical
 * address (meta.ts siteHead), and its structured data in the page. Prerendered at build
 * (vite.deploy.config.ts).
 */
export const Route = createFileRoute('/about')({
  head: () => siteHead(ABOUT_META, siteCss),
  component: Page,
});

function Page() {
  const root = useRef<HTMLDivElement>(null);
  useMountEffect(() => {
    root.current?.setAttribute('data-hydrated', '');
  });
  return (
    <div ref={root} id="top" className="ts-site" data-page="about">
      <SiteBar />
      <AboutPage />
      <SiteFooter />
    </div>
  );
}
