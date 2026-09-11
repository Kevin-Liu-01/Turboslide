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
});
