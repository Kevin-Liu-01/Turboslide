import type { ReactNode } from 'react';

/**
 * The markdown the two help pages render (gslides-parity SPEC-5 7.6, 0.40; P3 6.10): a small
 * reader for the subset `docs/training.md` and `docs/updates.md` use (headings with `#` to `###`,
 * paragraphs, bulleted and numbered lists, pipe tables, fenced code, inline code, bold, links),
 * turned into React nodes with the `/home` page's classes. No library: the repository carries no
 * markdown dependency, the two documents are the repository's own and the parser refuses nothing
 * it does not know (an unknown line is a paragraph). Links to another host open in a new tab;
 * links to a path stay in the document.
 */
export type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'code'; text: string; lang?: string };

/** A heading's anchor id: lower case words joined by hyphens. */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function tableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** The blocks of a markdown text, in order. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const fence = /^```(\w*)\s*$/u.exec(line);
    if (fence !== null) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/u.test(lines[i] ?? '')) {
        code.push(lines[i] ?? '');
        i += 1;
      }
      i += 1;
      blocks.push({ kind: 'code', text: code.join('\n'), ...(fence[1] ? { lang: fence[1] } : {}) });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+?)\s*$/u.exec(line);
    if (heading !== null) {
      const level = heading[1]!.length as 1 | 2 | 3;
      const text = heading[2] ?? '';
      blocks.push({ kind: 'heading', level, text, id: slugOf(text) });
      i += 1;
      continue;
    }
    if (/^\s*\|/u.test(line) && /^\s*\|?\s*:?-{2,}/u.test(lines[i + 1] ?? '')) {
      const head = tableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/u.test(lines[i] ?? '')) {
        rows.push(tableRow(lines[i] ?? ''));
        i += 1;
      }
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/u;
    const numbered = /^\s*\d+[.)]\s+(.*)$/u;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i] ?? '')) {
        let item = pattern.exec(lines[i] ?? '')?.[1] ?? '';
        i += 1;
        // a continuation line indented under the item joins it
        while (
          i < lines.length &&
          /^\s{2,}\S/u.test(lines[i] ?? '') &&
          !pattern.test(lines[i] ?? '')
        ) {
          item += ` ${(lines[i] ?? '').trim()}`;
          i += 1;
        }
        items.push(item);
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^#{1,3}\s/u.test(lines[i] ?? '') &&
      !/^```/u.test(lines[i] ?? '') &&
      !bullet.test(lines[i] ?? '') &&
      !numbered.test(lines[i] ?? '') &&
      !/^\s*\|/u.test(lines[i] ?? '')
    ) {
      paragraph.push((lines[i] ?? '').trim());
      i += 1;
    }
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }
  return blocks;
}

/** Inline markdown: `code`, **bold**, [text](href); everything else literal. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/gu;
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    n += 1;
    if (token.startsWith('`'))
      out.push(<code key={`${keyPrefix}-${n}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**'))
      out.push(<b key={`${keyPrefix}-${n}`}>{token.slice(2, -2)}</b>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token);
      const label = link?.[1] ?? token;
      const href = link?.[2] ?? '#';
      const external = /^https?:\/\//u.test(href);
      out.push(
        <a
          key={`${keyPrefix}-${n}`}
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener' } : {})}
        >
          {label}
        </a>,
      );
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The blocks as React nodes under the help page's classes. */
export function renderMarkdown(blocks: ReadonlyArray<MarkdownBlock>): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `b${index}`;
    switch (block.kind) {
      case 'heading': {
        const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3';
        return (
          <Tag key={key} id={block.id} className={`ts-help-h${block.level}`}>
            {renderInline(block.text, key)}
          </Tag>
        );
      }
      case 'paragraph':
        return (
          <p key={key} className="ts-help-p">
            {renderInline(block.text, key)}
          </p>
        );
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul';
        return (
          <Tag key={key} className="ts-help-list">
            {block.items.map((item, at) => (
              <li key={`${key}-${at}`}>{renderInline(item, `${key}-${at}`)}</li>
            ))}
          </Tag>
        );
      }
      case 'table':
        return (
          <div key={key} className="ts-help-table-wrap">
            <table className="ts-help-table">
              <thead>
                <tr>
                  {block.head.map((cell, at) => (
                    <th key={`${key}-h${at}`}>{renderInline(cell, `${key}-h${at}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={`${key}-r${r}`}>
                    {row.map((cell, c) => (
                      <td key={`${key}-r${r}c${c}`}>{renderInline(cell, `${key}-r${r}c${c}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'code':
        return (
          <pre key={key} className="ts-help-code" data-lang={block.lang}>
            <code>{block.text}</code>
          </pre>
        );
    }
  });
}

/** The first `#` heading's text, the page's title. */
export function markdownTitle(blocks: ReadonlyArray<MarkdownBlock>, fallback: string): string {
  const first = blocks.find((block) => block.kind === 'heading' && block.level === 1);
  return first !== undefined && first.kind === 'heading' ? first.text : fallback;
}
