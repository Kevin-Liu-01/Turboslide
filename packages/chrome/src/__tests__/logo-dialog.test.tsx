// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isActionId } from '@turboslide/schema/actions';
import type { Asset } from '@turboslide/schema/assets';
import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import {
  LogoDialog,
  RECENT_STORAGE,
  licenceRowWords,
  logoSearchUrl,
  namesKit,
  pushRecent,
  readRecent,
  searchLogos,
} from '../dialogs/Logo';
import type { LogoSearchAnswer } from '../dialogs/Logo';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type { EditorShellInput, PictureTarget } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { LOGO_PLATE_LINES, LOGO_WORDS, logoMarkPath } from '../logo-model';
import type { LogoSearchRow } from '../logo-model';
import { LOGO_DIALOG } from '../menus/strings';
import { hideTooltip } from '../Tooltip';

// Insert > Logo (docs/FEATURES.md 4.3, 4.4, 4.6, 4.9; the rows logos.picker.* of 7.1): the search
// field focused, the results on the keystroke with the first tile preselected and Enter inserting
// it through `logo.insert` and the editor's placement; the tiles' paper and ink halves drawing the
// variant logo-model.ts's appearance rule picks; the licence row as the seller's sentence with the
// recorded string in the tooltip; the source sentence with the date and the failure; the empty
// state with Upload and the kit's sentence; Your brand listing the default kit's logo and the
// deck's logo assets; the every slide check off by default and carried on the insert; Recent kept
// per browser; Replace image's block target. The rows themselves are driven by B4's walk against
// a server whose search route and `logo.insert` are B6's; this file drives the dialog over a
// stubbed route that answers a fixture of four marks and a dispatch that answers the insert.

const FIGMA: LogoSearchRow = {
  slug: 'figma',
  title: 'Figma',
  aliases: [],
  categories: ['Design'],
  variants: { default: '/icons/figma/default.svg', mono: '/icons/figma/mono.svg' },
  license: 'CC0-1.0',
  licenceSentence: 'Free to use',
  url: 'https://www.figma.com',
  guidelines: 'https://www.figma.com/using-the-figma-brand/',
  collection: 'brands',
  readsOnPaper: true,
  readsOnInk: true,
};
const VERCEL: LogoSearchRow = {
  slug: 'vercel',
  title: 'Vercel',
  aliases: [],
  categories: ['Platform'],
  variants: {
    default: '/icons/vercel/default.svg',
    light: '/icons/vercel/light.svg',
    dark: '/icons/vercel/dark.svg',
    mono: '/icons/vercel/mono.svg',
    wordmark: '/icons/vercel/wordmark.svg',
  },
  license: 'MIT',
  licenceSentence: 'Free to use',
  url: 'https://vercel.com',
  collection: 'brands',
  readsOnPaper: false,
  readsOnInk: true,
};
const GITHUB: LogoSearchRow = {
  slug: 'github',
  title: 'GitHub',
  aliases: [],
  categories: ['DevTool'],
  variants: { default: '/icons/github/default.svg', mono: '/icons/github/mono.svg' },
  license: 'CC0-1.0',
  licenceSentence: 'Free to use',
  url: 'https://github.com',
  collection: 'brands',
  readsOnPaper: true,
  readsOnInk: false,
};
const AWS: LogoSearchRow = {
  slug: 'aws-lambda',
  title: 'AWS Lambda',
  aliases: [],
  categories: ['Compute'],
  variants: { default: '/icons/aws-lambda/default.svg', mono: '/icons/aws-lambda/mono.svg' },
  license: 'CC-BY-ND-2.0',
  licenceSentence: 'Free to use unchanged',
  url: 'https://aws.amazon.com',
  collection: 'aws',
  readsOnPaper: false,
  readsOnInk: false,
};
const ROWS = [FIGMA, VERCEL, GITHUB, AWS];

type FetchStub = ReturnType<typeof vi.fn>;

/** A same origin route answering the fixture: the search over titles by collection, the insert. */
function stubRoute(
  options: { lastError?: LogoSearchAnswer['lastError']; insertFails?: string } = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: FetchStub = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, ...(init === undefined ? {} : { init }) });
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname === '/api/logo/search') {
      const q = (parsed.searchParams.get('q') ?? '').toLowerCase();
      const all = parsed.searchParams.get('collection') === 'all';
      const logos = ROWS.filter(
        (row) => row.title.toLowerCase().includes(q) && (all || row.collection === 'brands'),
      );
      const answer: LogoSearchAnswer = {
        logos,
        updatedAt: '2026-09-20T06:39:58Z',
        source: 'thesvg.org',
        ...(options.lastError === undefined ? {} : { lastError: options.lastError }),
      };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answer) });
    }
    if (parsed.pathname === '/api/logo/insert') {
      if (options.insertFails !== undefined)
        return Promise.resolve({
          ok: false,
          status: 502,
          json: () => Promise.resolve({ error: { message: options.insertFails } }),
        });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ asset: { id: 'figma', size: [480, 480] } }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('x')) });
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, calls };
}

/** A dispatch answering the insert the way the window action would, once the schema lists it. */
function stubDispatch(options: { insertFails?: string } = {}) {
  return vi.fn((action: string) => {
    if (action === 'logo.insert')
      return options.insertFails === undefined
        ? Promise.resolve({ asset: { id: 'figma', size: [480, 480] } })
        : Promise.reject(new Error(options.insertFails));
    return Promise.resolve({ revision: 413 });
  });
}

/** The insert travels through the action when the schema lists the id, else through the route. */
const VIA_ACTION = isActionId('logo.insert');

/** The editor handle with B6's `insertLogoAsset` (build/b6.md R10), typed loosely until the handle carries it. */
function editorWith(methods: Record<string, unknown>): EditorShellInput['editor'] {
  return methods as EditorShellInput['editor'];
}

const LOGO_ASSET: Asset = {
  id: 'acme-logo',
  role: 'logo',
  alt: 'Acme logo',
  twins: { light: 'assets/acme-light.png', dark: 'assets/acme-dark.png' },
  size: [480, 240],
  scale: 3,
  source: { kind: 'file' },
  inline: 'native',
};

function documentWith(extra: { logoAsset?: boolean } = {}): DeckDocument {
  const doc = workedDocument();
  if (extra.logoAsset) doc.deck.assets[LOGO_ASSET.id] = LOGO_ASSET;
  return doc;
}

type HostOptions = {
  dispatch?: EditorShellInput['dispatch'];
  document?: DeckDocument;
  input?: Partial<EditorShellInput>;
};

function makeHost(options: HostOptions = {}) {
  const doc = options.document ?? documentWith();
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 412,
    dispatch: options.dispatch ?? stubDispatch(),
    defaultKit: { name: 'General Translation', appearance: 'light' },
    ...options.input,
  };
  const closeDialog = vi.fn();
  const say = vi.fn();
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
    closeDialog,
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
    say,
    lastLayout: null,
    focusTitle: vi.fn(),
    registerTitleField: vi.fn(),
    commentCard: null,
    openCommentCard: vi.fn(),
    closeCommentCard: vi.fn(),
    stepComment: vi.fn(),
    diff: null,
  } satisfies EditorShellState;
  const Host = ({ children }: { children: ReactNode }) => (
    <EditorShellContext value={state}>{children}</EditorShellContext>
  );
  return { Host, input, closeDialog, say, dispatch: input.dispatch as ReturnType<typeof vi.fn> };
}

const control = (id: string) => document.querySelector<HTMLElement>(`[data-control="${id}"]`);
const controls = (prefix: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-control^="${prefix}"]`));

/** Types the query at the field and waits for its answer: the groups carry the answered query. */
async function search(query: string): Promise<void> {
  const field = control('dialog.logo.search') as HTMLInputElement;
  fireEvent.change(field, { target: { value: query } });
  await waitFor(
    () => {
      const groups = control('dialog.logo.groups');
      expect(groups?.getAttribute('data-query')).toBe(query.trim());
      expect(groups?.getAttribute('data-searching')).toBeNull();
    },
    { timeout: 2000 },
  );
}

/** The insert's request as the transport of the day carried it. */
function insertRequest(
  dispatch: ReturnType<typeof vi.fn>,
  calls: { url: string; init?: RequestInit }[],
): unknown {
  if (VIA_ACTION) {
    const call = dispatch.mock.calls.find((each) => each[0] === 'logo.insert');
    return call?.[1];
  }
  const call = calls.find((each) => each.url.startsWith('/api/logo/insert?deck=gt-brand'));
  expect(call?.init?.method).toBe('POST');
  return JSON.parse(String(call?.init?.body));
}

function noTitles(): void {
  for (const el of document.querySelectorAll('[title]')) expect(el, 'no native titles').toBeNull();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.unstubAllGlobals();
});

describe('the pure rules', () => {
  it('addresses the search route with the query, the page and the collection', () => {
    expect(logoSearchUrl('figma')).toBe('/api/logo/search?q=figma');
    expect(logoSearchUrl('aws lambda', { limit: 20, collection: 'all' })).toBe(
      '/api/logo/search?q=aws+lambda&limit=20&collection=all',
    );
  });

  it('reads the route’s answer and answers a failure as one sentence', async () => {
    const { fetcher } = stubRoute();
    const answer = await searchLogos('vercel', { limit: 20 }, fetcher as unknown as typeof fetch);
    expect(answer.logos.map((row) => row.slug)).toEqual(['vercel']);
    expect(answer.updatedAt).toBe('2026-09-20T06:39:58Z');
    const failing = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: { message: 'thesvg.org did not answer' } }),
      }),
    );
    await expect(searchLogos('vercel', {}, failing as unknown as typeof fetch)).rejects.toThrow(
      'thesvg.org did not answer',
    );
    const broken = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.reject(new Error('html')) }),
    );
    await expect(searchLogos('vercel', {}, broken as unknown as typeof fetch)).rejects.toThrow(
      LOGO_DIALOG.routeFailed(500),
    );
  });

  it('keeps twelve recent picks per browser, newest first, with no repeat', () => {
    let recent = readRecent(localStorage);
    expect(recent).toEqual([]);
    recent = pushRecent(recent, FIGMA, localStorage);
    recent = pushRecent(recent, VERCEL, localStorage);
    recent = pushRecent(recent, FIGMA, localStorage);
    expect(recent.map((row) => row.slug)).toEqual(['figma', 'vercel']);
    for (let i = 0; i < 15; i += 1)
      recent = pushRecent(
        recent,
        { ...GITHUB, slug: `mark-${i}`, title: `Mark ${i}` },
        localStorage,
      );
    expect(recent).toHaveLength(12);
    expect(readRecent(localStorage).map((row) => row.slug)).toEqual(recent.map((row) => row.slug));
    /* a row from an older store reads whole */
    localStorage.setItem(
      RECENT_STORAGE,
      JSON.stringify([{ slug: 'x', title: 'X', license: 'MIT', variants: { default: '/x.svg' } }]),
    );
    expect(readRecent(localStorage)[0]).toMatchObject({
      slug: 'x',
      aliases: [],
      categories: [],
      collection: 'brands',
      licenceSentence: 'Free to use',
    });
    /* a broken store reads as nothing */
    localStorage.setItem(RECENT_STORAGE, '{not json');
    expect(readRecent(localStorage)).toEqual([]);
  });

  it('names the kit on an exact match and words the licence row', () => {
    expect(namesKit('general translation', ['General Translation', undefined])).toBe(true);
    expect(namesKit('General', ['General Translation'])).toBe(false);
    expect(namesKit('', ['General Translation'])).toBe(false);
    expect(licenceRowWords(FIGMA)).toEqual({
      lead: 'Figma: Free to use, ',
      link: 'brand guidelines',
      href: FIGMA.guidelines,
    });
    expect(licenceRowWords(VERCEL)).toEqual({
      lead: 'Vercel: Free to use, ',
      link: 'the brand’s site',
      href: 'https://vercel.com',
    });
  });
});

describe('LogoDialog', () => {
  it('opens on the focused search field with the lead, the check with its sentence and the source foot', () => {
    stubRoute();
    const { Host } = makeHost();
    render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    const dialog = screen.getByRole('dialog', { name: LOGO_DIALOG.title });
    expect(dialog.getAttribute('data-control')).toBe('dialog.logo');
    expect(dialog.textContent).toContain(LOGO_WORDS.lead);
    expect(document.activeElement).toBe(control('dialog.logo.search'));
    const check = control('dialog.logo.everySlide') as HTMLInputElement;
    expect(check.checked).toBe(false);
    expect(check.closest('label')?.textContent).toBe(LOGO_WORDS.everySlideCheck);
    expect(control('dialog.logo.everySlide.line')?.textContent).toBe(LOGO_WORDS.everySlideLine);
    /* without the editor's placement the check waits, drawn disabled */
    expect(check.disabled).toBe(true);
    /* no results group and no empty state before a query */
    expect(control('dialog.logo.group.results')).toBeNull();
    expect(control('dialog.logo.empty')).toBeNull();
    /* the source sentence before a search has answered names the site alone */
    const source = control('dialog.logo.source');
    expect(source?.textContent).toContain('Logos from thesvg.org. Brand marks belong');
    expect(source?.querySelector('a')?.getAttribute('href')).toBe(LOGO_DIALOG.legal);
    /* Insert waits for a selection */
    expect((control('dialog.logo.insert') as HTMLButtonElement).disabled).toBe(true);
    noTitles();
  });

  it('fetches on each keystroke and draws the last query’s answer whatever order the answers land (the features round, ship one)', async () => {
    /* a route whose answers the test releases by hand, so the order they land in is chosen */
    const pending: { q: string | null; resolve: (answer: LogoSearchAnswer) => void }[] = [];
    const fetcher = vi.fn(
      (input: string | URL | Request) =>
        new Promise((resolve) => {
          const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          pending.push({
            q: new URL(url, 'http://localhost').searchParams.get('q'),
            resolve: (answer) =>
              resolve({ ok: true, status: 200, json: () => Promise.resolve(answer) }),
          });
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { Host } = makeHost();
    render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    const field = control('dialog.logo.search') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'f' } });
    fireEvent.change(field, { target: { value: 'fi' } });
    fireEvent.change(field, { target: { value: 'fig' } });
    /* one request per key, none held back by a pause */
    await waitFor(() => expect(pending.map((p) => p.q)).toEqual(['f', 'fi', 'fig']));
    expect(control('dialog.logo.groups')?.getAttribute('data-searching')).toBe('true');
    const answer = (logos: LogoSearchRow[]): LogoSearchAnswer => ({
      logos,
      updatedAt: '2026-09-20T06:39:58Z',
      source: 'thesvg.org',
    });
    /* the last query answers first: its tile draws and the search is over */
    await act(async () => {
      pending[2]!.resolve(answer([FIGMA]));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(control('dialog.logo.groups')?.getAttribute('data-query')).toBe('fig'),
    );
    expect(control('dialog.logo.tile.figma')).not.toBeNull();
    expect(control('dialog.logo.groups')?.getAttribute('data-searching')).toBeNull();
    /* the earlier queries answer late with other rows: nothing changes */
    await act(async () => {
      pending[0]!.resolve(answer([VERCEL, GITHUB]));
      pending[1]!.resolve(answer([VERCEL]));
      await Promise.resolve();
    });
    expect(control('dialog.logo.groups')?.getAttribute('data-query')).toBe('fig');
    expect(control('dialog.logo.group.results')?.getAttribute('data-rows')).toBe('1');
    expect(control('dialog.logo.tile.vercel')).toBeNull();
    expect(control('dialog.logo.tile.figma')).not.toBeNull();
    /* a cleared field drops what is in flight */
    fireEvent.change(field, { target: { value: 'v' } });
    await waitFor(() => expect(pending).toHaveLength(4));
    fireEvent.change(field, { target: { value: '' } });
    await act(async () => {
      pending[3]!.resolve(answer([VERCEL]));
      await Promise.resolve();
    });
    expect(control('dialog.logo.groups')?.getAttribute('data-query')).toBe('');
    expect(control('dialog.logo.tile.vercel')).toBeNull();
    noTitles();
  });

  it('lists the results on the keystroke with the first tile preselected, and Enter inserts it and closes', async () => {
    const { calls } = stubRoute();
    const insertLogoAsset = vi.fn(() => Promise.resolve());
    const { Host, closeDialog, dispatch } = makeHost({
      input: { editor: editorWith({ insertLogoAsset }) },
    });
    /* the close unmounts the dialog, as the shell's does, so a write queued on the way out is lost */
    const rendered = render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    closeDialog.mockImplementation(() => rendered.unmount());
    await search('figma');
    expect(calls[0]?.url).toBe('/api/logo/search?q=figma&limit=20&collection=brands');
    const tile = control('dialog.logo.tile.figma');
    expect(tile).not.toBeNull();
    expect(tile?.getAttribute('aria-selected')).toBe('true');
    expect(tile?.classList.contains('is-active')).toBe(true);
    expect(control('dialog.logo.group.results')?.getAttribute('data-rows')).toBe('1');
    /* the two halves draw the default on both grounds, from the mark route */
    const paper = control('dialog.logo.tile.figma.paper');
    const ink = control('dialog.logo.tile.figma.ink');
    expect(paper?.getAttribute('data-variant')).toBe('default');
    expect(ink?.getAttribute('data-variant')).toBe('default');
    expect(paper?.querySelector('img')?.getAttribute('src')).toBe(logoMarkPath('figma', 'default'));
    expect(paper?.style.background).toBe('rgb(255, 255, 255)');
    expect(ink?.style.background).toBe('rgb(7, 7, 7)');
    /* the licence row: the seller's sentence, the guidelines link, the recorded string in the tooltip */
    const licence = control('dialog.logo.licence');
    expect(licence?.textContent).toBe('Figma: Free to use, brand guidelines');
    expect(licence?.getAttribute('data-tip')).toBe('Recorded on thesvg.org as CC0-1.0');
    expect(licence?.querySelector('a')?.getAttribute('href')).toBe(FIGMA.guidelines);
    /* the source foot names the site and the cache's date */
    expect(control('dialog.logo.source')?.textContent).toContain(
      'Logos from thesvg.org, updated 20 September 2026',
    );
    expect((control('dialog.logo.insert') as HTMLButtonElement).disabled).toBe(false);
    /* Enter in the field runs the dialog's default button */
    await act(async () => {
      fireEvent.keyDown(control('dialog.logo.search') as HTMLElement, { key: 'Enter' });
      await Promise.resolve();
    });
    await waitFor(() => expect(closeDialog).toHaveBeenCalledTimes(1));
    /* the handler stores the asset alone: the editor's handle carries insertLogoAsset, so the
       placement, the kit's slots and the Undo are the editor's one commit (build/b6.md R10) */
    expect(insertRequest(dispatch, calls)).toEqual({
      slug: 'figma',
      variant: 'default',
      baseRevision: 412,
    });
    /* the stored asset is placed by the editor at the logo size */
    expect(insertLogoAsset).toHaveBeenCalledWith(
      { id: 'figma', size: [480, 480] },
      { title: 'Figma', variant: 'default' },
    );
    /* the pick is remembered per browser */
    expect(readRecent(localStorage).map((row) => row.slug)).toEqual(['figma']);
    noTitles();
  });

  it('draws the Vercel pair on the right grounds, tints an unreadable mono and lists a cloud mark only under More', async () => {
    const { calls } = stubRoute();
    const { Host } = makeHost();
    render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    await search('vercel');
    /* thesvg names a variant after the ground it is drawn for: the paper half draws `light` (the
       black triangle), the ink half `dark` (the white one) */
    expect(control('dialog.logo.tile.vercel.paper')?.getAttribute('data-variant')).toBe('light');
    expect(control('dialog.logo.tile.vercel.ink')?.getAttribute('data-variant')).toBe('dark');
    await search('github');
    const ink = control('dialog.logo.tile.github.ink');
    expect(ink?.getAttribute('data-variant')).toBe('mono');
    expect(ink?.getAttribute('data-tinted')).toBe('true');
    const tinted = ink?.querySelector<HTMLElement>('.ts-logo-mark.is-tinted');
    expect(tinted?.style.getPropertyValue('--ts-logo-mask')).toContain(
      logoMarkPath('github', 'mono'),
    );
    expect(tinted?.style.getPropertyValue('--ts-logo-tint')).toBe('#f2f2f0');
    expect(control('dialog.logo.tile.github.paper')?.getAttribute('data-variant')).toBe('default');
    /* the AWS collection is out of the results until Include cloud service icons is on */
    await search('aws');
    expect(control('dialog.logo.tile.aws-lambda')).toBeNull();
    expect(control('dialog.logo.empty')).not.toBeNull();
    fireEvent.click(control('dialog.logo.includeCloud') as HTMLInputElement);
    await waitFor(() => expect(control('dialog.logo.tile.aws-lambda')).not.toBeNull());
    expect(calls[calls.length - 1]?.url).toBe('/api/logo/search?q=aws&limit=20&collection=all');
    /* its default reads on neither ground and its licence forbids the tint: the plate line */
    const paper = control('dialog.logo.tile.aws-lambda.paper');
    expect(paper?.getAttribute('data-plate')).toBe('true');
    expect(paper?.textContent).toBe(LOGO_PLATE_LINES.light);
    expect(control('dialog.logo.tile.aws-lambda.ink')?.textContent).toBe(LOGO_PLATE_LINES.dark);
    expect(control('dialog.logo.licence')?.textContent).toBe(
      'AWS Lambda: Free to use unchanged, the brand’s site',
    );
    expect(control('dialog.logo.licence')?.getAttribute('data-tip')).toBe(
      'Recorded on thesvg.org as CC-BY-ND-2.0',
    );
  });

  it('answers a name the index lacks with the empty sentence and Upload, and names the kit when the query is its name', async () => {
    stubRoute();
    const uploadPicture = vi.fn();
    const { Host, closeDialog } = makeHost({ input: { uploadPicture } });
    render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    await search('zzqx');
    const empty = control('dialog.logo.empty');
    expect(empty?.textContent).toContain(LOGO_WORDS.empty('zzqx'));
    expect(empty?.textContent).not.toContain(LOGO_WORDS.emptyKit);
    expect(control('dialog.logo.group.results')).toBeNull();
    fireEvent.click(control('dialog.logo.upload') as HTMLButtonElement);
    expect(uploadPicture).toHaveBeenCalledWith({ kind: 'insert', slideId: 'content-rule' });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    await search('General Translation');
    expect(control('dialog.logo.empty')?.textContent).toContain(LOGO_WORDS.emptyKit);
  });

  it('lists Your brand first with the default kit’s mark and the deck’s logo asset, and places the asset through the editor', async () => {
    stubRoute();
    const insertPictureAsset = vi.fn(() => Promise.resolve());
    const { Host, closeDialog } = makeHost({
      document: documentWith({ logoAsset: true }),
      input: { editor: { insertPictureAsset }, assetUrl: (path) => `/decks/gt-brand/${path}` },
    });
    render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    const brand = control('dialog.logo.group.brand');
    expect(brand).not.toBeNull();
    expect(brand?.getAttribute('data-rows')).toBe('2');
    /* the default kit's logo is the theme's mark on GT's deployment: the glyph on both grounds */
    const kit = control('dialog.logo.tile.kit');
    expect(kit?.textContent).toBe('General Translation');
    expect(kit?.querySelectorAll('svg use[href="#gt-mark"]')).toHaveLength(2);
    /* the deck's logo asset draws its twins */
    const asset = control('dialog.logo.tile.asset.acme-logo');
    expect(asset?.textContent).toBe('Acme logo');
    expect(control('dialog.logo.tile.asset.acme-logo.paper')?.querySelector('img')?.src).toContain(
      '/decks/gt-brand/assets/acme-light.png',
    );
    expect(control('dialog.logo.tile.asset.acme-logo.ink')?.querySelector('img')?.src).toContain(
      '/decks/gt-brand/assets/acme-dark.png',
    );
    /* the groups order: Your brand before Results */
    await search('figma');
    const groups = controls('dialog.logo.group.').map((el) => el.getAttribute('data-control'));
    expect(groups).toEqual(['dialog.logo.group.brand', 'dialog.logo.group.results']);
    await act(async () => {
      fireEvent.click(asset as HTMLElement);
      await Promise.resolve();
    });
    expect(insertPictureAsset).toHaveBeenCalledWith({ id: 'acme-logo', size: [480, 240] }, {});
    await waitFor(() => expect(closeDialog).toHaveBeenCalledTimes(1));
  });

  it('carries the every slide check on the insert and to the editor’s placement', async () => {
    const { calls } = stubRoute();
    const insertLogoAsset = vi.fn(() => Promise.resolve());
    const { Host, dispatch } = makeHost({ input: { editor: editorWith({ insertLogoAsset }) } });
    render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    const check = control('dialog.logo.everySlide') as HTMLInputElement;
    expect(check.disabled).toBe(false);
    fireEvent.click(check);
    expect(check.checked).toBe(true);
    await search('figma');
    await act(async () => {
      fireEvent.click(control('dialog.logo.tile.figma') as HTMLElement);
      await Promise.resolve();
    });
    await waitFor(() => expect(insertLogoAsset).toHaveBeenCalledTimes(1));
    /* the every slide write rides in the editor's commit, not in the handler's store */
    expect(insertRequest(dispatch, calls)).toEqual({
      slug: 'figma',
      variant: 'default',
      baseRevision: 412,
    });
    expect(insertLogoAsset).toHaveBeenCalledWith(
      { id: 'figma', size: [480, 480] },
      { title: 'Figma', variant: 'default', everySlide: true },
    );
  });

  it('lists Recent after Your brand from the browser’s store, names the failure in the foot, and swaps a block for Replace image', async () => {
    pushRecent([], VERCEL, localStorage);
    const { calls } = stubRoute({
      lastError: { at: '2026-09-22T14:05:00Z', status: 503, message: 'upstream 503' },
    });
    const target: PictureTarget = {
      kind: 'block',
      slideId: 'content-rule',
      blockId: 'pic-old',
      path: '/asset',
    };
    const insertLogoAsset = vi.fn(() => Promise.resolve());
    const { Host, dispatch } = makeHost({ input: { editor: editorWith({ insertLogoAsset }) } });
    render(
      <Host>
        <LogoDialog target={target} />
      </Host>,
    );
    const recent = control('dialog.logo.group.recent');
    expect(recent).not.toBeNull();
    expect(recent?.querySelector('[data-control="dialog.logo.tile.vercel"]')).not.toBeNull();
    expect(control('dialog.logo.insert')?.textContent).toBe(LOGO_DIALOG.replace);
    await search('figma');
    expect(control('dialog.logo.source')?.textContent).toContain(
      'thesvg.org did not answer at 14:05 UTC',
    );
    /* the arrows move the selection over the tiles: Left from the first result reaches Recent */
    fireEvent.keyDown(control('dialog.logo.search') as HTMLElement, { key: 'ArrowLeft' });
    expect(
      recent
        ?.querySelector('[data-control="dialog.logo.tile.vercel"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(control('dialog.logo.licence')?.textContent).toBe(
      'Vercel: Free to use, the brand’s site',
    );
    fireEvent.keyDown(control('dialog.logo.search') as HTMLElement, { key: 'ArrowRight' });
    await act(async () => {
      fireEvent.click(control('dialog.logo.insert') as HTMLButtonElement);
      await Promise.resolve();
    });
    await waitFor(() => expect(insertLogoAsset).toHaveBeenCalledTimes(1));
    /* the swap of the block's asset is the editor's, with the box kept and Undo */
    expect(insertRequest(dispatch, calls)).toEqual({
      slug: 'figma',
      variant: 'default',
      baseRevision: 412,
    });
    expect(insertLogoAsset).toHaveBeenCalledWith(
      { id: 'figma', size: [480, 480] },
      { title: 'Figma', variant: 'default', blockId: 'pic-old' },
    );
  });

  it('shows a refused insert as one sentence and keeps the dialog open', async () => {
    const sentence = 'thesvg.org did not answer; try again in a minute';
    stubRoute({ insertFails: sentence });
    const { Host, closeDialog } = makeHost({ dispatch: stubDispatch({ insertFails: sentence }) });
    render(
      <Host>
        <LogoDialog />
      </Host>,
    );
    await search('figma');
    await act(async () => {
      fireEvent.click(control('dialog.logo.tile.figma') as HTMLElement);
      await Promise.resolve();
    });
    await waitFor(() => expect(control('dialog.logo.error')?.textContent).toBe(sentence));
    expect(closeDialog).not.toHaveBeenCalled();
    expect(readRecent(localStorage)).toEqual([]);
  });
});
