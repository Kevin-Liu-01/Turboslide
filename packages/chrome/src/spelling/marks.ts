// Underline errors as the editor's own marks (gslides-parity SPEC-5 7.2, 0.35; R10 4.7): the
// engine's findings painted as a wavy underline on every text box in view through the CSS Custom
// Highlight API (`CSS.highlights.set('ts-misspelling', new Highlight(...ranges))`, styled by
// `::highlight(ts-misspelling)` in text-tools-dialogs.css), which changes no DOM, so the exports
// and the HTML build never carry a mark. Where the API is absent the decorator wraps each
// misspelt range in `<span class="ts-misspelling">` inside the rendered run, an editor only
// change removed before any read of the DOM (`clearMisspellingMarks`) and never made by
// `@turboslide/render`. The ranges are plain offsets inside a run element's text nodes (the same
// offsets InlineText's selectionOffsets use), resolved here against the element's text nodes.
import type { SpellingFinding } from '../text-tools';

export const MISSPELLING_HIGHLIGHT = 'ts-misspelling';
export const MISSPELLING_CLASS = 'ts-misspelling';

type HighlightRegistryLike = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => boolean;
};

type HighlightCtor = new (...ranges: Range[]) => unknown;

/** True when the page offers the CSS Custom Highlight API. */
export function supportsHighlightApi(scope: typeof globalThis = globalThis): boolean {
  const css = (scope as unknown as { CSS?: { highlights?: unknown } }).CSS;
  return (
    css !== undefined &&
    css.highlights !== undefined &&
    typeof (scope as unknown as { Highlight?: unknown }).Highlight === 'function'
  );
}

/** The text nodes of an element in document order, skipping the GT mark (its letters are not text). */
function textNodesOf(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const parent = node.parentElement;
    if (parent === null || !parent.closest('[data-gt-word], .ts-gt-word')) out.push(node as Text);
    node = walker.nextNode();
  }
  return out;
}

/** A DOM Range over a plain offset range of an element's text, or null when the offsets are outside it. */
export function rangeFor(root: HTMLElement, start: number, end: number): Range | null {
  if (end <= start) return null;
  const nodes = textNodesOf(root);
  let offset = 0;
  let from: { node: Text; at: number } | null = null;
  let to: { node: Text; at: number } | null = null;
  for (const node of nodes) {
    const length = node.data.length;
    if (from === null && start >= offset && start <= offset + length)
      from = { node, at: start - offset };
    if (end >= offset && end <= offset + length) {
      to = { node, at: end - offset };
      if (from !== null) break;
    }
    // a paragraph break counts one plain character between block level children
    offset += length;
    const next = node.nextSibling;
    if (next !== null && (next as HTMLElement).tagName === 'BR') offset += 1;
  }
  if (from === null || to === null) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(from.node, from.at);
  range.setEnd(to.node, to.at);
  return range;
}

export type MarkTarget = {
  element: HTMLElement;
  findings: ReadonlyArray<Pick<SpellingFinding, 'range'>>;
};

/**
 * Paints the findings: one Highlight over every range where the API exists, else the decorator.
 * Returns how many ranges were painted. Idempotent: an earlier paint is cleared first.
 */
export function paintMisspellings(
  targets: ReadonlyArray<MarkTarget>,
  scope: typeof globalThis = globalThis,
): number {
  clearMisspellingMarks(
    targets.map((target) => target.element),
    scope,
  );
  const ranges: Range[] = [];
  for (const target of targets)
    for (const finding of target.findings) {
      const range = rangeFor(target.element, finding.range[0], finding.range[1]);
      if (range !== null) ranges.push(range);
    }
  if (ranges.length === 0) return 0;
  if (supportsHighlightApi(scope)) {
    const registry = (scope as unknown as { CSS: { highlights: HighlightRegistryLike } }).CSS
      .highlights;
    const Highlight = (scope as unknown as { Highlight: HighlightCtor }).Highlight;
    registry.set(MISSPELLING_HIGHLIGHT, new Highlight(...ranges));
    return ranges.length;
  }
  for (const range of ranges) {
    const span = range.startContainer.ownerDocument!.createElement('span');
    span.className = MISSPELLING_CLASS;
    span.setAttribute('data-editor-only', '');
    try {
      range.surroundContents(span);
    } catch {
      // a range across two runs: leave it unmarked rather than break the run structure
    }
  }
  return ranges.length;
}

/** Removes every mark: the registry's highlight and the decorator spans, the text joined back. */
export function clearMisspellingMarks(
  elements: ReadonlyArray<HTMLElement>,
  scope: typeof globalThis = globalThis,
): void {
  if (supportsHighlightApi(scope)) {
    (scope as unknown as { CSS: { highlights: HighlightRegistryLike } }).CSS.highlights.delete(
      MISSPELLING_HIGHLIGHT,
    );
  }
  for (const element of elements) {
    for (const span of Array.from(
      element.querySelectorAll<HTMLElement>(`span.${MISSPELLING_CLASS}`),
    )) {
      const parent = span.parentNode;
      if (parent === null) continue;
      while (span.firstChild !== null) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
    element.normalize();
  }
}

/**
 * The `data-run` id of a finding (render/blocks/context.ts: `<blockId>/<json pointer>`, so
 * `bullets/items/0/text`); a title slide's fields render as the `heading`, `lead` and `big` runs.
 */
export function runIdOfFinding(finding: Pick<SpellingFinding, 'blockId' | 'path'>): string | null {
  if (finding.blockId !== undefined) return `${finding.blockId}${finding.path}`;
  if (finding.path === '/heading' || finding.path === '/lead' || finding.path === '/big')
    return `${finding.path.slice(1)}/text`;
  return null;
}

/** The run elements of the slides in view, keyed by `data-run`: the findings are grouped onto them. */
export function markTargetsOf(
  root: ParentNode,
  findings: ReadonlyArray<SpellingFinding>,
  runIdOf: (finding: SpellingFinding) => string | null = runIdOfFinding,
): MarkTarget[] {
  const groups = new Map<string, SpellingFinding[]>();
  for (const finding of findings) {
    const key = runIdOf(finding);
    if (key === null) continue;
    const list = groups.get(key) ?? [];
    list.push(finding);
    groups.set(key, list);
  }
  const out: MarkTarget[] = [];
  for (const [key, list] of groups) {
    const element = root.querySelector<HTMLElement>(`[data-run="${key}"]`);
    if (element !== null) out.push({ element, findings: list });
  }
  return out;
}
