import type { DocsPage } from './source';

/**
 * The markdown the agents read (docs/POLISH-2.md 5.7): a page's twin is its title, its
 * description and its body as the build wrote it (markdown.ts), with no JSX, import or heading id.
 */
export async function pageMarkdown(page: DocsPage): Promise<string> {
  const body = (await page.data.getText('processed')).trim();
  const description = page.data.description ?? '';
  return `# ${page.data.title}\n\n${description === '' ? '' : `${description}\n\n`}${body}\n`;
}

/** True for a page written by hand: every page outside the generated action reference. */
export function isWritten(page: DocsPage): boolean {
  return page.slugs[0] !== 'reference';
}
