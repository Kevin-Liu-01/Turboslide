import { describe, expect, it } from 'vitest';

import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';

import { CHAPTER_FIELDS } from '../components/site/chapter-fields';
import { TRY_CHAPTERS } from '../components/site/try-frame';
import { fill, takesBase } from './agents';
import type { Runner } from './agents';
import { HERO_THEME, heroDocument } from './hero-deck';
import {
  SLIDESHOW_MS,
  STORY_SCRIPTS,
  STORY_TRANSITION,
  STORY_VISITS,
  createStory,
  isStorySlide,
} from './story';
import type { AgentScript } from './script';
import type { StoryVisit } from './story';

// The chapters after the hero (docs/SITE.md 5, "The chapters"): their scripts name actions the
// page API runs with inputs their schemas take, every slide a chapter adds carries the story's
// prefix, every `after` has the other agent's `signal`, and every action a section's glyph field
// names is one its chapter runs (components/site/chapter-fields.ts). The director pauses the
// hero's loop for a chapter and resumes it at rest, runs one runner a chapter, puts back what a
// chapter changed once its runner has stopped, hosts the third chapter's visits and steps the
// fourth chapter's slideshow, and moves one chapter at a time to the last one the page named.

const scripts = Object.entries(STORY_SCRIPTS);
/* the threads a chapter's comment opens, as the runner saves them for its later steps */
const THREAD = '01j9zzzzzzzzzzzzzzzzzzzzzz';
const saved = new Map<string, unknown>([
  ['lightThread', THREAD],
  ['leadThread', THREAD],
]);

describe("the story's scripts", () => {
  it('give every action of the table an input its schema takes', () => {
    for (const [chapter, script] of scripts)
      for (const task of Object.values(script).flat())
        for (const step of task.steps) {
          if (step.kind !== 'act') continue;
          expect(isActionId(step.action), step.action).toBe(true);
          if (!isActionId(step.action)) continue;
          expect(ACTIONS[step.action].transports, step.action).toContain('window');
          const filled = fill(step.input, 1, saved) as Record<string, unknown>;
          const input = takesBase(step.action) ? { ...filled, baseRevision: 3 } : filled;
          const parsed = ACTIONS[step.action].input.safeParse(input);
          expect(
            parsed.success,
            `chapter ${chapter}, ${task.name}: ${JSON.stringify(parsed.error?.issues)}`,
          ).toBe(true);
        }
  });

  it('add only slides the story can find again', () => {
    for (const [, script] of scripts)
      for (const task of Object.values(script).flat())
        for (const step of task.steps)
          if (step.kind === 'act' && step.action === 'slide.insert')
            expect(isStorySlide(fill(step.slide, 1, new Map()) as string), task.name).toBe(true);
  });

  it("are what each section's glyph field names", () => {
    const actionsOf = (script: AgentScript): Set<string> =>
      new Set(
        Object.values(script)
          .flat()
          .flatMap((task) =>
            task.steps.flatMap((step) => (step.kind === 'act' ? [step.action] : [])),
          ),
      );
    const ran: Record<string, Set<string>> = {
      agents: actionsOf(STORY_SCRIPTS[1]),
      features: actionsOf(STORY_SCRIPTS[2]),
      together: actionsOf(STORY_SCRIPTS[3]),
      /* the fourth chapter is the director's: the transition, then the slideshow it steps */
      present: new Set(['slide.transition', 'view.present', 'view.goto']),
    };
    for (const [id, field] of Object.entries(CHAPTER_FIELDS))
      for (const match of field.source.matchAll(/"action":"([A-Za-z.]+)"/g))
        expect(ran[id]?.has(match[1] ?? ''), `${id}: ${match[1]}`).toBe(true);
  });

  it('wait only on a signal the other agent gives', () => {
    for (const [chapter, script] of scripts) {
      const signals = new Map(
        Object.entries(script).map(([agent, tasks]) => [
          agent,
          new Set(
            tasks.flatMap((task) =>
              task.steps.flatMap((s) => (s.kind === 'signal' ? [s.signal] : [])),
            ),
          ),
        ]),
      );
      for (const [agent, tasks] of Object.entries(script))
        for (const task of tasks) {
          const after = task.after === undefined ? [] : [task.after].flat();
          const other = [...signals.entries()].filter(([key]) => key !== agent);
          for (const signal of after)
            expect(
              other.some(([, given]) => given.has(signal)),
              `chapter ${chapter}, ${task.name}: ${signal}`,
            ).toBe(true);
        }
    }
  });
});

/** A runner that records what the director asks of it. */
function fakeRunner(log: string[], script: AgentScript): Runner {
  const name = script === STORY_SCRIPTS[1] ? 'agents' : 'features';
  return {
    start: () => log.push(`start ${name}`),
    stop: () => {
      log.push(`stop ${name}`);
      return Promise.resolve();
    },
    pause: () => undefined,
    resume: () => undefined,
    setOnScreen: (on) => log.push(`${name} on screen ${on}`),
    setVisible: () => undefined,
    nudge: () => undefined,
    slideOf: () => null,
    state: () => ({
      loop: 1,
      tasks: { claude: '', codex: '' },
      writes: 0,
      presence: 0,
      paused: false,
      skipped: 0,
      errors: [],
    }),
  };
}

function harness() {
  const log: string[] = [];
  const timers = new Map<number, { run: () => void; at: number }>();
  let now = 0;
  let next = 1;
  let document: DeckDocument = heroDocument('try-test');
  let active = 'title';
  const visits: StoryVisit[] = [];
  const story = createStory({
    main: { pause: () => log.push('pause main'), resume: () => log.push('resume main') },
    runner: (script) => fakeRunner(log, script),
    tidy: {
      invoke: (action, input) => {
        log.push(`${action} ${JSON.stringify(input)}`);
        if (action === 'slide.remove') {
          const { slideId } = input as { slideId: string };
          const { [slideId]: _gone, ...slides } = document.slides;
          document = { ...document, slides };
        }
        if (action === 'deck.set')
          document = { ...document, deck: { ...document.deck, theme: HERO_THEME } };
        if (action === 'slide.transition') {
          const { transition } = input as { transition: unknown };
          const { transition: _was, ...deck } = document.deck as typeof document.deck & {
            transition?: unknown;
          };
          document = {
            ...document,
            deck: (transition === null ? deck : { ...deck, transition }) as typeof document.deck,
          };
        }
        return Promise.resolve({});
      },
      document: () => document,
      revision: () => 7,
    },
    visitor: {
      goto: (slideId) => {
        active = slideId;
        log.push(`goto ${slideId}`);
      },
      present: (on) => log.push(`present ${on}`),
      activeSlide: () => active,
    },
    visit: (visit) => visits.push(visit),
    hush: () => log.push('hush'),
    setTimeout: (run, ms) => {
      timers.set(next, { run, at: now + ms });
      return next++;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  });
  /** runs every timer due by `ms` from now, in order */
  const advance = (ms: number): void => {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].run();
    }
    now = until;
  };
  const addStorySlide = (id: string): void => {
    const title = document.slides['title'] as Slide;
    document = { ...document, slides: { ...document.slides, [id]: { ...title, id } } };
  };
  const setTheme = (theme: string): void => {
    document = { ...document, deck: { ...document.deck, theme } } as DeckDocument;
  };
  return { story, log, visits, advance, addStorySlide, setTheme, doc: () => document };
}

describe("the story's director", () => {
  it('pauses the hero for a chapter, runs its runner, and puts the deck back at rest', async () => {
    const h = harness();
    h.story.set(1);
    await h.story.settled();
    expect(h.log).toEqual(['hush', 'pause main', 'agents on screen true', 'start agents']);
    h.addStorySlide('story-light-1');
    h.setTheme('coral');
    h.story.set(0);
    await h.story.settled();
    expect(h.log.slice(4)).toEqual([
      'stop agents',
      'slide.remove {"slideId":"story-light-1","baseRevision":7}',
      'deck.set {"path":"/theme","value":"swiss","baseRevision":7}',
      'hush',
      'resume main',
    ]);
    expect(Object.keys(h.doc().slides).some(isStorySlide)).toBe(false);
    expect(h.story.chapter()).toBe(0);
  });

  it('starts the slideshow on the title, steps it, and ends it on leaving', async () => {
    const h = harness();
    h.story.set(4);
    await h.story.settled();
    expect(h.log).toEqual([
      'hush',
      'pause main',
      `slide.transition ${JSON.stringify({ transition: STORY_TRANSITION, baseRevision: 7 })}`,
      'goto title',
      'present true',
    ]);
    h.advance(SLIDESHOW_MS * 2);
    const order = h.doc().deck.sections.flatMap((section) => section.slideIds);
    expect(h.log.slice(5)).toEqual([`goto ${order[1]}`, `goto ${order[2]}`]);
    h.story.set(0);
    await h.story.settled();
    expect(h.log.slice(7)).toEqual([
      'present false',
      'slide.transition {"transition":null,"baseRevision":7}',
      'hush',
      'resume main',
    ]);
    h.advance(SLIDESHOW_MS * 3);
    expect(h.log).toHaveLength(11);
  });

  it('hosts the visits of the third chapter while the frame is on screen', async () => {
    const h = harness();
    h.story.set(3);
    await h.story.settled();
    expect(h.story.hosting()).toBe(true);
    h.advance(10_000);
    expect(h.visits).toEqual(STORY_VISITS);
    h.story.setOnScreen(false);
    expect(h.story.hosting()).toBe(false);
  });

  it('moves one chapter at a time to the last one named', async () => {
    const h = harness();
    h.story.set(1);
    await h.story.settled();
    h.story.set(2);
    h.story.set(4);
    await h.story.settled();
    expect(h.story.chapter()).toBe(4);
    expect(h.log.filter((line) => line.startsWith('start') || line.startsWith('stop'))).toEqual([
      'start agents',
      'stop agents',
    ]);
    expect(h.log.at(-1)).toBe('present true');
  });

  it('ignores a chapter outside the story', async () => {
    const h = harness();
    h.story.set(TRY_CHAPTERS + 1);
    h.story.set(-1);
    h.story.set(1.5);
    await h.story.settled();
    expect(h.log).toEqual([]);
  });
});
