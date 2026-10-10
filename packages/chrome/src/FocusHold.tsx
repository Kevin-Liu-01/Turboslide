import { useState } from 'react';
import type { ButtonHTMLAttributes, FocusEvent as ReactFocusEvent, Ref } from 'react';

/**
 * The one rule for a control that is disabled while it may hold the focus (docs/DROPDOWNS.md
 * 3.5): the write its own press started, or any other reason the site gives. The HTML `disabled`
 * attribute on a focused control drops the focus to the page body, and the modal card then had
 * to guess where it went (the keyboard verifier's final pass 3 on the dropdown round, F1: a Share
 * Permissions box toggled with Space left the focus on Done, and the next Space closed the
 * dialog). While the control holds the focus it carries `aria-disabled="true"` without the
 * attribute, so the focus stays on it and a screen reader reads it unavailable; the site ignores
 * its input; the attribute comes once the focus leaves. `Select`, `HoldButton` and `DialogCheck`
 * take it, so no site keeps a copy of its own.
 */
export type FocusHold = {
  /** the HTML attribute: only while the control does not hold the focus */
  disabled: boolean;
  'aria-disabled': true | undefined;
  onFocus: () => void;
  onBlur: () => void;
};

export function useFocusHold(disabled: boolean): FocusHold {
  const [focused, setFocused] = useState(false);
  return {
    disabled: disabled && !focused,
    'aria-disabled': disabled ? true : undefined,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
}

export type HoldButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
};

/**
 * A `button` under the focus hold: `disabled` keeps a focused button focusable with
 * `aria-disabled`, and its click (a press, Enter or Space) runs nothing until it is enabled again.
 */
export function HoldButton({
  disabled = false,
  type = 'button',
  onClick,
  onFocus,
  onBlur,
  ...rest
}: HoldButtonProps) {
  const hold = useFocusHold(disabled);
  return (
    <button
      {...rest}
      type={type}
      disabled={hold.disabled}
      aria-disabled={hold['aria-disabled']}
      onFocus={(event: ReactFocusEvent<HTMLButtonElement>) => {
        hold.onFocus();
        onFocus?.(event);
      }}
      onBlur={(event: ReactFocusEvent<HTMLButtonElement>) => {
        hold.onBlur();
        onBlur?.(event);
      }}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
