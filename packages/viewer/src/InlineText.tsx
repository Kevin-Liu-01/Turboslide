// Inline text editing on the stage (SPEC 6.4, 6.9): `contenteditable` on the run element itself,
// a run toolbar with the weight 500 run, the link and the GT mark, and one commit that rebuilds the
// four-rule markup from the edited DOM through the runs (SPEC 4.2: parseText and serializeRuns are
// the one parser). A standalone GT typed into the text becomes the mark at once and the document
// keeps the letters: the DOM to runs walk reads the mark span as a gt run and a bare `GT` word as
// one too, and serializeRuns writes both as the two letters. The pure walk (runsFromNode,
// textFromNode, textCommitMutation) runs over a structural node type so inline-text.test.ts pins
// the round trip in Node; the component owns the DOM.
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import { GT_WORD_HTML } from '@turboslide/render/text';
import type { Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import type { Box } from '@turboslide/schema/render';
import { mergeRuns, parseText, serializeRuns } from '@turboslide/schema/text';
import type { Run, Text as Markup } from '@turboslide/schema/text';

import { blockById } from './Selection';

import './InlineText.css';

/** The shape of a DOM node the walk reads; real Nodes satisfy it, and the tests build plain objects. */
export type RunNode = {
  nodeType: number;
  nodeValue?: string | null;
  nodeName: string;
  childNodes: ArrayLike<RunNode>;
  getAttribute?: (name: string) => string | null;
  classList?: { contains: (name: string) => boolean };
};

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** The class of the mark span the renderer writes (render/text.ts GT_WORD_HTML). */
export const GT_WORD_CLASS = 'gt-word';

type Flags = { b?: true; link?: string };

/**
 * A plain text as runs with any standalone GT split out as a gt run: the letters are escaped for
 * `*` and `[` only, so parseText applies the boundary rule the renderer uses (SPEC 4.2).
 */
function plainRuns(text: string, flags: Flags): Run[] {
  if (flags.link !== undefined) {
    // link text is literal: the parser never flags GT inside a link (text.ts)
    const run: Run = { t: text, link: flags.link };
    if (flags.b) run.b = true;
    return [run];
  }
  const escaped = text.replace(/[*[]/g, '\\$&');
  return parseText(escaped).map((run) => {
    const out: Run = { t: run.t };
    if (run.gt) out.gt = true;
    if (flags.b) out.b = true;
    if (flags.link !== undefined) out.link = flags.link;
    return out;
  });
}

function walk(node: RunNode, flags: Flags, out: Run[]): void {
  if (node.nodeType === TEXT_NODE) {
    // contenteditable writes a non-breaking space where a text node starts or ends in a space,
    // at the run's end and on both sides of the non-editable GT mark (measured: "with " + the
    // mark + "\u00a0now" after typing "with GT now"); the nowrap device (SPEC 4.2) is never the
    // first or the last character of a text node, so only the two edges are turned back
    const value = (node.nodeValue ?? '').replace(/^\u00a0/, ' ').replace(/\u00a0$/, ' ');
    if (value !== '') out.push(...plainRuns(value, flags));
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const name = node.nodeName.toUpperCase();
  if (name === 'BR' || name === 'SVG' || name === 'USE') return;
  if (node.classList?.contains(GT_WORD_CLASS)) {
    const run: Run = { t: 'GT', gt: true };
    if (flags.b) run.b = true;
    out.push(run);
    return;
  }
  const next: Flags = { ...flags };
  if (name === 'B' || name === 'STRONG') next.b = true;
  if (name === 'A') {
    const href = node.getAttribute?.('href');
    if (href) next.link = href;
  }
  for (const child of Array.from(node.childNodes)) walk(child, next, out);
}

/** The runs of an edited run element: text, `<b>`, `<a href>` and the mark span (SPEC 4.2). */
export function runsFromNode(node: RunNode): Run[] {
  const out: Run[] = [];
  walk(node, {}, out);
  return mergeRuns(out).map((run) => ({ ...run, t: run.t.replace(/[\n\r]+/g, ' ') }));
}

/** The canonical markup of an edited run element: what the commit writes (SPEC 4.4). */
export function textFromNode(node: RunNode): Markup {
  return serializeRuns(runsFromNode(node)).trim();
}

/** The slide field a title or statement pseudo block renders (slide.ts: heading, lead, big). */
function slideTextPath(slide: Slide, blockId: string): string {
  if (slide.kind === 'title') return blockId === 'lead' ? '/lead' : '/heading';
  return '/big';
}

/** The markup a run currently holds in the document, read at the data-run pointer. */
export function readRunText(slide: Slide, blockId: string, pointer: string): Markup | undefined {
  let value: unknown;
  if (slide.kind === 'title' || slide.kind === 'statement') {
    value = getAt(slide, slideTextPath(slide, blockId));
  } else {
    const block = blockById(slide, blockId);
    value = block ? getAt(block, `/${pointer}`) : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * The one write a text commit is (M3 plan, item 3): `block.set` of the whole markup at the run's
 * pointer, or `slide.set` for the text of a title or statement slide, which is a slide field.
 * Null when the markup equals what the document holds.
 */
export function textCommitMutation(
  slide: Slide,
  blockId: string,
  pointer: string,
  text: Markup,
): Mutation | null {
  const current = readRunText(slide, blockId, pointer);
  if (current === text) return null;
  if (slide.kind === 'title' || slide.kind === 'statement') {
    return { op: 'slide.set', slideId: slide.id, path: slideTextPath(slide, blockId), value: text };
  }
  return { op: 'block.set', slideId: slide.id, blockId, path: `/${pointer}`, value: text };
}

// ---------------------------------------------------------------------------------------------
// The at-once mark (SPEC 6.4: a typed standalone GT renders as the mark at once)

const WORD_CHARACTER = /[A-Za-z0-9_\-./]/;

function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !WORD_CHARACTER.test(text.charAt(index));
}

function markSpan(): HTMLElement | null {
  const template = document.createElement('template');
  template.innerHTML = GT_WORD_HTML;
  const mark = template.content.firstElementChild;
  if (!(mark instanceof HTMLElement)) return null;
  // the mark moves as one character
  mark.contentEditable = 'false';
  return mark;
}

/**
 * Replaces every standalone `GT` in the text nodes under `root` with the mark span, except one the
 * caret still touches (the reader may be typing `GTX`), and puts the caret back where it was.
 * Text inside a link or an existing mark is left alone.
 */
export function markGtInEditable(root: HTMLElement): void {
  const selection = window.getSelection();
  const caret =
    selection && selection.rangeCount > 0 && selection.isCollapsed ? selection.getRangeAt(0) : null;
  const texts: globalThis.Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(`.${GT_WORD_CLASS}, a`)) continue;
    texts.push(node as globalThis.Text);
  }
  for (const node of texts) {
    const value = node.nodeValue ?? '';
    let at = value.indexOf('GT');
    while (at >= 0) {
      const standalone = isBoundary(value, at - 1) && isBoundary(value, at + 2);
      const caretTouches =
        caret !== null &&
        caret.startContainer === node &&
        caret.startOffset >= at &&
        caret.startOffset <= at + 2;
      if (standalone && !caretTouches) {
        const mark = markSpan();
        if (!mark) return;
        const caretInTail =
          caret !== null && caret.startContainer === node && caret.startOffset > at + 2
            ? caret.startOffset - (at + 2)
            : null;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 2);
        range.deleteContents();
        range.insertNode(mark);
        if (caretInTail !== null && selection) {
          const tail = mark.nextSibling;
          if (tail && tail.nodeType === TEXT_NODE) {
            const restored = document.createRange();
            restored.setStart(tail, Math.min(caretInTail, tail.nodeValue?.length ?? 0));
            restored.collapse(true);
            selection.removeAllRanges();
            selection.addRange(restored);
          }
        }
        // the node list changed under us: start over, one standalone GT fewer
        markGtInEditable(root);
        return;
      }
      at = value.indexOf('GT', at + 2);
    }
  }
}

/** Inserts the mark span at the caret inside `root` and moves the caret after it. */
export function insertGtMark(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return;
  const mark = markSpan();
  if (!mark) return;
  range.deleteContents();
  range.insertNode(mark);
  const after = document.createRange();
  after.setStartAfter(mark);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
}

/** The link around the caret inside `root`, or null. */
function linkAtCaret(root: HTMLElement): HTMLAnchorElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const node = selection.getRangeAt(0).startContainer;
  const el = node instanceof Element ? node : node.parentElement;
  const link = el?.closest('a') ?? null;
  return link && root.contains(link) ? link : null;
}

// ---------------------------------------------------------------------------------------------
// The component

export type InlineTextProps = {
  /** the run element inside the rendered slide; the component makes it editable for its lifetime */
  element: HTMLElement;
  /** the run's box in sheet pixels, for the toolbar's place */
  box: Box;
  /** the stage scale */
  k: number;
  /** called once with the canonical markup when the edit changed the text */
  onCommit: (text: Markup) => void;
  /** called when the edit ends without a change, or on Escape */
  onCancel: () => void;
  /** called on every input so the Editor can re-measure the run's box */
  onInput?: () => void;
};

/** The toolbar sits this many CSS pixels above the run; below it when the run is at the sheet's top. */
const TOOLBAR_H = 32;
const TOOLBAR_GAP = 6;

/**
 * The editing session on one run (SPEC 6.4). Mounting makes the element editable and focuses it;
 * Enter commits, Escape restores the original markup, a blur that leaves the toolbar commits, and
 * an unmount before either (the slide changed under the edit) restores without a commit. The
 * toolbar's buttons keep the focus in the run (their pointer down is prevented), so the selection
 * they act on is the one the reader made. Bold and link go through execCommand, which splits and
 * merges the inline elements; the walk reads `<b>` and `<a>` back as runs. One element is one
 * session: the Editor keys the component by the run it edits.
 */
export function InlineText({ element, box, k, onCommit, onCancel, onInput }: InlineTextProps) {
  const originalHtml = useRef('');
  const originalText = useRef('');
  const done = useRef(false);
  const toolbar = useRef<HTMLDivElement>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  /* the latest callbacks, so the listeners bound once see them */
  const callbacks = useRef({ onCommit, onCancel, onInput });
  callbacks.current = { onCommit, onCancel, onInput };

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const text = textFromNode(element);
    element.removeAttribute('contenteditable');
    element.removeAttribute('spellcheck');
    element.classList.remove('ts-editing');
    if (commit && text !== originalText.current) {
      callbacks.current.onCommit(text);
      return;
    }
    element.innerHTML = originalHtml.current;
    callbacks.current.onCancel();
  };

  const openLink = () => {
    const link = linkAtCaret(element);
    setLinkValue(link?.getAttribute('href') ?? '');
    setLinkOpen(true);
    window.setTimeout(() => linkField.current?.focus(), 0);
  };

  /* the deferred teardown (see below) and the listener removal it runs */
  const pending = useRef(0);
  const listeners = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    /* React's StrictMode simulates an unmount right after mount (chrome/lib/useMountEffect.ts
       explains the device): the teardown waits one tick, and a re-run inside that tick keeps the
       session instead of restoring the run and starting over. Measured during the M3 integration:
       under the dev server's StrictMode the synchronous cleanup ended every inline edit at once,
       leaving the run editable with no listeners. */
    const later = () => {
      pending.current = window.setTimeout(() => {
        pending.current = 0;
        listeners.current?.();
        listeners.current = null;
        if (!done.current) finish(false);
      }, 0);
    };
    if (pending.current) {
      window.clearTimeout(pending.current);
      pending.current = 0;
      return later;
    }
    originalHtml.current = element.innerHTML;
    originalText.current = textFromNode(element);
    element.querySelectorAll<HTMLElement>(`.${GT_WORD_CLASS}`).forEach((mark) => {
      mark.contentEditable = 'false';
    });
    element.contentEditable = 'true';
    element.spellcheck = false;
    element.classList.add('ts-editing');
    element.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        document.execCommand('bold');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        openLink();
      }
    };
    const onInputEvent = () => {
      markGtInEditable(element);
      callbacks.current.onInput?.();
    };
    const onBlur = (e: FocusEvent) => {
      const to = e.relatedTarget;
      if (to instanceof Node && toolbar.current?.contains(to)) return;
      finish(true);
    };
    const onPaste = (e: ClipboardEvent) => {
      // pasted text lands as plain text; a line break is a space (SPEC 4.2: no line breaks in a Text)
      e.preventDefault();
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*[\n\r]+\s*/g, ' ');
      document.execCommand('insertText', false, text);
    };
    element.addEventListener('keydown', onKey);
    element.addEventListener('input', onInputEvent);
    element.addEventListener('blur', onBlur);
    element.addEventListener('paste', onPaste);
    listeners.current = () => {
      element.removeEventListener('keydown', onKey);
      element.removeEventListener('input', onInputEvent);
      element.removeEventListener('blur', onBlur);
      element.removeEventListener('paste', onPaste);
    };
    return later;
    // one element is one session; finish and openLink read refs and state setters only
  }, [element]);

  const applyLink = () => {
    setLinkOpen(false);
    element.focus();
    const url = linkValue.trim();
    const existing = linkAtCaret(element);
    if (url === '') {
      if (existing) {
        const parent = existing.parentNode;
        while (existing.firstChild) parent?.insertBefore(existing.firstChild, existing);
        existing.remove();
      }
    } else if (existing) {
      existing.setAttribute('href', url);
    } else {
      document.execCommand('createLink', false, url);
    }
    callbacks.current.onInput?.();
  };

  /* the run keeps the focus and its selection; the button acts on that selection */
  const keep = (e: ReactPointerEvent<HTMLElement>) => e.preventDefault();

  const onLinkKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setLinkOpen(false);
      element.focus();
    }
  };

  const above = box[1] * k - TOOLBAR_H - TOOLBAR_GAP;
  const style = {
    left: Math.max(0, box[0] * k),
    top: above >= 0 ? above : (box[1] + box[3]) * k + TOOLBAR_GAP,
  };

  return (
    <div
      ref={toolbar}
      className="ts-run-toolbar"
      role="toolbar"
      aria-label="Text run"
      style={style}
    >
      <button
        type="button"
        className="pt-ib pt-icon"
        title="Weight 500 run (⌘B)"
        aria-label="Weight 500 run"
        data-control="run.bold"
        onPointerDown={keep}
        onClick={() => document.execCommand('bold')}
      >
        <span className="ts-run-glyph">B</span>
      </button>
      <button
        type="button"
        className="pt-ib pt-icon"
        title="Link (⌘K)"
        aria-label="Link"
        aria-pressed={linkOpen}
        data-control="run.link"
        onPointerDown={keep}
        onClick={openLink}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
          <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
        </svg>
      </button>
      <button
        type="button"
        className="pt-ib pt-icon"
        title="GT mark"
        aria-label="GT mark"
        data-control="run.gt"
        onPointerDown={keep}
        onClick={() => {
          insertGtMark(element);
          callbacks.current.onInput?.();
        }}
      >
        <svg width={16} height={10} fill="currentColor" aria-hidden="true">
          <use href="#gt-mark" />
        </svg>
      </button>
      {linkOpen ? (
        <input
          ref={linkField}
          className="ts-run-link"
          type="url"
          value={linkValue}
          placeholder="https://"
          aria-label="Link address"
          data-control="run.link.href"
          onChange={(e) => setLinkValue(e.target.value)}
          onKeyDown={onLinkKey}
          onBlur={applyLink}
        />
      ) : null}
    </div>
  );
}
