// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Version } from '@turboslide/schema/mutations';

import type { IdentityView } from '../editor-shell';
import { PANELS } from '../menus/strings';
import { VersionsPanel } from '../VersionsPanel';

// The Version history panel of the people round (docs/archive/rounds/PEOPLE.md 3.2, 3.7, 3.19, 3.23, 3.24):
// Restore this version is the first row of a version's More menu and dispatches what the row's
// button dispatches, absent for the current version; a verified author's row carries the badge
// after the author word and a guest's the guest word; the stylesheet keeps the marks strip at its
// authors' width, the nested list's rule under the parent mark, the "+N" at 11 px, the hover on
// the window row and the Restore button off the grid.

const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

const VERSIONS: Version[] = [1, 2, 3].map((n) => ({
  n,
  revision: n,
  author: {
    kind: 'human',
    name: n === 1 ? 'Ada Lovelace' : n === 2 ? 'Maya' : 'Iron 200',
    principalId: n === 1 ? 'usr_ada' : n === 2 ? 'anon_maya' : 'anon_iron',
  },
  note: '',
  createdAt: new Date(Date.UTC(2026, 8, 10 + n, 12, 0)).toISOString(),
  mutations: [],
}));

const IDENTITIES: Record<string, IdentityView> = {
  usr_ada: {
    principalId: 'usr_ada',
    label: 'Cobalt 512',
    name: 'Ada Lovelace',
    trust: 'verified',
    kind: 'account',
  },
  anon_maya: {
    principalId: 'anon_maya',
    label: 'Titanium 471',
    name: 'Maya',
    trust: 'guest',
    kind: 'anonymous',
  },
  anon_iron: { principalId: 'anon_iron', label: 'Iron 200', trust: 'label', kind: 'anonymous' },
};

function mount(revision = 3) {
  const dispatch = vi.fn(() => Promise.resolve({}));
  render(
    <VersionsPanel
      versions={VERSIONS}
      revision={revision}
      dispatch={dispatch as never}
      history
      identities={IDENTITIES}
    />,
  );
  return dispatch;
}

function control(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-control="${id}"]`);
}

function row(n: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.ts-version[data-version="${n}"]`);
  if (el === null) throw new Error(`no row ${n}`);
  return el;
}

describe('Restore in the More menu', () => {
  it('lists Restore this version first and dispatches version.restore with the current revision', () => {
    const dispatch = mount();
    fireEvent.click(control('versionHistory.1.more')!);
    const items = [
      ...document.querySelectorAll<HTMLElement>('#ts-menu-version-more [role="menuitem"]'),
    ];
    expect(items[0]?.getAttribute('data-menu-item')).toBe('version.restore');
    expect(items[0]?.getAttribute('data-control')).toBe('menu.version.restore');
    expect(items[0]?.textContent).toContain(PANELS.versionHistory.restore);
    expect(items.map((each) => each.getAttribute('data-menu-item')).slice(0, 3)).toEqual([
      'version.restore',
      'version.name',
      'version.copy',
    ]);
    fireEvent.click(items[0]!);
    expect(dispatch).toHaveBeenCalledWith('version.restore', { n: 1, baseRevision: 3 });
  });

  it('offers no Restore row for the current version, whose row has no Restore button either', () => {
    mount();
    expect(control('versionHistory.3.restore')).toBeNull();
    expect(control('versionHistory.1.restore')).not.toBeNull();
    fireEvent.click(control('versionHistory.3.more')!);
    const ids = [
      ...document.querySelectorAll<HTMLElement>('#ts-menu-version-more [role="menuitem"]'),
    ].map((each) => each.getAttribute('data-menu-item'));
    expect(ids).not.toContain('version.restore');
    expect(ids[0]).toBe('version.name');
  });
});

describe('the author word and the badge', () => {
  it('draws the badge after a verified author and the guest word after a typed name, nothing after a label', () => {
    mount();
    const ada = row(1);
    expect(ada.querySelector('.ts-version-author')?.textContent).toBe('Ada Lovelace');
    expect(ada.querySelector('.ts-trust-mark')?.getAttribute('aria-label')).toBe('signed in');
    expect(ada.querySelector('.ts-chip')?.getAttribute('aria-label')).toBe(
      'Ada Lovelace, signed in',
    );
    const maya = row(2);
    expect(maya.querySelector('.ts-version-author')?.textContent).toBe('Maya · guest');
    expect(maya.querySelector('.ts-trust-mark')).toBeNull();
    const iron = row(3);
    expect(iron.querySelector('.ts-version-author')?.textContent).toBe('Iron 200');
    expect(iron.querySelector('.ts-trust-mark')).toBeNull();
    /* the badge sits outside the 140 px author span, so it never truncates with the name */
    expect(ada.querySelector('.ts-version-author .ts-trust-mark')).toBeNull();
    expect(ada.querySelector('.ts-version-meta .ts-trust-mark')).not.toBeNull();
  });
});

describe('the stylesheet', () => {
  const css = readFileSync(join(HERE, '..', 'VersionsPanel.css'), 'utf8');
  /* every block of a selector joined (a selector may open twice, the padding block and the grid block) */
  const rule = (selector: string): string => {
    const bodies: string[] = [];
    let from = 0;
    for (;;) {
      const at = css.indexOf(`${selector} {`, from);
      if (at < 0) break;
      const end = css.indexOf('}', at);
      bodies.push(css.slice(at, end));
      from = end;
    }
    expect(bodies.length, selector).toBeGreaterThan(0);
    return bodies.join('\n');
  };

  it('sizes the marks strip to its authors, the +N at 11 px, and the window row hovers', () => {
    expect(rule('.ts-version-marks')).toContain('width: auto');
    expect(rule('.ts-version-marks')).toContain('min-width: 16px');
    expect(rule('.ts-version-marks-more')).toContain('11px');
    expect(rule('.ts-version-window-row')).toContain(
      'grid-template-columns: auto minmax(0, 1fr) 16px',
    );
    expect(rule('.ts-versions.is-history .ts-version-window-row:hover')).toContain(
      'var(--pt-plate)',
    );
  });

  it('stands the nested rule under the parent mark and keeps the child rows their own inset', () => {
    const nested = rule('.ts-versions-list.is-window');
    expect(nested).toContain('margin-left: 23px');
    expect(nested).toContain('padding-left: 0');
    expect(nested).toContain('border-left: 1px solid var(--pt-hair-soft)');
  });

  it('takes Restore off the grid and draws it on the row hover and focus alone; the blank legacy chip is 16 px', () => {
    expect(rule('.ts-versions.is-history .ts-version')).toContain(
      'grid-template-columns: 16px minmax(0, 1fr) auto',
    );
    expect(rule('.ts-versions.is-history .ts-version-restore')).toContain('position: absolute');
    expect(rule('.ts-versions.is-history .ts-version-restore')).toContain('display: none');
    expect(css).toContain('.ts-versions.is-history .ts-version:hover .ts-version-restore');
    expect(css).toContain('.ts-versions.is-history .ts-version:focus-within .ts-version-restore');
    expect(rule('.ts-chip.is-blank.ts-chip-16')).toContain('width: 16px');
  });
});
