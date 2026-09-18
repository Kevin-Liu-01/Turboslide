import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { createLiveAdapter } from '@turboslide/agent/window/adapter';
import type { StudioAdapter } from '@turboslide/agent/window/adapter';
import { presenterActionIds, registerStudioAutomation } from '@turboslide/agent/window/registry';
import { detectPlatform } from '@turboslide/chrome/menus/platform';
import { Toast, useToast } from '@turboslide/chrome/Toast';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { renderSlide } from '@turboslide/render/slide';
import type { ActionId } from '@turboslide/schema/actions';
import { slideTitle } from '@turboslide/schema/deck';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { ViewerSlide } from '@turboslide/viewer/model';
import { PresenterConsole } from '@turboslide/viewer/present/PresenterConsole';
import { openPresentChannel } from '@turboslide/viewer/present/presentSync';
import type { PresentChannel, PresentMessage } from '@turboslide/viewer/present/presentSync';
import type { PresentIcons, PresentTip } from '@turboslide/viewer/present/ui';
import { installThemeBridge, readTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import type { EditorDeck } from '../server/write';
import { PRESENTER_ICONS } from './presenter-icons';
import { useMountEffect } from './useMountEffect';
import { useStudioSession } from './useStudioSession';

/**
 * Presenter view's page (gslides-parity SPEC 9.3; MILESTONES B6 item 3; docs/spec/SPEC.md 6.10),
 * moved verbatim from routes/present.$deckId.tsx in round four (gslides-parity SPEC-4 0.36, 0.44;
 * PP 3.7, 7 row 2) so the route file holds its options alone and this module, with `renderSlide`
 * and the console, is read by the route's component only: the router's code splitting puts it in
 * the presenter's own chunk, the renderer leaves the entry every route loads, and the editor
 * preloads that chunk when the pointer enters the Slideshow arrow (editor/EditorRoot.tsx).
 *
 * The page renders the unskipped slides once for the console's live frames and syncs with the
 * slideshow window over BroadcastChannel('turboslide:<deckId>') with localStorage as the fallback:
 * the audience reports its slide and follows the console's goto, so arrow keys in either window
 * move both. The console is a window API owner too (`presenter`, with view.goto and view.present)
 * and attaches to the studio's session registry, so `deck_goto_slide` over /mcp lands here when
 * this is the page attached, and the audience window follows over the channel.
 */

/* the five chrome icons as their own module, so the route does not load the chrome's icon set
   (presenter-icons.tsx; the focus round, VERIFICATION C2-F18) */
const ICONS: PresentIcons = PRESENTER_ICONS;

const tip: PresentTip = (content) => tipProps(content);

/**
 * The play list of the console: the deck's unskipped slides in order (SPEC 7.2.1), each rendered
 * once through the same renderer the viewer routes use, with its notes. `n` keeps the deck
 * position so the counter and the audience agree on which slide is which.
 */
export function presenterSlides(
  document: DeckDocument,
  deckId: string,
  theme: Theme,
): ViewerSlide[] {
  const { deck, slides } = document;
  const assetBase = `/decks/${deckId}/`;
  const out: ViewerSlide[] = [];
  let n = 0;
  for (const section of deck.sections) {
    for (const slideId of section.slideIds) {
      const slide = slides[slideId];
      if (!slide) continue;
      n += 1;
      if (slide.skip === true) continue;
      const rendered = renderSlide(deck, slide, {
        theme,
        chrome: true,
        assetBase,
        blockAttrs: false,
        gtWord: true,
      });
      out.push({
        id: slideId,
        n,
        title: slideTitle(slide, n),
        kind: slide.kind,
        sectionId: section.id,
        html: rendered.html,
        ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
      });
    }
  }
  return out;
}

type Live = {
  play: readonly ViewerSlide[];
  index: number;
  connected: boolean;
  revision: number;
};

export function PresenterPage({ payload }: { payload: EditorDeck }) {
  const { deckId, document } = payload;
  const theme = useTheme();
  const platform = useMemo(() => detectPlatform(), []);
  const play = useMemo(() => presenterSlides(document, deckId, theme), [document, deckId, theme]);
  const [index, setIndex] = useState(0);
  const [connected, setConnected] = useState(false);
  const toast = useToast();
  const channel = useRef<PresentChannel | null>(null);
  const live = useRef<Live>({ play, index, connected, revision: document.deck.revision });
  live.current = { play, index, connected, revision: document.deck.revision };

  useMountEffect(() => installThemeBridge());

  /* follow the audience window: its state on hello and on every move, and its own goto */
  const follow = useCallback((slideId: string) => {
    const at = live.current.play.findIndex((slide) => slide.id === slideId);
    if (at >= 0) setIndex(at);
  }, []);

  useMountEffect(() => {
    const onMessage = (message: PresentMessage) => {
      switch (message.type) {
        case 'state':
          setConnected(true);
          follow(message.slideId);
          return;
        case 'goto':
          if (message.role === 'audience') follow(message.slideId);
          return;
        case 'bye':
          if (message.role === 'audience') setConnected(false);
          return;
        default:
          return;
      }
    };
    const opened = openPresentChannel(deckId, 'presenter', onMessage);
    channel.current = opened;
    opened.post({ type: 'hello' });
    return () => {
      opened.post({ type: 'bye' });
      opened.close();
      channel.current = null;
    };
  });

  /* the console's own move: local first, then the audience window follows */
  const goto = useCallback((to: number) => {
    const target = live.current.play[to];
    if (target === undefined) return;
    setIndex(to);
    channel.current?.post({ type: 'goto', slideId: target.id });
  }, []);

  /* the window API owner (SPEC 7.4: the presenter answers view.goto and view.present) */
  const [ownerEl, setOwnerEl] = useState<HTMLElement | null>(null);
  const adapter = useRef(createLiveAdapter(presenterAdapter(deckId, live, goto, channel)));
  adapter.current.update(presenterAdapter(deckId, live, goto, channel));
  useLayoutEffect(() => {
    if (!ownerEl) return;
    return registerStudioAutomation(adapter.current.adapter, ownerEl);
  }, [ownerEl]);
  useStudioSession({ deckId, author: 'presenter' });

  return (
    <>
      {/* the theme's sprite, once, so every <use href="#..."> in the frames resolves */}
      <div
        className="ts-sprite"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: payload.sprite }}
      />
      <PresenterConsole
        title={document.deck.title}
        slides={play}
        index={index}
        theme={theme}
        connected={connected}
        platform={platform}
        onGoto={goto}
        onSay={toast.say}
        icons={ICONS}
        tip={tip}
      />
      <Toast message={toast.message} on={toast.on} />
      <span ref={setOwnerEl} className="ts-owner" data-owner="presenter" data-active="true" />
    </>
  );
}

function presenterAdapter(
  deckId: string,
  live: { current: Live },
  goto: (index: number) => void,
  channel: { current: PresentChannel | null },
): StudioAdapter {
  const dispatcher: Dispatcher = createDispatcher();
  const context: ActionContext = { author: { kind: 'human', name: 'presenter' } };
  const on = <T,>(id: ActionId, run: (input: T) => unknown): void => {
    dispatcher.register(id, (input) => run(input as T));
  };
  /* the view.* outputs: exactly the view state the action table declares (viewStateSchema) */
  const viewState = (at: number, present: boolean) => {
    const current = live.current.play[at];
    return {
      slideId: current?.id ?? '',
      n: Math.max(1, current?.n ?? 1),
      mode: 'slide' as const,
      theme: readTheme(),
      present,
    };
  };
  /* describe().state: the view state plus the console's own facts */
  const state = () => {
    const { play, index, connected, revision } = live.current;
    return { deckId, revision, ...viewState(index, true), index, total: play.length, connected };
  };
  on<{ slideId: string }>('view.goto', (input) => {
    const at = live.current.play.findIndex((slide) => slide.id === input.slideId);
    if (at < 0) throw new RangeError(`No slide "${input.slideId}" in the show`);
    goto(at);
    return viewState(at, true);
  });
  on<{ on: boolean }>('view.present', (input) => {
    channel.current?.post({ type: 'present', on: input.on });
    return viewState(live.current.index, input.on);
  });
  return {
    owner: 'presenter',
    actions: presenterActionIds(),
    invoke: (action, input) => {
      if (!presenterActionIds().includes(action)) {
        throw new RangeError(
          `The presenter owner does not expose "${action}"; open /edit/${deckId} for it.`,
        );
      }
      return dispatcher.dispatch(action, input ?? {}, context);
    },
    state,
  };
}
