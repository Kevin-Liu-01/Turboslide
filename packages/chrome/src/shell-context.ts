import { createContext, useContext } from 'react';

import type { ShellDensity, ShellItem, ShellKeys, ShellMode } from './shell-data';

/**
 * The ShellState contract (SPEC 2.2), ported from
 * Prototemplate/src/components/viewer/shell-context.ts (PORTED_FROM.json).
 * Two optional flags are added for Turboslide: `panel` and `search` say
 * whether the route offers the index panel and the search palette, so the
 * key owner and the help card only name keys that do something (the palette
 * is M3, the panel has no Turboslide equivalent yet).
 */

/** The stage box, published by ViewerShell's ResizeObserver on .pt-stagewrap. */
export type StageSize = { width: number; height: number };

/**
 * The stage geometry, in its own context so the ResizeObserver's ticks
 * (every frame of the sidebar's 220ms width transition, every window
 * resize) re-render only the fixed sheet that reads them, never the sidebar
 * rows, the toolbar or the book (directive 7.5).
 */
export type StageState = { stageSize: StageSize };

/** Which way the last paged move went; the slide-change animation reads it. */
export type ShellDir = 'next' | 'prev';

/**
 * A mode change in flight (directive 7.4): the view that is leaving and the
 * one that is entering. Set for the length of the cross-fade and null at
 * rest. `mode` already names the entering view while this is set.
 */
export type ShellTransition = { from: ShellMode; to: ShellMode };

/**
 * Everything ViewerShell publishes to its children and to route code.
 * Read it with usePtShell().
 */
export type ShellState = {
  /** the shell's id prop; the storage namespace (`gt-shell-mode:<id>`) */
  id: string;
  /** the modes the route offers; the first is the default */
  modes: readonly ShellMode[];
  /** the key table for the current mode */
  keys: ShellKeys;
  /** the word for one item in the toasts and the help rows: `slide` */
  noun: string;
  /** every selectable item across sections, in order */
  items: readonly ShellItem[];
  /** the items the count and the arrows run over: every item of every paged section */
  paged: readonly ShellItem[];
  mode: ShellMode;
  /** the mode change being animated, or null at rest; the mode field already names its destination */
  transition?: ShellTransition | null;
  density: ShellDensity;
  /** the list toggle's state: what the reader asked for, and what the toolbar's List button shows pressed */
  sidebarOpen: boolean;
  /**
   * True while the list should be in the DOM: it follows sidebarOpen at once
   * when the list opens and lags it by the sidebar duration (--pt-dur-sb,
   * 220ms) when the list closes or present mode begins, so the content can
   * fade out while the column narrows (directive 7.4).
   */
  sidebarShown?: boolean;
  panelOpen: boolean;
  helpOpen: boolean;
  present: boolean;
  /** window.innerWidth at or below 900 */
  narrow: boolean;
  /** the active item id; empty when nothing is marked */
  active: string;
  /** position of the active item in paged, or -1 */
  index: number;
  /** which way the last paged move went; `next` until the first move backwards, and when absent */
  dir?: ShellDir;
  /** paged.length */
  total: number;
  /** a word before the count, when the count needs one */
  countLabel?: string;
  /** false until the shell's mount effect has applied the saved state and the hash */
  ready?: boolean;
  /** the route offers the index panel (R); absent means no */
  panel?: boolean;
  /** the route offers the search palette (Cmd K); absent means no (SPEC 6.3, M3) */
  search?: boolean;
  setMode: (mode: ShellMode) => void;
  setDensity: (density: ShellDensity) => void;
  setSidebar: (open: boolean) => void;
  setPanel: (open: boolean) => void;
  setHelp: (open: boolean) => void;
  setPresent: (on: boolean) => void;
  /** make an item active: updates the hash, scrolls its row into view, calls onSelect; an empty id clears the mark */
  select: (id: string) => void;
  /** move the active item by delta through the paged items, clamped to the first and last */
  step: (delta: number) => void;
  /** show the toast for 1400ms, or for `hold` milliseconds */
  say: (msg: string, hold?: number) => void;
};

/** What ViewerShell passes to the provider. Null outside a shell. */
export type ShellProviderValue = ShellState | null;

export const ShellContext = createContext<ShellProviderValue>(null);

/** Shell state for any component under ViewerShell. Throws outside one. */
export function usePtShell(): ShellState {
  const value = useContext(ShellContext);
  if (!value) throw new Error('usePtShell must be called inside ViewerShell');
  return value;
}

export const StageContext = createContext<StageState | null>(null);

/** The stage box for the fixed sheet. Throws outside ViewerShell. */
export function usePtStage(): StageState {
  const value = useContext(StageContext);
  if (!value) throw new Error('usePtStage must be called inside ViewerShell');
  return value;
}
