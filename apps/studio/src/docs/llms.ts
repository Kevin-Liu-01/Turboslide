import { pagesInOrder } from './source';
import type { DocsPage } from './source';
import { twinUrl } from './paths';

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

/**
 * /docs/llms-full.txt: every written page's twin in the sidebar's order, under one heading that
 * says what the file is.
 */
export async function llmsFull(): Promise<string> {
  const pages = pagesInOrder().filter(isWritten);
  const parts = await Promise.all(pages.map((page) => pageMarkdown(page)));
  return `# Turboslide documentation\n\nEvery page of the Turboslide documentation as markdown, in the order of the sidebar at /docs. The action reference is at /docs/reference and in /llms-full.txt.\n\n${parts.join('\n')}`;
}

/**
 * The Documentation section of /llms.txt (docs/POLISH-2.md 5.7): every page's twin with its title
 * and description, in the sidebar's order.
 */
export function llmsDocumentation(): string {
  const lines = pagesInOrder().map((page) => {
    const description = page.data.description ?? '';
    return `- [${page.data.title}](${twinUrl(page.slugs)})${description === '' ? '' : `: ${description}`}`;
  });
  return `## Documentation\n\nThe guides and the action reference at /docs, each page as markdown:\n\n${lines.join('\n')}\n`;
}
