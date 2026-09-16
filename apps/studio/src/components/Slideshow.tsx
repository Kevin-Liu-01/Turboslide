import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@turboslide/chrome/icons';
import { Menu } from '@turboslide/chrome/Menu';
import { detectPlatform } from '@turboslide/chrome/menus/keys';
import { DEFAULT_MENU_CONTEXT, shortcut } from '@turboslide/chrome/menus/model';
import type { MenuContext, MenuItem } from '@turboslide/chrome/menus/model';
import { SNACKBARS } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { MOTION_BASE_CSS, motionCss } from '@turboslide/render/motion';
import type { MotionSchedule } from '@turboslide/schema/motion';
import { DEFAULT_PAGE } from '@turboslide/schema/render';
import type { Page } from '@turboslide/schema/render';
import type { ViewerSlide } from '@turboslide/viewer/model';
import { MEDIA_SEEK_MS, presentKeyAction } from '@turboslide/viewer/present/presentKeys';
import type { PresentPlatform } from '@turboslide/viewer/present/presentKeys';
import {
  AUTO_PLAY_INTERVALS_MS,
  autoPlayLabel,
  currentPlayIndex,
  motionOf,
  nextPosition,
  playList,
  previousPosition,
  slideNumberOf,
  stepCount,
  stepCounterText,
} from '@turboslide/viewer/present/presentModel';
import type { BlankSlide } from '@turboslide/viewer/present/presentModel';
import { PresentShortcuts } from '@turboslide/viewer/present/PresentShortcuts';
import { openPresentChannel } from '@turboslide/viewer/present/presentSync';
import type {
  PresentChannel,
  PresentMediaState,
  PresentMessage,
  PresentStroke,
} from '@turboslide/viewer/present/presentSync';
import { PresentToolbar } from '@turboslide/viewer/present/PresentToolbar';
import { SlideList } from '@turboslide/viewer/present/SlideList';
import {
  attachMotionLayer,
  BlankLayer,
  createMediaController,
  LaserPointer,
  mergeStroke,
  MOTION_STYLE_ID,
  PenLayer,
  playTransition,
  prefersReducedMotion,
  setMotionStyle,
} from '@turboslide/viewer/present/SlideshowLayer';
import type {
  MediaControllerLike,
  MotionLayer,
  TransitionRun,
} from '@turboslide/viewer/present/SlideshowLayer';
import { PRESENT_TEXT } from '@turboslide/viewer/present/strings';
import { isControlTarget, isEditableTarget } from '@turboslide/viewer/present/ui';
import type { PresentIcons, PresentTip } from '@turboslide/viewer/present/ui';
import type { Theme } from '@turboslide/viewer/theme';

import {
  exitPresentFullscreen,
  openPresenterView,
  requestPresentFullscreen,
} from './presentActions';
import { useMountEffect } from './useMountEffect';

import './Slideshow.css';

/**
 * The slideshow surface (gslides-parity SPEC 9.2; MILESTONES B6 item 2; round five SPEC-5 2.2,
 * MILESTONES-5 B1 days 4 and 7), mounted over the sheet while the shell is in present mode by the
 * viewer (DeckViewer) and the editor. It composes the viewer's present pieces with the chrome's
 * primitives the viewer cannot import (the one Menu, the Snackbar, the Tooltip, the Heroicons):
 * every presenting key of Google's table, the toolbar at the bottom left with its slide list and
 * Options menu, the black and white slides, the laser pointer, the counter over the unskipped
 * slides, and the channel to the presenter window. The show owns navigation while it is up: a
 * next consumes a step of the current slide's schedule before the slide moves, a previous
 * reverses a step before the slide moves back, and every slide move is one `onGoto`, the same
 * select the shell and `view.goto` use, so an agent's goto moves the show and the presenter
 * window alike.
 *
 * Motion (SPEC-5 2.2; the contract of build-5/b1.md): the schedule of a slide rides on the viewer
 * slide as `motion` (or arrives in `schedules`); the show loads `MOTION_BASE_CSS` plus every
 * slide's `motionCss` into one `<style id="ts-motion-show">`, attaches the motion layer to the
 * rendered slide root the stage mounted (`data-block` and the stamped `data-para` address the
 * nodes) and plays the steps through it; a transition keeps a clone of the outgoing slide's
 * wrapper in the stage for its duration beside the incoming one, `data-transition` on the stage,
 * `is-leaving` and `is-entering` on the two roots; going back plays the outgoing slide's
 * transition reversed. Reduced motion sets every duration to 0 and keeps the step gates. A click
 * on the sheet is caught before the stage's own handler so it advances a step, not a slide.
 * Auto-play advances one step per tick and pauses on a click or a key; the pen draws over the
 * stage and mirrors its strokes to the other windows; the in show downloads open the Download
 * dialog through the host. Nothing here talks to the network: the deck is in memory (R07 rule 29).
 */
export type SlideshowState = {
  blank: BlankSlide | null;
  laser: boolean;
  fullscreen: boolean;
  /** the step reached on the current slide and the slide's click steps (SPEC-5 2.2) */
  step: number;
  steps: number;
  autoPlay: { intervalMs: number; loop: boolean; running: boolean };
  pen: boolean;
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
  /** the deck's page in sheet px (SPEC-5 6.1); 1600 by 900 when absent */
  page?: Page;
  /** the schedules by slide id when the host compiled them; else `motionOf(slide)` */
  schedules?: Readonly<Record<string, MotionSchedule>>;
  /** B2's media controller (SPEC-5 0.17); the elements never mount without one */
  media?: MediaControllerLike;
  /** Download as PDF and Download as PPTX inside the show open the host's Download dialog (SPEC-5 0.15) */
  onDownload?: (format: 'pdf' | 'pptx') => void;
};

type Popover = 'list' | 'options' | 'shortcuts' | null;

/** How long the toolbar stays after the pointer leaves its corner (SPEC 9.2). */
const BAR_FADE_MS = 2000;
/** The corner of the stage that shows the toolbar: this far up from the bottom and in from the left. */
const BAR_ZONE = { height: 120, width: 560 };
/** How long typed digits wait for Enter. */
const DIGIT_HOLD_MS = 1500;
/** The Auto-play interval a show starts with (R01 4: the setting is set again each time the show starts). */
const AUTO_PLAY_DEFAULT_MS = 5000;

const LIST_ID = 'ts-slideshow-list';
const OPTIONS_ID = 'ts-slideshow-options';

/** The present stage the show drives: the stage root of the sheet in present mode. */
const PRESENT_STAGE = '.ts-stagewrap.is-present .ts-stage';
const PRESENT_SHEET = '.ts-stagewrap.is-present .sheet';

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

function attr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** The Options menu (SPEC 9.2's table; SPEC-5 2.2), built per render so the toggles read their state. */
function optionsItems(state: {
  laser: boolean;
  fullscreen: boolean;
  pen: boolean;
  autoPlay: SlideshowState['autoPlay'];
  downloads: boolean;
}): MenuItem[] {
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
      status: 'now',
      effect: { kind: 'submenu' },
      google: 'Auto-play',
      doc: 'Advances one step at an interval; a click or a key pauses it',
      items: [
        ...AUTO_PLAY_INTERVALS_MS.map((ms): MenuItem => ({
          id: `present.options.autoPlay.${ms}`,
          label: autoPlayLabel(ms),
          status: 'now',
          effect: run,
          ...(state.autoPlay.intervalMs === ms ? { icon: 'check' } : {}),
          doc: 'Each tick is one advance: a step or a slide change',
        })),
        {
          id: 'present.options.autoPlay.play',
          label: state.autoPlay.running ? PRESENT_TEXT.autoPlayPause : PRESENT_TEXT.autoPlayPlay,
          status: 'now',
          effect: run,
          dividerBefore: true,
          doc: state.autoPlay.running
            ? 'Holds the show where it is'
            : 'Starts advancing at the interval',
        },
        {
          id: 'present.options.autoPlay.loop',
          label: PRESENT_TEXT.autoPlayLoop,
          status: 'now',
          effect: run,
          ...(state.autoPlay.loop ? { icon: 'check' } : {}),
          doc: 'Restarts from the first slide after the last',
        },
      ],
    },
    {
      id: 'present.options.laser',
      label: state.laser ? PRESENT_TEXT.laserOff : PRESENT_TEXT.laserOn,
      status: 'now',
      effect: run,
      key: shortcut('L', 'L'),
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
      id: 'present.options.pen',
      label: state.pen ? PRESENT_TEXT.penOff : PRESENT_TEXT.pen,
      status: 'now',
      effect: run,
      key: shortcut('P', 'P'),
      icon: 'pencil',
      doc: 'Draws over the slide; Esc clears the drawing',
    },
    {
      id: 'present.options.more',
      label: PRESENT_TEXT.more,
      status: 'now',
      effect: { kind: 'submenu' },
      items: [
        {
          id: 'present.options.more.pdf',
          label: PRESENT_TEXT.downloadPdf,
          status: 'now',
          effect: run,
          ...(state.downloads
            ? { doc: 'Opens the Download dialog over the show' }
            : { enabled: 'never', disabledReason: PRESENT_TEXT.downloadElsewhere }),
        },
        {
          id: 'present.options.more.pptx',
          label: PRESENT_TEXT.downloadPptx,
          status: 'now',
          effect: run,
          ...(state.downloads
            ? { doc: 'Opens the Download dialog over the show' }
            : { enabled: 'never', disabledReason: PRESENT_TEXT.downloadElsewhere }),
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

function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}

/** Where the next slide change lands and how it plays: set before `onGoto`, read when the slide mounts. */
type PendingMove = { step: number; reverse: boolean };

export function Slideshow({
  deckId,
  slides,
  activeId,
  theme,
  onGoto,
  onExit,
  say,
  onState,
  page,
  schedules: givenSchedules,
  media,
  onDownload,
}: SlideshowProps) {
  const play = useMemo(() => playList(slides), [slides]);
  const index = currentPlayIndex(slides, play, activeId);
  const total = play.length;
  const platform: PresentPlatform = useMemo(() => detectPlatform(), []);
  const pageSize: Page = page ?? DEFAULT_PAGE;

  /* the schedules per slide (SPEC-5 0.4): the host's, else what the loader attached to the slide */
  const schedules = useMemo(() => {
    const map = new Map<string, MotionSchedule>();
    for (const slide of play) {
      const schedule = givenSchedules?.[slide.id] ?? motionOf(slide);
      if (schedule !== undefined) map.set(slide.id, schedule);
    }
    return map;
  }, [play, givenSchedules]);
  const stepsOf = useMemo(
    () => play.map((slide) => stepCount(schedules.get(slide.id))),
    [play, schedules],
  );
  const steps = stepsOf[index] ?? 0;
  const css = useMemo(
    () =>
      [MOTION_BASE_CSS, ...[...schedules.values()].map((schedule) => motionCss(schedule, pageSize))]
        .filter((text) => text !== '')
        .join('\n'),
    [schedules, pageSize],
  );

  const [blank, setBlank] = useState<BlankSlide | null>(null);
  const [laser, setLaser] = useState(false);
  const [pointer, setPointer] = useState({ x: -100, y: -100 });
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [barShown, setBarShown] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const [optionsAnchor, setOptionsAnchor] = useState<HTMLElement | null>(null);
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState<SlideshowState['autoPlay']>({
    intervalMs: AUTO_PLAY_DEFAULT_MS,
    loop: false,
    running: false,
  });
  const [pen, setPen] = useState(false);
  const [strokes, setStrokes] = useState<PresentStroke[]>([]);
  const [playingMedia, setPlayingMedia] = useState<PresentMediaState[]>([]);
  const snackbar = useSnackbar();

  const root = useRef<HTMLDivElement>(null);
  const barHover = useRef(false);
  const barTimer = useRef(0);
  const digits = useRef('');
  const digitTimer = useRef(0);
  const audienceTold = useRef(false);
  const channel = useRef<PresentChannel | null>(null);
  const listAnchor = useRef<HTMLElement | null>(null);
  const layer = useRef<MotionLayer | null>(null);
  const transition = useRef<TransitionRun | null>(null);
  const leavingClone = useRef<HTMLElement | null>(null);
  const pending = useRef<PendingMove | null>(null);
  const lastId = useRef<string | null>(null);
  /* B2's media controller (SPEC-5 0.17): the host's, else one per show over the show's root */
  const ownMedia = useRef<MediaControllerLike | null>(null);
  const mediaRef = useRef<MediaControllerLike | null>(null);
  if (media !== undefined) mediaRef.current = media;
  else {
    ownMedia.current ??= createMediaController({
      origin: typeof window === 'undefined' ? undefined : window.location.origin,
      onSoundOff: () => live.current.say(PRESENT_TEXT.soundOff),
    });
    mediaRef.current = ownMedia.current;
  }
  const mediaController = (): MediaControllerLike => mediaRef.current as MediaControllerLike;

  /* the latest facts for the mount-time listeners */
  const live = useRef({
    play,
    index,
    total,
    blank,
    laser,
    popover,
    activeId,
    onGoto,
    onExit,
    say,
    step,
    steps,
    stepsOf,
    autoPlay,
    pen,
    strokes,
    schedules,
    onDownload,
  });
  live.current = {
    play,
    index,
    total,
    blank,
    laser,
    popover,
    activeId,
    onGoto,
    onExit,
    say,
    step,
    steps,
    stepsOf,
    autoPlay,
    pen,
    strokes,
    schedules,
    onDownload,
  };

  /** Moves the show to a play list position at a step; `reverse` plays the outgoing transition backwards. */
  const goto = useCallback((to: number, at: number = 0, reverse = false) => {
    const target = live.current.play[to];
    if (target === undefined) return;
    if (target.id === live.current.activeId) {
      // the same slide: seek or play the step in place
      const current = layer.current;
      if (current !== null) {
        if (at === live.current.step + 1) current.play(at);
        else current.seek(at);
      }
      setStep(Math.max(0, Math.min(at, live.current.steps)));
      return;
    }
    pending.current = { step: at, reverse };
    live.current.onGoto(target.id);
  }, []);

  const pauseAutoPlay = useCallback(() => {
    if (live.current.autoPlay.running) setAutoPlay((state) => ({ ...state, running: false }));
  }, []);

  /** A next (SPEC-5 2.2): the next step while one remains, else the next slide at step 0. */
  const advance = useCallback(
    (fromTimer = false) => {
      const state = live.current;
      const next = nextPosition(state.index, state.step, state.total, state.stepsOf);
      const moveOn = (): void => {
        if (next === null) {
          if (fromTimer) {
            if (state.autoPlay.loop) goto(0, 0);
            else setAutoPlay((current) => ({ ...current, running: false }));
          }
          return;
        }
        if (next.index === state.index) {
          layer.current?.play(next.step);
          setStep(next.step);
        } else goto(next.index, 0, false);
      };
      // the click media with no Play row play on the first click after the slide's own steps
      // (R11 5.4); the slide moves on the click after that
      const controller = mediaController();
      const slideRoot = slideRootOf(state.activeId);
      if (
        state.step >= state.steps &&
        !fromTimer &&
        slideRoot !== null &&
        controller.playClickMedia
      ) {
        const played = controller.playClickMedia(slideRoot);
        if (played === true) return;
        if (played instanceof Promise) {
          played.then((did) => (did ? undefined : moveOn())).catch(() => moveOn());
          return;
        }
      }
      moveOn();
    },
    [goto],
  );

  /** A previous (SPEC-5 0.14): the state before the step, else the previous slide at its last step. */
  const back = useCallback(() => {
    const state = live.current;
    const previous = previousPosition(state.index, state.step, state.total, state.stepsOf);
    if (previous === null) return;
    if (previous.index === state.index) {
      layer.current?.seek(previous.step);
      setStep(previous.step);
    } else goto(previous.index, previous.step, true);
  }, [goto]);

  const exit = useCallback(() => {
    exitPresentFullscreen();
    live.current.onExit();
  }, []);

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
  const fadeBar = useCallback(() => {
    window.clearTimeout(barTimer.current);
    barTimer.current = window.setTimeout(() => {
      if (!barHover.current && live.current.popover === null) setBarShown(false);
    }, BAR_FADE_MS);
  }, []);

  const clearStrokes = useCallback((tell = true) => {
    setStrokes((current) => (current.length === 0 ? current : []));
    if (tell) channel.current?.post({ type: 'strokesClear', slideId: live.current.activeId });
  }, []);

  /* a show that opens on a skipped slide moves to the next unskipped one */
  useEffect(() => {
    if (total > 0 && !play.some((slide) => slide.id === activeId)) goto(index);
  }, [activeId, play, index, total, goto]);

  /* the presenting facts, for describe().state */
  useEffect(() => {
    onState?.({ blank, laser, fullscreen, step, steps, autoPlay, pen });
  }, [blank, laser, fullscreen, step, steps, autoPlay, pen, onState]);

  /* the show's stylesheet: the base rules and every slide's rules, one element (SPEC-5 2.2) */
  useEffect(() => {
    setMotionStyle(document, MOTION_STYLE_ID, css);
  }, [css]);
  useMountEffect(() => () => {
    document.getElementById(MOTION_STYLE_ID)?.remove();
  });

  /* the motion layer over the mounted slide, and the transition into it (SPEC-5 2.2) */
  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>(PRESENT_STAGE);
    const move = pending.current;
    pending.current = null;
    const previousId = lastId.current;
    lastId.current = activeId;
    layer.current?.unmount();
    layer.current = null;
    transition.current?.cancel();
    transition.current = null;
    leavingClone.current?.remove();
    leavingClone.current = null;
    clearStrokes(previousId !== null);
    if (stage === null) return;
    const slideRoot = slideRootOf(activeId, stage);
    if (slideRoot === null) return;
    const schedule = schedules.get(activeId);
    const reduced = prefersReducedMotion();
    const controller = mediaController();
    const attached =
      schedule === undefined
        ? null
        : attachMotionLayer(slideRoot, schedule, { reduced, media: controller });
    layer.current = attached;
    if (attached !== null) attached.mount();
    else controller.mount(slideRoot);
    const target = move?.step ?? 0;
    const reverse = move?.reverse === true;
    const finish = (): void => {
      if (attached === null) {
        setStep(0);
        return;
      }
      // forward (or a jump): step 0 plays as the entry step; going back: the state at the step
      if (reverse) attached.seek(target);
      else if (target <= 0) attached.play(0);
      else attached.seek(target);
      setStep(Math.max(0, Math.min(target, stepCount(schedule))));
    };
    const kind = reverse
      ? ((previousId === null ? undefined : schedules.get(previousId)?.transition) ?? null)
      : (schedule?.transition ?? null);
    if (previousId === null || kind === null || reduced) {
      finish();
      return;
    }
    // the outgoing slide: a clone of the wrapper the stage is fading out, kept for the duration
    const leaving = stage.querySelector<HTMLElement>('.pt-slide.is-leaving');
    const incoming = slideRoot.closest<HTMLElement>('.pt-slide');
    let clone: HTMLElement | null = null;
    if (leaving !== null) {
      clone = leaving.cloneNode(true) as HTMLElement;
      clone.classList.remove('is-leaving');
      clone.classList.add('ts-motion-leaving');
      clone.setAttribute('aria-hidden', 'true');
      clone.style.animation = 'none';
      clone.style.zIndex = reverse && kind.kind === 'dissolve' ? '3' : '1';
      leaving.style.display = 'none';
      stage.appendChild(clone);
      leavingClone.current = clone;
    }
    if (incoming !== null) {
      incoming.style.animation = 'none';
      incoming.style.zIndex = '2';
    }
    const outgoingRoot = clone?.querySelector<HTMLElement>('[data-slide]') ?? null;
    transition.current = playTransition(stage, slideRoot, outgoingRoot, kind, {
      scopeSlideId: reverse ? (previousId ?? activeId) : activeId,
      reverse,
      reduced,
      onDone: () => {
        clone?.remove();
        if (leavingClone.current === clone) leavingClone.current = null;
        if (incoming !== null) incoming.style.zIndex = '';
        transition.current = null;
        finish();
      },
    });
    // the state cannot depend on the callbacks, which read the refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, schedules]);

  useMountEffect(() => () => {
    layer.current?.unmount();
    layer.current = null;
    transition.current?.cancel();
    leavingClone.current?.remove();
    ownMedia.current?.destroy?.();
    ownMedia.current = null;
  });

  /* Auto-play (SPEC-5 2.2, R01 4): one advance per tick */
  useEffect(() => {
    if (!autoPlay.running) return;
    const timer = window.setInterval(() => advance(true), autoPlay.intervalMs);
    return () => window.clearInterval(timer);
  }, [autoPlay.running, autoPlay.intervalMs, advance]);

  /* the media controller's state reaches the presenter (R11 5.6) */
  useEffect(() => {
    const controller = mediaController();
    return controller.onState((state) => {
      setPlayingMedia((rows) => {
        const rest = rows.filter((row) => row.blockId !== state.blockId);
        return state.state === 'ended' ? rest : [...rest, state];
      });
      channel.current?.post({ type: 'media', media: state });
    });
  }, [media]);

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
      const mediaKey =
        action.type === 'mediaToggle' ||
        action.type === 'mediaRewind' ||
        action.type === 'mediaForward';
      if (action.type !== 'swallow' && !mediaKey) pauseAutoPlay();
      switch (action.type) {
        case 'exit':
          if (state.pen || state.strokes.length > 0) {
            // Esc clears the drawing first (SPEC-5 0.15) and leaves the pen
            clearStrokes();
            setPen(false);
            return;
          }
          exit();
          return;
        case 'next':
          advance();
          return;
        case 'previous':
          back();
          return;
        case 'first':
          goto(0, 0);
          return;
        case 'last':
          goto(state.total - 1, 0);
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
          else goto(n - 1, 0);
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
        case 'pen':
          setPen((on) => !on);
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
        /* K, U and O (gslides-parity SPEC-5 3.5, 15; Google's Video player table): the media of the
           current slide, the playing one first, else its first poster root; a slide without media
           swallows the key like any other letter */
        case 'mediaToggle':
        case 'mediaRewind':
        case 'mediaForward': {
          const controller = mediaController();
          const slideRoot = slideRootOf(state.activeId);
          const ids = Array.from(
            slideRoot?.querySelectorAll<HTMLElement>('.ts-media[data-media]') ?? [],
          )
            .map((root) => root.getAttribute('data-media') ?? '')
            .filter((id) => id !== '');
          const blockId = ids.find((id) => controller.stateOf?.(id)?.state === 'playing') ?? ids[0];
          if (blockId === undefined) return;
          if (action.type === 'mediaToggle') void controller.toggle?.(blockId);
          else
            controller.seek?.(
              blockId,
              action.type === 'mediaRewind' ? -MEDIA_SEEK_MS : MEDIA_SEEK_MS,
            );
          return;
        }
        case 'swallow':
          return;
        default:
          return;
      }
    };
    /* a click on the sheet advances a step, caught before the stage's own handler moves the slide */
    const onClickCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(PRESENT_SHEET) === null) return;
      const controller = mediaController();
      // the first click after a blocked autoplay brings the sound back (SPEC-5 0.21)
      controller.unmuteAll?.();
      // a click on a media root is the controller's (R11 5.5) and never advances
      if (controller.handleClick?.(target) === true) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      if (target.closest('a, button, input, textarea, select, [data-media]') !== null) return;
      if (live.current.blank !== null) return;
      event.stopPropagation();
      event.preventDefault();
      pauseAutoPlay();
      advance();
    };
    const onFullscreen = () => setFullscreen(isFullscreen());
    const onPointerMove = (event: PointerEvent) => {
      if (live.current.laser) setPointer({ x: event.clientX, y: event.clientY });
      const box = root.current?.getBoundingClientRect();
      if (!box) return;
      const inZone =
        event.clientY >= box.bottom - BAR_ZONE.height && event.clientX <= box.left + BAR_ZONE.width;
      if (inZone) showBar();
      else if (!barHover.current) fadeBar();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClickCapture, true);
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
          const at = state.play.findIndex((s) => s.id === message.slideId);
          if (at < 0) return;
          pauseAutoPlay();
          if (message.slideId === state.activeId) {
            if (message.step !== undefined) goto(at, message.step);
            return;
          }
          goto(at, message.step ?? 0, at < state.index);
          return;
        }
        case 'present':
          if (!message.on) exit();
          return;
        case 'mediaControl': {
          const controller = mediaController();
          if (message.action === 'play') void controller.play(message.blockId);
          else if (message.action === 'pause') controller.pause(message.blockId);
          else void controller.restart(message.blockId);
          return;
        }
        case 'stroke':
          if (message.stroke.slideId === state.activeId)
            setStrokes((rows) => mergeStroke(rows, message.stroke));
          return;
        case 'strokesClear':
          if (message.slideId === state.activeId) clearStrokes(false);
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
        step: state.step,
        steps: state.steps,
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
    const current = play[index];
    channel.current?.post({
      type: 'state',
      slideId: current?.id ?? activeId,
      index,
      total,
      blank,
      laser,
      step,
      steps,
    });
  }, [activeId, index, total, blank, laser, play, step, steps]);

  const closePopover = useCallback(
    (refocus: HTMLElement | null) => {
      setPopover(null);
      refocus?.focus();
      fadeBar();
    },
    [fadeBar],
  );

  const onMenuSelect = (item: MenuItem) => {
    const interval = /^present\.options\.autoPlay\.(\d+)$/.exec(item.id);
    if (interval !== null) {
      const ms = Number(interval[1]);
      setAutoPlay((state) => ({ ...state, intervalMs: ms, running: true }));
      closePopover(optionsAnchor);
      return;
    }
    switch (item.id) {
      case 'present.options.notes':
        openNotes();
        break;
      case 'present.options.autoPlay.play':
        setAutoPlay((state) => ({ ...state, running: !state.running }));
        break;
      case 'present.options.autoPlay.loop':
        setAutoPlay((state) => ({ ...state, loop: !state.loop }));
        break;
      case 'present.options.laser':
        setLaser((on) => !on);
        break;
      case 'present.options.pen':
        setPen((on) => !on);
        break;
      case 'present.options.fullScreen':
        toggleFullscreen();
        break;
      case 'present.options.more.pdf':
        onDownload?.('pdf');
        break;
      case 'present.options.more.pptx':
        onDownload?.('pptx');
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
      default:
        break;
    }
    closePopover(optionsAnchor);
  };

  const context: MenuContext = useMemo(() => ({ ...DEFAULT_MENU_CONTEXT, platform }), [platform]);

  const onStroke = useCallback((stroke: PresentStroke) => {
    setStrokes((rows) => mergeStroke(rows, stroke));
    channel.current?.post({ type: 'stroke', stroke });
  }, []);

  const classes = ['ts-slideshow'];
  if (laser) classes.push('is-laser');
  if (blank !== null) classes.push('is-blank');
  if (pen) classes.push('is-pen');
  const stepLine = stepCounterText(step, steps);

  return (
    <div
      ref={root}
      className={classes.join(' ')}
      data-control="present.show"
      data-index={index}
      data-total={total}
      data-step={step}
      data-steps={steps}
      data-blank={blank ?? undefined}
      data-laser={laser ? 'true' : undefined}
      data-pen={pen ? 'true' : undefined}
      data-autoplay={autoPlay.running ? autoPlay.intervalMs : undefined}
      data-loop={autoPlay.loop ? 'true' : undefined}
      data-slide-id={play[index]?.id}
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
        onPrevious={() => {
          pauseAutoPlay();
          back();
        }}
        onNext={() => {
          pauseAutoPlay();
          advance();
        }}
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
          onSelect={(to) => {
            closePopover(listAnchor.current);
            pauseAutoPlay();
            goto(to, 0);
          }}
          onClose={() => closePopover(listAnchor.current)}
        />
      ) : null}
      {popover === 'options' && optionsAnchor !== null ? (
        <Menu
          id={OPTIONS_ID}
          items={optionsItems({
            laser,
            fullscreen,
            pen,
            autoPlay,
            downloads: onDownload !== undefined,
          })}
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
          onClose={() => closePopover(optionsAnchor)}
          icons={ICONS}
          tip={tip}
        />
      ) : null}
      {pen || strokes.length > 0 ? (
        <PenLayer
          slideId={activeId}
          strokes={strokes}
          active={pen && blank === null}
          sheetSelector={PRESENT_SHEET}
          page={pageSize}
          onStroke={onStroke}
        />
      ) : null}
      {blank !== null ? <BlankLayer blank={blank} onDismiss={() => setBlank(null)} /> : null}
      {laser ? <LaserPointer x={pointer.x} y={pointer.y} /> : null}
      <span
        className="ts-present-announce"
        role="status"
        aria-live="polite"
        data-control="present.stepLine"
      >
        {stepLine}
      </span>
      {playingMedia.length > 0 ? (
        <span
          className="ts-present-announce"
          role="status"
          aria-live="polite"
          data-control="present.mediaLine"
        >
          {playingMedia.map((row) => `${row.title ?? row.blockId} ${row.state}`).join(', ')}
        </span>
      ) : null}
      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </div>
  );
}

/** The rendered slide root of a slide in the present stage: the one the stage is not fading out. */
function slideRootOf(slideId: string, stage?: HTMLElement | null): HTMLElement | null {
  const scope = stage ?? document.querySelector<HTMLElement>(PRESENT_STAGE);
  if (!scope) return null;
  return scope.querySelector<HTMLElement>(
    `.pt-slide:not(.is-leaving):not(.ts-motion-leaving) [data-slide="${attr(slideId)}"]`,
  );
}
