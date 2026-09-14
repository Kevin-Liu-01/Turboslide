import { createServerFn } from '@tanstack/react-start';
import type { ActionId } from '@turboslide/schema/actions';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { authorSchema } from '@turboslide/schema/mutations';
import type { Author } from '@turboslide/schema/mutations';

import { parseJsonInput } from './json';
import { deckDir } from './root';

/**
 * The editor's path to the actions whose handlers must run on the server (SPEC 7.1: one action
 * table, one implementation per action; MILESTONES M5 items 1 to 3): asset.add decodes and
 * dithers a picture with sharp, asset.dither re-runs the two-tone pipeline from the kept source,
 * material.capture renders a shader frame in headless Chromium, material.list reads the catalog.
 * The inspector dispatches them through the route's dispatcher like every other action; the
 * route's handler for these ids calls runDeckAction, which validates the input against the same
 * Zod schema the HTTP and MCP transports use and runs the studio's deck dispatcher
 * (server/actions.ts, the composition /api/actions serves), so a click and an agent call take
 * one path. The write the action ends in reaches the open editor over the store's watch channel
 * as an external revision by the same author (edit.$deckId.tsx adoptExternal). The boundary is
 * JSON text, as write.ts explains. createServerFn appears only under apps/studio/src/server.
 *
 * Round three (gslides-parity SPEC-3 6.2, 8.2, 8.3, 8.12): `authorize()` runs first with the
 * request's identity, the author is derived from the session (the body's author is the page's
 * fallback and is never trusted for its identity; a body author with no session behind it is
 * logged as `author.client` and refused in enforce mode), the `readOnly` switch and the writes
 * per minute per deck quota gate every mutating action, and the GS3 ids are typed against the
 * action table.
 */

/**
 * The window-transport actions the editor runs here rather than in the page: the asset and
 * material pipelines (sharp, the capture browser, the catalog), and the Google Slides parity
 * round's deck collection actions and slide.import (gslides-parity SPEC 7.5), which read other
 * decks and write the collection through @turboslide/store/hosted, the backend the page cannot
 * reach. The document write slide.import ends in comes back over the watch channel like an
 * asset.add.
 *
 * No action of the Google Slides parity round two joins this list (gslides-parity SPEC-2 section
 * 3; MILESTONES-2 "Integrator" item 2): block.setAlt writes the block or the asset record and
 * uploads nothing, diagram.insert instantiates a template that needs no asset, and slide.toCanvas
 * and the canvas writes measure in the editor's own hidden sheet on the window transport (SPEC-2
 * 1.3), never on the server.
 */
export const SERVER_SIDE_WINDOW_ACTIONS_GS2 = [
  'asset.add',
  'asset.dither',
  'material.capture',
  'material.list',
  'deck.list',
  'deck.copy',
  'deck.trash',
  'deck.restore',
  'deck.remove',
  'slide.import',
] as const satisfies readonly ActionId[];

/**
 * Round three (gslides-parity SPEC-3 11.3; MILESTONES-3 "The seams every builder types against"):
 * the comment ids except `comment.link` (which builds a URL in the page), the notification,
 * activity, share, publish, account and admin ids, the presence read, `sync.status`, and the
 * three server side picture writes. Every one needs the store, the identity records or Node
 * (sharp, the capture browser), so its window handler runs through runDeckAction; the dispatcher
 * answers NotImplementedError (501) for an id whose handler has not landed.
 */
export const SERVER_SIDE_WINDOW_ACTIONS_GS3 = [
  'presence.list',
  'sync.status',
  'comment.add',
  'comment.reply',
  'comment.edit',
  'comment.delete',
  'comment.resolve',
  'comment.reopen',
  'comment.assign',
  'comment.done',
  'comment.react',
  'comment.list',
  'comment.get',
  'notification.list',
  'notification.markRead',
  'notification.settings',
  'activity.list',
  'version.diff',
  'share.get',
  'share.setGeneralAccess',
  'share.createLink',
  'share.revokeLink',
  'share.rotateLink',
  'share.stop',
  'share.invite',
  'share.setRole',
  'share.remove',
  'share.setExpiry',
  'share.settings',
  'share.requestAccess',
  'share.listRequests',
  'share.respond',
  'share.transferOwnership',
  'share.acceptOwnership',
  'share.declineOwnership',
  'share.claim',
  'share.emailCollaborators',
  'deck.publish',
  'deck.unpublish',
  'account.decks',
  'account.tokens.create',
  'account.tokens.list',
  'account.tokens.revoke',
  'account.me',
  'account.setName',
  'account.setAvatar',
  'account.sessions',
  'account.signOut',
  'account.forget',
  'admin.assignOwner',
  'admin.flag',
  'picture.materialize',
  'slide.setBackgroundPicture',
  'slide.setBackgroundMaterial',
] as const satisfies readonly ActionId[];

/** The ids of SPEC-3 11.3 the action table does not hold; empty since merge 1, kept for the manifest. */
export const SERVER_SIDE_WINDOW_ACTIONS_PENDING: ReadonlyArray<string> = (
  SERVER_SIDE_WINDOW_ACTIONS_GS3 as readonly string[]
).filter((id) => !isActionId(id));

export const SERVER_SIDE_WINDOW_ACTIONS: ReadonlyArray<ActionId> = [
  ...SERVER_SIDE_WINDOW_ACTIONS_GS2,
  ...SERVER_SIDE_WINDOW_ACTIONS_GS3,
];

export type ServerSideWindowAction = ActionId;

export function isServerSideWindowAction(id: string): id is ServerSideWindowAction {
  return (SERVER_SIDE_WINDOW_ACTIONS as readonly string[]).includes(id);
}

/**
 * The share, comment, invite and access handlers the window API refuses without the page's nonce
 * (SPEC-3 0.32, 6.6; report 10 F47): the same list packages/agent/src/window/guard.ts holds, so
 * a script in the origin cannot loosen a deck's access as the victim through `window.turboslide`.
 */
export const NONCE_GUARDED_PREFIXES: ReadonlyArray<string> = [
  'share.',
  'comment.',
  'notification.',
  'admin.',
  'account.',
  'deck.publish',
  'deck.unpublish',
];

export type RunDeckActionInput = {
  deckId: string;
  action: ServerSideWindowAction;
  input: unknown;
  /** The page's author, kept as the fallback of a request with no session (a checkout's tests). */
  author: Author;
  force?: boolean;
};

type Parsed = {
  deckId: string;
  action: ServerSideWindowAction;
  input: unknown;
  author: Author;
  force: boolean;
};

const runDeckActionFn = createServerFn({ method: 'POST' })
  .validator((raw: string): Parsed => {
    const parsed = parseJsonInput<{
      deckId: unknown;
      action: unknown;
      input: unknown;
      author: unknown;
      force: unknown;
    }>(raw);
    if (typeof parsed.deckId !== 'string' || !SLUG_PATTERN.test(parsed.deckId))
      throw new TypeError('deckId must be a slug');
    if (
      typeof parsed.action !== 'string' ||
      !isActionId(parsed.action) ||
      !isServerSideWindowAction(parsed.action)
    ) {
      throw new TypeError(
        `action must be one of ${SERVER_SIDE_WINDOW_ACTIONS.join(', ')}; the rest run in the page`,
      );
    }
    const author = authorSchema.safeParse(parsed.author);
    if (!author.success) throw new TypeError('author must be { kind, name, runId? }');
    // the action's own schema runs in the dispatcher (InvalidInputError with the pointer); this
    // check only turns a malformed body into the 400 shape before the deck is opened
    const checked = ACTIONS[parsed.action].input.safeParse(parsed.input);
    if (!checked.success) {
      const first = checked.error.issues[0];
      throw new TypeError(
        `${parsed.action}: invalid input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
      );
    }
    return {
      deckId: parsed.deckId,
      action: parsed.action,
      input: checked.data,
      author: author.data,
      force: parsed.force === true,
    };
  })
  .handler(async ({ data }): Promise<string> => {
    // the security modules load inside the handler: this module is imported by the edit route for
    // its client stubs, and the client transform keeps a module level import that anything outside
    // a handler references, so authorize.ts (node:fs through root.ts), flags.ts, ratelimit.ts and
    // log.ts must never sit at the top of this file (measured: the editor failed at
    // packages/store/src/lease.ts "node:fs has been externalized" when they did)
    const {
      DeniedError,
      authorFor,
      authorize,
      authorizeMode,
      capabilityForAction,
      denialBody,
      identityLabel,
      requestContext,
    } = await import('./authorize');
    const { assertFlag } = await import('./flags');
    const { logSecurityEvent } = await import('./log');
    const { assertQuota, tierOf } = await import('./ratelimit');
    // authorize() first (gslides-parity SPEC-3 6.2, 11.5 R3) with the request's identity: in
    // shadow mode a denial is logged and the call proceeds; in enforce mode it is refused with
    // the body of 6.2. The author is the session's; the body's author is the fallback of a
    // request with no session behind it, logged so the shadow week shows how often that happens.
    const ctx = await requestContext();
    const capability = capabilityForAction(data.action);
    if (capability !== null) {
      const decision = await authorize(ctx, data.deckId, capability, {
        action: data.action,
        transport: 'window',
      });
      if (!decision.ok) throw new DeniedError(decision.status, denialBody(decision, capability));
    }
    if (ctx.principal === null && ctx.agent === undefined) {
      logSecurityEvent({
        event: 'author.client',
        deckId: data.deckId,
        action: data.action,
        transport: 'window',
        reason: data.author.kind,
        shadow: authorizeMode() === 'shadow',
      });
      if (authorizeMode() === 'enforce')
        throw new DeniedError(
          401,
          denialBody({ ok: false, status: 401, code: 'unauthorized' }, capability ?? 'read'),
        );
    }
    const author = authorFor(ctx, data.author);
    if (ACTIONS[data.action].mutates) {
      // the read only switch and the writes per minute per deck quota (SPEC-3 8.3, 8.12)
      const identity = identityLabel(ctx) ?? 'anonymous';
      await assertFlag('readOnly', { identity, deckId: data.deckId, action: data.action });
      await assertQuota('writesPerMinutePerDeck', {
        identity,
        tier: tierOf(ctx),
        deckId: data.deckId,
        action: data.action,
        transport: 'window',
      });
    }
    // loaded here, not at the top: the route imports this module for its client stubs, and the
    // dispatcher's graph (the render worker client, the capture browser, the MCP server) must not
    // enter the browser's dependency optimizer (measured: the dev server failed on vite's
    // fsevents binary when the import was static; the production build tree-shakes it either way)
    const { deckDispatcher } = await import('./actions');
    const { dispatcher } = await deckDispatcher(data.deckId);
    const output = await dispatcher.dispatch(data.action, data.input, {
      author,
      deckDir: deckDir(data.deckId),
      ...(data.force ? { force: true } : {}),
    });
    return JSON.stringify(output ?? null);
  });

/** Runs one of the server-side window actions over a deck and returns the action's output. */
export async function runDeckAction(input: RunDeckActionInput): Promise<unknown> {
  return JSON.parse(await runDeckActionFn({ data: JSON.stringify(input) })) as unknown;
}
