// The MCP server over the action table (SPEC 7.3). It is a wrapper: tools come from deriveTools
// over the dispatcher the transport hands in, every call goes through dispatcher.dispatch (which
// validates the input against the action's Zod schema and the output against its output schema),
// resources read from a DeckSource, and the one prompt is deck_review. The low-level Server is
// used rather than McpServer so the tool list is exactly the derivation, with the JSON Schema
// from z.toJSONSchema and an outputSchema on every tool.
import { readFile } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { Author } from '@turboslide/schema/mutations';
import { DECK_REVIEW_PROMPT, deckReviewPrompt } from './prompts.ts';
import {
  RESOURCE_TEMPLATES,
  ResourceNotFoundError,
  parseResourceUri,
  readResource,
  staticResources,
} from './resources.ts';
import type { DeckSource } from './resources.ts';
import { deriveTools, imagePathsOf, toolError, toolResult } from './tools.ts';
import type { ToolEntry, ToolImage } from './tools.ts';

export const SERVER_NAME = 'turboslide';

/** The default cap on images in one tool result; the rest are reachable through deck://render. */
export const DEFAULT_MAX_IMAGES = 12;

/** JSON-RPC error code for a missing resource (MCP specification, resources/read). */
export const RESOURCE_NOT_FOUND = -32002;

export type McpServerOptions = {
  dispatcher: Dispatcher;
  source: DeckSource;
  author: Author;
  /** The deck directory the dispatcher's handlers work on; passed through in the action context. */
  deckDir?: string;
  version?: string;
  maxImages?: number;
  /**
   * Reads the bytes of an image an action output names. The CLI reads files; the studio's render
   * outputs name facade URLs (/api/render/...) and its reader asks the worker for the PNG.
   */
  readImage?: (path: string) => Promise<Uint8Array>;
  /** Diagnostics, written to stderr by the CLI. */
  log?: (line: string) => void;
};

export type CreatedServer = {
  server: Server;
  /** The tools served, in table order. */
  tools: ToolEntry[];
  /** The action context every dispatch receives. */
  context: ActionContext;
};

const INSTRUCTIONS = [
  'Turboslide MCP: one deck, edited as a typed document. Read deck_get_info first, then deck_get_slide for the slide you touch and keep its revision.',
  'Every write takes the baseRevision you read and returns the normalized result; a stale revision is refused with a 409 error body that carries the current revision, so re-read and retry once.',
  'Render tools return the images as image content beside the JSON; the latest render of any slide is also deck://render/<slideId>/<theme>, and the contact sheet with its cell map is deck://sheet/<theme>.',
  'deck_lint returns Finding[]; a severity 3 finding blocks the ship step. The deck_review prompt holds the judge lens instructions.',
].join(' ');

async function loadImages(
  paths: ReadonlyArray<string>,
  maxImages: number,
  readImage: (path: string) => Promise<Uint8Array>,
  log?: (line: string) => void,
): Promise<{ images: ToolImage[]; omitted: number; missing: string[] }> {
  const images: ToolImage[] = [];
  const missing: string[] = [];
  for (const path of paths.slice(0, maxImages)) {
    try {
      const bytes = await readImage(path);
      images.push({ data: Buffer.from(bytes).toString('base64'), mimeType: 'image/png' });
    } catch (error) {
      missing.push(path);
      log?.(
        `mcp: image ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { images, omitted: Math.max(0, paths.length - maxImages), missing };
}

/** Builds the server; connect it with serveStdio (or any SDK transport). */
export function createMcpServer(options: McpServerOptions): CreatedServer {
  const { dispatcher, source, log } = options;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const readImage =
    options.readImage ?? (async (path: string) => new Uint8Array(await readFile(path)));
  const context: ActionContext = { author: options.author, deckDir: options.deckDir };
  const tools = deriveTools((id) => dispatcher.has(id));
  const byName = new Map(tools.map((entry) => [entry.name, entry]));

  const server = new Server(
    { name: SERVER_NAME, title: 'Turboslide', version: options.version ?? '0.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((entry) => entry.tool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const entry = byName.get(request.params.name);
    if (entry === undefined)
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool "${request.params.name}"`);
    const args = request.params.arguments ?? {};
    try {
      const output = await dispatcher.dispatch(entry.action, args, context);
      if (!entry.returnsImages) return toolResult(entry, output);
      const loaded = await loadImages(
        imagePathsOf(entry.action, output),
        maxImages,
        readImage,
        log,
      );
      const notes: string[] = [];
      if (loaded.omitted > 0)
        notes.push(
          `${loaded.omitted} image(s) omitted beyond the first ${maxImages}; read deck://render/<slideId>/<theme> for the rest.`,
        );
      if (loaded.missing.length > 0)
        notes.push(
          `${loaded.missing.length} image file(s) could not be read: ${loaded.missing.join(', ')}`,
        );
      return toolResult(
        entry,
        output,
        loaded.images,
        notes.length > 0 ? notes.join(' ') : undefined,
      );
    } catch (error) {
      log?.(
        `mcp: ${entry.action} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return toolError(entry.action, error);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: staticResources({ id: source.deckId, slides: await source.slides() }),
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: RESOURCE_TEMPLATES,
  }));

  const lint = dispatcher.has('lint.run')
    ? () => dispatcher.dispatch('lint.run', { slideIds: 'all', layers: 'both' }, context)
    : undefined;

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const parsed = parseResourceUri(uri);
    if (parsed === undefined) throw new McpError(RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
    try {
      return await readResource(uri, parsed, {
        source,
        lint,
        readFile: readImage,
        readJson: async (path) => JSON.parse(await readFile(path, 'utf8')) as unknown,
      });
    } catch (error) {
      if (error instanceof ResourceNotFoundError)
        throw new McpError(RESOURCE_NOT_FOUND, error.message);
      throw error;
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: [DECK_REVIEW_PROMPT] }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== DECK_REVIEW_PROMPT.name)
      throw new McpError(ErrorCode.InvalidParams, `Unknown prompt "${request.params.name}"`);
    const manifest = (await source.manifest()) as { id?: unknown; revision?: unknown } | null;
    const revision = typeof manifest?.revision === 'number' ? manifest.revision : 0;
    try {
      return deckReviewPrompt(request.params.arguments ?? {}, { id: source.deckId, revision });
    } catch (error) {
      if (error instanceof RangeError) throw new McpError(ErrorCode.InvalidParams, error.message);
      throw error;
    }
  });

  return { server, tools, context };
}
