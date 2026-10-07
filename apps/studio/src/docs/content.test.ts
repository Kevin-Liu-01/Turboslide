import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The docs' content (docs/POLISH-2.md 5.6, C29): every MDX file under apps/studio/content/docs has
// a title and a description, uses no em dash and no en dash as a dash, and every link to a docs
// page resolves to a page, and to a heading of it when the link names one. Links to the site's
// other addresses name one of the addresses the studio serves.

const DIR = fileURLToPath(new URL('../../content/docs', import.meta.url));

/** The site's addresses outside the docs pages that a docs page may link to. */
const SITE_PATHS = new Set([
  '/new',
  '/decks',
  '/home',
  '/device',
  '/mcp',
  '/llms.txt',
  '/llms-full.txt',
  '/openapi.json',
  '/docs/llms-full.txt',
  '/docs/search.json',
]);

function mdxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...mdxFiles(full));
    else if (name.endsWith('.mdx')) out.push(full);
  }
  return out;
}

/** A page's address from its file: `.mdx` and a folder's `index` dropped. */
function urlOf(file: string): string {
  const parts = relative(DIR, file).slice(0, -'.mdx'.length).split(sep);
  if (parts[parts.length - 1] === 'index') parts.pop();
  return parts.length === 0 ? '/docs' : `/docs/${parts.join('/')}`;
}

/** The text with its code blocks and code spans blanked, so code is not read as prose. */
function prose(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '``');
}

/** A heading's anchor as fumadocs writes it: an explicit `[#id]`, else the slug of its text. */
function anchorOf(heading: string): string {
  const explicit = /\[#([^\]]+)\]\s*$/.exec(heading);
  if (explicit?.[1] !== undefined) return explicit[1];
  return heading
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function frontmatter(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = /^([a-z]+):\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined) out[match[1]] = match[2] ?? '';
  }
  return out;
}

const files = mdxFiles(DIR);
const pages = new Map(
  files.map((file) => {
    const text = readFileSync(file, 'utf8');
    const anchors = new Set(
      [...prose(text).matchAll(/^#{2,4} (.+)$/gm)].map((match) => anchorOf(match[1] ?? '')),
    );
    return [urlOf(file), { file: relative(DIR, file), text, anchors }];
  }),
);

describe('the docs content', () => {
  it('has pages', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(pages.has('/docs')).toBe(true);
  });

  for (const [url, page] of pages) {
    describe(page.file, () => {
      it('has a title and a description', () => {
        const meta = frontmatter(page.text);
        expect(meta['title'], url).toBeTruthy();
        expect(meta['description'], url).toBeTruthy();
        expect(meta['title']?.endsWith('.'), `${url} title ends in a period`).toBe(false);
      });

      it('uses no em dash and no en dash as a dash', () => {
        const text = prose(page.text);
        expect(text.includes('—'), `${url} has an em dash`).toBe(false);
        expect(/\s–\s|\w–\w/.test(text), `${url} has an en dash used as a dash`).toBe(false);
      });

      it('links only to pages, headings and addresses that exist', () => {
        const text = prose(page.text);
        const hrefs = [
          ...[...text.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1] ?? ''),
          ...[...text.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1] ?? ''),
        ];
        const broken: string[] = [];
        for (const href of hrefs) {
          const [path = '', hash] = href.split('#');
          const target = path.replace(/\/$/, '') || '/';
          if (SITE_PATHS.has(target)) continue;
          const found = pages.get(target);
          if (found === undefined) broken.push(href);
          else if (hash !== undefined && hash !== '' && !found.anchors.has(hash)) broken.push(href);
        }
        expect(broken, `${url} links`).toEqual([]);
      });
    });
  }
});
