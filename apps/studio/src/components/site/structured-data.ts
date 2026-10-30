import { SITE } from '@turboslide/theme/brand/site';

import { plainText } from './InlineCode';
import type { PageMeta } from './meta';
import { KEVIN_LIU } from './pages-copy';
import type { Question } from './pages-copy';

/**
 * The schema.org data of the site pages (JsonLd.tsx): a page and the product it is about, and the
 * FAQPage of /faq with every question and its answer as plain text.
 */
const CONTEXT = 'https://schema.org';

/**
 * The site's WebSite and Organization, in the root document's head on every route (__root.tsx):
 * the name, the address and the 512 px icon as the logo, founded by Kevin Liu, who /about names as
 * its publisher (Kevin, 2026-10-30: Turboslide is his personal project).
 */
export function siteData(origin: string) {
  return {
    '@context': CONTEXT,
    '@graph': [
      { '@type': 'WebSite', '@id': `${origin}/#website`, name: SITE.name, url: origin },
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE.name,
        url: origin,
        logo: `${origin}${SITE.icons.any512}`,
        founder: { '@type': 'Person', name: 'Kevin Liu', url: KEVIN_LIU },
      },
    ],
  };
}

export function softwareData(origin: string, featureList?: readonly string[]) {
  return {
    '@type': 'SoftwareApplication',
    name: SITE.name,
    url: origin,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    license: 'https://opensource.org/license/mit',
    ...(featureList === undefined ? {} : { featureList: [...featureList] }),
  };
}

export function webPageData(
  origin: string,
  page: PageMeta,
  type: 'WebPage' | 'AboutPage',
  extra: Record<string, unknown>,
) {
  const url = `${origin}${page.path}`;
  return {
    '@context': CONTEXT,
    '@type': type,
    '@id': url,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { '@type': 'WebSite', name: SITE.name, url: origin },
    ...extra,
  };
}

export function faqData(origin: string, questions: readonly Question[]) {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    url: `${origin}/faq`,
    mainEntity: questions.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer.map(plainText).join(' '),
      },
    })),
  };
}
