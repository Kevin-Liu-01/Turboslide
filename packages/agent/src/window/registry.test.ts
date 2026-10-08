// @vitest-environment jsdom

// The registry without React (SPEC 7.4): ownership resolution, the inactive attributes, control
// matching by label and by data-control id, and delegation from a drawer to the active owner in
// its scope while an inactive sibling owner (the viewer marker under Edit) is also registered.
import { afterEach, describe, expect, it } from 'vitest';

import { listControls, matchControl, setControlValue } from './controls.ts';
import { SCOPE_ATTRIBUTE, registerStudioAutomation, studioAutomationForOwner } from './registry.ts';

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.innerHTML = '';
  expect(window.turboslide).toBeUndefined();
});

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute(SCOPE_ATTRIBUTE, 'editor:test');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe('window.turboslide.studio ownership', () => {
  it('resolves the last active owner and hands over on data-active', () => {
    const root = mount(
      '<span class="editor"></span><span class="viewer" data-active="false"></span>',
    );
    const editor = root.querySelector<HTMLElement>('.editor')!;
    const viewer = root.querySelector<HTMLElement>('.viewer')!;
    disposers.push(registerStudioAutomation({ owner: 'editor', actions: ['deck.info'] }, editor));
    disposers.push(registerStudioAutomation({ owner: 'viewer', actions: ['view.goto'] }, viewer));
    expect(window.turboslide!.studio.owner()).toBe('editor');
    viewer.removeAttribute('data-active');
    editor.setAttribute('data-active', 'false');
    expect(window.turboslide!.studio.owner()).toBe('viewer');
    editor.removeAttribute('data-active');
    expect(window.turboslide!.studio.owner()).toBe('viewer');
  });

  it('delegates from a drawer to the active owner in its scope, not to an inactive sibling', async () => {
    const root = mount(
      '<span class="editor"></span><span class="viewer" data-active="false"></span><div class="drawer"></div>',
    );
    const editor = root.querySelector<HTMLElement>('.editor')!;
    const viewer = root.querySelector<HTMLElement>('.viewer')!;
    const drawer = root.querySelector<HTMLElement>('.drawer')!;
    disposers.push(
      registerStudioAutomation(
        {
          owner: 'editor',
          getSource: () => '{"id":"editor"}',
          invoke: (action) => {
            throw new RangeError(`no ${action}`);
          },
        },
        editor,
      ),
    );
    disposers.push(registerStudioAutomation({ owner: 'viewer' }, viewer));
    disposers.push(
      registerStudioAutomation(
        {
          owner: 'source-drawer',
          getSource: () =>
            studioAutomationForOwner(drawer, { excludeOwner: drawer })?.readSource() ?? '',
          invoke: (action, input) => {
            const target = studioAutomationForOwner(drawer, { excludeOwner: drawer });
            if (!target) throw new Error('no owner');
            return target.invoke(action, input);
          },
        },
        drawer,
      ),
    );
    const studio = window.turboslide!.studio;
    expect(studio.owner()).toBe('source-drawer');
    expect(studioAutomationForOwner(drawer, { excludeOwner: drawer })?.owner()).toBe('editor');
    expect(studio.readSource()).toBe('{"id":"editor"}');
    await expect(studio.invoke('deck.explode')).rejects.toThrow(RangeError);
    // outside the scope nothing resolves
    const stranger = document.createElement('div');
    document.body.append(stranger);
    expect(studioAutomationForOwner(stranger)).toBeUndefined();
  });

  it('finds controls by label and by data-control id and sets a Seg by clicking its option', () => {
    const root = mount(`
      <span class="editor"></span>
      <div role="group" aria-label="list: Size">
        <button type="button" data-control="block.list.size.24" aria-pressed="true">24</button>
        <button type="button" data-control="block.list.size.22" aria-pressed="false">22</button>
        <button type="button" data-control="block.list.size.20" aria-pressed="false">20</button>
      </div>
      <input type="text" aria-label="p1: Measure (ch)" data-control="block.p1.measure" value="56" />
      <button type="button" data-control="version.save" title="Save version">Save</button>
    `);
    disposers.push(
      registerStudioAutomation({ owner: 'editor' }, root.querySelector<HTMLElement>('.editor')),
    );
    const clicks: string[] = [];
    for (const option of root.querySelectorAll<HTMLButtonElement>('[role="group"] button')) {
      option.addEventListener('click', () => clicks.push(option.textContent));
    }
    expect(matchControl('list: Size')).toBe(matchControl('block.list.size'));
    expect(matchControl('block.list.size.22').getAttribute('role')).toBe('group');
    setControlValue('list: Size', 22);
    setControlValue('block.list.size', 24);
    setControlValue('block.list.size', 24);
    expect(clicks).toEqual(['22']);
    let changes = 0;
    const measure = matchControl('p1: Measure (ch)') as HTMLInputElement;
    measure.addEventListener('change', () => (changes += 1));
    window.turboslide!.studio.set('block.p1.measure', 32);
    expect(measure.value).toBe('32');
    expect(changes).toBe(1);
    expect(listControls()).toEqual([
      { kind: 'select', label: 'list: Size', control: 'block.list.size', value: '24' },
      { kind: 'input', label: 'p1: Measure (ch)', control: 'block.p1.measure', value: '32' },
      { kind: 'button', label: 'Save version', control: 'version.save' },
    ]);
    expect(() => window.turboslide!.studio.set('nothing here', 1)).toThrow(RangeError);
    expect(() => window.turboslide!.studio.activate('list: Size')).toThrow(TypeError);
  });

  it('reads and sets the shared dropdown by label and by id, one change per new value (docs/DROPDOWNS.md 3.11)', () => {
    /* the DOM of packages/chrome/src/Select.tsx, closed: the listbox hidden right after its
       trigger; a click on an option chooses, as the component's own listener does */
    const root = mount(`
      <span class="editor"></span>
      <button type="button" role="combobox" aria-label="General access" aria-expanded="false"
        aria-haspopup="listbox" aria-controls="mode-list" data-control="dialog.share.mode"
        value="restricted">Restricted</button>
      <div id="mode-list" role="listbox" hidden>
        <div role="option" data-value="restricted" data-tip="Restricted" aria-selected="true"
          data-control="dialog.share.mode.restricted">Restricted</div>
        <div role="option" data-value="link" data-tip="Anyone with the link" aria-selected="false"
          data-control="dialog.share.mode.link">Anyone with the link</div>
        <div role="option" data-value="domain" data-tip="Your domain" aria-selected="false"
          aria-disabled="true">Your domain</div>
      </div>
      <div role="group" aria-label="table: Border">
        <button type="button" data-control="block.table.border.on" aria-pressed="true">On</button>
        <button type="button" role="combobox" aria-label="table: Border weight"
          aria-controls="weight-list" data-control="block.table.border.weight" value="1">1 pt</button>
        <div id="weight-list" role="listbox" hidden>
          <div role="option" data-value="1" data-tip="1 pt" aria-selected="true">1 pt</div>
          <div role="option" data-value="2" data-tip="2 pt" aria-selected="false">2 pt</div>
        </div>
      </div>
    `);
    disposers.push(
      registerStudioAutomation({ owner: 'editor' }, root.querySelector<HTMLElement>('.editor')),
    );
    const trigger = root.querySelector<HTMLButtonElement>('[data-control="dialog.share.mode"]')!;
    const changes: string[] = [];
    for (const option of root.querySelectorAll<HTMLElement>('[role="option"]')) {
      option.addEventListener('click', () => {
        const box = option.closest('[role="listbox"]')!;
        const owner = root.querySelector<HTMLElement>(`[aria-controls="${box.id}"]`)!;
        for (const row of box.querySelectorAll('[role="option"]'))
          row.setAttribute('aria-selected', String(row === option));
        owner.setAttribute('value', option.dataset.value ?? '');
        changes.push(`${owner.dataset.control}=${option.dataset.value}`);
      });
    }
    expect(matchControl('General access')).toBe(trigger);
    expect(matchControl('dialog.share.mode')).toBe(trigger);
    expect(listControls()).toEqual([
      {
        kind: 'select',
        label: 'General access',
        control: 'dialog.share.mode',
        value: 'restricted',
      },
      { kind: 'select', label: 'table: Border', control: 'block.table.border', value: 'on' },
      {
        kind: 'select',
        label: 'table: Border weight',
        control: 'block.table.border.weight',
        value: '1',
      },
    ]);
    window.turboslide!.studio.set('dialog.share.mode', 'link');
    expect(trigger.getAttribute('value')).toBe('link');
    window.turboslide!.studio.set('dialog.share.mode', 'link');
    window.turboslide!.studio.set('General access', 'Restricted');
    expect(trigger.getAttribute('value')).toBe('restricted');
    expect(changes).toEqual(['dialog.share.mode=link', 'dialog.share.mode=restricted']);
    expect(() => window.turboslide!.studio.set('dialog.share.mode', 'public')).toThrow(
      /"General access" control has no option "public"/,
    );
    expect(() => window.turboslide!.studio.set('dialog.share.mode', 'domain')).toThrow(
      /option "domain" is disabled/,
    );
    /* the dropdown inside the Border group is a control of its own, never the group's option */
    expect(matchControl('table: Border weight').getAttribute('role')).toBe('combobox');
    window.turboslide!.studio.set('block.table.border.weight', 2);
    expect(changes.at(-1)).toBe('block.table.border.weight=2');
    setControlValue('table: Border', 'on');
    expect(changes).toHaveLength(3);
    /* activate() clicks the trigger, which opens its list */
    let opened = 0;
    trigger.addEventListener('click', () => (opened += 1));
    window.turboslide!.studio.activate('General access');
    expect(opened).toBe(1);
  });
});
