// How a round three command runs its action (gslides-parity SPEC-3 3.10, 12): through the same
// dispatcher `turboslide mcp` and the studio serve, so the input is validated by the action's
// schema, the output by its output schema, and the store, record and deck actions are the one
// implementation of every transport. With `--to <studio>` the action runs on the hosted studio
// over `POST /api/actions/<id>` with the saved credential (remote.ts) instead; the deck less
// account and admin actions run hosted only, and a call without `--to` says so.
import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { ActionId } from '@turboslide/schema/actions';
import { NotImplementedError } from '@turboslide/schema/errors';
import { registerAssetActions } from '@turboslide/materials/actions';
import type { FileStore } from '@turboslide/store/file-store';

import { flagBoolean, flagString } from './args.ts';
import { registerDeckActions } from './commands/deck.ts';
import type { CommandContext } from './context.ts';
import { UsageError } from './exit.ts';
import { registerRecordActions } from './record-actions.ts';
import { remoteAction } from './remote.ts';
import { registerStoreActions } from './store-actions.ts';
import { openStore, recordDeps, runAction, storeDeps } from './write.ts';

/** Every action a deck folder answers: the store actions, the record actions and the deck folder actions. */
export function localDispatcher(ctx: CommandContext, store: FileStore): Dispatcher {
  const dispatcher = createDispatcher();
  const deps = storeDeps(ctx, store);
  registerStoreActions(dispatcher, deps);
  registerRecordActions(dispatcher, recordDeps(ctx, store));
  registerDeckActions(dispatcher, { ...deps, decksDir: recordDeps(ctx, store).decksDir ?? '' });
  // picture.materialize runs the materials package's implementation (integrator, merge 2; b5.md
  // request 3): the dither pipeline of @turboslide/effects renders the variants and the files
  // reach the store through putAsset. The two background writes stay the record actions' (one
  // write per call, the file, url and upload forms through asset.add), so the materials
  // dispatcher is a private one and only that id is forwarded to it.
  const materials = createDispatcher();
  registerAssetActions(materials, {
    store,
    cwd: ctx.cwd,
    dispatch: (id, input, context) => dispatcher.dispatch(id, input, context),
    log: (line) => ctx.out.human(line),
  });
  dispatcher.register('picture.materialize', (input, context) =>
    materials.dispatch('picture.materialize', input, context),
  );
  return dispatcher;
}

/** The hosted studio a command names with `--to`, or undefined for the checkout. */
export function remoteOf(ctx: CommandContext): string | undefined {
  const to = flagString(ctx.args, 'to');
  return to === undefined || to === '' ? undefined : to;
}

/** The context every dispatch carries: the author, the deck folder, `--force`. */
export function actionContext(ctx: CommandContext, store?: FileStore): ActionContext {
  return {
    author: ctx.author,
    ...(store !== undefined ? { deckDir: store.dir } : {}),
    ...(flagBoolean(ctx.args, 'force') ? { force: true } : {}),
  };
}

export type RunOptions = {
  /** The deck id the hosted call names; the resolved deck's by default. */
  deck?: string;
  /** True for the account and admin actions that exist hosted only. */
  hostedOnly?: boolean;
};

/**
 * Runs an action for a command: on the checkout's deck through the local dispatcher, or on the
 * studio `--to` names. Errors follow runAction (a 409 prints the current record, exit 1).
 */
export async function runDeckAction<T = unknown>(
  ctx: CommandContext,
  id: ActionId,
  input: unknown,
  options: RunOptions = {},
): Promise<T> {
  const to = remoteOf(ctx);
  if (to !== undefined) {
    const deck = options.deck ?? (options.hostedOnly === true ? undefined : safeDeckId(ctx));
    return runAction(ctx, () =>
      remoteAction<T>(ctx, to, id, input, {
        ...(deck !== undefined ? { deck } : {}),
        ...(flagBoolean(ctx.args, 'force') ? { force: true } : {}),
      }),
    );
  }
  if (options.hostedOnly === true) {
    throw new UsageError(
      `${id} runs on a hosted studio: pass --to <url> (turboslide login --to <url> stores the key)`,
    );
  }
  const store = openStore(ctx);
  const dispatcher = localDispatcher(ctx, store);
  return runAction(ctx, async () => {
    try {
      return (await dispatcher.dispatch(id, input, actionContext(ctx, store))) as T;
    } catch (error) {
      if (error instanceof NotImplementedError) {
        throw new UsageError(
          `${id} has no handler on a checkout; pass --to <url> to run it on a hosted studio`,
        );
      }
      throw error;
    }
  });
}

function safeDeckId(ctx: CommandContext): string | undefined {
  try {
    return openStore(ctx).id;
  } catch {
    return undefined;
  }
}
