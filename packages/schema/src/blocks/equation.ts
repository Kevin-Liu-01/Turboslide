// The equation block (gslides-parity SPEC-5 1.2, 0.43, 8.1; R06 7.1): LaTeX source rendered as
// MathML Core on every surface, exported as native OMML with a raster fallback. The fields are
// declared here without `BlockBase`, so `blocks.ts` composes `equationBlockSchema` the way it
// composes the table and chart blocks and no import cycle forms. `tex` is a string, not a Text:
// the four markup rules do not apply to it and `\n` inside an environment is legal. The
// integrator landed this module on day 0 as the typed seam of SPEC-5 1.6; from day 1 it is B6's
// (MILESTONES-5 B6 "Owns"), who adds `GOOGLE_ALIASES` (the thirteen Google names of R06 9.3 as
// Temml macros) and `EQUATION_SYMBOLS` (the five groups of R06 4 with `command`, `latex`,
// `unicode` and `omml` per entry) on day 3.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { Color } from '../color.ts';
import { colorSchema } from '../color.ts';

export const EQUATION_DISPLAYS = ['inline', 'block'] as const;
export type EquationDisplay = (typeof EQUATION_DISPLAYS)[number];

/** Google Docs' six toolbar groups (SPEC-5 8.2): the five dropdowns and Turboslide's More. */
export const EQUATION_SYMBOL_GROUPS = [
  'greek',
  'operations',
  'relations',
  'mathOperators',
  'arrows',
  'more',
] as const;
export type EquationSymbolGroup = (typeof EQUATION_SYMBOL_GROUPS)[number];

/** Google's labels for the groups (R06 13 item 3: Math operators is the help page's label). */
export const EQUATION_GROUP_LABELS: Readonly<Record<EquationSymbolGroup, string>> = {
  greek: 'Greek letters',
  operations: 'Miscellaneous operations',
  relations: 'Relations',
  mathOperators: 'Math operators',
  arrows: 'Arrows',
  more: 'More',
};

/** One row of `EQUATION_SYMBOLS` (B6, day 3): the toolbar glyph, its LaTeX, its code point and its OMML form. */
export type EquationSymbol = {
  group: EquationSymbolGroup;
  /** the toolbar's glyph */
  command: string;
  latex: string;
  unicode: string;
  omml: string;
};

/** The equation block's own fields; BlockBase (id, ext, pos, link, alt) is added in blocks.ts. */
export type EquationFields = {
  type: 'equation';
  /** LaTeX math mode source; `\n` allowed inside environments (not a Text, like panel.code). */
  tex: string;
  /** The MathML display attribute; block is the default for a placed object. */
  display?: EquationDisplay;
  /** Font size in sheet px; the body size when absent. */
  size?: number;
  color?: Color;
  /** MathML kept from a PPTX import when no tex exists yet (R06 8.5). */
  mathml?: string;
};

/** The source a fresh block carries until its author types (SPEC-5 8.2). */
export const EQUATION_PLACEHOLDER_TEX = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';

/** The equation block's fields as a shape, spread into `equationBlockSchema` in blocks.ts. */
export const equationFieldsShape = {
  type: z.literal('equation'),
  tex: annotate(z.string(), {
    label: 'Equation',
    control: 'textarea',
    group: 'Text',
    help: 'LaTeX math mode source, rendered as MathML by Temml with Google Docs’ command names as macros (gslides-parity SPEC-5 8.1). A parse error draws Temml’s error mark and lint names it.',
  }),
  display: annotate(z.enum(EQUATION_DISPLAYS).optional(), {
    label: 'Display',
    control: 'select',
    snap: EQUATION_DISPLAYS,
    group: 'Block',
    help: 'block (the default for a placed object) or inline for a small equation set at text size.',
  }),
  size: annotate(z.number().positive().optional(), {
    label: 'Size',
    control: 'number',
    group: 'Text',
    help: 'Font size in sheet px; the body size when absent.',
  }),
  color: annotate(colorSchema.optional(), {
    label: 'Color',
    control: 'color',
    group: 'Text',
  }),
  mathml: annotate(z.string().optional(), {
    label: 'MathML',
    control: 'readonly',
    group: 'Advanced',
    help: 'MathML kept from a PowerPoint import while the LaTeX source is empty; the renderer emits it as is.',
  }),
};

// ---------------------------------------------------------------------------------------------
// The Google names and the symbol table (SPEC-5 8.1; R06 4, 9.3; B6, day 3)

/**
 * The thirteen names Google Docs' editor accepts that are not LaTeX (R06 4.7, 9.3), as Temml
 * macros: a person typing what Google taught them gets the same result, while the palette writes
 * the standard form so a source stays portable to any LaTeX tool. Passed as `macros` to Temml by
 * `@turboslide/render/blocks/equation` and by `equation.render`.
 */
export const GOOGLE_ALIASES: Readonly<Record<string, string>> = {
  '\\rootof': '\\sqrt[#1]{#2}',
  '\\superscript': '{#1}^{#2}',
  '\\subscript': '{#1}_{#2}',
  '\\subsuperscript': '{#1}_{#2}^{#3}',
  '\\rbracelr': '\\left(#1\\right)',
  '\\sbracelr': '\\left[#1\\right]',
  '\\bracelr': '\\left\\{#1\\right\\}',
  '\\abs': '\\left\\lvert#1\\right\\rvert',
  '\\limab': '\\lim_{#1\\to#2}',
  '\\liminfa': '\\liminf_{#1}',
  '\\liminfab': '\\liminf_{#1\\to#2}',
  '\\limsupa': '\\limsup_{#1}',
  '\\limsupab': '\\limsup_{#1\\to#2}',
};

/** The OMML object a structure row writes, or `r` for a symbol that travels as a run (R06 5.2, 8.2). */
export type OmmlObject =
  | 'r'
  | 'f'
  | 'rad'
  | 'sSup'
  | 'sSub'
  | 'sSubSup'
  | 'bar'
  | 'acc'
  | 'nary'
  | 'd'
  | 'func'
  | 'limLow'
  | 'm'
  | 'eqArr'
  | 'box';

type SymbolRow = readonly [command: string, unicode: string, latex?: string, omml?: OmmlObject];

/** A symbol row: the command is the toolbar's tooltip, the glyph its face, the LaTeX what a pick inserts. */
function rows(group: EquationSymbolGroup, table: ReadonlyArray<SymbolRow>): EquationSymbol[] {
  return table.map(([command, unicode, latex, omml]) => ({
    group,
    command,
    latex: latex ?? command,
    unicode,
    omml: omml ?? 'r',
  }));
}

const GREEK: ReadonlyArray<SymbolRow> = [
  ['\\alpha', 'α'],
  ['\\beta', 'β'],
  ['\\gamma', 'γ'],
  ['\\delta', 'δ'],
  ['\\epsilon', 'ϵ'],
  ['\\varepsilon', 'ε'],
  ['\\zeta', 'ζ'],
  ['\\eta', 'η'],
  ['\\theta', 'θ'],
  ['\\vartheta', 'ϑ'],
  ['\\iota', 'ι'],
  ['\\kappa', 'κ'],
  ['\\lambda', 'λ'],
  ['\\mu', 'μ'],
  ['\\nu', 'ν'],
  ['\\xi', 'ξ'],
  ['\\pi', 'π'],
  ['\\varpi', 'ϖ'],
  ['\\rho', 'ρ'],
  ['\\varrho', 'ϱ'],
  ['\\sigma', 'σ'],
  ['\\varsigma', 'ς'],
  ['\\tau', 'τ'],
  ['\\upsilon', 'υ'],
  ['\\phi', 'ϕ'],
  ['\\varphi', 'φ'],
  ['\\chi', 'χ'],
  ['\\psi', 'ψ'],
  ['\\omega', 'ω'],
  ['\\Gamma', 'Γ'],
  ['\\Delta', 'Δ'],
  ['\\Theta', 'Θ'],
  ['\\Lambda', 'Λ'],
  ['\\Xi', 'Ξ'],
  ['\\Pi', 'Π'],
  ['\\Sigma', 'Σ'],
  ['\\Upsilon', 'Υ'],
  ['\\Phi', 'Φ'],
  ['\\Psi', 'Ψ'],
  ['\\Omega', 'Ω'],
];

const OPERATIONS: ReadonlyArray<SymbolRow> = [
  ['\\times', '×'],
  ['\\div', '÷'],
  ['\\cdot', '⋅'],
  ['\\pm', '±'],
  ['\\mp', '∓'],
  ['\\ast', '∗'],
  ['\\star', '⋆'],
  ['\\circ', '∘'],
  ['\\bullet', '∙'],
  ['\\oplus', '⊕'],
  ['\\ominus', '⊖'],
  ['\\oslash', '⊘'],
  ['\\otimes', '⊗'],
  ['\\odot', '⊙'],
  ['\\dagger', '†'],
  ['\\ddagger', '‡'],
  ['\\vee', '∨'],
  ['\\wedge', '∧'],
  ['\\cap', '∩'],
  ['\\cup', '∪'],
  ['\\aleph', 'ℵ'],
  ['\\Re', 'ℜ'],
  ['\\Im', 'ℑ'],
  ['\\top', '⊤'],
  ['\\bot', '⊥'],
  ['\\infty', '∞'],
  ['\\partial', '∂'],
  ['\\forall', '∀'],
  ['\\exists', '∃'],
  ['\\neg', '¬'],
  ['\\triangle', '△'],
  ['\\diamond', '⋄'],
];

const RELATIONS: ReadonlyArray<SymbolRow> = [
  ['\\leq', '≤'],
  ['\\geq', '≥'],
  ['\\prec', '≺'],
  ['\\succ', '≻'],
  ['\\preceq', '⪯'],
  ['\\succeq', '⪰'],
  ['\\ll', '≪'],
  ['\\gg', '≫'],
  ['\\equiv', '≡'],
  ['\\sim', '∼'],
  ['\\simeq', '≃'],
  ['\\asymp', '≍'],
  ['\\approx', '≈'],
  ['\\ne', '≠'],
  ['\\subset', '⊂'],
  ['\\supset', '⊃'],
  ['\\subseteq', '⊆'],
  ['\\supseteq', '⊇'],
  ['\\in', '∈'],
  ['\\ni', '∋'],
  ['\\notin', '∉'],
];

/** Google's Math operators (R06 4.4): structures whose glyph is a representative form; the LaTeX carries the empty groups a pick leaves the caret in. */
const MATH_OPERATORS: ReadonlyArray<SymbolRow> = [
  ['\\frac', '½', '\\frac{}{}', 'f'],
  ['\\sqrt', '√', '\\sqrt{}', 'rad'],
  ['\\rootof', '∛', '\\sqrt[]{}', 'rad'],
  ['\\superscript', 'x²', '{}^{}', 'sSup'],
  ['\\subscript', 'x₂', '{}_{}', 'sSub'],
  ['\\subsuperscript', 'x₂²', '{}_{}^{}', 'sSubSup'],
  ['\\overline', 'x̄', '\\overline{}', 'bar'],
  ['\\widehat', 'x̂', '\\widehat{}', 'acc'],
  ['\\bigcap', '⋂', '\\bigcap_{}^{}', 'nary'],
  ['\\bigcup', '⋃', '\\bigcup_{}^{}', 'nary'],
  ['\\prod', '∏', '\\prod_{}^{}', 'nary'],
  ['\\coprod', '∐', '\\coprod_{}^{}', 'nary'],
  ['\\rbracelr', '( )', '\\left(\\right)', 'd'],
  ['\\sbracelr', '[ ]', '\\left[\\right]', 'd'],
  ['\\bracelr', '{ }', '\\left\\{\\right\\}', 'd'],
  ['\\abs', '| |', '\\left\\lvert\\right\\rvert', 'd'],
  ['\\int', '∫', '\\int_{}^{}', 'nary'],
  ['\\oint', '∮', '\\oint_{}^{}', 'nary'],
  ['\\sum', '∑', '\\sum_{}^{}', 'nary'],
  ['\\limab', 'lim', '\\lim_{\\to}', 'limLow'],
];

const ARROWS: ReadonlyArray<SymbolRow> = [
  ['\\leftarrow', '←'],
  ['\\rightarrow', '→'],
  ['\\leftrightarrow', '↔'],
  ['\\Leftarrow', '⇐'],
  ['\\Rightarrow', '⇒'],
  ['\\Leftrightarrow', '⇔'],
  ['\\uparrow', '↑'],
  ['\\downarrow', '↓'],
  ['\\updownarrow', '↕'],
  ['\\Uparrow', '⇑'],
  ['\\Downarrow', '⇓'],
  ['\\Updownarrow', '⇕'],
];

/** Turboslide's More (SPEC-5 8.2): the standard LaTeX beyond Google's table, matrices, cases, aligned, accents, fonts and colour. */
const MORE: ReadonlyArray<SymbolRow> = [
  ['\\begin{matrix}', '⋯', '\\begin{matrix} & \\\\ & \\end{matrix}', 'm'],
  ['\\begin{pmatrix}', '( )', '\\begin{pmatrix} & \\\\ & \\end{pmatrix}', 'm'],
  ['\\begin{bmatrix}', '[ ]', '\\begin{bmatrix} & \\\\ & \\end{bmatrix}', 'm'],
  ['\\begin{vmatrix}', '| |', '\\begin{vmatrix} & \\\\ & \\end{vmatrix}', 'm'],
  ['\\begin{cases}', '{', '\\begin{cases} & \\\\ & \\end{cases}', 'eqArr'],
  ['\\begin{aligned}', '=', '\\begin{aligned} &= \\\\ &= \\end{aligned}', 'eqArr'],
  ['\\binom', '(ⁿₖ)', '\\binom{}{}', 'd'],
  ['\\bar', 'x̄', '\\bar{}', 'acc'],
  ['\\vec', 'x⃗', '\\vec{}', 'acc'],
  ['\\tilde', 'x̃', '\\tilde{}', 'acc'],
  ['\\dot', 'ẋ', '\\dot{}', 'acc'],
  ['\\ddot', 'ẍ', '\\ddot{}', 'acc'],
  ['\\hat', 'x̂', '\\hat{}', 'acc'],
  ['\\underline', 'x̲', '\\underline{}', 'bar'],
  ['\\boxed', '▭', '\\boxed{}', 'box'],
  ['\\lim', 'lim', '\\lim_{}', 'limLow'],
  ['\\max', 'max', '\\max_{}', 'limLow'],
  ['\\min', 'min', '\\min_{}', 'limLow'],
  ['\\mathbf', '𝐱', '\\mathbf{}', 'r'],
  ['\\mathit', '𝑥', '\\mathit{}', 'r'],
  ['\\mathcal', '𝒳', '\\mathcal{}', 'r'],
  ['\\mathbb', '𝕏', '\\mathbb{}', 'r'],
  ['\\mathrm', 'x', '\\mathrm{}', 'r'],
  ['\\mathfrak', '𝔵', '\\mathfrak{}', 'r'],
  ['\\text', 'Aa', '\\text{}', 'r'],
  ['\\color', '■', '\\color{#2f5ce0}{}', 'r'],
  ['\\cdots', '⋯', '\\cdots'],
  ['\\vdots', '⋮', '\\vdots'],
  ['\\ldots', '…', '\\ldots'],
  ['\\nabla', '∇', '\\nabla'],
  ['\\hbar', 'ℏ', '\\hbar'],
  ['\\angle', '∠', '\\angle'],
  ['\\propto', '∝', '\\propto'],
  ['\\parallel', '∥', '\\parallel'],
  ['\\vdash', '⊢', '\\vdash'],
];

/**
 * The one symbol table (SPEC-5 8.1; R06 4): Google Docs' five dropdown groups with Google's
 * counts (Greek letters 40, Miscellaneous operations 32, Relations 21, Math operators 20, Arrows
 * 12) and Turboslide's More, read by the equation toolbar, the palette, `equation.symbols`, the
 * OMML writer and B5's drawing box (the Math and Arrows features).
 */
export const EQUATION_SYMBOLS: ReadonlyArray<EquationSymbol> = [
  ...rows('greek', GREEK),
  ...rows('operations', OPERATIONS),
  ...rows('relations', RELATIONS),
  ...rows('mathOperators', MATH_OPERATORS),
  ...rows('arrows', ARROWS),
  ...rows('more', MORE),
];

/** Google's row counts per dropdown (R06 4.1 to 4.5), pinned by `equation.test.ts`. */
export const EQUATION_GROUP_COUNTS: Readonly<Record<EquationSymbolGroup, number>> = {
  greek: 40,
  operations: 32,
  relations: 21,
  mathOperators: 20,
  arrows: 12,
  more: MORE.length,
};

/** The rows of one group, in the table's order. */
export function equationSymbolsOf(group: EquationSymbolGroup): EquationSymbol[] {
  return EQUATION_SYMBOLS.filter((row) => row.group === group);
}

/** The table by group, the shape `equation.symbols` answers. */
export function equationSymbolGroups(): {
  id: EquationSymbolGroup;
  label: string;
  symbols: Omit<EquationSymbol, 'group'>[];
}[] {
  return EQUATION_SYMBOL_GROUPS.map((id) => ({
    id,
    label: EQUATION_GROUP_LABELS[id],
    symbols: equationSymbolsOf(id).map(({ command, latex, unicode, omml }) => ({
      command,
      latex,
      unicode,
      omml,
    })),
  }));
}

/** The code point to Google command map the OMML writer and the drawing box read (a symbol's unicode to its command). */
export const EQUATION_COMMAND_BY_UNICODE: ReadonlyMap<string, string> = new Map(
  EQUATION_SYMBOLS.filter((row) => row.omml === 'r' && row.latex === row.command).map((row) => [
    row.unicode,
    row.command,
  ]),
);

/**
 * The caret position after a pick (SPEC-5 8.2): the first empty group of the inserted LaTeX,
 * else its end. Shared by the toolbar and the inspector's source field.
 */
export function firstEmptyGroup(latex: string, from = 0): number {
  const at = latex.indexOf('{}', from);
  return at === -1 ? latex.length : at + 1;
}

/** Whether a source names an alias Google taught (the toolbar's tooltip says the standard form). */
export function isGoogleAlias(command: string): boolean {
  return Object.hasOwn(GOOGLE_ALIASES, command);
}
