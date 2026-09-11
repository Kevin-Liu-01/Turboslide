import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

/**
 * The Start instance (SPEC 11 "server functions use createCsrfMiddleware()"; MILESTONES M4
 * item 1). The CSRF middleware validates Sec-Fetch-Site, Origin or Referer on every server
 * function request (the editor's writeDeck, watchDeck, the session functions), so a cross-site
 * page cannot drive the editor's store through a same-origin RPC; it is filtered to server
 * functions so the agent surface (/api/actions, /api/agent, /mcp), which agents call with no
 * Origin, stays a bearer-token surface (server/auth.ts). Without a start instance TanStack Start
 * applies a default CSRF middleware and warns; declaring it here makes the rule visible.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: (ctx) => ctx.handlerType === 'serverFn',
    }),
  ],
}));
