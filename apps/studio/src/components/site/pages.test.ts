import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { EM_DASH, EN_DASH, EXCLAMATION } from '@turboslide/theme/copy';

import {
  ABOUT_BLOCKS,
  ABOUT_HEAD,
  FAQ_HEAD,
  FEATURES_HEAD,
  FEATURE_COUNTS,
  FEATURE_GROUPS,
  QUESTIONS,
} from './pages-copy';
import { faqData } from './structured-data';

// /features, /faq and /about (the pages step): every docs link names a page of content/docs and,
// after `#`, one of its sections; /faq holds 12 to 20 questions with distinct ids, and its FAQPage
// data carries each one as plain text; no word of the pages has an em dash, an en dash or an
// exclamation mark.

const DOCS = new URL('../../../content/docs/', import.meta.url);

/** A heading's anchor as the docs draw it: lower case, punctuation dropped, spaces as hyphens. */
const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');

/** Why a docs address does not resolve, or null when it does. */
function fault(href: string): string | null {
  const [path = '', hash] = href.split('#');
  const rest = path.replace(/^\/docs\/?/, '');
  const candidates = [`${rest}.mdx`, `${rest}${rest === '' ? '' : '/'}index.mdx`];
  const file = candidates.map((name) => new URL(name, DOCS)).find((url) => existsSync(url));
  if (file === undefined) return `${href}: no page`;
  if (hash === undefined) return null;
  const sections = [...readFileSync(file, 'utf8').matchAll(/^#{2,3} (.+)$/gm)].map((m) =>
    slug(m[1] ?? ''),
  );
  return sections.includes(hash) ? null : `${href}: no section`;
}

const docsLinks: string[] = [
  ...FEATURE_COUNTS.map((count) => count.href),
  ...FEATURE_GROUPS.flatMap((group) => [
    group.docs.href,
    ...group.features.map((feature) => feature.href),
  ]),
  ...QUESTIONS.flatMap((entry) => entry.links.map((link) => link.href)),
  ...ABOUT_BLOCKS.flatMap((block) => (block.links ?? []).map((link) => link.href)),
].filter((href) => href.startsWith('/docs'));

const words: string[] = [
  ...[FEATURES_HEAD, FAQ_HEAD, ABOUT_HEAD].flatMap((head) =>
    head.lead === undefined ? [head.title] : [head.title, head.lead],
  ),
  ...FEATURE_GROUPS.flatMap((group) => [
    group.sentence,
    ...group.features.flatMap((feature) => [feature.name, feature.sentence]),
  ]),
  ...QUESTIONS.flatMap((entry) => [entry.question, ...entry.answer]),
  ...ABOUT_BLOCKS.flatMap((block) => [
    block.sentence,
    ...block.body,
    ...(block.points ?? []).flatMap((point) => [point.name, point.sentence]),
  ]),
];

describe('the site pages', () => {
  it('link to pages and sections the docs have', () => {
    expect(docsLinks.length).toBeGreaterThan(30);
    expect(docsLinks.map(fault).filter((each) => each !== null)).toEqual([]);
  });

  it('ask 12 to 20 questions with distinct ids, all in the FAQPage data as plain text', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(12);
    expect(QUESTIONS.length).toBeLessThanOrEqual(20);
    expect(new Set(QUESTIONS.map((entry) => entry.id)).size).toBe(QUESTIONS.length);
    const data = faqData('https://www.turboslide.com', QUESTIONS);
    expect(data.mainEntity.map((entry) => entry.name)).toEqual(
      QUESTIONS.map((entry) => entry.question),
    );
    for (const entry of data.mainEntity) expect(entry.acceptedAnswer.text).not.toContain('`');
  });

  it('write no em dash, en dash or exclamation mark', () => {
    for (const text of words) {
      expect(text.includes(EM_DASH), text).toBe(false);
      expect(text.includes(EN_DASH), text).toBe(false);
      expect(text.includes(EXCLAMATION), text).toBe(false);
    }
  });
});
