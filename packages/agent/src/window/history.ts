// The editor's undo model (SPEC 6.7): every gesture is a Write; undo and redo walk the client's
// log, and each undo is itself a forward write carrying the inverse mutations the reducer returned,
// so the server log stays linear and an agent's later write never silently undoes a designer's
// redo. This module is the pure part: the two stacks and the visible log. The studio commits the
// mutations it hands back through the same commit path a click uses. Framework free, no DOM.
import type { Mutation } from '@turboslide/schema/mutations';

export type HistoryEntry = {
  /** a client-side id, unique within the session */
  id: number;
  /** the mutations the write carried */
  mutations: Mutation[];
  /** the reducer's inverse: applying these in order returns the document to the state before */
  inverse: Mutation[];
  /** what the History panel prints: 'block.set', 'undo', 'source' */
  label: string;
  /** ISO time the client recorded the step */
  at: string;
};

export type HistoryStep = { kind: 'edit' | 'undo' | 'redo'; entry: HistoryEntry };

export type EditHistory = {
  /** a new edit: goes on the undo stack and clears the redo stack */
  push: (entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: string }) => HistoryEntry;
  /** the entry to undo next: moved to the redo stack; the caller commits entry.inverse forward */
  undo: () => HistoryEntry | undefined;
  /** the entry to redo next: moved back to the undo stack; the caller commits entry.mutations forward */
  redo: () => HistoryEntry | undefined;
  /** the entries to undo, newest first, down to and including the entry with `id` */
  undoTo: (id: number) => HistoryEntry[];
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** the undo stack, oldest first: what History lists with "Undo to here" */
  entries: () => readonly HistoryEntry[];
  /** every step taken, in order */
  log: () => readonly HistoryStep[];
  /** forget everything: after a conflict the document was replaced and the inverses no longer apply */
  clear: () => void;
};

export function createEditHistory(now: () => string = () => new Date().toISOString()): EditHistory {
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  const steps: HistoryStep[] = [];
  let nextId = 1;
  return {
    push(input) {
      const entry: HistoryEntry = {
        id: nextId,
        mutations: input.mutations,
        inverse: input.inverse,
        label: input.label,
        at: input.at ?? now(),
      };
      nextId += 1;
      undoStack.push(entry);
      redoStack = [];
      steps.push({ kind: 'edit', entry });
      return entry;
    },
    undo() {
      const entry = undoStack.pop();
      if (entry === undefined) return undefined;
      redoStack.push(entry);
      steps.push({ kind: 'undo', entry });
      return entry;
    },
    redo() {
      const entry = redoStack.pop();
      if (entry === undefined) return undefined;
      undoStack.push(entry);
      steps.push({ kind: 'redo', entry });
      return entry;
    },
    undoTo(id) {
      const index = undoStack.findIndex((entry) => entry.id === id);
      if (index < 0) return [];
      const out: HistoryEntry[] = [];
      while (undoStack.length > index) {
        const entry = undoStack.pop();
        if (entry === undefined) break;
        redoStack.push(entry);
        steps.push({ kind: 'undo', entry });
        out.push(entry);
      }
      return out;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    entries: () => undoStack,
    log: () => steps,
    clear() {
      undoStack = [];
      redoStack = [];
      steps.length = 0;
    },
  };
}
