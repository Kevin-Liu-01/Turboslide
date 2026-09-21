import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  BrandKit,
  CounterFormat,
  DefaultKit,
  KitColor,
  LogoKind,
  SlotPosition,
} from '@turboslide/schema/brand';
import {
  COUNTER_FORMATS,
  FALLBACK_DEFAULT_KIT,
  KIT_COLORS,
  KIT_COLOR_TOKENS,
  KIT_COLOR_WORDS,
  SLOT_POSITIONS,
  SLOT_POSITION_LABELS,
  brandWriteLabel,
  brandWriteMutation,
} from '@turboslide/schema/brand';
import type { HexColor } from '@turboslide/schema/color';
import { isHexColor } from '@turboslide/schema/color';
import type { Appearance, DeckDocument } from '@turboslide/schema/deck';
import { deckAppearance, slideOrder } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import type { Mutation } from '@turboslide/schema/mutations';
import { THEME_CSS_STYLE_ID, themeCss } from '@turboslide/render/theme-css';
import { TOKENS } from '@turboslide/theme/tokens';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import { useEditorShell } from './editor-shell-context';
import type { EditorShellInput } from './editor-shell';
import { FontDropdown } from './FontPicker';
import type { SlideRenderer } from './LayoutGrid';
import { cn } from './lib/cn';
import { PANELS, SNACKBARS } from './menus/strings';
import { Panel } from './Panel';
import { tipProps } from './Tooltip';

import './ThemesPanel.css';

/**
 * The Brand kit panel (docs/PRODUCT.md 4.1, 4.4; formerly the Themes panel of gslides-parity SPEC
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

/** The shell input's default kit (the deployment's, by request to the integrator); the fallback names none. */
function defaultKitOfInput(input: EditorShellInput): DefaultKit {
  const kit = (input as { defaultKit?: DefaultKit }).defaultKit;
  return kit ?? FALLBACK_DEFAULT_KIT;
}

/** The hex a role shows: the kit's value in the appearance, else the theme token's value. */
function roleHex(kit: BrandKit | undefined, appearance: Appearance, role: KitColor): string {
  const own = kit?.colors?.[appearance]?.[role];
  if (own !== undefined) return own;
  const token = KIT_COLOR_TOKENS[role] as keyof (typeof TOKENS)['light'];
  const value = TOKENS[appearance][token];
  return typeof value === 'string' && value.startsWith('#') ? value : '#000000';
}

/** The transient stylesheet of a colour being typed: the kit with the typed value, on one style element. */
function previewKit(
  kit: BrandKit | undefined,
  appearance: Appearance,
  role: KitColor,
  hex: HexColor | null,
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
  style.textContent = themeCss({ brand: next });
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

export function ThemesPanel({ document, render, commit, onNotice, onClose }: ThemesPanelProps) {
  const shell = useEditorShell();
  const { input } = shell;
  const { deck } = document;
  const kit = deck.brand;
  const words = PANELS.brand;
  const defaultKit = defaultKitOfInput(input);
  const current = deckAppearance(deck);
  const [colorAppearance, setColorAppearance] = useState<Appearance>(current);
  const firstId = slideOrder(deck)[0];
  const first = firstId === undefined ? undefined : document.slides[firstId];
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const thumbs = useMemo(() => {
    const make = (theme: Appearance): string | null => {
      if (first === undefined || render === undefined) return null;
      try {
        return render(first, theme);
      } catch {
        return null;
      }
    };
    return { light: make('light'), dark: make('dark') };
  }, [first, render]);
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

  const tile = (appearance: Appearance) => {
    const html = thumbs[appearance];
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
          className={cn('ts-themes-tile', on && 'is-current')}
          role="radio"
          aria-checked={on}
          data-control={`themes.gt.${appearance}`}
          data-appearance={appearance}
          onClick={() => pickAppearance(appearance)}
          {...tipProps({
            name: `${PANELS.themes.gt} ${label.toLowerCase()}`,
            doc: on
              ? 'The presentation uses this appearance'
              : `Switches the presentation to ${label.toLowerCase()}`,
          })}
        >
          <span
            className="ts-themes-frame"
            data-theme={appearance}
            aria-hidden="true"
            data-selected={on ? 'true' : undefined}
          >
            {html === null ? (
              <span className="ts-themes-plate">{PANELS.themes.gt}</span>
            ) : (
              <LiveClone html={html} theme={appearance} frame={false} />
            )}
          </span>
          <span className="ts-themes-name">{label}</span>
        </button>
      </span>
    );
  };

  /* the logo slot: the title slide's mark and the footer's logo together */
  const markKind: LogoKind = kit?.mark?.kind ?? 'default';
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
    ).then(() => shell.say(words.logoDefault(defaultKit.name), undoAction()));

  const positionSelect = (
    pointer: '/positions/mark' | '/positions/footerLogo',
    control: string,
    label: string,
  ) => {
    const value: SlotPosition =
      pointer === '/positions/mark'
        ? (kit?.positions?.mark ?? 'bottom-left')
        : (kit?.positions?.footerLogo ?? 'bottom-left');
    return (
      <label className="ts-brand-field">
        <span className="ts-brand-label">{label}</span>
        <select
          value={value}
          aria-label={`${words.position}, ${label.toLowerCase()}`}
          data-control={control}
          {...tipProps({
            name: `${words.position}, ${label.toLowerCase()}`,
            doc: 'One of the four corners of the slide, or hidden',
          })}
          onChange={(event) => writeKit(pointer, event.target.value as SlotPosition)}
        >
          {SLOT_POSITIONS.map((position) => (
            <option key={position} value={position}>
              {SLOT_POSITION_LABELS[position]}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const colorRow = (role: KitColor) => {
    const hex = roleHex(kit, colorAppearance, role);
    const own = kit?.colors?.[colorAppearance]?.[role] !== undefined;
    const meaning = KIT_COLOR_WORDS[role];
    const pointer = `/colors/${colorAppearance}/${role}`;
    return (
      <div key={role} className="ts-brand-color" data-role={role}>
        <label
          className={cn('ts-brand-swatch', own && 'is-own')}
          style={{ background: hex }}
          data-control={`panel.brand.color.${role}.swatch`}
          {...tipProps({ name: meaning.name, doc: `${meaning.line}. ${hex}` })}
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
          onPreview={(typed) => previewKit(kit, colorAppearance, role, typed)}
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

  const footerLogo: LogoKind = kit?.footer?.logo ?? 'default';
  const footerAsset = kit?.footer?.assetId ?? kit?.mark?.assetId;
  const format: CounterFormat = kit?.counter?.format ?? 'n / N';
  const counterShow = kit?.counter?.show ?? deck.defaults?.counter !== 'off';
  const counterSkip = kit?.counter?.skipTitle ?? deck.defaults?.counter === 'skip-title';
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
  const reset = () => {
    if (commit === undefined) {
      onNotice?.(words.noKitYet);
      return;
    }
    if (kit === undefined) {
      shell.say(words.resetDone(defaultKit.name));
      return;
    }
    commit([{ op: 'deck.set', path: '/brand' }], words.reset(defaultKit.name))
      .then(() => shell.say(words.resetDone(defaultKit.name), undoAction()))
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
        <h3 id="ts-brand-appearance" className="ts-brand-head">
          {words.appearance}
        </h3>
        <div
          className="ts-themes-tiles"
          role="radiogroup"
          aria-label={`${PANELS.themes.gt} appearance`}
        >
          {tile('light')}
          {tile('dark')}
        </div>
      </section>

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
                  : `${defaultKit.name}’s logo`
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
            <button
              type="button"
              className="pt-ib ts-fo-button"
              data-control="panel.brand.logo.default"
              disabled={commit === undefined}
              onClick={() => void defaultLogo()}
              {...tipProps({ name: words.useDefault, doc: words.useDefaultDoc(defaultKit.name) })}
            >
              <span className="pt-lb">{words.useDefault}</span>
            </button>
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
                  doc: `Edits the colours the ${appearance} appearance draws`,
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
            {(['default', 'none', 'picture'] as const).map((kind) => (
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
          kit?.frame?.rails ?? true,
          'panel.brand.frame.rails',
          (next) => void writeKit('/frame/rails', next),
          words.frameRailsLine,
        )}
        <p className="ts-brand-line">{words.frameRailsLine}</p>
        {check(
          words.frameRules,
          kit?.frame?.rules ?? true,
          'panel.brand.frame.rules',
          (next) => void writeKit('/frame/rules', next),
          words.frameRulesLine,
        )}
        <p className="ts-brand-line">{words.frameRulesLine}</p>
        {check(
          words.frameCrosses,
          kit?.frame?.crosses ?? true,
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
            name: words.reset(defaultKit.name),
            doc: words.resetDoc(defaultKit.name),
          })}
        >
          <span className="pt-lb">{words.reset(defaultKit.name)}</span>
        </button>
      </div>
    </Panel>
  );
}
