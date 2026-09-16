import { useEffect, useState } from 'react';

import { Dialog, DialogCheck, DialogRadio } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { MEDIA_DIALOGS } from './media-strings';

import './media-dialogs.css';

/**
 * Present on another screen and Presentation display options (gslides-parity SPEC-5 3.7; R11 7;
 * MILESTONES-5 B2 day 6) over the Window Management API where `getScreenDetails` exists (Chromium
 * from 100): the dialog lists the screens by label with two radios per screen (Show, Presenter
 * view) and a Remember checkbox stored per browser; `presentOnScreen` puts the show full screen
 * on the chosen screen through `requestFullscreen({ screen })` and opens the presenter window on
 * the other with `left`, `top`, `width`, `height` from its details. Where the API is absent
 * (Firefox, Safari, every mobile browser) both rows show disabled with today's drag clause, the
 * pattern the stubs use: the model rows are static, the state is runtime. The Presentation API is
 * not used because its receivers are Cast devices. The click on the row is the activation both
 * calls need, so the executor runs synchronously from the row's handler up to the awaits.
 */
export type ScreenLike = {
  label: string;
  isPrimary: boolean;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
};

export type ScreenDetailsLike = {
  screens: ReadonlyArray<ScreenLike>;
  currentScreen: ScreenLike;
};

export type WindowLike = {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
  open: (url: string, name: string, features: string) => unknown;
  document: {
    documentElement: { requestFullscreen?: (options?: { screen?: unknown }) => Promise<void> };
    fullscreenElement?: unknown;
  };
  screen?: { isExtended?: boolean };
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
};

/** The localStorage key of the remembered screens (per browser). */
export const DISPLAY_OPTIONS_KEY = 'turboslide:display-options';

export type DisplayChoice = {
  /** the screen index the show goes to */
  show: number;
  /** the screen index the presenter window opens on */
  presenter: number;
  remember: boolean;
};

/** True where the Window Management API exists (the rows enable there, R11 7). */
export function screenDetailsSupported(win: WindowLike | undefined = browserWindow()): boolean {
  return win !== undefined && typeof win.getScreenDetails === 'function';
}

function browserWindow(): WindowLike | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as WindowLike);
}

/** The remembered choice, or null. */
export function rememberedChoice(
  win: WindowLike | undefined = browserWindow(),
): DisplayChoice | null {
  try {
    const raw = win?.localStorage?.getItem(DISPLAY_OPTIONS_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed = JSON.parse(raw) as Partial<DisplayChoice>;
    if (typeof parsed.show !== 'number' || typeof parsed.presenter !== 'number') return null;
    return { show: parsed.show, presenter: parsed.presenter, remember: true };
  } catch {
    return null;
  }
}

export function rememberChoice(
  choice: DisplayChoice | null,
  win: WindowLike | undefined = browserWindow(),
): void {
  try {
    if (choice === null || !choice.remember) win?.localStorage?.removeItem(DISPLAY_OPTIONS_KEY);
    else
      win?.localStorage?.setItem(
        DISPLAY_OPTIONS_KEY,
        JSON.stringify({ show: choice.show, presenter: choice.presenter }),
      );
  } catch {
    // a browser without storage keeps no memory
  }
}

/** The default pairing: the show on a screen that is not the current one, the presenter on the current one. */
export function defaultChoice(details: ScreenDetailsLike): DisplayChoice {
  const current = details.screens.indexOf(details.currentScreen);
  const other = details.screens.findIndex((screen) => screen !== details.currentScreen);
  return {
    show: other === -1 ? Math.max(0, current) : other,
    presenter: Math.max(0, current),
    remember: false,
  };
}

export type PresentOnScreenHost = {
  deckId: string;
  /** `/present/<id>`, the presenter window's route */
  presenterPath: string;
  /** one window per deck */
  presenterWindowName: string;
  /** starts the show in this window */
  present: () => void;
};

export type PresentOnScreenInput = {
  /** Google's row is `other`; `this` keeps the show here; a number names a screen of the details */
  screen?: 'other' | 'this' | number;
  presenter?: number;
};

export type PresentOnScreenResult = { supported: boolean; screens: number; opened: boolean };

/**
 * The executor of `view.presentOnScreen` and the Present on another screen row (SPEC-5 3.7; R11 7):
 * reads the screens (the first call prompts for `window-management`), picks the show screen (the
 * input's, the remembered one, else the screen that is not current), takes this window full
 * screen on it and opens the presenter window on the other screen; answers what the action's
 * output names. Without the API the answer is `supported: false` and the caller shows the drag
 * clause; with one screen the show starts here and the presenter opens as a popup.
 */
export async function presentOnScreen(
  host: PresentOnScreenHost,
  input: PresentOnScreenInput = {},
  win: WindowLike | undefined = browserWindow(),
): Promise<PresentOnScreenResult> {
  if (win === undefined || !screenDetailsSupported(win))
    return { supported: false, screens: 0, opened: false };
  let details: ScreenDetailsLike;
  try {
    details = await (win.getScreenDetails as () => Promise<ScreenDetailsLike>)();
  } catch {
    return { supported: true, screens: 0, opened: false };
  }
  const screens = details.screens;
  const remembered = rememberedChoice(win);
  const fallback = defaultChoice(details);
  const showIndex =
    typeof input.screen === 'number'
      ? input.screen
      : input.screen === 'this'
        ? Math.max(0, screens.indexOf(details.currentScreen))
        : (remembered?.show ?? fallback.show);
  const presenterIndex =
    input.presenter ??
    remembered?.presenter ??
    (showIndex === fallback.presenter ? fallback.show : fallback.presenter);
  const showScreen = screens[showIndex] ?? details.currentScreen;
  const presenterScreen = screens[presenterIndex] ?? details.currentScreen;
  host.present();
  const root = win.document.documentElement;
  if (
    typeof root.requestFullscreen === 'function' &&
    win.document.fullscreenElement === undefined
  ) {
    await root.requestFullscreen({ screen: showScreen }).catch(() => undefined);
  }
  let opened = false;
  if (screens.length > 1 && presenterScreen !== showScreen) {
    const features = [
      `left=${Math.round(presenterScreen.availLeft)}`,
      `top=${Math.round(presenterScreen.availTop)}`,
      `width=${Math.round(presenterScreen.availWidth)}`,
      `height=${Math.round(presenterScreen.availHeight)}`,
    ].join(',');
    try {
      opened = win.open(host.presenterPath, host.presenterWindowName, features) !== null;
    } catch {
      opened = false;
    }
  } else {
    try {
      opened =
        win.open(
          host.presenterPath,
          host.presenterWindowName,
          'popup=yes,width=1180,height=760',
        ) !== null;
    } catch {
      opened = false;
    }
  }
  return { supported: true, screens: screens.length, opened };
}

export type DisplayOptionsDialogProps = {
  /** the show host of this page; absent draws the dialog without the Present button */
  host?: PresentOnScreenHost;
  /** the window, for tests */
  win?: WindowLike;
};

export function DisplayOptionsDialog({ host, win = browserWindow() }: DisplayOptionsDialogProps) {
  const shell = useEditorShell();
  const words = MEDIA_DIALOGS.display;
  const [details, setDetails] = useState<ScreenDetailsLike | null>(null);
  const [choice, setChoice] = useState<DisplayChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = screenDetailsSupported(win);

  useEffect(() => {
    if (!supported || win === undefined) return;
    let cancelled = false;
    (win.getScreenDetails as () => Promise<ScreenDetailsLike>)()
      .then((found) => {
        if (cancelled) return;
        setDetails(found);
        setChoice(rememberedChoice(win) ?? defaultChoice(found));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error && err.message !== '' ? err.message : words.unsupported);
      });
    return () => {
      cancelled = true;
    };
  }, [supported, win, words.unsupported]);

  const apply = () => {
    if (choice === null || host === undefined) return;
    rememberChoice(choice, win);
    shell.closeDialog();
    void presentOnScreen(host, { screen: choice.show, presenter: choice.presenter }, win);
  };

  const screens = details?.screens ?? [];
  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={520}
      control="dialog.displayOptions"
      cancel
      actions={
        host !== undefined && supported
          ? [
              {
                label: words.apply,
                primary: true,
                disabled: choice === null,
                onClick: apply,
                control: 'dialog.displayOptions.present',
                doc: 'Starts the show on the chosen screen with Presenter view on the other',
              },
            ]
          : []
      }
    >
      {!supported ? (
        <p className="ts-dialog-hint" data-control="dialog.displayOptions.unsupported">
          {words.unsupported}
        </p>
      ) : error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : screens.length <= 1 ? (
        <p className="ts-dialog-hint" data-control="dialog.displayOptions.oneScreen">
          {words.oneScreen}
        </p>
      ) : (
        <div className="ts-media-screens">
          {screens.map((screen, index) => (
            <div
              className="ts-media-screen"
              key={`${screen.label}-${index}`}
              data-control={`dialog.displayOptions.screen.${index}`}
            >
              <span className="ts-media-screen-label">
                {screen.label || `${words.screen} ${index + 1}`}
                {screen === details?.currentScreen ? ' (this window)' : ''}
              </span>
              <DialogRadio<'show' | 'presenter' | 'none'>
                name={`${words.screen} ${index + 1}`}
                value={
                  choice?.show === index
                    ? 'show'
                    : choice?.presenter === index
                      ? 'presenter'
                      : 'none'
                }
                options={[
                  { value: 'show', label: words.show, doc: 'The slides, full screen' },
                  {
                    value: 'presenter',
                    label: words.presenter,
                    doc: 'The notes, the timer and the next slide',
                  },
                ]}
                onChange={(value) =>
                  setChoice((current) => {
                    const base = current ?? defaultChoice(details as ScreenDetailsLike);
                    if (value === 'show')
                      return {
                        ...base,
                        show: index,
                        presenter: base.presenter === index ? base.show : base.presenter,
                      };
                    if (value === 'presenter')
                      return {
                        ...base,
                        presenter: index,
                        show: base.show === index ? base.presenter : base.show,
                      };
                    return base;
                  })
                }
                control={`dialog.displayOptions.screen.${index}.role`}
              />
            </div>
          ))}
          <DialogCheck
            label={words.remember}
            checked={choice?.remember ?? false}
            onChange={(remember) =>
              setChoice((current) => (current === null ? current : { ...current, remember }))
            }
            control="dialog.displayOptions.remember"
          />
        </div>
      )}
    </Dialog>
  );
}
