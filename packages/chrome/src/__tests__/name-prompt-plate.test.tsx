// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorShellInput } from '../editor-shell';
import { EditorShell } from '../EditorShell';
import { cn } from '../lib/cn';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import { useSnackbar } from '../Snackbar';
import { hideTooltip } from '../Tooltip';

// The name prompt the route opens on the first write or at the join is the title row's plate
// (docs/POLISH.md 2.8 item 103; the row share.name-prompt.never-mid-drag): inside the row's right
// cluster, never a card over the sheet; Continue keeps the name through the account's setName,
// the cross keeps the generated label; a dialog a person opened covers it.

const doc = workedDocument();
const SLIDES = doc.deck.sections.flatMap((section) => section.slideIds);
const SLIDE = SLIDES[0]!;

function shellState(overrides: Partial<ShellState> = {}): ShellState {
  const items = SLIDES.map((id) => ({ id, title: id }));
  return {
    id: 'edit:worked',
    modes: ['slide', 'grid', 'book'],
    keys: 'paged',
    noun: 'slide',
    items,
    paged: items,
    mode: 'slide',
    density: 'thumbs',
    sidebarOpen: true,
    sidebarShown: true,
    panelOpen: false,
    helpOpen: false,
    present: false,
    narrow: false,
    active: SLIDE,
    index: 0,
    dir: 'next',
    total: items.length,
    ready: true,
    setMode: vi.fn(),
    setDensity: vi.fn(),
    setSidebar: vi.fn(),
    setPanel: vi.fn(),
    setHelp: vi.fn(),
    setPresent: vi.fn(),
    select: vi.fn(),
    step: vi.fn(),
    say: vi.fn(),
    ...overrides,
  };
}

function Harness({ input, shell }: { input: EditorShellInput; shell: ShellState }) {
  const snackbar = useSnackbar();
  const stageRef = createRef<HTMLDivElement>();
  const [compact, setCompact] = useState(false);
  return (
    <ShellContext value={shell}>
      <div className={cn('pt-viewer is-editor', compact && 'is-compact')}>
        <EditorShell
          input={input}
          sidebar={<aside className="pt-sb" />}
          stageRef={stageRef}
          snackbar={snackbar}
          onCompactChange={setCompact}
        >
          <div className="ts-stage" />
        </EditorShell>
      </div>
    </ShellContext>
  );
}

const dispatch = vi.fn(() => Promise.resolve({}));

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

function account(over: Record<string, unknown> = {}): NonNullable<EditorShellInput['account']> {
  return {
    principal: { id: 'anon_1', label: 'Titanium 101', name: null, kind: 'anonymous' },
    namePrompt: { open: true, prefilled: '' },
    onNamePrompt: vi.fn(),
    setName: vi.fn(() => Promise.resolve()),
    ...over,
  } as unknown as NonNullable<EditorShellInput['account']>;
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
});

afterEach(async () => {
  hideTooltip();
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.innerHTML = '';
});

describe('the name prompt as the title row plate', () => {
  it('draws inside the title row when the route opens it, and no floating card anywhere', () => {
    const { container } = render(
      <Harness input={input({ account: account() })} shell={shellState()} />,
    );
    const prompt = container.querySelector('[data-control="dialog.namePrompt"]')!;
    expect(prompt).not.toBeNull();
    expect(prompt.closest('.ts-title-row')).not.toBeNull();
    expect(prompt.closest('.ts-title-r')).not.toBeNull();
    expect(prompt.classList.contains('ts-title-name-plate')).toBe(true);
    expect(container.querySelector('.ts-dialog-float')).toBeNull();
    expect(container.querySelector('.ts-dialog-scrim')).toBeNull();
    /* the plate is the cluster's first child, before the collaborators */
    const right = container.querySelector('.ts-title-r')!;
    expect(right.firstElementChild?.getAttribute('data-control')).toBe('dialog.namePrompt');
    expect(prompt.querySelector('[data-control="dialog.namePrompt.name"]')).not.toBeNull();
    expect(prompt.querySelector('[data-control="dialog.namePrompt.continue"]')).not.toBeNull();
    expect(prompt.querySelector('[data-control="dialog.namePrompt.close"]')).not.toBeNull();
  });

  it('is absent while the route keeps the prompt closed', () => {
    const { container } = render(
      <Harness
        input={input({ account: account({ namePrompt: { open: false, prefilled: '' } }) })}
        shell={shellState()}
      />,
    );
    expect(container.querySelector('[data-control="dialog.namePrompt"]')).toBeNull();
  });

  it('Continue keeps the typed name through setName and tells the route the prompt is done', async () => {
    const setName = vi.fn(() => Promise.resolve());
    const onNamePrompt = vi.fn();
    const { container } = render(
      <Harness
        input={input({ account: account({ setName, onNamePrompt }) })}
        shell={shellState()}
      />,
    );
    const field = container.querySelector<HTMLInputElement>(
      '[data-control="dialog.namePrompt.name"]',
    )!;
    const go = container.querySelector<HTMLButtonElement>(
      '[data-control="dialog.namePrompt.continue"]',
    )!;
    expect(go.disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'Copper Lane' } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setName).toHaveBeenCalledWith('Copper Lane');
    expect(onNamePrompt).toHaveBeenCalledWith(false);
  });

  it('the cross keeps the generated label: the route is told, setName is not called', () => {
    const setName = vi.fn(() => Promise.resolve());
    const onNamePrompt = vi.fn();
    const { container } = render(
      <Harness
        input={input({ account: account({ setName, onNamePrompt }) })}
        shell={shellState()}
      />,
    );
    fireEvent.click(container.querySelector('[data-control="dialog.namePrompt.close"]')!);
    expect(setName).not.toHaveBeenCalled();
    expect(onNamePrompt).toHaveBeenCalledWith(false);
  });
});
