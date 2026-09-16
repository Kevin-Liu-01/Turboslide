// The media controller of the show (gslides-parity SPEC-5 0.17, 0.21, 3.5; R11 5; MILESTONES-5 B2
// day 4): the one piece of code that mounts `<audio>`, `<video>` and the YouTube iframe, over the
// poster roots `renderSlide` emits (`.ts-media[data-media]`, render/blocks/media.ts). The show
// (apps/studio Slideshow, B1) calls `mount(slideRoot)` when a slide shows and `unmount(slideRoot)`
// when it leaves; B1's step advance calls `play(blockId)` for every Play effect of the step; the
// presenter's `mediaControl` message calls `play`, `pause` and `restart`; `onState` reports every
// state change for the console's "Playing: <title> 0:42 / 2:10" row and the channel's `media`
// message. The standalone motion script (B1, viewer/standalone/motion.ts) ports this module.
//
// The rules of R11 5: the eight fields ride on the root's data attributes and run through
// `currentTime`, a re-armed `timeupdate` timer for End at, `loop` (the attribute for a whole file,
// the range loop otherwise), `muted` and `volume`; a video lives in its slide root and unmounts
// with the slide; an audio with Stop on slide change off moves to a deck level layer
// (`#ts-media-layer`, a child of the show's root, never of a slide) and keeps playing across
// slides until the show ends, the deck's last slide passes or its slide returns; `manual` roots
// are controls (a click, Enter or Space toggles and never advances); `click` roots with no Play
// row play on the first click after the slide's own steps are exhausted (`playClickMedia`);
// `auto` roots play from the schedule's Play step. `play()` that rejects with `NotAllowedError`
// sets `muted`, plays again and reports `soundOff` once; the next click `unmuteAll()`s. The
// YouTube iframe mounts on youtube-nocookie.com with the player parameters of R11 4.2 and the
// IFrame API through a nonced loader; nothing is drawn over it and only one automatic player per
// slide is ever asked to play (the insert downgrades the second).
//
// The DOM is typed structurally (`RootLike`, `MediaElementLike`, `DocumentLike`) so the unit test
// drives fakes in Node; a browser's elements satisfy the shapes as they are.
import type { PresentMediaState } from './presentSync';

export const MEDIA_ROOT_SELECTOR = '.ts-media[data-media]';
/** The speaker spotlight roots the show fills with the presenter's camera (SPEC-5 3.7; R11 6). */
export const SPOTLIGHT_ROOT_SELECTOR = '.ts-spotlight[data-spotlight]';
/** The class a spotlight root carries while the camera plays in it. */
export const SPOTLIGHT_LIVE_CLASS = 'is-live';
export const MEDIA_LAYER_ID = 'ts-media-layer';
export const MEDIA_LAYER_CLASS = 'ts-media-layer';
/** The class a root gains while an element is mounted over it (the poster and the frame hide under it). */
export const MOUNTED_CLASS = 'is-mounted';
/** The toast of SPEC-5 0.21 (strings.ts ROUND_FIVE.soundOff); the controller reports the event and the show words it. */
export const SOUND_OFF_EVENT = 'soundOff';
/** The privacy enhanced host of every YouTube player (R11 4.2). */
export const YOUTUBE_EMBED_HOST = 'https://www.youtube-nocookie.com';
export const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api';

export type MediaPlayState = PresentMediaState['state'];

/** What a root's data attributes say (render/blocks/media.ts playbackAttributes). */
export type RootPlayback = {
  blockId: string;
  kind: 'audio' | 'video';
  src: string;
  youtube: string;
  title: string;
  durationMs: number | null;
  startMs: number;
  endMs: number | null;
  play: 'click' | 'auto' | 'manual';
  loop: boolean;
  volume: number;
  mute: boolean;
  stopOnSlideChange: boolean;
  hideIcon: boolean;
};

export type EventTargetLike = {
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
};

/** The subset of an Element the controller touches on a poster root and the layer. */
export type RootLike = EventTargetLike & {
  getAttribute: (name: string) => string | null;
  classList: {
    add: (name: string) => void;
    remove: (name: string) => void;
    contains: (name: string) => boolean;
  };
  appendChild: (child: unknown) => unknown;
  querySelectorAll: (selectors: string) => ArrayLike<RootLike>;
  querySelector: (selectors: string) => RootLike | null;
  closest?: (selectors: string) => RootLike | null;
  isConnected?: boolean;
  id?: string;
  className?: string;
  setAttribute?: (name: string, value: string) => void;
};

/** The subset of HTMLMediaElement the controller drives. */
export type MediaElementLike = EventTargetLike & {
  src: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  loop: boolean;
  preload: string;
  playsInline?: boolean;
  crossOrigin?: string | null;
  className: string;
  /** resolves when playback starts; rejects with a DOMException named NotAllowedError without an activation */
  play: () => Promise<void>;
  pause: () => void;
  load?: () => void;
  remove: () => void;
  setAttribute: (name: string, value: string) => void;
  dataset?: Record<string, string | undefined>;
};

export type IframeLike = {
  src: string;
  title: string;
  className: string;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
  contentWindow?: { postMessage: (message: string, origin: string) => void } | null;
};

export type ScriptLike = {
  src: string;
  async: boolean;
  nonce?: string;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (type: string, listener: () => void) => void;
};

export type DocumentLike = {
  createElement: (tag: 'audio' | 'video' | 'iframe' | 'div' | 'script') => unknown;
  head?: { appendChild: (child: unknown) => unknown } | null;
  getElementById?: (id: string) => RootLike | null;
};

/** The subset of a MediaStream the spotlight mount touches. */
export type CameraStreamLike = { getTracks: () => ReadonlyArray<{ stop: () => void }> };

export type MediaControllerOptions = {
  /** the document elements are created with; `globalThis.document` when absent */
  document?: DocumentLike;
  /**
   * The presenter's camera for the speaker spotlight (SPEC-5 3.7; R11 6): asked once per show at
   * the first spotlight slide (the Present click is the activation), a muted `<video autoplay
   * playsinline>` fed by the stream under every spotlight root; null when refused or absent, and
   * the placeholder stays. `navigator.mediaDevices.getUserMedia({ video, audio: false })` when
   * absent; a test passes its own.
   */
  camera?: () => Promise<CameraStreamLike | null>;
  /** the show's root the deck level layer is appended to (never a slide) */
  showRoot?: RootLike | null;
  /** the page's origin, for the YouTube player's `origin` parameter */
  origin?: string;
  /** the CSP nonce the IFrame API loader carries (`'strict-dynamic'`) */
  nonce?: string;
  /** the clock, for tests */
  now?: () => number;
  /** the timer, for tests */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** the toast of 0.21, once per show */
  onSoundOff?: () => void;
  /** where the controller reports (a test's log) */
  log?: (line: string) => void;
};

export type MediaController = {
  /** mounts the elements of every root under a slide root that has just shown */
  mount: (slideRoot: RootLike, slideId?: string) => void;
  /** unmounts the slide's elements; an audio with Stop on slide change off stays in the layer */
  unmount: (slideRoot: RootLike) => void;
  play: (blockId: string) => Promise<void>;
  pause: (blockId: string) => void;
  restart: (blockId: string) => Promise<void>;
  toggle: (blockId: string) => Promise<void>;
  /**
   * Moves the position by `deltaMs`, clamped to the Start at and End at range (Google's U and O,
   * 10 s each; gslides-parity SPEC-5 3.5, 15), and reports the new position; a YouTube player is
   * left alone (its position is not readable synchronously) and an unmounted id does nothing.
   */
  seek: (blockId: string, deltaMs: number) => void;
  onState: (listener: (state: PresentMediaState) => void) => () => void;
  /** the click rule (R11 5.5): true when the event was a media control and the show must not advance */
  handleClick: (target: unknown) => boolean;
  /** Enter and Space on a focused root toggle it (R11 5.5): true when handled */
  handleKey: (key: string, target: unknown) => boolean;
  /** the `click` roots without a Play row of a slide root: plays them all; true when one played (R11 5.4) */
  playClickMedia: (slideRoot: RootLike) => Promise<boolean>;
  /** the first click after a NotAllowedError: the playing elements sound again */
  unmuteAll: () => void;
  /** every mounted block id, for the console */
  mounted: () => string[];
  /** the current state of a block, or null */
  stateOf: (blockId: string) => PresentMediaState | null;
  /** the show ended: every element stops and leaves, the layer empties */
  destroy: () => void;
};

/** The playback a root's attributes describe (the eight fields with Google's defaults already filled by the renderer). */
export function readRoot(root: RootLike): RootPlayback | null {
  const blockId = root.getAttribute('data-media');
  if (blockId === null || blockId === '') return null;
  const kind = root.getAttribute('data-kind') === 'audio' ? 'audio' : 'video';
  const play = root.getAttribute('data-play');
  const duration = root.getAttribute('data-duration');
  const end = root.getAttribute('data-end');
  const volume = Number(root.getAttribute('data-volume') ?? '100');
  return {
    blockId,
    kind,
    src: root.getAttribute('data-src') ?? '',
    youtube: root.getAttribute('data-youtube') ?? '',
    title: root.getAttribute('data-title') ?? '',
    durationMs: duration === null || duration === '' ? null : Number(duration),
    startMs: Number(root.getAttribute('data-start') ?? '0') || 0,
    endMs: end === null || end === '' ? null : Number(end),
    play: play === 'auto' || play === 'manual' ? play : 'click',
    loop: root.getAttribute('data-loop') === '1',
    volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 100,
    mute: root.getAttribute('data-mute') === '1',
    stopOnSlideChange: root.getAttribute('data-stop-on-change') !== '0',
    hideIcon: root.getAttribute('data-hide-icon') === '1',
  };
}

/** True when a click or key target sits inside a poster root or the deck level layer (R11 5.5). */
export function isMediaTarget(target: unknown): RootLike | null {
  const element = target as RootLike | null;
  if (element === null || typeof element !== 'object' || typeof element.closest !== 'function')
    return null;
  return element.closest(`${MEDIA_ROOT_SELECTOR}, .${MEDIA_LAYER_CLASS}`);
}

/** The YouTube player URL of a root (R11 4.2): the parameters the API and the terms need, never `controls=0` or `loop`. */
export function youtubePlayerUrl(playback: RootPlayback, origin: string | undefined): string {
  const params = new URLSearchParams();
  params.set('enablejsapi', '1');
  if (origin !== undefined && origin !== '') params.set('origin', origin);
  params.set('playsinline', '1');
  params.set('rel', '0');
  params.set('controls', '1');
  if (playback.startMs > 0) params.set('start', String(Math.floor(playback.startMs / 1000)));
  if (playback.endMs !== null) params.set('end', String(Math.ceil(playback.endMs / 1000)));
  if (playback.mute) params.set('mute', '1');
  if (playback.play === 'auto') params.set('autoplay', '1');
  return `${YOUTUBE_EMBED_HOST}/embed/${playback.youtube}?${params.toString()}`;
}

type Mounted = {
  playback: RootPlayback;
  root: RootLike;
  /** the slide root the element was mounted from */
  slideRoot: RootLike;
  element: MediaElementLike | null;
  iframe: IframeLike | null;
  /** true once the element moved to the deck level layer */
  inLayer: boolean;
  endTimer: unknown;
  state: MediaPlayState;
  /** the `click` root has been played by the first click rule */
  clicked: boolean;
  listeners: { type: string; listener: (event: unknown) => void }[];
};

function isNotAllowed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'NotAllowedError'
  );
}

export function createMediaController(options: MediaControllerOptions = {}): MediaController {
  const doc: DocumentLike | undefined =
    options.document ??
    (typeof document === 'undefined' ? undefined : (document as unknown as DocumentLike));
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const log = options.log ?? (() => undefined);
  const mounted = new Map<string, Mounted>();
  const listeners = new Set<(state: PresentMediaState) => void>();
  let layer: RootLike | null = null;
  let soundOffTold = false;
  let apiLoaded = false;
  // the speaker spotlight (SPEC-5 3.7): one camera request per show, one video per mounted root
  let cameraStream: Promise<CameraStreamLike | null> | null = null;
  const spotlights = new Map<RootLike, { slideRoot: RootLike; video: FakeVideoLike }>();
  type FakeVideoLike = { remove: () => void; srcObject?: unknown };

  const askCamera = (): Promise<CameraStreamLike | null> => {
    cameraStream ??= (async () => {
      try {
        if (options.camera !== undefined) return await options.camera();
        const devices = (
          globalThis as {
            navigator?: {
              mediaDevices?: { getUserMedia?: (c: unknown) => Promise<CameraStreamLike> };
            };
          }
        ).navigator?.mediaDevices;
        if (devices?.getUserMedia === undefined) return null;
        return await devices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      } catch (error) {
        log(
          `spotlight: the camera was not opened (${error instanceof Error ? error.name : 'error'})`,
        );
        return null;
      }
    })();
    return cameraStream;
  };

  const mountSpotlight = (root: RootLike, slideRoot: RootLike): void => {
    if (doc === undefined || spotlights.has(root) || root.getAttribute('data-spotlight') === null)
      return;
    const video = doc.createElement('video') as unknown as FakeVideoLike & {
      autoplay: boolean;
      muted: boolean;
      playsInline: boolean;
      className: string;
      setAttribute?: (name: string, value: string) => void;
      play?: () => Promise<void> | void;
    };
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.className = 'ts-spotlight-live';
    video.setAttribute?.('aria-hidden', 'true');
    spotlights.set(root, { slideRoot, video });
    void askCamera().then((stream) => {
      if (stream === null || !spotlights.has(root)) return;
      video.srcObject = stream;
      root.appendChild(video);
      root.classList.add(SPOTLIGHT_LIVE_CLASS);
      try {
        void video.play?.();
      } catch {
        // autoplay of a muted stream is allowed everywhere; a refusal leaves the placeholder
      }
    });
  };

  const unmountSpotlight = (root: RootLike): void => {
    const entry = spotlights.get(root);
    if (entry === undefined) return;
    entry.video.srcObject = null;
    entry.video.remove();
    root.classList.remove(SPOTLIGHT_LIVE_CLASS);
    spotlights.delete(root);
  };

  const report = (entry: Mounted): void => {
    const element = entry.element;
    const positionMs =
      element === null
        ? 0
        : Math.max(0, Math.round((element.currentTime - entry.playback.startMs / 1000) * 1000));
    const durationMs =
      entry.playback.endMs !== null
        ? entry.playback.endMs - entry.playback.startMs
        : entry.playback.durationMs !== null
          ? entry.playback.durationMs - entry.playback.startMs
          : element !== null && Number.isFinite(element.duration) && element.duration > 0
            ? Math.round(element.duration * 1000) - entry.playback.startMs
            : null;
    const state: PresentMediaState = {
      blockId: entry.playback.blockId,
      state: entry.state,
      positionMs,
      durationMs,
      ...(entry.playback.title !== '' ? { title: entry.playback.title } : {}),
    };
    for (const listener of listeners) listener(state);
  };

  const setState = (entry: Mounted, state: MediaPlayState): void => {
    if (entry.state === state) return;
    entry.state = state;
    report(entry);
  };

  /** The deck level layer for cross slide audio, made once under the show's root (R11 5.4). */
  const layerRoot = (): RootLike | null => {
    if (layer !== null) return layer;
    const existing = doc?.getElementById?.(MEDIA_LAYER_ID) ?? null;
    if (existing !== null) {
      layer = existing;
      return layer;
    }
    if (doc === undefined || options.showRoot === undefined || options.showRoot === null)
      return null;
    const made = doc.createElement('div') as RootLike & { id: string; className: string };
    made.id = MEDIA_LAYER_ID;
    made.className = MEDIA_LAYER_CLASS;
    made.setAttribute?.('aria-hidden', 'true');
    options.showRoot.appendChild(made);
    layer = made;
    return layer;
  };

  const listen = (entry: Mounted, type: string, listener: (event: unknown) => void): void => {
    entry.element?.addEventListener(type, listener);
    entry.listeners.push({ type, listener });
  };

  /** End at (R11 5.3): a timer re-armed on every timeupdate fires the end, then pauses or loops from Start at. */
  const armEnd = (entry: Mounted): void => {
    const element = entry.element;
    if (element === null || entry.playback.endMs === null) return;
    if (entry.endTimer !== null) clearTimer(entry.endTimer);
    const remaining = entry.playback.endMs / 1000 - element.currentTime;
    if (remaining <= 0.05) {
      onRangeEnd(entry);
      return;
    }
    entry.endTimer = setTimer(() => onRangeEnd(entry), Math.max(0, Math.round(remaining * 1000)));
  };

  const onRangeEnd = (entry: Mounted): void => {
    const element = entry.element;
    if (element === null) return;
    entry.endTimer = null;
    element.pause();
    element.currentTime = entry.playback.startMs / 1000;
    if (entry.playback.loop) {
      void startPlayback(entry);
      return;
    }
    setState(entry, 'ended');
  };

  const startPlayback = async (entry: Mounted): Promise<void> => {
    const element = entry.element;
    if (element === null) {
      if (entry.iframe !== null) postToPlayer(entry, 'playVideo');
      setState(entry, 'playing');
      return;
    }
    try {
      await element.play();
    } catch (error) {
      if (!isNotAllowed(error)) throw error;
      // no activation (SPEC-5 0.21): the first refused medium plays muted and the show says so once
      element.muted = true;
      entry.root.setAttribute?.('data-sound-off', '1');
      try {
        await element.play();
      } catch (again) {
        log(
          `media ${entry.playback.blockId}: play refused twice (${String((again as Error).message ?? again)})`,
        );
        return;
      }
      if (!soundOffTold) {
        soundOffTold = true;
        options.onSoundOff?.();
      }
    }
    setState(entry, 'playing');
    armEnd(entry);
  };

  const postToPlayer = (
    entry: Mounted,
    func: 'playVideo' | 'pauseVideo' | 'seekTo' | 'mute' | 'unMute',
    args: unknown[] = [],
  ): void => {
    const target = entry.iframe?.contentWindow;
    if (!target) return;
    target.postMessage(JSON.stringify({ event: 'command', func, args }), YOUTUBE_EMBED_HOST);
  };

  /** The IFrame API script, once per page, through a nonced loader (R11 4.2). */
  const loadApi = (): void => {
    if (apiLoaded || doc === undefined || !doc.head) return;
    apiLoaded = true;
    const script = doc.createElement('script') as ScriptLike;
    script.src = YOUTUBE_API_SRC;
    script.async = true;
    if (options.nonce !== undefined) script.setAttribute('nonce', options.nonce);
    doc.head.appendChild(script);
  };

  const mountOne = (root: RootLike, slideRoot: RootLike): void => {
    const playback = readRoot(root);
    if (playback === null || doc === undefined) return;
    const existing = mounted.get(playback.blockId);
    if (existing !== undefined) {
      // a cross slide audio whose slide came back: the element keeps playing where it is (R11 5.4)
      if (existing.inLayer && existing.state === 'playing') {
        existing.slideRoot = slideRoot;
        existing.root = root;
        return;
      }
      teardown(existing);
    }
    const entry: Mounted = {
      playback,
      root,
      slideRoot,
      element: null,
      iframe: null,
      inLayer: false,
      endTimer: null,
      state: 'paused',
      clicked: false,
      listeners: [],
    };
    if (playback.youtube !== '') {
      const iframe = doc.createElement('iframe') as IframeLike;
      iframe.className = 'ts-media-player';
      iframe.src = youtubePlayerUrl(playback, options.origin);
      iframe.title = playback.title;
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      root.appendChild(iframe);
      entry.iframe = iframe;
      loadApi();
    } else if (playback.src !== '') {
      const element = doc.createElement(playback.kind) as MediaElementLike;
      element.className = `ts-media-element is-${playback.kind}`;
      element.preload = 'metadata';
      if ('playsInline' in element) element.playsInline = true;
      element.crossOrigin = 'anonymous';
      element.muted = playback.mute;
      element.volume = playback.volume / 100;
      // the attribute loops a whole file; a trimmed range loops through the end timer (R11 5.3)
      element.loop = playback.loop && playback.startMs === 0 && playback.endMs === null;
      element.setAttribute('data-media-element', playback.blockId);
      element.src = playback.src;
      if (playback.startMs > 0) element.currentTime = playback.startMs / 1000;
      entry.element = element;
      listen(entry, 'loadedmetadata', () => {
        if (playback.startMs > 0 && Math.abs(element.currentTime - playback.startMs / 1000) > 0.25)
          element.currentTime = playback.startMs / 1000;
      });
      listen(entry, 'timeupdate', () => {
        armEnd(entry);
        if (entry.state === 'playing') report(entry);
      });
      listen(entry, 'play', () => setState(entry, 'playing'));
      listen(entry, 'pause', () => {
        if (entry.state !== 'ended') setState(entry, 'paused');
      });
      listen(entry, 'ended', () => {
        if (playback.loop) {
          element.currentTime = playback.startMs / 1000;
          void startPlayback(entry);
        } else setState(entry, 'ended');
      });
      const home = playback.kind === 'audio' && !playback.stopOnSlideChange ? layerRoot() : null;
      if (home !== null) {
        home.appendChild(element);
        entry.inLayer = true;
      } else root.appendChild(element);
    }
    root.classList.add(MOUNTED_CLASS);
    mounted.set(playback.blockId, entry);
  };

  const teardown = (entry: Mounted): void => {
    if (entry.endTimer !== null) clearTimer(entry.endTimer);
    const element = entry.element;
    if (element !== null) {
      for (const { type, listener } of entry.listeners) element.removeEventListener(type, listener);
      element.pause();
      element.remove();
    }
    entry.iframe?.remove();
    entry.root.classList.remove(MOUNTED_CLASS);
    mounted.delete(entry.playback.blockId);
    if (entry.state === 'playing') {
      entry.state = 'paused';
      report(entry);
    }
  };

  const rootsOf = (slideRoot: RootLike): RootLike[] =>
    Array.from(slideRoot.querySelectorAll(MEDIA_ROOT_SELECTOR));

  const controller: MediaController = {
    mount(slideRoot) {
      for (const root of rootsOf(slideRoot)) mountOne(root, slideRoot);
      for (const root of Array.from(slideRoot.querySelectorAll(SPOTLIGHT_ROOT_SELECTOR)))
        mountSpotlight(root, slideRoot);
    },
    unmount(slideRoot) {
      for (const entry of [...mounted.values()]) {
        if (entry.slideRoot !== slideRoot) continue;
        // an audio with Stop on slide change off keeps playing in the layer (R11 5.4)
        if (entry.inLayer && entry.state === 'playing') {
          entry.root.classList.remove(MOUNTED_CLASS);
          continue;
        }
        teardown(entry);
      }
      for (const [root, entry] of [...spotlights])
        if (entry.slideRoot === slideRoot) unmountSpotlight(root);
    },
    async play(blockId) {
      const entry = mounted.get(blockId);
      if (entry === undefined) return;
      if (entry.state === 'ended' && entry.element !== null)
        entry.element.currentTime = entry.playback.startMs / 1000;
      await startPlayback(entry);
    },
    pause(blockId) {
      const entry = mounted.get(blockId);
      if (entry === undefined) return;
      if (entry.endTimer !== null) clearTimer(entry.endTimer);
      entry.endTimer = null;
      if (entry.element !== null) entry.element.pause();
      else postToPlayer(entry, 'pauseVideo');
      setState(entry, 'paused');
    },
    async restart(blockId) {
      const entry = mounted.get(blockId);
      if (entry === undefined) return;
      if (entry.element !== null) entry.element.currentTime = entry.playback.startMs / 1000;
      else postToPlayer(entry, 'seekTo', [entry.playback.startMs / 1000, true]);
      await startPlayback(entry);
    },
    async toggle(blockId) {
      const entry = mounted.get(blockId);
      if (entry === undefined) return;
      if (entry.state === 'playing') controller.pause(blockId);
      else await controller.play(blockId);
    },
    seek(blockId, deltaMs) {
      const entry = mounted.get(blockId);
      if (entry === undefined || entry.element === null) return;
      const element = entry.element;
      const start = entry.playback.startMs / 1000;
      const end =
        entry.playback.endMs !== null
          ? entry.playback.endMs / 1000
          : Number.isFinite(element.duration) && element.duration > 0
            ? element.duration
            : Number.POSITIVE_INFINITY;
      element.currentTime = Math.min(end, Math.max(start, element.currentTime + deltaMs / 1000));
      report(entry);
    },
    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    handleClick(target) {
      const root = isMediaTarget(target);
      if (root === null) return false;
      controller.unmuteAll();
      const blockId = root.getAttribute('data-media');
      const entry = blockId === null ? undefined : mounted.get(blockId);
      // a YouTube player takes its own clicks; the layer and a mounted auto or click element keep the browser's controls
      if (entry === undefined) return true;
      if (entry.playback.play === 'manual') void controller.toggle(entry.playback.blockId);
      return true;
    },
    handleKey(key, target) {
      if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return false;
      const root = isMediaTarget(target);
      if (root === null) return false;
      const blockId = root.getAttribute('data-media');
      const entry = blockId === null ? undefined : mounted.get(blockId);
      if (entry === undefined) return true;
      if (entry.playback.play === 'manual') void controller.toggle(entry.playback.blockId);
      return true;
    },
    async playClickMedia(slideRoot) {
      let played = false;
      for (const entry of mounted.values()) {
        if (entry.slideRoot !== slideRoot || entry.playback.play !== 'click' || entry.clicked)
          continue;
        entry.clicked = true;
        played = true;
        await controller.play(entry.playback.blockId);
      }
      return played;
    },
    unmuteAll() {
      for (const entry of mounted.values()) {
        if (entry.root.getAttribute('data-sound-off') !== '1') continue;
        entry.root.setAttribute?.('data-sound-off', '0');
        if (entry.element !== null && !entry.playback.mute) entry.element.muted = false;
        if (entry.iframe !== null && !entry.playback.mute) postToPlayer(entry, 'unMute');
      }
    },
    mounted() {
      return [...mounted.keys()];
    },
    stateOf(blockId) {
      const entry = mounted.get(blockId);
      if (entry === undefined) return null;
      const element = entry.element;
      return {
        blockId,
        state: entry.state,
        positionMs:
          element === null
            ? 0
            : Math.max(0, Math.round((element.currentTime - entry.playback.startMs / 1000) * 1000)),
        durationMs:
          entry.playback.endMs !== null
            ? entry.playback.endMs - entry.playback.startMs
            : entry.playback.durationMs === null
              ? null
              : entry.playback.durationMs - entry.playback.startMs,
        ...(entry.playback.title !== '' ? { title: entry.playback.title } : {}),
      };
    },
    destroy() {
      for (const entry of [...mounted.values()]) teardown(entry);
      for (const root of [...spotlights.keys()]) unmountSpotlight(root);
      // the camera stops with the show (R11 6: the stream's tracks stop on close)
      if (cameraStream !== null) {
        void cameraStream.then((stream) => {
          for (const track of stream?.getTracks() ?? []) track.stop();
        });
        cameraStream = null;
      }
      layer = null;
    },
  };
  void now;
  return controller;
}
