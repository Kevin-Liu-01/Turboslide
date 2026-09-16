// @vitest-environment jsdom
// The Camera dialog and Presentation display options (gslides-parity SPEC-5 3.7; R11 6, 7;
// MILESTONES-5 B2 day 6): the camera preview from getUserMedia, the refusal sentences, Capture
// then Use photo writing asset.add and block.insert with the photo centred on the page, the
// action executor settling on Use photo and on Cancel, the stream stopped on close; the display
// dialog listing the screens with Show and Presenter view, the remembered choice, the executor's
// answer with and without the Window Management API.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import {
  CAMERA_CANCELLED,
  CAMERA_WORDS,
  CameraDialog,
  beginCameraCapture,
  cameraRefusal,
  configureCameraDeps,
  pendingCameraCapture,
} from '../dialogs/Camera';
import type { CameraDeps } from '../dialogs/Camera';
import {
  DISPLAY_OPTIONS_KEY,
  DisplayOptionsDialog,
  defaultChoice,
  presentOnScreen,
  rememberedChoice,
  screenDetailsSupported,
} from '../dialogs/DisplayOptions';
import type { ScreenDetailsLike, WindowLike } from '../dialogs/DisplayOptions';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

afterEach(() => {
  hideTooltip();
  cleanup();
  configureCameraDeps(null);
});

const doc = workedDocument();
const SLIDE = 'content-rule';

function Host({
  input,
  closeDialog,
  children,
}: {
  input: EditorShellInput;
  closeDialog?: () => void;
  children: React.ReactNode;
}) {
  const state = {
    input,
    platform: 'mac',
    menuContext: buildMenuContext(input, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    setSetting: vi.fn(),
    runItem: vi.fn(),
    runControl: vi.fn(),
    panel: null,
    openPanel: vi.fn(),
    panelSection: null,
    closePanel: vi.fn(),
    reopenPanel: vi.fn(),
    wordArtOpen: false,
    setWordArtOpen: vi.fn(),
    registerFilmstrip: vi.fn(),
    setGuideUnderPointer: vi.fn(),
    dialog: null,
    openDialog: vi.fn(),
    closeDialog: closeDialog ?? vi.fn(),
    layoutGrid: null,
    openLayoutGrid: vi.fn(),
    closeLayoutGrid: vi.fn(),
    pickLayout: vi.fn(),
    renderDynamicSubmenu: () => null,
    menuOpen: null,
    setMenuOpen: vi.fn(),
    compact: false,
    setCompact: vi.fn(),
    toolFinderOpen: false,
    setToolFinderOpen: vi.fn(),
    paletteOpen: false,
    setPaletteOpen: vi.fn(),
    say: vi.fn(),
    lastLayout: null,
    focusTitle: vi.fn(),
    registerTitleField: vi.fn(),
    commentCard: null,
    openCommentCard: vi.fn(),
    closeCommentCard: vi.fn(),
    stepComment: vi.fn(),
    diff: null,
  } satisfies EditorShellState;
  return <EditorShellContext value={state}>{children}</EditorShellContext>;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fakeCamera(): { deps: CameraDeps; stopped: number } {
  const state = { stopped: 0 };
  const stream = { getTracks: () => [{ stop: () => (state.stopped += 1) }] };
  const deps: CameraDeps = {
    getUserMedia: vi.fn(async () => stream),
    enumerateDevices: async () => [
      { deviceId: 'a', label: 'FaceTime HD' },
      { deviceId: 'b', label: 'USB camera' },
    ],
    captureFrame: async () => 'data:image/jpeg;base64,/9j/photo',
    secureContext: true,
  };
  return {
    deps,
    get stopped() {
      return state.stopped;
    },
  } as { deps: CameraDeps; stopped: number };
}

describe('the Camera dialog (SPEC-5 3.7)', () => {
  it('previews the camera, lists the devices, captures a frame, and Use photo writes the asset and a centred picture object', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    const camera = fakeCamera();
    configureCameraDeps(camera.deps);
    const dispatch = vi.fn(async (id: string) =>
      id === 'asset.add' ? { id: 'camera-x', revision: 413 } : { revision: 414 },
    );
    const closeDialog = vi.fn();
    const input: EditorShellInput = {
      deckId: doc.deck.id,
      document: doc,
      slideId: SLIDE,
      revision: 412,
      dispatch: dispatch as never,
    };
    const { container } = render(
      <Host input={input} closeDialog={closeDialog}>
        <CameraDialog />
      </Host>,
    );
    await flush();
    await flush();
    expect(camera.deps.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false }),
    );
    expect(container.querySelector('[data-control="dialog.camera.device"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-control="dialog.camera.device"] option')).toHaveLength(
      2,
    );
    const captureButton = container.querySelector<HTMLButtonElement>(
      '[data-control="dialog.camera.capture"]',
    );
    expect(captureButton?.disabled).toBe(false);
    fireEvent.click(captureButton!);
    await flush();
    expect(container.querySelector('img.ts-media-camera-still')?.getAttribute('src')).toBe(
      'data:image/jpeg;base64,/9j/photo',
    );
    fireEvent.click(container.querySelector('[data-control="dialog.camera.use"]')!);
    await flush();
    await flush();
    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      'asset.add',
      expect.objectContaining({
        file: 'data:image/jpeg;base64,/9j/photo',
        role: 'other',
        alt: CAMERA_WORDS.alt,
        baseRevision: 412,
      }),
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      'block.insert',
      expect.objectContaining({
        slideId: SLIDE,
        baseRevision: 413,
        block: expect.objectContaining({
          type: 'picture',
          asset: 'camera-x',
          pos: { x: 320, y: 180, w: 960, h: 540 },
        }),
      }),
    );
    expect(closeDialog).toHaveBeenCalled();
    expect(camera.stopped).toBeGreaterThan(0);
  });

  it('names the refusals and settles the camera.capture executor on Use photo or on Cancel', async () => {
    expect(cameraRefusal(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe(
      CAMERA_WORDS.notAllowed,
    );
    expect(cameraRefusal(Object.assign(new Error('x'), { name: 'NotFoundError' }))).toBe(
      CAMERA_WORDS.notFound,
    );
    const refused = fakeCamera();
    refused.deps.getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    configureCameraDeps(refused.deps);
    const input: EditorShellInput = {
      deckId: doc.deck.id,
      document: doc,
      slideId: SLIDE,
      revision: 412,
      dispatch: vi.fn() as never,
    };
    const first = render(
      <Host input={input}>
        <CameraDialog />
      </Host>,
    );
    await flush();
    expect(first.container.querySelector('[data-control="dialog.camera.error"]')?.textContent).toBe(
      CAMERA_WORDS.notAllowed,
    );
    expect(
      first.container.querySelector<HTMLButtonElement>('[data-control="dialog.camera.capture"]')
        ?.disabled,
    ).toBe(true);
    cleanup();
    // the action path: the promise settles with the dialog's outcome
    const pendingResult = beginCameraCapture({
      slideId: 'other',
      alt: 'From the CLI',
      baseRevision: 5,
    });
    expect(pendingCameraCapture()).toEqual({
      slideId: 'other',
      alt: 'From the CLI',
      baseRevision: 5,
    });
    configureCameraDeps({ ...fakeCamera().deps, secureContext: false });
    const closeDialog = vi.fn();
    const second = render(
      <Host input={input} closeDialog={closeDialog}>
        <CameraDialog />
      </Host>,
    );
    await flush();
    expect(
      second.container.querySelector('[data-control="dialog.camera.error"]')?.textContent,
    ).toBe(CAMERA_WORDS.insecure);
    fireEvent.click(
      second.container.querySelector(
        '[data-control="dialog.camera.cancel"], .ts-dialog-actions button',
      )!,
    );
    await expect(pendingResult).rejects.toThrow(CAMERA_CANCELLED);
    expect(pendingCameraCapture()).toBeNull();
  });
});

function fakeWindow(
  screens: ScreenDetailsLike['screens'],
  current = 0,
  supported = true,
): WindowLike & { opened: string[]; fullscreenOn: unknown[]; store: Map<string, string> } {
  const store = new Map<string, string>();
  const opened: string[] = [];
  const fullscreenOn: unknown[] = [];
  const details: ScreenDetailsLike = {
    screens,
    currentScreen: screens[current] as ScreenDetailsLike['currentScreen'],
  };
  return {
    opened,
    fullscreenOn,
    store,
    ...(supported ? { getScreenDetails: async () => details } : {}),
    open: (url, _name, features) => {
      opened.push(`${url} ${features}`);
      return {};
    },
    document: {
      documentElement: {
        requestFullscreen: async (options) => {
          fullscreenOn.push(options?.screen);
        },
      },
    },
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
    },
  };
}

const LAPTOP = {
  label: 'Built-in Retina Display',
  isPrimary: true,
  availLeft: 0,
  availTop: 25,
  availWidth: 1728,
  availHeight: 1080,
};
const PROJECTOR = {
  label: 'EPSON',
  isPrimary: false,
  availLeft: 1728,
  availTop: 0,
  availWidth: 1920,
  availHeight: 1080,
};

describe('Present on another screen (SPEC-5 3.7; R11 7)', () => {
  it('answers unsupported without the API and puts the show on the other screen with the presenter on this one with it', async () => {
    const none = fakeWindow([LAPTOP], 0, false);
    expect(screenDetailsSupported(none)).toBe(false);
    const host = {
      deckId: 'talk',
      presenterPath: '/present/talk',
      presenterWindowName: 'turboslide-presenter:talk',
      present: vi.fn(),
    };
    expect(await presentOnScreen(host, { screen: 'other' }, none)).toEqual({
      supported: false,
      screens: 0,
      opened: false,
    });
    expect(host.present).not.toHaveBeenCalled();
    const two = fakeWindow([LAPTOP, PROJECTOR], 0);
    expect(defaultChoice({ screens: [LAPTOP, PROJECTOR], currentScreen: LAPTOP })).toEqual({
      show: 1,
      presenter: 0,
      remember: false,
    });
    const result = await presentOnScreen(host, { screen: 'other' }, two);
    expect(result).toEqual({ supported: true, screens: 2, opened: true });
    expect(host.present).toHaveBeenCalledTimes(1);
    expect(two.fullscreenOn).toEqual([PROJECTOR]);
    expect(two.opened).toEqual(['/present/talk left=0,top=25,width=1728,height=1080']);
    // one screen: the show here, the presenter as a popup
    const one = fakeWindow([LAPTOP], 0);
    expect(await presentOnScreen(host, { screen: 'other' }, one)).toEqual({
      supported: true,
      screens: 1,
      opened: true,
    });
    expect(one.opened[0]).toContain('popup=yes');
  });

  it('draws the screens with Show and Presenter view, remembers the choice, and shows the drag clause without the API', async () => {
    const win = fakeWindow([LAPTOP, PROJECTOR], 0);
    const input: EditorShellInput = {
      deckId: doc.deck.id,
      document: doc,
      slideId: SLIDE,
      revision: 412,
      dispatch: vi.fn() as never,
    };
    const host = {
      deckId: 'talk',
      presenterPath: '/present/talk',
      presenterWindowName: 'turboslide-presenter:talk',
      present: vi.fn(),
    };
    const closeDialog = vi.fn();
    const { container } = render(
      <Host input={input} closeDialog={closeDialog}>
        <DisplayOptionsDialog host={host} win={win} />
      </Host>,
    );
    await flush();
    expect(container.querySelectorAll('.ts-media-screen')).toHaveLength(2);
    expect(container.textContent).toContain('EPSON');
    expect(container.textContent).toContain('(this window)');
    // swap: the laptop shows, the projector gets the presenter
    const laptopShow = container.querySelector<HTMLInputElement>(
      '[data-control="dialog.displayOptions.screen.0.role"] input[value="show"], [data-control="dialog.displayOptions.screen.0"] input[value="show"]',
    );
    fireEvent.click(laptopShow!);
    fireEvent.click(
      container.querySelector<HTMLInputElement>('[data-control="dialog.displayOptions.remember"]')!,
    );
    fireEvent.click(container.querySelector('[data-control="dialog.displayOptions.present"]')!);
    await flush();
    expect(rememberedChoice(win)).toEqual({ show: 0, presenter: 1, remember: true });
    expect(win.store.get(DISPLAY_OPTIONS_KEY)).toBe('{"show":0,"presenter":1}');
    expect(closeDialog).toHaveBeenCalled();
    expect(host.present).toHaveBeenCalled();
    expect(win.fullscreenOn).toEqual([LAPTOP]);
    cleanup();
    const none = fakeWindow([LAPTOP], 0, false);
    const second = render(
      <Host input={input}>
        <DisplayOptionsDialog host={host} win={none} />
      </Host>,
    );
    expect(
      second.container.querySelector('[data-control="dialog.displayOptions.unsupported"]')
        ?.textContent,
    ).toBe('Presenter view opens a second window you can drag to another screen');
    expect(
      second.container.querySelector('[data-control="dialog.displayOptions.present"]'),
    ).toBeNull();
  });
});
