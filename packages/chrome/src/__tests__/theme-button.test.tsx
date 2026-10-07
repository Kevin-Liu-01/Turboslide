// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeButton } from '../ThemeButton';

// The shared theme button from the first paint (docs/POLISH-2.md 3.3, P2-N#2): the markup carries
// both half discs and CSS shows the one `html[data-theme]` names, so the server's HTML draws the
// right glyph before any script runs; the icon button's name is "Dark or light" for every visitor
// and the labelled button's is its visible word.

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

const glyphs = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>('.pt-theme-glyph')].map((el) => ({
    cls: el.className,
    text: el.textContent,
    hidden: el.getAttribute('aria-hidden'),
  }));

const BOTH = [
  { cls: 'pt-theme-glyph is-light', text: '◐', hidden: 'true' },
  { cls: 'pt-theme-glyph is-dark', text: '◑', hidden: 'true' },
];

describe('ThemeButton', () => {
  it("renders both glyphs and the icon button's name in the server's markup", () => {
    const html = renderToStaticMarkup(<ThemeButton className="ts-product-nav-icon" />);
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(glyphs(host)).toEqual(BOTH);
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Dark or light');
    expect(button.getAttribute('data-tip')).toBe('Dark or light');
    expect(button.getAttribute('data-control')).toBe('view.theme');
  });

  it('keeps the same markup across presses, while html[data-theme] flips', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeButton className="ts-product-nav-icon" />);
    const button = screen.getByRole('button', { name: 'Dark or light' });
    fireEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(glyphs(button)).toEqual(BOTH);
    expect(button.getAttribute('aria-label')).toBe('Dark or light');
    fireEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(glyphs(button)).toEqual(BOTH);
  });

  it('names the labelled button by its visible word, which also holds while the toolbar hides it', () => {
    render(<ThemeButton className="pt-theme" label />);
    const button = screen.getByRole('button', { name: 'Theme' });
    expect(button.querySelector('.pt-lb')?.textContent).toBe('Theme');
    expect(button.getAttribute('data-tip')).toBe('Theme');
    expect(glyphs(button)).toEqual(BOTH);
  });

  it('shows the glyph html[data-theme] names, in CSS only', () => {
    const sheet = join(dirname(fileURLToPath(import.meta.url)), '..', 'ToolButton.css');
    const css = readFileSync(sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /([^{}]+)\{\s*display:\s*none;\s*\}/g;
    const hides = [...css.matchAll(rule)].map((m) =>
      m[1]!
        .split(',')
        .map((s) => s.trim().replace(/"/g, "'"))
        .sort(),
    );
    expect(hides).toContainEqual([
      ":root:not([data-theme='dark']) .pt-theme-glyph.is-dark",
      ":root[data-theme='dark'] .pt-theme-glyph.is-light",
    ]);
  });
});
