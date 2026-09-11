import { createFileRoute } from '@tanstack/react-router';
import { requestDeckId } from '@turboslide/agent/http/auth';
import { createMcpHttpHandler } from '@turboslide/mcp/http';
import type { McpHttpHandler } from '@turboslide/mcp/http';
import { createMcpServer } from '@turboslide/mcp/server';

import { DEFAULT_DECK, deckDispatcher, readRenderUrl } from '../server/actions';
import { agentAuthor, MCP_DEFAULT_AUTHOR, requireAgentAuth } from '../server/auth';

// /mcp (SPEC 7.3 "streamable HTTP at /mcp in the studio (M4) for hosted clients"; MILESTONES M4
// item 1): the same MCP server `turboslide mcp` serves over stdio, over the SDK's web-standard
// streamable HTTP transport (packages/mcp/src/http.ts). One MCP session is bound at initialize to
// the deck named by ?deck= (the instance default otherwise) and to the author of
// x-turboslide-author or ?author=; its tool list is the studio dispatcher's implemented actions
// on the mcp transport, plus deck_goto_slide while a studio page is attached to that deck
// (server/sessions.ts), and it runs in that page. The bearer token rule applies before the
// transport sees the request. The handler and its sessions live on globalThis so the dev
// server's module reloads keep open sessions.

const HANDLER = Symbol.for('turboslide.studio.mcp');

function handler(): McpHttpHandler {
  const holder = globalThis as unknown as Record<symbol, McpHttpHandler | undefined>;
  holder[HANDLER] ??= createMcpHttpHandler({
    authorize: (request) => requireAgentAuth(request),
    createServer: (request, sessionId) => {
      const deckId = requestDeckId(request, DEFAULT_DECK) ?? DEFAULT_DECK;
      const author = agentAuthor(request, MCP_DEFAULT_AUTHOR);
      const deck = deckDispatcher(deckId, { withView: true });
      const created = createMcpServer({
        dispatcher: deck.dispatcher,
        source: deck.source,
        author,
        deckDir: deck.store.dir,
        version: '0.0.0',
        readImage: readRenderUrl,
        log: (line) => console.error(`mcp http ${sessionId.slice(0, 8)}: ${line}`),
      });
      return {
        server: created.server,
        facts: {
          deckId,
          author: author.kind === 'agent' ? `agent:${author.runId ?? ''}` : author.name,
          tools: created.tools.map((entry) => entry.name),
          attached: deck.session?.id ?? null,
        },
      };
    },
    log: (line) => {
      if (process.env.TURBOSLIDE_AGENT_LOG === '1') console.error(line);
    },
  });
  return holder[HANDLER];
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handler().handle(request),
      POST: ({ request }) => handler().handle(request),
      DELETE: ({ request }) => handler().handle(request),
    },
  },
});

/** The open MCP sessions, for the manifest. */
export function mcpSessions(): ReturnType<McpHttpHandler['sessions']> {
  return handler().sessions();
}
