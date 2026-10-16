import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@turboslide/chrome/icons';
import { useLayer } from '@turboslide/chrome/Layer';
import {
  SETTINGS_STORAGE,
  readStoredSettings,
  writeStoredSettings,
} from '@turboslide/chrome/editor-shell';
import { Menu } from '@turboslide/chrome/Menu';
import { detectPlatform } from '@turboslide/chrome/menus/platform';
import { DEFAULT_MENU_CONTEXT, shortcut } from '@turboslide/chrome/menus/model';
import type { MenuContext, MenuItem } from '@turboslide/chrome/menus/model';
import { SNACKBARS } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import type { ViewerSlide } from '@turboslide/viewer/model';
import { presentKeyAction } from '@turboslide/viewer/present/presentKeys';
import type { PresentPlatform } from '@turboslide/viewer/present/presentKeys';
import {
  currentPlayIndex,
  playList,
  slideNumberOf,
  stepPlayIndex,
} from '@turboslide/viewer/present/presentModel';
import type { BlankSlide } from '@turboslide/viewer/present/presentModel';
import { PresentShortcuts } from '@turboslide/viewer/present/PresentShortcuts';
import { mountSlideLinkClicks } from '@turboslide/viewer/present/slideLinks';
import { openPresentChannel } from '@turboslide/viewer/present/presentSync';
import type { PresentChannel, PresentMessage } from '@turboslide/viewer/present/presentSync';
import { PresentToolbar } from '@turboslide/viewer/present/PresentToolbar';
import { SlideList } from '@turboslide/viewer/present/SlideList';
import { BlankLayer, LaserPointer } from '@turboslide/viewer/present/SlideshowLayer';
import { PRESENT_TEXT } from '@turboslide/viewer/present/strings';
import { isControlTarget, isEditableTarget } from '@turboslide/viewer/present/ui';
import type { PresentIcons, PresentTip } from '@turboslide/viewer/present/ui';
import { motionReduced, onMotionReducedChange } from '@turboslide/viewer/reduce-motion';
import { createSlideClock } from '@turboslide/viewer/slide-clock';
import type { ClockEntry, SlideClock } from '@turboslide/viewer/slide-clock';
import type { Theme } from '@turboslide/viewer/theme';

import {
  exitPresentFullscreen,
  openPresenterView,
  requestPresentFullscreen,
} from './presentActions';
import { useMountEffect } from './useMountEffect';

import './Slideshow.css';

/**
 * The slideshow surface (gslides-parity SPEC 9.2; MILESTONES B6 item 2), mounted over the sheet
 * while the shell is in present mode by the viewer (DeckViewer) and the editor. It composes the
 * viewer's present pieces with the chrome's primitives the viewer cannot import (the one Menu,
 * the Snackbar, the Tooltip, the Heroicons): every presenting key of Google's table, the toolbar
 * at the bottom left with its slide list and Options menu, the black and white slides, the laser
 * pointer, the counter over the unskipped slides, and the channel to the presenter window. The
 * show owns navigation while it is up: the keys and clicks move through the play list the caller
 * hands in (skipped slides already left out) and every move is one `onGoto`, the same select the
 * shell and `view.goto` use, so an agent's goto moves the show and the presenter window alike.
 * Nothing here talks to the network: the deck is in memory (R07 rule 29). A slide with effects
 * runs its slide clock (HTML-SLIDES-DESIGN 2.6) on the stage's slide body: the next key or a
 * click plays its next step before the show leaves the slide, back shows the state after the
 * previous step and from step 0 lands on the previous slide at its end, a jump enters a slide at
 * its start, and the timed advance moves on by itself.
 */
export type SlideshowState = {
  blank: BlankSlide | null;
  laser: boolean;
  fullscreen: boolean;
};

export type SlideshowProps = {
  deckId: string;
  /** the deck's slides in order; skipped ones are dropped here as well when the payload flags them */
  slides: readonly ViewerSlide[];
  activeId: string;
  theme: Theme;
  onGoto: (slideId: string) => void;
  onExit: () => void;
  /** the shell's toast, for the digit jump */
  say: (message: string, hold?: number) => void;
  /** the presenting facts, for describe().state */
  onState?: (state: SlideshowState) => void;
  /**
   * filled with the show's step while it is up: the stage's click and swipe call it, so a click
   * plays the slide's next step before it moves to the next slide
   */
  stepRef?: { current: ((delta: number) => void) | null };
};

type Popover = 'list' | 'options' | 'shortcuts' | null;

/** How long the toolbar stays after the pointer leaves its corner (SPEC 9.2). */
const BAR_FADE_MS = 2000;
/**
 * How long the bar shows on entry and after a pointer move anywhere over the show (docs/archive/rounds/PRODUCT.md
 * 3.1.1; audit-interface 13): about three seconds, as Google's does, so a presenter who has never
 * used the show learns where the controls are; the corner below keeps it up while the pointer is
 * there.
 */
export const BAR_ENTRY_MS = 3000;
/** The corner of the stage that shows the toolbar: this far up from the bottom and in from the left. */
const BAR_ZONE = { height: 120, width: 560 };
/** How long typed digits wait for Enter. */
const DIGIT_HOLD_MS = 1500;

const LIST_ID = 'ts-slideshow-list';
const OPTIONS_ID = 'ts-slideshow-options';

const ICONS: PresentIcons = {
  previous: <Icon name="prev" />,
  next: <Icon name="next" />,
  captions: <Icon name="chat" />,
  fullscreen: <Icon name="fullscreen" />,
  exitFullscreen: <Icon name="exit-fullscreen" />,
  exit: <Icon name="close" />,
  plus: <Icon name="plus" />,
  minus: <Icon name="minus" />,
};

const tip: PresentTip = (content) => tipProps(content);

/* the features round, ship two (docs/archive/rounds/FEATURES.md 5.6; build/b1.md 2.5): the show's Options menu
   mirrors Tools > Preferences > Play animated patterns over the same per browser setting (the seller's
   noun of docs/NEXT.md question 10, round1/build/b3a.md request 15) */
const PLAY_SHADERS = {
  label: 'Play animated patterns',
  on: 'On',
  show: 'In the show only',
  off: 'Off',
  doc: 'Whether the animated patterns on the slides move during the show',
} as const;
type PlayShaders = 'on' | 'show' | 'off';
const isPlayShaders = (value: unknown): value is PlayShaders =>
  value === 'on' || value === 'show' || value === 'off';

/** The Options menu (SPEC 9.2's table), built per render so the two toggles read their state. */
function optionsItems(state: { laser: boolean; fullscreen: boolean }): MenuItem[] {
  const run = { kind: 'client', handler: 'runAction' } as const;
  return [
    {
      id: 'present.options.notes',
      label: PRESENT_TEXT.openNotes,
      status: 'now',
      effect: run,
      key: shortcut('S', 'S'),
      icon: 'document',
      doc: 'Opens Presenter view in a second window',
    },
    {
      id: 'present.options.autoPlay',
      label: PRESENT_TEXT.autoPlay,
      icon: 'play',
      status: 'later',
      stubReason: PRESENT_TEXT.autoPlayStub,
      google: 'Auto advance options',
    },
    {
      id: 'present.options.laser',
      label: state.laser ? PRESENT_TEXT.laserOff : PRESENT_TEXT.laserOn,
      status: 'now',
      effect: run,
      key: shortcut('L', 'L'),
      icon: 'cursor-arrow-rays',
    },
    {
      id: 'present.options.fullScreen',
      label: state.fullscreen ? PRESENT_TEXT.exitFullScreen : PRESENT_TEXT.enterFullScreen,
      status: 'now',
      effect: run,
      key: shortcut('Cmd+Shift+F', 'F11'),
      icon: state.fullscreen ? 'exit-fullscreen' : 'fullscreen',
    },
    {
      id: 'present.options.playShaders',
      label: PLAY_SHADERS.label,
      status: 'now',
      effect: { kind: 'submenu' },
      icon: 'cube',
      doc: PLAY_SHADERS.doc,
      items: (['on', 'show', 'off'] as const).map((value) => ({
        id: `present.options.playShaders.${value}`,
        label: PLAY_SHADERS[value],
        status: 'now' as const,
        effect: { kind: 'toggle' as const, setting: 'playShaders' as const, value },
      })),
    },
    {
      id: 'present.options.pen',
      label: PRESENT_TEXT.pen,
      status: 'later',
      stubReason: PRESENT_TEXT.penStub,
      icon: 'pencil',
    },
    {
      id: 'present.options.more',
      label: PRESENT_TEXT.more,
      status: 'now',
      icon: 'ellipsis-horizontal',
      effect: { kind: 'submenu' },
      items: [
        {
          id: 'present.options.more.pdf',
          label: PRESENT_TEXT.downloadPdf,
          status: 'later',
          stubReason: PRESENT_TEXT.downloadStub,
        },
        {
          id: 'present.options.more.pptx',
          label: PRESENT_TEXT.downloadPptx,
          status: 'later',
          stubReason: PRESENT_TEXT.downloadStub,
        },
        {
          id: 'present.options.more.print',
          label: PRESENT_TEXT.print,
          status: 'now',
          effect: run,
          key: shortcut('Cmd+P'),
          doc: 'Opens the print preview',
        },
        {
          id: 'present.options.more.shortcuts',
          label: PRESENT_TEXT.keyboardShortcuts,
          status: 'now',
          effect: run,
          doc: 'The keys that work while presenting',
        },
      ],
    },
    {
      id: 'present.options.exit',
      label: PRESENT_TEXT.exit,
      status: 'now',
      effect: run,
      key: shortcut('Esc', 'Esc'),
      icon: 'close',
      dividerBefore: true,
    },
  ];
}

/** The step facts of the state message: the clock's, when they belong to the slide shown. */
function stepFacts(
  facts: { slideId: string; step: number; steps: number },
  slideId: string,
): { step: number; steps: number } {
  return facts.slideId === slideId
    ? { step: facts.step, steps: facts.steps }
    : { step: 0, steps: 0 };
}

function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}

export function Slideshow({
  deckId,
  slides,
  activeId,
  theme,
  onGoto,
  onExit,
  say,
  onState,
  stepRef,
}: SlideshowProps) {
  const play = useMemo(() => playList(slides), [slides]);
  const index = currentPlayIndex(slides, play, activeId);
  const total = play.length;
  const platform: PresentPlatform = useMemo(() => detectPlatform(), []);

  const [blank, setBlank] = useState<BlankSlide | null>(null);
  const [laser, setLaser] = useState(false);
  /* past the last slide (docs/archive/rounds/POLISH.md item 98): the end plate, which a click or the next key leaves */
  const [ended, setEnded] = useState(false);
  const [pointer, setPointer] = useState({ x: -100, y: -100 });
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [barShown, setBarShown] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const [optionsAnchor, setOptionsAnchor] = useState<HTMLElement | null>(null);
  const snackbar = useSnackbar();

  const root = useRef<HTMLDivElement>(null);
  /* the show keeps the stage's box: in the top layer its `inset: 0` would resolve against the
     window, which on a phone without full screen is taller than the stage, and the toolbar left
     the slide for the window's foot. Before it enters the layer the show is fixed on its stage's
     box in the window, and it follows that box while it is open. */
  useLayoutEffect(() => {
    const el = root.current;
    const stage = el?.parentElement;
    if (!el || !stage) return undefined;
    const fit = (): void => {
      const box = stage.getBoundingClientRect();
      el.style.position = 'fixed';
      el.style.inset = 'auto';
      el.style.left = `${box.left}px`;
      el.style.top = `${box.top}px`;
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(stage);
    window.addEventListener('resize', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);
  /* the show takes the show layer of the top layer (docs/DESIGN.md 2.2, 2.3): over the editor's
     docked surfaces and the name prompt bar, which are in the top layer since DR-D2#1, and under
     every dialog, menu, toast and tooltip; its two viewer surfaces take the hook below */
  useLayer(root, { layer: 'show' });
  const barHover = useRef(false);
  const barTimer = useRef(0);
  const digits = useRef('');
  const digitTimer = useRef(0);
  const audienceTold = useRef(false);
  const channel = useRef<PresentChannel | null>(null);
  const listAnchor = useRef<HTMLElement | null>(null);

  /* the latest facts for the mount-time listeners */
  const live = useRef({ play, index, total, blank, laser, popover, activeId, onGoto, onExit, say });
  live.current = { play, index, total, blank, laser, popover, activeId, onGoto, onExit, say };

  /* the slide clock of the slide shown, and where the next slide it builds enters */
  const clock = useRef<SlideClock | null>(null);
  const entry = useRef<{ slideId: string; at: ClockEntry } | null>(null);
  const [steps, setSteps] = useState({ slideId: '', step: 0, steps: 0 });
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const goto = useCallback((to: number, at: ClockEntry = 'start') => {
    const target = live.current.play[to];
    if (target === undefined || target.id === live.current.activeId) return;
    entry.current = { slideId: target.id, at };
    live.current.onGoto(target.id);
  }, []);
  const exit = useCallback(() => {
    exitPresentFullscreen();
    live.current.onExit();
  }, []);

  const step = useCallback(
    (delta: number) => {
      const { index: at, total: count } = live.current;
      if (endedRef.current) {
        /* on the end plate: back returns to the last slide, forward leaves the show */
        if (delta < 0) setEnded(false);
        else exit();
        return;
      }
      /* the slide's own steps first (HTML-SLIDES-DESIGN 2.6) */
      const slideClock = clock.current;
      if (slideClock !== null && (delta > 0 ? slideClock.next() : slideClock.back())) return;
      if (delta > 0 && count > 0 && at >= count - 1) {
        setEnded(true);
        return;
      }
      goto(stepPlayIndex(at, delta, count), delta < 0 ? 'end' : 'start');
    },
    [goto, exit],
  );
  useLayoutEffect(() => {
    if (stepRef === undefined) return undefined;
    stepRef.current = step;
    return () => {
      if (stepRef.current === step) stepRef.current = null;
    };
  }, [stepRef, step]);
  const endedRef = useRef(false);
  endedRef.current = ended;

  /* Reduce motion turns effects into cuts; a change builds the clock again at the same step */
  const [reduced, setReduced] = useState(motionReduced);
  useMountEffect(() => onMotionReducedChange(() => setReduced(motionReduced())));

  /* the timed advance leaves the slide as the next key does */
  const advance = useRef(() => step(1));
  advance.current = () => step(1);

  /* the slide clock on the stage's slide body: built for each slide shown and each new render of
     it, entered where the move asked (a jump and the next key at its start, back at its end, the
     presenter window at its step), and disposed so the stage draws the slide as authored again */
  const current = play[index];
  const currentId = current?.id;
  const currentHtml = current?.html;
  const currentMotion = current?.motion;
  useLayoutEffect(() => {
    const stage = root.current?.parentElement;
    if (currentId === undefined || currentMotion === undefined || !stage) {
      const slideId = currentId ?? '';
      setSteps((was) =>
        was.slideId === slideId && was.steps === 0 ? was : { slideId, step: 0, steps: 0 },
      );
      return undefined;
    }
    const body = Array.from(
      stage.querySelectorAll<HTMLElement>('.ts-stage > .pt-slide:not(.is-leaving)'),
    ).find((el) => el.getAttribute('data-slide-id') === currentId);
    if (body === undefined) return undefined;
    const asked = entry.current?.slideId === currentId ? entry.current.at : null;
    entry.current = null;
    /* a new render of the slide shown (an agent's edit, Reduce motion) keeps its step */
    const kept = stepsRef.current.slideId === currentId ? stepsRef.current.step : null;
    const made = createSlideClock(body, currentMotion, {
      reduced,
      entry: asked ?? kept ?? 'start',
      onAdvance: () => advance.current(),
      onStep: (at, count) => setSteps({ slideId: currentId, step: at, steps: count }),
    });
    clock.current = made;
    return () => {
      /* a body leaving the stage keeps its last frame for its fade out; one that stays (the show
         ended, a new render) returns to the authored state */
      if (body.classList.contains('is-leaving')) made.freeze();
      else made.dispose();
      if (clock.current === made) clock.current = null;
    };
  }, [currentId, currentHtml, currentMotion, reduced]);
  const toggleFullscreen = useCallback(() => {
    if (isFullscreen()) exitPresentFullscreen();
    else requestPresentFullscreen();
  }, []);

  const openNotes = useCallback(() => {
    openPresenterView(deckId);
  }, [deckId]);

  const tellAudience = useCallback(() => {
    if (audienceTold.current) return;
    audienceTold.current = true;
    snackbar.show(SNACKBARS.audienceTools);
  }, [snackbar]);

  const showBar = useCallback(() => {
    window.clearTimeout(barTimer.current);
    setBarShown(true);
  }, []);
  const fadeBar = useCallback((after: number = BAR_FADE_MS) => {
    window.clearTimeout(barTimer.current);
    barTimer.current = window.setTimeout(() => {
      if (!barHover.current && live.current.popover === null) setBarShown(false);
    }, after);
  }, []);
  /* the bar for about three seconds: on entry and after every pointer move over the show (3.1.1) */
  const glanceBar = useCallback(() => {
    setBarShown(true);
    fadeBar(BAR_ENTRY_MS);
  }, [fadeBar]);

  useMountEffect(() => {
    glanceBar();
  });

  /* a show that opens on a skipped slide moves to the next unskipped one */
  useEffect(() => {
    if (total > 0 && !play.some((slide) => slide.id === activeId)) goto(index);
  }, [activeId, play, index, total, goto]);

  /* the presenting facts, for describe().state */
  useEffect(() => {
    onState?.({ blank, laser, fullscreen });
  }, [blank, laser, fullscreen, onState]);

  /* a slide link on a slide moves the show (docs/archive/rounds/PRODUCT.md section 2 rank 19; build/b2.md R5):
     #next, #previous, #first and #last resolve against the play list here, #s/<id> too */
  useEffect(() => {
    const el = root.current;
    if (el === null) return undefined;
    return mountSlideLinkClicks(
      el,
      () => ({ play: live.current.play, index: live.current.index }),
      (slideId) => {
        const at = live.current.play.findIndex((slide) => slide.id === slideId);
        if (at >= 0) goto(at);
      },
    );
  }, [goto]);

  /* the keys, on the document ahead of the reading surface's listener (SPEC 10.2: Google's
     presenting letters win while presenting) */
  useMountEffect(() => {
    const clearDigits = () => {
      digits.current = '';
      window.clearTimeout(digitTimer.current);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const state = live.current;
      const target = event.target;
      if (state.popover !== null) {
        /* a popover handles its own keys; anything typed elsewhere while it is open stays inert */
        if (
          target instanceof Element &&
          target.closest('[data-present-popover], [role="menu"], .ts-menu-root') !== null
        )
          return;
        if (event.key !== 'Tab') event.stopPropagation();
        return;
      }
      const action = presentKeyAction(event, {
        blank: state.blank,
        digits: digits.current !== '',
        control: isControlTarget(target),
        editable: isEditableTarget(target),
        platform,
      });
      if (action === null) return;
      event.preventDefault();
      event.stopPropagation();
      switch (action.type) {
        case 'exit':
          exit();
          return;
        case 'next':
          step(1);
          return;
        case 'previous':
          step(-1);
          return;
        case 'first':
          goto(0);
          return;
        case 'last':
          goto(state.total - 1);
          return;
        case 'digit':
          digits.current += action.digit;
          window.clearTimeout(digitTimer.current);
          digitTimer.current = window.setTimeout(clearDigits, DIGIT_HOLD_MS);
          state.say(PRESENT_TEXT.slideNumber(digits.current));
          return;
        case 'go': {
          const typed = digits.current;
          clearDigits();
          const n = slideNumberOf(typed, state.total);
          if (n === null) state.say(PRESENT_TEXT.noSlide(Number.parseInt(typed, 10)));
          else goto(n - 1);
          return;
        }
        case 'notes':
          openNotes();
          return;
        case 'audience':
          tellAudience();
          return;
        case 'laser':
          setLaser((on) => !on);
          return;
        case 'print':
          window.print();
          return;
        case 'captions':
          return;
        case 'fullscreen':
          toggleFullscreen();
          return;
        case 'blank':
          setBlank(action.blank);
          return;
        case 'unblank':
          setBlank(null);
          return;
        case 'swallow':
          return;
        default:
          return;
      }
    };
    const onFullscreen = () => setFullscreen(isFullscreen());
    const onPointerMove = (event: PointerEvent) => {
      if (live.current.laser) setPointer({ x: event.clientX, y: event.clientY });
      const box = root.current?.getBoundingClientRect();
      if (!box) return;
      const inZone =
        event.clientY >= box.bottom - BAR_ZONE.height && event.clientX <= box.left + BAR_ZONE.width;
      if (inZone) showBar();
      else if (!barHover.current) glanceBar();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('pointermove', onPointerMove);
      window.clearTimeout(digitTimer.current);
      window.clearTimeout(barTimer.current);
    };
  });

  /* the channel to the presenter window: the audience reports its state and follows goto */
  useMountEffect(() => {
    const onMessage = (message: PresentMessage) => {
      const state = live.current;
      switch (message.type) {
        case 'hello':
          postState();
          return;
        case 'goto': {
          /* the presenter's move: a slide at its start or at the state after a step */
          const at: ClockEntry =
            message.step === undefined || message.step === 0 ? 'start' : message.step;
          if (message.slideId === state.activeId) {
            const slideClock = clock.current;
            if (slideClock === null || message.step === undefined) return;
            if (message.step === slideClock.step() + 1) slideClock.next();
            else if (message.step !== slideClock.step()) slideClock.go(message.step);
            return;
          }
          if (state.play.some((s) => s.id === message.slideId)) {
            entry.current = { slideId: message.slideId, at };
            state.onGoto(message.slideId);
          }
          return;
        }
        case 'present':
          if (!message.on) exit();
          return;
        default:
          return;
      }
    };
    const opened = openPresentChannel(deckId, 'audience', onMessage);
    channel.current = opened;
    const postState = () => {
      const state = live.current;
      const current = state.play[state.index];
      opened.post({
        type: 'state',
        slideId: current?.id ?? state.activeId,
        index: state.index,
        total: state.total,
        blank: state.blank,
        laser: state.laser,
        ...stepFacts(stepsRef.current, current?.id ?? state.activeId),
      });
    };
    postState();
    return () => {
      opened.post({ type: 'bye' });
      opened.close();
      channel.current = null;
    };
  });

  /* every change of the facts reaches the presenter window */
  useEffect(() => {
    const shown = play[index];
    const slideId = shown?.id ?? activeId;
    channel.current?.post({
      type: 'state',
      slideId,
      index,
      total,
      blank,
      laser,
      ...stepFacts(steps, slideId),
    });
  }, [activeId, index, total, blank, laser, play, steps]);

  const closePopover = useCallback(
    (refocus: HTMLElement | null) => {
      setPopover(null);
      refocus?.focus();
      fadeBar();
    },
    [fadeBar],
  );

  const onMenuSelect = (item: MenuItem) => {
    switch (item.id) {
      case 'present.options.notes':
        openNotes();
        break;
      case 'present.options.laser':
        setLaser((on) => !on);
        break;
      case 'present.options.fullScreen':
        toggleFullscreen();
        break;
      case 'present.options.more.print':
        window.print();
        break;
      case 'present.options.more.shortcuts':
        setPopover('shortcuts');
        return;
      case 'present.options.exit':
        exit();
        break;
      case 'present.options.playShaders.on':
      case 'present.options.playShaders.show':
      case 'present.options.playShaders.off':
        pickPlayShaders(item.id.slice('present.options.playShaders.'.length) as PlayShaders);
        break;
      default:
        break;
    }
    closePopover(optionsAnchor);
  };

  /* Tools > Advanced tools is remembered per browser (docs/FOCUS.md 3.1); the show reads it once
     it is on the client so its two Later stubs (Auto-play, More > Download as PDF) hide and show
     with the editor's rows. The Options menu is built only when opened, so no server markup reads it. */
  const [advancedTools, setAdvancedTools] = useState(false);
  /* View > Play shaders (docs/archive/rounds/FEATURES.md 5.6): read once on the client, written on a pick, so
     the editor's View row reads the same record on its next open */
  const [playShaders, setPlayShaders] = useState<PlayShaders>('show');
  useMountEffect(() => {
    try {
      const stored = readStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE));
      setAdvancedTools(stored.advancedTools === true);
      if (isPlayShaders(stored.playShaders)) setPlayShaders(stored.playShaders);
    } catch {
      // private mode or storage refused: the default view
    }
  });
  const pickPlayShaders = (value: PlayShaders) => {
    setPlayShaders(value);
    try {
      const stored = readStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE));
      window.localStorage.setItem(
        SETTINGS_STORAGE,
        writeStoredSettings({ ...stored, playShaders: value }),
      );
    } catch {
      // private mode: the pick holds for the show
    }
  };
  const context: MenuContext = useMemo(
    () => ({
      ...DEFAULT_MENU_CONTEXT,
      platform,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools, playShaders },
    }),
    [platform, advancedTools, playShaders],
  );

  const classes = ['ts-slideshow'];
  if (laser) classes.push('is-laser');
  if (blank !== null) classes.push('is-blank');

  return (
    <div
      ref={root}
      className={classes.join(' ')}
      data-control="present.show"
      data-index={index}
      data-total={total}
      data-blank={blank ?? undefined}
      data-laser={laser ? 'true' : undefined}
      data-slide-id={play[index]?.id}
      data-step={steps.slideId === play[index]?.id ? steps.step : 0}
      data-steps={steps.slideId === play[index]?.id ? steps.steps : 0}
    >
      <PresentToolbar
        index={index}
        total={total}
        shown={barShown || popover !== null}
        laser={laser}
        fullscreen={fullscreen}
        listOpen={popover === 'list'}
        optionsOpen={popover === 'options'}
        platform={platform}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
        onList={(anchor) => {
          listAnchor.current = anchor;
          setPopover((open) => (open === 'list' ? null : 'list'));
        }}
        onLaser={() => setLaser((on) => !on)}
        onFullscreen={toggleFullscreen}
        onExit={exit}
        onOptions={(anchor) => {
          setOptionsAnchor(anchor);
          setPopover((open) => (open === 'options' ? null : 'options'));
        }}
        onPointerEnter={() => {
          barHover.current = true;
          showBar();
        }}
        onPointerLeave={() => {
          barHover.current = false;
          fadeBar();
        }}
        listId={LIST_ID}
        optionsId={OPTIONS_ID}
        icons={ICONS}
        tip={tip}
      />
      {popover === 'list' ? (
        <SlideList
          id={LIST_ID}
          slides={play}
          index={index}
          theme={theme}
          placement="up"
          layer={useLayer}
          onSelect={(to) => {
            closePopover(listAnchor.current);
            goto(to);
          }}
          onClose={() => closePopover(listAnchor.current)}
        />
      ) : null}
      {popover === 'options' && optionsAnchor !== null ? (
        <Menu
          id={OPTIONS_ID}
          items={optionsItems({ laser, fullscreen })}
          context={context}
          label={PRESENT_TEXT.options}
          anchor={{ kind: 'element', element: optionsAnchor }}
          placement="below"
          onSelect={onMenuSelect}
          onClose={() => {
            /* a select already moved on (to the shortcuts card, or closed the menu itself) */
            setPopover((open) => (open === 'options' ? null : open));
            fadeBar();
          }}
          returnFocusTo={optionsAnchor}
          autoFocus
        />
      ) : null}
      {popover === 'shortcuts' ? (
        <PresentShortcuts
          platform={platform}
          layer={useLayer}
          onClose={() => closePopover(optionsAnchor)}
          icons={ICONS}
          tip={tip}
        />
      ) : null}
      {ended ? (
        <div
          className="ts-present-end"
          data-control="present.end"
          role="button"
          tabIndex={-1}
          aria-label={PRESENT_TEXT.endOfShow}
          onClick={exit}
        >
          <span>
            {PRESENT_TEXT.endOfShow}
            <small>Click to leave the slideshow</small>
          </span>
        </div>
      ) : null}
      {blank !== null ? <BlankLayer blank={blank} onDismiss={() => setBlank(null)} /> : null}
      {laser ? <LaserPointer x={pointer.x} y={pointer.y} /> : null}
      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </div>
  );
}
