// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenu } from '../ContextMenu';
import { Menu } from '../Menu';
import type { MenuContext } from '../menus/model.ts';
import { DEFAULT_MENU_CONTEXT, MENUS } from '../menus/model.ts';
import { hideTooltip } from '../Tooltip';

// Every menu renders through a portal into document.body (Menu.tsx; docs/FOCUS.md 6.4
// `lines.context.line`; VERIFICATION C2-F11): a right click menu mounted under the stage was
// painted inside the stage's stacking context (`.pt-stagewrap` carries a view-transition-name),
// so the notes slot, a later sibling at z-index 5, covered the rows that ran past the stage's
// bottom edge and Line end could not be hovered. These tests pin the portal and the behaviour
// that must survive it: the outside press and Escape still close the menu, and the rows are
// still found by role and by control id.

const LINE: MenuContext = {
  ...DEFAULT_MENU_CONTEXT,
  focus: 'canvas',
  settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
  selection: { ...DEFAULT_MENU_CONTEXT.selection, blocks: 1, block: 'line' },
};

/** A stage stand in: a positioned, clipped box with its own stacking context, as the real one. */
function mountStage(): HTMLElement {
  const stage = document.createElement('div');
  stage.id = 'stage';
  stage.className = 'pt-stagewrap';
  stage.style.position = 'relative';
  stage.style.overflow = 'hidden';
  stage.style.isolation = 'isolate';
  const line = document.createElement('div');
  line.id = 'line';
  line.tabIndex = 0;
  stage.appendChild(line);
  document.body.appendChild(stage);
  return stage;
}

describe('the menu portal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    cleanup();
    hideTooltip();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders a right click menu opened under the stage into document.body, outside the stage', () => {
    const stage = mountStage();
    render(
      <ContextMenu
        target="line"
        context={LINE}
        anchor={{ x: 400, y: 323 }}
        returnFocusTo={document.getElementById('line')}
        onSelect={() => undefined}
        onClose={() => undefined}
        id="ts-menu-canvas"
      />,
      { container: stage },
    );
    const menu = screen.getByRole('menu', { name: 'Line menu' });
    const root = menu.closest('.ts-menu-root');
    expect(root).not.toBeNull();
    expect(root?.parentElement).toBe(document.body);
    expect(stage.contains(menu)).toBe(false);
    /* the rows the walk reads are still there, by control id, Line end among them */
    expect(
      document.querySelector('[data-control="menu.format.bordersLines.lineEnd"]'),
    ).not.toBeNull();
    expect(
      document
        .querySelector('[data-control="menu.format.bordersLines.lineEnd"]')
        ?.getAttribute('aria-disabled'),
    ).toBeNull();
  });

  it('keeps the outside press and Escape closing a portaled menu', () => {
    const stage = mountStage();
    const onClose = vi.fn();
    render(
      <ContextMenu
        target="line"
        context={LINE}
        anchor={{ x: 400, y: 323 }}
        returnFocusTo={document.getElementById('line')}
        onSelect={() => undefined}
        onClose={onClose}
        id="ts-menu-canvas"
      />,
      { container: stage },
    );
    /* a press inside the menu closes nothing */
    fireEvent.mouseDown(screen.getByRole('menu', { name: 'Line menu' }));
    expect(onClose).not.toHaveBeenCalled();
    /* a press on the stage, outside the menu, closes it */
    fireEvent.mouseDown(stage);
    expect(onClose).toHaveBeenCalledWith('outside');
    onClose.mockClear();
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledWith('escape');
  });

  it('renders a bar menu into document.body with its id, so #ts-menu-<id> reads stay valid', () => {
    const nav = document.createElement('nav');
    nav.className = 'ts-menubar';
    document.body.appendChild(nav);
    const title = document.createElement('button');
    title.textContent = 'File';
    nav.appendChild(title);
    const file = MENUS.find((menu) => menu.id === 'file');
    expect(file).toBeDefined();
    render(
      <Menu
        items={file?.items ?? []}
        context={DEFAULT_MENU_CONTEXT}
        label="File menu"
        anchor={{ kind: 'element', element: title }}
        placement="below"
        autoFocus={false}
        onSelect={() => undefined}
        onClose={() => undefined}
        id="ts-menu-file"
      />,
      { container: nav },
    );
    const menu = document.getElementById('ts-menu-file');
    expect(menu).not.toBeNull();
    expect(nav.contains(menu)).toBe(false);
    expect(menu?.closest('.ts-menu-root')?.parentElement).toBe(document.body);
    expect(document.querySelector('#ts-menu-file [data-control="menu.file.print"]')).not.toBeNull();
  });
});
