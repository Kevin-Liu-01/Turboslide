import type { MenuClientHandler } from '@turboslide/chrome/menus/model';

/**
 * The handlers behind the Slideshow split button (gslides-parity SPEC 9.1; MILESTONES B6 item 1).
 * The button itself is the chrome's TitleRow; the menu model names its arrow items as the client
 * handlers `presenterView` and `presentFromBeginning` and its main part as the action
 * `view.present`. The editor and the viewer hand in a `PresentHost` (the deck id, the play list's
 * first slide, a goto and a present switch) and bind `presentClientHandlers(host)` to the menu's
 * client effects. Every function here is one step of Google's flow: start from the current slide
 * in this tab and go full screen when the browser allows (Esc leaves both), start from slide 1,
 * or open Presenter view in a second window and put this tab into the show.
 */
export type PresentHost = {
  deckId: string;
  /** the first slide of the play list (skipped slides left out), or undefined for an empty deck */
  firstSlideId: () => string | undefined;
  goto: (slideId: string) => void;
  present: (on: boolean) => void;
};

export type PresentClientHandler = Extract<
  MenuClientHandler,
  'presenterView' | 'presentFromBeginning'
>;

/** The presenter window: one per deck, so a second Presenter view focuses the first. */
export function presenterWindowName(deckId: string): string {
  return `turboslide-presenter:${deckId}`;
}

export function presenterPath(deckId: string): string {
  return `/present/${encodeURIComponent(deckId)}`;
}

/** The audience form of the show, the shareable present link (SPEC 9.3). */
export function audiencePath(deckId: string): string {
  return `/deck/${encodeURIComponent(deckId)}?present=1`;
}

/** The presenter window's size when the browser opens it as a popup. */
const PRESENTER_FEATURES = 'popup=yes,width=1180,height=760';

/**
 * Full screen on the document, best effort: a refusal (no gesture, a frame without the
 * permission, a browser without the API) leaves the show in the window, as Google's
 * "Presentation display options" allows.
 */
export function requestPresentFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) return;
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen().catch(() => undefined);
}

export function exitPresentFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement) return;
  if (typeof document.exitFullscreen !== 'function') return;
  document.exitFullscreen().catch(() => undefined);
}

export type StartSlideshowOptions = {
  /** from the current slide (the button) or from slide 1 (Start from beginning) */
  from?: 'current' | 'beginning';
  /** ask for full screen; the default, as the main button does */
  fullscreen?: boolean;
};

/** The main part of the button, and Start from beginning with `from: 'beginning'`. */
export function startSlideshow(host: PresentHost, options: StartSlideshowOptions = {}): void {
  if (options.from === 'beginning') {
    const first = host.firstSlideId();
    if (first !== undefined) host.goto(first);
  }
  host.present(true);
  if (options.fullscreen !== false) requestPresentFullscreen();
}

/** Opens `/present/<id>` in a second window (the S key, Options > Open speaker notes, the arrow item). */
export function openPresenterView(deckId: string): Window | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.open(presenterPath(deckId), presenterWindowName(deckId), PRESENTER_FEATURES);
  } catch {
    return null;
  }
}

/**
 * Presenter view from the arrow: the second window, then this tab into the show. Full screen is
 * not asked for here: the presenter window would cover it on one screen, and the presenter drags
 * the window to the other screen first (SPEC 9.1 item 3's tooltip says so).
 */
export function presenterView(host: PresentHost): void {
  openPresenterView(host.deckId);
  startSlideshow(host, { fullscreen: false });
}

export function presentFromBeginning(host: PresentHost): void {
  startSlideshow(host, { from: 'beginning' });
}

/** The two client handlers of the Slideshow arrow, keyed as the menu model names them. */
export function presentClientHandlers(host: PresentHost): Record<PresentClientHandler, () => void> {
  return {
    presenterView: () => presenterView(host),
    presentFromBeginning: () => presentFromBeginning(host),
  };
}
