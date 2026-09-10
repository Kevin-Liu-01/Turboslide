// Rendering of the four-rule inline text markup of SPEC 4.2, including the GT word transform of
// SPEC 5.2. Parsing and serializing live in @turboslide/schema/text (the stored form is canonical,
// SPEC 4.4), so the renderer reads runs and never keeps a second parser.
import { parseText, serializeRuns } from '@turboslide/schema/text';
import type { Run, Text } from '@turboslide/schema/text';
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

export function renderRuns(runs: Run[], options: RenderTextOptions): string {
  let out = '';
  let open = false;
  for (const run of runs) {
    const want = run.b === true;
    if (want !== open) {
      out += want ? '<b>' : '</b>';
      open = want;
    }
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
  if (open) out += '</b>';
  return out;
}

/** Plain text of a Text, for titles and alt fallbacks: markup removed, GT kept as letters. */
export function plainText(text: Text): string {
  return parseText(text)
    .map((run) => run.t)
    .join('');
}
