import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { useEffect, useId, useRef } from 'react';

import { Icon } from './icons';
import { cn } from './lib/cn';
import { useLayer } from './Layer';
import { useMountEffect } from './lib/useMountEffect';
import { hideTooltipUntilInput, tipProps } from './Tooltip';

import './Dialog.css';

/**
 * The one dialog of the chrome (gslides-parity SPEC 13.3; R08 B9): a centred paper card over a
 * scrim, `role="dialog"` named by its title, a focus trap, Esc to cancel, Enter to run the default
 * button (outside a textarea), the dismissive button first and the confirming button last, and
 * focus returned to the element that opened it on close. Every dialog of `dialogs/` is one of
 * these; the card takes the title, the body and the actions row and owns nothing else. Lines: one
 * `--pt-edge` frame, the card floats over a scrim where the hairline would vanish (SPEC 2.2, the
 * help card's rule). New in Turboslide (no Prototemplate source).
 *
 * The focus round, cycle 2 (docs/gslides-parity/focus/VERIFICATION.md F-share-copy and
 * F-shapes-export, build/b3.md R19, build/b4.md FR1): a modal card closes on Escape wherever the
 * focus sits in the page, through a document listener while it is mounted, because the focused
 * button can leave the document (the Download dialog's OK becomes Done when a run completes, the
 * Share dialog's Copy link re-renders busy) and a key pressed with the focus on the body never
 * reached the card. When the actions row changes and the focus has left the card, the confirming
 * button takes it, so Enter and Escape keep working. Enter runs the default button only when the
 * field under the caret did not handle the key itself (`defaultPrevented`): the Change background
 * dialog's hex field applies its colour on Enter and the same key must not also run Done from a
 * render that has not seen the colour yet (F-hex-field, `images.background.hex-field`).
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
  /**
   * The button takes the focus on open instead of the first field (docs/FOCUS.md rank 29: a
   * confirm whose one act is the button, Delete forever, so Enter runs it and Esc keeps).
   */
  autoFocus?: boolean;
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
  /**
   * One sentence under the buttons, in titanium: the reason the primary action is disabled
   * (docs/archive/rounds/POLISH.md 2.9 item 116; audit-assist item 18: a disabled button takes no pointer, so
   * its tooltip never reached the seller). Drawn as `<control>.reason` when the dialog has a
   * control id.
   */
  footnote?: string;
};

/* a `summary` is focusable by the browser without a tabindex, so the trap counts it too
   (docs/archive/rounds/POLISH.md 2.6 item 65; audit-chrome item 16: four Tabs left the Logo dialog through its
   More summary) */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Where the focus goes when a dialog closes (docs/archive/rounds/POLISH.md 2.6 item 65; audit-chrome item 15):
 * the element that opened it while it is still in the document, else, for a dialog a menu row
 * opened (the row left with its menu), the menubar button of that row's menu, so a keyboard user
 * lands where the menu was and not on the page body. Null when neither exists.
 */
export function focusReturnTarget(
  opener: HTMLElement | null,
  menuRow: string | null = null,
): HTMLElement | null {
  if (opener !== null && opener.isConnected && opener !== document.body) return opener;
  const row = menuRow ?? opener?.getAttribute('data-menu-item') ?? null;
  if (row === null) return null;
  const menu = row.split('.')[0];
  if (menu === undefined || menu === '') return null;
  return document.querySelector<HTMLElement>(`[data-control="menubar.${menu}"]`);
}

/* the menu row activated last and when (Menu.tsx `activate` notes it): a menu unmounts its rows
   in the same render that mounts the dialog its row opened, so the dialog's mount reads the body
   as the active element and the row's id is the only trace of where the focus came from */
let activatedRow: { id: string; at: number } | null = null;
const ACTIVATION_GRACE_MS = 1_000;

/** Records the menu row that just ran, for the dialog it opens (item 65). */
export function noteMenuRowActivated(id: string): void {
  activatedRow = { id, at: Date.now() };
}

/** The menu row that ran within the last second, else null. */
export function recentMenuRow(): string | null {
  if (activatedRow === null || Date.now() - activatedRow.at > ACTIVATION_GRACE_MS) return null;
  return activatedRow.id;
}

/**
 * The focusable elements inside a root, in document order, that a Tab can reach: an element
 * inside a closed `details` (past its summary) is one the browser skips, and a trap that counted
 * it as the last element never saw the focus reach it, so Tab from the summary left the card
 * (docs/archive/rounds/POLISH.md 2.6 item 65; the walk's Logo dialog kept three of eight Tabs inside).
 */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      el.getAttribute('aria-hidden') !== 'true' && !el.hidden && !insideClosedDetails(el, root),
  );
}

/** True when an element sits inside a closed `details` below the root, past that details' summary. */
function insideClosedDetails(el: HTMLElement, root: HTMLElement): boolean {
  let node: HTMLElement | null = el.parentElement;
  let child: HTMLElement = el;
  while (node !== null && node !== root) {
    if (node instanceof HTMLDetailsElement && !node.open) {
      const summary = node.querySelector(':scope > summary');
      if (summary === null || (child !== summary && !summary.contains(child))) return true;
    }
    child = node;
    node = node.parentElement;
  }
  return false;
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
  footnote,
  children,
}: DialogProps) {
  const card = useRef<HTMLDivElement>(null);
  /* the scrim with its card, or the floating card, in the dialog layer of the stacking scale: the
     browser's top layer through popover="manual", never showModal(), so a menu, a select list or
     a snackbar raised from the dialog stays above it and takes the pointer (docs/DESIGN.md 2.2,
     2.3, decision C2); the Tab trap and aria-modal below stay the dialog's own */
  const layer = useRef<HTMLDivElement>(null);
  useLayer(layer, { layer: 'dialog' });
  const opener = useRef<HTMLElement | null>(null);
  /* the menu row that opened this dialog, when a menu did (item 65): the focus returns to its
     menubar button, since the row itself left with the menu */
  const openerRow = useRef<string | null>(null);
  const titleId = useId();
  const leadId = useId();
  const primary = actions.find((action) => action.primary);
  const rows: DialogAction[] = cancel
    ? [
        {
          label: cancelLabel,
          onClick: onClose,
          doc: 'Closes the dialog without a change',
          /* a dialog with a control id names its Cancel `<control>.cancel`, so a driver can read it */
          ...(control === undefined ? {} : { control: `${control}.cancel` }),
        },
        ...actions,
      ]
    : [...actions];

  /* focus the first field or button on open; on close, back to the opener (a floating card
     leaves focus where it is, and returns it only if it took it) */
  useMountEffect(() => {
    /* a plate over the opener leaves as the card opens, and the focus the close returns to the
       opener draws none (docs/archive/rounds/POLISH.md 2.6 item 61: the "Format menu" plate over the toolbar
       after a dialog closed on a click) */
    hideTooltipUntilInput();
    if (!modal) {
      return () => {
        hideTooltipUntilInput();
        focusReturnTarget(opener.current, openerRow.current)?.focus();
      };
    }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openerRow.current = recentMenuRow();
    const el = card.current;
    if (el) {
      /* the marked control first (an action with `autoFocus`), else the first field or button */
      const marked = el.querySelector<HTMLElement>('[data-autofocus]');
      const first = marked ?? focusableIn(el).find((each) => !each.closest('.ts-dialog-x'));
      (first ?? el).focus();
      if (first instanceof HTMLInputElement && first.dataset.select === 'all') first.select();
    }
    return () => {
      hideTooltipUntilInput();
      focusReturnTarget(opener.current, openerRow.current)?.focus();
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

  /* the focus never rests on the page body while a modal card is open: a control that held it
     and leaves the document (a person's row after Remove access) or takes the disabled attribute
     (a button while its write runs) drops it to the body with no element to receive a key, and
     from the body the editor's keys acted on the slide behind the card (the keyboard verifier's
     pass 1 on the dropdown round, finding 1). After the render that dropped it, the focus goes to
     the control that now stands at its place in the card's Tab order, else the first control. The
     window losing focus keeps the active element, so it is no drop */
  const place = useRef(-1);
  useEffect(() => {
    const el = card.current;
    if (!modal || !el) return undefined;
    const onIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement)
        place.current = focusableIn(el).indexOf(event.target);
    };
    const onOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null) return;
      queueMicrotask(() => {
        if (!el.isConnected) return;
        const now = document.activeElement;
        if (now !== null && now !== document.body) return;
        const list = focusableIn(el);
        const at = Math.min(place.current, list.length - 1);
        (list[at] ?? list[0] ?? el).focus({ preventScroll: true });
      });
    };
    el.addEventListener('focusin', onIn);
    el.addEventListener('focusout', onOut);
    return () => {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut);
    };
  }, [modal]);

  /* Escape closes a modal card wherever the focus sits (cycle 2, b3 R19 and b4 FR1): the card's
     own handler takes a key pressed inside it and stops its propagation, so this listener sees
     only a key pressed with the focus outside the card, on the body after a focused button left
     the document. The floating form leaves the focus in the page on purpose and keeps Escape to
     the card, so the person typing can still end a text session with it. */
  useEffect(() => {
    if (!modal) return undefined;
    const onDocumentEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const el = card.current;
      if (el && event.target instanceof Node && el.contains(event.target)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onDocumentEscape);
    return () => document.removeEventListener('keydown', onDocumentEscape);
  }, [modal, onClose]);

  /* the focus follows the actions row: when a run completes the confirming button is replaced
     (Download's OK becomes Done) or disabled and the browser drops the focus to the body; the
     card then gives it to the confirming button, else the first control, so Enter and Escape
     keep working (cycle 2, b3 R19 part b, F-share-copy's Escape after Copy link) */
  const actionsKey = rows
    .map((action) => `${action.label}${action.disabled === true ? '!' : ''}`)
    .join('|');
  useEffect(() => {
    if (!modal) return;
    const el = card.current;
    if (!el) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== el && el.contains(active)) return;
    const list = focusableIn(el);
    const confirming = list.find((each) => each.classList.contains('is-solid'));
    (confirming ?? list.find((each) => !each.closest('.ts-dialog-x')) ?? el).focus();
  }, [modal, actionsKey]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      /* a control inside that kept the Tab for itself (a dropdown whose choice put the focus in
         the field it opened, Select.tsx) is not wrapped around */
      if (!modal || event.defaultPrevented) return;
      const el = card.current;
      if (!el) return;
      const list = focusableIn(el);
      const first = list[0];
      const last = list[list.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      /* the focus on an element the list does not count (the card itself, a summary's open
         content that closed): the next Tab lands on the card's first or last element */
      const outside = !(active instanceof HTMLElement) || !list.includes(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Enter' && primary !== undefined && !primary.disabled) {
      /* a field that handled Enter itself (the hex field applies its colour) is not also the
         default button's trigger; the default button reads the state of the next render */
      if (event.defaultPrevented) return;
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
      ref={layer}
      className={cn(modal ? 'ts-dialog-scrim' : 'ts-dialog-float', 'ts-chrome')}
      role="presentation"
      onMouseDown={modal ? onScrim : undefined}
    >
      <div
        ref={card}
        className={cn('ts-dialog pt-window', !modal && 'is-float', className)}
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
                data-autofocus={action.autoFocus ? '' : undefined}
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
        {footnote !== undefined && footnote !== '' ? (
          <p
            className="ts-dialog-footnote"
            data-control={control === undefined ? undefined : `${control}.reason`}
          >
            {footnote}
          </p>
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
