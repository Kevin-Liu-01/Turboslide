import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { createLiveAdapter } from '@turboslide/agent/window/adapter';
import type { StudioAdapter } from '@turboslide/agent/window/adapter';
import { registerStudioAutomation, viewerActionIds } from '@turboslide/agent/window/registry';
import type { ShellItem, ShellMode, ShellSection } from '@turboslide/chrome/shell-data';
import type { ShellState } from '@turboslide/chrome/shell-context';
import { usePtShell, usePtStage } from '@turboslide/chrome/shell-context';
import { ViewerShell } from '@turboslide/chrome/ViewerShell';
import type { ActionId } from '@turboslide/schema/actions';
import { BookView } from '@turboslide/viewer/BookView';
import { GridView } from '@turboslide/viewer/GridView';
import { pad2, trimTitle } from '@turboslide/viewer/model';
import type { ViewerDeck } from '@turboslide/viewer/model';
import { currentPlayIndex, playList, stepPlayIndex } from '@turboslide/viewer/present/presentModel';
import { Stage } from '@turboslide/viewer/Stage';
import {
  applyTheme,
  installThemeBridge,
  postTheme,
  readTheme,
  useTheme,
} from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import type { DeckPayload } from '../server/decks';
import { renderSlideImages } from '../server/render';
import { Slideshow } from './Slideshow';
import type { SlideshowState } from './Slideshow';
import { useMountEffect } from './useMountEffect';
import { useStudioSession } from './useStudioSession';

/**
 * The viewer page (SPEC 5.3, 5.5, 6.1): the chrome's ViewerShell around the
 * viewer's Stage, GridView and BookView, fed by the loader's rendered deck.
 * The same component serves /deck/:deckId and /embed/:deckId; `embed` turns
 * the frame protocol on (SPEC 5.3: the gt-theme and gt-deck-slide postMessage
 * protocol and the #NN hash contract are preserved; the studio writes
 * #s/<slideId> as the stable form).
 */
export type DeckViewerProps = {
  payload: DeckPayload;
  /** ?mode= from the route, ahead of the saved mode */
  mode?: ShellMode;
  /** ?theme= from the route: applied once on mount, ahead of the stored theme */
  theme?: Theme;
  /** ?present=1 from the route: present mode (chrome hidden) on mount */
  present?: boolean;
  /** the frame protocol for Prototemplate's /deck iframe */
  embed?: boolean;
  onModeChange?: (mode: ShellMode) => void;
};

const MODES: readonly ShellMode[] = ['slide', 'grid', 'book'];

function toSections(deck: ViewerDeck): readonly ShellSection[] {
  const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
  return deck.sections.map((section) => ({
    id: section.id,
    label: section.name,
    items: section.slideIds.flatMap((id): ShellItem[] => {
      const slide = byId.get(id);
      if (!slide) return [];
      return [
        {
          id: slide.id,
          n: pad2(slide.n),
          title: trimTitle(slide.title),
          kind: slide.kind,
          html: slide.html,
          lint: slide.lint,
        },
      ];
    }),
  }));
}

/**
 * Tells the page around the frame which slide is up (DeckFrame.tsx mirrors it into its address).
 * The target origin is `*`: the embed is framed by Prototemplate and the customer domains the
 * `frame-ancestors` rule of server/headers.ts admits, none of them the studio's own origin, and the
 * message carries a slide number and nothing else (hotfix B request R2; VERIFICATION-3 step 21,
 * share.spec.ts row 3: with `window.location.origin` a parent on another origin received nothing).
 */
function postSlide(n: number): void {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ type: 'gt-deck-slide', n }, '*');
  } catch {
    // a detached frame: nothing to tell
  }
}

export function DeckViewer({
  payload,
  mode,
  theme,
  present = false,
  embed = false,
  onModeChange,
}: DeckViewerProps) {
  const { deck, sprite } = payload;
  const sections = useMemo(() => toSections(deck), [deck]);
  /* the slideshow's facts (blank slide, laser, full screen) for describe().state while presenting */
  const show = useRef<SlideshowState | null>(null);

  useMountEffect(() => {
    /* the route's theme wins over the stored one, once; the toggle then persists as usual */
    if (theme) applyTheme(theme);
    const stop = installThemeBridge();
    /* a framed deck reports its opening slide so the host's address names it */
    if (embed) {
      const n =
        Number(document.querySelector('.pt-viewer')?.getAttribute('data-index') ?? '-1') + 1;
      if (n > 0) postSlide(n);
      /* and a same-origin host with frames of its own gets the theme, as DeckFrame does on load */
      document
        .querySelectorAll('iframe')
        .forEach((frame) => postTheme(frame.contentWindow, theme ?? 'dark'));
    }
    return stop;
  });

  return (
    <>
      {/* the theme's sprite (63 Heroicons plus gt-mark), once per document, so every <use href="#..."> in the sheets resolves */}
      <div className="ts-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <ViewerShell
        id={`deck:${deck.id}`}
        title={deck.title}
        count={`${deck.slides.length} slides`}
        sections={sections}
        modes={MODES}
        initialMode={mode}
        thumb="shot"
        keys="paged"
        hash={embed ? 'n' : 'id'}
        onSelect={embed ? (_id, n) => postSlide(n) : undefined}
        onModeChange={onModeChange}
        homeHref={embed ? undefined : '/decks'}
        toolbarSlot={
          deck.fallback ? (
            <span
              className="ts-chip"
              title={`decks/${deck.fallback} stands in for decks/${deck.id}`}
            >
              fixture
            </span>
          ) : undefined
        }
      >
        <StageBridge deck={deck} serverTheme={theme ?? 'dark'} show={show} />
        <PresentOnLoad on={present} />
        <ViewerOwner deck={deck} attach={!embed} show={show} />
      </ViewerShell>
    </>
  );
}

/**
 * ?present=1: present mode on mount, through the shell's own setPresent (the grid hands over to
 * the slide, the list leaves with the chrome), so /deck/<id>?present=1 opens as the presentation
 * the way the P key would. Rendered inside the shell, where its state is in scope.
 */
function PresentOnLoad({ on }: { on: boolean }) {
  const shell = usePtShell();
  const shellRef = useRef(shell);
  shellRef.current = shell;
  useMountEffect(() => {
    if (on) shellRef.current.setPresent(true);
  });
  return null;
}

/**
 * The composition point between the chrome's shell state and the viewer's
 * stage (SPEC 3.3: chrome depends on viewer, never the reverse, so the shell
 * hands its state down as props here). The stage is always mounted so the
 * sheet keeps its fit; the grid and the book mount only while their mode is
 * up (SPEC 5.5: book mode builds lazily on first entry).
 */
function StageBridge({
  deck,
  serverTheme,
  show,
}: {
  deck: ViewerDeck;
  serverTheme: Theme;
  show: { current: SlideshowState | null };
}) {
  const shell = usePtShell();
  const { stageSize } = usePtStage();
  const themeNow = useTheme(serverTheme);
  const slide = deck.slides.find((entry) => entry.id === shell.active) ?? deck.slides[0];
  /* the show runs over the unskipped slides (gslides-parity SPEC 9.2); the audience payload
     already leaves skipped slides out, and a flag the loader keeps is read as well */
  const play = useMemo(() => playList(deck.slides), [deck.slides]);
  /* a click on the sheet: the next slide of the show while presenting, the shell's paging otherwise */
  const onStep = (delta: number) => {
    if (!shell.present) {
      shell.step(delta);
      return;
    }
    const at = currentPlayIndex(deck.slides, play, shell.active);
    const target = play[stepPlayIndex(at, delta, play.length)];
    if (target && target.id !== shell.active) shell.select(target.id);
  };
  return (
    <>
      <Stage
        slide={slide}
        index={Math.max(0, shell.index)}
        total={shell.total}
        stageSize={stageSize}
        mode={shell.mode}
        present={shell.present}
        narrow={shell.narrow}
        theme={themeNow}
        dir={shell.dir ?? 'next'}
        onStep={onStep}
      />
      {shell.present ? (
        <Slideshow
          deckId={deck.id}
          slides={play}
          activeId={shell.active}
          theme={themeNow}
          onGoto={shell.select}
          onExit={() => shell.setPresent(false)}
          say={shell.say}
          onState={(state) => {
            show.current = state;
          }}
        />
      ) : null}
      {shell.mode === 'grid' ? (
        <GridView
          deck={deck}
          active={shell.active}
          theme={themeNow}
          onSelect={(id) => {
            shell.setMode('slide');
            shell.select(id);
          }}
        />
      ) : null}
      {shell.mode === 'book' ? (
        <BookView
          deck={deck}
          active={shell.active}
          theme={themeNow}
          isMode
          onSelect={shell.select}
          onOpen={(id) => {
            shell.setMode('slide');
            shell.select(id);
          }}
          lead={`${deck.slides.length} ${deck.slides.length === 1 ? 'slide' : 'slides'} in ${deck.sections.length} ${deck.sections.length === 1 ? 'section' : 'sections'}. Read it top to bottom, or click a page to open it as a slide.`}
          meta={[
            { key: 'Sections', value: String(deck.sections.length) },
            { key: 'Slides', value: String(deck.slides.length) },
            { key: 'Revision', value: `r${deck.revision}` },
          ]}
        />
      ) : null}
    </>
  );
}

/**
 * The viewer as a window API owner (SPEC 7.4: "the viewer in each mode (view.*, render.slide,
 * render.sheet)") and an attached studio session (MILESTONES M4 item 1): view.goto, view.mode,
 * view.theme and view.present run against the shell, render.slide through the render worker's
 * server function, and describe().state reports the deck facts. The marker element is the owner;
 * the session hook long-polls the server for commands (`deck_goto_slide` over /mcp) and answers
 * them through this handle. The embed frame registers the owner but does not attach: the host
 * page drives it through the frame protocol.
 */
function ViewerOwner({
  deck,
  attach,
  show,
}: {
  deck: ViewerDeck;
  attach: boolean;
  show: { current: SlideshowState | null };
}) {
  const shell = usePtShell();
  const shellRef = useRef<ShellState>(shell);
  shellRef.current = shell;
  const [ownerEl, setOwnerEl] = useState<HTMLElement | null>(null);
  const live = useRef(createLiveAdapter(viewerAdapter(deck, shellRef, show)));
  live.current.update(viewerAdapter(deck, shellRef, show));
  useLayoutEffect(() => {
    if (!ownerEl) return;
    return registerStudioAutomation(live.current.adapter, ownerEl);
  }, [ownerEl]);
  useStudioSession({ deckId: deck.id, author: 'viewer', enabled: attach });
  return <span ref={setOwnerEl} className="ts-owner" data-owner="viewer" data-active="true" />;
}

function viewerAdapter(
  deck: ViewerDeck,
  shellRef: { current: ShellState },
  show: { current: SlideshowState | null },
): StudioAdapter {
  const dispatcher: Dispatcher = createDispatcher();
  const context: ActionContext = { author: { kind: 'human', name: 'viewer' } };
  const on = <T,>(id: ActionId, run: (input: T) => Promise<unknown> | unknown): void => {
    dispatcher.register(id, (input) => run(input as T));
  };
  /* the view.* outputs: exactly the view state the action table declares (viewStateSchema) */
  const viewState = () => {
    const shell = shellRef.current;
    const slideId = shell.active || deck.slides[0]?.id || '';
    const n = deck.slides.find((slide) => slide.id === slideId)?.n ?? 1;
    return { slideId, n, mode: shell.mode, theme: readTheme(), present: shell.present };
  };
  /* describe().state: the view state plus, while presenting, the show's facts (gslides-parity
     SPEC 9.2): the blank slide up, the laser pointer and full screen */
  const showFacts = () => {
    const showing = shellRef.current.present ? show.current : null;
    return showing
      ? { blank: showing.blank, laser: showing.laser, fullscreen: showing.fullscreen }
      : {};
  };
  on<{ slideId: string }>('view.goto', (input) => {
    if (!deck.slides.some((slide) => slide.id === input.slideId)) {
      throw new RangeError(`No slide "${input.slideId}"`);
    }
    const shell = shellRef.current;
    if (shell.mode === 'grid') shell.setMode('slide');
    shell.select(input.slideId);
    return {
      ...viewState(),
      slideId: input.slideId,
      n: deck.slides.find((slide) => slide.id === input.slideId)?.n ?? 1,
    };
  });
  on<{ mode: ShellMode }>('view.mode', (input) => {
    shellRef.current.setMode(input.mode);
    return { ...viewState(), mode: input.mode };
  });
  on<{ theme: Theme }>('view.theme', (input) => {
    applyTheme(input.theme);
    return { ...viewState(), theme: input.theme };
  });
  on<{ on: boolean }>('view.present', (input) => {
    shellRef.current.setPresent(input.on);
    return { ...viewState(), present: input.on };
  });
  on<{ slideIds: 'all' | string[]; themes?: Theme[]; scale?: 1 | 2 }>('render.slide', (input) =>
    renderSlideImages({
      deckId: deck.id,
      slideIds: input.slideIds,
      ...(input.themes !== undefined ? { themes: input.themes } : {}),
      ...(input.scale !== undefined ? { scale: input.scale } : {}),
    }),
  );
  return {
    owner: 'viewer',
    actions: viewerActionIds(),
    invoke: (action, input) => {
      if (!viewerActionIds().includes(action)) {
        throw new RangeError(
          `The viewer owner does not expose "${action}"; open /edit/${deck.id} for it.`,
        );
      }
      return dispatcher.dispatch(action, input ?? {}, context);
    },
    state: () => ({ deckId: deck.id, revision: deck.revision, ...viewState(), ...showFacts() }),
  };
}
