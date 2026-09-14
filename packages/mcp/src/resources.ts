// The deck:// resources (SPEC 7.3): the manifest, one slide, the latest render of a slide in a
// theme as image content, the latest contact sheet with its cell map, the current findings, and
// the deck-independent references (the grammar, the block and icon catalogs, the theme tokens).
// URI grammar, with the deck id first where the resource belongs to one deck:
//
//   deck://<deckId>/manifest             deck.json
//   deck://<deckId>/slides/<slideId>     one slide file
//   deck://render/<slideId>/<theme>      the latest render PNG (image content)
//   deck://sheet/<theme>                 the latest contact sheet PNG plus its cell map
//   deck://sheet/<theme>/map             the cell map alone
//   deck://lint/<deckId>                 Finding[] from a fresh lint through lint.run
//   deck://<deckId>/comments             the comment threads with their anchors resolved (comment.list)
//   deck://<deckId>/presence             the roster of the deck's room (presence.list)
//   deck://inbox                         the caller's notifications (notification.list)
//   deck://manifest, deck://slides/<slideId>, deck://lint, deck://comments, deck://presence
//                                        the same for the bound deck
//   deck://grammar, deck://grammar/prose, deck://catalog/blocks, deck://catalog/icons, deck://theme
//
// The words manifest, slides, render, sheet, lint, grammar, catalog, theme, comments, presence and
// inbox are reserved in the first segment, so a deck id equal to one of them is addressed through
// the bound-deck forms. The comments, presence and inbox resources are round three's (gslides-parity
// SPEC-3 3.7 g, 3.10); a server declares `resources: { subscribe: true, listChanged: true }` and
// sends `notifications/resources/updated` for a subscribed URI when the source reports a change
// (fs.watch over stdio, the room's stream hosted).
import type {
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/types.js';
import { generateGrammar } from '@turboslide/agent/generate/grammar';
import { CATALOG, LAYOUT_CATALOG, SLIDE_KIND_CATALOG } from '@turboslide/schema/catalog';
import { ICON_COLORS, ICON_NAMES } from '@turboslide/schema/icons';
import { rulesInOrder } from '@turboslide/schema/rules';
import { z } from 'zod';
import { toJsonSchema } from './tools.ts';

export type Theme = 'light' | 'dark';
export const THEMES: ReadonlyArray<Theme> = ['light', 'dark'];

export const RESERVED_HOSTS = [
  'manifest',
  'slides',
  'render',
  'sheet',
  'lint',
  'grammar',
  'catalog',
  'theme',
  'comments',
  'presence',
  'inbox',
] as const;

export type ParsedResource =
  | { kind: 'manifest'; deckId?: string }
  | { kind: 'slide'; deckId?: string; slideId: string }
  | { kind: 'render'; slideId: string; theme: Theme }
  | { kind: 'sheet'; theme: Theme; part: 'image' | 'map' }
  | { kind: 'lint'; deckId?: string }
  | { kind: 'grammar'; part: 'rules' | 'prose' }
  | { kind: 'catalog'; which: 'blocks' | 'icons' }
  | { kind: 'theme' }
  | { kind: 'comments'; deckId?: string }
  | { kind: 'presence'; deckId?: string }
  | { kind: 'inbox' };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isTheme(value: string | undefined): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Parses a deck:// URI into its resource, or undefined when it names none. */
export function parseResourceUri(uri: string): ParsedResource | undefined {
  const match = /^deck:\/\/([^/?#]+)(?:\/([^?#]*))?$/.exec(uri);
  if (match === null) return undefined;
  const host = match[1] ?? '';
  const segments = (match[2] ?? '').split('/').filter((part) => part.length > 0);
  switch (host) {
    case 'manifest':
      return segments.length === 0 ? { kind: 'manifest' } : undefined;
    case 'slides':
      return segments.length === 1 && SLUG.test(segments[0] ?? '')
        ? { kind: 'slide', slideId: segments[0] ?? '' }
        : undefined;
    case 'render': {
      const [slideId, theme] = segments;
      if (segments.length !== 2 || slideId === undefined || !SLUG.test(slideId) || !isTheme(theme))
        return undefined;
      return { kind: 'render', slideId, theme };
    }
    case 'sheet': {
      const [theme, part] = segments;
      if (!isTheme(theme)) return undefined;
      if (segments.length === 1) return { kind: 'sheet', theme, part: 'image' };
      if (segments.length === 2 && part === 'map') return { kind: 'sheet', theme, part: 'map' };
      return undefined;
    }
    case 'lint':
      if (segments.length === 0) return { kind: 'lint' };
      return segments.length === 1 && SLUG.test(segments[0] ?? '')
        ? { kind: 'lint', deckId: segments[0] ?? '' }
        : undefined;
    case 'grammar':
      if (segments.length === 0) return { kind: 'grammar', part: 'rules' };
      return segments.length === 1 && segments[0] === 'prose'
        ? { kind: 'grammar', part: 'prose' }
        : undefined;
    case 'catalog':
      if (segments.length !== 1) return undefined;
      if (segments[0] === 'blocks' || segments[0] === 'icons')
        return { kind: 'catalog', which: segments[0] };
      return undefined;
    case 'theme':
      return segments.length === 0 ? { kind: 'theme' } : undefined;
    case 'comments':
      return segments.length === 0 ? { kind: 'comments' } : undefined;
    case 'presence':
      return segments.length === 0 ? { kind: 'presence' } : undefined;
    case 'inbox':
      return segments.length === 0 ? { kind: 'inbox' } : undefined;
    default: {
      if (!SLUG.test(host)) return undefined;
      if (segments.length === 1 && segments[0] === 'manifest')
        return { kind: 'manifest', deckId: host };
      if (segments.length === 1 && segments[0] === 'comments')
        return { kind: 'comments', deckId: host };
      if (segments.length === 1 && segments[0] === 'presence')
        return { kind: 'presence', deckId: host };
      if (segments.length === 2 && segments[0] === 'slides' && SLUG.test(segments[1] ?? ''))
        return { kind: 'slide', deckId: host, slideId: segments[1] ?? '' };
      return undefined;
    }
  }
}

export function manifestUri(deckId: string): string {
  return `deck://${deckId}/manifest`;
}

export function slideUri(deckId: string, slideId: string): string {
  return `deck://${deckId}/slides/${slideId}`;
}

export function renderUri(slideId: string, theme: Theme): string {
  return `deck://render/${slideId}/${theme}`;
}

export function sheetUri(theme: Theme): string {
  return `deck://sheet/${theme}`;
}

export function sheetMapUri(theme: Theme): string {
  return `deck://sheet/${theme}/map`;
}

export function lintUri(deckId: string): string {
  return `deck://lint/${deckId}`;
}

export function commentsUri(deckId: string): string {
  return `deck://${deckId}/comments`;
}

export function presenceUri(deckId: string): string {
  return `deck://${deckId}/presence`;
}

export const INBOX_URI = 'deck://inbox';

export const GRAMMAR_URI = 'deck://grammar';
export const GRAMMAR_PROSE_URI = 'deck://grammar/prose';
export const CATALOG_BLOCKS_URI = 'deck://catalog/blocks';
export const CATALOG_ICONS_URI = 'deck://catalog/icons';
export const THEME_URI = 'deck://theme';

/** The templates served on resources/templates/list. */
export const RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'deck://{deckId}/manifest',
    name: 'Manifest',
    description: 'deck.json: sections, assets, revision and timestamps',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'deck://{deckId}/slides/{slideId}',
    name: 'Slide',
    description: 'One slide file as stored',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'deck://render/{slideId}/{theme}',
    name: 'Render',
    description: 'The latest render of a slide in light or dark, from the last deck_render',
    mimeType: 'image/png',
  },
  {
    uriTemplate: 'deck://sheet/{theme}',
    name: 'Contact sheet',
    description: 'The latest contact sheet in a theme plus its cell map (cell boxes to slide ids)',
    mimeType: 'image/png',
  },
  {
    uriTemplate: 'deck://sheet/{theme}/map',
    name: 'Contact sheet map',
    description: 'The cell map of the latest contact sheet in a theme',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'deck://lint/{deckId}',
    name: 'Lint',
    description: 'The current findings from a fresh lint of every slide in both layers',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'deck://{deckId}/comments',
    name: 'Comments',
    description:
      'The comment threads with their anchors resolved against the current document; subscribe for updates',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'deck://{deckId}/presence',
    name: 'Collaborators',
    description:
      'The roster of the room with the computed mark per participant; subscribe for updates',
    mimeType: 'application/json',
  },
];

export type SlideRow = { id: string; n: number; title: string };

/** The fixed resources of a bound deck, for resources/list: the references, the manifest, the lint report and every slide. */
export function staticResources(deck: {
  id: string;
  slides: ReadonlyArray<SlideRow>;
  /** True when the source answers the round three resources (SPEC-3 3.10). */
  comments?: boolean;
  presence?: boolean;
  inbox?: boolean;
}): Resource[] {
  const out: Resource[] = [
    {
      uri: manifestUri(deck.id),
      name: 'Manifest',
      description: `deck.json of ${deck.id}`,
      mimeType: 'application/json',
    },
    {
      uri: lintUri(deck.id),
      name: 'Lint',
      description: `The current findings of ${deck.id}`,
      mimeType: 'application/json',
    },
    {
      uri: GRAMMAR_URI,
      name: 'Grammar rules',
      description: 'The lint rule table as JSON (SPEC 7.7)',
      mimeType: 'application/json',
    },
    {
      uri: GRAMMAR_PROSE_URI,
      name: 'Grammar',
      description: 'The deck grammar as prose: slide kinds, layouts, block types, rules',
      mimeType: 'text/markdown',
    },
    {
      uri: CATALOG_BLOCKS_URI,
      name: 'Block catalog',
      description:
        'Every block type, slide kind and layout with its JSON Schema and a default instance',
      mimeType: 'application/json',
    },
    {
      uri: CATALOG_ICONS_URI,
      name: 'Icon catalog',
      description: 'The sprite symbols (63 Heroicons plus gt-mark) and the semantic colors',
      mimeType: 'application/json',
    },
    {
      uri: THEME_URI,
      name: 'Theme',
      description: 'The gt-ink-paper tokens and sheet geometry',
      mimeType: 'application/json',
    },
  ];
  for (const theme of THEMES) {
    out.push({
      uri: sheetUri(theme),
      name: `Contact sheet (${theme})`,
      description: `The latest ${theme} contact sheet with its cell map`,
      mimeType: 'image/png',
    });
  }
  if (deck.comments === true) {
    out.push({
      uri: commentsUri(deck.id),
      name: 'Comments',
      description: `The comment threads of ${deck.id} with their anchors resolved`,
      mimeType: 'application/json',
    });
  }
  if (deck.presence === true) {
    out.push({
      uri: presenceUri(deck.id),
      name: 'Collaborators',
      description: `The roster of ${deck.id}`,
      mimeType: 'application/json',
    });
  }
  if (deck.inbox === true) {
    out.push({
      uri: INBOX_URI,
      name: 'Notifications',
      description: 'The notifications of the caller',
      mimeType: 'application/json',
    });
  }
  for (const slide of deck.slides) {
    out.push({
      uri: slideUri(deck.id, slide.id),
      name: `${slide.n} ${slide.title}`,
      description: `Slide ${slide.n} of ${deck.id}`,
      mimeType: 'application/json',
    });
  }
  return out;
}

/** What the server reads resources from; the CLI implements it over the deck directory and .turboslide/. */
export type DeckSource = {
  deckId: string;
  manifest: () => Promise<unknown>;
  slides: () => Promise<SlideRow[]>;
  slide: (slideId: string) => Promise<unknown | undefined>;
  /** The latest render of a slide in a theme: the PNG path and its record, or undefined before a render. */
  latestRender: (
    slideId: string,
    theme: Theme,
  ) => Promise<{ image: string; record: unknown } | undefined>;
  /** The latest contact sheet in a theme: the PNG and its cell map paths, or undefined before a sheet. */
  latestSheet: (theme: Theme) => Promise<{ image: string; map: string } | undefined>;
  /** The theme tokens for deck://theme; the tokens live in @turboslide/theme, so the caller supplies them. */
  theme?: () => unknown;
  /** The comment threads with their anchors resolved (comment.list), for deck://<id>/comments. */
  comments?: () => Promise<unknown>;
  /** The roster of the room (presence.list), for deck://<id>/presence. */
  presence?: () => Promise<unknown>;
  /** The caller's notifications (notification.list), for deck://inbox. */
  inbox?: () => Promise<unknown>;
  /**
   * Reports the resource URIs whose contents changed (a checkpoint, a comment write, an inbox
   * record): `fs.watch` on a checkout, the room's stream hosted. The return value stops watching.
   * The server sends `notifications/resources/updated` for the subscribed ones (SPEC-3 3.7 g).
   */
  subscribe?: (onChange: (uris: string[]) => void) => () => void;
};

export class ResourceNotFoundError extends Error {
  constructor(uri: string, detail?: string) {
    super(
      detail === undefined
        ? `Resource not found: ${uri}`
        : `Resource not found: ${uri} (${detail})`,
    );
    this.name = 'ResourceNotFoundError';
  }
}

function jsonContents(uri: string, value: unknown): ReadResourceResult['contents'] {
  return [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }];
}

/** The catalog entries with their Zod schemas as JSON Schema and their factories dropped. */
export function plainCatalog(): {
  blocks: Record<string, unknown>;
  slideKinds: Record<string, unknown>;
  layouts: Record<string, unknown>;
} {
  const plain = (entry: Record<string, unknown>, id: string): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (value instanceof z.ZodType) out[key] = toJsonSchema(value, 'input');
      else if (key === 'make' && typeof value === 'function')
        out.default = (value as (id: string) => unknown)(id);
      else if (typeof value !== 'function') out[key] = value;
    }
    return out;
  };
  const map = (catalog: Record<string, unknown>, id: string): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(catalog).map(([key, entry]) => [
        key,
        plain(entry as Record<string, unknown>, id),
      ]),
    );
  return {
    blocks: map(CATALOG, 'example'),
    slideKinds: map(SLIDE_KIND_CATALOG, 'example'),
    layouts: map(LAYOUT_CATALOG, 'example'),
  };
}

export type ReadDeps = {
  source: DeckSource;
  /** Reads a file the source named (a render or a sheet) as bytes. */
  readFile: (path: string) => Promise<Uint8Array>;
  /** Reads a JSON file the source named (a cell map). */
  readJson: (path: string) => Promise<unknown>;
  /** A fresh lint of every slide through lint.run; undefined while lint.run has no handler. */
  lint?: () => Promise<unknown>;
};

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

/** Reads one parsed resource; throws ResourceNotFoundError when the deck, slide or file is absent. */
export async function readResource(
  uri: string,
  parsed: ParsedResource,
  deps: ReadDeps,
): Promise<ReadResourceResult> {
  const { source } = deps;
  const requireBound = (deckId: string | undefined): void => {
    if (deckId !== undefined && deckId !== source.deckId)
      throw new ResourceNotFoundError(uri, `this server is bound to deck ${source.deckId}`);
  };
  switch (parsed.kind) {
    case 'manifest':
      requireBound(parsed.deckId);
      return { contents: jsonContents(uri, await source.manifest()) };
    case 'slide': {
      requireBound(parsed.deckId);
      const slide = await source.slide(parsed.slideId);
      if (slide === undefined) throw new ResourceNotFoundError(uri, `no slide ${parsed.slideId}`);
      return { contents: jsonContents(uri, slide) };
    }
    case 'render': {
      const render = await source.latestRender(parsed.slideId, parsed.theme);
      if (render === undefined)
        throw new ResourceNotFoundError(uri, 'no render yet; call deck_render first');
      const bytes = await deps.readFile(render.image);
      return {
        contents: [
          { uri, mimeType: 'image/png', blob: base64(bytes) },
          {
            uri: `${uri}/record`,
            mimeType: 'application/json',
            text: JSON.stringify(render.record, null, 2),
          },
        ],
      };
    }
    case 'sheet': {
      const sheet = await source.latestSheet(parsed.theme);
      if (sheet === undefined)
        throw new ResourceNotFoundError(uri, 'no contact sheet yet; call deck_sheet first');
      const map = await deps.readJson(sheet.map);
      const mapContent = {
        uri: sheetMapUri(parsed.theme),
        mimeType: 'application/json',
        text: JSON.stringify(map, null, 2),
      };
      if (parsed.part === 'map') return { contents: [mapContent] };
      const bytes = await deps.readFile(sheet.image);
      return { contents: [{ uri, mimeType: 'image/png', blob: base64(bytes) }, mapContent] };
    }
    case 'lint': {
      requireBound(parsed.deckId);
      if (deps.lint === undefined)
        throw new ResourceNotFoundError(uri, 'lint.run has no handler on this server');
      return { contents: jsonContents(uri, await deps.lint()) };
    }
    case 'grammar':
      if (parsed.part === 'prose')
        return { contents: [{ uri, mimeType: 'text/markdown', text: generateGrammar() }] };
      return { contents: jsonContents(uri, { rules: rulesInOrder() }) };
    case 'catalog':
      if (parsed.which === 'icons')
        return { contents: jsonContents(uri, { icons: ICON_NAMES, colors: ICON_COLORS }) };
      return { contents: jsonContents(uri, plainCatalog()) };
    case 'theme': {
      if (source.theme === undefined)
        throw new ResourceNotFoundError(uri, 'this server has no theme source');
      return { contents: jsonContents(uri, source.theme()) };
    }
    case 'comments': {
      requireBound(parsed.deckId);
      if (source.comments === undefined)
        throw new ResourceNotFoundError(uri, 'comment.list has no handler on this server');
      return { contents: jsonContents(uri, await source.comments()) };
    }
    case 'presence': {
      requireBound(parsed.deckId);
      if (source.presence === undefined)
        throw new ResourceNotFoundError(uri, 'presence.list has no handler on this server');
      return { contents: jsonContents(uri, await source.presence()) };
    }
    case 'inbox': {
      if (source.inbox === undefined)
        throw new ResourceNotFoundError(uri, 'notification.list has no handler on this server');
      return { contents: jsonContents(uri, await source.inbox()) };
    }
  }
}
