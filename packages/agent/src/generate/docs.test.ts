import { describe, expect, it } from 'vitest';

import { actionsInOrder } from '@turboslide/schema/actions';
import { generateCli } from './cli.ts';
import { generateDescribe } from './describe.ts';
import { DOCS_CONTENT_DIR, generateDocsGrammar, generateDocsReference, mdxText } from './docs.ts';
import { generateManifest } from './manifest.ts';
import { generateMcpTools } from './mcp.ts';
import { generateOpenApi } from './openapi.ts';

// The docs' generated pages (docs/POLISH-2.md 5.4): the counts on the reference are the generated
// contracts' own, every action has one section with its id as the anchor, and plain text is safe
// in MDX. contracts.test.ts compares the committed pages with a fresh generation.
const contracts = {
  cli: generateCli(),
  mcp: generateMcpTools(),
  describe: generateDescribe(),
  openapi: generateOpenApi(),
  manifest: generateManifest(),
};
const pages = generateDocsReference(contracts);
const dir = `${DOCS_CONTENT_DIR}/reference`;

describe('the docs reference', () => {
  it('prints the count of actions on each transport from the contracts', () => {
    const http = Object.keys(
      (contracts.openapi as { paths: Record<string, unknown> }).paths,
    ).filter((path) => path.startsWith('/api/actions/') && !path.includes('{')).length;
    const index = pages[`${dir}/index.mdx`] ?? '';
    expect(index).toContain(
      `<ActionCounts total="${contracts.manifest.actionCount}" cli="${contracts.cli.actions.length}" mcp="${contracts.mcp.tools.length}" http="${http}" window="${(contracts.describe as { actions: unknown[] }).actions.length}" />`,
    );
  });

  it('gives every action one section on its group page, with its id as the anchor', () => {
    for (const spec of actionsInOrder()) {
      const page = pages[`${dir}/${spec.group}.mdx`] ?? '';
      const heads = page.split('\n').filter((line) => line === `## ${spec.id} [#${spec.id}]`);
      expect(heads, spec.id).toHaveLength(1);
    }
    const meta = JSON.parse(pages[`${dir}/meta.json`] ?? '{}') as { pages: string[] };
    for (const group of meta.pages) expect(pages[`${dir}/${group}.mdx`], group).toBeDefined();
  });

  it('writes the grammar page from the catalog', () => {
    const grammar = Object.values(generateDocsGrammar())[0] ?? '';
    expect(grammar).toContain('title: Deck grammar');
    expect(grammar).toContain('## Slide kinds');
    expect(grammar).toContain('`freeform`');
  });
});

describe('mdxText', () => {
  it('escapes what MDX reads as code and emphasis outside code spans', () => {
    expect(mdxText('a <b> {c} `<d>` paper:*')).toBe('a \\<b\\> \\{c\\} `<d>` paper:\\*');
    expect(mdxText('TURBOSLIDE_TOKEN and __schema0')).toBe('TURBOSLIDE_TOKEN and \\_\\_schema0');
  });
});
