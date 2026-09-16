// The equation block's renderer (gslides-parity SPEC-5 0.43, 8.1; R06 7.1, 8.4, 9.2): LaTeX
// source to MathML Core through Temml, emitted inside the positioned block root on every surface
// (the editor, the viewer, present mode, the clones, the thumbnails, the print document, the
// Perfect raster, the PDF, the standalone file). The block is the one writer of `<math>` in a
// rendered sheet: `sanitize/html.ts` keeps `math` in `FORBIDDEN_TAGS` for the escape block, and
// Temml runs with `trust: false`, so `\href`, `\htmlClass` and `\includegraphics` never reach the
// output. `mathml` kept from a PowerPoint import is emitted as is while `tex` is empty, after the
// validator's shape check (`isMathMlElement`).
//
// Temml (164 KB minified) is a lazy chunk in the studio (SPEC-5 16.6: nothing loads before the
// ready mark unless the deck uses it), so the engine is a registry this module owns:
// `setEquationEngine` installs it, `loadEquationEngine` imports it once (the browser and any Node
// caller that did not load theme-node.ts), and a render that runs before the engine is present
// emits the block's source in a `data-equation-pending` root and asks for the engine, which
// announces itself with `EQUATION_ENGINE_EVENT` on the document so the editor renders again.
// theme-node.ts (the Node entry every render path loads) installs the engine at import time, so
// the CLI, the exporter, the thumbnails and the render worker never see the pending root.
//
// The stylesheet: Temml's own `Temml-Local.css` scoped under `.ts-sheet .equation` (the
// generated `equation-css.ts`), the 9 KB Temml supplement font, the block's own rules and the
// math face (Latin Modern Math, GUST Font License, 380 KB woff2, `packages/render/assets/`),
// inlined by theme-node.ts as data URIs only for a deck that holds an equation (SPEC-5 8.1) and
// served by Vite as assets in the studio, injected once by the lazy chunk (`installEquationCss`).
import type { BlockOf } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { GOOGLE_ALIASES } from '@turboslide/schema/blocks/equation';
import type { EquationDisplay } from '@turboslide/schema/blocks/equation';
import { colorCss } from '@turboslide/schema/color';
import { isMathMlElement } from '@turboslide/schema/validate/equation';

import { classes, el, escapeText, style } from '../html.ts';
import type { BlockContext } from './context.ts';
import { dataAttrs, raster, rootAttrs } from './context.ts';
import { dropShadowDeclaration } from './primitives.ts';
import {
  EQUATION_SCOPE,
  TEMML_SCOPED_CSS,
  TEMML_VERSION,
  TEMML_WOFF2_TOKEN,
} from './equation-css.ts';

export { EQUATION_SCOPE, TEMML_VERSION };

/** The part of Temml this module calls; the default export of `temml` satisfies it. */
export type EquationEngine = {
  renderToString: (
    expression: string,
    options?: {
      displayMode?: boolean;
      annotate?: boolean;
      throwOnError?: boolean;
      trust?: boolean;
      macros?: Record<string, string>;
    },
  ) => string;
};

/** The event the engine's arrival dispatches on `document` (the editor renders its slides again). */
export const EQUATION_ENGINE_EVENT = 'ts-equation-engine';

/** The id of the `<style>` the lazy chunk installs in a browser document. */
export const EQUATION_CSS_STYLE_ID = 'ts-equation-css';

/** The font family the sheet draws MathML in (R06 12.2: Latin Modern Math, Temml's reference face). */
export const MATH_FONT_FAMILY = 'Latin Modern Math';

/** The body size of the sheet, the equation's size when the block names none (SPEC-5 8.1; sheet.css `p`). */
export const EQUATION_DEFAULT_SIZE = 22;

let engine: EquationEngine | null = null;
let loading: Promise<EquationEngine> | null = null;

/** The engine installed, or null before the lazy chunk (or theme-node.ts) arrives. */
export function equationEngine(): EquationEngine | null {
  return engine;
}

/** Forgets the engine (tests of the pending root alone; a surface never calls it). */
export function clearEquationEngine(): void {
  engine = null;
  loading = null;
}

/** Installs the engine; a browser document gets its pending roots drawn and is told so it renders again. */
export function setEquationEngine(next: EquationEngine): void {
  engine = next;
  if (typeof document !== 'undefined') {
    installEquationCss(document);
    patchPendingEquations(document);
    document.dispatchEvent(new CustomEvent(EQUATION_ENGINE_EVENT));
  }
}

/**
 * The roots rendered before the engine arrived carry their source in a `data-equation-pending`
 * span (`sourceMarkup`); once Temml is present each is drawn in place, so the editor's sheet
 * shows the MathML without a React render (the next render finds the engine and draws the same
 * markup). Answers the count patched; nothing to do when no root is pending.
 */
export function patchPendingEquations(root: Document | Element): number {
  if (engine === null) return 0;
  let patched = 0;
  for (const span of root.querySelectorAll('.equation > [data-equation-pending]')) {
    const block = span.parentElement;
    if (block === null) continue;
    const tex = span.textContent ?? '';
    if (tex.trim() === '') continue;
    const display: EquationDisplay =
      block.getAttribute('data-display') === 'inline' ? 'inline' : 'block';
    const rendered = equationMathml(tex, display, engine);
    block.innerHTML = rendered.mathml;
    if (rendered.error !== undefined) block.setAttribute('data-equation-error', rendered.error);
    else block.removeAttribute('data-equation-error');
    patched += 1;
  }
  return patched;
}

/**
 * Loads Temml once. In the studio the import is the lazy chunk of SPEC-5 16.6 (nothing of Temml
 * is in the entry graph); in Node it resolves the package the render package depends on.
 */
export function loadEquationEngine(): Promise<EquationEngine> {
  if (engine !== null) return Promise.resolve(engine);
  loading ??= import('temml').then((module) => {
    const loaded = (module as { default?: EquationEngine }).default ?? (module as EquationEngine);
    setEquationEngine(loaded);
    return loaded;
  });
  return loading;
}

export type EquationRender = {
  /** the `<math>` markup, or Temml's error span when the source did not parse */
  mathml: string;
  /** the parse error's sentence, absent when the source parsed */
  error?: string;
};

/**
 * One source to MathML the way the sheet draws it (SPEC-5 8.1): display math for a placed
 * object, `annotate` so the LaTeX travels inside `semantics/annotation`, `trust` off, Google's
 * aliases as macros. A source that does not parse answers Temml's `merror` markup and the message
 * (the lint layer reports `equation/parse` from it); nothing throws.
 */
export function equationMathml(
  tex: string,
  display: EquationDisplay = 'block',
  using: EquationEngine | null = engine,
): EquationRender {
  if (using === null) throw new Error('the equation engine is not loaded (loadEquationEngine)');
  const options = {
    displayMode: display !== 'inline',
    annotate: true,
    trust: false,
    macros: { ...GOOGLE_ALIASES },
  };
  try {
    return { mathml: using.renderToString(tex, { ...options, throwOnError: true }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      mathml: using.renderToString(tex, { ...options, throwOnError: false }),
      error: message.replace(/^ParseError:\s*/, ''),
    };
  }
}

/** True when any slide holds an equation block, cells of a composite included (theme-node.ts inlines the math face then). */
export function deckUsesEquations(slides: ReadonlyArray<Slide>): boolean {
  return slides.some((slide) => slideBlocks(slide).some(({ block }) => block.type === 'equation'));
}

export type EquationCssSources = {
  /** the url of the 9 KB Temml supplement (`Temml.woff2`), a data URI or a served path */
  temmlWoff2: string;
  /** the url of Latin Modern Math; absent leaves the OS math face stack (a deck without an equation pays nothing) */
  mathWoff2?: string;
};

/**
 * The equation stylesheet: Temml's rules scoped under `.ts-sheet .equation`, the supplement's
 * `@font-face`, the math face when a url is given, and the block's own rules (the root fills a
 * positioned box and centres the formula; an inline equation sits at text size).
 */
export function equationCss(sources: EquationCssSources): string {
  const scope = EQUATION_SCOPE;
  const rules = [
    TEMML_SCOPED_CSS.replace(TEMML_WOFF2_TOKEN, sources.temmlWoff2),
    ...(sources.mathWoff2 !== undefined
      ? [
          `@font-face { font-family: '${MATH_FONT_FAMILY}'; src: url(${sources.mathWoff2}) format('woff2'); font-weight: normal; font-style: normal; font-display: swap; }`,
        ]
      : []),
    `${scope} math { font-family: '${MATH_FONT_FAMILY}', 'Cambria Math', 'STIX Two Math', math; }`,
    `${scope} { display: block; font-size: ${EQUATION_DEFAULT_SIZE}px; color: var(--ink); line-height: 1.2; }`,
    `.ts-sheet .free > .equation, .ts-sheet .free > .link > .equation { width: 100%; height: 100%; box-sizing: border-box; display: grid; place-items: center; overflow: visible; }`,
    `${scope} math.tml-display { width: auto; }`,
    `${scope}.is-inline math { display: inline-block; }`,
    `${scope} .equation-source, ${scope} .temml-error { font-family: var(--mono); font-size: 0.75em; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }`,
    `${scope} .equation-source { color: var(--ink-2); }`,
  ];
  return rules.join('\n');
}

/**
 * The stylesheet in a browser document once (the studio; the lazy chunk installs it when the
 * engine arrives). The font files travel as Vite assets addressed from this module, so nothing
 * of them loads before the first equation.
 */
export function installEquationCss(root: Document): void {
  if (root.getElementById(EQUATION_CSS_STYLE_ID) !== null) return;
  const element = root.createElement('style');
  element.id = EQUATION_CSS_STYLE_ID;
  element.textContent = equationCss({
    temmlWoff2: new URL('../../assets/Temml.woff2', import.meta.url).href,
    mathWoff2: new URL('../../assets/latinmodern-math.woff2', import.meta.url).href,
  });
  root.head.append(element);
}

/** The source shown while the engine loads or when a block carries neither source nor MathML. */
function sourceMarkup(tex: string): string {
  return el('span', { class: 'equation-source', 'data-equation-pending': '' }, escapeText(tex));
}

/**
 * The block: `<div class="equation" data-block data-type="equation">` at the block's size and
 * colour holding the `<math>` (or the kept MathML, or the pending source), declared as a 2x alpha
 * raster for the Editable text Fallback, the SVG and the ODP (SPEC-5 8.3). `alt` becomes
 * `aria-label` (R06 11); without one the MathML itself is the accessible content.
 */
export function renderEquation(block: BlockOf<'equation'>, ctx: BlockContext): string {
  const display: EquationDisplay = block.display ?? 'block';
  const inline = style(
    block.size !== undefined && `font-size:${block.size}px`,
    block.color !== undefined && `color:${colorCss(block.color)}`,
    dropShadowDeclaration(block.shadow),
  );
  const rasterAttrs = raster(ctx, block.id, 'dia', true);
  const attributes: Record<string, string | undefined> = {
    ...rootAttrs(block, ctx, {
      className: classes('equation', display === 'inline' && 'is-inline'),
      style: inline,
    }),
    'aria-label': block.alt !== undefined && block.alt !== '' ? block.alt : undefined,
    'data-display': display,
  };
  const tex = block.tex.trim();
  let inner: string;
  if (tex === '') {
    const kept = block.mathml ?? '';
    inner = isMathMlElement(kept) ? kept : sourceMarkup(block.tex);
  } else if (engine === null) {
    inner = sourceMarkup(block.tex);
    if (typeof document !== 'undefined') void loadEquationEngine().catch(() => undefined);
  } else {
    const rendered = equationMathml(tex, display, engine);
    inner = rendered.mathml;
    if (rendered.error !== undefined) {
      attributes['data-equation-error'] = rendered.error;
      ctx.warnings.push(`${block.id}: equation/parse ${rendered.error}`);
    }
  }
  const open = `<div${attrsOf(attributes)}${dataAttrs(rasterAttrs)}>`;
  return `${open}${inner}</div>`;
}

function attrsOf(record: Record<string, string | undefined>): string {
  let out = '';
  for (const [name, value] of Object.entries(record)) {
    if (value === undefined) continue;
    out += ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`;
  }
  return out;
}
