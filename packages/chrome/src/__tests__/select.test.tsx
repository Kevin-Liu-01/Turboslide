// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectSlotProps } from '@turboslide/viewer/select-slot';

import { openLayers, resetLayersForTests } from '../Layer';
import type { PlaceOptions } from '../place';
import { SELECT_MAX_HEIGHT, Select } from '../Select';
import type { SelectGroup, SelectOption, SelectProps } from '../Select';
import { TIP_DELAY_MS, TIP_ID, hideTooltip, resetTooltipTiming, tipProps } from '../Tooltip';
import { chooseOption } from './choose-option';

// The shared dropdown (docs/DROPDOWNS.md 3, DD-C#1): the APG select-only combobox's keys, type
// ahead with its one second buffer, disabled rows skipped, the change semantics of 3.5, the
// pointer with the outside press and the click inside a label, no tooltip plate from an ancestor
// over the rows, the hidden input, the server render, the ARIA of 3.2, the options it hands
// place() and the layer it opens in over a dialog, and the viewer slot's type. jsdom lays nothing
// out and has no Popover API, so the layer reads come from Layer.ts's own record.

const placed = vi.hoisted(() => ({ calls: [] as PlaceOptions[] }));
vi.mock('../place', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../place')>();
  return {
    ...actual,
    place: (...args: Parameters<typeof actual.place>) => {
      placed.calls.push(args[2] ?? {});
      return actual.place(...args);
    },
  };
});

const POSITIONS: SelectOption[] = [
  { value: '', label: 'None' },
  { value: 'next', label: 'Next slide' },
  { value: 'previous', label: 'Previous slide' },
  { value: 'first', label: 'First slide' },
  { value: 'last', label: 'Last slide' },
];
const SLIDES: SelectGroup = {
  heading: 'Slides',
  options: Array.from({ length: 12 }, (_, i) => ({ value: `s${i + 1}`, label: `${i + 1}. Slide` })),
};
const LINK = [...POSITIONS, SLIDES];

function Harness({
  initial = '',
  options = LINK,
  onChange,
  ...rest
}: {
  initial?: string;
  options?: SelectProps['options'];
  onChange?: (value: string) => void;
} & Partial<Omit<SelectProps, 'value' | 'options' | 'onChange'>>) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      label="Slide"
      control="t.slide"
      {...rest}
      value={value}
      options={options}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

const trigger = () => screen.getByRole('combobox') as HTMLButtonElement;
const list = () => document.getElementById(trigger().getAttribute('aria-controls') ?? '')!;
const option = (value: string) =>
  list().querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)!;
const activeValue = () => {
  const id = trigger().getAttribute('aria-activedescendant');
  return id === null ? null : (document.getElementById(id)?.dataset.value ?? null);
};
const isOpen = () => trigger().getAttribute('aria-expanded') === 'true';
const key = (name: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(trigger(), { key: name, ...init });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  placed.calls.length = 0;
});

afterEach(() => {
  hideTooltip();
  resetTooltipTiming();
  cleanup();
  resetLayersForTests();
  vi.useRealTimers();
});

describe('the DOM and its ARIA (3.2)', () => {
  it('draws a combobox button with a hidden listbox right after it, labelled by the trigger', () => {
    render(<Harness initial="next" />);
    const button = trigger();
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.hasAttribute('aria-activedescendant')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Slide');
    expect(button.dataset.control).toBe('t.slide');
    expect(button.value).toBe('next');
    expect(button.getAttribute('data-tip')).toBe('Slide');
    expect(button.className).toContain('ts-dropdown-trigger');
    expect(button.className).toContain('is-field');
    expect(button.textContent).toBe('Next slide');
    const box = list();
    expect(box.getAttribute('role')).toBe('listbox');
    expect(box.hidden).toBe(true);
    expect(box.getAttribute('aria-labelledby')).toBe(button.id);
    expect(button.nextElementSibling).toBe(box);
    expect(box.classList.contains('ts-menu')).toBe(false);
    expect(screen.getAllByLabelText('Slide')).toEqual([button]);
  });

  it('marks every option with its value, control, tip and selection, the chosen one alone selected with the check', () => {
    render(<Harness initial="previous" />);
    const rows = Array.from(list().querySelectorAll<HTMLElement>('[role="option"]'));
    expect(rows).toHaveLength(17);
    expect(rows.filter((row) => row.getAttribute('aria-selected') === 'true')).toEqual([
      option('previous'),
    ]);
    expect(rows.filter((row) => row.getAttribute('aria-selected') === 'false')).toHaveLength(16);
    expect(option('previous').dataset.control).toBe('t.slide.previous');
    expect(option('previous').getAttribute('data-tip')).toBe('Previous slide');
    expect(option('previous').querySelector('.ts-menu-check svg')).not.toBeNull();
    expect(option('next').querySelector('.ts-menu-check')).toBeNull();
    for (const row of rows) expect(row.id).not.toBe('');
  });

  it('draws a group with its heading as its name and a divider before it', () => {
    render(<Harness />);
    const group = list().querySelectorAll('[role="group"]')[1] as HTMLElement;
    const heading = document.getElementById(group.getAttribute('aria-labelledby') ?? '');
    expect(heading?.textContent).toBe('Slides');
    expect(group.querySelector('.ts-menu-divider')?.getAttribute('aria-hidden')).toBe('true');
    expect(group.querySelectorAll('[role="option"]')).toHaveLength(12);
    expect(list().querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it('shows the placeholder while no option carries the value, and the compact size', () => {
    render(<Harness initial="gone" placeholder="Slides in this presentation" size="compact" />);
    expect(trigger().textContent).toBe('Slides in this presentation');
    expect(trigger().className).toContain('is-placeholder');
    expect(trigger().className).toContain('is-compact');
    expect(list().querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('carries the value in a hidden input of its name for a form', () => {
    const view = render(
      <form>
        <Harness initial="first" name="role" />
      </form>,
    );
    const input = view.container.querySelector<HTMLInputElement>('input[type="hidden"]');
    expect(input?.name).toBe('role');
    expect(input?.value).toBe('first');
    chooseOption('t.slide', 'last');
    expect(input?.value).toBe('last');
  });

  it('renders on the server with no select, no window and stable ids', () => {
    const html = renderToString(<Harness initial="next" name="role" />);
    const parsed = document.createElement('template');
    parsed.innerHTML = html;
    expect(parsed.content.querySelector('select')).toBeNull();
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html).toMatch(/<div[^>]*role="listbox"[^>]*hidden=""/);
    expect(html).toContain('type="hidden" name="role" value="next"');
    expect(renderToString(<Harness initial="next" name="role" />)).toBe(html);
  });
});

describe('the keyboard (3.3)', () => {
  it('opens on Down, Enter, Space, Alt+Down and Up with the chosen option active, and every key it takes is prevented', () => {
    render(<Harness initial="first" />);
    for (const [name, init] of [
      ['ArrowDown', {}],
      ['Enter', {}],
      [' ', {}],
      ['ArrowDown', { altKey: true }],
      ['ArrowUp', {}],
    ] as const) {
      expect(key(name, init)).toBe(false);
      expect(isOpen()).toBe(true);
      expect(activeValue()).toBe('first');
      expect(list().hidden).toBe(false);
      expect(key('Escape')).toBe(false);
      expect(isOpen()).toBe(false);
      expect(trigger().hasAttribute('aria-activedescendant')).toBe(false);
    }
  });

  it('opens on Home and End at the first and last enabled option; Alt+Up and PageDown do nothing while closed', () => {
    render(<Harness initial="first" />);
    key('Home');
    expect(activeValue()).toBe('');
    key('Escape');
    key('End');
    expect(activeValue()).toBe('s12');
    key('Escape');
    expect(key('ArrowUp', { altKey: true })).toBe(true);
    expect(key('PageDown')).toBe(true);
    expect(isOpen()).toBe(false);
  });

  it('moves with Down and Up held at the ends, Home, End, PageDown and PageUp by ten', () => {
    render(<Harness />);
    key('ArrowDown');
    expect(activeValue()).toBe('');
    key('ArrowUp');
    expect(activeValue()).toBe('');
    key('ArrowDown');
    key('ArrowDown');
    expect(activeValue()).toBe('previous');
    key('End');
    expect(activeValue()).toBe('s12');
    key('ArrowDown');
    expect(activeValue()).toBe('s12');
    key('Home');
    key('PageDown');
    expect(activeValue()).toBe('s6');
    key('PageDown');
    expect(activeValue()).toBe('s12');
    key('PageUp');
    expect(activeValue()).toBe('s2');
    key('PageUp');
    expect(activeValue()).toBe('');
    expect(document.activeElement === trigger() || document.activeElement === document.body).toBe(
      true,
    );
  });

  it('skips disabled options with the arrows, Home, End and type ahead', () => {
    const options: SelectOption[] = [
      { value: 'a', label: 'Alpha', disabled: true },
      { value: 'b', label: 'Bravo' },
      { value: 'h', label: 'Handout', disabled: true },
      { value: 'c', label: 'Charlie' },
      { value: 'z', label: 'Zulu', disabled: true },
    ];
    render(<Harness initial="b" options={options} />);
    key('Home');
    expect(activeValue()).toBe('b');
    key('ArrowDown');
    expect(activeValue()).toBe('c');
    key('End');
    expect(activeValue()).toBe('c');
    key('h');
    expect(activeValue()).toBe('c');
    expect(option('h').getAttribute('aria-disabled')).toBe('true');
  });

  it('chooses with Enter, Space and Alt+Up, closing first and calling onChange once with the value', () => {
    const changes: string[] = [];
    render(<Harness onChange={(value) => changes.push(value)} />);
    key('Enter');
    key('ArrowDown');
    key('Enter');
    expect(isOpen()).toBe(false);
    expect(trigger().value).toBe('next');
    key(' ');
    key('ArrowDown');
    key(' ');
    expect(trigger().value).toBe('previous');
    key('ArrowDown', { altKey: true });
    key('ArrowDown');
    expect(key('ArrowUp', { altKey: true })).toBe(false);
    expect(isOpen()).toBe(false);
    expect(changes).toEqual(['next', 'previous', 'first']);
  });

  it('closes with no change on Escape, and the key goes no further while open; a closed one passes it on', () => {
    const changes: string[] = [];
    const parent = vi.fn();
    render(
      <div onKeyDown={(event) => parent(event.key)}>
        <Harness initial="next" onChange={(value) => changes.push(value)} />
      </div>,
    );
    key('ArrowDown');
    key('ArrowDown');
    key('Escape');
    expect(isOpen()).toBe(false);
    expect(trigger().value).toBe('next');
    expect(parent).not.toHaveBeenCalled();
    expect(key('Escape')).toBe(true);
    expect(parent).toHaveBeenCalledWith('Escape');
    expect(changes).toEqual([]);
  });

  it('chooses the active option on Tab and lets the key move on', () => {
    const changes: string[] = [];
    const parent = vi.fn();
    render(
      <div onKeyDown={(event) => parent(event.key)}>
        <Harness onChange={(value) => changes.push(value)} />
      </div>,
    );
    key('ArrowDown');
    key('End');
    expect(key('Tab')).toBe(true);
    expect(parent).toHaveBeenCalledWith('Tab');
    expect(isOpen()).toBe(false);
    expect(changes).toEqual(['s12']);
    expect(key('Tab', { shiftKey: true })).toBe(true);
    expect(changes).toEqual(['s12']);
  });

  it('keeps the focus where a choice by Tab put it: the field the choice drew takes it and the Tab stops there', () => {
    function Opener() {
      const [value, setValue] = useState('viewer');
      const [expiring, setExpiring] = useState(false);
      return (
        <div>
          <Select
            label="Role"
            control="t.role"
            value={value}
            options={[
              { value: 'viewer', label: 'Viewer' },
              { value: 'editor', label: 'Editor' },
              { value: 'expiry', label: 'Add expiration' },
            ]}
            onChange={(next) => {
              if (next === 'expiry') setExpiring(true);
              else setValue(next);
            }}
          />
          {expiring ? (
            <Select
              label="Add expiration"
              control="t.expiry"
              value=""
              placeholder="Add expiration"
              autoFocus
              options={[{ value: '7', label: '7 days' }]}
              onChange={() => setExpiring(false)}
              onBlur={() => setExpiring(false)}
            />
          ) : null}
          <button type="button">Next</button>
        </div>
      );
    }
    render(<Opener />);
    const role = screen.getByRole('combobox', { name: 'Role' });
    act(() => role.focus());
    fireEvent.keyDown(role, { key: 'ArrowDown' });
    fireEvent.keyDown(role, { key: 'End' });
    /* the Tab chooses Add expiration; the expiry field mounts focused and keeps the focus */
    expect(fireEvent.keyDown(role, { key: 'Tab' })).toBe(false);
    const expiry = screen.getByRole('combobox', { name: 'Add expiration' });
    expect(document.activeElement).toBe(expiry);
    /* a Tab choice that leaves the focus on the trigger lets the key move on */
    act(() => role.focus());
    expect(screen.queryByRole('combobox', { name: 'Add expiration' })).toBeNull();
    fireEvent.keyDown(role, { key: 'ArrowDown' });
    fireEvent.keyDown(role, { key: 'ArrowDown' });
    expect(fireEvent.keyDown(role, { key: 'Tab' })).toBe(true);
    expect(role.getAttribute('value')).toBe('editor');
  });

  it('never calls onChange for the value it already has', () => {
    const onChange = vi.fn();
    render(<Harness initial="next" onChange={onChange} />);
    key('Enter');
    key('Enter');
    key(' ');
    key('Tab');
    fireEvent.click(trigger());
    fireEvent.click(option('next'));
    expect(onChange).not.toHaveBeenCalled();
    expect(isOpen()).toBe(false);
  });
});

describe('the focus through a write (the keyboard verifier, finding 1)', () => {
  function Writer() {
    const [value, setValue] = useState('restricted');
    const [busy, setBusy] = useState(false);
    return (
      <>
        <Select
          label="General access"
          control="t.mode"
          value={value}
          disabled={busy}
          options={[
            { value: 'restricted', label: 'Restricted' },
            { value: 'link', label: 'Anyone with the link' },
          ]}
          onChange={(next) => {
            setBusy(true);
            setValue(next);
          }}
        />
        <button type="button" onClick={() => setBusy(false)}>
          Settle
        </button>
      </>
    );
  }

  it('keeps the focus on a trigger disabled while it holds it, takes no key or click, and takes the attribute once the focus leaves', () => {
    render(<Writer />);
    const mode = screen.getByRole('combobox', { name: 'General access' }) as HTMLButtonElement;
    act(() => mode.focus());
    fireEvent.keyDown(mode, { key: 'ArrowDown' });
    fireEvent.keyDown(mode, { key: 'ArrowDown' });
    fireEvent.keyDown(mode, { key: 'Enter' });
    expect(mode.value).toBe('link');
    /* the write runs: focusable, aria-disabled, never the attribute that drops the focus */
    expect(document.activeElement).toBe(mode);
    expect(mode.disabled).toBe(false);
    expect(mode.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(mode, { key: 'ArrowDown' });
    fireEvent.keyDown(mode, { key: 'r' });
    fireEvent.click(mode);
    expect(mode.getAttribute('aria-expanded')).toBe('false');
    expect(mode.value).toBe('link');
    /* the focus leaves while the write runs: the attribute */
    act(() => mode.blur());
    expect(mode.disabled).toBe(true);
    /* the write settles: enabled again */
    fireEvent.click(screen.getByText('Settle'));
    expect(mode.disabled).toBe(false);
    expect(mode.hasAttribute('aria-disabled')).toBe(false);
  });

  it('keeps the focus through a write the pointer started, and draws a trigger disabled from the start with the attribute', () => {
    render(
      <>
        <Writer />
        <Select
          label="Locked"
          value="a"
          disabled
          options={[{ value: 'a', label: 'A' }]}
          onChange={() => {}}
        />
      </>,
    );
    const mode = screen.getByRole('combobox', { name: 'General access' }) as HTMLButtonElement;
    fireEvent.click(mode);
    fireEvent.click(document.querySelector<HTMLElement>('[role="option"][data-value="link"]')!);
    expect(document.activeElement).toBe(mode);
    expect(mode.disabled).toBe(false);
    expect(mode.getAttribute('aria-disabled')).toBe('true');
    const locked = screen.getByRole('combobox', { name: 'Locked' }) as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    expect(locked.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('type ahead (3.3)', () => {
  it('opens on a letter at its first match, joins letters within a second, and repeats a letter to the next match', () => {
    render(<Harness />);
    key('l');
    expect(isOpen()).toBe(true);
    expect(activeValue()).toBe('last');
    key('Escape');
    vi.advanceTimersByTime(1100);
    key('ArrowDown');
    key('n');
    expect(activeValue()).toBe('next');
    key('n');
    expect(activeValue()).toBe('');
    vi.advanceTimersByTime(1100);
    key('p');
    key('r');
    expect(activeValue()).toBe('previous');
    vi.advanceTimersByTime(1100);
    key('f');
    expect(activeValue()).toBe('first');
    vi.advanceTimersByTime(1100);
    key('1');
    key('2');
    expect(activeValue()).toBe('s12');
  });

  it('starts a new search after a second and joins a space typed inside the buffer instead of choosing', () => {
    const onChange = vi.fn();
    const options: SelectOption[] = [
      { value: 'restricted', label: 'Restricted' },
      { value: 'office', label: 'Anyone at the office' },
      { value: 'link', label: 'Anyone with the link' },
    ];
    render(<Harness initial="restricted" options={options} onChange={onChange} />);
    for (const char of 'Anyone') key(char);
    expect(activeValue()).toBe('office');
    key(' ');
    expect(isOpen()).toBe(true);
    key('w');
    expect(activeValue()).toBe('link');
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1100);
    key('r');
    expect(activeValue()).toBe('restricted');
    vi.advanceTimersByTime(1100);
    key(' ');
    expect(isOpen()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the change semantics (3.5)', () => {
  it('runs onChange once, after the list closed and the trigger kept the focus, inside the event that chose', () => {
    const seen: Array<{
      value: string;
      open: boolean;
      hidden: boolean;
      focused: boolean;
      inEvent: boolean;
    }> = [];
    let inEvent = false;
    render(
      <Harness
        onChange={(value) =>
          seen.push({
            value,
            open: isOpen(),
            hidden: list().hidden === true,
            focused: document.activeElement === trigger(),
            inEvent,
          })
        }
      />,
    );
    fireEvent.click(trigger());
    expect(document.activeElement).toBe(trigger());
    const row = option('last');
    row.addEventListener('click', () => (inEvent = true), { capture: true });
    fireEvent.click(row);
    inEvent = false;
    expect(seen).toEqual([
      { value: 'last', open: false, hidden: true, focused: true, inEvent: true },
    ]);
  });

  it('chooses through a click on an option of a closed list in one call, as the window API does', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    option('s3').click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('s3');
    expect(isOpen()).toBe(false);
  });
});

describe('the pointer (3.4)', () => {
  it('opens on a click with the trigger focused, chooses a row, ignores a disabled row and closes from the open trigger', () => {
    const options: SelectOption[] = [
      { value: 'slides', label: 'Slides' },
      { value: 'notes', label: 'Slides with notes' },
      { value: 'handout', label: 'Handout, 3 slides', disabled: true },
    ];
    const onChange = vi.fn();
    render(<Harness initial="slides" options={options} onChange={onChange} />);
    fireEvent.click(trigger());
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(trigger());
    expect(fireEvent.mouseDown(option('notes'))).toBe(false);
    fireEvent.click(option('handout'));
    expect(isOpen()).toBe(true);
    fireEvent.click(trigger());
    expect(isOpen()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(trigger());
    fireEvent.click(option('notes'));
    expect(isOpen()).toBe(false);
    expect(onChange).toHaveBeenCalledWith('notes');
    expect(document.activeElement).toBe(trigger());
  });

  it('lights the row under a moving pointer as the active option', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.mouseMove(option('first'), { movementX: 2, movementY: 1 });
    expect(activeValue()).toBe('first');
    expect(option('first').classList.contains('is-active')).toBe(true);
    fireEvent.mouseMove(option('next'), { movementX: 0, movementY: 0 });
    expect(activeValue()).toBe('first');
  });

  it('closes with no change on a press outside, which goes on to what it hit', () => {
    const onChange = vi.fn();
    const outside = vi.fn();
    render(
      <div>
        <button type="button" onPointerDown={outside}>
          elsewhere
        </button>
        <Harness initial="next" onChange={onChange} />
      </div>,
    );
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByText('elsewhere'));
    expect(isOpen()).toBe(false);
    expect(outside).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger().value).toBe('next');
  });

  it('chooses inside a label without the label clicking the trigger again, and a press on the label closes it', () => {
    const onChange = vi.fn();
    render(
      <label>
        <span>Appearance</span>
        <Harness
          initial="light"
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={onChange}
        />
      </label>,
    );
    fireEvent.click(trigger());
    fireEvent.click(option('dark'));
    vi.advanceTimersByTime(500);
    expect(isOpen()).toBe(false);
    expect(trigger().value).toBe('dark');
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger());
    const words = screen.getByText('Appearance');
    fireEvent.pointerDown(words);
    fireEvent.click(words);
    expect(isOpen()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows no tooltip plate of an anchor around it while the pointer is over the rows', () => {
    render(
      <div>
        <span data-testid="outside">outside</span>
        <label {...tipProps({ name: 'Slide field', doc: 'Where the link goes' })}>
          <Harness />
        </label>
      </div>,
    );
    const arrive = (from: Element, to: Element, x: number) => {
      fireEvent.mouseMove(document.body, { clientX: x, clientY: 10 });
      fireEvent.mouseOut(from, { relatedTarget: to });
      fireEvent.mouseOver(to, { relatedTarget: from });
      fireEvent.mouseMove(to, { clientX: x + 1, clientY: 11 });
      act(() => {
        vi.advanceTimersByTime(TIP_DELAY_MS + 50);
      });
      const el = document.getElementById(TIP_ID);
      const shown = el !== null && !el.hidden;
      hideTooltip();
      return shown;
    };
    const outside = screen.getByTestId('outside');
    /* the anchor shows its plate when the pointer reaches it while the list is closed */
    expect(arrive(outside, trigger(), 40)).toBe(true);
    fireEvent.mouseOut(trigger(), { relatedTarget: outside });
    key('ArrowDown');
    expect(arrive(outside, option('first'), 80)).toBe(false);
    expect(arrive(outside, trigger(), 120)).toBe(false);
  });

  it('closes with no change when anything that holds the trigger scrolls it away, and stays open while its own list scrolls', () => {
    render(
      <div data-testid="panel" style={{ overflow: 'auto' }}>
        <Harness initial="next" />
      </div>,
    );
    /* jsdom lays nothing out: the trigger's box is stood in, and a scroll moves it */
    let top = 300;
    trigger().getBoundingClientRect = () =>
      ({
        x: 40,
        y: top,
        left: 40,
        top,
        right: 240,
        bottom: top + 32,
        width: 200,
        height: 32,
      }) as DOMRect;
    fireEvent.click(trigger());
    fireEvent.scroll(list());
    expect(isOpen()).toBe(true);
    top = 180;
    fireEvent.scroll(screen.getByTestId('panel'));
    expect(isOpen()).toBe(false);
    fireEvent.click(trigger());
    top = 60;
    fireEvent.scroll(document);
    expect(isOpen()).toBe(false);
    fireEvent.click(trigger());
    fireEvent.blur(window);
    expect(isOpen()).toBe(false);
    expect(trigger().value).toBe('next');
  });

  it('stays open through a scroll event that left its trigger where it opened (the late event of the scroll that brought it into view)', () => {
    render(
      <div data-testid="panel" style={{ overflow: 'auto' }}>
        <Harness initial="next" />
      </div>,
    );
    trigger().getBoundingClientRect = () =>
      ({
        x: 40,
        y: 120,
        left: 40,
        top: 120,
        right: 240,
        bottom: 152,
        width: 200,
        height: 32,
      }) as DOMRect;
    fireEvent.click(trigger());
    fireEvent.scroll(screen.getByTestId('panel'));
    fireEvent.scroll(document);
    expect(isOpen()).toBe(true);
    key('Escape');
  });
});

describe('placement and layer (3.6)', () => {
  it('hands place() the list under the trigger, its width, the fit and the ten row cap', async () => {
    render(<Harness />);
    fireEvent.click(trigger());
    await act(async () => {
      await Promise.resolve();
    });
    expect(placed.calls.at(-1)).toMatchObject({
      side: 'below',
      align: 'start',
      gap: 2,
      fit: true,
      matchWidth: true,
      maxHeight: SELECT_MAX_HEIGHT,
    });
    expect(SELECT_MAX_HEIGHT).toBe(288);
    expect(list().style.position).toBe('fixed');
  });

  it('opens its list in the popover layer, over a dialog that is open', () => {
    render(
      <div role="dialog" aria-modal="true" data-layer="dialog">
        <Harness />
      </div>,
    );
    fireEvent.click(trigger());
    expect(list().dataset.layer).toBe('popover');
    expect(list().style.zIndex).toBe('50');
    expect(openLayers().at(-1)?.element).toBe(list());
    key('Escape');
    expect(openLayers().some((entry) => entry.element === list())).toBe(false);
  });
});

describe('the viewer slot (3.13)', () => {
  it('takes the component as its type', () => {
    const slot: ComponentType<SelectSlotProps> = Select;
    expect(slot).toBe(Select);
  });
});
