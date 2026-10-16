import { remarkGfm } from 'fumadocs-core/mdx-plugins/remark-gfm';
import { remarkLLMs } from 'fumadocs-core/mdx-plugins/remark-llms';
import { describe, expect, it } from 'vitest';

import { DOCS_MARKDOWN } from './markdown';

// The docs' markdown twins (markdown.ts, C27): fumadocs' remarkLLMs writes each page's twin with
// MDX's escapes, so a reference type read `\{ principalId } \| \{ email }` in
// /docs/reference/share.md and /llms-full.txt (post-merge review). The twin is plain Markdown:
// a brace in text is written as it is, and a table cell's pipe keeps its escape.

type Root = Parameters<ReturnType<typeof remarkLLMs>>[0];

const text = (value: string) => ({ type: 'text' as const, value });
const cell = (...children: object[]) => ({ type: 'tableCell' as const, children });

/** The twin of a tree, through remarkLLMs and remark-gfm's markdown extension as the build runs them. */
function twin(children: object[]): string {
  const data: Record<string, unknown> = {};
  const processor = {
    data(key?: string) {
      return key === undefined ? data : data[key];
    },
  };
  (remarkGfm as unknown as (this: typeof processor) => void).call(processor);
  const transform = (
    remarkLLMs as unknown as (
      this: typeof processor,
      options: object,
    ) => (tree: Root, file: { data: Record<string, unknown> }) => void
  ).call(processor, { ...DOCS_MARKDOWN, _data: true });
  const file = { data: {} as Record<string, unknown> };
  transform({ type: 'root', children } as unknown as Root, file);
  return String(file.data.markdown);
}

describe("a docs page's markdown twin", () => {
  it('writes a brace in a table cell as it is, and keeps the pipe escaped', () => {
    const markdown = twin([
      {
        type: 'table',
        align: [null, null],
        children: [
          { type: 'tableRow', children: [cell(text('Field')), cell(text('Type'))] },
          {
            type: 'tableRow',
            children: [
              cell({ type: 'inlineCode', value: 'to' }),
              cell(text('{ principalId } | { email }')),
            ],
          },
        ],
      },
    ]);
    expect(markdown).toMatch(/\| `to` +\| \{ principalId \} \\\| \{ email \} \|/);
    expect(markdown).not.toContain('\\{');
  });

  it('writes a brace in a sentence as it is, and a literal backslash before it escaped', () => {
    const markdown = twin([
      { type: 'paragraph', children: [text('A field reads { color } or a \\{ brace.')] },
    ]);
    expect(markdown).toBe('A field reads { color } or a \\\\{ brace.\n');
  });
});
