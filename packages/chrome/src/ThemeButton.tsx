import { useState } from 'react';

import { readTheme, toggleTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { useMountEffect } from './lib/useMountEffect';
import { tipOf, tipProps } from './Tooltip';

import './ToolButton.css';

/**
 * The light and dark switch, on the shell button. Ported from
 * Prototemplate/src/components/viewer/ThemeButton.tsx; the persistence moved
 * to @turboslide/viewer/theme, which writes the deck's dual key (gt-theme,
 * then gt-deck-theme; SPEC 6.8) and posts { type: 'gt-theme' } to every
 * same-origin frame. State lives on <html data-theme> so every stylesheet
 * remaps its tokens under [data-theme='dark']; the boot script in the studio
 * root applies the saved choice before first paint and dark is the default
 * when nothing is saved. The D key in useShellKeys calls toggleTheme()
 * directly and the button follows through a MutationObserver on the
 * attribute.
 *
 * The glyph is the deck's (directive 8.4): the half discs ◐ in light mode
 * and ◑ in dark mode, rendered as text at 16px, the one place in chrome a
 * text glyph stands for an icon. ToolButton.css sizes it (.pt-theme-glyph).
 *
 * The button is the markup ToolButton draws for a text glyph (the .pt-ib,
 * .pt-icon without a label, the shared tooltip), written here so the button
 * imports no icon: ToolButton's `Icon` import brought the editor's whole icon
 * table (51,136 B decoded) to /home, whose navigation draws this button
 * (docs/DESIGN.md 8.1; build/d4.md request to D2).
 */
const DEFAULT_THEME: Theme = 'dark';

/** The glyph names the theme the button is in: the left half filled in light, the right half in dark. */
const GLYPH: Record<Theme, string> = { light: '◐', dark: '◑' };

export type ThemeButtonProps = {
  className?: string;
  /** show the `Theme` label and name the D key; defaults to true unless a className is passed */
  label?: boolean;
};

export function ThemeButton({ className, label = className === undefined }: ThemeButtonProps) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useMountEffect(() => {
    setTheme(readTheme());
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  });

  const name = theme === 'dark' ? 'Switch to light' : 'Switch to dark';
  const classes = ['pt-ib', label ? '' : 'pt-icon', className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      aria-label={name}
      data-control="view.theme"
      onClick={() => {
        toggleTheme();
      }}
      {...tipProps(tipOf(label ? 'Dark or light (D)' : 'Dark or light', label ? 'Theme' : name))}
    >
      <span className="pt-theme-glyph" aria-hidden="true">
        {GLYPH[theme]}
      </span>
      {label ? <span className="pt-lb">Theme</span> : null}
    </button>
  );
}
