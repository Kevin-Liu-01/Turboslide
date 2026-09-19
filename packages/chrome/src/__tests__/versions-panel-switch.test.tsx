// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Version } from '@turboslide/schema/mutations';

import { DEFAULT_MENU_CONTEXT } from '../menus/model';
import type { MenuContext } from '../menus/model';
import { VersionsPanel } from '../VersionsPanel';

// The Version history panel under the switch of the focus round (docs/FOCUS.md 3.1 and 3.2; the
// integrator's fixer, cycle 3 stream fix round two, check step 26): the two delete rows of a
// version's More menu are Later stubs, so the panel draws them only in a context where Tools >
// Advanced tools is on. `file.versionHistory.showChanges` was parked with `advanced: true`,
// returned in the return round (docs/RETURN.md 2.17) and re-parked from that round's runs: its row
// versions.show-changes-marks carries `parks` and read 0 change marks on the memory tier and on the
// enforce preview (return/build/integrator.md section 6), so the Show changes row is drawn with the
// switch on alone. Every other row of the panel is the same in both.

afterEach(cleanup);

/* two records a day apart, so each is its own window and its row (with the More button) is drawn
   without expanding a window first (versions-model.ts groups records inside 15 minutes) */
const VERSIONS: Version[] = [1, 2].map((n) => ({
  n,
  revision: n,
  author: { kind: 'human', name: `Person ${n}`, principalId: `p${n}` },
  note: '',
  createdAt: new Date(Date.UTC(2026, 8, 16 + n, 12, 0)).toISOString(),
  mutations: [],
}));

const SWITCH_ON: MenuContext = {
  ...DEFAULT_MENU_CONTEXT,
  settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
};

function mount(menuContext?: MenuContext) {
  const dispatch = vi.fn(() => Promise.resolve({}));
  render(
    <VersionsPanel
      versions={VERSIONS}
      revision={2}
      dispatch={dispatch as never}
      history
      menuContext={menuContext}
    />,
  );
}

function control(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-control="${id}"]`);
}

function openMore(n: number): void {
  const more = control(`versionHistory.${n}.more`);
  expect(more, `the More button of version ${n}`).not.toBeNull();
  fireEvent.click(more!);
}

function menuRows(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('#ts-menu-version-more [data-menu-item]'),
  ).map((el) => el.dataset.menuItem ?? '');
}

describe('the Version history panel under Tools > Advanced tools', () => {
  it('draws neither the Show changes row nor the delete rows while the switch is off', () => {
    mount();
    expect(control('versionHistory.showChanges')).toBeNull();
    expect(control('versionHistory.showChanges.row')).toBeNull();
    expect(control('versionHistory.namedOnly'), 'Only named is not parked').not.toBeNull();
    openMore(1);
    expect(menuRows()).toEqual(['version.name', 'version.copy']);
  });

  it('draws both with the switch on, the delete rows disabled with their clause', () => {
    mount(SWITCH_ON);
    const checkbox = control('versionHistory.showChanges') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    expect(checkbox?.checked).toBe(false);
    expect(control('versionHistory.showChanges.row')?.textContent).toContain('Show changes');
    openMore(1);
    expect(menuRows()).toEqual([
      'version.name',
      'version.copy',
      'file.versionHistory.deleteOlder',
      'file.versionHistory.deleteHistory',
    ]);
    for (const id of ['file.versionHistory.deleteOlder', 'file.versionHistory.deleteHistory']) {
      const row = document.querySelector<HTMLElement>(
        `#ts-menu-version-more [data-menu-item="${id}"]`,
      );
      expect(row?.getAttribute('aria-disabled'), id).toBe('true');
    }
  });

  it('mounted without a context it reads the default one, the switch off: neither Show changes nor the delete rows', () => {
    mount(undefined);
    expect(control('versionHistory.showChanges')).toBeNull();
    openMore(1);
    expect(menuRows()).toEqual(['version.name', 'version.copy']);
  });
});
