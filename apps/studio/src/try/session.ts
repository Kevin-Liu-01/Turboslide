import type { DialogId } from '@turboslide/chrome/editor-shell';
import { TAB_ONLY } from '@turboslide/chrome/menus/strings';
import { labelFor } from '@turboslide/identity/labels';

import { bindEditorBackend } from '../editor/backend';
import { createEditorController } from '../editor/controller';
import type { EditorController } from '../editor/controller';
import type { EditorDeck } from '../server/write';
import { createRunner } from './agents';
import type { AgentHandle, Runner } from './agents';
import { TRY_READY, framingWindow, isTryVisible, topWindow } from './frame';
import { heroDocument } from './hero-deck';
import type { AgentKey } from './script';
import { createTabBackend } from './tab-backend';
import type { TabPerson, TabRoom } from './tab-backend';
import { tryVisitor } from './visitor';
import type { TryVisitor } from './visitor';

/**
 * One visit of the live editor (docs/SITE.md C.1): the tab backend bound for the document, the
 * hero deck in a fresh tab room, the visitor under a generated label, Claude Code and Codex as
 * headless editor controllers on the same room (D4), the runner, and the frame protocol. Made once
 * by the /try page before the editor mounts.
 */

/** The dialogs that need the server (docs/SITE.md D10): opening one says the tab's sentence. */
export const TAB_ONLY_DIALOGS: readonly DialogId[] = [
  'open',
  'importSlides',
  'makeCopy',
  'share',
  'publish',
  'download',
  'downloadPdf',
  'downloadOptions',
  'saveAsTemplate',
  'tailor',
  'logo',
  'agentAccess',
  'imageByUrl',
  'signIn',
  'profile',
  'avatarBuilder',
];

export type TrySession = {
  payload: EditorDeck;
  visitor: TabPerson;
  room: TabRoom;
  runner: Runner;
  view: TryVisitor;
  /** EditorRoot's controller, once made */
  attachVisitor: (controller: EditorController) => void;
  /** starts the agents and the frame protocol; answers the disposer */
  start: () => () => void;
};

function randomHex(bytes: number): string {
  const out = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(out);
  return Array.from(out, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The agents of the hero, with the hues of the title's agents stack (components/site/copy.ts). */
export const TRY_AGENTS: Readonly<Record<AgentKey, TabPerson>> = {
  claude: {
    author: { kind: 'agent', name: 'Claude Code', principalId: 'agent:claude-code' },
    role: 'editor',
    trust: 'agent',
    hue: 6,
    brand: 'claude-code',
  },
  codex: {
    author: { kind: 'agent', name: 'Codex', principalId: 'agent:codex' },
    role: 'editor',
    trust: 'agent',
    hue: 3,
    brand: 'codex',
  },
};

export function createTrySession(options: { win: Window; still: boolean }): TrySession {
  const { win } = options;
  const deckId = `try-${randomHex(6)}`;
  const principalId = `anon_${globalThis.crypto.randomUUID()}`;
  const visitor: TabPerson = {
    author: { kind: 'human', name: labelFor(principalId), principalId },
    role: 'owner',
    trust: 'label',
    hue: 1,
  };
  const { backend, room, payloadFor } = createTabBackend({
    deckId,
    document: heroDocument(deckId),
    people: [visitor, TRY_AGENTS.claude, TRY_AGENTS.codex],
    tabOnly: {
      sentence: TAB_ONLY.sentence,
      dialogs: TAB_ONLY_DIALOGS,
      action: { label: TAB_ONLY.action, run: () => topWindow(win).location.assign('/new') },
    },
    openPage: (path, newTab) => {
      if (newTab) win.open(path, '_blank', 'noopener');
      else topWindow(win).location.assign(path);
    },
  });
  bindEditorBackend(backend);

  const controllers = new Map<AgentKey, EditorController>();
  const handleOf = (key: AgentKey): AgentHandle => {
    const person = TRY_AGENTS[key];
    const controller = createEditorController({
      deckId,
      author: person.author,
      payload: payloadFor(person),
      backend,
    });
    controllers.set(key, controller);
    const adapter = controller.editorAdapter();
    return {
      invoke: async (action, input) => {
        if (adapter.invoke === undefined) throw new Error('the editor adapter answers no action');
        return adapter.invoke(action, input);
      },
      present: (state) =>
        controller.reportPresence({
          slideId: state.slideId,
          pointer: state.pointer,
          selection: state.selection,
          drag: state.drag,
          pointerOn: true,
        }),
      document: () => controller.getSnapshot().document,
      revision: () => {
        const snap = controller.getSnapshot();
        return Math.max(snap.serverRevision, snap.document.deck.revision, snap.sync?.revision ?? 0);
      },
    };
  };
  const view = tryVisitor({ room, principalId, win });
  const runner = createRunner({
    agents: { claude: handleOf('claude'), codex: handleOf('codex') },
    visitor: view,
    reducedMotion: () => win.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  let visitorController: EditorController | null = null;

  /** the agents' first pose on the title slide: the poster's still, and the first live frame */
  const pose = (): void => {
    controllers.get('claude')?.reportPresence({
      slideId: 'title',
      pointer: { x: 1010, y: 520 },
      selection: { blockIds: ['lead'], caret: { blockId: 'lead', path: '/text', offset: 45 } },
      pointerOn: true,
    });
    controllers.get('codex')?.reportPresence({
      slideId: 'title',
      pointer: { x: 1180, y: 330 },
      selection: { blockIds: ['heading'] },
      pointerOn: true,
    });
  };

  const start = (): (() => void) => {
    for (const controller of controllers.values()) controller.start();
    const parent = framingWindow(win);
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== win.location.origin || event.source !== parent) return;
      if (isTryVisible(event.data)) runner.setOnScreen(event.data.visible);
    };
    const onVisibility = (): void => runner.setVisible(win.document.visibilityState === 'visible');
    win.addEventListener('message', onMessage);
    win.document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    /* ready once the editor drew its filmstrip and the visitor's roster holds both agents */
    let readyTimer: ReturnType<typeof setInterval> | undefined;
    const startedAt = Date.now();
    readyTimer = setInterval(() => {
      const roster = visitorController?.getSnapshot().roster ?? [];
      const agents = roster.filter((row) => row.kind === 'agent').length;
      const drawn = win.document.querySelector('.ts-filmstrip .ts-card') !== null;
      if ((drawn && agents >= 2) || Date.now() - startedAt > 10_000) {
        if (readyTimer !== undefined) clearInterval(readyTimer);
        readyTimer = undefined;
        pose();
        parent?.postMessage({ type: TRY_READY }, win.location.origin);
        if (!options.still) win.setTimeout(() => runner.start(), 1200);
      }
    }, 100);
    return () => {
      if (readyTimer !== undefined) clearInterval(readyTimer);
      runner.stop();
      win.removeEventListener('message', onMessage);
      win.document.removeEventListener('visibilitychange', onVisibility);
      view.dispose();
      for (const controller of controllers.values()) controller.stop();
      room.stop();
    };
  };

  return {
    payload: payloadFor(visitor),
    visitor,
    room,
    runner,
    view,
    attachVisitor(controller) {
      visitorController = controller;
      view.attach(controller);
    },
    start,
  };
}

let made: TrySession | null = null;

/**
 * The document's one session: React's development mode runs a state initializer twice, and the
 * backend binds once per document, so the /try page asks for the session here.
 */
export function trySession(options: { win: Window; still: boolean }): TrySession {
  made ??= createTrySession(options);
  return made;
}
