import type { DialogId } from '@turboslide/chrome/editor-shell';
import { TAB_ONLY } from '@turboslide/chrome/menus/strings';
import { assignHueSlot, hueFor, isHueSlot } from '@turboslide/identity/hues';
import type { HueSlot } from '@turboslide/identity/hues';
import { labelFor } from '@turboslide/identity/labels';

import { bindEditorBackend } from '../editor/backend';
import { createEditorController } from '../editor/controller';
import type { EditorController } from '../editor/controller';
import type { EditorDeck } from '../server/write';
import { createRunner } from './agents';
import type { AgentHandle, Runner } from './agents';
import { TRY_READY, framingWindow, isTryPress, isTryVisible, topWindow } from './frame';
import type { TryPressed } from './frame';
import { createGuests } from './guests';
import type { GuestHandle, Guests } from './guests';
import { HERO_ASSET_BASE, heroDocument } from './hero-deck';
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
  guests: Guests;
  /** a press on an avatar of the page's title (components/site/try-frame.ts `ts-try:press`) */
  press: (who: TryPressed) => void;
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

/**
 * The agents of the title that are not at work in the editor: pressed, each joins for a short
 * visit and leaves a comment on the slide the visitor is looking at (guests.ts), in the hue of
 * its avatar in the title.
 */
export const GUEST_AGENTS: Readonly<
  Record<'openclaw' | 'hermes', TabPerson & { comment: string }>
> = {
  openclaw: {
    author: { kind: 'agent', name: 'OpenClaw', principalId: 'agent:openclaw' },
    role: 'editor',
    trust: 'agent',
    hue: 2,
    brand: 'openclaw',
    comment: 'Checked this slide against the source data.',
  },
  hermes: {
    author: { kind: 'agent', name: 'Hermes', principalId: 'agent:hermes' },
    role: 'editor',
    trust: 'agent',
    hue: 4,
    brand: 'hermes',
    comment: 'Read this slide. No changes are needed.',
  },
};

/** The principal id of a person of the title's people stack, from their generated name. */
export function guestPrincipal(name: string): string {
  return `guest:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function createTrySession(options: { win: Window; still: boolean }): TrySession {
  const { win } = options;
  const deckId = `try-${randomHex(6)}`;
  const principalId = `anon_${globalThis.crypto.randomUUID()}`;
  /* the visitor's controller, once EditorRoot made it (attachVisitor) */
  let visitorController: EditorController | null = null;
  const visitor: TabPerson = {
    author: { kind: 'human', name: labelFor(principalId), principalId },
    role: 'owner',
    trust: 'label',
    hue: 1,
  };
  const { backend, room, payloadFor, join } = createTabBackend({
    deckId,
    document: heroDocument(deckId),
    assetBase: HERO_ASSET_BASE,
    people: [visitor, TRY_AGENTS.claude, TRY_AGENTS.codex],
    tabOnly: {
      sentence: TAB_ONLY.sentence,
      dialogs: TAB_ONLY_DIALOGS,
      action: { label: TAB_ONLY.action, run: () => topWindow(win).location.assign('/new') },
    },
    /* a page of this presentation (Print, the viewer, the presenter) reads it from the server,
       so it answers the sentence; any other page loads around the frame */
    openPage: (path, newTab) => {
      if (path.includes(`/${deckId}`)) {
        visitorController?.say(TAB_ONLY.sentence);
        return;
      }
      if (newTab) win.open(path, '_blank', 'noopener');
      else topWindow(win).location.assign(path);
    },
  });
  bindEditorBackend(backend);

  const controllers = new Map<AgentKey, EditorController>();
  /** a headless editor controller of one person on the tab room, the way the agents work */
  const controllerFor = (person: TabPerson) => {
    const controller = createEditorController({
      deckId,
      author: person.author,
      payload: payloadFor(person),
      backend,
    });
    const adapter = controller.editorAdapter();
    return {
      controller,
      invoke: async (action: string, input: unknown): Promise<unknown> => {
        if (adapter.invoke === undefined) throw new Error('the editor adapter answers no action');
        return adapter.invoke(action, input);
      },
      present: (state: Parameters<AgentHandle['present']>[0]): void =>
        controller.reportPresence({
          slideId: state.slideId,
          pointer: state.pointer,
          selection: state.selection,
          drag: state.drag,
          pointerOn: true,
        }),
    };
  };
  const handleOf = (key: AgentKey): AgentHandle => {
    const { controller, invoke, present } = controllerFor(TRY_AGENTS[key]);
    controllers.set(key, controller);
    return {
      invoke,
      present,
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
  /** the hue slots the room's live rows hold, as the visitor's roster tells them (1 to 6) */
  const heldHues = (): HueSlot[] =>
    (visitorController?.getSnapshot().roster ?? [])
      .map((row) => row.hueSlot + 1)
      .filter((slot): slot is HueSlot => isHueSlot(slot));
  /** a guest of the title's stacks: a person under their generated name, or OpenClaw or Hermes */
  const guestPeople = new Map<string, TabPerson>();
  const guestFor = (key: string): TabPerson | undefined => guestPeople.get(key);
  const guests = createGuests({
    join: (key): GuestHandle => {
      const person = guestFor(key);
      if (person === undefined) throw new RangeError(`${key} is not a guest of the title`);
      join(person);
      const { controller, invoke, present } = controllerFor(person);
      controller.start();
      return { invoke, present, leave: () => controller.stop() };
    },
    visitor: view,
    document: () => room.server.document(),
    open: () => !runner.state().paused,
    reducedMotion: () => win.matchMedia('(prefers-reduced-motion: reduce)').matches,
    onArrive: (key) => pulse(key),
  });

  /**
   * The press answer the page sees (docs/SITE.md B): the chip of the person or agent in the title
   * row and their pointer, caret flag or outline flash once in their hue; under reduced motion the
   * ring shows and fades without spreading and the pointer does not grow.
   */
  const pulse = (principalId: string, tries = 20): void => {
    const row = visitorController
      ?.getSnapshot()
      .roster.find((entry) => entry.principalId === principalId);
    if (row === undefined) {
      if (tries > 0) win.setTimeout(() => pulse(principalId, tries - 1), 100);
      return;
    }
    const still = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hue = isHueSlot(row.hueSlot + 1) ? hueFor(row.hueSlot + 1) : 'currentColor';
    const marked = [...win.document.querySelectorAll<HTMLElement>('[data-client]')].filter(
      (el) => el.dataset.client === row.clientId,
    );
    for (const el of marked) {
      if (typeof el.animate !== 'function') continue;
      if (el.classList.contains('ts-presence-chip'))
        el.animate(
          still
            ? [{ boxShadow: `0 0 0 3px ${hue}` }, { boxShadow: '0 0 0 3px transparent' }]
            : [{ boxShadow: `0 0 0 0 ${hue}` }, { boxShadow: '0 0 0 9px transparent' }],
          { duration: still ? 900 : 700, easing: 'ease-out' },
        );
      else if (!still) {
        const target = el.querySelector<SVGElement>('svg') ?? el;
        target.animate([{ scale: '1' }, { scale: '1.35' }, { scale: '1' }], {
          duration: 600,
          easing: 'ease-out',
        });
      }
    }
  };

  const press = (who: TryPressed): void => {
    if (who.kind === 'agent') {
      if (who.brand === 'claude-code' || who.brand === 'codex') {
        const key: AgentKey = who.brand === 'codex' ? 'codex' : 'claude';
        runner.nudge(key);
        pulse(TRY_AGENTS[key].author.principalId);
        return;
      }
      const guest = GUEST_AGENTS[who.brand];
      guestPeople.set(guest.author.principalId, guest);
      guests.visit({ key: guest.author.principalId, kind: 'agent', comment: guest.comment });
      return;
    }
    const principal = guestPrincipal(who.name);
    if (!guestPeople.has(principal))
      guestPeople.set(principal, {
        author: { kind: 'human', name: who.name, principalId: principal },
        role: 'editor',
        trust: 'label',
        hue: assignHueSlot(who.hue, heldHues()),
      });
    guests.visit({ key: principal, kind: 'person' });
  };

  /** the agents' first pose on the title slide: the poster's still, and the first live frame */
  const pose = (): void => {
    controllers.get('claude')?.reportPresence({
      slideId: 'title',
      pointer: { x: 820, y: 600 },
      selection: { blockIds: ['lead'], caret: { blockId: 'lead', path: '/text', offset: 45 } },
      pointerOn: true,
    });
    controllers.get('codex')?.reportPresence({
      slideId: 'title',
      pointer: { x: 1000, y: 420 },
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
      if (isTryPress(event.data)) press(event.data.who);
    };
    const onVisibility = (): void => runner.setVisible(win.document.visibilityState === 'visible');
    win.addEventListener('message', onMessage);
    win.document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    /* ready once the editor drew its filmstrip, every dithered picture drew its first frame (until
       then it shows its continuous source, dither-runtime.ts) and the visitor's roster holds both
       agents */
    let readyTimer: ReturnType<typeof setInterval> | undefined;
    const startedAt = Date.now();
    readyTimer = setInterval(() => {
      const roster = visitorController?.getSnapshot().roster ?? [];
      const agents = roster.filter((row) => row.kind === 'agent').length;
      const drawn = win.document.querySelector('.ts-filmstrip .ts-card') !== null;
      const dithered = [...win.document.querySelectorAll('[data-dither-state="live"]')].every(
        (root) => root.querySelector('canvas.picture-dither:not([hidden])') !== null,
      );
      if ((drawn && dithered && agents >= 2) || Date.now() - startedAt > 10_000) {
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
      guests.stop();
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
    guests,
    press,
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
