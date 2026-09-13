// Rendering of the inline text markup of SPEC 4.2 and gslides-parity SPEC-2 7.2 (five rules: the
// display run, the link, the mark span, the linked span and the GT word), including the GT word
// transform of SPEC 5.2. Parsing and serializing live in @turboslide/schema/text (the stored form
// is canonical, SPEC 4.4), so the renderer reads runs and never keeps a second parser.
import { parseText, serializeRuns } from '@turboslide/schema/text';
import type { Run, Text } from '@turboslide/schema/text';
import { colorCss } from '@turboslide/schema/color';
import { escapeAttr, escapeText } from './html.ts';

export { parseText, serializeRuns };

/** Escapes a literal string so parseText reads it back as one plain run. */
export function escapeLiteral(value: string): string {
  return serializeRuns([{ t: value }]);
}

/** The GT word markup of head.html lines 70 to 74 (SPEC 5.2). */
export const GT_WORD_HTML =
  '<span class="gt-word"><svg aria-hidden="true"><use href="#gt-mark"/></svg><span class="sr">GT</span></span>';

export type RenderTextOptions = {
  /** Draw standalone GT as the mark (SPEC 5.2; off for panel text and when the deck disables it). */
  gtWord: boolean;
  /** Rows.links tables follow every link with the external glyph (head:121). */
  linkGlyph?: boolean;
  /** Links open in a new tab the way the deck writes them unless this is false. */
  externalLinks?: boolean;
};

/**
 * Renders a Text to HTML: `*x*` becomes `<b>`, links `<a>` (plus `.ic.ext` after the link in link
 * tables, wrapped in a nowrap `.lk` span so link and glyph never separate, s32:3), a standalone GT
 * becomes the mark unless disabled, everything else is escaped.
 */
export function renderText(text: Text, options: RenderTextOptions): string {
  return renderRuns(parseText(text), options);
}

/**
 * One wrapper element a run opens (SPEC-2 7.2): the tag and, for the two coloured marks, the
 * inline style. Two wrappers are the same when tag and style agree, so adjacent runs sharing the
 * outer marks share the element.
 */
type Wrapper = { tag: string; style?: string };

/**
 * The wrappers of a run, outermost first, in the order SPEC-2 7.2 fixes: `<b>`, `<i>`, `<u>`,
 * `<s>`, `<sup>` or `<sub>`, `<span style="color">`, `<mark style="background">`. The link is not
 * a wrapper: it is written per run inside them.
 */
function wrappersOf(run: Run): Wrapper[] {
  const out: Wrapper[] = [];
  if (run.b === true) out.push({ tag: 'b' });
  if (run.i === true) out.push({ tag: 'i' });
  if (run.u === true) out.push({ tag: 'u' });
  if (run.s === true) out.push({ tag: 's' });
  if (run.sup === true) out.push({ tag: 'sup' });
  else if (run.sub === true) out.push({ tag: 'sub' });
  if (run.color !== undefined) out.push({ tag: 'span', style: `color:${colorCss(run.color)}` });
  if (run.hl !== undefined) out.push({ tag: 'mark', style: `background:${colorCss(run.hl)}` });
  return out;
}

function sameWrapper(a: Wrapper | undefined, b: Wrapper | undefined): boolean {
  return a !== undefined && b !== undefined && a.tag === b.tag && a.style === b.style;
}

function openTag(wrapper: Wrapper): string {
  return wrapper.style === undefined
    ? `<${wrapper.tag}>`
    : `<${wrapper.tag} style="${escapeAttr(wrapper.style)}">`;
}

/**
 * The runs as HTML. The wrappers nest in the fixed order and adjacent runs that share their outer
 * wrappers share the elements (as `<b>` did before the marks), so `*a* *b*` and `[a]{i}[b]{i}`
 * each render as one element. A Text without marks renders byte for byte as before this round.
 */
export function renderRuns(runs: Run[], options: RenderTextOptions): string {
  let out = '';
  let open: Wrapper[] = [];
  for (const run of runs) {
    const want = wrappersOf(run);
    let shared = 0;
    while (shared < open.length && shared < want.length && sameWrapper(open[shared], want[shared]))
      shared += 1;
    for (let i = open.length - 1; i >= shared; i -= 1) out += `</${(open[i] as Wrapper).tag}>`;
    for (let i = shared; i < want.length; i += 1) out += openTag(want[i] as Wrapper);
    open = want;
    if (run.link) {
      const anchor = `<a href="${escapeAttr(run.link)}"${
        options.externalLinks === false ? '' : ' target="_blank" rel="noreferrer"'
      }>${escapeText(run.t)}</a>`;
      out += options.linkGlyph
        ? `<span class="lk">${anchor}<svg class="ic ext" aria-hidden="true"><use href="#i-arrow-top-right-on-square"/></svg></span>`
        : anchor;
      continue;
    }
    if (run.gt && options.gtWord) {
      out += GT_WORD_HTML;
      continue;
    }
    out += escapeText(run.t);
  }
  for (let i = open.length - 1; i >= 0; i -= 1) out += `</${(open[i] as Wrapper).tag}>`;
  return out;
}

/** Plain text of a Text, for titles and alt fallbacks: markup removed, GT kept as letters. */
export function plainText(text: Text): string {
  return parseText(text)
    .map((run) => run.t)
    .join('');
}
