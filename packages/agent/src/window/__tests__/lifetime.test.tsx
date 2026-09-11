// @vitest-environment jsdom

// Adapter lifetime across re-renders (SPEC 7.4; MILESTONES M3 item 4), pinned the way Glyphfield's
// ToolShellAutomation.test.tsx:45-70 does: a parent that re-renders with new callbacks keeps the
// same window.turboslide.studio handle and that handle reads and applies through the current
// callbacks; an open source drawer delegates unknown actions to its editor and stays valid across
// the parent's re-render; the ready event fires once per owner change and never per render.
import { act, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLiveAdapter } from '../adapter.ts';
import type { StudioAdapter, StudioDescribe } from '../adapter.ts';
import { READY_EVENT } from '../ready.ts';
import {
  SCOPE_ATTRIBUTE,
  registerStudioAutomation,
  studioAutomationForOwner,
  windowActionIds,
} from '../registry.ts';

/**
 * The React glue the studio uses: register once on mount with a live adapter, update it on every
 * render. The effect is a layout effect so the registration exists before the test's first read;
 * the studio route does the same.
 */
function useStudioOwner(adapter: StudioAdapter, owner: HTMLElement | null): void {
  const live = useRef(createLiveAdapter(adapter));
  live.current.update(adapter);
  useLayoutEffect(() => {
    if (!owner) return;
    return registerStudioAutomation(live.current.adapter, owner);
  }, [owner]);
}

type EditorHostProps = {
  source: string;
  onApply: (source: string) => void;
  drawer: boolean;
  children?: ReactNode;
};

function Drawer() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  /* the editor around the drawer, never the drawer itself */
  const editor = () => {
    const found = studioAutomationForOwner(root, { excludeOwner: root });
    if (!found) throw new Error('no editor to delegate to');
    return found;
  };
  const adapter: StudioAdapter = {
    owner: 'source-drawer',
    actions: ['source.read', 'source.apply'],
    getSource: () => editor().readSource(),
    applySource: (source) => editor().applySource(source),
    invoke: (action, input) => editor().invoke(action, input),
  };
  useStudioOwner(adapter, root);
  return (
    <div ref={setRoot} className="drawer">
      <textarea aria-label="Slide source" data-control="source.text" defaultValue="" />
    </div>
  );
}

function EditorHost({ source, onApply, drawer, children }: EditorHostProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const adapter: StudioAdapter = {
    owner: 'editor',
    actions: windowActionIds(),
    getSource: () => source,
    applySource: (next) => onApply(next),
    invoke: (action) => {
      throw new RangeError(`The editor does not implement "${action}" in this test.`);
    },
    state: () => ({ deckId: 'test', source }),
  };
  useStudioOwner(adapter, root);
  const scope = { [SCOPE_ATTRIBUTE]: 'editor:test' };
  return (
    <div ref={setRoot} className="editor" {...scope}>
      <button type="button" aria-label="Save version" data-control="version.save" />
      {drawer ? <Drawer /> : null}
      {children}
    </div>
  );
}

describe('window.turboslide.studio adapter lifetime', () => {
  let container: HTMLDivElement;
  let root: Root;
  let ready: StudioDescribe[];
  const onReady = (event: Event) => {
    ready.push((event as CustomEvent<StudioDescribe>).detail);
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    ready = [];
    window.addEventListener(READY_EVENT, onReady);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
    window.removeEventListener(READY_EVENT, onReady);
    vi.unstubAllGlobals();
    expect(window.turboslide).toBeUndefined();
  });

  async function render(props: EditorHostProps) {
    await act(() => root.render(<EditorHost {...props} />));
  }

  it('keeps one handle across equivalent parent re-renders and reads current callbacks', async () => {
    const oldApply = vi.fn();
    const nextApply = vi.fn();
    await render({ source: '{"id":"first"}', onApply: oldApply, drawer: false });
    const editor = window.turboslide!.studio;
    expect(editor.owner()).toBe('editor');
    expect(editor.describe().actions).toEqual(windowActionIds());
    expect(editor.describe().source).toEqual({ read: true, apply: true });

    await render({ source: '{"id":"second"}', onApply: nextApply, drawer: false });
    expect(window.turboslide!.studio).toBe(editor);
    expect(editor.readSource()).toBe('{"id":"second"}');
    expect(editor.describe().state).toEqual({ deckId: 'test', source: '{"id":"second"}' });
    await editor.applySource({ id: 'third' });
    expect(nextApply).toHaveBeenCalledExactlyOnceWith('{\n  "id": "third"\n}');
    expect(oldApply).not.toHaveBeenCalled();
    await expect(editor.invoke('deck.explode')).rejects.toThrow(RangeError);
    expect(editor.controls()).toEqual([
      { kind: 'button', label: 'Save version', control: 'version.save' },
    ]);
  });

  it('keeps drawer delegation valid across re-renders and hands ownership back on close', async () => {
    const apply = vi.fn();
    await render({ source: '{"id":"first"}', onApply: apply, drawer: false });
    const editor = window.turboslide!.studio;

    await render({ source: '{"id":"first"}', onApply: apply, drawer: true });
    const drawer = window.turboslide!.studio;
    expect(drawer).not.toBe(editor);
    expect(drawer.owner()).toBe('source-drawer');
    expect(drawer.readSource()).toBe('{"id":"first"}');
    // Unknown actions delegate to the editor and report its capability, rather than treating the
    // still-open drawer as an inactive owner.
    await expect(drawer.invoke('unsupported-action')).rejects.toThrow(RangeError);

    await render({ source: '{"id":"second"}', onApply: apply, drawer: true });
    expect(window.turboslide!.studio).toBe(drawer);
    expect(drawer.readSource()).toBe('{"id":"second"}');
    await drawer.applySource('{"id":"fourth"}');
    expect(apply).toHaveBeenCalledExactlyOnceWith('{"id":"fourth"}');
    await expect(drawer.invoke('unsupported-action')).rejects.toThrow(RangeError);
    expect(drawer.controls().map((row) => row.control)).toEqual(['version.save', 'source.text']);

    await render({ source: '{"id":"second"}', onApply: apply, drawer: false });
    expect(window.turboslide!.studio).toBe(editor);
    expect(() => drawer.readSource()).toThrow(/no longer active/);
  });

  it('fires the ready event once per owner change and never per render', async () => {
    const apply = vi.fn();
    await render({ source: '{"id":"a"}', onApply: apply, drawer: false });
    expect(ready.map((detail) => detail.owner)).toEqual(['editor']);
    expect(ready[0]?.event).toBe(READY_EVENT);
    expect(ready[0]?.actions).toEqual(windowActionIds());

    await render({ source: '{"id":"b"}', onApply: apply, drawer: false });
    await render({ source: '{"id":"c"}', onApply: apply, drawer: false });
    expect(ready).toHaveLength(1);

    await render({ source: '{"id":"c"}', onApply: apply, drawer: true });
    expect(ready.map((detail) => detail.owner)).toEqual(['editor', 'source-drawer']);

    await render({ source: '{"id":"d"}', onApply: apply, drawer: true });
    expect(ready).toHaveLength(2);

    await render({ source: '{"id":"d"}', onApply: apply, drawer: false });
    expect(ready.map((detail) => detail.owner)).toEqual(['editor', 'source-drawer', 'editor']);

    // an owner taken out of the active set by an attribute hands over through the observer
    const editorRoot = container.querySelector<HTMLElement>('.editor');
    expect(editorRoot).not.toBeNull();
    await act(async () => {
      editorRoot?.setAttribute('data-active', 'false');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(ready).toHaveLength(3);
    expect(() => window.turboslide!.studio).toThrow(/No active Turboslide owner/);
    await act(async () => {
      editorRoot?.removeAttribute('data-active');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(ready.map((detail) => detail.owner)).toEqual([
      'editor',
      'source-drawer',
      'editor',
      'editor',
    ]);
  });
});
