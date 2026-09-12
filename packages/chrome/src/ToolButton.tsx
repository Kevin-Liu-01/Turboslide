import type { ReactNode } from 'react';

import { Icon } from './icons';
import type { IconName } from './icons';
import { tipOf, tipProps } from './Tooltip';

import './ToolButton.css';

/**
 * The shell's button, ported from Prototemplate/src/components/viewer/ToolButton.tsx
 * (SPEC 2.2: the 32px .pt-ib with a 1px hover border and an is-on ink border).
 * Every control in the toolbar and the segmented control is one of these: a
 * .pt-ib with type="button" and a title that names its key. With a label it
 * is a text button whose label Toolbar.css may collapse when the bar runs
 * short; without one it is the 32px icon square (.pt-icon), which also
 * carries a text glyph such as the theme button's half disc. A labeled
 * button with no icon is .is-text, and the collapse rules leave its label
 * alone, since an icon square with nothing in it would be a blank block.
 *
 * The title is the tooltip (Tooltip.tsx), not the browser's: `tipOf` reads
 * the name (the label, else the title's body), the sentence (`doc`, else the
 * title's body when a label names the control) and the key from the trailing
 * parenthetical, and the button carries `data-tip` and the tooltip handlers
 * instead of a native title, so one plate in the shell grammar shows for
 * every control and the two never double up.
 */
export type ToolButtonProps = {
  /** the tooltip; names the key in parentheses, as in 'Dark or light (D)' */
  title: string;
  /** one sentence on what the button does, when the title is the name alone */
  doc?: string;
  onClick: () => void;
  /** the 16px solid glyph from icons.tsx */
  icon?: IconName;
  /** text label in .pt-lb; absent makes the button an icon square */
  label?: string;
  /** aria-pressed plus .is-on; leave undefined for buttons that do not toggle */
  pressed?: boolean;
  /**
   * aria-pressed without the ink frame: for a toggle whose state is already
   * visible elsewhere (the list toggle, while the list is the state), so the
   * frame stays reserved for transient toggles like Help.
   */
  quiet?: boolean;
  /** .is-solid, the one filled call to action */
  solid?: boolean;
  /** .hide-sm: hidden at or below 900px */
  hideSm?: boolean;
  /** accessible name; icon squares default to the title without its key */
  ariaLabel?: string;
  className?: string;
  /** a locale-independent control id for the window API (SPEC 6.5) */
  control?: string;
  /** the button takes no input; the tooltip still names it */
  disabled?: boolean;
  /** replaces the icon: the theme glyph */
  children?: ReactNode;
};

/** 'Dark or light (D)' -> 'Dark or light' */
function nameFromTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '');
}

export function ToolButton({
  title,
  doc,
  onClick,
  icon,
  label,
  pressed,
  quiet = false,
  solid = false,
  hideSm = false,
  ariaLabel,
  className,
  control,
  disabled,
  children,
}: ToolButtonProps) {
  const iconOnly = label === undefined;
  const classes = [
    'pt-ib',
    iconOnly ? 'pt-icon' : '',
    !iconOnly && !icon && !children ? 'is-text' : '',
    pressed && !quiet ? 'is-on' : '',
    solid ? 'is-solid' : '',
    hideSm ? 'hide-sm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  /* a labeled button is named by its label, with the title as the fallback
     once the label collapses; an icon square needs the name spelled out */
  const name = ariaLabel ?? (iconOnly ? nameFromTitle(title) : undefined);
  const tip = tipOf(title, label ?? ariaLabel);
  if (doc !== undefined) tip.doc = doc;
  return (
    <button
      type="button"
      className={classes}
      aria-label={name}
      aria-pressed={pressed}
      data-control={control}
      disabled={disabled}
      onClick={onClick}
      {...tipProps(tip)}
    >
      {icon ? <Icon name={icon} /> : children}
      {label !== undefined ? <span className="pt-lb">{label}</span> : null}
    </button>
  );
}
