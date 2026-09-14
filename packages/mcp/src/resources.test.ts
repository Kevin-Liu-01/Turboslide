// The deck:// URI grammar (SPEC 7.3) and the resource reads over a fake source.
import { describe, expect, it } from 'vitest';
import {
  CATALOG_BLOCKS_URI,
  CATALOG_ICONS_URI,
  GRAMMAR_PROSE_URI,
  GRAMMAR_URI,
  INBOX_URI,
  RESOURCE_TEMPLATES,
  ResourceNotFoundError,
  THEME_URI,
  commentsUri,
  lintUri,
  presenceUri,
  manifestUri,
  parseResourceUri,
  plainCatalog,
  readResource,
  renderUri,
  sheetMapUri,
  sheetUri,
  slideUri,
  staticResources,
} from './resources.ts';
import type { DeckSource, ReadDeps } from './resources.ts';

type Content = { uri: string; mimeType?: string; text?: string; blob?: string };

/** The text of a resource content, or '' for a blob. */
function text(content: Content | undefined): string {
  return typeof content?.text === 'string' ? content.text : '';
}

/** The blob of a resource content, or '' for text. */
function blob(content: Content | undefined): string {
  return typeof content?.blob === 'string' ? content.blob : '';
}

describe('parseResourceUri', () => {
  it('parses the deck-scoped forms', () => {
    expect(parseResourceUri('deck://gt-brand/manifest')).toEqual({
      kind: 'manifest',
      deckId: 'gt-brand',
    });
    expect(parseResourceUri('deck://gt-brand/slides/content-rule')).toEqual({
      kind: 'slide',
      deckId: 'gt-brand',
      slideId: 'content-rule',
    });
    expect(parseResourceUri('deck://lint/gt-brand')).toEqual({ kind: 'lint', deckId: 'gt-brand' });
  });

  it('parses the render and sheet forms', () => {
    expect(parseResourceUri('deck://render/content-rule/light')).toEqual({
      kind: 'render',
      slideId: 'content-rule',
      theme: 'light',
    });
    expect(parseResourceUri('deck://sheet/dark')).toEqual({
      kind: 'sheet',
      theme: 'dark',
      part: 'image',
    });
    expect(parseResourceUri('deck://sheet/dark/map')).toEqual({
      kind: 'sheet',
      theme: 'dark',
      part: 'map',
    });
    expect(parseResourceUri('deck://render/content-rule/sepia')).toBeUndefined();
    expect(parseResourceUri('deck://render/content-rule')).toBeUndefined();
    expect(parseResourceUri('deck://sheet/light/other')).toBeUndefined();
  });

  it('parses the bound-deck forms and the references', () => {
    expect(parseResourceUri('deck://manifest')).toEqual({ kind: 'manifest' });
    expect(parseResourceUri('deck://slides/thesis')).toEqual({ kind: 'slide', slideId: 'thesis' });
    expect(parseResourceUri('deck://lint')).toEqual({ kind: 'lint' });
    expect(parseResourceUri(GRAMMAR_URI)).toEqual({ kind: 'grammar', part: 'rules' });
    expect(parseResourceUri(GRAMMAR_PROSE_URI)).toEqual({ kind: 'grammar', part: 'prose' });
    expect(parseResourceUri(CATALOG_BLOCKS_URI)).toEqual({ kind: 'catalog', which: 'blocks' });
    expect(parseResourceUri(CATALOG_ICONS_URI)).toEqual({ kind: 'catalog', which: 'icons' });
    expect(parseResourceUri(THEME_URI)).toEqual({ kind: 'theme' });
  });

  it('rejects what it does not know', () => {
    for (const uri of [
      'deck://',
      'deck://gt-brand',
      'deck://gt-brand/other',
      'deck://gt-brand/slides',
      'deck://gt-brand/slides/Not-A-Slug',
      'deck://catalog/materials',
      'deck://manifest/extra',
      'deck://theme/dark',
      'file:///tmp/deck.json',
      'deck://gt-brand/manifest?x=1',
    ])
      expect(parseResourceUri(uri), uri).toBeUndefined();
  });

  it('round-trips the builders', () => {
    expect(parseResourceUri(manifestUri('gt-brand'))).toEqual({
      kind: 'manifest',
      deckId: 'gt-brand',
    });
    expect(parseResourceUri(slideUri('gt-brand', 'thesis'))).toMatchObject({ slideId: 'thesis' });
    expect(parseResourceUri(renderUri('thesis', 'dark'))).toMatchObject({
      kind: 'render',
      theme: 'dark',
    });
    expect(parseResourceUri(sheetUri('light'))).toMatchObject({ kind: 'sheet', part: 'image' });
    expect(parseResourceUri(sheetMapUri('light'))).toMatchObject({ kind: 'sheet', part: 'map' });
    expect(parseResourceUri(lintUri('gt-brand'))).toEqual({ kind: 'lint', deckId: 'gt-brand' });
  });

  it('lists templates and static resources that parse', () => {
    expect(RESOURCE_TEMPLATES.map((template) => template.uriTemplate)).toEqual([
      'deck://{deckId}/manifest',
      'deck://{deckId}/slides/{slideId}',
      'deck://render/{slideId}/{theme}',
      'deck://sheet/{theme}',
      'deck://sheet/{theme}/map',
      'deck://lint/{deckId}',
      'deck://{deckId}/comments',
      'deck://{deckId}/presence',
    ]);
    const resources = staticResources({
      id: 'gt-brand',
      slides: [
        { id: 'thesis', n: 1, title: 'Thesis' },
        { id: 'content-rule', n: 2, title: 'The content rule' },
      ],
    });
    // the round three resources appear only when the source answers them (SPEC-3 3.10)
    expect(resources.map((resource) => resource.uri)).not.toContain('deck://gt-brand/comments');
    const withRecords = staticResources({
      id: 'gt-brand',
      slides: [],
      comments: true,
      presence: true,
      inbox: true,
    }).map((resource) => resource.uri);
    expect(withRecords).toContain('deck://gt-brand/comments');
    expect(withRecords).toContain('deck://gt-brand/presence');
    expect(withRecords).toContain('deck://inbox');
    for (const resource of resources)
      expect(parseResourceUri(resource.uri), resource.uri).toBeDefined();
    expect(resources.map((resource) => resource.uri)).toContain(
      'deck://gt-brand/slides/content-rule',
    );
    expect(resources.find((resource) => resource.uri.endsWith('/content-rule'))?.name).toBe(
      '2 The content rule',
    );
    expect(resources.filter((resource) => resource.mimeType === 'image/png')).toHaveLength(2);
  });
});

function fakeSource(): DeckSource {
  return {
    deckId: 'gt-brand',
    manifest: async () => ({ id: 'gt-brand', revision: 12 }),
    slides: async () => [{ id: 'thesis', n: 1, title: 'Thesis' }],
    slide: async (slideId) =>
      slideId === 'thesis' ? { id: 'thesis', kind: 'statement' } : undefined,
    latestRender: async (slideId, theme) =>
      slideId === 'thesis' && theme === 'light'
        ? { image: '/renders/01-thesis-light.png', record: { slideId, theme } }
        : undefined,
    latestSheet: async (theme) =>
      theme === 'light'
        ? { image: '/sheets/sheet-light.png', map: '/sheets/sheet-light.json' }
        : undefined,
    theme: () => ({ tokens: { light: { paper: '#ffffff' } } }),
  };
}

function deps(source: DeckSource = fakeSource()): ReadDeps {
  return {
    source,
    readFile: async (path) => new TextEncoder().encode(`bytes of ${path}`),
    readJson: async (path) => ({ map: path, cells: [] }),
    lint: async () => [{ rule: 'copy/heading-period', slideId: 'thesis' }],
  };
}

async function read(uri: string, d: ReadDeps = deps()) {
  const parsed = parseResourceUri(uri);
  if (parsed === undefined) throw new Error(`unparsable ${uri}`);
  return readResource(uri, parsed, d);
}

describe('readResource', () => {
  it('reads the manifest and a slide, in both URI forms', async () => {
    const scoped = await read('deck://gt-brand/manifest');
    expect(scoped.contents[0]).toMatchObject({
      uri: 'deck://gt-brand/manifest',
      mimeType: 'application/json',
    });
    expect(JSON.parse(text(scoped.contents[0]))).toEqual({ id: 'gt-brand', revision: 12 });
    const bound = await read('deck://slides/thesis');
    expect(JSON.parse(text(bound.contents[0]))).toEqual({ id: 'thesis', kind: 'statement' });
  });

  it('refuses another deck and a missing slide', async () => {
    await expect(read('deck://other/manifest')).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(read('deck://gt-brand/slides/missing')).rejects.toThrow(/no slide missing/);
  });

  it('returns a render as a PNG blob with its record', async () => {
    const result = await read('deck://render/thesis/light');
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toMatchObject({
      uri: 'deck://render/thesis/light',
      mimeType: 'image/png',
    });
    const encoded = blob(result.contents[0]);
    expect(Buffer.from(encoded, 'base64').toString()).toBe('bytes of /renders/01-thesis-light.png');
    expect(JSON.parse(text(result.contents[1]))).toEqual({ slideId: 'thesis', theme: 'light' });
    await expect(read('deck://render/thesis/dark')).rejects.toThrow(/no render yet/);
  });

  it('returns the sheet with its cell map, or the map alone', async () => {
    const sheet = await read('deck://sheet/light');
    expect(sheet.contents.map((content) => content.mimeType)).toEqual([
      'image/png',
      'application/json',
    ]);
    expect(sheet.contents[1]?.uri).toBe('deck://sheet/light/map');
    const map = await read('deck://sheet/light/map');
    expect(map.contents).toHaveLength(1);
    expect(JSON.parse(text(map.contents[0]))).toEqual({
      map: '/sheets/sheet-light.json',
      cells: [],
    });
    await expect(read('deck://sheet/dark')).rejects.toThrow(/no contact sheet yet/);
  });

  it('lints through the dispatcher callback and reports its absence', async () => {
    const result = await read('deck://lint/gt-brand');
    expect(JSON.parse(text(result.contents[0]))).toEqual([
      { rule: 'copy/heading-period', slideId: 'thesis' },
    ]);
    await expect(read('deck://lint', { ...deps(), lint: undefined })).rejects.toThrow(/no handler/);
  });

  it('serves the grammar, the catalogs and the theme', async () => {
    const rules = JSON.parse(text((await read(GRAMMAR_URI)).contents[0])) as {
      rules: { id: string }[];
    };
    expect(rules.rules.map((rule) => rule.id)).toContain('sheet/overflow');
    const prose = await read(GRAMMAR_PROSE_URI);
    expect(prose.contents[0]?.mimeType).toBe('text/markdown');
    expect(text(prose.contents[0])).toContain('#');
    const icons = JSON.parse(text((await read(CATALOG_ICONS_URI)).contents[0])) as {
      icons: string[];
    };
    expect(icons.icons).toContain('gt-mark');
    const blocks = plainCatalog();
    expect(blocks.blocks.heading).toMatchObject({
      type: 'heading',
      default: { id: 'example', type: 'heading' },
    });
    expect((blocks.blocks.heading as { schema?: { type?: string } }).schema?.type).toBe('object');
    expect(Object.keys(blocks.slideKinds)).toContain('opener');
    expect(Object.keys(blocks.layouts)).toContain('cols');
    expect(JSON.stringify(blocks)).not.toContain('"make"');
    const theme = await read(THEME_URI);
    expect(JSON.parse(text(theme.contents[0]))).toEqual({
      tokens: { light: { paper: '#ffffff' } },
    });
    const bare = fakeSource();
    delete bare.theme;
    await expect(read(THEME_URI, deps(bare))).rejects.toThrow(/no theme source/);
  });
});

describe('the round three resources (SPEC-3 3.7 g, 3.10)', () => {
  it('parses the comments, presence and inbox forms and refuses the rest', () => {
    expect(parseResourceUri('deck://gt-brand/comments')).toEqual({
      kind: 'comments',
      deckId: 'gt-brand',
    });
    expect(parseResourceUri('deck://comments')).toEqual({ kind: 'comments' });
    expect(parseResourceUri('deck://gt-brand/presence')).toEqual({
      kind: 'presence',
      deckId: 'gt-brand',
    });
    expect(parseResourceUri('deck://presence')).toEqual({ kind: 'presence' });
    expect(parseResourceUri('deck://inbox')).toEqual({ kind: 'inbox' });
    expect(parseResourceUri('deck://inbox/x')).toBeUndefined();
    expect(parseResourceUri('deck://gt-brand/comments/x')).toBeUndefined();
    expect(commentsUri('q4')).toBe('deck://q4/comments');
    expect(presenceUri('q4')).toBe('deck://q4/presence');
    expect(INBOX_URI).toBe('deck://inbox');
  });

  it('reads them from the source and refuses a server without them', async () => {
    const source: DeckSource = {
      deckId: 'gt-brand',
      manifest: async () => ({}),
      slides: async () => [],
      slide: async () => undefined,
      latestRender: async () => undefined,
      latestSheet: async () => undefined,
      comments: async () => ({ threads: [{ id: 't1' }], commentsRevision: 4, total: 1 }),
      presence: async () => ({ deckId: 'gt-brand', others: [] }),
      inbox: async () => ({ notifications: [], unread: 0 }),
    };
    const deps: ReadDeps = {
      source,
      readFile: async () => new Uint8Array(),
      readJson: async () => ({}),
    };
    const comments = await readResource(
      'deck://gt-brand/comments',
      { kind: 'comments', deckId: 'gt-brand' },
      deps,
    );
    expect(JSON.parse(text(comments.contents[0]))).toMatchObject({ commentsRevision: 4 });
    const presence = await readResource('deck://presence', { kind: 'presence' }, deps);
    expect(JSON.parse(text(presence.contents[0]))).toMatchObject({ deckId: 'gt-brand' });
    const inbox = await readResource('deck://inbox', { kind: 'inbox' }, deps);
    expect(JSON.parse(text(inbox.contents[0]))).toEqual({ notifications: [], unread: 0 });
    await expect(
      readResource('deck://other/comments', { kind: 'comments', deckId: 'other' }, deps),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    const bare: ReadDeps = {
      ...deps,
      source: { ...source, comments: undefined, presence: undefined, inbox: undefined },
    };
    await expect(readResource('deck://inbox', { kind: 'inbox' }, bare)).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});
