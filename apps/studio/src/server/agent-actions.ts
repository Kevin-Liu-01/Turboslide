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
 */

/**
 * The window-transport actions the editor runs here rather than in the page: the asset and
 * material pipelines (sharp, the capture browser, the catalog), and the Google Slides parity
 * round's deck collection actions and slide.import (gslides-parity SPEC 7.5), which read other
 * decks and write the collection through @turboslide/store/hosted, the backend the page cannot
 * reach. The document write slide.import ends in comes back over the watch channel like an
 * asset.add.
 */
export const SERVER_SIDE_WINDOW_ACTIONS = [
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

export type ServerSideWindowAction = (typeof SERVER_SIDE_WINDOW_ACTIONS)[number];

export function isServerSideWindowAction(id: string): id is ServerSideWindowAction {
  return (SERVER_SIDE_WINDOW_ACTIONS as readonly string[]).includes(id);
}

export type RunDeckActionInput = {
  deckId: string;
  action: ServerSideWindowAction;
  input: unknown;
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
    // loaded here, not at the top: the route imports this module for its client stubs, and the
    // dispatcher's graph (the render worker client, the capture browser, the MCP server) must not
    // enter the browser's dependency optimizer (measured: the dev server failed on vite's
    // fsevents binary when the import was static; the production build tree-shakes it either way)
    const { deckDispatcher } = await import('./actions');
    const { dispatcher } = await deckDispatcher(data.deckId);
    const output = await dispatcher.dispatch(data.action, data.input, {
      author: data.author,
      deckDir: deckDir(data.deckId),
      ...(data.force ? { force: true } : {}),
    });
    return JSON.stringify(output ?? null);
  });

/** Runs one of the server-side window actions over a deck and returns the action's output. */
export async function runDeckAction(input: RunDeckActionInput): Promise<unknown> {
  return JSON.parse(await runDeckActionFn({ data: JSON.stringify(input) })) as unknown;
}
