import { useEffect, useRef, useState } from 'react';

import type { Appearance, ThemeEdits, ThemeFontRole } from '@turboslide/schema/deck';
import { THEME_FONT_ROLES } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { FONT_IDS } from '@turboslide/schema/fonts';
import type { PlaceholderKind } from '@turboslide/schema/blocks';
import { PLACEHOLDER_KINDS, PLACEHOLDER_LABELS } from '@turboslide/schema/blocks';
import { THEME_COLOR_SLOTS } from '@turboslide/schema/validate/theme';
import type { ThemeColorSlot } from '@turboslide/schema/validate/theme';

import { Icon } from './icons';
import { cn } from './lib/cn';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './ThemeToolbar.css';

/**
 * The theme mode's toolbar (gslides-parity SPEC-5 9.2; R03 2.3, 4.5): Google's controls in
 * Google's order, Background, Colors, Fonts, Insert placeholder, Rename and the X. Colors lists
 * Google's twelve names in Google's order (Text and background 1 to 4, Accent 1 to 6, Link) over
 * the slot mapping of `THEME_COLOR_SLOTS`, the token as the tooltip; a pick writes `theme.set
 * /colors/<appearance>/<slot>` for the appearance shown, a hex field beside the swatch, the four
 * text and background slots also taking transparency (R03 4.2, alpha on the record is b6.md
 * request R3 to the integrator; until it lands the field takes six digits). Fonts lists the
 * catalog's faces for the two roles (`theme.set /fonts/<role>`; SPEC-5-amendments A5 item 4).
 * Insert placeholder offers Google's five kinds for the layout being edited. Rename writes
 * `theme.rename`. The mode's owner (apps/studio theme-mode.tsx) passes the writes; this component
 * draws the controls and keeps no document state.
 */
export type ThemeToolbarProps = {
  edits: ThemeEdits | undefined;
  appearance: Appearance;
  /** the base values of the twelve slots for the appearance, `#rrggbb`, when the record names none */
  baseColors: Readonly<Record<string, string>>;
  busy?: boolean;
  onBackground: () => void;
  onColor: (slot: ThemeColorSlot['key'], value: string | null) => void;
  onFont: (role: ThemeFontRole, id: FontId | null) => void;
  /** absent while the theme slide (not a layout) is shown: the control is disabled with the reason */
  onInsertPlaceholder?: (kind: PlaceholderKind) => void;
  onRename: () => void;
  onExit: () => void;
};

/** The face's name from its id: `open-sans` reads Open Sans, `ibm-plex-mono` IBM Plex Mono, `pt-serif` PT Serif. */
export function fontLabel(id: string): string {
  const upper = new Set(['ibm', 'pt', 'eb', 'dm']);
  return id
    .split('-')
    .map((part) =>
      upper.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ');
}

/** Google's label of a font role: Display is the headings' face, Text the body's. */
export const FONT_ROLE_LABELS: Readonly<Record<ThemeFontRole, string>> = {
  display: 'Headings',
  text: 'Body text',
  mono: 'Code',
};

function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

type Drop = 'colors' | 'fonts' | 'placeholder' | null;

export function ThemeToolbar({
  edits,
  appearance,
  baseColors,
  busy,
  onBackground,
  onColor,
  onFont,
  onInsertPlaceholder,
  onRename,
  onExit,
}: ThemeToolbarProps) {
  const [open, setOpen] = useState<Drop>(null);
  const [hex, setHex] = useState<{ slot: string; value: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const colors = edits?.colors?.[appearance] ?? {};
  const fonts = edits?.fonts ?? {};

  const dropButton = (id: Exclude<Drop, null>, label: string, doc: string, disabled?: string) => {
    const isOpen = open === id;
    return (
      <button
        type="button"
        className={cn(
          'pt-ib is-text ts-tb ts-theme-drop-btn',
          isOpen && 'is-on',
          disabled !== undefined && 'is-disabled',
        )}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-disabled={disabled !== undefined ? true : undefined}
        data-control={`themeMode.${id}`}
        onClick={() => {
          if (disabled !== undefined) return;
          setOpen(isOpen ? null : id);
        }}
        {...tipProps({ name: label, doc: disabled ?? doc })}
      >
        <span className="pt-lb">{label}</span>
        <span className="ts-theme-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      className="ts-theme-toolbar ts-tb-slot"
      role="toolbar"
      aria-label="Theme toolbar"
      data-control="themeMode.toolbar"
    >
      <ToolButton
        label="Background"
        title="Background"
        control="themeMode.background"
        onClick={onBackground}
        disabled={busy}
      />
      <span className="ts-theme-drop">
        {dropButton(
          'colors',
          'Colors',
          'Google Slides’ twelve theme colours over the sheet tokens',
        )}
        {open === 'colors' ? (
          <div
            className="ts-theme-plate ts-chrome"
            role="menu"
            aria-label="Colors"
            data-control="themeMode.colors.menu"
          >
            {THEME_COLOR_SLOTS.map((slot) => {
              const value = colors[slot.key] ?? baseColors[slot.key] ?? '#000000';
              const edited = colors[slot.key] !== undefined;
              const draft = hex?.slot === slot.key ? hex.value : value;
              return (
                <div
                  key={slot.key}
                  className="ts-theme-color-row"
                  role="menuitem"
                  data-control={`themeMode.colors.${slot.key}`}
                >
                  <span
                    className="ts-theme-swatch"
                    style={{ background: value }}
                    aria-hidden="true"
                  />
                  <span
                    className="ts-theme-color-name"
                    {...tipProps({
                      name: slot.google,
                      doc: `Writes the ${slot.key} token (${slot.api})${slot.alpha ? '; transparency is allowed' : ''}`,
                    })}
                  >
                    {slot.google}
                  </span>
                  <input
                    type="text"
                    className="ts-theme-hex"
                    value={draft}
                    aria-label={`${slot.google} hex`}
                    data-control={`themeMode.colors.${slot.key}.hex`}
                    spellCheck={false}
                    autoComplete="off"
                    disabled={busy}
                    onChange={(event) => setHex({ slot: slot.key, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const next = event.currentTarget.value.trim();
                        if (isHex(next)) {
                          onColor(slot.key, next.toLowerCase());
                          setHex(null);
                        }
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setHex(null);
                      }
                    }}
                    onBlur={() => {
                      if (
                        hex?.slot === slot.key &&
                        isHex(hex.value) &&
                        hex.value.toLowerCase() !== value.toLowerCase()
                      )
                        onColor(slot.key, hex.value.toLowerCase());
                      setHex(null);
                    }}
                  />
                  {edited ? (
                    <button
                      type="button"
                      className="pt-ib pt-icon ts-theme-reset"
                      data-control={`themeMode.colors.${slot.key}.reset`}
                      onClick={() => onColor(slot.key, null)}
                      {...tipProps({
                        name: `Reset ${slot.google}`,
                        doc: 'Back to the theme’s value',
                      })}
                    >
                      <Icon name="arrow-uturn-left" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </span>
      <span className="ts-theme-drop">
        {dropButton(
          'fonts',
          'Fonts',
          'The faces of the headings and the body text from the font catalog',
        )}
        {open === 'fonts' ? (
          <div
            className="ts-theme-plate ts-chrome"
            role="menu"
            aria-label="Fonts"
            data-control="themeMode.fonts.menu"
          >
            {THEME_FONT_ROLES.filter((role) => role !== 'mono').map((role) => (
              <label key={role} className="ts-theme-font-row" role="menuitem">
                <span className="ts-theme-color-name">{FONT_ROLE_LABELS[role]}</span>
                <select
                  className="ts-theme-select"
                  value={fonts[role] ?? ''}
                  aria-label={FONT_ROLE_LABELS[role]}
                  data-control={`themeMode.fonts.${role}`}
                  disabled={busy}
                  onChange={(event) => {
                    const id = event.target.value;
                    onFont(role, id === '' ? null : (id as FontId));
                  }}
                >
                  <option value="">Inter (the theme’s face)</option>
                  {FONT_IDS.filter((id) => id !== 'inter').map((id) => (
                    <option
                      key={id}
                      value={id}
                      style={{ fontFamily: `var(--ts-font-${id}, inherit)` }}
                    >
                      {fontLabel(id)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}
      </span>
      <span className="ts-theme-drop">
        {dropButton(
          'placeholder',
          'Insert placeholder',
          'A title, subtitle, body text, slide number or image box the layout fills',
          onInsertPlaceholder === undefined
            ? 'Pick a layout under Layouts first; the theme slide takes no placeholder'
            : undefined,
        )}
        {open === 'placeholder' && onInsertPlaceholder !== undefined ? (
          <div
            className="ts-theme-plate ts-chrome"
            role="menu"
            aria-label="Insert placeholder"
            data-control="themeMode.placeholder.menu"
          >
            {PLACEHOLDER_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                className="ts-theme-menu-row"
                data-control={`themeMode.placeholder.${kind}`}
                onClick={() => {
                  setOpen(null);
                  onInsertPlaceholder(kind);
                }}
              >
                {PLACEHOLDER_LABELS[kind]}
              </button>
            ))}
          </div>
        ) : null}
      </span>
      <ToolButton
        label="Rename"
        title="Rename"
        control="themeMode.rename"
        onClick={onRename}
        disabled={busy}
      />
      <span className="ts-tb-spring" aria-hidden="true" />
      <ToolButton
        icon="close"
        title="Leave Edit theme (Esc)"
        control="themeMode.exit"
        onClick={onExit}
      />
    </div>
  );
}
