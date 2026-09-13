// GET /api/agent on a running instance (SPEC 3.4, 7.4, 7.5; MILESTONES M4 item 1): the generated
// manifest (generate/manifest.ts, committed as packages/agent/generated/manifest.json) with the
// facts only the instance knows: which actions have a handler here, which are declared for a later
// milestone, whether a token is required, which studio pages are attached, and the window API's
// action list so describe().actions and this document agree by construction (the window-api spec
// asserts it). Framework free; the studio route calls runtimeManifest with its dispatcher.
import { ACTIONS, actionsInOrder, actionsOn } from '@turboslide/schema/actions';
import type { ActionId } from '@turboslide/schema/actions';

import type { Dispatcher } from '../dispatch.ts';
import { generateDescribe, READY_EVENT, WINDOW_GLOBAL } from '../generate/describe.ts';
import { generateManifest } from '../generate/manifest.ts';
import type { Manifest } from '../generate/manifest.ts';
import { authSummary } from './auth.ts';
import type { Env } from './auth.ts';
import type { StudioSession } from './sessions.ts';

export type RuntimeManifest = Omit<Manifest, 'actions'> & {
  version: string;
  /**
   * The window API's action list (describe().actions), the M1 shape of this endpoint that the
   * window-api spec compares with the page; the generated manifest's grouped ids move to
   * actionsByGroup.
   */
  actions: string[];
  actionsByGroup: Record<string, string[]>;
  window: { global: string; event: string; actions: string[] };
  /** Actions with a handler on this instance, in table order. */
  implemented: ActionId[];
  /** Declared actions this instance answers 501 for, with the milestone that lands them. */
  notImplemented: { id: ActionId; milestone: string; transports: readonly string[] }[];
  /** Actions reachable over POST /api/actions/<id> here. */
  http: { implemented: ActionId[]; pending: ActionId[] };
  auth: { required: boolean; env: string; localhostOpen: boolean };
  sessions: Pick<StudioSession, 'id' | 'deckId' | 'owner' | 'actions' | 'lastSeenAt'>[];
  defaultDeck?: string;
  generatedAt: string;
};

export type RuntimeManifestOptions = {
  dispatcher: Dispatcher;
  env?: Env;
  version?: string;
  sessions?: readonly StudioSession[];
  defaultDeck?: string;
  now?: () => string;
};

export function runtimeManifest(options: RuntimeManifestOptions): RuntimeManifest {
  const generated = generateManifest();
  const implemented = options.dispatcher.implemented();
  const has = new Set<ActionId>(implemented);
  const notImplemented = actionsInOrder()
    .filter((spec) => !has.has(spec.id))
    .map((spec) => ({ id: spec.id, milestone: spec.milestone, transports: spec.transports }));
  const http = actionsOn('http').map((spec) => spec.id);
  const { actions: byGroup, ...rest } = generated;
  const windowList = generateDescribe().actions;
  return {
    ...rest,
    version: options.version ?? '0.0.0',
    actions: windowList,
    actionsByGroup: byGroup,
    window: {
      global: WINDOW_GLOBAL,
      event: READY_EVENT,
      actions: windowList,
    },
    implemented,
    notImplemented,
    http: {
      implemented: http.filter((id) => has.has(id)),
      pending: http.filter((id) => !has.has(id)),
    },
    auth: authSummary(options.env ?? process.env),
    sessions: (options.sessions ?? []).map((session) => ({
      id: session.id,
      deckId: session.deckId,
      owner: session.owner,
      actions: session.actions,
      lastSeenAt: session.lastSeenAt,
    })),
    ...(options.defaultDeck !== undefined ? { defaultDeck: options.defaultDeck } : {}),
    generatedAt: (options.now ?? (() => new Date().toISOString()))(),
  };
}

/** The M1 shape of GET /api/agent, kept beside the manifest: describe().actions for the window API. */
export function windowActions(): string[] {
  return generateDescribe().actions;
}

/** True when an http action's handler is expected on this instance by its milestone. */
export function expectedByMilestone(
  id: ActionId,
  current: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'GS1' | 'GS2',
): boolean {
  // GS1 and GS2 are the Google Slides parity rounds, landed after M6 (docs/gslides-parity/MILESTONES.md, MILESTONES-2.md)
  const order = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'GS1', 'GS2'];
  return order.indexOf(ACTIONS[id].milestone) <= order.indexOf(current);
}
