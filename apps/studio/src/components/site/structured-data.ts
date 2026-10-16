import { SITE } from '@turboslide/theme/brand/site';

import { plainText } from './InlineCode';
import type { PageMeta } from './meta';
import type { Question } from './pages-copy';

/**
 * The schema.org data of the site pages (JsonLd.tsx): a page and the product it is about, and the
 * FAQPage of /faq with every question and its answer as plain text.
 */
const CONTEXT = 'https://schema.org';

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
