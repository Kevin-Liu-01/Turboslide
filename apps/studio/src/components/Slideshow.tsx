import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@turboslide/chrome/icons';
import { SETTINGS_STORAGE, readStoredSettings } from '@turboslide/chrome/editor-shell';
import { Menu } from '@turboslide/chrome/Menu';
import { detectPlatform } from '@turboslide/chrome/menus/keys';
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
import { openPresentChannel } from '@turboslide/viewer/present/presentSync';
import type { PresentChannel, PresentMessage } from '@turboslide/viewer/present/presentSync';
import { PresentToolbar } from '@turboslide/viewer/present/PresentToolbar';
import { SlideList } from '@turboslide/viewer/present/SlideList';
import { BlankLayer, LaserPointer } from '@turboslide/viewer/present/SlideshowLayer';
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
 * The slideshow surface (gslides-parity SPEC 9.2; MILESTONES B6 item 2), mounted over the sheet
 * while the shell is in present mode by the viewer (DeckViewer) and the editor. It composes the
 * viewer's present pieces with the chrome's primitives the viewer cannot import (the one Menu,
 * the Snackbar, the Tooltip, the Heroicons): every presenting key of Google's table, the toolbar
 * at the bottom left with its slide list and Options menu, the black and white slides, the laser
 * pointer, the counter over the unskipped slides, and the channel to the presenter window. The
 * show owns navigation while it is up: the keys and clicks move through the play list the caller
 * hands in (skipped slides already left out) and every move is one `onGoto`, the same select the
 * shell and `view.goto` use, so an agent's goto moves the show and the presenter window alike.
 * Nothing here talks to the network: the deck is in memory (R07 rule 29).
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
};

type Popover = 'list' | 'options' | 'shortcuts' | null;

/** How long the toolbar stays after the pointer leaves its corner (SPEC 9.2). */
const BAR_FADE_MS = 2000;
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
      label: PRESENT_TEXT.pen,
      status: 'later',
      stubReason: PRESENT_TEXT.penStub,
      icon: 'pencil',
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
}: SlideshowProps) {
  const play = useMemo(() => playList(slides), [slides]);
  const index = currentPlayIndex(slides, play, activeId);
  const total = play.length;
  const platform: PresentPlatform = useMemo(() => detectPlatform(), []);

  const [blank, setBlank] = useState<BlankSlide | null>(null);
  const [laser, setLaser] = useState(false);
  const [pointer, setPointer] = useState({ x: -100, y: -100 });
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [barShown, setBarShown] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const [optionsAnchor, setOptionsAnchor] = useState<HTMLElement | null>(null);
  const snackbar = useSnackbar();

  const root = useRef<HTMLDivElement>(null);
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

  const goto = useCallback((to: number) => {
    const target = live.current.play[to];
    if (target !== undefined && target.id !== live.current.activeId) live.current.onGoto(target.id);
  }, []);
  const step = useCallback(
    (delta: number) => goto(stepPlayIndex(live.current.index, delta, live.current.total)),
    [goto],
  );

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

  /* a show that opens on a skipped slide moves to the next unskipped one */
  useEffect(() => {
    if (total > 0 && !play.some((slide) => slide.id === activeId)) goto(index);
  }, [activeId, play, index, total, goto]);

  /* the presenting facts, for describe().state */
  useEffect(() => {
    onState?.({ blank, laser, fullscreen });
  }, [blank, laser, fullscreen, onState]);

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
      else if (!barHover.current) fadeBar();
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
        case 'goto':
          if (
            message.slideId !== state.activeId &&
            state.play.some((s) => s.id === message.slideId)
          )
            state.onGoto(message.slideId);
          return;
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
    });
  }, [activeId, index, total, blank, laser, play]);

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
      default:
        break;
    }
    closePopover(optionsAnchor);
  };

  /* Tools > Advanced tools is remembered per browser (docs/FOCUS.md 3.1); the show reads it once
     it is on the client so its two Later stubs (Auto-play, More > Download as PDF) hide and show
     with the editor's rows. The Options menu is built only when opened, so no server markup reads it. */
  const [advancedTools, setAdvancedTools] = useState(false);
  useMountEffect(() => {
    try {
      setAdvancedTools(
        readStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE)).advancedTools === true,
      );
    } catch {
      // private mode or storage refused: the default view
    }
  });
  const context: MenuContext = useMemo(
    () => ({
      ...DEFAULT_MENU_CONTEXT,
      platform,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools },
    }),
    [platform, advancedTools],
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
          onClose={() => closePopover(optionsAnchor)}
          icons={ICONS}
          tip={tip}
        />
      ) : null}
      {blank !== null ? <BlankLayer blank={blank} onDismiss={() => setBlank(null)} /> : null}
      {laser ? <LaserPointer x={pointer.x} y={pointer.y} /> : null}
      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </div>
  );
}
