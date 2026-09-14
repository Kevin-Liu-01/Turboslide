import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { useEffect, useId, useRef } from 'react';

import { Icon } from './icons';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { tipProps } from './Tooltip';

import './Dialog.css';

/**
 * The one dialog of the chrome (gslides-parity SPEC 13.3; R08 B9): a centred paper card over a
 * scrim, `role="dialog"` named by its title, a focus trap, Esc to cancel, Enter to run the default
 * button (outside a textarea), the dismissive button first and the confirming button last, and
 * focus returned to the element that opened it on close. Every dialog of `dialogs/` is one of
 * these; the card takes the title, the body and the actions row and owns nothing else. Lines: one
 * `--pt-edge` frame, the card floats over a scrim where the hairline would vanish (SPEC 2.2, the
 * help card's rule). New in Turboslide (no Prototemplate source).
 */
export type DialogAction = {
  label: string;
  onClick: () => void;
  /** the confirming button: the one solid button, Enter runs it */
  primary?: boolean;
  disabled?: boolean;
  /** one sentence for the tooltip */
  doc?: string;
  control?: string;
};

export type DialogProps = {
  title: string;
  /** a second line under the title */
  lead?: string;
  onClose: () => void;
  /** the buttons, dismissive first */
  actions?: ReadonlyArray<DialogAction>;
  /** adds a dismissive Cancel before the actions (the dialogs that write); an information dialog has Done alone */
  cancel?: boolean;
  /** the word on the added dismissive button */
  cancelLabel?: string;
  /** the width in px; 480 unless set */
  width?: number;
  /** the data-control id of the card */
  control?: string;
  className?: string;
  /**
   * false draws the card as a floating box with no scrim and no focus trap, at the place the
   * caller's class names, and leaves focus where it is: the one prompt of SPEC-3 7.2 (the name
   * prompt) uses it so the person typing keeps the caret and the menu bar (VERIFICATION-3
   * finding 8). Esc still closes it and Enter still runs the primary button from inside it.
   */
  modal?: boolean;
  children?: ReactNode;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The focusable elements inside a root, in document order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true' && !el.hidden,
  );
}

export function Dialog({
  title,
  lead,
  onClose,
  actions = [],
  cancel = false,
  cancelLabel = 'Cancel',
  width = 480,
  control,
  className,
  modal = true,
  children,
}: DialogProps) {
  const card = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const leadId = useId();
  const primary = actions.find((action) => action.primary);
  const rows: DialogAction[] = cancel
    ? [
        { label: cancelLabel, onClick: onClose, doc: 'Closes the dialog without a change' },
        ...actions,
      ]
    : [...actions];

  /* focus the first field or button on open; on close, back to the opener (a floating card
     leaves focus where it is, and returns it only if it took it) */
  useMountEffect(() => {
    if (!modal) {
      return () => {
        const back = opener.current;
        if (back && back.isConnected) back.focus();
      };
    }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = card.current;
    if (el) {
      const first = focusableIn(el).find((each) => !each.closest('.ts-dialog-x'));
      (first ?? el).focus();
    }
    return () => {
      const back = opener.current;
      if (back && back.isConnected) back.focus();
    };
  });

  /* the trap: Tab and Shift+Tab cycle inside the card; nothing under the scrim takes focus */
  useEffect(() => {
    if (!modal) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const el = card.current;
      if (!el || !(event.target instanceof Node) || el.contains(event.target)) return;
      const first = focusableIn(el)[0];
      (first ?? el).focus();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [modal]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      if (!modal) return;
      const el = card.current;
      if (!el) return;
      const list = focusableIn(el);
      const first = list[0];
      const last = list[list.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Enter' && primary !== undefined && !primary.disabled) {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
      if (target instanceof HTMLElement && target.getAttribute('role') === 'menuitem') return;
      event.preventDefault();
      primary.onClick();
    }
  };

  const onScrim = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      className={cn(modal ? 'ts-dialog-scrim' : 'ts-dialog-float', 'ts-chrome')}
      role="presentation"
      onMouseDown={modal ? onScrim : undefined}
    >
      <div
        ref={card}
        className={cn('ts-dialog', !modal && 'is-float', className)}
        role="dialog"
        aria-modal={modal ? 'true' : undefined}
        aria-labelledby={titleId}
        aria-describedby={lead === undefined ? undefined : leadId}
        tabIndex={-1}
        style={{ width: `min(${width}px, calc(100vw - 32px))` }}
        data-control={control}
        onKeyDown={onKeyDown}
      >
        <div className="ts-dialog-head">
          <h2 id={titleId} className="ts-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="ts-dialog-x"
            aria-label="Close"
            data-control={control === undefined ? undefined : `${control}.close`}
            onClick={onClose}
            {...tipProps({ name: 'Close', key: 'Esc' })}
          >
            <Icon name="close" />
          </button>
        </div>
        {lead !== undefined ? (
          <p id={leadId} className="ts-dialog-lead">
            {lead}
          </p>
        ) : null}
        <div className="ts-dialog-body">{children}</div>
        {rows.length > 0 ? (
          <div className="ts-dialog-actions">
            {rows.map((action) => (
              <button
                key={action.label}
                type="button"
                className={cn('pt-ib', action.primary ? 'is-solid' : 'is-text', 'ts-dialog-btn')}
                disabled={action.disabled}
                data-control={action.control}
                onClick={action.onClick}
                {...tipProps({
                  name: action.label,
                  ...(action.doc === undefined ? {} : { doc: action.doc }),
                  ...(action.primary ? { key: 'Enter' } : {}),
                })}
              >
                <span className="pt-lb">{action.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A labelled field row of a dialog: the label over the control. */
export function DialogField({
  label,
  hint,
  doc,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /** one sentence for the field's tooltip; the hint, else the label, when absent */
  doc?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn('ts-dialog-field', className)}
      {...tipProps({ name: label, ...((doc ?? hint) === undefined ? {} : { doc: doc ?? hint }) })}
    >
      <span className="ts-dialog-field-label">{label}</span>
      {children}
      {hint !== undefined ? <span className="ts-dialog-hint">{hint}</span> : null}
    </label>
  );
}

/** A check row of a dialog: the box, then the words. */
export function DialogCheck({
  label,
  checked,
  onChange,
  control,
  doc,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  control?: string;
  doc?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn('ts-dialog-check', disabled && 'is-disabled')}
      {...tipProps({ name: label, ...(doc === undefined ? {} : { doc }) })}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-control={control}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ts-dialog-check-box" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

/** A radio row of a dialog. */
export function DialogRadio<T extends string>({
  name,
  options,
  value,
  onChange,
  control,
}: {
  name: string;
  options: ReadonlyArray<{ value: T; label: string; doc?: string }>;
  value: T;
  onChange: (value: T) => void;
  control?: string;
}) {
  return (
    <div className="ts-dialog-radios" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label
          key={option.value}
          className="ts-dialog-radio"
          {...tipProps({
            name: option.label,
            ...(option.doc === undefined ? {} : { doc: option.doc }),
          })}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            data-control={control === undefined ? undefined : `${control}.${option.value}`}
            onChange={() => onChange(option.value)}
          />
          <span className="ts-dialog-radio-dot" aria-hidden="true" />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/** A row of tabs at the top of a dialog body (Presentations | Upload, Link | Embed). */
export function DialogTabs<T extends string>({
  tabs,
  value,
  onChange,
  control,
}: {
  tabs: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  control?: string;
}) {
  return (
    <div className="ts-dialog-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={cn('ts-dialog-tab', value === tab.value && 'is-on')}
          data-control={control === undefined ? undefined : `${control}.${tab.value}`}
          onClick={() => onChange(tab.value)}
          {...tipProps({ name: tab.label })}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
