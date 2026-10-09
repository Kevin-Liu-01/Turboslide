import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  ComponentType,
  JSX,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { flushSync } from 'react-dom';

import type { SelectSlotProps } from '@turboslide/viewer/select-slot';

import { Icon } from './icons';
import type { IconName } from './icons';
import { cn } from './lib/cn';
import { hideTooltip, hideTooltipUntilInput, tipProps } from './Tooltip';
import type { TipInput } from './Tooltip';
import { usePlate } from './usePlate';

import './Menu.css';
import './Select.css';

/**
 * The one dropdown of Turboslide (docs/DROPDOWNS.md 3; Kevin, 2026-10-08: "use custom
 * dropdowns!!!"). It replaces every native select, whose system popup takes none of the product's
 * corners, font, colours or layer. The behaviour is the WAI-ARIA Authoring Practices select-only
 * combobox: a `button` with `role="combobox"` keeps the focus at every step, and the active row of
 * a `role="listbox"` is named through `aria-activedescendant` (3.3). The list is always mounted,
 * hidden while closed, right after its trigger, so the window API clicks an option that exists, a
 * dialog's outside press and Tab trap read it as inside the dialog, and inherited tokens apply
 * (3.2, C4). While open it is a plate of the popover layer through `usePlate` (Layer.ts and
 * place.ts), so it draws over every dialog and stays inside the window; its rows are the menu's
 * rows (Menu.css). There is no second popover system (C3).
 *
 * `onChange` keeps the native change semantics (3.5): once per choice, only for a value other
 * than the current one, after the list closed, inside the click or keydown that chose, so a site
 * that opens a file chooser or a confirmation from the change keeps the person's activation.
 */

/** One row of the list. */
export type SelectOption<T extends string = string> = {
  /** the value onChange reports and the row's `data-value` */
  value: T;
  /** the words of the row and of the closed trigger */
  label: string;
  /** a second line under the label, in 12 px titanium */
  description?: string;
  /** a glyph of the sprite in the row's 16 px slot, and before the label in the trigger */
  icon?: IconName;
  /** drawn in --pt-disabled, skipped by the keys and the pointer */
  disabled?: boolean;
};

/** Rows that belong together: a divider before every group but the first, and a heading when named. */
export type SelectGroup<T extends string = string> = {
  heading?: string;
  options: readonly SelectOption<T>[];
};

export type SelectProps<T extends string = string> = {
  /** the chosen value; a value no option carries shows the placeholder */
  value: string;
  options: readonly (SelectOption<T> | SelectGroup<T>)[];
  /** a different option was chosen (3.5) */
  onChange: (value: T) => void;
  /** the accessible name, as the site's aria-label is today */
  label: string;
  /** the trigger's data-control; each option takes `<control>.<value>` */
  control?: string;
  /** 32 px for dialogs, panels and pages; 22 px for the inspector's rows */
  size?: 'field' | 'compact';
  /** the trigger's tooltip, as the site passes to tipProps today */
  tip?: TipInput;
  disabled?: boolean;
  /** the trigger's words while no option carries the value */
  placeholder?: string;
  /** a form field: a hidden input of this name carries the value */
  name?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  /** classes on the trigger, for the site's layout (width, height, margin) */
  className?: string;
  id?: string;
};

/** The rows a list shows before it scrolls. */
export const SELECT_MAX_ROWS = 10;
/** A row's height (Menu.css `.ts-menu-item`). */
export const SELECT_ROW_HEIGHT = 28;
/** The list's height cap: ten rows and the plate's 4 px of padding above and below. */
export const SELECT_MAX_HEIGHT = SELECT_MAX_ROWS * SELECT_ROW_HEIGHT + 8;
/** PageUp and PageDown move this many enabled options. */
export const SELECT_PAGE = 10;
/** Letters typed within this many ms join the type ahead buffer (the menus', Menu.tsx). */
export const TYPE_AHEAD_MS = 1000;
/** The gap between the trigger and the list (the menus' gap under a bar title). */
const LIST_GAP = 2;
/** A label press closes an open list; the click the label then sends its control within this window is not an open. */
const LABEL_CLICK_MS = 1000;

type Row<T extends string> = { option: SelectOption<T>; index: number };
type Section<T extends string> = { heading?: string; rows: Row<T>[] };

function isGroup<T extends string>(
  entry: SelectOption<T> | SelectGroup<T>,
): entry is SelectGroup<T> {
  return 'options' in entry;
}

/**
 * The sections of a list in order: each group is one, and the loose options between groups are
 * one each, so a divider stands before every section but the first.
 */
function sectionsOf<T extends string>(
  options: readonly (SelectOption<T> | SelectGroup<T>)[],
): { sections: Section<T>[]; rows: Row<T>[] } {
  const sections: Section<T>[] = [];
  const rows: Row<T>[] = [];
  let loose: Section<T> | null = null;
  const add = (section: Section<T>, option: SelectOption<T>) => {
    const row = { option, index: rows.length };
    rows.push(row);
    section.rows.push(row);
  };
  for (const entry of options) {
    if (isGroup(entry)) {
      loose = null;
      const section: Section<T> =
        entry.heading === undefined ? { rows: [] } : { heading: entry.heading, rows: [] };
      for (const option of entry.options) add(section, option);
      if (section.rows.length > 0) sections.push(section);
      continue;
    }
    if (loose === null) {
      loose = { rows: [] };
      sections.push(loose);
    }
    add(loose, entry);
  }
  return { sections, rows };
}

/** Lower case, whitespace collapsed: how type ahead compares labels. */
function folded(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** A key that types a character: one character and no modifier but Shift. */
function isPrintable(event: ReactKeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  control,
  size = 'field',
  tip,
  disabled = false,
  placeholder,
  name,
  autoFocus,
  onBlur,
  className,
  id,
}: SelectProps<T>): JSX.Element {
  const base = useId();
  const triggerId = id ?? `${base}trigger`;
  const listId = `${base}list`;
  const optionId = (index: number) => `${base}option-${index}`;

  const { sections, rows } = useMemo(() => sectionsOf(options), [options]);
  const enabled = useMemo(
    () => rows.filter((row) => row.option.disabled !== true).map((row) => row.index),
    [rows],
  );
  const chosen = rows.find((row) => row.option.value === value);

  const [open, setOpen] = useState(false);
  const [activeRaw, setActive] = useState(-1);
  /* a list whose options shrank while open has no active row past its end */
  const active = activeRaw < rows.length ? activeRaw : -1;
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  /* the trigger holds the DOM focus. A trigger that becomes disabled while it holds the focus (the
     write its own choice started: Share's fields and the inspector's fields take `disabled` while
     the write runs) keeps the focus: the HTML attribute would drop it to the page body, where the
     editor's keys act on the slide behind the field (the keyboard verifier's pass 1 on the round,
     finding 1: Tab selected objects, Delete removed a table). It stays focusable with
     `aria-disabled`, takes no key and no click, and takes the attribute once the focus leaves. */
  const [focused, setFocused] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ buffer: '', at: 0 });
  /* a press on the label around the trigger closed the list; the label's click on its control
     that follows must not open it again */
  const labelPressAt = useRef(0);

  const placed = usePlate(list, {
    layer: 'popover',
    anchor: open ? trigger : null,
    open,
    side: 'below',
    align: 'start',
    gap: LIST_GAP,
    fit: true,
    matchWidth: true,
    maxHeight: SELECT_MAX_HEIGHT,
  });

  /** The option a list opens on: the chosen one when it is enabled, else the first enabled. */
  const startIndex = (): number =>
    chosen !== undefined && chosen.option.disabled !== true ? chosen.index : (enabled[0] ?? -1);

  const openAt = (index: number) => {
    /* the trigger's plate leaves, and the row that lands under a resting pointer draws none */
    hideTooltipUntilInput();
    setActive(index);
    setOpen(true);
  };

  /**
   * Chooses a row: the list closes first and the trigger keeps the focus, then onChange runs in
   * the same event when the value is new (3.5). A disabled or absent row chooses nothing. With
   * `settle`, the change's render is committed before choose returns, so the caller reads where
   * the focus went (the Tab rule of 3.3). Returns true when onChange ran.
   */
  const choose = (index: number, settle = false): boolean => {
    const row = rows[index];
    const wasOpen = open;
    if (wasOpen) {
      flushSync(() => setOpen(false));
      if (trigger !== null && document.activeElement !== trigger)
        trigger.focus({ preventScroll: true });
    }
    if (row === undefined || row.option.disabled === true) return false;
    if (row.option.value === value) return false;
    const next = row.option.value;
    if (settle) flushSync(() => onChange(next));
    else onChange(next);
    return true;
  };

  /** The latest render's choose and setActive, for the list's own listeners bound once. */
  const latest = useRef({ choose, setActive, rows });
  latest.current = { choose, setActive, rows };

  /**
   * Type ahead (3.3): letters within a second join; one letter, or the same letter again, moves to
   * the next enabled option after `from` that starts with it; more letters search from `from`.
   */
  const typeAhead = (char: string, from: number): number | undefined => {
    const now = Date.now();
    const live = now - typed.current.at < TYPE_AHEAD_MS;
    const buffer = (live ? typed.current.buffer : '') + char.toLocaleLowerCase();
    typed.current = { buffer, at: now };
    const repeated = buffer.length > 1 && [...buffer].every((each) => each === buffer[0]);
    const search = repeated ? buffer.charAt(0) : buffer;
    const at = enabled.indexOf(from);
    const startAt = search.length === 1 ? at + 1 : Math.max(at, 0);
    const order = [...enabled.slice(startAt), ...enabled.slice(0, startAt)];
    return order.find((index) => folded(rows[index]?.option.label ?? '').startsWith(search));
  };

  const typing = (): boolean =>
    typed.current.buffer !== '' && Date.now() - typed.current.at < TYPE_AHEAD_MS;

  /** The enabled option `step` places after the active one, held at the first and the last. */
  const moved = (step: number): number => {
    if (enabled.length === 0) return -1;
    const at = enabled.indexOf(active);
    if (at < 0) return step > 0 ? (enabled[0] ?? -1) : (enabled.at(-1) ?? -1);
    const next = Math.min(enabled.length - 1, Math.max(0, at + step));
    return enabled[next] ?? -1;
  };

  /* closing by any road: a disabled trigger closes its list */
  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  /* while open: a press outside closes with no change and goes on to what it hit (the menus'
     rule, question 6); a scroll of anything that holds the trigger closes it, as the system popup
     does (question 7; the list's own scroll does not count), once the trigger has moved since the
     list opened: a browser dispatches a scroll event at its next frame, so the scroll that brought
     a clipped trigger into view on the press that opened it (the focus scroll of a mousedown, a
     driver's scroll into view) arrives after the open, and closed the list it had just drawn (read
     on the Format options panel at 1440: the first click on a trigger below the fold); the window
     losing focus closes it */
  useEffect(() => {
    if (!open || trigger === null) return undefined;
    const opened = trigger.getBoundingClientRect();
    const onDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (list.current?.contains(target) || trigger?.contains(target)) return;
      const element = target instanceof Element ? target : target.parentElement;
      const wrapping = element?.closest('label');
      if (wrapping != null && trigger !== null && wrapping.contains(trigger))
        labelPressAt.current = Date.now();
      setOpen(false);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (list.current?.contains(target)) return;
      if (target !== document && !target.contains(trigger)) return;
      const now = trigger.getBoundingClientRect();
      if (Math.abs(now.top - opened.top) > 0.5 || Math.abs(now.left - opened.left) > 0.5)
        setOpen(false);
    };
    const onWindowBlur = () => setOpen(false);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [open, trigger]);

  /* The list's own pointer: bound natively once, so its events stop at the list before React's
     root sees them (3.4). A press keeps the focus on the trigger and a popover that closes on blur
     open; a click chooses and is cancelled, so a label around the dropdown does not click the
     trigger again; the pointer's movement over a row makes it the active option; an entry cancels
     the plate a tooltip anchor around the dropdown scheduled, and the movement never reaches it. */
  useEffect(() => {
    const element = list.current;
    if (element === null) return undefined;
    const rowOf = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>('[role="option"]') : null;
    const indexOf = (row: HTMLElement): number => Number(row.dataset.index ?? -1);
    const onPress = (event: Event) => {
      event.stopPropagation();
      if (event.type === 'mousedown') event.preventDefault();
    };
    const onOver = (event: Event) => {
      event.stopPropagation();
      hideTooltip();
    };
    const onMove = (event: MouseEvent) => {
      event.stopPropagation();
      if (event.movementX === 0 && event.movementY === 0) return;
      const row = rowOf(event.target);
      if (row === null || row.getAttribute('aria-disabled') === 'true') return;
      latest.current.setActive(indexOf(row));
    };
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const row = rowOf(event.target);
      if (row === null || row.getAttribute('aria-disabled') === 'true') return;
      latest.current.choose(indexOf(row));
    };
    element.addEventListener('pointerdown', onPress);
    element.addEventListener('mousedown', onPress);
    element.addEventListener('mouseover', onOver);
    element.addEventListener('mousemove', onMove);
    element.addEventListener('click', onClick);
    return () => {
      element.removeEventListener('pointerdown', onPress);
      element.removeEventListener('mousedown', onPress);
      element.removeEventListener('mouseover', onOver);
      element.removeEventListener('mousemove', onMove);
      element.removeEventListener('click', onClick);
    };
  }, []);

  /* the active option stays in view inside the list's own scroll (never scrollIntoView, which
     may scroll the panel under the trigger and close the list) */
  useLayoutEffect(() => {
    const element = list.current;
    if (!open || placed === null || element === null || active < 0) return;
    const row = element.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (row === null) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < element.scrollTop) element.scrollTop = top - 4;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight + 4;
  }, [open, placed, active]);

  const tipAnchor = tipProps(tip ?? { name: label });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    tipAnchor.onKeyDown(event);
    if (disabled) return;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const { key, altKey } = event;
    if (!open) {
      switch (key) {
        case 'ArrowDown':
        case 'Enter':
        case ' ':
          handled();
          openAt(startIndex());
          return;
        case 'ArrowUp':
          if (altKey) return;
          handled();
          openAt(startIndex());
          return;
        case 'Home':
          handled();
          openAt(enabled[0] ?? -1);
          return;
        case 'End':
          handled();
          openAt(enabled.at(-1) ?? -1);
          return;
        default:
          break;
      }
      if (isPrintable(event) && key !== ' ') {
        handled();
        const from = startIndex();
        openAt(typeAhead(key, from) ?? from);
      }
      return;
    }
    switch (key) {
      case 'ArrowDown':
        handled();
        setActive(moved(1));
        return;
      case 'ArrowUp':
        handled();
        if (altKey) choose(active);
        else setActive(moved(-1));
        return;
      case 'Home':
        handled();
        setActive(enabled[0] ?? -1);
        return;
      case 'End':
        handled();
        setActive(enabled.at(-1) ?? -1);
        return;
      case 'PageDown':
        handled();
        setActive(moved(SELECT_PAGE));
        return;
      case 'PageUp':
        handled();
        setActive(moved(-SELECT_PAGE));
        return;
      case 'Enter':
        handled();
        choose(active);
        return;
      case ' ':
        handled();
        /* a space inside the typing buffer joins the letters ("Anyone w") instead of choosing */
        if (typing()) {
          const match = typeAhead(' ', active);
          if (match !== undefined) setActive(match);
          return;
        }
        choose(active);
        return;
      case 'Escape':
        handled();
        setOpen(false);
        return;
      case 'Tab':
        /* chooses and lets the focus move on: a dialog's Tab trap still sees the key. A choice
           that moved the focus itself keeps it where it went: Share's Add expiration draws the
           expiry field, which takes the focus as it mounts, and the Tab carried it past the field,
           whose blur hid it again (the keyboard verifier's pass 1, finding 6) */
        if (choose(active, true)) {
          const now = document.activeElement;
          if (now !== null && now !== trigger && now !== document.body) event.preventDefault();
        }
        return;
      default:
        break;
    }
    if (isPrintable(event)) {
      handled();
      const match = typeAhead(key, active);
      if (match !== undefined) setActive(match);
    }
  };

  /* Space activates a button on its keyup; the keydown above already opened or chose */
  const onKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ') event.preventDefault();
  };

  const onClick = () => {
    if (disabled) return;
    if (Date.now() - labelPressAt.current < LABEL_CLICK_MS) {
      labelPressAt.current = 0;
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    /* Safari does not focus a clicked button, and the keys must reach it */
    trigger?.focus({ preventScroll: true });
    openAt(startIndex());
  };

  const onTriggerFocus = (event: ReactFocusEvent<HTMLButtonElement>) => {
    tipAnchor.onFocus(event);
    setFocused(true);
  };

  const onTriggerBlur = (event: ReactFocusEvent<HTMLButtonElement>) => {
    tipAnchor.onBlur(event);
    setFocused(false);
    if (open) setOpen(false);
    onBlur?.();
  };

  /* while open the trigger and any tooltip anchor around it draw no plate over the rows */
  const onMouseEnter = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (open) {
      hideTooltip();
      return;
    }
    tipAnchor.onMouseEnter(event);
  };
  const onMouseMove = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (open) {
      event.stopPropagation();
      return;
    }
    tipAnchor.onMouseMove(event);
  };

  const shown = chosen?.option;
  const words = shown?.label ?? placeholder ?? '';

  return (
    <span className="ts-dropdown">
      <button
        ref={setTrigger}
        type="button"
        role="combobox"
        id={triggerId}
        className={cn(
          'ts-dropdown-trigger',
          size === 'compact' ? 'is-compact' : 'is-field',
          shown === undefined && 'is-placeholder',
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={label}
        data-control={control}
        value={value}
        disabled={disabled && !focused}
        aria-disabled={disabled ? true : undefined}
        autoFocus={autoFocus}
        data-tip={tipAnchor['data-tip']}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={tipAnchor.onMouseLeave}
        onMouseDown={tipAnchor.onMouseDown}
        onFocus={onTriggerFocus}
        onBlur={onTriggerBlur}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onClick={onClick}
      >
        <span className="ts-dropdown-value">
          {shown?.icon !== undefined ? (
            <span className="ts-dropdown-icon" aria-hidden="true">
              <Icon name={shown.icon} size={14} />
            </span>
          ) : null}
          {/* a placeholder is no value: a screen reader reads the field's name and an empty
              value, never "Add expiration" as the chosen one (the verifier's finding 4) */}
          <span
            className="ts-dropdown-text"
            aria-hidden={shown === undefined && words !== '' ? true : undefined}
          >
            {words}
          </span>
        </span>
        <span className="ts-dropdown-chevron" aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {/* named by the field's own label: an aria-labelledby on the trigger read the combobox's
          value ("Restricted") as the list's name, since a referenced combobox gives its value
          (the verifier's finding 3) */}
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-label={label}
        className="ts-dropdown-list pt-float"
        hidden={!open}
        style={open && placed === null ? { visibility: 'hidden' } : undefined}
      >
        {sections.map((section, at) => {
          const headingId = `${base}heading-${at}`;
          const body = section.rows.map(({ option, index }) => {
            const selected = option.value === value;
            const described = option.description !== undefined;
            /* a description is the option's description, never part of its name (finding 4) */
            return (
              <div
                key={`${index}:${option.value}`}
                id={optionId(index)}
                role="option"
                className={cn(
                  'ts-dropdown-option',
                  index === active && 'is-active',
                  described && 'has-description',
                )}
                aria-selected={selected}
                aria-disabled={option.disabled === true ? true : undefined}
                aria-labelledby={described ? `${optionId(index)}-label` : undefined}
                aria-describedby={described ? `${optionId(index)}-description` : undefined}
                data-index={index}
                data-value={option.value}
                data-control={control === undefined ? undefined : `${control}.${option.value}`}
                data-tip={option.label}
              >
                <span className="ts-menu-ic" aria-hidden="true">
                  {selected ? (
                    <span className="ts-menu-check">
                      <Icon name="check" />
                    </span>
                  ) : option.icon !== undefined ? (
                    <Icon name={option.icon} />
                  ) : null}
                </span>
                <span
                  className="ts-menu-label"
                  id={described ? `${optionId(index)}-label` : undefined}
                >
                  {option.label}
                </span>
                {described ? (
                  <span className="ts-dropdown-description" id={`${optionId(index)}-description`}>
                    {option.description}
                  </span>
                ) : null}
              </div>
            );
          });
          /* a separator is no child a listbox may own, so a divider is drawn and hidden from the
             tree. A section with a heading is a group named by it; rows with no heading are the
             listbox's own (a group with no name is announced as an empty group, the verifier's
             finding 4: the first group of the Link dialog and of the person row) */
          const divider = at > 0 ? <div className="ts-menu-divider" aria-hidden="true" /> : null;
          if (section.heading === undefined)
            return (
              <Fragment key={`section-${at}`}>
                {divider}
                {body}
              </Fragment>
            );
          return (
            <div
              key={`section-${at}`}
              role="group"
              className="ts-dropdown-group"
              aria-labelledby={headingId}
            >
              {divider}
              <div id={headingId} className="ts-dropdown-heading" aria-hidden="true">
                {section.heading}
              </div>
              {body}
            </div>
          );
        })}
      </div>
      {name !== undefined ? <input type="hidden" name={name} value={value} /> : null}
    </span>
  );
}

/* the viewer's slot takes this component (select-slot.ts, DROPDOWNS.md 3.13): a change to either
   props type that breaks the fit fails here */
const fitsSlot: ComponentType<SelectSlotProps> = Select;
void fitsSlot;
