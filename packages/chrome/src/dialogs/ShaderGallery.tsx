import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  GALLERY_MATERIAL_IDS,
  SHADER_CATEGORIES,
  featuredPresetOf as featuredPresetNameOf,
  materialEntry,
} from '@turboslide/materials/catalog';
import type { MaterialEntry, ShaderCategory } from '@turboslide/materials/catalog';
import type { MaterialHandle } from '@turboslide/materials/mount';
import { shaderPaletteOf } from '@turboslide/materials/presets';
import type { ShaderPalette } from '@turboslide/materials/presets';
import { shaderPreviewUrl as previewUrlOf } from '@turboslide/materials/previews';
import type { MaterialBlock, MaterialPreset } from '@turboslide/schema/blocks/material';
import { MATERIAL_ANCHORS, materialBlockSchema } from '@turboslide/schema/blocks/material';
import { CATALOG } from '@turboslide/schema/catalog';
import { deckAppearance } from '@turboslide/schema/deck';
import type { BlockId } from '@turboslide/schema/ids';
import { loadMaterialMount } from '@turboslide/viewer/MaterialMount';

import { Dialog } from '../Dialog';
import { factsOf, insertBlockPlan } from '../editor-shell';
import type { ShellSettings } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { SHADER_GALLERY } from '../menus/strings';
import { isParked } from '../parked-controls';
import { tipProps } from '../Tooltip';

import './ShaderGallery.css';

/**
 * The Shader gallery (docs/FEATURES.md 5.4; audit-shaders 3 and 14): one picker for Insert >
 * Shader and Change background > Shader > Choose. A grid of 320 by 200 stills, one card per
 * catalog entry with its presets as a row of small tiles under the name; a search field over the
 * name, the description and the engine; five category chips (Fluid, Light, Metal, Gradient,
 * Graphic, the catalog's `category`); the featured order first (`GALLERY_MATERIAL_IDS`: liquid
 * metal, gem smoke, god rays, mesh gradient, smoke ring, grain gradient), then the catalog's
 * order. The stills are B5's build time webp files in ink and paper (`packages/materials/previews/`,
 * named by `@turboslide/materials/previews`), and the dialog says so in one sentence under its
 * title (judge-seller addition 12); a still whose file is not on the build draws a plate with no
 * text (5.5). No canvas mounts in the dialog (5.6): the one exception is the P1 hover live mount
 * of 5.2 item 5, one at a time 400 ms after the pointer rests on a card, in the deck's kit
 * colours (`shaderPaletteOf`), disposed on leave, off under reduced motion, while View > Play
 * shaders is Off and while `dialog.shader.hover` is parked.
 *
 * One click on a card inserts the entry's featured preset and one click on a preset tile inserts
 * that preset, each through `insertBlockPlan(facts, 'material', ...)`, whose shader branch (B5)
 * places the block in the largest free rectangle of the body; the dialog then selects the block
 * through `onSelectBlock` and closes. From the Background dialog the same grid (`ShaderGalleryGrid`,
 * compact, carrying the `dialog.shader` root itself) hands the pick back and Place writes the
 * ground (Background.tsx). Every control carries its `data-control` id (build/b1.md R5) and a
 * parked id is hidden through parked-controls.ts (5.10, 7.2).
 *
 * Ids: `dialog.shader` (the card, or the embedded grid's root), `dialog.shader.sentence`,
 * `dialog.shader.search`, `dialog.shader.categories`, `dialog.shader.category.<id>`,
 * `dialog.shader.engines` and `dialog.shader.engine.<family>` (P1, drawn only when two engine
 * families are available), `dialog.shader.grid`, `dialog.shader.tile.<materialId>` (the card, with
 * the still `.thumb` and the preset tiles `.preset.<name>` inside it), `dialog.shader.empty`,
 * `dialog.shader.error`, `dialog.shader.hover.<materialId>` (the live host while it is mounted).
 */

// ---------------------------------------------------------------------------------------------
// The words live in menus/strings.ts (build/b1.md R3); re-exported for the dialog's readers

export { SHADER_GALLERY };

// ---------------------------------------------------------------------------------------------
// The catalog as the gallery reads it

/** The catalog's available entries in the gallery's order: the featured six first, then the catalog's (5.4). */
export function insertableMaterials(): MaterialEntry[] {
  return GALLERY_MATERIAL_IDS.map((id) => materialEntry(id)).filter(
    (entry): entry is MaterialEntry => entry !== undefined && entry.available,
  );
}

/** The engine a catalog id names, from its prefix: the word the search field matches (5.4). */
export function engineOf(materialId: string): { family: string; label: string } {
  const family = materialId.split(':')[0] ?? materialId;
  const label =
    family === 'paper'
      ? 'Paper Shaders'
      : family === 'proto'
        ? 'Prototemplate'
        : family === 'glyph'
          ? 'Glyphfield'
          : family;
  return { family, label };
}

/** The preset a card inserts (5.2): the catalog's featured preset, else its first; `undefined` for an entry without presets. */
export function featuredPresetOf(entry: MaterialEntry): MaterialPreset | undefined {
  const name = featuredPresetNameOf(entry);
  return name === undefined ? undefined : entry.presets.find((preset) => preset.name === name);
}

/** The still of an entry (320 by 200) or the tile of one of its presets, as `@turboslide/materials/previews` names it. */
export function shaderPreviewUrl(entry: MaterialEntry, preset?: MaterialPreset): string {
  return previewUrlOf(entry.id, preset?.name);
}

/** True when the search matches the name, the description or the engine (5.4). */
export function matchesShaderQuery(entry: MaterialEntry, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') return true;
  return `${entry.label} ${entry.doc} ${engineOf(entry.id).label}`.toLocaleLowerCase().includes(q);
}

/** The cards for a query, a category chip and an engine family, in the gallery's order. */
export function shaderGalleryEntries(
  query: string,
  category: ShaderCategory | 'all' = 'all',
  engine: string | 'all' = 'all',
  entries: MaterialEntry[] = insertableMaterials(),
): MaterialEntry[] {
  return entries.filter(
    (entry) =>
      (category === 'all' || entry.category === category) &&
      (engine === 'all' || engineOf(entry.id).family === engine) &&
      matchesShaderQuery(entry, query),
  );
}

/** The engine families with an available entry; the engine chips draw only when there are two (P1). */
export function shaderEngines(entries: MaterialEntry[] = insertableMaterials()): {
  family: string;
  label: string;
}[] {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const engine = engineOf(entry.id);
    if (!seen.has(engine.family)) seen.set(engine.family, engine.label);
  }
  return [...seen].map(([family, label]) => ({ family, label }));
}

/** True while the schema knows the `motion` field of 5.1 (B5's), so the default of question 5 is written only then. */
export function schemaHasMotion(): boolean {
  return 'motion' in materialBlockSchema.shape;
}

/**
 * The material block a card inserts (5.2, 5.4): the catalog's blank with the entry, the preset,
 * the alt "The liquid metal shader" (5.1) and, once the schema carries it, `motion.play: 'show'`
 * (question 5's default). The plan's shader branch (B5) places it.
 */
export function shaderBlockOf(
  id: BlockId,
  entry: MaterialEntry,
  preset: MaterialPreset | undefined = featuredPresetOf(entry),
): MaterialBlock {
  const made = CATALOG.material.make(id) as MaterialBlock;
  const block: MaterialBlock = {
    ...made,
    materialId: entry.id,
    alt: SHADER_GALLERY.alt(entry.label),
  };
  delete block.uniforms;
  if (preset === undefined) delete block.preset;
  else block.preset = preset.name;
  if (schemaHasMotion())
    (block as MaterialBlock & { motion?: { play: 'off' | 'show' } }).motion = { play: 'show' };
  return block;
}

/** The words a covering shader reads by, never an id: "Liquid metal, Diamond"; the id alone when the catalog lost the entry. */
export function shaderWordsOf(materialId: string, presetName?: string): string {
  const entry = materialEntry(materialId);
  if (entry === undefined) return materialId;
  const preset =
    presetName === undefined ? undefined : entry.presets.find((each) => each.name === presetName);
  return preset === undefined ? entry.label : SHADER_GALLERY.pickWords(entry.label, preset.label);
}

/**
 * The one sentence a failed Place shows (5.5; audit-shaders 1): the rejection's message when it
 * is one sentence, else the sentence of 5.5, so a log, a command line or a stack never reaches the
 * dialog whatever the transport answered.
 */
export function shaderFailureSentence(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).trim();
  if (message === '') return SHADER_GALLERY.placeFailed;
  if (
    message.includes('\n') ||
    message.length > 160 ||
    /browser logs|<launching>|\/tmp\/|\bat \S+:\d+|Error:\s*\S+Error/i.test(message)
  )
    return SHADER_GALLERY.placeFailed;
  return message;
}

// ---------------------------------------------------------------------------------------------
// The hover live mount (P1, 5.2 item 5; row shaders.insert.gallery-hover-live)

export const HOVER_LIVE_DELAY_MS = 400;

function reducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** The View > Play shaders setting (5.6): Off stops the hover mount too; absent reads as the default. */
function playShadersOff(settings: ShellSettings): boolean {
  return (settings as Readonly<Record<string, unknown>>).playShaders === 'off';
}

// ---------------------------------------------------------------------------------------------
// The grid

export type ShaderPick = { entry: MaterialEntry; preset: MaterialPreset | undefined };

export type ShaderGalleryGridProps = {
  /** a card or a preset tile was clicked, or Enter ran on the active card */
  onPick: (pick: ShaderPick) => void;
  /** the two column layout inside the Background dialog */
  compact?: boolean;
  /** the hover live mount of 5.2 item 5; off by default */
  hoverLive?: boolean;
  /** the search field takes the focus on mount (the dialog); the Background dialog leaves it */
  autoFocus?: boolean;
  /** the root's own control id when the grid sits inside another dialog (`dialog.shader`) */
  control?: string;
};

const WALK_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
/** Two 320 px columns in the dialog and two compact columns in the Background dialog (ShaderGallery.css). */
const GRID_COLUMNS = 2;

function tileDomId(materialId: string): string {
  return `ts-shader-tile-${materialId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/**
 * A card's still: the `<img>` with `data-decoded="true"` once decoded, or a plate with no text
 * (5.5) when the file is not on the build (B5's `scripts/build-shader-previews.mjs` writes it).
 */
function Still({ src, control }: { src: string; control: string }) {
  const [state, setState] = useState<'loading' | 'decoded' | 'missing'>('loading');
  useEffect(() => {
    setState('loading');
  }, [src]);
  if (state === 'missing')
    return <span className="ts-shader-still is-plate" data-control={control} data-thumb="none" />;
  return (
    <img
      className="ts-shader-still"
      data-control={control}
      data-decoded={state === 'decoded' ? 'true' : undefined}
      src={src}
      alt=""
      width={320}
      height={200}
      loading="eager"
      decoding="async"
      draggable={false}
      onLoad={(event) => {
        const image = event.currentTarget;
        const done = () => setState('decoded');
        if (typeof image.decode === 'function') image.decode().then(done, done);
        else done();
      }}
      onError={() => setState('missing')}
    />
  );
}

/** A preset's tile under the name: its still, or a plate when the file is not on the build. */
function PresetTile({ src }: { src: string }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
  }, [src]);
  if (missing) return <span className="ts-shader-preset-plate" data-thumb="none" />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setMissing(true)}
    />
  );
}

export function ShaderGalleryGrid({
  onPick,
  compact = false,
  hoverLive = false,
  autoFocus = false,
  control,
}: ShaderGalleryGridProps) {
  const { input, settings } = useEditorShell();
  const parked = (id: string) => isParked(id, settings);
  const root = useRef<HTMLDivElement>(null);
  /* the grid opened inside another dialog (Change background's Shader row) sits under that
     dialog's fields, so it is scrolled into view once, the way the Logo dialog's Your brand group is */
  useEffect(() => {
    if (!compact) return;
    const el = root.current;
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ShaderCategory | 'all'>('all');
  const [engine, setEngine] = useState<string | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const entries = useMemo(() => insertableMaterials(), []);
  const engines = useMemo(() => shaderEngines(entries), [entries]);
  const cards = useMemo(
    () => shaderGalleryEntries(query, category, engine, entries),
    [query, category, engine, entries],
  );
  const words = SHADER_GALLERY;
  /* the deck's kit colours for the hover mount (5.7): the palette B5 resolves the presets from */
  const deck = input.document.deck;
  const palette = useMemo<ShaderPalette>(
    () => shaderPaletteOf(deck.brand, deckAppearance(deck)),
    [deck],
  );

  /* the active card: the one the arrows moved to when it is still drawn, else the first */
  const active = useMemo(() => {
    if (selected !== null && cards.some((entry) => entry.id === selected)) return selected;
    return cards[0]?.id ?? null;
  }, [cards, selected]);

  /* the hover live mount (P1): one handle at a time, mounted 400 ms after the pointer rests on a
     card, disposed when it leaves the card, the grid unmounts or the card list changes */
  const hoverTimer = useRef(0);
  const hoverHandle = useRef<{
    id: string;
    host: HTMLElement;
    handle: MaterialHandle | null;
    alive: boolean;
  } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverAllowed =
    hoverLive && !parked('dialog.shader.hover') && !reducedMotion() && !playShadersOff(settings);
  const disposeHover = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = 0;
    const current = hoverHandle.current;
    if (current !== null) {
      current.alive = false;
      current.handle?.dispose();
      current.host.replaceChildren();
      hoverHandle.current = null;
    }
    setHovered(null);
  };
  useEffect(() => disposeHover, []);
  useEffect(() => {
    if (hovered !== null && !cards.some((entry) => entry.id === hovered)) disposeHover();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the card list alone decides
  }, [cards]);
  const armHover = (entry: MaterialEntry) => {
    if (!hoverAllowed) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const host = document.getElementById(`${tileDomId(entry.id)}-hover`);
      if (host === null) return;
      const record = { id: entry.id, host, handle: null as MaterialHandle | null, alive: true };
      hoverHandle.current = record;
      setHovered(entry.id);
      const preset = featuredPresetOf(entry);
      loadMaterialMount()
        .then(({ mountMaterial }) =>
          mountMaterial(
            host,
            {
              materialId: entry.id,
              ...(preset === undefined ? {} : { preset: preset.name }),
              anchor: MATERIAL_ANCHORS[1],
            },
            { speed: 1, frame: MATERIAL_ANCHORS[1], minPixelRatio: 1, palette },
          ),
        )
        .then((handle) => {
          if (!record.alive) {
            handle.dispose();
            host.replaceChildren();
            return;
          }
          record.handle = handle;
        })
        .catch(() => {
          /* the frame contract: the still stands when the mount fails */
          if (hoverHandle.current === record) disposeHover();
        });
    }, HOVER_LIVE_DELAY_MS);
  };

  const move = (delta: number) => {
    if (cards.length === 0) return;
    const at = Math.max(
      0,
      cards.findIndex((entry) => entry.id === active),
    );
    const next = Math.min(cards.length - 1, Math.max(0, at + delta));
    const entry = cards[next];
    if (entry === undefined) return;
    setSelected(entry.id);
    const el = document.getElementById(tileDomId(entry.id));
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' });
  };
  const onFieldKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const entry = cards.find((each) => each.id === active);
      if (entry !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        onPick({ entry, preset: featuredPresetOf(entry) });
      }
      return;
    }
    if (!WALK_KEYS.has(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'ArrowLeft') move(-1);
    else if (event.key === 'ArrowDown') move(GRID_COLUMNS);
    else if (event.key === 'ArrowUp') move(-GRID_COLUMNS);
    else if (event.key === 'Home') move(-cards.length);
    else if (event.key === 'End') move(cards.length);
  };

  const searchTip = tipProps({ name: words.search, doc: words.searchDoc, key: 'Enter' });
  const chip = (
    key: string,
    label: string,
    on: boolean,
    set: () => void,
    id: string,
    doc: string,
  ) =>
    parked(id) ? null : (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={on}
        className={cn('ts-dialog-chip', on && 'is-on')}
        data-control={id}
        onClick={set}
        {...tipProps({ name: label, doc })}
      >
        {label}
      </button>
    );

  return (
    <div
      ref={root}
      className={cn('ts-shader', compact && 'is-compact')}
      data-control={control}
      data-hover-live={hoverAllowed ? 'true' : undefined}
    >
      {parked('dialog.shader.search') ? null : (
        <input
          className="ts-shader-search"
          type="search"
          value={query}
          autoFocus={autoFocus}
          placeholder={words.search}
          aria-label={words.search}
          aria-activedescendant={active === null ? undefined : tileDomId(active)}
          data-control="dialog.shader.search"
          autoComplete="off"
          spellCheck={false}
          {...searchTip}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            searchTip.onKeyDown(event);
            onFieldKey(event);
          }}
        />
      )}
      {parked('dialog.shader.categories') ? null : (
        <div
          className="ts-dialog-chips ts-shader-chips"
          role="radiogroup"
          aria-label={words.categories}
          data-control="dialog.shader.categories"
        >
          {chip(
            'all',
            words.all,
            category === 'all',
            () => setCategory('all'),
            'dialog.shader.category.all',
            words.allDoc,
          )}
          {SHADER_CATEGORIES.map((each) =>
            chip(
              each.id,
              each.label,
              category === each.id,
              () => setCategory(each.id),
              `dialog.shader.category.${each.id}`,
              words.categoryDoc(each.label),
            ),
          )}
        </div>
      )}
      {engines.length > 1 && !parked('dialog.shader.engines') ? (
        /* P1 (5.2 item 2): the engine chips draw only once a second engine family is available */
        <div
          className="ts-dialog-chips ts-shader-chips"
          role="radiogroup"
          aria-label={words.engines}
          data-control="dialog.shader.engines"
        >
          {chip(
            'all',
            words.all,
            engine === 'all',
            () => setEngine('all'),
            'dialog.shader.engine.all',
            'Every engine',
          )}
          {engines.map((each) =>
            chip(
              each.family,
              each.label,
              engine === each.family,
              () => setEngine(each.family),
              `dialog.shader.engine.${each.family}`,
              words.engineDoc(each.label),
            ),
          )}
        </div>
      ) : null}
      <div
        className="ts-shader-grid pt-scroll"
        role="listbox"
        aria-label={words.title}
        data-control="dialog.shader.grid"
        data-count={cards.length}
        data-query={query.trim()}
        data-category={category}
      >
        {cards.map((entry) => {
          const cardControl = `dialog.shader.tile.${entry.id}`;
          if (parked(cardControl)) return null;
          const featured = featuredPresetOf(entry);
          const isActive = active === entry.id;
          const live = hovered === entry.id;
          const { onMouseEnter, onMouseLeave, ...tip } = tipProps({
            name: entry.label,
            doc: entry.doc,
          });
          /* the card is one option: the still and the name insert the featured preset, the tiles
             under the name insert theirs (their click stops here) */
          return (
            <div
              key={entry.id}
              role="option"
              id={tileDomId(entry.id)}
              aria-selected={isActive}
              aria-label={entry.label}
              tabIndex={-1}
              className={cn('ts-shader-card', isActive && 'is-active')}
              data-control={cardControl}
              data-material={entry.id}
              data-preset={featured?.name}
              onClick={() => onPick({ entry, preset: featured })}
              onPointerEnter={() => armHover(entry)}
              onPointerLeave={() => disposeHover()}
              onMouseEnter={(event) => {
                onMouseEnter(event);
                setSelected(entry.id);
              }}
              onMouseLeave={onMouseLeave}
              {...tip}
            >
              <span className="ts-shader-frame">
                <Still src={shaderPreviewUrl(entry)} control={`${cardControl}.thumb`} />
                {hoverAllowed ? (
                  <span
                    id={`${tileDomId(entry.id)}-hover`}
                    className={cn('ts-shader-hover', live && 'is-live')}
                    data-control={live ? `dialog.shader.hover.${entry.id}` : undefined}
                    data-material={live ? entry.id : undefined}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span className="ts-shader-name">{entry.label}</span>
              {entry.presets.length > 1 ? (
                <div
                  className="ts-shader-presets"
                  role="group"
                  aria-label={`${entry.label} presets`}
                >
                  {entry.presets.map((preset) => {
                    const presetControl = `${cardControl}.preset.${preset.name}`;
                    if (parked(presetControl)) return null;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        className={cn(
                          'ts-shader-preset',
                          featured?.name === preset.name && 'is-featured',
                        )}
                        data-control={presetControl}
                        data-preset={preset.name}
                        aria-label={preset.label}
                        tabIndex={-1}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPick({ entry, preset });
                        }}
                        {...tipProps({
                          name: preset.label,
                          doc: words.presetDoc(entry.label, preset.label),
                        })}
                      >
                        <PresetTile src={shaderPreviewUrl(entry, preset)} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {cards.length === 0 ? (
          <p className="ts-shader-empty" role="status" data-control="dialog.shader.empty">
            {words.empty(query.trim())}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The dialog

/** Insert > Shader: the gallery over the shell; a pick inserts through the plan and selects the block. */
export function ShaderGalleryDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const words = SHADER_GALLERY;

  const pick = ({ entry, preset }: ShaderPick) => {
    if (busy) return;
    const plan = insertBlockPlan(
      factsOf(input, shell.lastLayout),
      'material',
      (id) => shaderBlockOf(id, entry, preset),
      words.insertLabel,
    );
    if ('refused' in plan) {
      setError(plan.refused);
      return;
    }
    const blockId = (plan.input.block as { id: string }).id;
    setBusy(true);
    setError(null);
    input
      .dispatch(plan.action, plan.input)
      .then(() => {
        /* selected (5.4): the plan's own id, whichever side placed the box */
        input.onSelectBlock?.(blockId);
        shell.closeDialog();
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={720}
      control="dialog.shader"
      className="ts-shader-dialog"
    >
      <p className="ts-shader-sentence" data-control="dialog.shader.sentence">
        {words.sentence}
      </p>
      {/* P1 (5.2 item 5): `hoverLive` is the one token the fix round drops when the row is red */}
      <ShaderGalleryGrid onPick={pick} hoverLive autoFocus />
      {error !== null ? (
        <p className="ts-dialog-error" role="alert" data-control="dialog.shader.error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
