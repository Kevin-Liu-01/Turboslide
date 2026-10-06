import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  BrandKit,
  CounterFormat,
  KitColor,
  LogoKind,
  SlotPosition,
  StoredThemeId,
  ThemeId,
} from '@turboslide/schema/brand';
import {
  COUNTER_FORMATS,
  KIT_COLORS,
  KIT_COLOR_TOKENS,
  KIT_COLOR_WORDS,
  MARK_POSITION_FLOW,
  MARK_POSITION_FLOW_LABEL,
  SLOT_POSITIONS,
  SLOT_POSITION_LABELS,
  brandWriteLabel,
  brandWriteMutation,
  frameOf,
  themeFactsOf,
  themeIdOf,
} from '@turboslide/schema/brand';
import type { HexColor } from '@turboslide/schema/color';
import { isHexColor } from '@turboslide/schema/color';
import type { Appearance, Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import {
  deckAppearance,
  deckCounter,
  deckCounterFormat,
  slideOrder,
} from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import type { Mutation } from '@turboslide/schema/mutations';
import { renderSlide } from '@turboslide/render/slide';
import { THEME_CSS_STYLE_ID, themeCss } from '@turboslide/render/theme-css';
import { layoutEntry } from '@turboslide/schema/layouts';
import type { ThemeRecord } from '@turboslide/theme/themes';
import { THEME_RECORDS, themeName, themeRecord } from '@turboslide/theme/themes';
import type { TokenName } from '@turboslide/theme/tokens';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import { useEditorShell } from './editor-shell-context';
import { FontDropdown } from './FontPicker';
import type { SlideRenderer } from './LayoutGrid';
import { cn } from './lib/cn';
import { PANELS, SNACKBARS } from './menus/strings';
import { Panel } from './Panel';
import { tipProps } from './Tooltip';

import './ThemesPanel.css';

/**
 * The Brand kit panel (docs/archive/rounds/PRODUCT.md 4.1, 4.4; formerly the Themes panel of gslides-parity SPEC
 * 5.7): the record on the deck edited in one place with live preview. Appearance (the two GT
 * tiles as before, `themes.gt.*`), Logo (the slot preview, Replace, Remove, Use the default logo,
 * a Position select for the title slide's logo and one for the footer's), Colors (the six roles,
 * Text, Background, Captions, Hints, Primary, Accent, each a swatch and a hex field in the chosen
 * appearance; typing previews on the sheet through a transient stylesheet, Enter or blur
 * commits, Escape reverts), Fonts (Display and Text, each the Font dropdown), Footer (the logo
 * kind and the text), Slide numbers (Show, Format, Skip title slides), Frame (Rails, Rules,
 * Crosses with one sentence each), Words that never translate, and Reset to the deployment's
 * kit at the foot. Every control's write is one commit through the editor's `commit(mutations,
 * label)`, so the sheet, the filmstrip clones and every collaborator re render at once, Cmd+Z
 * takes one field back and Version history lists it as its own row ("Brand kit: Primary"); the
 * kit's slots draw from the record and take no drag this round (question 8). The renderer
 * arrives as a prop (the chrome package does not depend on @turboslide/render for the tiles).
 *
 * Ids (PRODUCT.md 7.1): `panel.brand`, `panel.brand.logo.*`, `panel.brand.color.<role>.swatch`
 * and `.hex`, `panel.brand.color.appearance.*`, `panel.brand.font.*`, `panel.brand.footer.*`,
 * `panel.brand.counter.*`, `panel.brand.frame.*`, `panel.brand.lexicon`, `panel.brand.reset`.
 * The Appearance section keeps `panel.themes` on its wrapper for the rows written against it.
 */
export type ThemesPanelProps = {
  document: DeckDocument;
  render?: SlideRenderer;
  /** one write with a history entry; absent makes the panel read only */
  commit?: (mutations: Mutation[], label: string) => Promise<unknown>;
  onNotice?: (message: string) => void;
  onClose: () => void;
};

/** The hex a role shows: the kit's value in the appearance, else the deck theme's token value. */
function roleHex(
  kit: BrandKit | undefined,
  appearance: Appearance,
  role: KitColor,
  theme: StoredThemeId,
): string {
  const own = kit?.colors?.[appearance]?.[role];
  if (own !== undefined) return own;
  const token = KIT_COLOR_TOKENS[role] as TokenName;
  const value = themeRecord(theme).tokens[appearance][token];
  return typeof value === 'string' && value.startsWith('#') ? value : '#000000';
}

/** The transient stylesheet of a colour being typed: the kit with the typed value, on one style element. */
function previewKit(
  kit: BrandKit | undefined,
  appearance: Appearance,
  role: KitColor,
  hex: HexColor | null,
  theme: StoredThemeId,
): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(THEME_CSS_STYLE_ID) as HTMLStyleElement | null;
  if (hex === null) {
    style?.remove();
    return;
  }
  if (style === null) {
    style = document.createElement('style');
    style.id = THEME_CSS_STYLE_ID;
    document.body.appendChild(style);
  }
  const next: BrandKit = {
    ...(kit ?? {}),
    colors: {
      ...(kit?.colors ?? {}),
      [appearance]: { ...(kit?.colors?.[appearance] ?? {}), [role]: hex },
    },
  };
  style.textContent = themeCss({ brand: next, theme });
}

function clearPreview(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(THEME_CSS_STYLE_ID)?.remove();
}

/** A hex field that previews while typing, commits on Enter or blur and reverts on Escape. */
function HexField({
  role,
  value,
  onPreview,
  onCommit,
  control,
  disabled,
}: {
  role: KitColor;
  value: string;
  onPreview: (hex: HexColor | null) => void;
  onCommit: (hex: HexColor) => void;
  control: string;
  disabled: boolean;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const words = PANELS.brand;
  const shown = typing ?? value;
  const normalize = (raw: string): HexColor | null => {
    const trimmed = raw.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    return isHexColor(withHash) ? (withHash.toLowerCase() as HexColor) : null;
  };
  const finish = () => {
    if (typing === null) return;
    const hex = normalize(typing);
    setTyping(null);
    onPreview(null);
    if (hex !== null && hex !== value.toLowerCase()) onCommit(hex);
  };
  const tip = tipProps({
    name: `${KIT_COLOR_WORDS[role].name} hex`,
    doc: words.hexDoc,
    key: 'Enter',
  });
  return (
    <input
      type="text"
      className="ts-brand-hex"
      value={shown}
      disabled={disabled}
      aria-label={`${KIT_COLOR_WORDS[role].name} hex`}
      data-control={control}
      spellCheck={false}
      autoComplete="off"
      {...tip}
      onChange={(event) => {
        setTyping(event.target.value);
        onPreview(normalize(event.target.value));
      }}
      onKeyDown={(event) => {
        tip.onKeyDown(event);
        if (event.key === 'Enter') {
          event.preventDefault();
          finish();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setTyping(null);
          onPreview(null);
        }
      }}
      onBlur={(event) => {
        tip.onBlur(event);
        finish();
      }}
    />
  );
}

/**
 * The two slides a theme tile draws (docs/DESIGN.md 7.6): the deck's first title slide and its
 * first body slide; a deck without one of them draws the layout's empty placeholders there.
 */
export function tileSlides(document: DeckDocument): Slide[] {
  const order = slideOrder(document.deck)
    .map((id) => document.slides[id])
    .filter((slide): slide is Slide => slide !== undefined);
  const title =
    order.find((slide) => slide.kind === 'title' || slide.template === 'title') ??
    layoutEntry('title').make('ts-theme-title', document.deck, 'deck');
  const body =
    order.find((slide) => slide.kind === 'content' && slide !== title) ??
    layoutEntry('one-column').make('ts-theme-body', document.deck, 'deck');
  return [title, body].filter((slide): slide is Slide => slide !== null && slide !== undefined);
}

/** One slide drawn in a theme for a tile: the renderer's markup with the theme's rules and the prompts. */
function tileHtml(
  deck: Deck,
  slide: Slide,
  appearance: Appearance,
  theme: ThemeId,
  assetUrl: (path: string) => string,
  slides: Slide[],
): string | null {
  try {
    return renderSlide({ ...deck, theme }, slide, {
      theme: appearance,
      chrome: false,
      assetBase: '',
      assetSrc: (_id, _theme, path) => assetUrl(path),
      blockAttrs: false,
      gtWord: true,
      prompts: true,
      deckSlides: slides,
    }).html;
  } catch {
    return null;
  }
}

/** A pair of live clones at 140 by 79 each, the theme's two slides; a plate until it renders. */
function TilePair({ html, appearance }: { html: (string | null)[] | null; appearance: Appearance }) {
  return (
    <span className="ts-theme-pair" aria-hidden="true">
      {[0, 1].map((index) => (
        <span key={index} className="ts-theme-clone" data-theme={appearance}>
          {html?.[index] ? (
            <LiveClone html={html[index] ?? ''} theme={appearance} frame />
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** A short line of what the kit sets: "3 colors, logo, fonts", or null for an empty kit. */
export function kitSummary(kit: BrandKit | undefined): string | null {
  if (kit === undefined) return null;
  const parts: string[] = [];
  const roles = new Set<string>();
  for (const appearance of ['light', 'dark'] as const)
    for (const role of Object.keys(kit.colors?.[appearance] ?? {})) roles.add(role);
  if (roles.size > 0) parts.push(`${roles.size} color${roles.size === 1 ? '' : 's'}`);
  if (kit.mark !== undefined || kit.footer?.logo !== undefined) parts.push('logo');
  if (kit.fonts !== undefined) parts.push('fonts');
  if (kit.footer?.text !== undefined) parts.push('footer text');
  if (kit.counter !== undefined) parts.push('slide numbers');
  if (kit.frame !== undefined) parts.push('frame');
  if ((kit.lexicon ?? []).length > 0) parts.push('words');
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * The theme library (docs/DESIGN.md 7.6 item 3): one tile per theme in the schema's order, each two
 * live clones of the deck's own slides in that theme and the current appearance with the name
 * under them; the current theme's tile draws the 2 px ink border. The tiles are one radio group:
 * the arrow keys and Home and End move the focus, Enter and Space apply, and a click applies; each
 * tile carries the tooltip with the theme's name and one sentence. A tile renders when it comes
 * into the panel's view.
 */
function ThemeLibrary({
  document,
  appearance,
  current,
  assetUrl,
  onPick,
}: {
  document: DeckDocument;
  appearance: Appearance;
  current: ThemeId;
  assetUrl: (path: string) => string;
  onPick: (theme: ThemeRecord) => void;
}) {
  const words = PANELS.themes;
  const root = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<ThemeId>(current);
  const [seen, setSeen] = useState<ReadonlySet<ThemeId>>(() =>
    typeof IntersectionObserver === 'undefined'
      ? new Set(THEME_RECORDS.map((theme) => theme.id))
      : new Set([current]),
  );
  useEffect(() => {
    const el = root.current;
    if (el === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => (entry.target as HTMLElement).dataset.themeId as ThemeId);
        if (visible.length > 0)
          setSeen((held) => {
            if (visible.every((id) => held.has(id))) return held;
            return new Set([...held, ...visible]);
          });
      },
      { root: el.closest('.pt-panel-body') ?? null, rootMargin: '120px 0px' },
    );
    for (const tile of el.querySelectorAll('[data-theme-id]')) observer.observe(tile);
    return () => observer.disconnect();
  }, []);
  const slides = useMemo(() => tileSlides(document), [document]);
  const html = useMemo(() => {
    const out = new Map<ThemeId, (string | null)[]>();
    for (const theme of THEME_RECORDS)
      if (seen.has(theme.id))
        out.set(
          theme.id,
          slides.map((slide) =>
            tileHtml(document.deck, slide, appearance, theme.id, assetUrl, slides),
          ),
        );
    return out;
  }, [document.deck, slides, appearance, assetUrl, seen]);
  const move = (from: ThemeId, step: number | 'first' | 'last') => {
    const ids = THEME_RECORDS.map((theme) => theme.id);
    const at = ids.indexOf(from);
    const next =
      step === 'first'
        ? 0
        : step === 'last'
          ? ids.length - 1
          : (at + step + ids.length) % ids.length;
    const id = ids[next] ?? from;
    setFocusId(id);
    root.current?.querySelector<HTMLElement>(`[data-theme-id="${id}"]`)?.focus();
  };
  return (
    <div
      ref={root}
      className="ts-theme-library"
      role="radiogroup"
      aria-label={words.title}
      data-control="panel.theme.library"
    >
      {THEME_RECORDS.map((theme) => {
        const on = theme.id === current;
        const tip = tipProps({ name: theme.name, doc: on ? words.current : words.tip(theme.name) });
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={theme.id === focusId ? 0 : -1}
            className={cn('ts-theme-tile', on && 'is-current')}
            data-control={`panel.theme.${theme.id}`}
            data-theme-id={theme.id}
            {...tip}
            onClick={() => onPick(theme)}
            onFocus={(event) => {
              setFocusId(theme.id);
              tip.onFocus(event);
            }}
            onKeyDown={(event) => {
              tip.onKeyDown(event);
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(theme.id, 1);
              else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(theme.id, -1);
              else if (event.key === 'Home') move(theme.id, 'first');
              else if (event.key === 'End') move(theme.id, 'last');
              else return;
              event.preventDefault();
            }}
          >
            <TilePair html={html.get(theme.id) ?? null} appearance={appearance} />
            <span className="ts-theme-name">{theme.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ThemesPanel({ document, render, commit, onNotice, onClose }: ThemesPanelProps) {
  const shell = useEditorShell();
  const { input } = shell;
  const { deck } = document;
  const kit = deck.brand;
  const words = PANELS.brand;
  const current = deckAppearance(deck);
  /* the frame the sheet draws: the kit's toggles over the deck theme's parts (docs/DESIGN.md 7.5) */
  const drawnFrame = frameOf(deck.theme, kit);
  /* the deck's theme, its id and its name (docs/DESIGN.md 7.2) */
  const themeId = themeIdOf(deck.theme);
  const themeTitle = themeName(themeId);
  const [colorAppearance, setColorAppearance] = useState<Appearance>(current);
  /* the Colors tab follows the appearance the seller picks (docs/archive/rounds/POLISH.md item 49; audit-media
     item 20: the Dark tile left the tab on Light): the tab resets when the deck's appearance
     changes, and the seller can still switch it to edit the other appearance's colours */
  const [seenAppearance, setSeenAppearance] = useState<Appearance>(current);
  if (seenAppearance !== current) {
    setSeenAppearance(current);
    setColorAppearance(current);
  }
  /* the hex being typed per role, so the swatch follows the field before Enter (item 49) */
  const [typedHex, setTypedHex] = useState<Partial<Record<KitColor, HexColor>>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  void render;
  /* the asset URL rule the tiles and the logo preview draw pictures with */
  const assetUrl = useMemo(
    () => input.assetUrl ?? ((path: string) => path),
    [input.assetUrl],
  );
  /* the deck's own tile: its theme on its two slides (docs/DESIGN.md 7.6 item 2) */
  const ownSlides = useMemo(() => tileSlides(document), [document]);
  const ownHtml = useMemo(
    () =>
      ownSlides.map((slide) => tileHtml(deck, slide, current, themeId, assetUrl, ownSlides)),
    [deck, ownSlides, current, themeId, assetUrl],
  );
  const kitParts = kitSummary(kit);
  const kitStart = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearPreview(), []);

  const fail = (error: unknown) =>
    onNotice?.(error instanceof Error ? error.message : String(error));
  const undoAction = () => {
    const undo = input.history?.undo;
    return undo === undefined ? undefined : { label: SNACKBARS.undo, run: () => undo() };
  };

  /** One kit write, one history entry: the pointer's mutation at the shallowest missing ancestor. */
  const writeKit = (
    pointer: string,
    value: unknown,
    label = brandWriteLabel(pointer),
  ): Promise<unknown> => {
    if (commit === undefined) {
      onNotice?.(words.noKitYet);
      return Promise.resolve();
    }
    return commit([brandWriteMutation(deck, pointer, value) as Mutation], label).catch(fail);
  };
  /** Several kit writes as one entry, each read against the deck as the one before leaves it. */
  const writeKitAll = (writes: [string, unknown][], label: string): Promise<unknown> => {
    if (commit === undefined) {
      onNotice?.(words.noKitYet);
      return Promise.resolve();
    }
    let host: { brand?: BrandKit } = { ...(kit === undefined ? {} : { brand: kit }) };
    const mutations: Mutation[] = [];
    for (const [pointer, value] of writes) {
      const mutation = brandWriteMutation(host, pointer, value);
      mutations.push(mutation as Mutation);
      // the record as this write leaves it, so the next pointer lands at the right ancestor
      const segments = pointer.split('/').slice(1);
      const next: Record<string, unknown> = { ...(host.brand ?? {}) };
      let cursor: Record<string, unknown> = next;
      for (let i = 0; i < segments.length - 1; i += 1) {
        const key = segments[i] ?? '';
        const child = cursor[key];
        const copy: Record<string, unknown> =
          child !== null && typeof child === 'object'
            ? { ...(child as Record<string, unknown>) }
            : {};
        cursor[key] = copy;
        cursor = copy;
      }
      const last = segments[segments.length - 1] ?? '';
      if (value === undefined) delete cursor[last];
      else cursor[last] = value;
      host = { brand: next as BrandKit };
    }
    return commit(mutations, label).catch(fail);
  };

  const pickAppearance = (appearance: Appearance) => {
    if (appearance === current) return;
    if (commit === undefined) {
      onNotice?.('The appearance cannot be changed here yet');
      return;
    }
    commit(
      [{ op: 'deck.set', path: '/defaults/appearance', value: appearance }],
      appearance === 'dark' ? 'Dark theme' : 'Light theme',
    ).catch(fail);
  };

  /* one pick, one commit: `deck.set /theme` with the history label "Theme: <name>", so Cmd or
     Ctrl+Z takes it back in one step and Version history lists it (docs/DESIGN.md 7.6 item 3) */
  const pickTheme = (theme: ThemeRecord) => {
    if (theme.id === themeId) return;
    if (commit === undefined) {
      onNotice?.(words.noKitYet);
      return;
    }
    commit(
      [{ op: 'deck.set', path: '/theme', value: theme.id }],
      PANELS.themes.label(theme.name),
    ).catch(fail);
  };

  /* Appearance as a segmented control, Light and Dark; the ids of the two tiles before it stay */
  const tile = (appearance: Appearance) => {
    const label = appearance === 'light' ? PANELS.themes.light : PANELS.themes.dark;
    const on = current === appearance;
    return (
      <span
        key={appearance}
        className="ts-themes-slot"
        data-control={`panel.brand.appearance.${appearance}`}
      >
        <button
          type="button"
          className={cn('pt-ib ts-fo-button is-small', on && 'is-on')}
          role="radio"
          aria-checked={on}
          data-control={`themes.gt.${appearance}`}
          data-appearance={appearance}
          onClick={() => pickAppearance(appearance)}
          {...tipProps({
            name: label,
            doc: on
              ? 'The presentation uses this appearance'
              : `Switches the presentation to ${label.toLowerCase()}`,
          })}
        >
          <span className="pt-lb">{label}</span>
        </button>
      </span>
    );
  };

  /* the logo slot: the title slide's mark and the footer's logo together */
  /* the theme's logo is General Translation's alone (docs/DESIGN.md 7.5): a slot that names the
     default logo, or a silent kit, draws nothing in any other theme */
  const themeHasLogo = themeFactsOf(deck.theme).logo;
  const storedMark: LogoKind = kit?.mark?.kind ?? 'default';
  const markKind: LogoKind = storedMark === 'default' && !themeHasLogo ? 'none' : storedMark;
  const logoAsset = kit?.mark?.assetId !== undefined ? deck.assets[kit.mark.assetId] : undefined;
  const logoSrc =
    logoAsset === undefined
      ? undefined
      : (input.assetUrl ?? ((path: string) => path))(
          'neutral' in logoAsset.twins ? logoAsset.twins.neutral : logoAsset.twins[current],
        );
  const replaceLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('the file could not be read'));
        reader.readAsDataURL(file);
      });
      const taken = new Set(Object.keys(deck.assets));
      const base =
        file.name
          .replace(/\.[a-z0-9]+$/i, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'logo';
      let id = base;
      for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
      const asset = (await input.dispatch('asset.add', {
        id,
        file: dataUrl,
        role: 'logo',
        alt: `${file.name.replace(/\.[a-z0-9]+$/i, '')} logo`,
        baseRevision: input.revision,
      })) as { id: string };
      await writeKitAll(
        [
          ['/mark', { kind: 'picture', assetId: asset.id }],
          ['/footer/logo', 'picture'],
          ['/footer/assetId', asset.id],
        ],
        'Brand kit: Logo',
      );
      onNotice?.(words.logoEverySlide);
    } catch (error) {
      onNotice?.(words.uploadFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setUploading(false);
    }
  };
  const removeLogo = () =>
    writeKitAll(
      [
        ['/mark', { kind: 'none' }],
        ['/footer/logo', 'none'],
      ],
      'Brand kit: Logo',
    ).then(() => shell.say(words.logoRemoved, undoAction()));
  const defaultLogo = () =>
    writeKitAll(
      [
        ['/mark', { kind: 'default' }],
        ['/footer/logo', 'default'],
        ['/footer/assetId', undefined],
      ],
      'Brand kit: Logo',
    ).then(() => shell.say(words.logoDefault(themeTitle), undoAction()));

  /* the two Position selects name what is drawn (item 49): the title slide's mark sits above the
     heading while the record names no position, so its select reads "Above the title" then and
     the pick of that row removes the position; the footer's logo sits bottom left by default */
  const positionSelect = (
    pointer: '/positions/mark' | '/positions/footerLogo',
    control: string,
    label: string,
  ) => {
    const isMark = pointer === '/positions/mark';
    const value: string = isMark
      ? (kit?.positions?.mark ?? MARK_POSITION_FLOW)
      : (kit?.positions?.footerLogo ?? 'bottom-left');
    const options: { value: string; label: string }[] = [
      ...(isMark ? [{ value: MARK_POSITION_FLOW, label: MARK_POSITION_FLOW_LABEL }] : []),
      ...SLOT_POSITIONS.map((position) => ({
        value: position,
        label: SLOT_POSITION_LABELS[position],
      })),
    ];
    return (
      <label className="ts-brand-field">
        <span className="ts-brand-label">{label}</span>
        <select
          value={value}
          aria-label={`${words.position}, ${label.toLowerCase()}`}
          data-control={control}
          {...tipProps({
            name: `${words.position}, ${label.toLowerCase()}`,
            doc: isMark
              ? 'Above the title, one of the four corners of the slide, or hidden'
              : 'One of the four corners of the slide, or hidden',
          })}
          onChange={(event) => {
            const picked = event.target.value;
            void writeKit(
              pointer,
              picked === MARK_POSITION_FLOW ? undefined : (picked as SlotPosition),
            );
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const colorRow = (role: KitColor) => {
    const hex = roleHex(kit, colorAppearance, role, deck.theme);
    const own = kit?.colors?.[colorAppearance]?.[role] !== undefined;
    const meaning = KIT_COLOR_WORDS[role];
    const pointer = `/colors/${colorAppearance}/${role}`;
    const shown = typedHex[role] ?? hex;
    const preview = (typed: HexColor | null) => {
      setTypedHex((held) => {
        const next = { ...held };
        if (typed === null) delete next[role];
        else next[role] = typed;
        return next;
      });
      previewKit(kit, colorAppearance, role, typed, deck.theme);
    };
    return (
      <div key={role} className="ts-brand-color" data-role={role}>
        <label
          className={cn('ts-brand-swatch', own && 'is-own')}
          style={{ background: shown }}
          data-control={`panel.brand.color.${role}.swatch`}
          {...tipProps({ name: meaning.name, doc: `${meaning.line}. ${shown}` })}
        >
          <input
            type="color"
            value={hex}
            aria-label={meaning.name}
            disabled={commit === undefined}
            onInput={(event) =>
              previewKit(
                kit,
                colorAppearance,
                role,
                (event.target as HTMLInputElement).value as HexColor,
                deck.theme,
              )
            }
            onChange={(event) => {
              const next = event.target.value.toLowerCase() as HexColor;
              clearPreview();
              if (next !== hex.toLowerCase()) void writeKit(pointer, next);
            }}
          />
        </label>
        <span className="ts-brand-role">{meaning.name}</span>
        <HexField
          role={role}
          value={hex}
          control={`panel.brand.color.${role}.hex`}
          disabled={commit === undefined}
          onPreview={preview}
          onCommit={(next) => void writeKit(pointer, next)}
        />
      </div>
    );
  };

  const check = (
    label: string,
    checked: boolean,
    control: string,
    onChange: (next: boolean) => void,
    doc: string,
  ) => (
    <label className="ts-brand-check" {...tipProps({ name: label, doc })}>
      <input
        type="checkbox"
        checked={checked}
        data-control={control}
        disabled={commit === undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );

  /* the footer's default logo is the theme's: none in a theme without one (docs/DESIGN.md 7.5) */
  const storedFooter: LogoKind = kit?.footer?.logo ?? 'default';
  const footerLogo: LogoKind = storedFooter === 'default' && !themeHasLogo ? 'none' : storedFooter;
  const footerAsset = kit?.footer?.assetId ?? kit?.mark?.assetId;
  /* the counter the sheet draws: the kit's, the Slide numbers dialog's, else the theme's (docs/DESIGN.md 7.5) */
  const format: CounterFormat = deckCounterFormat(deck);
  const counterMode = deckCounter(deck);
  const counterShow = counterMode !== 'off';
  const counterSkip = kit?.counter?.skipTitle ?? counterMode === 'skip-title';
  const [footerText, setFooterText] = useState<string | null>(null);
  const [lexicon, setLexicon] = useState<string | null>(null);
  const shownFooterText = footerText ?? kit?.footer?.text ?? '';
  const shownLexicon = lexicon ?? (kit?.lexicon ?? []).join('\n');
  const commitFooterText = () => {
    if (footerText === null) return;
    const next = footerText.trim();
    setFooterText(null);
    if (next === (kit?.footer?.text ?? '')) return;
    void writeKit('/footer/text', next === '' ? undefined : next);
  };
  const commitLexicon = () => {
    if (lexicon === null) return;
    const next = lexicon
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    setLexicon(null);
    if (next.join('\n') === (kit?.lexicon ?? []).join('\n')) return;
    void writeKit('/lexicon', next.length === 0 ? undefined : next);
  };
  /* Reset removes the kit and the deck shows its theme (docs/DESIGN.md 7.5) */
  const reset = () => {
    if (commit === undefined) {
      onNotice?.(words.noKitYet);
      return;
    }
    if (kit === undefined) {
      shell.say(words.resetDone(themeTitle));
      return;
    }
    commit([{ op: 'deck.set', path: '/brand' }], words.reset(themeTitle))
      .then(() => shell.say(words.resetDone(themeTitle), undoAction()))
      .catch(fail);
  };
  const stopEnter = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  return (
    <Panel
      title={words.title}
      onClose={onClose}
      control="panel.brand"
      className="ts-themes ts-brand"
    >
      <section
        className="ts-brand-section"
        aria-labelledby="ts-brand-appearance"
        data-control="panel.themes"
      >
        <div className="ts-brand-head-row">
          <h3 id="ts-brand-appearance" className="ts-brand-head">
            {words.appearance}
          </h3>
          <div className="ts-brand-switch" role="radiogroup" aria-label={PANELS.themes.appearance}>
            {tile('light')}
            {tile('dark')}
          </div>
        </div>
      </section>

      <section
        className="ts-brand-section"
        aria-labelledby="ts-theme-current"
        data-control="panel.theme.current"
      >
        <h3 id="ts-theme-current" className="ts-brand-head">
          {words.inThisPresentation}
        </h3>
        <div className="ts-theme-own" data-theme-id={themeId}>
          <TilePair html={ownHtml} appearance={current} />
          <p className="ts-theme-current-name">{themeTitle}</p>
        </div>
        <div className="ts-theme-kit-row">
          <span data-control="panel.theme.kit">
            {kitParts === null ? words.kitNone : words.kitOf(kitParts)}
          </span>
          <button
            type="button"
            className="pt-ib ts-fo-button"
            data-control="panel.theme.editKit"
            onClick={() => {
              kitStart.current?.scrollIntoView({ block: 'start' });
              kitStart.current?.querySelector<HTMLElement>('button, input, select')?.focus();
            }}
            {...tipProps({ name: words.editKit, doc: words.editKitDoc })}
          >
            <span className="pt-lb">{words.editKit}</span>
          </button>
        </div>
      </section>

      <section
        className="ts-brand-section"
        aria-labelledby="ts-theme-library"
        data-control="panel.theme.themes"
      >
        <h3 id="ts-theme-library" className="ts-brand-head">
          {words.themes}
        </h3>
        <ThemeLibrary
          document={document}
          appearance={current}
          current={themeId}
          assetUrl={assetUrl}
          onPick={pickTheme}
        />
      </section>

      <div ref={kitStart} className="ts-theme-kit-start" data-control="panel.theme.kitStart">
        <h3 className="ts-theme-kit-head">{words.kit}</h3>
      </div>

      <section className="ts-brand-section" aria-labelledby="ts-brand-logo">
        <h3 id="ts-brand-logo" className="ts-brand-head">
          {words.logo}
        </h3>
        <div className="ts-brand-logo-row">
          <span
            className={cn('ts-brand-logo-preview', markKind === 'none' && 'is-empty')}
            data-theme={current}
            data-control="panel.brand.logo.preview"
            data-kind={markKind}
            aria-label={
              markKind === 'none'
                ? 'No logo'
                : markKind === 'picture'
                  ? (logoAsset?.alt ?? 'The logo')
                  : `${themeTitle}’s logo`
            }
            {...tipProps({ name: words.logo, doc: words.logoLine })}
          >
            {markKind === 'picture' && logoSrc !== undefined ? (
              <img src={logoSrc} alt="" />
            ) : markKind === 'none' ? null : (
              <svg width="66" height="42" fill="currentColor" aria-hidden="true">
                <use href="#gt-mark" />
              </svg>
            )}
          </span>
          <div className="ts-brand-logo-buttons">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              hidden
              onChange={(event) => void replaceLogo(event)}
            />
            <button
              type="button"
              className="pt-ib ts-fo-button"
              data-control="panel.brand.logo.replace"
              disabled={commit === undefined || uploading}
              onClick={() => fileInput.current?.click()}
              {...tipProps({ name: words.replace, doc: words.replaceDoc })}
            >
              <span className="pt-lb">{uploading ? 'Uploading' : words.replace}</span>
            </button>
            <button
              type="button"
              className="pt-ib ts-fo-button"
              data-control="panel.brand.logo.remove"
              disabled={commit === undefined}
              onClick={() => void removeLogo()}
              {...tipProps({ name: words.remove, doc: words.removeDoc })}
            >
              <span className="pt-lb">{words.remove}</span>
            </button>
            {themeHasLogo ? (
              <button
                type="button"
                className="pt-ib ts-fo-button"
                data-control="panel.brand.logo.default"
                disabled={commit === undefined}
                onClick={() => void defaultLogo()}
                {...tipProps({ name: words.useDefault, doc: words.useDefaultDoc(themeTitle) })}
              >
                <span className="pt-lb">{words.useDefault}</span>
              </button>
            ) : null}
          </div>
        </div>
        <div className="ts-brand-two">
          {positionSelect('/positions/mark', 'panel.brand.logo.position', words.titlePosition)}
          {positionSelect(
            '/positions/footerLogo',
            'panel.brand.footer.position',
            words.footerPosition,
          )}
        </div>
        <p className="ts-brand-line">{words.logoLine}</p>
      </section>

      <section className="ts-brand-section" aria-labelledby="ts-brand-colors">
        <div className="ts-brand-head-row">
          <h3 id="ts-brand-colors" className="ts-brand-head">
            {words.colors}
          </h3>
          <div className="ts-brand-switch" role="radiogroup" aria-label="Appearance of the colours">
            {(['light', 'dark'] as const).map((appearance) => (
              <button
                key={appearance}
                type="button"
                role="radio"
                aria-checked={colorAppearance === appearance}
                className={cn(
                  'pt-ib ts-fo-button is-small',
                  colorAppearance === appearance && 'is-on',
                )}
                data-control={`panel.brand.color.appearance.${appearance}`}
                onClick={() => setColorAppearance(appearance)}
                {...tipProps({
                  name: appearance === 'light' ? words.light : words.dark,
                  doc: `Edits the colors the ${appearance} appearance draws`,
                })}
              >
                <span className="pt-lb">{appearance === 'light' ? words.light : words.dark}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ts-brand-colors">{KIT_COLORS.map(colorRow)}</div>
      </section>

      <section className="ts-brand-section" aria-labelledby="ts-brand-fonts">
        <h3 id="ts-brand-fonts" className="ts-brand-head">
          {words.fonts}
        </h3>
        <div className="ts-brand-field">
          <span className="ts-brand-label">{words.display}</span>
          <FontDropdown
            control="panel.brand.font.display"
            label={words.display}
            doc={words.displayDoc}
            value={kit?.fonts?.display ?? null}
            disabled={commit === undefined}
            onPick={(id: FontId | null) => void writeKit('/fonts/display', id ?? undefined)}
            className="ts-brand-font"
          />
        </div>
        <div className="ts-brand-field">
          <span className="ts-brand-label">{words.text}</span>
          <FontDropdown
            control="panel.brand.font.text"
            label={words.text}
            doc={words.textDoc}
            value={kit?.fonts?.text ?? null}
            disabled={commit === undefined}
            onPick={(id: FontId | null) => void writeKit('/fonts/text', id ?? undefined)}
            className="ts-brand-font"
          />
        </div>
      </section>

      <section className="ts-brand-section" aria-labelledby="ts-brand-footer">
        <h3 id="ts-brand-footer" className="ts-brand-head">
          {words.footer}
        </h3>
        <label className="ts-brand-field">
          <span className="ts-brand-label">{words.footerLogo}</span>
          <select
            value={footerLogo}
            aria-label={`${words.footer} ${words.footerLogo.toLowerCase()}`}
            data-control="panel.brand.footer.logo"
            disabled={commit === undefined}
            {...tipProps({
              name: `${words.footer} ${words.footerLogo.toLowerCase()}`,
              doc: words.footerLogoDoc,
            })}
            onChange={(event) => {
              const next = event.target.value as LogoKind;
              if (next === 'picture') {
                if (footerAsset === undefined) {
                  fileInput.current?.click();
                  return;
                }
                void writeKitAll(
                  [
                    ['/footer/logo', 'picture'],
                    ['/footer/assetId', footerAsset],
                  ],
                  brandWriteLabel('/footer/logo'),
                );
                return;
              }
              void writeKit('/footer/logo', next);
            }}
          >
            {(themeHasLogo
              ? (['default', 'none', 'picture'] as const)
              : (['none', 'picture'] as const)
            ).map((kind) => (
              <option key={kind} value={kind}>
                {words.logoKinds[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="ts-brand-field">
          <span className="ts-brand-label">{words.footerText}</span>
          <input
            type="text"
            className="ts-brand-input"
            value={shownFooterText}
            placeholder={words.footerTextPlaceholder}
            aria-label={`${words.footer} ${words.footerText.toLowerCase()}`}
            data-control="panel.brand.footer.text"
            disabled={commit === undefined}
            {...tipProps({
              name: `${words.footer} ${words.footerText.toLowerCase()}`,
              doc: words.footerTextDoc,
              key: 'Enter',
            })}
            onChange={(event) => setFooterText(event.target.value)}
            onKeyDown={stopEnter}
            onBlur={commitFooterText}
          />
        </label>
      </section>

      <section className="ts-brand-section" aria-labelledby="ts-brand-counter">
        <h3 id="ts-brand-counter" className="ts-brand-head">
          {words.counter}
        </h3>
        {check(
          words.counterShow,
          counterShow,
          'panel.brand.counter.show',
          (next) => void writeKit('/counter/show', next),
          'The number in the frame of every slide',
        )}
        <label className="ts-brand-field">
          <span className="ts-brand-label">{words.counterFormat}</span>
          <select
            value={format}
            aria-label={`${words.counter} ${words.counterFormat.toLowerCase()}`}
            data-control="panel.brand.counter.format"
            disabled={commit === undefined}
            {...tipProps({
              name: `${words.counter} ${words.counterFormat.toLowerCase()}`,
              doc: 'n / N reads 03 / 12, n reads 03, Slide n reads Slide 3',
            })}
            onChange={(event) =>
              void writeKit('/counter/format', event.target.value as CounterFormat)
            }
          >
            {COUNTER_FORMATS.map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </label>
        {check(
          words.counterSkip,
          counterSkip,
          'panel.brand.counter.skipTitle',
          (next) => void writeKit('/counter/skipTitle', next),
          'Numbers every slide but the title slides',
        )}
      </section>

      <section className="ts-brand-section" aria-labelledby="ts-brand-frame">
        <h3 id="ts-brand-frame" className="ts-brand-head">
          {words.frame}
        </h3>
        {check(
          words.frameRails,
          drawnFrame.rails,
          'panel.brand.frame.rails',
          (next) => void writeKit('/frame/rails', next),
          words.frameRailsLine,
        )}
        <p className="ts-brand-line">{words.frameRailsLine}</p>
        {check(
          words.frameRules,
          drawnFrame.top || drawnFrame.bottom,
          'panel.brand.frame.rules',
          (next) => void writeKit('/frame/rules', next),
          words.frameRulesLine,
        )}
        <p className="ts-brand-line">{words.frameRulesLine}</p>
        {check(
          words.frameCrosses,
          drawnFrame.crosses,
          'panel.brand.frame.crosses',
          (next) => void writeKit('/frame/crosses', next),
          words.frameCrossesLine,
        )}
        <p className="ts-brand-line">{words.frameCrossesLine}</p>
      </section>

      <section className="ts-brand-section" aria-labelledby="ts-brand-lexicon">
        <h3 id="ts-brand-lexicon" className="ts-brand-head">
          {words.lexicon}
        </h3>
        <textarea
          className="ts-brand-textarea"
          value={shownLexicon}
          rows={3}
          placeholder={words.lexiconPlaceholder}
          aria-label={words.lexicon}
          data-control="panel.brand.lexicon"
          disabled={commit === undefined}
          {...tipProps({ name: words.lexicon, doc: words.lexiconLine })}
          onChange={(event) => setLexicon(event.target.value)}
          onBlur={commitLexicon}
        />
        <p className="ts-brand-line">{words.lexiconLine}</p>
      </section>

      <div className="ts-brand-foot">
        <button
          type="button"
          className="pt-ib ts-fo-button ts-brand-reset"
          data-control="panel.brand.reset"
          disabled={commit === undefined}
          onClick={reset}
          {...tipProps({
            name: words.reset(themeTitle),
            doc: words.resetDoc(themeTitle),
          })}
        >
          <span className="pt-lb">{words.reset(themeTitle)}</span>
        </button>
      </div>
    </Panel>
  );
}
