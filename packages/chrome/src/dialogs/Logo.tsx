import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isActionId } from '@turboslide/schema/actions';
import type { Asset } from '@turboslide/schema/assets';
import type { BrandKit, DefaultKit, KitAppearance } from '@turboslide/schema/brand';
import { CATALOG } from '@turboslide/schema/catalog';
import { deckAppearance } from '@turboslide/schema/deck';

import { Dialog, DialogCheck } from '../Dialog';
import type { EditorDispatch } from '../dispatch';
import type { PictureTarget } from '../editor-shell';
import { factsOf, insertBlockPlan } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import {
  LOGO_ROUTE,
  LOGO_SEARCH_DEFAULT_LIMIT,
  LOGO_SEARCH_MAX_LIMIT,
  LOGO_WORDS,
  chooseVariant,
  kitBackgroundColour,
  kitTextColour,
  licenceLinkOf,
  licenceSentenceOf,
  licenceTooltipOf,
  logoMarkPath,
} from '../logo-model';
import type { LogoIndexFacts, LogoRow, LogoSearchRow } from '../logo-model';
import { LOGO_DIALOG } from '../menus/strings';
import { isParked } from '../parked-controls';
import { tipProps } from '../Tooltip';

import './Logo.css';

/**
 * Insert > Logo, Insert > Image > Logo and Replace image > Logo (docs/FEATURES.md 4.3, 4.4, 4.6,
 * 4.9; audit-logos 1, 6, 12, 15, 17, 21): the picker over thesvg.org. The head holds the search
 * field "Company name" with the focus; the body holds the groups Your brand (the deployment's
 * default kit logo, the deck's kit logo when it is a picture, and the deck's `role: 'logo'`
 * assets), Recent (the last twelve picks on this browser) and Results (the cache's matches,
 * twenty at a time, more on scroll); the foot holds the check "Use as this presentation's logo on
 * every slide" with its sentence, the selected tile's licence row as a seller's sentence with the
 * recorded string in its tooltip, the source sentence with the cache's date, and Insert. A tile is
 * the mark drawn twice, on a paper half and an ink half whose grounds are the kit's two Background
 * colours, with the title under it; each half draws the variant the appearance rule of
 * logo-model.ts picks for its appearance (`chooseVariant`, B6's, with the tint rule of question
 * 2). The first result is preselected so Enter inserts it; the arrows move; Escape closes; a
 * click inserts at once and the dialog closes with the picture selected.
 *
 * The data (build/b6.md R10): the rows come from the same origin route `GET /api/logo/search`
 * (the `logo.search` answer) after a 200 ms pause, so the results draw within the row's 300 ms;
 * the insert runs `logo.insert` through the shell's dispatch when the schema lists the id and
 * through `POST /api/logo/insert?deck=<id>` until it does, and the asset it answers is placed by
 * the editor's `insertLogoAsset` at the logo size, which also writes the kit's slots when the
 * every slide check is on and says so with Undo (4.4). A deck asset of the Your brand group is
 * placed through `insertPictureAsset` (the logo size rule is the placement's); the default kit's
 * logo through `insertPictureFromUrl` when the kit names a picture and as a `mark` block when it
 * is the theme's mark. The empty state offers Upload, which runs the shell's chooser. While
 * thesvg.org did not answer the foot says so and the cached rows still insert (4.9). Every control
 * carries its `data-control` id from 4.3 and a parked id is hidden through parked-controls.ts
 * (4.12, 7.2).
 *
 * Ids: `dialog.logo`, `dialog.logo.search`, `dialog.logo.group.brand`, `dialog.logo.group.recent`,
 * `dialog.logo.group.results`, `dialog.logo.tile.<slug>` with `.paper` and `.ink`,
 * `dialog.logo.everySlide`, `dialog.logo.licence`, `dialog.logo.source`, `dialog.logo.empty`,
 * `dialog.logo.upload`, `dialog.logo.insert`, `dialog.logo.includeCloud`.
 */

// ---------------------------------------------------------------------------------------------
// The words: the dialog's own are LOGO_DIALOG in menus/strings.ts (moved there at the merge,
// build/b1.md R3) and the seller sentences it shares with the server are LOGO_WORDS in
// logo-model.ts; DIALOG_WORDS composes the two for the component.

const DIALOG_WORDS = {
  ...LOGO_DIALOG,
  lead: LOGO_WORDS.lead,
  everySlide: LOGO_WORDS.everySlideCheck,
  everySlideDoc: LOGO_WORDS.everySlideLine,
  empty: LOGO_WORDS.empty,
  kitHint: LOGO_WORDS.emptyKit,
} as const;

/** The group ids as literals, so `parks` names them (core-matrix.mjs reads this file). */
export const LOGO_GROUP_CONTROLS = {
  brand: 'dialog.logo.group.brand',
  recent: 'dialog.logo.group.recent',
  results: 'dialog.logo.group.results',
} as const;

// ---------------------------------------------------------------------------------------------
// The transport (build/b6.md R3, R10): the search over the same origin route, the insert through
// the action when the schema lists it and through the route until it does

/** The answer of `GET /api/logo/search` and of `logo.search` (4.11, 4.9). */
export type LogoSearchAnswer = LogoIndexFacts & {
  logos: readonly LogoSearchRow[];
  source?: string;
};

/** The answer of `logo.insert` (4.11): the stored asset and, when the handler placed it, the block. */
export type LogoInsertAnswer = { asset: { id: string; size?: [number, number] }; blockId?: string };

export type LogoSearchOptions = { limit?: number; collection?: 'brands' | 'all' };

/** The route's address for a query (4.11's fields as query parameters). */
export function logoSearchUrl(query: string, options: LogoSearchOptions = {}): string {
  const params = new URLSearchParams({ q: query });
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.collection !== undefined) params.set('collection', options.collection);
  return `${LOGO_ROUTE}/search?${params.toString()}`;
}

/** The message of a route's error body (`{ error: { message } }`), else the status sentence. */
async function routeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === 'string') return body.error.message;
  } catch {
    // not JSON
  }
  return LOGO_DIALOG.routeFailed(response.status);
}

/** The rows for a query from the same origin route; rejects with one sentence. */
export async function searchLogos(
  query: string,
  options: LogoSearchOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<LogoSearchAnswer> {
  const response = await fetcher(logoSearchUrl(query, options), {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(await routeError(response));
  const answer = (await response.json()) as Partial<LogoSearchAnswer>;
  return {
    logos: Array.isArray(answer.logos) ? answer.logos : [],
    updatedAt: answer.updatedAt ?? null,
    ...(answer.lastError === undefined ? {} : { lastError: answer.lastError }),
    ...(answer.progress === undefined ? {} : { progress: answer.progress }),
    ...(answer.source === undefined ? {} : { source: answer.source }),
  };
}

export type LogoInsertInput = {
  slug: string;
  variant?: string;
  slideId?: string;
  blockId?: string;
  everySlide?: boolean;
  baseRevision: number;
};

/**
 * `logo.insert` (4.11): the shell's dispatch when the schema's table lists the id (B6's R2 lands
 * it; the window transport then runs the server handler), else the same origin route the same
 * handler sits behind.
 */
export async function insertLogo(
  input: LogoInsertInput,
  deps: { dispatch: EditorDispatch; deckId: string; fetcher?: typeof fetch },
): Promise<LogoInsertAnswer> {
  const id = 'logo.insert';
  if (isActionId(id)) return (await deps.dispatch(id, input)) as LogoInsertAnswer;
  const response = await (deps.fetcher ?? fetch)(
    `${LOGO_ROUTE}/insert?deck=${encodeURIComponent(deps.deckId)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new Error(await routeError(response));
  return (await response.json()) as LogoInsertAnswer;
}

// ---------------------------------------------------------------------------------------------
// Recent, per browser (4.3; question 6's default)

export const RECENT_STORAGE = 'turboslide.logos.recent';
export const RECENT_MAX = 12;

/** The fields Recent keeps of a row, enough to draw and insert it without a search. */
export function recentRowOf(row: LogoSearchRow): LogoSearchRow {
  return {
    slug: row.slug,
    title: row.title,
    aliases: [],
    categories: [],
    variants: row.variants,
    license: row.license,
    licenceSentence: row.licenceSentence,
    collection: row.collection,
    ...(row.unavailable === undefined ? {} : { unavailable: row.unavailable }),
    ...(row.url === undefined ? {} : { url: row.url }),
    ...(row.guidelines === undefined ? {} : { guidelines: row.guidelines }),
    ...(row.readsOnPaper === undefined ? {} : { readsOnPaper: row.readsOnPaper }),
    ...(row.readsOnInk === undefined ? {} : { readsOnInk: row.readsOnInk }),
  };
}

export function readRecent(storage: Storage | null = storageOf()): LogoSearchRow[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(RECENT_STORAGE);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (each): each is LogoSearchRow =>
          typeof each === 'object' &&
          each !== null &&
          typeof (each as LogoRow).slug === 'string' &&
          typeof (each as LogoRow).title === 'string' &&
          typeof (each as LogoRow).license === 'string' &&
          typeof (each as LogoRow).variants === 'object',
      )
      .map((each) => ({
        ...each,
        aliases: Array.isArray(each.aliases) ? each.aliases : [],
        categories: Array.isArray(each.categories) ? each.categories : [],
        collection: typeof each.collection === 'string' ? each.collection : 'brands',
        licenceSentence:
          typeof each.licenceSentence === 'string'
            ? each.licenceSentence
            : licenceSentenceOf(each.license),
      }))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** The list with `row` first and no repeat, at most twelve; written back when a storage exists. */
export function pushRecent(
  recent: readonly LogoSearchRow[],
  row: LogoSearchRow,
  storage: Storage | null = storageOf(),
): LogoSearchRow[] {
  const next = [recentRowOf(row), ...recent.filter((each) => each.slug !== row.slug)].slice(
    0,
    RECENT_MAX,
  );
  if (storage !== null) {
    try {
      storage.setItem(RECENT_STORAGE, JSON.stringify(next));
    } catch {
      // private mode: the row holds for the session
    }
  }
  return next;
}

function storageOf(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The kit's grounds and the words of the foot

/** The two grounds and the two text colours of a tile, from the kit's Background and Text roles. */
export type Grounds = {
  paper: string;
  ink: string;
  paperText: string;
  inkText: string;
};

/** The grounds a kit gives the tiles: its light and dark Background and Text, the theme's when silent. */
export function kitGrounds(kit: BrandKit | undefined): Grounds {
  return {
    paper: kitBackgroundColour(kit, 'light'),
    ink: kitBackgroundColour(kit, 'dark'),
    paperText: kitTextColour(kit, 'light'),
    inkText: kitTextColour(kit, 'dark'),
  };
}

/** True when the query names the kit (the empty state's second sentence, judge-seller addition 5). */
export function namesKit(query: string, names: readonly (string | undefined)[]): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') return false;
  return names.some((name) => name !== undefined && name.trim().toLocaleLowerCase() === q);
}

/** The licence row's words (4.6): "<Title>: <sentence>, " and the link's text. */
export function licenceRowWords(row: LogoSearchRow): {
  lead: string;
  link: string;
  href: string;
} {
  return {
    lead: `${row.title}: ${row.licenceSentence ?? licenceSentenceOf(row.license)}, `,
    link: row.guidelines !== undefined ? LOGO_DIALOG.guidelines : LOGO_DIALOG.site,
    href: licenceLinkOf(row),
  };
}

// ---------------------------------------------------------------------------------------------
// The tiles

/** What a tile stands for: a mark of thesvg.org, an asset the deck holds, or the default kit's logo. */
export type LogoPick =
  | { kind: 'thesvg'; row: LogoSearchRow; recent?: boolean }
  | { kind: 'asset'; asset: Asset; title: string }
  | { kind: 'kit'; kit: DefaultKit };

/** The tile's id in the shape of 4.3: the slug for a mark, `asset.<id>` for a deck asset, `kit` for the default logo. */
export function pickId(pick: LogoPick): string {
  if (pick.kind === 'thesvg') return pick.row.slug;
  if (pick.kind === 'asset') return `asset.${pick.asset.id}`;
  return 'kit';
}

export type Ground = 'paper' | 'ink';
const APPEARANCE_OF: Readonly<Record<Ground, KitAppearance>> = { paper: 'light', ink: 'dark' };

/** The results, twenty more per scroll to the end, capped by the action's limit (4.11). */
export const PAGE = LOGO_SEARCH_DEFAULT_LIMIT;
export const LIMIT_MAX = LOGO_SEARCH_MAX_LIMIT;
/** The pause after the last key before the search runs; the results then draw within the row's 300 ms (7.1). */
export const SEARCH_PAUSE_MS = 200;

function twinOf(asset: Asset, appearance: KitAppearance): string {
  return 'neutral' in asset.twins ? asset.twins.neutral : asset.twins[appearance];
}

function HalfOfMark({
  row,
  ground,
  grounds,
  control,
}: {
  row: LogoRow;
  ground: Ground;
  grounds: Grounds;
  control: string;
}) {
  const appearance = APPEARANCE_OF[ground];
  const choice = chooseVariant(row, appearance);
  const background = ground === 'paper' ? grounds.paper : grounds.ink;
  const color = ground === 'paper' ? grounds.paperText : grounds.inkText;
  return (
    <span
      className="ts-logo-half"
      data-control={`${control}.${ground}`}
      data-variant={choice === null ? 'none' : choice.variant}
      data-tinted={choice?.tint ? 'true' : undefined}
      data-plate={choice?.plateLine === undefined ? undefined : 'true'}
      style={{ background, color }}
    >
      {choice === null ? null : choice.plateLine !== undefined ? (
        <span className="ts-logo-plate">
          <img
            className="ts-logo-mark is-small"
            src={logoMarkPath(row.slug, choice.variant)}
            alt=""
            loading="lazy"
            draggable={false}
          />
          <span className="ts-logo-plate-line">{choice.plateLine}</span>
        </span>
      ) : choice.tint ? (
        <span
          className="ts-logo-mark is-tinted"
          role="img"
          aria-label={LOGO_WORDS.alt(row.title)}
          style={
            {
              '--ts-logo-mask': `url("${logoMarkPath(row.slug, choice.variant)}")`,
              '--ts-logo-tint': color,
            } as CSSProperties
          }
        />
      ) : (
        <img
          className="ts-logo-mark"
          src={logoMarkPath(row.slug, choice.variant)}
          alt=""
          loading="lazy"
          draggable={false}
        />
      )}
    </span>
  );
}

function HalfOfAsset({
  src,
  ground,
  grounds,
  control,
}: {
  src: string;
  ground: Ground;
  grounds: Grounds;
  control: string;
}) {
  return (
    <span
      className="ts-logo-half"
      data-control={`${control}.${ground}`}
      style={{ background: ground === 'paper' ? grounds.paper : grounds.ink }}
    >
      <img className="ts-logo-mark" src={src} alt="" loading="lazy" draggable={false} />
    </span>
  );
}

function HalfOfGlyph({
  ground,
  grounds,
  control,
}: {
  ground: Ground;
  grounds: Grounds;
  control: string;
}) {
  return (
    <span
      className="ts-logo-half"
      data-control={`${control}.${ground}`}
      style={{
        background: ground === 'paper' ? grounds.paper : grounds.ink,
        color: ground === 'paper' ? grounds.paperText : grounds.inkText,
      }}
    >
      <svg className="ts-logo-glyph" viewBox="0 0 1213 771" aria-hidden="true">
        <use href="#gt-mark" />
      </svg>
    </span>
  );
}

/** The two halves of a mark, paper over ink, outside a tile (the Tailor dialog's Find button). */
export function LogoMarkPair({
  row,
  grounds,
  control,
}: {
  row: LogoRow;
  grounds: Grounds;
  control: string;
}) {
  return (
    <span className="ts-logo-pair" data-control={`${control}.pair`}>
      <HalfOfMark row={row} ground="paper" grounds={grounds} control={control} />
      <HalfOfMark row={row} ground="ink" grounds={grounds} control={control} />
    </span>
  );
}

/** One tile: the two halves and the title; the caller owns the selection and the click. */
export function LogoTile({
  pick,
  grounds,
  active,
  onPick,
  onPoint,
  id,
  assetUrl,
}: {
  pick: LogoPick;
  grounds: Grounds;
  active: boolean;
  onPick: (pick: LogoPick) => void;
  onPoint: (pick: LogoPick) => void;
  /** the DOM id, for `aria-activedescendant` */
  id: string;
  assetUrl: (path: string) => string;
}) {
  const control = `dialog.logo.tile.${pickId(pick)}`;
  const title =
    pick.kind === 'thesvg' ? pick.row.title : pick.kind === 'asset' ? pick.title : pick.kit.name;
  const doc =
    pick.kind === 'thesvg'
      ? LOGO_DIALOG.tileDoc(pick.row.title, pick.row.licenceSentence)
      : pick.kind === 'asset'
        ? LOGO_DIALOG.assetTileDoc
        : LOGO_DIALOG.kitTileDoc(pick.kit.name);
  const { onMouseEnter, ...tip } = tipProps({ name: title, doc });
  return (
    <button
      type="button"
      role="option"
      id={id}
      aria-selected={active}
      className={cn('ts-logo-tile', active && 'is-active')}
      data-control={control}
      data-slug={pick.kind === 'thesvg' ? pick.row.slug : undefined}
      tabIndex={-1}
      onClick={() => onPick(pick)}
      onMouseEnter={(event) => {
        onMouseEnter(event);
        onPoint(pick);
      }}
      {...tip}
    >
      {pick.kind === 'thesvg' ? (
        <>
          <HalfOfMark row={pick.row} ground="paper" grounds={grounds} control={control} />
          <HalfOfMark row={pick.row} ground="ink" grounds={grounds} control={control} />
        </>
      ) : pick.kind === 'asset' ? (
        <>
          <HalfOfAsset
            src={assetUrl(twinOf(pick.asset, 'light'))}
            ground="paper"
            grounds={grounds}
            control={control}
          />
          <HalfOfAsset
            src={assetUrl(twinOf(pick.asset, 'dark'))}
            ground="ink"
            grounds={grounds}
            control={control}
          />
        </>
      ) : pick.kit.logo !== undefined ? (
        <>
          <HalfOfAsset
            src={pick.kit.logo.light}
            ground="paper"
            grounds={grounds}
            control={control}
          />
          <HalfOfAsset src={pick.kit.logo.dark} ground="ink" grounds={grounds} control={control} />
        </>
      ) : (
        <>
          <HalfOfGlyph ground="paper" grounds={grounds} control={control} />
          <HalfOfGlyph ground="ink" grounds={grounds} control={control} />
        </>
      )}
      <span className="ts-logo-title">{title}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// The dialog

/**
 * The stage handle's picture routes (viewer Editor.tsx), as Image by URL reads them, and B6's
 * `insertLogoAsset` (build/b6.md R10): places a stored logo asset at the logo size and, with
 * `everySlide`, writes the kit's three slots in the same commit and says so with Undo.
 */
type PlacingEditor = {
  insertPictureFromUrl?: (
    url: string,
    where?: { blockId?: string; replace?: boolean },
  ) => Promise<void>;
  insertPictureAsset?: (
    asset: { id: string; size?: Asset['size'] | undefined },
    where?: { blockId?: string },
  ) => void | Promise<void>;
  insertLogoAsset?: (
    asset: { id: string; size?: Asset['size'] | undefined },
    where: { title: string; variant?: string; everySlide?: boolean; blockId?: string },
  ) => void | Promise<void>;
};

const WALK_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function LogoDialog({ target }: { target?: PictureTarget }) {
  const shell = useEditorShell();
  const { input, settings } = shell;
  const words = DIALOG_WORDS;
  const parked = (id: string) => isParked(id, settings);
  const where: PictureTarget = target ?? { kind: 'insert', slideId: input.slideId };
  const replacing = where.kind === 'block';

  const [query, setQuery] = useState('');
  const [includeCloud, setIncludeCloud] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [results, setResults] = useState<readonly LogoSearchRow[] | null>(null);
  const [answered, setAnswered] = useState('');
  const [searching, setSearching] = useState(false);
  const [facts, setFacts] = useState<LogoIndexFacts>({ updatedAt: null });
  const [failure, setFailure] = useState<string | null>(null);
  const [recent, setRecent] = useState<LogoSearchRow[]>(() => readRecent());
  const [everySlide, setEverySlide] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pause = useRef(0);
  const searchSeq = useRef(0);
  const brandGroup = useRef<HTMLDivElement>(null);
  const moreSentinel = useRef<HTMLDivElement>(null);

  const deck = input.document.deck;
  const kit = deck.brand;
  const appearance = deckAppearance(deck);
  const defaultKit = input.defaultKit;
  const editor = input.editor as PlacingEditor | undefined;
  const everySlideAvailable = editor?.insertLogoAsset !== undefined;
  const assetUrl = input.assetUrl ?? ((path: string) => `/decks/${input.deckId}/${path}`);
  const grounds = useMemo<Grounds>(() => kitGrounds(kit), [kit]);

  /* Your brand (4.3; audit-logos 15): the default kit's logo, the deck's kit logo when it is a
     picture, the deck's logo assets; one tile per asset */
  const brandPicks = useMemo<LogoPick[]>(() => {
    const picks: LogoPick[] = [];
    if (defaultKit !== undefined) picks.push({ kind: 'kit', kit: defaultKit });
    const seen = new Set<string>();
    const kitAsset =
      kit?.mark?.kind === 'picture' && kit.mark.assetId !== undefined
        ? deck.assets[kit.mark.assetId]
        : undefined;
    if (kitAsset !== undefined) {
      seen.add(kitAsset.id);
      picks.push({ kind: 'asset', asset: kitAsset, title: kit?.name ?? kitAsset.alt });
    }
    for (const asset of Object.values(deck.assets)) {
      if (asset.role !== 'logo' || seen.has(asset.id)) continue;
      seen.add(asset.id);
      picks.push({ kind: 'asset', asset, title: asset.alt });
    }
    return picks;
  }, [deck.assets, defaultKit, kit]);

  const recentPicks = useMemo<LogoPick[]>(
    () => recent.map((row) => ({ kind: 'thesvg', row, recent: true })),
    [recent],
  );
  const resultPicks = useMemo<LogoPick[]>(
    () => (results ?? []).map((row) => ({ kind: 'thesvg', row })),
    [results],
  );

  const showBrand = brandPicks.length > 0 && !parked(LOGO_GROUP_CONTROLS.brand);
  const showRecent = recentPicks.length > 0 && !parked(LOGO_GROUP_CONTROLS.recent);
  const showResults = query.trim() !== '' && !parked(LOGO_GROUP_CONTROLS.results);

  /* the flat order the arrows walk: brand, recent, results */
  const walk = useMemo<{ key: string; pick: LogoPick }[]>(() => {
    const out: { key: string; pick: LogoPick }[] = [];
    if (showBrand) for (const pick of brandPicks) out.push({ key: `brand:${pickId(pick)}`, pick });
    if (showRecent)
      for (const pick of recentPicks) out.push({ key: `recent:${pickId(pick)}`, pick });
    if (showResults)
      for (const pick of resultPicks) out.push({ key: `results:${pickId(pick)}`, pick });
    return out;
  }, [brandPicks, recentPicks, resultPicks, showBrand, showRecent, showResults]);

  /* the search: 200 ms after the last key, twenty rows, brands alone unless the switch is on */
  useEffect(() => {
    window.clearTimeout(pause.current);
    const q = query.trim();
    if (q === '') {
      setResults(null);
      setAnswered('');
      setSearching(false);
      setFailure(null);
      return undefined;
    }
    setSearching(true);
    pause.current = window.setTimeout(() => {
      const seq = (searchSeq.current += 1);
      searchLogos(q, { limit, collection: includeCloud ? 'all' : 'brands' })
        .then((answer) => {
          if (seq !== searchSeq.current) return;
          setResults(answer.logos);
          setAnswered(q);
          setFacts({
            updatedAt: answer.updatedAt,
            ...(answer.lastError === undefined ? {} : { lastError: answer.lastError }),
          });
          setFailure(null);
        })
        .catch((err: unknown) => {
          if (seq !== searchSeq.current) return;
          setResults([]);
          setAnswered(q);
          setFailure(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, SEARCH_PAUSE_MS);
    return () => window.clearTimeout(pause.current);
  }, [includeCloud, limit, query]);

  /* a new query starts at the first page */
  useEffect(() => {
    setLimit(PAGE);
  }, [query, includeCloud]);

  /* the first result is preselected (4.3) so Enter inserts it; a brand or recent tile is reached
     by the arrows or the pointer; a choice the walk no longer holds falls back to the first
     result, in the same render as the results, so a driver reads the tiles and the ring together */
  const active = useMemo(() => {
    if (selected !== null && walk.some((entry) => entry.key === selected)) return selected;
    const first = walk.find((entry) => entry.key.startsWith('results:'));
    return first === undefined ? null : first.key;
  }, [selected, walk]);

  /* more on scroll: the sentinel under the results asks for the next twenty */
  useEffect(() => {
    const el = moreSentinel.current;
    if (el === null || typeof IntersectionObserver === 'undefined') return undefined;
    if (results === null || results.length < limit || limit >= LIMIT_MAX) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting))
        setLimit((current) => Math.min(LIMIT_MAX, current + PAGE));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [limit, results]);

  const kitNamed =
    results !== null &&
    results.length === 0 &&
    answered === query.trim() &&
    namesKit(query, [defaultKit?.name, kit?.name]);

  /* the empty state that names the kit scrolls Your brand into view (judge-seller addition 5) */
  useEffect(() => {
    if (!kitNamed) return;
    const el = brandGroup.current;
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' });
  }, [kitNamed]);

  const selectedEntry = walk.find((entry) => entry.key === active);

  const insert = (pick: LogoPick) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const run = async (): Promise<void> => {
      if (pick.kind === 'thesvg') {
        const choice = chooseVariant(pick.row, appearance);
        const answer = await insertLogo(
          {
            slug: pick.row.slug,
            ...(choice === null ? {} : { variant: choice.variant }),
            slideId: where.slideId,
            ...(where.kind === 'block' ? { blockId: where.blockId } : {}),
            ...(everySlide && everySlideAvailable ? { everySlide: true } : {}),
            baseRevision: input.revision,
          },
          { dispatch: input.dispatch, deckId: input.deckId },
        );
        /* written now, not in a state updater: the dialog closes after the insert and an
           updater queued on an unmounting component never runs (the store write is inside) */
        setRecent(pushRecent(recent, pick.row));
        if (editor?.insertLogoAsset !== undefined) {
          await editor.insertLogoAsset(answer.asset, {
            title: pick.row.title,
            ...(choice === null ? {} : { variant: choice.variant }),
            ...(everySlide ? { everySlide: true } : {}),
            ...(where.kind === 'block' ? { blockId: where.blockId } : {}),
          });
        } else if (typeof answer.blockId === 'string') {
          input.onSelectBlock?.(answer.blockId);
        } else if (editor?.insertPictureAsset !== undefined) {
          await editor.insertPictureAsset(
            answer.asset,
            where.kind === 'block' ? { blockId: where.blockId } : {},
          );
        }
        return;
      }
      if (pick.kind === 'asset') {
        const asset = { id: pick.asset.id, size: pick.asset.size };
        if (editor?.insertPictureAsset !== undefined) {
          await editor.insertPictureAsset(
            asset,
            where.kind === 'block' ? { blockId: where.blockId } : {},
          );
          return;
        }
        if (where.kind === 'block') {
          await input.dispatch('block.set', {
            slideId: where.slideId,
            blockId: where.blockId,
            path: where.path,
            value: asset.id,
            baseRevision: input.revision,
          });
          return;
        }
        throw new Error(words.noEditor);
      }
      if (pick.kit.logo !== undefined) {
        if (editor?.insertPictureFromUrl === undefined) throw new Error(words.noEditor);
        await editor.insertPictureFromUrl(
          pick.kit.logo[appearance],
          where.kind === 'block' ? { blockId: where.blockId } : {},
        );
        return;
      }
      if (where.kind === 'block') throw new Error(words.noMarkReplace);
      const plan = insertBlockPlan(
        factsOf(input, shell.lastLayout),
        'mark',
        (id) => CATALOG.mark.make(id),
        words.title,
        { size: [132, 84] },
      );
      if ('refused' in plan) throw new Error(plan.refused);
      await input.dispatch(plan.action, plan.input);
    };
    run()
      .then(() => shell.closeDialog())
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const upload = () => {
    if (input.uploadPicture === undefined) {
      setError(words.noEditor);
      return;
    }
    input.uploadPicture(where);
    shell.closeDialog();
  };

  const move = (delta: number) => {
    if (walk.length === 0) return;
    const at = Math.max(
      0,
      walk.findIndex((entry) => entry.key === active),
    );
    const next = Math.min(walk.length - 1, Math.max(0, at + delta));
    const entry = walk[next];
    if (entry === undefined) return;
    setSelected(entry.key);
    const el = document.getElementById(tileDomId(entry.key));
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' });
  };

  const onFieldKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!WALK_KEYS.has(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'ArrowLeft') move(-1);
    else if (event.key === 'ArrowDown') move(5);
    else if (event.key === 'ArrowUp') move(-5);
    else if (event.key === 'Home') move(-walk.length);
    else if (event.key === 'End') move(walk.length);
  };

  const searchTip = tipProps({ name: words.search, doc: words.searchDoc, key: 'Enter' });
  const selectedRow =
    selectedEntry !== undefined && selectedEntry.pick.kind === 'thesvg'
      ? selectedEntry.pick.row
      : undefined;
  const licence = selectedRow === undefined ? undefined : licenceRowWords(selectedRow);
  /* the source sentence of logo-model.ts, with the site linked to its legal page */
  const source = LOGO_WORDS.source(facts);
  const sourceAt = source.indexOf('thesvg.org');

  const group = (
    id: keyof typeof LOGO_GROUP_CONTROLS,
    picks: LogoPick[],
    ref?: RefObject<HTMLDivElement | null>,
  ) => (
    <div
      ref={ref}
      className="ts-logo-group"
      role="group"
      aria-label={words.groups[id]}
      data-control={LOGO_GROUP_CONTROLS[id]}
      data-rows={picks.length}
    >
      <h4 className="ts-picker-title">{words.groups[id]}</h4>
      <div className="ts-logo-grid" role="listbox" aria-label={words.groups[id]}>
        {picks.map((pick) => {
          const key = `${id}:${pickId(pick)}`;
          return (
            <LogoTile
              key={key}
              id={tileDomId(key)}
              pick={pick}
              grounds={grounds}
              active={active === key}
              onPick={insert}
              onPoint={() => setSelected(key)}
              assetUrl={assetUrl}
            />
          );
        })}
      </div>
    </div>
  );

  const emptyState =
    showResults &&
    results !== null &&
    results.length === 0 &&
    !searching &&
    answered === query.trim();

  return (
    <Dialog
      title={words.title}
      lead={words.lead}
      onClose={shell.closeDialog}
      width={640}
      control="dialog.logo"
      className="ts-logo-dialog"
      actions={[
        {
          label: replacing ? words.replace : words.insert,
          primary: true,
          disabled: selectedEntry === undefined || busy,
          onClick: () => {
            if (selectedEntry !== undefined) insert(selectedEntry.pick);
          },
          control: 'dialog.logo.insert',
          doc: replacing ? words.replaceDoc : words.insertDoc,
        },
      ]}
    >
      <div className="ts-logo">
        <input
          className="ts-logo-search"
          type="search"
          value={query}
          autoFocus
          placeholder={words.search}
          aria-label={words.search}
          aria-activedescendant={active === null ? undefined : tileDomId(active)}
          data-control="dialog.logo.search"
          autoComplete="off"
          spellCheck={false}
          {...searchTip}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            searchTip.onKeyDown(event);
            onFieldKey(event);
          }}
        />
        <div
          className="ts-logo-groups pt-scroll"
          data-control="dialog.logo.groups"
          data-query={answered}
          data-searching={searching ? 'true' : undefined}
        >
          {showBrand ? group('brand', brandPicks, brandGroup) : null}
          {showRecent ? group('recent', recentPicks) : null}
          {showResults ? (
            <>
              {results !== null && results.length > 0 ? group('results', resultPicks) : null}
              {searching && (results === null || results.length === 0) ? (
                <p className="ts-logo-status" data-control="dialog.logo.searching">
                  {words.searching}
                </p>
              ) : null}
              {emptyState ? (
                <div className="ts-logo-empty" data-control="dialog.logo.empty" role="status">
                  <p className="ts-logo-status">{failure ?? words.empty(query.trim())}</p>
                  {kitNamed ? <p className="ts-logo-status">{words.kitHint}</p> : null}
                  {parked('dialog.logo.upload') ? null : (
                    <button
                      type="button"
                      className="pt-ib is-text ts-dialog-btn"
                      data-control="dialog.logo.upload"
                      onClick={upload}
                      {...tipProps({ name: words.upload, doc: words.uploadDoc })}
                    >
                      <span className="pt-lb">{words.upload}</span>
                    </button>
                  )}
                </div>
              ) : null}
              <div ref={moreSentinel} className="ts-logo-more" aria-hidden="true" />
            </>
          ) : null}
        </div>
        <div className="ts-logo-foot">
          {parked('dialog.logo.everySlide') ? null : (
            <>
              <DialogCheck
                label={words.everySlide}
                checked={everySlide}
                onChange={setEverySlide}
                control="dialog.logo.everySlide"
                doc={everySlideAvailable ? words.everySlideDoc : words.everySlideWaits}
                disabled={!everySlideAvailable}
              />
              <p className="ts-logo-check-line" data-control="dialog.logo.everySlide.line">
                {words.everySlideDoc}
              </p>
            </>
          )}
          {selectedRow !== undefined && licence !== undefined && !parked('dialog.logo.licence') ? (
            <p
              className="ts-logo-licence"
              data-control="dialog.logo.licence"
              data-license={selectedRow.license}
              {...tipProps({ name: licenceTooltipOf(selectedRow.license) })}
            >
              {licence.lead}
              <a
                href={licence.href}
                target="_blank"
                rel="noreferrer"
                data-control="dialog.logo.licence.link"
              >
                {licence.link}
              </a>
            </p>
          ) : null}
          {parked('dialog.logo.source') ? null : (
            <p className="ts-logo-source" data-control="dialog.logo.source">
              {sourceAt < 0 ? (
                source
              ) : (
                <>
                  {source.slice(0, sourceAt)}
                  <a href={words.legal} target="_blank" rel="noreferrer">
                    thesvg.org
                  </a>
                  {source.slice(sourceAt + 'thesvg.org'.length)}
                </>
              )}
            </p>
          )}
          {parked('dialog.logo.includeCloud') ? null : (
            <details>
              <summary>{words.more}</summary>
              <div>
                <DialogCheck
                  label={words.includeCloud}
                  checked={includeCloud}
                  onChange={setIncludeCloud}
                  control="dialog.logo.includeCloud"
                  doc={words.includeCloudDoc}
                />
              </div>
            </details>
          )}
          {error !== null ? (
            <p className="ts-dialog-error" role="alert" data-control="dialog.logo.error">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** The DOM id of a tile, for `aria-activedescendant` and the scroll into view. */
function tileDomId(key: string): string {
  return `ts-logo-tile-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}
