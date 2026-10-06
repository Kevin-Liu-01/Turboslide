import { AGENTS, ANNOUNCE, HISTORY } from '../copy';
import { HOME_CHIPS } from '../chips.generated';
import type { ChipCommand, ChipId } from '../chips.generated';
import { NAME_MAX, spacedJson, splitWords } from '../panel-format';
import { historyTime } from './history';
import { looksOf, paintNextSteps, withLooks } from './next-steps';
import type { LiveContext } from './index';
import { finishBand } from './motion';
import type { HomeDeckState, HomeStore, Version } from './state';
import { addEntry, clearScreen, playStep } from './step';
import type { PlayableStep, Screen, StepHandle } from './step';

/**
 * Agents run the same actions (docs/LANDING.md 2.9, 3.6 A1 to A6; rows home.agents.*). V3's file,
 * the agents band's chunk: four chips run recorded commands on slide 5 above the console (2.9's
 * table), each a toggle, through `live/step.ts`'s `playStep`; the console's CLI, MCP and HTTP tabs
 * (a tablist with a roving tabindex); the typed line (`help`, the chips' commands with any customer
 * name, `version list`, `version restore <n>`). Every change goes through the store as the agent's,
 * so every band shows it and Version history writes its row. The answers are the CLI's, recorded on
 * the page deck by `scripts/home/run.ts`; the page substitutes the customer's name and the page
 * deck's revision, nothing else.
 */

/** The page's words of 2.9 (V1's copy table); a recorded version's restore row reads its number. */
const WORDS = {
  chips: AGENTS.chips,
  restored: HISTORY.restored,
  restoredVersion: HISTORY.restoredVersion,
  rewroteRow: HISTORY.rewroteRow,
  skipped: HISTORY.slideSkipped,
  unskipped: HISTORY.slideUnskipped,
  changed: ANNOUNCE.slideChanged,
};

/* ---------------------------------------------------------------------------------------------
 * The band */

const TABS = ['cli', 'mcp', 'http'] as const;
type Tab = (typeof TABS)[number];
const CHIP_IDS: readonly ChipId[] = ['tailor', 'turn', 'row', 'skip'];
const SLIDE5 = 'next-steps' as HomeDeckState['order'][number];

/** Whether the deck skips slide 5 (the store's `skipped`, V2's: a record of slide ids). */
function skipsSlide5(state: HomeDeckState): boolean {
  const skipped = state.skipped as unknown;
  if (Array.isArray(skipped)) return skipped.includes(SLIDE5);
  return (skipped as Readonly<Record<string, true>> | undefined)?.[SLIDE5] === true;
}

/** The deck with slide 5 skipped or shown again, in the store's shape. */
function withSkip(state: HomeDeckState, on: boolean): HomeDeckState {
  const skipped = state.skipped as unknown;
  if (Array.isArray(skipped)) {
    const rest = skipped.filter((id) => id !== SLIDE5);
    return {
      ...state,
      skipped: (on ? [...rest, SLIDE5] : rest) as unknown as HomeDeckState['skipped'],
    };
  }
  const next = { ...(skipped as Record<string, true>) };
  if (on) next[SLIDE5] = true;
  else delete next[SLIDE5];
  return { ...state, skipped: next as unknown as HomeDeckState['skipped'] };
}

/** Which way each chip goes next on the deck as it stands (2.9: a second press toggles). */
function chipOn(state: HomeDeckState, chip: ChipId): boolean {
  switch (chip) {
    case 'tailor':
      return state.customer !== HOME_CHIPS.chipCustomer;
    case 'turn':
      return !looksOf(state).turned;
    case 'row':
      return !looksOf(state).rewritten;
    case 'skip':
      return !skipsSlide5(state);
  }
}

/** The page deck's revision: the recorded one and one for every version made on the page. */
function revisionOf(store: HomeStore): number {
  return (
    HOME_CHIPS.restRevision + Math.max(0, store.versions().length - HOME_CHIPS.versions.length)
  );
}

/** Two argument lists are one command when every word matches, a JSON value by its value. */
function sameWords(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((word, i) => {
    const other = b[i] as string;
    if (word === other) return true;
    try {
      return JSON.stringify(JSON.parse(word)) === JSON.stringify(JSON.parse(other));
    } catch {
      return false;
    }
  });
}

/** The ISO time of a version made on the page, as `version list` prints the CLI's. */
const isoOf = (at: number): string => new Date(at).toISOString();

export function startAgents(ctx: LiveContext): void {
  const { band, store } = ctx;
  const tablist = band.querySelector<HTMLElement>('[data-transports]');
  const input = band.querySelector<HTMLInputElement>('[data-cmd]');
  const slideOf = (): HTMLElement | null =>
    band.querySelector<HTMLElement>(`[data-home-slides][data-slide="${SLIDE5}"]`);
  const sheetOf = (): HTMLElement | null => {
    const slide = slideOf();
    return slide?.closest<HTMLElement>('.ts-home-sheet') ?? slide?.parentElement ?? null;
  };
  const chips = new Map<ChipId, HTMLButtonElement>();
  for (const button of band.querySelectorAll<HTMLButtonElement>('[data-chip]')) {
    const id = button.dataset['chip'] as ChipId;
    if (CHIP_IDS.includes(id)) chips.set(id, button);
  }
  if (tablist === null) return;

  /* ---------- the tabs (A7: a cut) ---------- */
  const tabs = new Map<Tab, HTMLElement>();
  const panels = new Map<Tab, HTMLElement>();
  for (const tab of tablist.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const key = (tab.dataset['transport'] ?? '').trim().toLowerCase() as Tab;
    if (!TABS.includes(key)) continue;
    tabs.set(key, tab);
    const panelId = tab.getAttribute('aria-controls');
    const panel = panelId === null ? null : document.getElementById(panelId);
    if (panel !== null) panels.set(key, panel);
  }
  /** each panel's two views; the document fills the CLI's (or leaves it for the chunk) */
  const views = new Map<Tab, Screen>();
  for (const key of TABS) {
    const panel = panels.get(key);
    if (panel === undefined) continue;
    let wide = panel.querySelector<HTMLElement>('[data-panel-text="wide"]');
    let narrow = panel.querySelector<HTMLElement>('[data-panel-text="narrow"]');
    if (wide === null || narrow === null) {
      wide = document.createElement('div');
      wide.className = 'ts-home-panel-text is-wide';
      wide.dataset['panelText'] = 'wide';
      narrow = document.createElement('div');
      narrow.className = 'ts-home-panel-text is-narrow';
      narrow.dataset['panelText'] = 'narrow';
      panel.replaceChildren(wide, narrow);
    }
    views.set(key, { wide, narrow });
  }
  const cli = views.get('cli');
  if (cli === undefined) return;
  const select = (key: Tab, focus: boolean): void => {
    for (const [name, tab] of tabs) {
      const on = name === key;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = panels.get(name);
      if (panel !== undefined) panel.hidden = !on;
    }
    if (focus) tabs.get(key)?.focus();
  };
  tablist.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLElement>('[role="tab"]');
    const key = [...tabs].find(([, el]) => el === tab)?.[0];
    if (key !== undefined) select(key, false);
  });
  tablist.addEventListener('keydown', (event) => {
    const order = TABS.filter((key) => tabs.has(key));
    const current = order.findIndex((key) => tabs.get(key) === document.activeElement);
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (current + 1) % order.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current - 1 + order.length) % order.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    else return;
    event.preventDefault();
    select(order[next] as Tab, true);
  });

  /* ---------- the requests on the MCP and HTTP tabs (2.9 "Panel content") ---------- */
  type Sent = { mcp: string; http: string };
  const sent: Sent[] = [];
  /** The request of a recorded command with the page's names and revision in its JSON values. */
  const requestOf = (
    request: { mcp: ChipCommand['mcp']; http: ChipCommand['http'] },
    names: readonly (readonly [string, string])[],
    revision: number,
    extra: Record<string, unknown> = {},
  ): Sent => {
    const swap = (value: Readonly<Record<string, unknown>>): Record<string, unknown> => {
      const out = JSON.parse(
        JSON.stringify(value, (_key, v: unknown) =>
          typeof v === 'string' ? names.reduce((s, [from, to]) => (s === from ? to : s), v) : v,
        ),
      ) as Record<string, unknown>;
      if ('baseRevision' in out) out['baseRevision'] = revision;
      return { ...out, ...extra };
    };
    return {
      mcp: `tools/call ${request.mcp.name} ${spacedJson(swap(request.mcp.arguments))}`,
      http: `${request.http.method} ${request.http.path} ${spacedJson(swap(request.http.body))}`,
    };
  };
  const paintRequests = (): void => {
    for (const tab of ['mcp', 'http'] as const) {
      const view = views.get(tab);
      if (view === undefined) continue;
      clearScreen(view);
      for (const request of sent.slice(-4)) addEntry(view, request[tab]);
      addEntry(view, AGENTS.panel.requestOnly);
    }
  };

  /* ---------- the console's screens ---------- */
  /** `version list` as the CLI prints it: the recorded four, then one line per version made here. */
  const versionLines = (): string[] => {
    const all = store.versions();
    const recorded = HOME_CHIPS.versions;
    const lines = recorded
      .slice(0, Math.min(recorded.length, all.length))
      .map((v) => versionLine(v));
    all.slice(recorded.length).forEach((v: Version, i) => {
      lines.push(
        versionLine({
          n: v.n,
          revision: HOME_CHIPS.restRevision + i + 1,
          createdAt: isoOf(v.at),
          author: v.author === 'agent' ? HOME_CHIPS.versionList.authorAgent : 'you',
          what: v.words,
        }),
      );
    });
    return lines;
  };
  /** One typed command and its answer: the screen scrolls as a terminal does. */
  const printTyped = (echo: string, answer: readonly string[]): void => {
    select('cli', false);
    addEntry(cli, echo);
    for (const line of answer) addEntry(cli, line);
    const first = answer[0];
    if (first !== undefined) ctx.announce(first);
  };
  /* at rest: `version list` with its recorded answer (2.9), unless the document drew a screen */
  if ((cli.wide?.childElementCount ?? 0) === 0) {
    addEntry(cli, `$ ${HOME_CHIPS.versionList.command}`);
    for (const line of versionLines()) addEntry(cli, line);
  }
  sent.push(requestOf(HOME_CHIPS.list, [], revisionOf(store)));
  paintRequests();

  /* ---------- the chips ---------- */
  let playing: { chip: ChipId | null; handle: StepHandle } | null = null;
  const paintChips = (state: HomeDeckState): void => {
    for (const [chip, button] of chips) {
      const on = chipOn(state, chip);
      const label =
        chip === 'tailor'
          ? WORDS.chips.tailor(on ? HOME_CHIPS.chipCustomer : HOME_CHIPS.customer)
          : chip === 'turn'
            ? on
              ? WORDS.chips.turn
              : WORDS.chips.straighten
            : chip === 'row'
              ? on
                ? WORDS.chips.row
                : WORDS.chips.putBack
              : on
                ? WORDS.chips.skip
                : WORDS.chips.unskip;
      // the words beside the chip's glyph (DESIGN.md 8.8), else the chip's own text
      const text = button.querySelector('.ts-chip-label') ?? button;
      if (text.textContent !== label) text.textContent = label;
      if (playing?.chip === chip) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
  };
  /** The slide's place in the deck, for the row's words. */
  const placeOf = (state: HomeDeckState): number => state.order.indexOf(SLIDE5) + 1;
  /** The command a chip runs on the deck as it stands, its answer and its change. */
  const chipStep = (
    chip: ChipId,
    state: HomeDeckState,
    words: string[] | null,
  ): { step: PlayableStep; commit: (() => void) | null; request: Sent } | null => {
    const on = chipOn(state, chip);
    const rec = HOME_CHIPS.commands[chip][on ? 'on' : 'off'];
    const revision = revisionOf(store);
    const absent = !state.order.includes(SLIDE5);
    /* the names: the recording's tailor names become the deck's (2.9 "Tailor for Initech") */
    const from = state.customer;
    const to = on ? HOME_CHIPS.chipCustomer : HOME_CHIPS.customer;
    const names: (readonly [string, string])[] =
      rec.names === null ? [] : [[rec.names.from, from] as const, [rec.names.to, to] as const];
    let command = rec.command;
    if (rec.names !== null)
      command = `turboslide tailor --replace=${quoted(from)}=${quoted(words?.[1] ?? to)}`;
    const target = words?.[1] ?? to;
    let answer: readonly string[];
    if (absent) {
      const recorded = HOME_CHIPS.absent[chip];
      answer = (on ? recorded.on : (recorded.off ?? recorded.on)).map((line) =>
        line.replace(/revision \d+/, `revision ${revision + 1}`),
      );
    } else {
      const freeform = state.canvas[SLIDE5] === true || chip === 'turn';
      const lines = freeform && rec.answerFreeform !== null ? rec.answerFreeform : rec.answer;
      answer = lines.map((line) => line.replace(/revision \d+/, `revision ${revision + 1}`));
    }
    const refused = absent && HOME_CHIPS.absent[chip].refused;
    const request = requestOf(
      rec,
      rec.names === null ? [] : [[rec.names.from, from] as const, [rec.names.to, target] as const],
      revision,
    );
    void names;
    const typedChars = rec.names === null ? rec.typedChars : command.length;
    const step: PlayableStep = {
      command,
      typedChars,
      answer,
      landing: refused ? { kind: 'cut' } : rec.landing,
    };
    if (refused) return { step, commit: null, request };
    const n = placeOf(state);
    const commit = (): void => {
      switch (chip) {
        case 'tailor':
          store.commit({
            band: 'agents',
            author: 'agent',
            words: HISTORY.tailored(target),
            undo: null,
            next: (s) => ({ ...s, customer: target }),
          });
          return;
        case 'turn': {
          const deg = on ? HOME_CHIPS.turnTo : 0;
          store.commit({
            band: 'agents',
            author: 'agent',
            words: HISTORY.turned('the title', n, deg),
            undo: null,
            slide: SLIDE5,
            /* the CLI arranges the slide by hand in the same write, and it stays so (v3.md) */
            next: (s) => ({
              ...withLooks(s, { turned: on }),
              canvas: { ...s.canvas, [SLIDE5]: true },
            }),
          });
          return;
        }
        case 'row':
          store.commit({
            band: 'agents',
            author: 'agent',
            words: WORDS.rewroteRow(n),
            undo: null,
            slide: SLIDE5,
            next: (s) => withLooks(s, { rewritten: on }),
          });
          return;
        case 'skip':
          store.commit({
            band: 'agents',
            author: 'agent',
            words: on ? WORDS.skipped(n) : WORDS.unskipped(n),
            undo: null,
            slide: SLIDE5,
            next: (s) => withSkip(s, on),
          });
      }
    };
    return { step, commit, request };
  };

  /** What the ring travels to after a chip's change: the block it changed, or the whole slide. */
  const changedOf = (chip: ChipId): HTMLElement | null => {
    const slide = slideOf();
    if (slide === null) return null;
    if (chip === 'skip') return slide;
    if (chip === 'row')
      return (
        slide.querySelector<HTMLElement>(`[data-run="rows/items/${HOME_CHIPS.row.index}/value"]`)
          ?.parentElement ?? slide
      );
    return slide.querySelector<HTMLElement>('[data-block="h"]') ?? slide;
  };
  /** The row's value cell, where Rewrite a Row's words land at 24 ms (A5). */
  const rowCell = (): HTMLElement | null =>
    slideOf()?.querySelector<HTMLElement>(
      `[data-run="rows/items/${HOME_CHIPS.row.index}/value"]`,
    ) ?? null;

  const run = (
    chip: ChipId | null,
    built: NonNullable<ReturnType<typeof chipStep>>,
    echoOnly = false,
  ): void => {
    const sheet = sheetOf();
    finishBand('agents');
    select('cli', false);
    if (sheet === null || echoOnly) {
      printTyped(`$ ${built.step.command}`, built.step.answer);
      built.commit?.();
      return;
    }
    const state = store.get();
    const n = placeOf(state);
    const handle = playStep({ terminal: cli, sheet }, built.step, {
      band: 'agents',
      track: true,
      land: () => {
        built.commit?.();
        sent.push(built.request);
        paintRequests();
        ctx.announce(built.step.answer[0] ?? '');
        if (built.commit === null) return null;
        if (chip === 'row') return rowCell() ?? changedOf(chip);
        return chip === null ? slideOf() : changedOf(chip);
      },
      onEnd: () => {
        if (playing?.handle === handle) playing = null;
        paintChips(store.get());
        if (built.commit !== null && n > 0) ctx.announce(WORDS.changed(n));
      },
    });
    playing = { chip, handle };
    paintChips(store.get());
  };

  /* the page's input guard (motion.ts) finishes a running step before a press reaches its chip, so
     the press that lands it is read here first: it only finishes (2.9) */
  let pressedWhilePlaying = false;
  const notePress = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest('[data-chip]') !== null)
      pressedWhilePlaying = playing !== null;
  };
  window.addEventListener('pointerdown', notePress, true);
  window.addEventListener('keydown', notePress, true);
  for (const [chip, button] of chips)
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const finishing = playing !== null || pressedWhilePlaying;
      pressedWhilePlaying = false;
      if (finishing) {
        playing?.handle.finish();
        return;
      }
      const built = chipStep(chip, store.get(), null);
      if (built !== null) run(chip, built);
    });

  /* any other input on the band finishes its running step first (3.8) */
  const interrupt = (event: Event): void => {
    if (playing === null) return;
    if (event.target instanceof Element && event.target.closest('[data-chip]') !== null) return;
    if (event instanceof KeyboardEvent && (event.key === 'Tab' || event.key === 'Shift')) return;
    playing.handle.finish();
  };
  band.addEventListener('pointerdown', interrupt, true);
  band.addEventListener('keydown', interrupt, true);

  /* ---------- the typed line (2.9 "The typed line") ---------- */
  const recalled: string[] = [];
  let recall = 0;
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const line = input.value;
      input.value = '';
      if (line.trim() === '') return;
      recalled.push(line);
      recall = recalled.length;
      typedLine(line);
    } else if (event.key === 'ArrowUp' && recalled.length > 0) {
      event.preventDefault();
      recall = Math.max(0, recall - 1);
      input.value = recalled[recall] ?? '';
    } else if (event.key === 'ArrowDown' && recalled.length > 0) {
      event.preventDefault();
      recall = Math.min(recalled.length, recall + 1);
      input.value = recalled[recall] ?? '';
    }
  });

  const typedLine = (line: string): void => {
    if (playing !== null) playing.handle.finish();
    const trimmed = line.trim();
    const echo = /^turboslide(\s|$)/.test(trimmed) ? `$ ${trimmed}` : `$ turboslide ${trimmed}`;
    const split = splitWords(trimmed);
    if (!split.ok) return printTyped(echo, [AGENTS.panel.unclosedQuote]);
    const words = split.words[0] === 'turboslide' ? split.words.slice(1) : split.words;
    const state = store.get();
    const refuse = (): void => printTyped(echo, [HOME_CHIPS.refusal]);
    if (
      words.length === 0 ||
      (words.length === 1 && ['help', '--help', '-h'].includes(words[0] as string))
    )
      return printTyped(echo, HOME_CHIPS.help);
    const revision = revisionOf(store);

    if (words[0] === 'version' && words[1] === 'list' && words.length === 2) {
      sent.push(requestOf(HOME_CHIPS.list, [], revision));
      paintRequests();
      return printTyped(echo, versionLines());
    }
    if (words[0] === 'version' && words[1] === 'restore' && words.length === 3) {
      const n = Number(words[2]);
      const all = store.versions();
      const version = Number.isInteger(n) ? all.find((v) => v.n === n) : undefined;
      if (version === undefined) return printTyped(echo, HOME_CHIPS.restore.absent);
      sent.push(requestOf(HOME_CHIPS.restore, [], revision, { n }));
      paintRequests();
      printTyped(echo, [`restored version ${n}: revision ${revision + 1}`]);
      /* a recorded version has no time of its own: its row names its number (v2.md R11) */
      store.restore(
        n,
        'agent',
        version.recorded ? WORDS.restoredVersion(n) : WORDS.restored(historyTime(version.at)),
        'agents',
      );
      return;
    }

    if (words[0] === 'tailor') {
      const pair =
        words.length === 2 && (words[1] as string).startsWith('--replace=')
          ? (words[1] as string).slice('--replace='.length)
          : null;
      const eq = pair === null ? -1 : pair.indexOf('=');
      if (pair === null || eq <= 0 || eq === pair.length - 1) return refuse();
      const from = pair.slice(0, eq);
      const to = pair.slice(eq + 1);
      if (to.length > NAME_MAX) return printTyped(echo, [AGENTS.panel.longName]);
      /* a name the deck does not hold: the CLI writes nothing and prints the revision it read */
      if (from !== state.customer)
        return printTyped(
          echo,
          HOME_CHIPS.tailorAbsent.map((l) => l.replace(/revision \d+/, `revision ${revision}`)),
        );
      if (to === from) return refuse();
      const built = chipStep('tailor', state, ['tailor', to]);
      if (built === null) return refuse();
      /* the typed name is the agent's: the chip's step with the visitor's words */
      return run('tailor', built);
    }

    for (const chip of CHIP_IDS) {
      if (chip === 'tailor') continue;
      for (const dir of ['on', 'off'] as const) {
        const rec = HOME_CHIPS.commands[chip][dir];
        if (!sameWords(words, rec.argv)) continue;
        /* a command the deck is already in prints the CLI's answer and changes nothing new */
        if ((dir === 'on') !== chipOn(state, chip)) {
          const answer = rec.answer.map((l) =>
            l.replace(/revision \d+/, `revision ${revision + 1}`),
          );
          return printTyped(echo, answer);
        }
        const built = chipStep(chip, state, null);
        if (built !== null) return run(chip, built);
      }
    }
    refuse();
  };

  /* the editor's skipped slide mark on the slide above (packages/chrome/src/Filmstrip.css 89 to
     110): the slide at 40 percent and the glyph in a paper square at its top right; every other
     slide 5 on the page is drawn by V2's paintSlides (v2.md) */
  const paintSkipped = (state: HomeDeckState): void => {
    const sheet = sheetOf();
    if (sheet === null) return;
    const skipped = skipsSlide5(state);
    let mark = sheet.querySelector<HTMLElement>(':scope > .ts-home-skip');
    if (skipped && mark === null) {
      mark = document.createElement('span');
      mark.className = 'ts-home-skip';
      mark.setAttribute('aria-hidden', 'true');
      mark.setAttribute('data-live-overlay', '');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', HOME_CHIPS.skipGlyph.viewBox);
      svg.setAttribute('fill', 'currentColor');
      svg.innerHTML = HOME_CHIPS.skipGlyph.body;
      mark.append(svg);
      sheet.append(mark);
    } else if (!skipped) mark?.remove();
    sheet.toggleAttribute('data-skipped', skipped);
    /* version 1 restored: slide 5 has left the deck, and its place keeps the sheet's crosses */
    slideOf()?.toggleAttribute('data-agent-absent', !state.order.includes(SLIDE5));
  };

  /* every change: the chips' labels and slide 5's looks wherever slide 5 is drawn */
  store.subscribe((state) => {
    paintNextSteps(ctx.root, state);
    paintSkipped(state);
    paintChips(state);
  });
  paintNextSteps(ctx.root, store.get());
  paintSkipped(store.get());
  paintChips(store.get());
}

/** A name as a shell needs it in `--replace=<from>=<to>` (quoted when it holds a shell character). */
function quoted(name: string): string {
  return /^[\w.@%+,:/-]+$/.test(name) ? name : `'${name.replace(/'/g, "'\\''")}'`;
}

/** One version line as `version list` prints it (apps/cli/src/commands/version.ts `formatVersion`). */
function versionLine(v: {
  n: number;
  revision: number;
  createdAt: string;
  author: string;
  what: string;
}): string {
  return `${String(v.n).padStart(3)}  r${String(v.revision).padEnd(5)} ${v.createdAt}  ${v.author.padEnd(18)} ${v.what}`;
}
