import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ThemeToolbar } from '@turboslide/chrome/ThemeToolbar';
import { layoutTiles } from '@turboslide/chrome/LayoutGrid';
import type { SlideRenderer } from '@turboslide/chrome/LayoutGrid';
import { tipProps } from '@turboslide/chrome/Tooltip';
import type { Block, PlaceholderKind } from '@turboslide/schema/blocks';
import { PLACEHOLDER_KINDS, PLACEHOLDER_LABELS } from '@turboslide/schema/blocks';
import type {
  Appearance,
  CustomLayout,
  CustomLayoutId,
  DeckDocument,
  Slide,
  ThemeBox,
  ThemeEdits,
  ThemeFontRole,
  ThemeMarkKind,
} from '@turboslide/schema/deck';
import { THEME_MARK_KINDS, isCustomLayoutId } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import type { LayoutId } from '@turboslide/schema/layouts';
import type { Mutation } from '@turboslide/schema/mutations';
import { contentBox, deckPage } from '@turboslide/schema/render';
import type { ThemeColorSlotKey } from '@turboslide/schema/validate/theme';
import { THEME_SPECS, THEME_LABELS } from '@turboslide/theme/themes';
import { PANEL, SEMANTIC } from '@turboslide/theme/tokens';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import './theme-mode.css';

/**
 * Edit theme, the editor mode of gslides-parity SPEC-5 9.2 (R03 2, 4.4, 4.5): opened by Slide >
 * Edit theme and View > Theme builder through `client('themeMode')` and the controller's
 * `setEditorMode('theme')`, left by the X, Esc or a pick in the slide filmstrip. The left column
 * shows one tile under Theme (the theme slide: the frame, the corner slot, the counter, the chips
 * and the type ladder) and the layouts under Layouts (the 21 built in ones through the layout grid
 * renderer, then the custom ones, hidden ones absent); right click on a layout offers New layout
 * (Ctrl M inside the mode), Duplicate layout, Rename layout and Delete layout. The toolbar
 * carries Background, Colors, Fonts, Insert placeholder, Rename and the X (ThemeToolbar.tsx). The
 * canvas ground is `--pt-panel-ink`; the theme slide's corner slot and counter are draggable
 * boxes writing `theme.set /mark/box` and `/counter/box`, the frame's toggles and inset, the chips
 * and the counter's side and format are rows of the side panel writing `theme.set`; nothing moves
 * the content box. A layout is a canvas slide whose blocks carry `placeholder`; its side panel
 * lists the blocks with their placeholder kind (`layout.setPlaceholder`), and Insert placeholder
 * adds a block to it. Every change is a commit like any other (the actions carry
 * `baseRevision`), so undo, versions and the room carry it.
 */
export type ThemeModeProps = {
  document: DeckDocument;
  revision: number;
  appearance: Appearance;
  /** the shell's renderer of a slide of this deck (EditorRoot's renderSlide binding) */
  renderSlide: SlideRenderer;
  /** the window action runner: `theme.*`, `layout.*` with `baseRevision` */
  invoke: (action: string, input?: unknown) => Promise<unknown>;
  /** one write of arbitrary mutations with a history entry (the placeholder insert) */
  commit?: (mutations: Mutation[], label: string) => Promise<unknown>;
  say: (message: string) => void;
  /** Edit theme's Background button: the Background dialog over `/defaults/background` */
  onBackground: () => void;
  onExit: () => void;
  busy?: boolean;
};

type Selected = { kind: 'theme' } | { kind: 'layout'; id: LayoutId | CustomLayoutId };

/** The id the theme slide and a built in layout render under; never written to the deck. */
const PREVIEW_ID = 'theme-preview';

/** The theme slide (R03 4.4): the type ladder as sample lines on a canvas, the frame and the slots around it. */
export function themeSlide(document: DeckDocument): Slide {
  const [x, y, w] = contentBox(deckPage(document.deck));
  const line = (
    id: string,
    block: Record<string, unknown>,
    top: number,
    h: number,
    z: number,
  ): Block => ({ id, ...block, pos: { x, y: y + top, w, h, z } }) as unknown as Block;
  return {
    schemaVersion: 1,
    id: PREVIEW_ID,
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        line('h1', { type: 'heading', level: 'h1', text: 'Heading 1' }, 0, 96, 0),
        line('h2', { type: 'heading', level: 'h2', text: 'Heading 2' }, 112, 64, 1),
        line('big', { type: 'heading', level: 'big', text: 'A big statement line' }, 192, 64, 2),
        line(
          'p1',
          {
            type: 'paragraph',
            text: 'Body text: every line of copy states a number or a mechanism.',
          },
          280,
          48,
          3,
        ),
        line(
          'p2',
          {
            type: 'paragraph',
            text: 'A second paragraph at the body size, with the theme’s leading.',
          },
          336,
          48,
          4,
        ),
        line(
          'cap',
          { type: 'credit', text: 'Caption and credit lines set at the small size' },
          408,
          32,
          5,
        ),
      ],
    },
  } as Slide;
}

/** The base values of the twelve slots for an appearance (R03 4.2), the swatches before an edit. */
export function baseColorsOf(
  themeId: DeckDocument['deck']['theme'],
  appearance: Appearance,
): Record<string, string> {
  const tokens = THEME_SPECS[themeId].tokens[appearance];
  const plate = appearance === 'dark' ? '#131313' : '#f6f6f6';
  return {
    ink: tokens.ink,
    paper: tokens.paper,
    'ink-2': tokens['ink-2'],
    plate,
    ok: SEMANTIC.ok,
    warn: SEMANTIC.warn,
    no: SEMANTIC.no,
    info: SEMANTIC.info,
    titanium: tokens.titanium,
    raised: PANEL.background,
    link: SEMANTIC.info,
  };
}

/** The slot boxes on the page in sheet px: the record's, else the spec's (left, bottom relative to the page). */
export function slotBoxes(
  edits: ThemeEdits | undefined,
  themeId: DeckDocument['deck']['theme'],
  page: { width: number; height: number },
): { mark: ThemeBox; counter: ThemeBox; markKind: ThemeMarkKind; counterShown: boolean } {
  const spec = THEME_SPECS[themeId];
  const markKind = edits?.mark?.kind ?? spec.mark.kind;
  const mark: ThemeBox = edits?.mark?.box ?? [
    spec.mark.left,
    page.height - spec.mark.bottom - spec.mark.height,
    spec.mark.width,
    spec.mark.height,
  ];
  const side = edits?.counter?.side ?? spec.counter.side;
  const counterW = 48;
  const counterH = spec.counter.fontSize + 2;
  const counter: ThemeBox = edits?.counter?.box ?? [
    side === 'left' ? spec.counter.inset : page.width - spec.counter.inset - counterW,
    page.height - spec.counter.bottom - counterH,
    counterW,
    counterH,
  ];
  return { mark, counter, markKind, counterShown: edits?.counter?.show ?? spec.counter.show };
}

/** A layout's canvas slide for the tile and the canvas: its blocks under the preview id. */
export function layoutSlide(id: string, layout: CustomLayout): Slide {
  return {
    schemaVersion: 1,
    id: PREVIEW_ID,
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: layout.blocks ?? [] },
    title: layout.displayName ?? layout.name ?? id,
  } as Slide;
}

/** A new placeholder block for Insert placeholder: a heading, a text box, a shape or a slide number box in the content box. */
export function placeholderBlock(
  kind: PlaceholderKind,
  taken: ReadonlySet<string>,
  page: { width: number; height: number },
): Block {
  const [cx, cy, cw, ch] = contentBox(page);
  let id: string = kind;
  for (let n = 2; taken.has(id); n += 1) id = `${kind}-${n}`;
  const pos = {
    x: cx,
    y: cy + Math.round(ch / 3),
    w: Math.round(cw / 2),
    h: 80,
    z: taken.size + 1,
  };
  switch (kind) {
    case 'title':
      return {
        id,
        type: 'heading',
        level: 'h2',
        text: 'Title',
        placeholder: kind,
        pos: { ...pos, y: cy, w: cw, h: 96 },
      } as Block;
    case 'subtitle':
      return {
        id,
        type: 'paragraph',
        text: 'Subtitle',
        placeholder: kind,
        pos: { ...pos, y: cy + 112, w: cw, h: 56 },
      } as Block;
    case 'body':
      return {
        id,
        type: 'text',
        text: 'Body text',
        placeholder: kind,
        pos: { ...pos, h: Math.round(ch / 2) },
      } as Block;
    case 'slideNumber':
      return {
        id,
        type: 'text',
        text: '#',
        placeholder: kind,
        pos: { x: cx + cw - 96, y: cy + ch - 40, w: 96, h: 40, z: pos.z },
      } as Block;
    case 'picture':
      return {
        id,
        type: 'shape',
        shape: 'rect',
        stroke: 'hair',
        placeholder: kind,
        pos: { ...pos, x: cx + Math.round(cw / 2), h: Math.round(ch / 2) },
      } as Block;
  }
}

function boxStyle(box: ThemeBox, page: { width: number; height: number }) {
  const [x, y, w, h] = box;
  return {
    left: `${(x / page.width) * 100}%`,
    top: `${(y / page.height) * 100}%`,
    width: `${(w / page.width) * 100}%`,
    height: `${(h / page.height) * 100}%`,
  };
}

type Row = { label: string; children: ReactNode; doc?: string };

function SideRow({ label, children, doc }: Row) {
  return (
    <div className="ts-tm-row" {...(doc === undefined ? {} : tipProps({ name: label, doc }))}>
      <span className="ts-tm-label">{label}</span>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  control,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  control: string;
  disabled?: boolean;
}) {
  return (
    <label className="ts-tm-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-control={control}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function ThemeMode({
  document,
  revision,
  appearance,
  renderSlide,
  invoke,
  commit,
  say,
  onBackground,
  onExit,
  busy,
}: ThemeModeProps) {
  const { deck } = document;
  const page = deckPage(deck);
  const edits = deck.themeEdits;
  const [selected, setSelected] = useState<Selected>({ kind: 'theme' });
  const [menu, setMenu] = useState<{ id: LayoutId | CustomLayoutId; x: number; y: number } | null>(
    null,
  );
  const [drag, setDrag] = useState<{
    slot: 'mark' | 'counter';
    start: { x: number; y: number };
    box: ThemeBox;
    delta: { x: number; y: number };
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const fail = useCallback(
    (error: unknown) => say(error instanceof Error ? error.message : String(error)),
    [say],
  );
  const run = useCallback(
    (action: string, input: Record<string, unknown>) =>
      invoke(action, { ...input, baseRevision: revision }).catch(fail),
    [invoke, revision, fail],
  );
  const themeSet = useCallback(
    (path: string, value?: unknown) =>
      run('theme.set', value === undefined ? { path } : { path, value }),
    [run],
  );

  const customLayouts = deck.customLayouts ?? {};
  const hiddenBuiltIns = useMemo(
    () =>
      new Set(
        Object.values(customLayouts)
          .filter((l) => l.hidden === true)
          .map((l) => l.from),
      ),
    [customLayouts],
  );
  const builtIn = useMemo(() => {
    const tiles = layoutTiles(deck, appearance, renderSlide);
    return [...tiles.google, ...tiles.gt].filter((tile) => !hiddenBuiltIns.has(tile.entry.id));
  }, [deck, appearance, renderSlide, hiddenBuiltIns]);
  const custom = useMemo(
    () => Object.entries(customLayouts).filter(([, layout]) => layout.hidden !== true),
    [customLayouts],
  );

  const shown: Slide = useMemo(() => {
    if (selected.kind === 'theme') return themeSlide(document);
    if (isCustomLayoutId(selected.id)) {
      const layout = customLayouts[selected.id];
      return layout === undefined ? themeSlide(document) : layoutSlide(selected.id, layout);
    }
    const tile = builtIn.find((t) => t.entry.id === selected.id);
    const made = tile?.entry.make(PREVIEW_ID, deck, deck.sections[0]?.id ?? 'deck');
    return made ?? themeSlide(document);
  }, [selected, document, customLayouts, builtIn, deck]);

  const html = useMemo(() => {
    try {
      return renderSlide(shown, appearance);
    } catch (error) {
      fail(error);
      return '';
    }
  }, [shown, appearance, renderSlide, fail]);

  const slots = slotBoxes(edits, deck.theme, page);
  const spec = THEME_SPECS[deck.theme];

  /* keys inside the mode: Esc leaves, Ctrl M makes a layout */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      )
        return;
      if (event.key === 'Escape') {
        if (menu !== null) setMenu(null);
        else onExit();
      } else if (event.key.toLowerCase() === 'm' && event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        void newLayout();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const newLayout = async (from?: LayoutId | CustomLayoutId) => {
    const name = window.prompt(
      'Layout name',
      from === undefined ? 'New layout' : `${layoutName(from)} copy`,
    );
    if (name === null || name.trim() === '') return;
    const answer = (await run('layout.create', {
      name: name.trim(),
      ...(from !== undefined ? { from } : {}),
    })) as { id?: CustomLayoutId } | undefined;
    if (answer?.id !== undefined) setSelected({ kind: 'layout', id: answer.id });
  };

  const layoutName = (id: LayoutId | CustomLayoutId): string => {
    if (isCustomLayoutId(id)) {
      const layout = customLayouts[id];
      return layout?.displayName ?? layout?.name ?? id;
    }
    return builtIn.find((t) => t.entry.id === id)?.entry.label ?? id;
  };

  const renameLayout = async (id: CustomLayoutId) => {
    const name = window.prompt('Rename layout', layoutName(id));
    if (name === null || name.trim() === '') return;
    await run('layout.rename', { id, name: name.trim() });
  };

  const deleteLayout = async (id: LayoutId | CustomLayoutId) => {
    const ok = window.confirm(
      isCustomLayoutId(id)
        ? `Delete the layout ${layoutName(id)}? Slides on it keep their objects.`
        : `Hide the ${layoutName(id)} layout from the layout pickers?`,
    );
    if (!ok) return;
    await run('layout.delete', { id, confirm: true });
    if (selected.kind === 'layout' && selected.id === id) setSelected({ kind: 'theme' });
  };

  const renameTheme = async () => {
    const name = window.prompt('Theme name', edits?.name ?? `${THEME_LABELS[deck.theme]} theme`);
    if (name === null || name.trim() === '') return;
    await run('theme.rename', { name: name.trim() });
  };

  const insertPlaceholder = (kind: PlaceholderKind) => {
    if (selected.kind !== 'layout' || !isCustomLayoutId(selected.id)) return;
    const layout = customLayouts[selected.id];
    if (layout === undefined) return;
    if (commit === undefined) {
      say('Placeholders cannot be inserted here yet');
      return;
    }
    const blocks = layout.blocks ?? [];
    const block = placeholderBlock(kind, new Set(blocks.map((b) => b.id)), page);
    commit(
      [{ op: 'deck.set', path: `/customLayouts/${selected.id}/blocks`, value: [...blocks, block] }],
      `Insert ${PLACEHOLDER_LABELS[kind].toLowerCase()} placeholder`,
    ).catch(fail);
  };

  const onColor = (slot: ThemeColorSlotKey, value: string | null) =>
    themeSet(`/colors/${appearance}/${slot}`, value === null ? undefined : value);
  const onFont = (role: ThemeFontRole, id: FontId | null) =>
    themeSet(`/fonts/${role}`, id === null ? undefined : id);

  /* the slot drags: the client delta over the clone's scale is the sheet delta (SPEC-5 9.2) */
  const beginDrag =
    (slot: 'mark' | 'counter', box: ThemeBox) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ slot, start: { x: event.clientX, y: event.clientY }, box, delta: { x: 0, y: 0 } });
    };
  const scale = () => {
    const el = canvasRef.current;
    return el === null || el.clientWidth === 0 ? 1 : el.clientWidth / page.width;
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const k = scale();
    setDrag({
      ...drag,
      delta: { x: (event.clientX - drag.start.x) / k, y: (event.clientY - drag.start.y) / k },
    });
  };
  const endDrag = () => {
    if (drag === null) return;
    const [x, y, w, h] = drag.box;
    const next: ThemeBox = [
      Math.max(0, Math.min(page.width - w, Math.round(x + drag.delta.x))),
      Math.max(0, Math.min(page.height - h, Math.round(y + drag.delta.y))),
      w,
      h,
    ];
    setDrag(null);
    if (next[0] === x && next[1] === y) return;
    void themeSet(`/${drag.slot}/box`, next);
  };
  const dragged = (slot: 'mark' | 'counter', box: ThemeBox): ThemeBox =>
    drag !== null && drag.slot === slot
      ? [box[0] + drag.delta.x, box[1] + drag.delta.y, box[2], box[3]]
      : box;

  const selectedLayout =
    selected.kind === 'layout' && isCustomLayoutId(selected.id)
      ? customLayouts[selected.id]
      : undefined;
  const selectedLayoutId =
    selected.kind === 'layout' && isCustomLayoutId(selected.id) ? selected.id : undefined;

  return (
    <div
      className="ts-theme-mode"
      data-control="themeMode"
      data-selected={selected.kind === 'theme' ? 'theme' : selected.id}
    >
      <div className="ts-tm-toolbar ts-chrome">
        <ThemeToolbar
          edits={edits}
          appearance={appearance}
          baseColors={baseColorsOf(deck.theme, appearance)}
          busy={busy}
          onBackground={onBackground}
          onColor={onColor}
          onFont={onFont}
          onInsertPlaceholder={selectedLayoutId === undefined ? undefined : insertPlaceholder}
          onRename={() => void renameTheme()}
          onExit={onExit}
        />
      </div>
      <aside className="ts-tm-strip ts-chrome" aria-label="Theme and layouts">
        <h3 className="ts-tm-head">Theme</h3>
        <button
          type="button"
          className={`ts-tm-tile${selected.kind === 'theme' ? ' is-current' : ''}`}
          data-control="themeMode.tile.theme"
          aria-pressed={selected.kind === 'theme'}
          onClick={() => setSelected({ kind: 'theme' })}
          {...tipProps({
            name: edits?.name ?? `${THEME_LABELS[deck.theme]} theme`,
            doc: 'The theme slide: the frame, the corner slot, the counter, the chips and the type ladder',
          })}
        >
          <span
            className="ts-tm-frame"
            data-theme={appearance}
            data-sheet={deck.theme}
            aria-hidden="true"
          >
            <LiveClone
              html={renderSlide(themeSlide(document), appearance)}
              theme={appearance}
              frame
              page={page}
            />
          </span>
          <span className="ts-tm-name">{edits?.name ?? THEME_LABELS[deck.theme]}</span>
        </button>
        <h3 className="ts-tm-head">Layouts</h3>
        <div className="ts-tm-layouts" role="list">
          {builtIn.map((tile) => (
            <button
              key={tile.entry.id}
              type="button"
              role="listitem"
              className={`ts-tm-tile${selected.kind === 'layout' && selected.id === tile.entry.id ? ' is-current' : ''}`}
              data-control={`themeMode.layout.${tile.entry.id}`}
              onClick={() => setSelected({ kind: 'layout', id: tile.entry.id })}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ id: tile.entry.id, x: event.clientX, y: event.clientY });
              }}
              {...tipProps({ name: tile.entry.label, doc: tile.entry.doc })}
            >
              <span className="ts-tm-frame" data-theme={appearance} aria-hidden="true">
                {typeof tile.html === 'string' ? (
                  <LiveClone html={tile.html} theme={appearance} frame={false} page={page} />
                ) : (
                  <span className="ts-tm-plate">{tile.entry.label}</span>
                )}
              </span>
              <span className="ts-tm-name">{tile.entry.label}</span>
            </button>
          ))}
          {custom.map(([id, layout]) => (
            <button
              key={id}
              type="button"
              role="listitem"
              className={`ts-tm-tile is-custom${selected.kind === 'layout' && selected.id === id ? ' is-current' : ''}`}
              data-control={`themeMode.layout.${id}`}
              onClick={() => setSelected({ kind: 'layout', id: id as CustomLayoutId })}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ id: id as CustomLayoutId, x: event.clientX, y: event.clientY });
              }}
              {...tipProps({
                name: layout.displayName ?? layout.name ?? id,
                doc: 'A layout made in Edit theme; its placeholders fill on Apply layout',
              })}
            >
              <span className="ts-tm-frame" data-theme={appearance} aria-hidden="true">
                <LiveClone
                  html={renderSlide(layoutSlide(id, layout), appearance)}
                  theme={appearance}
                  frame={false}
                  page={page}
                />
              </span>
              <span className="ts-tm-name">{layout.displayName ?? layout.name ?? id}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pt-ib is-text ts-tm-new"
          data-control="themeMode.layout.new"
          onClick={() => void newLayout()}
          {...tipProps({ name: 'New layout', doc: 'A blank custom layout', key: 'Ctrl+M' })}
        >
          <span className="pt-lb">New layout</span>
        </button>
      </aside>
      <div className="ts-tm-canvas" data-control="themeMode.canvas">
        <div
          ref={canvasRef}
          className="ts-tm-sheet"
          data-theme={appearance}
          data-sheet={deck.theme}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <LiveClone html={html} theme={appearance} frame={selected.kind === 'theme'} page={page} />
          {selected.kind === 'theme' ? (
            <>
              {slots.markKind !== 'none' ? (
                <div
                  className={`ts-tm-slot${drag?.slot === 'mark' ? ' is-dragging' : ''}`}
                  style={boxStyle(dragged('mark', slots.mark), page)}
                  role="button"
                  tabIndex={0}
                  aria-label="Corner slot"
                  data-control="themeMode.slot.mark"
                  onPointerDown={beginDrag('mark', slots.mark)}
                  {...tipProps({
                    name: 'Corner slot',
                    doc: 'Drag to move the mark; the box is written to the theme',
                  })}
                />
              ) : null}
              {slots.counterShown ? (
                <div
                  className={`ts-tm-slot${drag?.slot === 'counter' ? ' is-dragging' : ''}`}
                  style={boxStyle(dragged('counter', slots.counter), page)}
                  role="button"
                  tabIndex={0}
                  aria-label="Slide counter"
                  data-control="themeMode.slot.counter"
                  onPointerDown={beginDrag('counter', slots.counter)}
                  {...tipProps({
                    name: 'Slide counter',
                    doc: 'Drag to move the counter; the box is written to the theme',
                  })}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <aside className="ts-tm-side ts-chrome" aria-label="Format options">
        {selected.kind === 'theme' ? (
          <>
            <h3 className="ts-tm-head">Frame</h3>
            <Check
              label="Rails"
              checked={edits?.frame?.rails ?? spec.frame.sides.includes('left')}
              control="themeMode.frame.rails"
              disabled={busy}
              onChange={(v) => void themeSet('/frame/rails', v)}
            />
            <Check
              label="Rules"
              checked={
                edits?.frame?.rules ??
                (spec.frame.sides.includes('top') || spec.frame.sides.includes('bottom'))
              }
              control="themeMode.frame.rules"
              disabled={busy}
              onChange={(v) => void themeSet('/frame/rules', v)}
            />
            <Check
              label="Registration crosses"
              checked={edits?.frame?.crosses ?? spec.frame.crosses}
              control="themeMode.frame.crosses"
              disabled={busy}
              onChange={(v) => void themeSet('/frame/crosses', v)}
            />
            <SideRow
              label="Inset"
              doc="The rails’ distance from the sheet edge in sheet px; the content box never moves"
            >
              <input
                type="number"
                className="ts-tm-number"
                min={8}
                max={400}
                defaultValue={edits?.frame?.inset ?? spec.frame.rail}
                key={`inset-${edits?.frame?.inset ?? spec.frame.rail}`}
                data-control="themeMode.frame.inset"
                disabled={busy}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const n = Number(event.currentTarget.value);
                  if (Number.isFinite(n)) void themeSet('/frame/inset', Math.round(n));
                }}
                onBlur={(event) => {
                  const n = Number(event.currentTarget.value);
                  if (Number.isFinite(n) && n !== (edits?.frame?.inset ?? spec.frame.rail))
                    void themeSet('/frame/inset', Math.round(n));
                }}
              />
            </SideRow>
            <h3 className="ts-tm-head">Corner slot</h3>
            <SideRow label="Mark" doc="The GT mark, your own picture, or nothing">
              <select
                className="ts-tm-select"
                value={slots.markKind}
                data-control="themeMode.mark.kind"
                disabled={busy}
                onChange={(event) => {
                  const kind = event.target.value as ThemeMarkKind;
                  void themeSet('/mark', { ...(edits?.mark ?? {}), kind });
                }}
              >
                {THEME_MARK_KINDS.filter((kind) => kind !== 'turboslide').map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === 'gt' ? 'GT mark' : kind === 'picture' ? 'Picture' : 'None'}
                  </option>
                ))}
              </select>
            </SideRow>
            {slots.markKind === 'picture' ? (
              <SideRow label="Picture asset" doc="The id of a picture asset of this presentation">
                <select
                  className="ts-tm-select"
                  value={edits?.mark?.assetId ?? ''}
                  data-control="themeMode.mark.asset"
                  disabled={busy}
                  onChange={(event) =>
                    void themeSet('/mark', {
                      ...(edits?.mark ?? { kind: 'picture' }),
                      kind: 'picture',
                      assetId: event.target.value,
                    })
                  }
                >
                  <option value="">Pick an asset</option>
                  {Object.keys(deck.assets).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </SideRow>
            ) : null}
            <h3 className="ts-tm-head">Counter</h3>
            <Check
              label="Show slide numbers"
              checked={slots.counterShown}
              control="themeMode.counter.show"
              disabled={busy}
              onChange={(v) => void themeSet('/counter/show', v)}
            />
            <SideRow label="Side">
              <select
                className="ts-tm-select"
                value={edits?.counter?.side ?? spec.counter.side}
                data-control="themeMode.counter.side"
                disabled={busy}
                onChange={(event) => void themeSet('/counter/side', event.target.value)}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </SideRow>
            <SideRow label="Format">
              <select
                className="ts-tm-select"
                value={edits?.counter?.format ?? 'n'}
                data-control="themeMode.counter.format"
                disabled={busy}
                onChange={(event) => void themeSet('/counter/format', event.target.value)}
              >
                <option value="n">Number</option>
                <option value="n-of-total">Number of total</option>
              </select>
            </SideRow>
            <h3 className="ts-tm-head">Chips</h3>
            <Check
              label="Paper chips on picture slides"
              checked={edits?.chips?.show ?? spec.chips}
              control="themeMode.chips.show"
              disabled={busy}
              onChange={(v) => void themeSet('/chips/show', v)}
            />
            {edits !== undefined ? (
              <button
                type="button"
                className="pt-ib is-text ts-tm-reset"
                data-control="themeMode.reset"
                onClick={() => void run('theme.reset', {})}
                {...tipProps({
                  name: 'Reset theme',
                  doc: 'Removes every edit so the base theme applies again',
                })}
              >
                <span className="pt-lb">Reset theme</span>
              </button>
            ) : null}
          </>
        ) : selectedLayout !== undefined && selectedLayoutId !== undefined ? (
          <>
            <h3 className="ts-tm-head">
              {selectedLayout.displayName ?? selectedLayout.name ?? selectedLayoutId}
            </h3>
            {(selectedLayout.blocks ?? []).length === 0 ? (
              <p className="ts-tm-empty">
                Insert placeholder adds a title, subtitle, body text, slide number or image box.
              </p>
            ) : null}
            {(selectedLayout.blocks ?? []).map((block) => (
              <SideRow key={block.id} label={`${block.type} ${block.id}`}>
                <select
                  className="ts-tm-select"
                  value={(block as { placeholder?: PlaceholderKind }).placeholder ?? ''}
                  data-control={`themeMode.placeholder.${block.id}`}
                  disabled={busy}
                  onChange={(event) =>
                    void run('layout.setPlaceholder', {
                      layoutId: selectedLayoutId,
                      blockId: block.id,
                      placeholder: event.target.value === '' ? null : event.target.value,
                    })
                  }
                >
                  <option value="">Not a placeholder</option>
                  {PLACEHOLDER_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {PLACEHOLDER_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </SideRow>
            ))}
            <div className="ts-tm-actions">
              <button
                type="button"
                className="pt-ib is-text"
                data-control="themeMode.layout.rename"
                onClick={() => void renameLayout(selectedLayoutId)}
              >
                <span className="pt-lb">Rename layout</span>
              </button>
              <button
                type="button"
                className="pt-ib is-text"
                data-control="themeMode.layout.duplicate"
                onClick={() => void run('layout.duplicate', { id: selectedLayoutId })}
              >
                <span className="pt-lb">Duplicate layout</span>
              </button>
              <button
                type="button"
                className="pt-ib is-text"
                data-control="themeMode.layout.delete"
                onClick={() => void deleteLayout(selectedLayoutId)}
              >
                <span className="pt-lb">Delete layout</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="ts-tm-head">
              {selected.kind === 'layout' ? layoutName(selected.id) : ''}
            </h3>
            <p className="ts-tm-empty">
              A built in layout is code; Duplicate layout makes a copy you can edit, Delete layout
              hides it from the pickers.
            </p>
            {selected.kind === 'layout' ? (
              <div className="ts-tm-actions">
                <button
                  type="button"
                  className="pt-ib is-text"
                  data-control="themeMode.layout.duplicate"
                  onClick={() => void run('layout.duplicate', { id: selected.id })}
                >
                  <span className="pt-lb">Duplicate layout</span>
                </button>
                <button
                  type="button"
                  className="pt-ib is-text"
                  data-control="themeMode.layout.delete"
                  onClick={() => void deleteLayout(selected.id)}
                >
                  <span className="pt-lb">Delete layout</span>
                </button>
              </div>
            ) : null}
          </>
        )}
      </aside>
      {menu !== null ? (
        <div
          className="ts-tm-menu ts-chrome"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          data-control="themeMode.layout.menu"
          onMouseLeave={() => setMenu(null)}
        >
          <button
            type="button"
            role="menuitem"
            className="ts-tm-menu-row"
            data-control="themeMode.layout.menu.new"
            onClick={() => {
              setMenu(null);
              void newLayout();
            }}
          >
            New layout
          </button>
          <button
            type="button"
            role="menuitem"
            className="ts-tm-menu-row"
            data-control="themeMode.layout.menu.duplicate"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              void run('layout.duplicate', { id });
            }}
          >
            Duplicate layout
          </button>
          {isCustomLayoutId(menu.id) ? (
            <button
              type="button"
              role="menuitem"
              className="ts-tm-menu-row"
              data-control="themeMode.layout.menu.rename"
              onClick={() => {
                const id = menu.id as CustomLayoutId;
                setMenu(null);
                void renameLayout(id);
              }}
            >
              Rename layout
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="ts-tm-menu-row"
            data-control="themeMode.layout.menu.delete"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              void deleteLayout(id);
            }}
          >
            Delete layout
          </button>
        </div>
      ) : null}
    </div>
  );
}
