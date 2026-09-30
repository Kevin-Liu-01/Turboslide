// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import {
  DRAFT_SENTENCE,
  LEGACY_SENTENCE,
  LINK_ROWS,
  LINK_URLS_KEY,
  ShareDialog,
  accessViewOfRecord,
  answeredAccess,
  authorizeSentence,
  forgetAnsweredAccess,
  isShareConflict,
  linkIsLive,
  liveLinksFor,
  loadAccess,
  newestAccess,
  noteAnsweredAccess,
  pruneLinkUrls,
  readLinkUrls,
  rememberLinkUrl,
  rowAddress,
  shareLinks,
  accessSentence,
  SHARE_NAME_ASKED_KEY,
} from '../dialogs/Share';
import type { AccessRecordJson } from '../dialogs/Share';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorAccess, EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { FORBIDDEN_DEFAULT_VIEW_WORDS, forbiddenWordsIn } from '../menus/strings';
import { hideTooltip } from '../Tooltip';

// The Share dialog of the focus round (docs/FOCUS.md 2.7 and section 5 rank 1; the orchestrator's
// ruling 2): the three link rows grant their role through a share link minted on the first Copy
// link and remembered on this browser; a legacy deck's rows carry the plain addresses and the
// view row promises nothing; the dialog reads the record and the deployment's mode from
// `/api/access/<deckId>` when the page carries no record, and says which mode the deployment runs;
// a write bases on the freshest revision and retries once on a conflict.

afterEach(() => {
  hideTooltip();
  cleanup();
  localStorage.clear();
  forgetAnsweredAccess();
});

const doc = workedDocument();
const SLIDE = 'content-rule';
const DECK = doc.deck.id;

function record(extra: Partial<AccessRecordJson> = {}): AccessRecordJson {
  return {
    deckId: DECK,
    owner: 'anon_11111111-1111-4111-8111-111111111111',
    pendingOwner: null,
    generalAccess: { mode: 'restricted', role: 'viewer' },
    grants: [],
    links: [],
    requests: [],
    settings: {
      editorsCanShare: true,
      viewersCanDownload: true,
      viewersCanSeeComments: false,
      showNamesToLinkVisitors: false,
      allowHtmlBlocks: false,
    },
    revision: 3,
    ...extra,
  };
}

type Store = { getItem: (key: string) => string | null; setItem: (key: string, v: string) => void };
function memoryStore(): Store & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function host(
  input: EditorShellInput,
  overrides: Partial<EditorShellState> = {},
): { state: EditorShellState; say: ReturnType<typeof vi.fn> } {
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
    closeDialog: vi.fn(),
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
    ...overrides,
  } satisfies EditorShellState as EditorShellState;
  return { state, say };
}

function Host({ state, children }: { state: EditorShellState; children: React.ReactNode }) {
  return <EditorShellContext value={state}>{children}</EditorShellContext>;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Opens the second stage of the dialog (docs/PRODUCT.md section 2 rank 3): the More row. */
function openMore(): void {
  const more = document.querySelector('[data-control="dialog.share.more"]');
  if (more === null) throw new Error('no More row');
  fireEvent.click(more);
}

function clipboard(): { texts: string[] } {
  const texts: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        texts.push(text);
        return Promise.resolve();
      },
    },
  });
  return { texts };
}

describe('the pure rules of the Share dialog', () => {
  it('names three rows that grant their role, the Present row carrying present=1', () => {
    expect(LINK_ROWS.map((row) => [row.id, row.role])).toEqual([
      ['view', 'viewer'],
      ['present', 'viewer'],
      ['edit', 'editor'],
    ]);
    expect(rowAddress('view', 'https://x.test/s/abc')).toBe('https://x.test/s/abc');
    expect(rowAddress('present', 'https://x.test/s/abc')).toBe('https://x.test/s/abc?present=1');
    expect(rowAddress('edit', 'https://x.test/s/abc')).toBe('https://x.test/s/abc');
  });

  it('gives a legacy deck its plain addresses with no read only promise on the view row', () => {
    const links = shareLinks('https://x.test', 'q4 review');
    expect(links.map((link) => link.url)).toEqual([
      'https://x.test/deck/q4%20review',
      'https://x.test/deck/q4%20review?present=1',
      'https://x.test/edit/q4%20review',
    ]);
    expect(links[0]?.note).toBeUndefined();
    expect(JSON.stringify(links)).not.toContain('Read only');
    expect(links[2]?.note).toBe('Anyone with this link can edit');
  });

  it('finds a row its live links by label, newest first', () => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    const links = [
      { id: 'a', role: 'viewer', label: 'View link', createdAt: '2026-09-01T00:00:00Z' },
      {
        id: 'b',
        role: 'viewer',
        label: 'View link',
        createdAt: '2026-09-10T00:00:00Z',
        revokedAt: '2026-09-11T00:00:00Z',
      },
      { id: 'c', role: 'viewer', label: 'View link', createdAt: '2026-09-12T00:00:00Z' },
      {
        id: 'd',
        role: 'viewer',
        label: 'View link',
        createdAt: '2026-09-13T00:00:00Z',
        expiresAt: '2026-09-14T00:00:00Z',
      },
      { id: 'e', role: 'editor', label: 'Edit link', createdAt: '2026-09-14T00:00:00Z' },
    ] as const;
    expect(linkIsLive(links[1], now)).toBe(false);
    expect(linkIsLive(links[3], now)).toBe(false);
    expect(liveLinksFor(links, 'View link', now).map((link) => link.id)).toEqual(['c', 'a']);
    expect(liveLinksFor(links, 'Edit link', now).map((link) => link.id)).toEqual(['e']);
    expect(liveLinksFor(undefined, 'Edit link', now)).toEqual([]);
  });

  it('remembers the minted addresses per deck and forgets the ones of dead links', () => {
    const store = memoryStore();
    expect(readLinkUrls('d1', store)).toEqual({});
    rememberLinkUrl('d1', 'lnk_a', 'https://x.test/s/aaa', store);
    rememberLinkUrl('d1', 'lnk_b', 'https://x.test/s/bbb', store);
    rememberLinkUrl('d2', 'lnk_c', 'https://x.test/s/ccc', store);
    expect(readLinkUrls('d1', store)).toEqual({
      lnk_a: 'https://x.test/s/aaa',
      lnk_b: 'https://x.test/s/bbb',
    });
    expect(pruneLinkUrls('d1', ['lnk_b'], store)).toEqual({ lnk_b: 'https://x.test/s/bbb' });
    expect(readLinkUrls('d1', store)).toEqual({ lnk_b: 'https://x.test/s/bbb' });
    expect(readLinkUrls('d2', store)).toEqual({ lnk_c: 'https://x.test/s/ccc' });
    expect(pruneLinkUrls('d1', [], store)).toEqual({});
    expect(JSON.parse(store.map.get(LINK_URLS_KEY) ?? '{}')).toEqual({
      d2: { lnk_c: 'https://x.test/s/ccc' },
    });
    /* a torn store reads as empty and a refused write is swallowed */
    store.map.set(LINK_URLS_KEY, 'not json');
    expect(readLinkUrls('d1', store)).toEqual({});
    expect(readLinkUrls('d1', null)).toEqual({});
    expect(() => rememberLinkUrl('d1', 'x', 'y', null)).not.toThrow();
  });

  it('recognises the conflict sentences of a share write and no other error', () => {
    expect(
      isShareConflict(new Error('the access record is at revision 4, not 3; re-read and retry')),
    ).toBe(true);
    expect(
      isShareConflict(
        new Error('The sharing settings changed since they were read; reload and retry'),
      ),
    ).toBe(true);
    expect(isShareConflict(new Error('Rename: baseRevision 1 is stale'))).toBe(true);
    expect(isShareConflict(new Error('not available to you'))).toBe(false);
  });

  it('names the mode in one plain sentence, without the words the default view refuses', () => {
    const shadow = authorizeSentence('shadow');
    const enforce = authorizeSentence('enforce');
    expect(shadow).toContain('not enforced');
    expect(enforce).toContain('enforced');
    expect(authorizeSentence(undefined)).toBeNull();
    for (const sentence of [shadow, enforce, DRAFT_SENTENCE, LEGACY_SENTENCE]) {
      expect(forbiddenWordsIn(sentence ?? '')).toEqual([]);
    }
    for (const row of LINK_ROWS) expect(forbiddenWordsIn(row.note)).toEqual([]);
    expect(FORBIDDEN_DEFAULT_VIEW_WORDS.length).toBeGreaterThan(0);
  });

  it('shapes the route record the way the editor page shapes input.access', () => {
    const view = accessViewOfRecord(
      record({
        grants: [
          {
            principalId: null,
            email: 'buyer@example.test',
            role: 'commenter',
            invitedAt: '2026-09-01T00:00:00Z',
            acceptedAt: null,
            expiresAt: null,
          },
          {
            principalId: 'usr_maya',
            email: null,
            role: 'editor',
            invitedAt: '2026-09-01T00:00:00Z',
            acceptedAt: '2026-09-02T00:00:00Z',
            expiresAt: '2026-09-03T00:00:00Z',
          },
        ],
        links: [
          {
            id: 'lnk_live',
            role: 'viewer',
            label: 'View link',
            createdAt: '2026-09-01T00:00:00Z',
            expiresAt: null,
            revokedAt: null,
          },
          {
            id: 'lnk_dead',
            role: 'viewer',
            createdAt: '2026-09-01T00:00:00Z',
            expiresAt: null,
            revokedAt: '2026-09-02T00:00:00Z',
          },
        ],
        requests: [
          {
            id: 'req_1',
            principalId: null,
            email: 'someone@example.test',
            role: 'viewer',
            askedAt: '2026-09-04T00:00:00Z',
            respondedAt: null,
          },
          {
            id: 'req_2',
            principalId: 'anon_22222222-2222-4222-8222-222222222222',
            email: null,
            role: 'editor',
            askedAt: '2026-09-04T00:00:00Z',
            respondedAt: '2026-09-05T00:00:00Z',
          },
        ],
      }),
      { signedIn: true, via: 'owner', now: Date.parse('2026-09-15T00:00:00Z') },
    );
    expect(view.revision).toBe(3);
    expect(view.owner?.kind).toBe('anonymous');
    expect(view.owner?.label.length).toBeGreaterThan(0);
    expect(view.grants?.map((grant) => grant.status)).toEqual(['pending', 'expired']);
    expect(view.grants?.[1]?.principal?.kind).toBe('account');
    expect(view.links?.map((link) => link.id)).toEqual(['lnk_live']);
    expect(view.requests?.map((request) => request.id)).toEqual(['req_1']);
    expect(view.claimable).toBe(false);
    expect(view.via).toBe('owner');
    expect(accessViewOfRecord(record({ owner: null }), { signedIn: true }).claimable).toBe(true);
    expect(accessViewOfRecord(record({ owner: null }), { signedIn: false }).claimable).toBe(false);
  });

  it('reads the route with the cookie and answers null for a refusal or a torn body', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            record: record(),
            role: 'owner',
            via: 'owner',
            capabilities: ['read', 'share'],
            authorize: 'shadow',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    }) as unknown as typeof fetch;
    const got = await loadAccess('q4-review', { signedIn: false, fetchFn });
    expect(calls[0]?.url).toBe('/api/access/q4-review');
    expect(calls[0]?.init?.credentials).toBe('same-origin');
    expect(got?.authorize).toBe('shadow');
    expect(got?.role).toBe('owner');
    expect(got?.capabilities).toEqual(['read', 'share']);
    expect(got?.view.revision).toBe(3);
    const refused = (() =>
      Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }))) as typeof fetch;
    expect(await loadAccess('q4-review', { signedIn: false, fetchFn: refused })).toBeNull();
    const torn = (() => Promise.resolve(new Response('null', { status: 200 }))) as typeof fetch;
    expect(await loadAccess('q4-review', { signedIn: false, fetchFn: torn })).toBeNull();
    const down = (() => Promise.reject(new TypeError('failed to fetch'))) as typeof fetch;
    expect(await loadAccess('q4-review', { signedIn: false, fetchFn: down })).toBeNull();
  });
});

describe('ShareDialog', () => {
  const baseInput = (extra: Partial<EditorShellInput> = {}): EditorShellInput => ({
    deckId: DECK,
    document: doc,
    slideId: SLIDE,
    revision: 4,
    origin: 'https://x.test',
    dispatch: vi.fn(() => Promise.resolve({})),
    ...extra,
  });

  const restricted = (extra: Partial<EditorAccess> = {}): EditorAccess => ({
    revision: 3,
    owner: {
      principalId: 'anon_11111111-1111-4111-8111-111111111111',
      label: 'Iridium 609',
      trust: 'label',
      kind: 'anonymous',
    },
    generalAccess: { mode: 'restricted', role: 'viewer' },
    grants: [],
    links: [],
    requests: [],
    via: 'owner',
    ...extra,
  });

  it('shows the draft sentence and no link rows before the first write', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const { state } = host(baseInput({ save: { state: 'unsaved', draft: true } }));
    const { container } = render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    expect(document.querySelector('[data-control="dialog.share.draft"]')?.textContent).toBe(
      DRAFT_SENTENCE,
    );
    expect(document.querySelector('[data-control="dialog.share.view"]')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(container).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('mints a row link on the first Copy link, copies the same address on the second, and carries present=1 on the Present row', async () => {
    const { texts } = clipboard();
    const dispatch = vi.fn((action: string, input: unknown) => {
      const { role, label } = input as { role: string; label: string };
      expect(action).toBe('share.createLink');
      const id = `lnk_${label.split(' ')[0]?.toLowerCase() ?? 'x'}`;
      return Promise.resolve({
        url: `https://x.test/s/${id}tokentokentokentok`,
        link: { id, role, label },
        record: { revision: 5 },
      });
    });
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            record: record(),
            role: 'owner',
            via: 'owner',
            capabilities: ['read', 'share', 'settings', 'publish', 'transfer'],
            authorize: 'enforce',
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchFn);
    const { state, say } = host(
      baseInput({
        dispatch: dispatch as unknown as EditorShellInput['dispatch'],
        /* the links table is drawn under Anyone with the link alone (docs/POLISH.md item 96):
           under Restricted no link opens the presentation */
        access: restricted({ generalAccess: { mode: 'link' as const, role: 'viewer' as const } }),
        role: 'owner',
        capabilities: ['read', 'share', 'settings', 'publish', 'transfer'],
      }),
    );
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    /* the link rows live behind More (rank 3): the first stage holds the one address field */
    expect(document.querySelector('[data-control="dialog.share.links"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share.address"]')).not.toBeNull();
    openMore();
    /* the three rows in order, with their role words, in the one links table (item 96) */
    const rows = [...document.querySelectorAll('[data-control="dialog.share.links"] > li')];
    expect(rows.map((row) => row.getAttribute('data-control'))).toEqual([
      'dialog.share.view',
      'dialog.share.present',
      'dialog.share.edit',
    ]);
    expect(rows[0]?.textContent).toContain('Viewer');
    expect(rows[2]?.textContent).toContain('Editor');
    expect(document.body.textContent).not.toContain('Read only');
    /* the first Copy link on the View row mints a viewer link and copies its address */
    fireEvent.click(document.querySelector('[data-control="dialog.share.view.copy"]')!);
    await flush();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[1]).toMatchObject({
      id: DECK,
      baseRevision: 3,
      role: 'viewer',
      label: 'View link',
    });
    expect(texts).toEqual(['https://x.test/s/lnk_viewtokentokentokentok']);
    expect(say).toHaveBeenCalledWith('Link copied');
    expect(readLinkUrls(DECK)).toEqual({
      lnk_view: 'https://x.test/s/lnk_viewtokentokentokentok',
    });
    /* the Edit row mints an editor link based on the revision the first write answered */
    fireEvent.click(document.querySelector('[data-control="dialog.share.edit.copy"]')!);
    await flush();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1]?.[1]).toMatchObject({
      baseRevision: 5,
      role: 'editor',
      label: 'Edit link',
    });
    expect(texts[1]).toBe('https://x.test/s/lnk_edittokentokentokentok');
    /* the Present row: a viewer link whose address carries present=1 */
    fireEvent.click(document.querySelector('[data-control="dialog.share.present.copy"]')!);
    await flush();
    await flush();
    expect(dispatch.mock.calls[2]?.[1]).toMatchObject({ role: 'viewer', label: 'Present link' });
    expect(texts[2]).toBe('https://x.test/s/lnk_presenttokentokentokentok?present=1');
    /* the mode sentence names the deployment's mode, read from the route */
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/access/' + encodeURIComponent(DECK),
      expect.anything(),
    );
    const mode = document.querySelector('[data-control="dialog.share.authorize"]');
    expect(mode?.getAttribute('data-mode')).toBe('enforce');
    expect(mode?.textContent).toBe(authorizeSentence('enforce'));
    vi.unstubAllGlobals();
  });

  it('copies the remembered address again once the record lists the row link, without a write', async () => {
    const { texts } = clipboard();
    rememberLinkUrl(DECK, 'lnk_view', 'https://x.test/s/rememberedtokentokento');
    const dispatch = vi.fn(() => Promise.resolve({}));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }))),
    );
    const { state } = host(
      baseInput({
        dispatch: dispatch as unknown as EditorShellInput['dispatch'],
        access: restricted({
          generalAccess: { mode: 'link' as const, role: 'viewer' as const },
          links: [
            {
              id: 'lnk_view',
              role: 'viewer',
              label: 'View link',
              createdAt: '2026-09-15T00:00:00Z',
              expiresAt: null,
              revokedAt: null,
            },
          ],
        }),
        role: 'owner',
        capabilities: ['read', 'share'],
      }),
    );
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    openMore();
    expect(
      document.querySelector('[data-control="dialog.share.view"]')?.getAttribute('data-minted'),
    ).toBe('1');
    fireEvent.click(document.querySelector('[data-control="dialog.share.view.copy"]')!);
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
    expect(texts).toEqual(['https://x.test/s/rememberedtokentokento']);
    /* no mode sentence when the route refused: nothing is promised either way */
    expect(document.querySelector('[data-control="dialog.share.authorize"]')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows the plain addresses and the open sentence for a legacy deck, and the shadow sentence from the route', async () => {
    const { texts } = clipboard();
    const dispatch = vi.fn(() => Promise.resolve({}));
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              record: record({ owner: null, generalAccess: { mode: 'open', role: 'editor' } }),
              role: 'editor',
              via: 'open',
              capabilities: ['read', 'write'],
              authorize: 'shadow',
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const { state } = host(
      baseInput({
        dispatch: dispatch as unknown as EditorShellInput['dispatch'],
        access: restricted({ owner: null, generalAccess: { mode: 'open', role: 'editor' } }),
        role: 'editor',
        capabilities: ['read', 'write'],
      }),
    );
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    /* the first stage names the legacy access and its sentence; the rows sit behind More */
    expect(document.querySelector('[data-control="dialog.share.legacy"]')).not.toBeNull();
    expect(
      document.querySelector('[data-control="dialog.share.accessSentence"]')?.textContent,
    ).toBe(LEGACY_SENTENCE);
    openMore();
    expect(document.querySelector('[data-control="dialog.share.open"]')?.textContent).toBe(
      LEGACY_SENTENCE,
    );
    fireEvent.click(document.querySelector('[data-control="dialog.share.view.copy"]')!);
    fireEvent.click(document.querySelector('[data-control="dialog.share.present.copy"]')!);
    fireEvent.click(document.querySelector('[data-control="dialog.share.edit.copy"]')!);
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
    expect(texts).toEqual([
      `https://x.test/deck/${DECK}`,
      `https://x.test/deck/${DECK}?present=1`,
      `https://x.test/edit/${DECK}`,
    ]);
    const mode = document.querySelector('[data-control="dialog.share.authorize"]');
    expect(mode?.getAttribute('data-mode')).toBe('shadow');
    expect(mode?.textContent).toContain('not enforced');
    vi.unstubAllGlobals();
  });

  it('reads the record from the route when the page carries none, and retries a conflicting write once on the fresh revision', async () => {
    clipboard();
    let revision = 7;
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            record: record({ revision, generalAccess: { mode: 'link', role: 'viewer' } }),
            role: 'owner',
            via: 'owner',
            capabilities: ['read', 'share'],
            authorize: 'enforce',
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchFn);
    const dispatch = vi.fn((_action: string, input: unknown) => {
      const base = (input as { baseRevision: number }).baseRevision;
      if (base !== 9) {
        revision = 9;
        return Promise.reject(
          new Error(`the access record is at revision 9, not ${base}; re-read and retry`),
        );
      }
      return Promise.resolve({
        url: 'https://x.test/s/freshtokentokentokentok',
        link: { id: 'lnk_fresh' },
        record: { revision: 10 },
      });
    });
    const { state } = host(
      baseInput({
        dispatch: dispatch as unknown as EditorShellInput['dispatch'],
        save: { state: 'saved' },
      }),
    );
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    /* the loading state first, then the record from the route */
    expect(document.querySelector('[data-control="dialog.share.loading"]')).not.toBeNull();
    await flush();
    await flush();
    expect(document.querySelector('[data-control="dialog.share.loading"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share.mode"]')).not.toBeNull();
    expect(
      (document.querySelector('[data-control="dialog.share.mode"]') as HTMLSelectElement).value,
    ).toBe('link');
    openMore();
    expect(document.querySelector('[data-control="dialog.share.owner"]')).not.toBeNull();
    fireEvent.click(document.querySelector('[data-control="dialog.share.edit.copy"]')!);
    await flush();
    await flush();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]?.[1]).toMatchObject({ baseRevision: 7 });
    expect(dispatch.mock.calls[1]?.[1]).toMatchObject({ baseRevision: 9 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-control="dialog.share.error"]')?.textContent).toBe('');
    vi.unstubAllGlobals();
  });

  it('reopens on the record the last write answered: the same address without a write, and the next mint on the answered revision (C2-F2)', async () => {
    const { texts } = clipboard();
    const minted = record({
      revision: 4,
      generalAccess: { mode: 'link', role: 'viewer' },
      links: [
        {
          id: 'lnk_view',
          role: 'viewer',
          label: 'View link',
          createdAt: '2026-09-16T00:00:00Z',
          expiresAt: null,
          revokedAt: null,
        },
      ],
    });
    const dispatch = vi.fn((_action: string, input: unknown) => {
      const { label, baseRevision } = input as { label: string; baseRevision: number };
      const id = `lnk_${label.split(' ')[0]?.toLowerCase() ?? 'x'}`;
      return Promise.resolve({
        url: `https://x.test/s/${id}tokentokentokentok`,
        link: { id, role: 'viewer', label },
        // the whole record, as share.createLink answers it (apps/cli/src/records/access.ts)
        record: { ...minted, revision: baseRevision + 1, createdAt: '2026-09-16T00:00:00Z' },
      });
    });
    /* the route answers the record from before the mint: another instance's 5 s entry */
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              record: record(),
              role: 'owner',
              via: 'owner',
              capabilities: ['share'],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const input = baseInput({
      dispatch: dispatch as unknown as EditorShellInput['dispatch'],
      access: restricted({ generalAccess: { mode: 'link' as const, role: 'viewer' as const } }),
      role: 'owner',
      capabilities: ['read', 'share'],
    });
    const first = render(
      <Host state={host(input).state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    openMore();
    fireEvent.click(document.querySelector('[data-control="dialog.share.view.copy"]')!);
    await flush();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[1]).toMatchObject({ baseRevision: 3, label: 'View link' });
    expect(texts).toEqual(['https://x.test/s/lnk_viewtokentokentokentok']);
    expect(answeredAccess(DECK)?.revision).toBe(4);
    expect(answeredAccess(DECK)?.view?.links?.map((link) => link.id)).toEqual(['lnk_view']);
    /* Done closes the dialog; the next open mounts it anew over the page's record at revision 3 */
    first.unmount();
    render(
      <Host state={host(input).state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    openMore();
    /* the View row finds the link the last open minted and copies the same address, no write */
    fireEvent.click(document.querySelector('[data-control="dialog.share.view.copy"]')!);
    await flush();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(texts[1]).toBe('https://x.test/s/lnk_viewtokentokentokentok');
    /* the Present row mints on the revision the last write answered, not the page's 3 */
    fireEvent.click(document.querySelector('[data-control="dialog.share.present.copy"]')!);
    await flush();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1]?.[1]).toMatchObject({ baseRevision: 4, label: 'Present link' });
    expect(texts[2]).toBe('https://x.test/s/lnk_presenttokentokentokentok?present=1');
    expect(answeredAccess(DECK)?.revision).toBe(5);
    expect(document.querySelector('[data-control="dialog.share.error"]')?.textContent ?? '').toBe(
      '',
    );
    vi.unstubAllGlobals();
  });

  it('keeps the page standing on the newest record and notes a partial answer by its revision alone', () => {
    const page = restricted({ revision: 3, via: 'owner', claimable: false });
    const later = accessViewOfRecord(record({ revision: 6 }), { signedIn: false });
    expect(newestAccess(page, undefined, later)).toMatchObject({ revision: 6, via: 'owner' });
    expect(newestAccess(page, later, undefined)?.revision).toBe(6);
    expect(newestAccess(undefined, undefined)).toBeUndefined();
    expect(newestAccess(page, restricted({ revision: 2 }))).toBe(page);
    noteAnsweredAccess(DECK, { record: { revision: 8 } });
    expect(answeredAccess(DECK)).toEqual({ revision: 8 });
    noteAnsweredAccess(DECK, { record: { ...record({ revision: 7 }) } });
    expect(answeredAccess(DECK)?.revision).toBe(8);
    noteAnsweredAccess(DECK, { record: { ...record({ revision: 9 }) } });
    expect(answeredAccess(DECK)?.view?.revision).toBe(9);
    noteAnsweredAccess(DECK, null);
    noteAnsweredAccess(DECK, { record: { revision: -1 } });
    expect(answeredAccess(DECK)?.revision).toBe(9);
    forgetAnsweredAccess(DECK);
    expect(answeredAccess(DECK)).toBeNull();
  });

  it('shows the claim block with its sentence for a claimable legacy view, and the legacy row alone for an anonymous browser', async () => {
    /* the rule share.spec.ts's legacy row reads (SPEC-3 6.1; `share.claim` is a signed in
       principal's): `claimable` is set by the page for a signed in account on an unowned deck and
       the block follows it; an anonymous owner sees the legacy row and no block */
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })),
    );
    vi.stubGlobal('fetch', fetchFn);
    const legacy = (extra: Partial<EditorAccess> = {}): EditorAccess => ({
      revision: 0,
      owner: null,
      generalAccess: { mode: 'open', role: 'editor' },
      via: 'open',
      ...extra,
    });
    const anonymous = host(
      baseInput({ access: legacy(), role: 'editor', save: { state: 'saved' } }),
    );
    const first = render(
      <Host state={anonymous.state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    expect(document.querySelector('[data-control="dialog.share.legacy"]')?.textContent).toContain(
      'Anyone with the address can view (legacy)',
    );
    expect(document.querySelector('[data-control="dialog.share.claim"]')).toBeNull();
    first.unmount();

    const signedIn = host(
      baseInput({
        access: legacy({ claimable: true }),
        role: 'editor',
        save: { state: 'saved' },
        account: {
          principal: {
            principalId: 'usr_22222222-2222-4222-8222-222222222222',
            label: 'Maya Chen',
            trust: 'verified',
            kind: 'account',
          },
          signedIn: true,
          signInAvailable: true,
        },
      }),
    );
    render(
      <Host state={signedIn.state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const claim = document.querySelector('[data-control="dialog.share.claim"]');
    expect(claim?.textContent).toContain('This presentation has no owner yet');
    expect(
      (document.querySelector('[data-control="dialog.share.claim.button"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    vi.unstubAllGlobals();
  });

  it('reads the owner row from a resolved view with the badge or the guest word, and the email line for a sharer alone (people round)', async () => {
    const owner = {
      principalId: 'usr_owner',
      label: 'Cobalt 512',
      name: 'Ada Lovelace',
      trust: 'verified' as const,
      kind: 'account' as const,
    };
    const typed = {
      principalId: 'anon_maya',
      label: 'Titanium 471',
      name: 'Maya',
      trust: 'guest' as const,
      kind: 'anonymous' as const,
    };
    const grants = [
      {
        principal: typed,
        email: 'maya@example.test',
        role: 'editor' as const,
        invitedAt: '2026-09-10T00:00:00Z',
        acceptedAt: '2026-09-10T00:00:00Z',
        expiresAt: null,
        status: 'active' as const,
      },
    ];
    const asSharer = host(
      baseInput({
        access: restricted({ owner, grants, via: 'grant' }),
        capabilities: ['read', 'share'],
        presence: { others: [], self: undefined },
      }),
    );
    render(
      <Host state={asSharer.state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const ownerRow = document.querySelector<HTMLElement>('[data-control="dialog.share.owner"]');
    expect(ownerRow?.querySelector('.ts-share-row-name')?.textContent).toContain('Ada Lovelace');
    expect(ownerRow?.querySelector('.ts-trust-mark')?.getAttribute('aria-label')).toBe('signed in');
    expect(ownerRow?.querySelector('.ts-chip')?.getAttribute('aria-label')).toBe(
      'Ada Lovelace, signed in',
    );
    const grantRow = document.querySelector<HTMLElement>('[data-control^="dialog.share.grant."]');
    expect(grantRow?.querySelector('.ts-share-row-name')?.textContent).toContain('Maya');
    expect(grantRow?.querySelector('.ts-share-row-trust')?.textContent).toContain('guest');
    expect(grantRow?.querySelector('.ts-share-row-name')?.getAttribute('title')).toBeNull();
    const email = grantRow?.querySelector<HTMLElement>('[data-control="dialog.share.row.0.email"]');
    expect(email?.textContent).toBe('maya@example.test');
    expect(email?.classList.contains('ts-share-row-email')).toBe(true);
    cleanup();
    /* a reader without share sees the same rows and no address */
    const asReader = host(
      baseInput({
        access: restricted({ owner, grants, via: 'link' }),
        capabilities: ['read'],
        presence: { others: [], self: undefined },
      }),
    );
    render(
      <Host state={asReader.state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const readerGrant = document.querySelector<HTMLElement>(
      '[data-control^="dialog.share.grant."]',
    );
    expect(readerGrant?.querySelector('.ts-share-row-email')).toBeNull();
    expect(readerGrant?.querySelector('.ts-share-row-name')?.getAttribute('title')).toBeNull();
    /* the owner reading the dialog reads You on the row through the one own identity (3.11) */
    cleanup();
    const asOwner = host(
      baseInput({
        access: restricted({ owner, grants, via: 'owner' }),
        capabilities: ['read', 'share'],
        account: { principal: owner, signedIn: true, signInAvailable: true },
      }),
    );
    render(
      <Host state={asOwner.state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    expect(
      document.querySelector('[data-control="dialog.share.owner"] .ts-share-row-name')?.textContent,
    ).toContain('You');
  });

  it('maps a fetched record through the identities map when one is given, else to the label the id gives (people round)', () => {
    const resolved = {
      principalId: 'usr_owner',
      label: 'Cobalt 512',
      name: 'Ada Lovelace',
      trust: 'verified' as const,
      kind: 'account' as const,
      email: 'ada@example.test',
    };
    const view = accessViewOfRecord(record({ owner: 'usr_owner' }), {
      signedIn: true,
      identities: { usr_owner: resolved },
    });
    expect(view.owner).toBe(resolved);
    const bare = accessViewOfRecord(record({ owner: 'usr_owner' }), { signedIn: true });
    expect(bare.owner?.name).toBeUndefined();
    expect(bare.owner?.trust).toBe('verified');
    expect(bare.owner?.label.length).toBeGreaterThan(0);
  });
});

// The product round (docs/PRODUCT.md section 2 ranks 3 and 4; the rows share.dialog.one-link,
// share.dialog.slideshow-checkbox, share.dialog.more-row and share.dialog.you-label): the first
// stage holds the access select, its sentence, one address field with one Copy link and the show
// checkbox; the rest sits behind More; the own row reads You.
describe('the two stages of the Share dialog (product round)', () => {
  const baseInput = (extra: Partial<EditorShellInput> = {}): EditorShellInput => ({
    deckId: DECK,
    document: doc,
    slideId: 'content-rule',
    revision: 3,
    origin: 'https://x.test',
    dispatch: vi.fn(() => Promise.resolve({})),
    save: { state: 'saved' },
    ...extra,
  });
  const restricted = (extra: Partial<EditorAccess> = {}): EditorAccess => ({
    ...accessViewOfRecord(record({ revision: 3 }), { signedIn: false, via: 'owner' }),
    ...extra,
  });

  it('names what each access does in one sentence, with no instruction after it', () => {
    /* docs/POLISH.md items 78 and 96: one statement per access, the same on every deployment */
    expect(accessSentence('link', 'editor', 'shadow')).toBe(
      'Anyone with the link can open and edit this presentation',
    );
    expect(accessSentence('link', 'editor', 'shadow')).not.toContain('Pick Viewer');
    expect(accessSentence('link', 'viewer', 'shadow')).toBe(
      'Anyone with the link can open it and cannot change it',
    );
    expect(accessSentence('restricted', 'viewer', 'shadow')).toBe(
      'Only you can open this presentation',
    );
    expect(accessSentence('restricted', 'viewer', 'enforce')).toBe(
      'Only you can open this presentation',
    );
    expect(accessSentence('open', 'editor', undefined)).toBe(LEGACY_SENTENCE);
  });

  it('shows the address for the selected access, copies the field, swaps it for the present link and keeps the rest behind More', async () => {
    const { texts } = clipboard();
    const dispatch = vi.fn(() => Promise.resolve({}));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }))),
    );
    const owner = 'anon_11111111-1111-4111-8111-111111111111';
    const { state } = host(
      baseInput({
        dispatch: dispatch as unknown as EditorShellInput['dispatch'],
        access: restricted({
          generalAccess: { mode: 'link', role: 'editor' },
          linkUrl: 'https://x.test/s/generaltokentokentokentok',
        }),
        role: 'owner',
        capabilities: ['read', 'share', 'settings'],
        account: {
          principal: { principalId: owner, label: 'Ink 100', trust: 'label', kind: 'anonymous' },
          signedIn: false,
          signInAvailable: false,
        },
      }),
    );
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const address = document.querySelector<HTMLInputElement>(
      '[data-control="dialog.share.address"]',
    );
    expect(address?.readOnly).toBe(true);
    expect(address?.value).toBe('https://x.test/s/generaltokentokentokentok');
    expect(
      (document.querySelector('[data-control="dialog.share.linkRole"]') as HTMLSelectElement).value,
    ).toBe('editor');
    expect(
      document.querySelector('[data-control="dialog.share.accessSentence"]')?.textContent,
    ).toBe('Anyone with the link can open and edit this presentation');
    /* one Copy link in the first stage, and it copies the field */
    expect(document.querySelectorAll('[data-control$=".copy"]')).toHaveLength(1);
    fireEvent.click(document.querySelector('[data-control="dialog.share.copy"]')!);
    await flush();
    expect(texts).toEqual(['https://x.test/s/generaltokentokentokentok']);
    expect(dispatch).not.toHaveBeenCalled();
    /* Open as a slideshow swaps the field for the present link and back */
    fireEvent.click(document.querySelector('[data-control="dialog.share.slideshow"]')!);
    expect(address?.value).toBe('https://x.test/s/generaltokentokentokentok?present=1');
    fireEvent.click(document.querySelector('[data-control="dialog.share.slideshow"]')!);
    expect(address?.value).toBe('https://x.test/s/generaltokentokentokentok');
    /* the invite row, the link rows and the gear wait behind More, which reads Settings once open */
    expect(document.querySelector('[data-control="dialog.share.emails"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share.links"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share.footer"]')).toBeNull();
    const more = document.querySelector('[data-control="dialog.share.more"]');
    expect(more?.textContent).toContain('More');
    openMore();
    expect(more?.textContent).toContain('Settings');
    expect(document.querySelector('[data-control="dialog.share.emails"]')).not.toBeNull();
    expect(document.querySelector('[data-control="dialog.share.links"]')).not.toBeNull();
    expect(document.querySelector('[data-control="dialog.share.gear"]')).not.toBeNull();
    /* the own row reads You (rank 4) */
    expect(document.querySelector('[data-control="dialog.share.owner"]')?.textContent).toContain(
      'You',
    );
    vi.unstubAllGlobals();
  });

  /* the first Share's name ask (docs/PRODUCT.md section 2 rank 4; the people round's fix round,
     VERIFICATION.md People round pass 1 finding 4): a band at the head of the body carrying the
     prompt's control ids, so the dialog itself opens at once for a person by link too */
  const anonymous = (
    setName: (name: string) => Promise<unknown>,
    extra: Partial<NonNullable<EditorShellInput['account']>> = {},
  ): EditorShellInput =>
    baseInput({
      access: restricted(),
      role: 'owner',
      capabilities: ['read', 'share'],
      account: {
        principal: {
          principalId: 'anon_11111111-1111-4111-8111-111111111111',
          label: 'Ink 100',
          trust: 'label',
          kind: 'anonymous',
        },
        signedIn: false,
        signInAvailable: false,
        setName,
        ...extra,
      },
    });
  const notFound = () =>
    vi.fn(() => Promise.resolve(new Response('{"error":"not_found"}', { status: 404 })));

  it('asks a browser with no display name for one on the first Share, in a band inside the dialog, once, and never a signed in account', async () => {
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    const setName = vi.fn(() => Promise.resolve(undefined));
    vi.stubGlobal('fetch', notFound());
    const { state } = host(anonymous(setName));
    const first = render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    /* the dialog opens at once, the ask at the head of its body; the ask is no dialog of its own */
    const dialog = document.querySelector('[data-control="dialog.share"]');
    expect(dialog).not.toBeNull();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('.ts-dialog-title')?.textContent).toBe(`Share ${doc.deck.title}`);
    const ask = dialog!.querySelector('[data-control="dialog.namePrompt"]');
    expect(ask).not.toBeNull();
    expect(ask!.textContent).toContain('Your name, shown to collaborators');
    expect(dialog!.firstElementChild?.nextElementSibling?.contains(ask)).toBe(true);
    expect(
      dialog!.querySelector<HTMLInputElement>('[data-control="dialog.namePrompt.name"]')?.value,
    ).toBe('Ink 100');
    /* the field's placeholder is the prompt's (docs/POLISH.md 2.6 item 63) */
    expect(
      dialog!
        .querySelector<HTMLInputElement>('[data-control="dialog.namePrompt.name"]')
        ?.getAttribute('placeholder'),
    ).toBe('Your name');
    /* the record's rows stand under the band from the first paint */
    expect(dialog!.querySelector('[data-control="dialog.share.general"]')).not.toBeNull();
    expect(dialog!.querySelector('[data-control="dialog.share.owner"]')).not.toBeNull();
    /* the field takes the focus, so the person can type at once */
    expect(document.activeElement?.getAttribute('data-control')).toBe('dialog.namePrompt.name');
    fireEvent.click(document.querySelector('[data-control="dialog.namePrompt.skip"]')!);
    await flush();
    expect(document.querySelector('[data-control="dialog.namePrompt"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share"]')).not.toBeNull();
    expect(setName).not.toHaveBeenCalled();
    expect(state.closeDialog).not.toHaveBeenCalled();
    expect(localStorage.getItem(SHARE_NAME_ASKED_KEY)).toBe('1');
    /* the focus the band held goes to Done, so Enter and Escape keep working */
    expect(document.activeElement?.getAttribute('data-control')).toBe('dialog.share.done');
    first.unmount();
    /* the second open asks nothing */
    const second = render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    expect(document.querySelector('[data-control="dialog.namePrompt"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share"]')).not.toBeNull();
    second.unmount();
    /* a signed in account has its name: no band, even on a browser never asked */
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    const signedIn = host(
      anonymous(setName, {
        principal: {
          principalId: 'acct_22222222-2222-4222-8222-222222222222',
          label: 'Ada Lovelace',
          name: 'Ada Lovelace',
          trust: 'verified',
          kind: 'account',
        },
        signedIn: true,
      }),
    );
    render(
      <Host state={signedIn.state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    expect(document.querySelector('[data-control="dialog.namePrompt"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share"]')).not.toBeNull();
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.unstubAllGlobals();
  });

  it('keeps the name typed into the band on Enter or Continue and never runs Done', async () => {
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.stubGlobal('fetch', notFound());
    const setName = vi.fn(() => Promise.resolve(undefined));
    const { state } = host(anonymous(setName));
    const first = render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const field = document.querySelector<HTMLInputElement>(
      '[data-control="dialog.namePrompt.name"]',
    )!;
    fireEvent.change(field, { target: { value: '  Copper Lane ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await flush();
    expect(setName).toHaveBeenCalledWith('Copper Lane');
    expect(state.closeDialog).not.toHaveBeenCalled();
    expect(document.querySelector('[data-control="dialog.namePrompt"]')).toBeNull();
    expect(document.querySelector('[data-control="dialog.share"]')).not.toBeNull();
    expect(localStorage.getItem(SHARE_NAME_ASKED_KEY)).toBe('1');
    first.unmount();
    /* Continue, the button */
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    setName.mockClear();
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const again = document.querySelector<HTMLInputElement>(
      '[data-control="dialog.namePrompt.name"]',
    )!;
    fireEvent.change(again, { target: { value: 'Iron Gate' } });
    fireEvent.click(document.querySelector('[data-control="dialog.namePrompt.continue"]')!);
    await flush();
    expect(setName).toHaveBeenCalledWith('Iron Gate');
    expect(document.querySelector('[data-control="dialog.namePrompt"]')).toBeNull();
    expect(state.closeDialog).not.toHaveBeenCalled();
    /* an empty field keeps Continue disabled and Enter does nothing */
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.unstubAllGlobals();
  });

  it("shows the server's refusal sentence in the band and keeps the band", async () => {
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.stubGlobal('fetch', notFound());
    const setName = vi.fn(() => Promise.reject(new Error('That name is reserved')));
    const { state } = host(anonymous(setName));
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const field = document.querySelector<HTMLInputElement>(
      '[data-control="dialog.namePrompt.name"]',
    )!;
    fireEvent.change(field, { target: { value: 'studio' } });
    fireEvent.click(document.querySelector('[data-control="dialog.namePrompt.continue"]')!);
    await flush();
    expect(document.querySelector('[data-control="dialog.namePrompt.error"]')?.textContent).toBe(
      'That name is reserved',
    );
    expect(document.querySelector('[data-control="dialog.namePrompt"]')).not.toBeNull();
    expect(localStorage.getItem(SHARE_NAME_ASKED_KEY)).toBeNull();
    /* an empty field disables Continue and Enter keeps nothing */
    fireEvent.change(field, { target: { value: '   ' } });
    expect(
      document.querySelector<HTMLButtonElement>('[data-control="dialog.namePrompt.continue"]')
        ?.disabled,
    ).toBe(true);
    fireEvent.keyDown(field, { key: 'Enter' });
    await flush();
    expect(setName).toHaveBeenCalledTimes(1);
    expect(state.closeDialog).not.toHaveBeenCalled();
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.unstubAllGlobals();
  });

  it("counts a close with the band still up as asked, the way the prompt's close did", async () => {
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.stubGlobal('fetch', notFound());
    const setName = vi.fn(() => Promise.resolve(undefined));
    const { state } = host(anonymous(setName));
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    fireEvent.keyDown(document.querySelector('[data-control="dialog.share"]')!, { key: 'Escape' });
    expect(state.closeDialog).toHaveBeenCalledTimes(1);
    expect(setName).not.toHaveBeenCalled();
    expect(localStorage.getItem(SHARE_NAME_ASKED_KEY)).toBe('1');
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.unstubAllGlobals();
  });

  it('draws the band over the loading state while the record is on its way', async () => {
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    /* the route never answers in this test: the loading state stands */
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const setName = vi.fn(() => Promise.resolve(undefined));
    const { state } = host({ ...anonymous(setName), access: undefined, role: undefined });
    render(
      <Host state={state}>
        <ShareDialog />
      </Host>,
    );
    await flush();
    const dialog = document.querySelector('[data-control="dialog.share"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelector('[data-control="dialog.share.loading"]')).not.toBeNull();
    expect(dialog!.querySelector('[data-control="dialog.namePrompt"]')).not.toBeNull();
    localStorage.removeItem(SHARE_NAME_ASKED_KEY);
    vi.unstubAllGlobals();
  });
});
