import { toggleTheme } from '@turboslide/viewer/theme';

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
 * directly.
 *
 * The glyph is the deck's (directive 8.4): the half discs ◐ in light mode
 * and ◑ in dark mode, rendered as text at 16px, the one place in chrome a
 * text glyph stands for an icon. The button renders both and ToolButton.css
 * shows the one html[data-theme] names (docs/POLISH-2.md 3.3), so the
 * server's markup draws the right glyph from the first paint, before any
 * script runs, and a press changes no markup. Without script the page has no
 * data-theme, draws its light tokens and the button draws ◐.
 *
 * The icon button's name is "Dark or light", the tooltip's words, which are
 * true for every visitor before and after hydration. The labelled button's
 * name is its visible word "Theme", set as its label too so the name stays
 * when the toolbar's tier three hides the word (Toolbar.css).
 *
 * The button is the markup ToolButton draws for a text glyph (the .pt-ib,
 * .pt-icon without a label, the shared tooltip), written here so the button
 * imports no icon: ToolButton's `Icon` import brought the editor's whole icon
 * table (51,136 B decoded) to /home, whose navigation draws this button
 * (docs/DESIGN.md 8.1; build/d4.md request to D2).
 */
const NAME = 'Dark or light';

export type ThemeButtonProps = {
  className?: string;
  /** show the `Theme` label and name the D key; defaults to true unless a className is passed */
  label?: boolean;
};

export function ThemeButton({ className, label = className === undefined }: ThemeButtonProps) {
  const classes = ['pt-ib', label ? '' : 'pt-icon', className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      aria-label={label ? 'Theme' : NAME}
      data-control="view.theme"
      onClick={() => {
        toggleTheme();
      }}
      {...tipProps(tipOf(label ? `${NAME} (D)` : NAME, label ? 'Theme' : NAME))}
    >
      <span className="pt-theme-glyph is-light" aria-hidden="true">
        ◐
      </span>
      <span className="pt-theme-glyph is-dark" aria-hidden="true">
        ◑
      </span>
      {label ? <span className="pt-lb">Theme</span> : null}
    </button>
  );
}
