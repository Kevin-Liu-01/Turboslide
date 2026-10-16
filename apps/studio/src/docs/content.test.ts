import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GALLERY_MATERIAL_IDS, materialEntry } from '@turboslide/materials/catalog';

import { FIGURE_SIZES } from './figures';

// The docs' content (docs/POLISH-2.md 5.6, C29): every MDX file under apps/studio/content/docs has
// a title and a description, uses no em dash and no en dash as a dash, and every link to a docs
// page resolves to a page, and to a heading of it when the link names one. Links to the site's
// other addresses name one of the addresses the studio serves.

const DIR = fileURLToPath(new URL('../../content/docs', import.meta.url));
const FIGURE_DIR = fileURLToPath(new URL('../../public/docs/figures', import.meta.url));

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

      it('names figures whose pictures exist in both appearances, each with alt text and a caption', () => {
        const faults: string[] = [];
        for (const match of page.text.matchAll(/<Figure\b([\s\S]*?)\/>/g)) {
          const props = match[1] ?? '';
          const name = /\bname="([^"]+)"/.exec(props)?.[1] ?? '';
          const alt = /\balt="([^"]+)"/.exec(props)?.[1] ?? '';
          const caption = /\bcaption="([^"]+)"/.exec(props)?.[1] ?? '';
          const size = FIGURE_SIZES[name];
          if (size === undefined) faults.push(`${name}: not in figures.ts`);
          const files = ['light', 'dark'].flatMap((appearance) => [
            `${name}-${appearance}.webp`,
            ...(size?.phone === undefined ? [] : [`${name}-390-${appearance}.webp`]),
          ]);
          for (const file of files)
            if (!existsSync(join(FIGURE_DIR, file))) faults.push(`${name}: no ${file}`);
          if (!alt.endsWith('.'))
            faults.push(`${name}: alt text "${alt}" ends without a full stop`);
          if (!caption.endsWith('.'))
            faults.push(`${name}: caption "${caption}" ends without a full stop`);
        }
        expect(faults, url).toEqual([]);
      });
    });
  }
});

/** The rows of a markdown table after its head, each cell trimmed, the link text of a linked cell kept with its address. */
function tableRows(text: string, head: string): string[][] {
  const at = text.indexOf(head);
  if (at < 0) return [];
  const lines = text.slice(at).split('\n');
  const rows: string[][] = [];
  for (const line of lines.slice(2)) {
    if (!line.startsWith('|')) break;
    rows.push(
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

// The front page (docs/SITE.md section 6; plan E.6) lists the pages of each group and the action
// reference's counts per group. Its index rows carry each page's own title and description, and
// its table carries the generated reference's rows and totals, so a page or a count that moves
// fails here instead of going stale on the front page.
describe('the front page', () => {
  const front = pages.get('/docs');

  it('lists each page under its own title with its own description', () => {
    const faults: string[] = [];
    const cards = [
      ...(front?.text ?? '').matchAll(
        /<Card title="([^"]+)" href="([^"]+)"(?: sub)?>\s*([\s\S]*?)\s*<\/Card>/g,
      ),
    ];
    expect(cards.length).toBeGreaterThan(10);
    for (const [, title = '', href = '', body = ''] of cards) {
      const target = pages.get(href);
      if (target === undefined) {
        faults.push(`${href}: no page`);
        continue;
      }
      const meta = frontmatter(target.text);
      if (meta['title'] !== title)
        faults.push(`${href}: title "${title}", the page's "${meta['title']}"`);
      const text = body.replace(/\s+/g, ' ');
      if (meta['description'] !== text)
        faults.push(`${href}: "${text}", the page's "${meta['description']}"`);
    }
    expect(faults).toEqual([]);
  });

  it("carries the generated reference's counts per group and in all", () => {
    const reference = pages.get('/docs/reference');
    const head = '| Group';
    const want = tableRows(reference?.text ?? '', head);
    const got = tableRows(front?.text ?? '', head);
    expect(want.length).toBe(16);
    expect(got.slice(0, -1)).toEqual(want);
    const counts =
      /<ActionCounts total="(\d+)" cli="(\d+)" mcp="(\d+)" http="(\d+)" window="(\d+)"/.exec(
        reference?.text ?? '',
      );
    expect(got[got.length - 1]).toEqual(['Every group', ...(counts?.slice(1) ?? [])]);
  });
});

// The animated patterns of editor/objects (post-deploy review: the page said 20 patterns while the
// gallery listed 38): the count it states is the gallery's, and each card's name sits in the row
// of its group.
describe('the animated patterns page', () => {
  const objects = pages.get('/docs/editor/objects')?.text ?? '';
  const cards = GALLERY_MATERIAL_IDS.flatMap((id) => {
    const entry = materialEntry(id);
    return entry?.available === true ? [entry] : [];
  });

  it("states the gallery's count", () => {
    const stated = /opens a gallery of (\d+) patterns in five groups/.exec(objects)?.[1];
    expect(Number(stated)).toBe(cards.length);
  });

  it('names every card in the row of its group', () => {
    const rows = new Map(
      [...objects.matchAll(/^\| (Fluid|Light|Metal|Gradient|Graphic)\s*\| ([^|]+)\|$/gm)].map(
        (m) => [(m[1] ?? '').toLowerCase(), (m[2] ?? '').split(',').map((name) => name.trim())],
      ),
    );
    expect([...rows.keys()].sort()).toEqual(['fluid', 'gradient', 'graphic', 'light', 'metal']);
    const missing = cards.filter(
      (entry) => !(rows.get(entry.category) ?? []).includes(entry.label),
    );
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });
});
