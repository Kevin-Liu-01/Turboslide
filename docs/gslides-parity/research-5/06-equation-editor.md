# The equation editor: Google's model, the standalone options and a recommendation

Report 06 of the Google Slides parity round five, written 2026-09-14 against `main` at `d5d7f07`
for Kevin Liu and the design workflow of round five. It answers five questions: what Google offers
under Insert > Equation and where (section 2 and 3); every symbol and command Google's editor
accepts, as a table (section 4); how equations leave Google and how PowerPoint stores them
(section 5); which standalone renderer, storage shape, export path, editing surface, shortcuts and
accessibility model fit Turboslide (sections 6 to 11); and one recommendation with its costs
(section 12). Section 14 lists every source with its URL and the date it was read. Repository
facts are read from `main` at `d5d7f07` with `git show`, since the working tree carries round
four's uncommitted edits.

Kevin's directives, verbatim: "it has all the features and exact behaviors of google slides...
literally search up and research everything google slides offers... mimic it perfectly" and "keep
going on all of these and dont stop until literally all google slides features are supported with
full agent queryability and editability esp on locals". The round five scope names "the equation
editor (Insert > Equation with the Greek letters, operators, relations, arrows, math operations
toolbar; rendering; PPTX OMML export)".

## Summary

1. Google Slides has no equation editor. Its Insert menu has no Equation row, its shortcuts page
   never says the word, and its API has no equation page element; what Slides calls "Equation"
   is the fourth category of the shape picker, six shapes (plus, minus, multiply, divide, equal,
   not equal), which Turboslide already builds (`insert.shape.equation` in `menus/model.ts`,
   SPEC-2 0.10). SPEC-2 0.53 removed the round one Equation editor stub for this reason. The
   equation editor of the round five scope is Google Docs' editor (Insert > Symbols > Equation),
   brought to a slide as a standalone product may (section 2, 3).
2. Google Docs' editor is inline in a paragraph: a box in the text line, a toolbar with New
   equation and five dropdowns (Greek letters, Miscellaneous operations, Relations, Math
   operators, Arrows), and shortcuts typed as a backslash, a name and a space (`\alpha`), with `\`
   then Shift+6 or Shift+- for a superscript or a subscript. Google documents one example command;
   the community lists compiled from the editor's own `aria-label` attributes hold about 175
   commands in eight groups, and every one of them is either a LaTeX command or a Google alias for
   one (section 4). The Docs API exposes an `Equation` paragraph element with no content fields,
   so an agent cannot read a Google equation's source (section 5.1).
3. PowerPoint stores an equation as OMML (`m:oMathPara` / `m:oMath`) inside an `a14:m` element in
   the text paragraph, the whole shape wrapped in `mc:AlternateContent` whose `mc:Fallback` is the
   same shape filled with a picture of the equation; the runs name Cambria Math. Microsoft's own
   spec example shows the exact tree (section 5.2). A viewer that does not know `a14` shows the
   picture, which is what Turboslide's Perfect raster already is.
4. Three renderers can turn LaTeX into something a browser draws without a network: KaTeX
   (HTML plus CSS with twenty font faces, 266 KB of minified JS, about 300 KB of woff2, MIT),
   MathJax 4 (974 KB to 1.76 MB per combined component, fonts fetched on demand from a CDN, Apache
   2.0) and Temml (MathML Core, 164 KB of minified JS, 9 KB of CSS, a 9 KB font supplement, MIT).
   MathML Core is native in Chromium since 109, Firefox and Safari; the render worker runs
   Chromium 147 (section 6).
5. Recommendation: Temml, an `equation` block storing LaTeX source, MathML in the DOM on every
   surface (editor, view, present, the standalone HTML), a math font shipped the way Inter is
   (inlined woff2), a MathML to OMML transform of Turboslide's own in the OOXML post-process for
   Editable text with the PNG fallback shape, the Perfect raster untouched, PDF through Chromium's
   printer as today. The editing surface is Google's toolbar (New equation and the five
   dropdowns) over a source field with a live preview, the shortcut Cmd+Option+Shift+E, and every
   symbol and command of section 4 as a palette entry that writes LaTeX (sections 7 to 12).
6. Unverified facts are collected in section 13: how Google Docs exports a native equation to
   DOCX and PDF (the public pages do not say; third party guides disagree), whether LibreOffice
   Impress reads `a14:m`, and the exact caret behaviour of Google's inline box beyond what the
   help page states.

## 1. Method and rules

- Repository facts are read at `d5d7f07` with `git show`: `packages/chrome/src/menus/model.ts`,
  `packages/chrome/src/menus/keys.ts`, `packages/chrome/src/menus/__fixtures__/google-shortcuts.json`,
  `packages/chrome/src/dialogs/special-characters-data.ts`, `packages/schema/src/{blocks,text,
catalog,actions,export}.ts`, `packages/render/src/blocks/render-block.ts`,
  `packages/render/src/sanitize/html.ts`, `packages/render/src/theme-node.ts`,
  `packages/export/src/pptx/{build,text}.ts`, `packages/export/src/ooxml/*`, `docs/pptx.md`,
  `docs/hosting-chromium.md`, `docs/gslides-parity/SPEC-2.md` (0.10, 0.53, section 12),
  `docs/gslides-parity/SPEC-4.md` (section 7), `docs/gslides-parity/design-4/perf-budget.mjs`,
  `docs/gslides-parity/research/{01-menu-bar,05-objects-and-format-options}.md`, `LICENSE`.
  Nothing was built or installed; no server ran; no git write.
- Web pages were read on 2026-09-14 through a fetch that returns a structured summary of the page,
  so a quoted phrase is the page's own wording as that summary reported it, and a number is the
  page's number. No account was signed in to. No Google or Microsoft artwork is reproduced or
  proposed. File sizes are jsDelivr's directory listings for the package versions named, before
  compression.
- The command list of section 4 is not Google's documentation: Google documents one example.
  It is two community compilations, one read from the editor's `aria-label` attributes
  (2017, updated 2021), one from probing the editor (2020, 173 commands). Both are cited; a
  command that appears in one list only is marked.
- Rules of the text: plain technical English, sentence case, no em dashes, no metaphors, no
  trailing periods on headings, full sentences.

## 2. Google Docs: Insert > Symbols > Equation

The help page "Use equations in a document" (support.google.com/docs/answer/160749, Computer tab,
read 2026-09-14) is the whole of Google's public documentation. Its steps, quoted: "Open a
document in Google Docs", "Click where you want to put the equation", "Click Insert, Symbols,
Equation", "Select the symbols you want to add from one of these menus: Greek letters,
Miscellaneous operations, Relations, Math operators, Arrows", "Add numbers or substitute variables
in the box", and "To add another equation box, click New equation". The shortcut section:
"You can type "\" followed by the name of a symbol and a space in an equation to insert that
symbol. For example, \alpha will insert 𝞪" and "To type superscripts or subscripts, type "\",
then press Shift + 6 or Shift + -". The toolbar section: "To show or hide the equation options,
click View, Show equation toolbar". The page has Android and iPhone tabs with separate guidance;
the computer tab is the one with the editor.

What the page establishes about the model:

- The equation is an inline object in a paragraph, entered at the caret ("Click where you want to
  put the equation"). It is not a page object; Docs has no canvas.
- The toolbar replaces the formatting toolbar while an equation is being edited: a New equation
  button and five dropdown menus. The menu names are Google's labels; the fifth dropdown's label on
  the help page is "Math operators" while third party guides and the community lists say "Math
  operations".
- Input is by picking from a dropdown or by typing a backslash command followed by a space. The
  command names are LaTeX names where LaTeX has one (`\alpha`, `\frac`, `\sqrt`, `\int`).
- Superscript and subscript are typed as `\` then `^` or `_`, which is `^` and `_` in LaTeX.
- The toolbar can be hidden and shown from the View menu.

What the page does not say, and third party guides fill in without agreement: how a fraction's
two placeholders are entered and left (guides say each placeholder is clicked or reached with the
arrow keys), what Enter does (one guide, 2024-11-03: "When you're done typing your equation, hit
Enter to exit the equation editor"), and how an existing equation is reopened (click into it;
the toolbar returns). These are listed as unverified in section 13. The Docs keyboard shortcuts
page (support.google.com/docs/answer/179738) has no row for inserting an equation; its
superscript and subscript chords are Cmd+. and Cmd+, on a Mac, Ctrl+. and Ctrl+, on Windows,
which are the chords Turboslide already binds for the text marks (SPEC-2 section 9).

## 3. Google Slides: what exists and how the two products differ

- The Slides Insert menu, inventoried in `research/01-menu-bar.md` (T01, T20, corroborated) and
  built in `menus/model.ts`, has Image, Text box, Audio, Video, Shape, Table, Chart, Diagram,
  Word art, Line, Special characters, Animation, Link, Comment, New slide, Slide numbers,
  Placeholder, Templates and Building blocks. There is no Equation row. `SPEC-2.md` 0.53 records
  the consequence: "the Equation editor row is removed because Google Slides has no equation
  editor".
- Insert > Shape > Equation is a shape category of six glyphs. The Slides API `Shape.Type` enum
  lists them as `MATH_PLUS`, `MATH_MINUS`, `MATH_MULTIPLY`, `MATH_DIVIDE`, `MATH_EQUAL`,
  `MATH_NOT_EQUAL`, each "Corresponds to ECMA-376 ST_ShapeType" `mathPlus` to `mathNotEqual`
  (read 2026-09-14). Turboslide draws them from the ECMA definitions (SPEC-2 0.10, section 2.3);
  the menu row's doc string reads "Plus, minus, multiply, divide, equal and not equal".
- The Slides API page element union holds shapes, lines, images, videos, tables, charts, word art
  and speaker spotlights; there is no equation element (read 2026-09-14).
- The Slides keyboard shortcuts page (support.google.com/docs/answer/1696717) does not contain the
  word equation (read 2026-09-14).
- What a Slides user does instead: Insert > Special characters with its Math and Math
  Alphanumeric categories (Turboslide's dialog holds 130 Math rows of about 340,
  `special-characters-data.ts`), Format > Text > Superscript and Subscript, a line for a
  fraction bar, or an add-on. The Workspace Marketplace lists add-ons that render LaTeX into a
  slide; math2slides (developer mrzachdev) inserts "true vector graphics" where "Each equation is
  composed of separate objects so you can move, style, layer, and animate individual symbols"
  (read 2026-09-14). A 2024-08-29 guide names MathType, Better Math Equations and Auto-LaTeX
  Equations; those three listings were not opened.

| Aspect       | Google Docs                                                | Google Slides                                         | Turboslide today (`d5d7f07`)                                |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Menu         | Insert > Symbols > Equation                                | none                                                  | none (SPEC-2 0.53)                                          |
| Object model | inline element in a paragraph                              | none; six math shapes under Insert > Shape > Equation | the six shapes; text marks sup and sub; 130 math characters |
| Toolbar      | New equation and five dropdowns, shown or hidden from View | none                                                  | none                                                        |
| Typed input  | `\name` and a space; `\` then Shift+6 or Shift+-           | none                                                  | none                                                        |
| API          | `Equation` element with no content fields                  | none                                                  | none                                                        |
| Export       | not documented (section 13)                                | not applicable                                        | not applicable                                              |

The round five scope brings Docs' editor to a slide. Because Slides has no equation object, there
is no Google behaviour to mimic on the canvas side; the object behaviour (place, move, resize,
group, animate, alt text, order) is the behaviour of every other Turboslide block. The Docs
behaviours to keep are the toolbar's names and groups, the backslash input, the New equation
button, the View toggle, and the superscript and subscript chords.

## 4. The symbol table

Google publishes one command. The table below is the union of two community lists: the cheat
sheet at equation-shortcuts.notuom.com ("discovered" in the editor code as `aria-label`
attributes; "Created in February 2017. Last updated in January 2021"), which groups the commands
by the dropdown they sit in, and Lukas Kollmer's list (2020-07-18, "173 supported commands" as of
August 2020), which gives the character each inserts. The five dropdown groups hold 125 commands;
three further groups (about 50) are accepted when typed but sit in no dropdown. A command is
marked (N) when only the notuom list has it and (K) when only Kollmer's does.

Every command is a LaTeX command or a Google alias for one. The third column gives the LaTeX
Turboslide's palette writes; where the name is Google's own (marked "alias"), the palette writes
the standard form and the source field also accepts the Google name through a macro
(section 9.3).

### 4.1 Greek letters (40)

| Command                                          | Inserts     | LaTeX in Turboslide |
| ------------------------------------------------ | ----------- | ------------------- |
| `\alpha` `\beta` `\gamma` `\delta`               | α β γ δ     | same                |
| `\epsilon` `\varepsilon`                         | ϵ ε         | same                |
| `\zeta` `\eta` `\theta` `\vartheta`              | ζ η θ ϑ     | same                |
| `\iota` `\kappa` `\lambda` `\mu` `\nu` `\xi`     | ι κ λ μ ν ξ | same                |
| `\pi` `\varpi` `\rho` `\varrho`                  | π ϖ ρ ϱ     | same                |
| `\sigma` `\varsigma` `\tau` `\upsilon`           | σ ς τ υ     | same                |
| `\phi` `\varphi` `\chi` `\psi` `\omega`          | ϕ φ χ ψ ω   | same                |
| `\Gamma` `\Delta` `\Theta` `\Lambda` `\Xi` `\Pi` | Γ Δ Θ Λ Ξ Π | same                |
| `\Sigma` `\Upsilon` `\Phi` `\Psi` `\Omega`       | Σ Υ Φ Ψ Ω   | same                |

### 4.2 Miscellaneous operations (32)

| Command                                        | Inserts   | LaTeX in Turboslide |
| ---------------------------------------------- | --------- | ------------------- |
| `\times` `\div` `\cdot`                        | × ÷ ⋅     | same                |
| `\pm` `\mp`                                    | ± ∓       | same                |
| `\ast` `\star` `\circ` `\bullet`               | ∗ ⋆ ∘ ∙   | same                |
| `\oplus` `\ominus` `\oslash` `\otimes` `\odot` | ⊕ ⊖ ⊘ ⊗ ⊙ | same                |
| `\dagger` `\ddagger`                           | † ‡       | same                |
| `\vee` `\wedge` `\cap` `\cup`                  | ∨ ∧ ∩ ∪   | same                |
| `\aleph` `\Re` `\Im`                           | ℵ ℜ ℑ     | same                |
| `\top` `\bot`                                  | ⊤ ⊥       | same                |
| `\infty` `\partial`                            | ∞ ∂       | same                |
| `\forall` `\exists` `\neg`                     | ∀ ∃ ¬     | same                |
| `\triangle` `\diamond`                         | △ ⋄       | same                |

### 4.3 Relations (21)

| Command                                     | Inserts   | LaTeX in Turboslide         |
| ------------------------------------------- | --------- | --------------------------- |
| `\leq` `\geq`                               | ≤ ≥       | same                        |
| `\prec` `\succ` `\preceq` `\succeq`         | ≺ ≻ ⪯ ⪰   | same                        |
| `\ll` `\gg`                                 | ≪ ≫       | same                        |
| `\equiv` `\sim` `\simeq` `\asymp` `\approx` | ≡ ∼ ≃ ≍ ≈ | same                        |
| `\ne`                                       | ≠         | same (`\neq` also accepted) |
| `\subset` `\supset` `\subseteq` `\supseteq` | ⊂ ⊃ ⊆ ⊇   | same                        |
| `\in` `\ni` `\notin`                        | ∈ ∋ ∉     | same                        |

### 4.4 Math operations (20)

| Command             | Inserts                                   | LaTeX in Turboslide       |
| ------------------- | ----------------------------------------- | ------------------------- |
| `\frac`             | a fraction with two placeholders          | `\frac{}{}`               |
| `\sqrt`             | a square root                             | `\sqrt{}`                 |
| `\rootof`           | an nth root (alias)                       | `\sqrt[]{}`               |
| `\superscript`      | a base with a superscript (alias)         | `{}^{}`                   |
| `\subscript`        | a base with a subscript (alias)           | `{}_{}`                   |
| `\subsuperscript`   | a base with both (alias)                  | `{}_{}^{}`                |
| `\overline`         | a bar over the argument                   | `\overline{}`             |
| `\widehat`          | a wide hat                                | `\widehat{}`              |
| `\bigcap` `\bigcup` | big intersection and union with limits    | same, `_{}^{}`            |
| `\prod` `\coprod`   | product and coproduct with limits         | same                      |
| `\rbracelr`         | round brackets that grow (alias)          | `\left(\right)`           |
| `\sbracelr`         | square brackets that grow (alias)         | `\left[\right]`           |
| `\bracelr`          | curly braces that grow (alias)            | `\left\{\right\}`         |
| `\abs`              | absolute value bars (alias)               | `\left\lvert\right\rvert` |
| `\int` `\oint`      | integral and contour integral with limits | same                      |
| `\sum`              | a sum with limits                         | same                      |
| `\limab`            | a limit with a lower argument (alias)     | `\lim_{\to}`              |

### 4.5 Arrows (12)

| Command                                      | Inserts | LaTeX in Turboslide |
| -------------------------------------------- | ------- | ------------------- |
| `\leftarrow` `\rightarrow` `\leftrightarrow` | ← → ↔   | same                |
| `\Leftarrow` `\Rightarrow` `\Leftrightarrow` | ⇐ ⇒ ⇔   | same                |
| `\uparrow` `\downarrow` `\updownarrow`       | ↑ ↓ ↕   | same                |
| `\Uparrow` `\Downarrow` `\Updownarrow`       | ⇑ ⇓ ⇕   | same                |

### 4.6 Accepted when typed, in no dropdown

Operations (15): `\binom` and `\choose` (binomial coefficient), `\bar`, `\hat`, `\vec`, `\tilde`,
`\underline`, `\dot`, `\ddot` (accents), `\max`, `\min`, `\lim`, and Google's aliases `\liminfa`,
`\liminfab`, `\limsupa`, `\limsupab` (N) for `\liminf_{}`, `\liminf_{\to}`, `\limsup_{}`,
`\limsup_{\to}`; Kollmer lists `\liminf`, `\limsup`, `\inf` and `\sup` (K) instead.

Symbols (9): `\angle` ∠, `\hbar` ℏ, `\vdots` ⋮, `\cdots` ⋯, `\ldots` …, `\nabla` ∇, `\vdash` ⊢,
`\parallel` ∥, `\propto` ∝ (N).

Function names (27): `\log`, `\ln`, `\lg`, `\exp`, `\sin`, `\cos`, `\tan`, `\csc`, `\sec`,
`\cot`, `\arcsin`, `\arccos`, `\arctan`, `\sinh`, `\cosh`, `\tanh`, `\coth`, `\inf`, `\sup`,
`\dim`, `\Pr`, `\hom`, `\arg`, `\deg`, `\gcd`, `\det`, `\ker`. All are LaTeX operator names.

### 4.7 What the table means for Turboslide

- Every Google command is accepted by KaTeX and by Temml as written, except the thirteen Google
  aliases (`\rootof`, `\superscript`, `\subscript`, `\subsuperscript`, `\rbracelr`, `\sbracelr`,
  `\bracelr`, `\abs`, `\limab`, `\liminfa`, `\liminfab`, `\limsupa`, `\limsupab`). A macro table
  of thirteen entries makes the Google names type the same way in Turboslide (section 9.3).
- Google's palette is a small subset of LaTeX. A standalone editor can offer the same five groups
  with the same names and then more: KaTeX's supported functions page lists about forty accents,
  about fifty delimiters, matrices (`matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`,
  `Bmatrix`), `cases`, `aligned`, `array`, colour, fonts and sizes; Temml's supported page adds
  Unicode mathematical alphanumeric symbols typed directly, chemistry through mhchem (`\ce`,
  `\pu`) and a physics extension (read 2026-09-14). The palette's first tier is Google's table;
  a "More" tier per group offers the rest.
- The 130 characters of the special characters dialog's Math category overlap section 4.2 and
  4.3. The dialog inserts a character into text; the equation palette inserts a command into a
  source. Both stay.

## 5. How equations leave Google and how PowerPoint stores them

### 5.1 Google

- The Docs API defines `Equation` as "A ParagraphElement representing an equation" with two
  fields, `suggestedInsertionIds[]` and `suggestedDeletionIds[]`, and no field for the equation's
  content (read 2026-09-14). An agent reading a Google document through the API sees that an
  equation is there and nothing of what it says. Turboslide's block stores the source and every
  transport reads it; this is the parity gap Kevin's "full agent queryability" directive closes.
- Google's help does not say how an equation is drawn or exported. Third party guides disagree:
  a 2025-05-16 guide says "Rendered equations are treated as images in Google Docs"; MathType's
  documentation says that Word's native equations "cannot be edited with MathType in Google Docs"
  and that MathType equations move between Word and Docs only through MathType; a Google community
  thread reports MathType equations exporting to Word as images. None of these is Google stating
  how a native Docs equation exports to DOCX or PDF. Section 13 lists it as unverified, with the
  reading a Turboslide tester should take (download a Docs file with one equation as DOCX and
  open the `word/document.xml`; download as PDF and inspect whether the text is selectable).

### 5.2 PowerPoint and OOXML

Microsoft's [MS-ODRAWXML] "Math" page (read 2026-09-14, page updated 2026-02-17) gives the exact
structure, quoted here without the elisions: a `<mc:AlternateContent xmlns:mc=
"http://schemas.openxmlformats.org/markup-compatibility/2006">` inside `p:spTree`; a `<mc:Choice
xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" Requires="a14">` holding the
`<p:sp>` whose `p:txBody` paragraph `<a:p>` holds `<a14:m>` and inside it `<m:oMathPara
xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">`, `<m:oMath>`, `<m:r>` with
`<a:rPr><a:latin typeface="Cambria Math"/></a:rPr>` and `<m:t>𝜋</m:t>`; and a `<mc:Fallback>`
holding a second `<p:sp>` whose `p:spPr` carries `<a:blipFill><a:blip r:embed="rId2"/>
</a:blipFill>`, the picture of the equation. The page describes this as wrapping "an equation and
the fallback image of that equation".

Consequences for Turboslide's exporter:

- The run properties inside PPTX OMML are DrawingML `a:rPr`, not WordprocessingML `w:rPr`. A
  DOCX oriented MathML to OMML converter produces `w:` run properties that need rewriting for a
  slide (section 8.2).
- The namespaces are declared inline on the wrapper elements in Microsoft's own example, so the
  post-process needs no edit of the `p:sld` root that pptxgenjs writes.
- A consumer that does not implement `a14` takes the Fallback shape, which is a picture. Python's
  `python-pptx` had to learn to look inside `mc:AlternateContent` to enumerate such shapes at all
  (pull request 706, 2021-05-03, still open when read). The `ooxml/groups.ts` shape regex and
  `ooxml/validate.ts` walk must learn the wrapper too (section 8.3).
- Murray Sargent's 2006 note (Microsoft, read 2026-09-14) tabulates the nineteen OMML built-up
  objects against MathML: `acc` and `bar` to `mover`/`munder`, `box` and `borderBox` to `menclose`,
  `d` to `mfenced`, `eqArr` to `mtable`, `f` to `mfrac`, `func` to function apply, `sPre` to
  `mmultiscripts`, `limLow` to `munder`, `limUpp` to `mover`, `m` to `mtable`, `nary` to an
  `mrow` with an n-ary `mo`, `phant` to `mphantom`, `rad` to `msqrt`/`mroot`, `groupChr` to
  `mover`/`munder`, `sSub`, `sSup`, `sSubSup` to `msub`, `msup`, `msubsup`. The note states OMML
  arguments are tagged explicitly (`m:num`, `m:den`) where MathML's are positional, that the
  radical degree precedes the radicand in OMML and follows it in MathML, and that Office ships
  `OMML2MML.XSL` and `MML2OMML.XSL` (a 2007 comment on the post; the files sit in the Office
  program folder). These nineteen objects are the whole target of a transform from Temml's
  MathML Core output, which never emits `mfenced` or `menclose` (MathML Core drops both; section
  6.4).
- PowerPoint's own editor: Insert > Equation or Alt+= on Windows, an Equation tab with Symbols
  sets (Basic Math, Greek Letters, Letter-Like Symbols, Operators, Arrows, Negated Relations,
  Scripts, Geometry) and Structures (Fraction, Script, Radical, Integral, Large Operator, Bracket,
  Function, Accent, Limit and Log, Operator, Matrix), and a linear input that "will display the
  equation in either UnicodeMath format, or LaTeX format" (Microsoft support, read 2026-09-14;
  the page lists PowerPoint 2016 to Microsoft 365). UnicodeMath is Unicode Technical Note 28,
  version 3.1, Murray Sargent, 2016-11-16; its introduction states it "can be converted to a
  built-up format that Microsoft Office applications like Word refer to as Professional" and
  that it represents one half as the three characters `1/2` where MathML takes 62. PowerPoint
  therefore reads back what Turboslide writes as a native, editable equation with its own
  toolbar, and a PowerPoint user can switch the imported equation to LaTeX view.

## 6. Rendering options

Three libraries render LaTeX in a browser and in Node without a network call. The render worker
and the studio run Chromium 147 (`docs/hosting-chromium.md` line 412); MathML Core has been
native "across browsers since January 2023" (MDN, read 2026-09-14; Chrome 109 per the DAISY
article of 2023-03-13), so all three targets draw either HTML plus CSS or MathML.

### 6.1 KaTeX 0.18.7

- Output: HTML plus CSS by default with MathML alongside "for accessibility" (`output:
'htmlAndMathml'`, the default; `html` and `mathml` are the alternatives). Options include
  `displayMode`, `throwOnError` (default true), `errorColor`, `macros`, `strict` (default
  `"warn"`), `trust` (default false, blocks `\includegraphics`, `\href`, `\htmlClass`),
  `maxSize`, `maxExpand` (default 1000), `minRuleThickness`, `fleqn`, `leqno` (katex.org/docs/
  options, read 2026-09-14).
- Files on jsDelivr: `katex.min.js` 266 KB, `katex.min.css` 24 KB, plus the fonts folder: twenty
  faces (AMS, Caligraphic Regular and Bold, Fraktur Regular and Bold, Main Regular, Bold, Italic
  and BoldItalic, Math Italic and BoldItalic, SansSerif Regular, Bold and Italic, Script, Size1
  to Size4, Typewriter) in ttf, woff and woff2, sixty files; the woff2 set is about 300 KB as the
  listing sums. The CSS references the fonts by relative URL, so "The `fonts/` directory must stay
  alongside the CSS file" (katex.org/docs/browser).
- Licence: MIT, "Copyright (c) 2013-2020 Khan Academy and other contributors"; the `katex-fonts`
  repository is MIT, "Copyright (c) 2018 Khan Academy", "Originally based on MathJax font
  generation".
- Fit: the HTML output is pixel stable across browsers because KaTeX does its own layout, which is
  the property a Perfect raster does not need (Chromium is the only renderer there) and a PDF
  does not need (Chromium prints). The cost is twenty faces to inline or to serve, 266 KB of
  parser and layout engine in the editor bundle, and a second stylesheet with its own `.katex`
  class tree inside the sheet's CSS.

### 6.2 MathJax 4.1.3

- Output: CommonHTML or SVG; the v2 native MathML output processor was discontinued, MathML is
  available as serialized output. Combined components on jsDelivr: `tex-chtml.js` 974 KB,
  `tex-svg.js` 1.76 MB, `tex-mml-chtml.js` 974 KB, `tex-mml-svg.js` 1.76 MB. Fonts in v4: eleven
  (`mathjax-newcm` the default, `mathjax-tex`, `mathjax-stix2`, `mathjax-asana`, `mathjax-bonum`,
  `mathjax-dejavu`, `mathjax-fira`, `mathjax-modern`, `mathjax-pagella`, `mathjax-schola`,
  `mathjax-termes`) plus four extensions, loaded "from `cdn.jsdelivr.net`" on demand for the web
  and from `@mathjax` npm packages for Node (docs.mathjax.org, read 2026-09-14). Licence: Apache
  License 2.0.
- Fit: the widest LaTeX coverage and the only one of the three with an SVG output, which would
  give the Editable text export a vector fallback picture instead of a PNG. Against it: the size
  is four to ten times Temml's, the web fonts default to a CDN fetch the render worker and the
  standalone HTML cannot make, and the v4 line breaking and speech rule engine are not needed on
  a slide.

### 6.3 Temml 0.13.5

- Output: MathML Core only; "a LaTeX-to-MathML Core JavaScript conversion utility. It is built to
  be lightweight". The README's size table (minified JS plus CSS): Temml 174 KB, KaTeX 280 KB,
  MathJax 2.7.5 338 KB, TeXZilla 168 KB. Files on jsDelivr: `temml.min.js` 164 KB, `temml.mjs`
  469 KB (unminified ESM for bundlers), `Temml-Local.css` 8.8 KB, `Temml-Latin-Modern.css`
  9.1 KB, `Temml-Asana.css`, `Temml-Libertinus.css`, `Temml-NotoSans.css`, `Temml-STIX2.css` each
  about 9 KB, `Temml.woff2` 9.2 KB, `temmlPostProcess.js` 2.9 KB, `temml.d.ts`. API:
  `temml.render`, `temml.renderToString`, `temml.renderMathInElement`; options `displayMode`,
  `annotate` (writes the LaTeX source into a `semantics`/`annotation` element), `throwOnError`,
  `macros`, `trust`, `xml`, `wrap`. Licence: MIT. Zero dependencies; runs in Node without a DOM.
- Fonts: `Temml-Local.css` "is the light-weight option" and "calls three fonts: Cambria Math,
  which comes pre-installed in Windows, STIX TWO, which comes pre-installed in iOS and MacOS (as of
  Safari 16), or NotoSans Math"; "For best results, you must also serve a small (10kb)
  `Temml.woff2` file", which gives "support for `\mathscr{…}`" and "primes at the correct
  vertical alignment in Chrome and Edge". The Latin Modern option is a 380 KB woff2 per the README.
  Known rendering notes: "Chromium and WebKit system font extensible arrows have notes placed too
  high. Some do not stretch in Cambria Math or NotoSans."
- Coverage: "as good as MathJax, slightly better than KaTeX 0.16.0 and substantially better than
  TeXZilla" (README); the supported page's groups are accents, annotation (`\cancel`, `\boxed`,
  `\tag`), colour, delimiters, environments (matrices, arrays, cases, aligned, commutative
  diagrams), HTML (trust gated), letters including Unicode alphanumerics, layout, logic and set
  theory, macros, operators, relations, physics and chemistry (mhchem), style and size and font,
  symbols, units. Limits noted: `{array}` lacks `\cline` and `\multicolumn`; Safari's soft line
  breaks.
- Fit: the smallest bundle, one 9 KB CSS file, MathML in the DOM as the rendering itself rather
  than as a hidden twin, the browser's own math layout on every surface, and the MathML string is
  the input the OMML transform needs anyway. The dependency it adds is a math font on the Linux
  render worker and in the standalone HTML, where no Cambria Math or STIX Two Math exists
  (section 8.4).

### 6.4 MathML Core, the target Temml writes

The W3C Candidate Recommendation Snapshot of 2025-06-24 defines thirty elements: `math`, `mrow`,
`mstyle`, `semantics`, `annotation`, `annotation-xml`, `mi`, `mn`, `mo`, `mtext`, `mspace`,
`ms`, `mfrac`, `msqrt`, `mroot`, `msub`, `msup`, `msubsup`, `munder`, `mover`, `munderover`,
`mmultiscripts`, `mprescripts`, `mtable`, `mtr`, `mtd`, `maction`, `merror`, `mpadded`,
`mphantom`. `display` "must be an ASCII case-insensitive match to `block` or `inline`";
`alttext` "may be used as alternative text by some legacy systems that do not implement math
layout" with no defined behaviour; `mfenced` and `menclose` are not included (read 2026-09-14).
MDN's `math` element page lists `display` and the global attributes (`dir`, `displaystyle`,
`mathbackground`, `mathcolor`, `mathsize`, `scriptlevel`), an implicit ARIA role of `math`, and
Baseline "Widely available" since January 2023.

### 6.5 Comparison

| Criterion                    | KaTeX 0.18.7                                          | MathJax 4.1.3                                   | Temml 0.13.5                                                                  |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Output in the DOM            | HTML and CSS, MathML hidden twin                      | HTML and CSS or SVG                             | MathML Core                                                                   |
| Minified JS                  | 266 KB                                                | 974 KB (chtml) or 1.76 MB (svg)                 | 164 KB                                                                        |
| CSS                          | 24 KB                                                 | none (inline styles)                            | 9 KB                                                                          |
| Fonts to ship                | 20 faces, about 300 KB woff2, must sit beside the CSS | CDN on demand by default; npm packages for Node | 9 KB supplement; one math font of choice (Latin Modern 380 KB) or the OS font |
| Licence                      | MIT                                                   | Apache 2.0                                      | MIT                                                                           |
| Node rendering without a DOM | yes (`renderToString`)                                | yes, with its adaptor                           | yes (`renderToString`)                                                        |
| Same layout in every browser | yes, its own layout                                   | yes                                             | the browser's MathML layout; Chromium in every Turboslide render path         |
| Input to an OMML transform   | its MathML twin (accessibility grade)                 | serialized MathML                               | the output itself                                                             |
| Screen reader path           | the hidden MathML                                     | its speech rule engine (`sre`)                  | the MathML in the DOM                                                         |
| Coverage                     | large                                                 | largest                                         | between KaTeX and MathJax per its README                                      |

## 7. The document shape

### 7.1 An `equation` block

Google Docs' equation is inline in a paragraph; Google Slides has no such thing, and a slide's
equations are placed objects (an add-on inserts them as objects too). The natural Turboslide
shape is a block, positioned on the canvas like a text box, joining the switch in
`render-block.ts` and the catalog in `catalog.ts`:

```ts
/** An equation: LaTeX source rendered as MathML (gslides-parity SPEC-5). */
export type EquationBlock = BlockBase & {
  type: 'equation';
  /** LaTeX math mode source; `\n` allowed inside environments (not a Text, like panel.code). */
  tex: string;
  /** The MathML display attribute; block is the default for a placed object. */
  display?: 'inline' | 'block';
  /** Font size in sheet px; the body size when absent. */
  size?: number;
  color?: Color;
  /** The spoken form: aria-label in the DOM, descr in PPTX, the invisible run in Perfect. */
  alt?: string;
  /** MathML kept from a PPTX import when no tex exists yet (section 8.5). */
  mathml?: string;
  shadow?: Shadow;
};
```

- `tex` is the canonical store, the one an agent writes with `block.set /tex` and reads back. It
  is a string, not a Text in the markup sense (`text.ts` "No line breaks inside a string except
  ... \n in panel.code"), so the four markup rules do not apply to it and `\n` inside an
  `aligned` or `cases` environment is legal. The catalog entry lists `textPaths: []` and
  `export: 'mixed'` (native OMML with a raster fallback in Editable text, the page raster in
  Perfect).
- `display` defaults to `block` because a placed object is display math; `inline` is for a small
  equation set at text size in a row of blocks.
- The renderer draws `<math>` from `temml.renderToString(tex, { displayMode, annotate: true,
throwOnError: false, trust: false, macros: GOOGLE_ALIASES })` inside the block's positioned
  div, at `font-size: size` px in `color`. A parse error renders Temml's `merror` in the block and
  the validator names it (rule `equation/parse`).
- The `html` escape block cannot carry MathML: `sanitize/html.ts` lists `math` in
  `FORBIDDEN_TAGS` and the regex sanitizer strips `math` and `maction` (SPEC-3 8.4 item 1). The
  equation block's MathML comes from Turboslide's own parser with `trust: false`, so `\href`,
  `\htmlClass`, `\htmlStyle`, `\htmlData` and `\includegraphics` never reach the output; the
  forbidden list stays as it is and the equation renderer is the only writer of `<math>`.

### 7.2 Inline math in text, deferred

A sixth markup rule, `$tex$` inside a Text, would give Docs' inline model in paragraphs, text
boxes and table cells. It touches every Text pointer, `parseText`, the PPTX text writer (an
`a14:m` inside a paragraph is legal), the measure worker and the copy rules. The cost is a round
of its own; the block covers the slide use (a formula on a slide is almost always its own object).
Listed for Kevin in section 12.3.

## 8. The export paths

### 8.1 Perfect

Nothing changes. The page is the 2x screenshot of the rendered slide (`docs/pptx.md`, "The two
modes"), Chromium 147 draws the MathML, and the invisible text layer gains one run per equation
holding `alt` when present and `tex` otherwise, so the equation is searchable in the file. The
`ExportReport.perfect` gate (0.1 percent at pixelmatch 0.1) is unaffected because both sides are
the same Chromium render.

### 8.2 Editable text: MathML to OMML in the post-process

- pptxgenjs writes the equation block as a text box placeholder named `ts:<slide>#<block>` with
  the box measured in the browser, the way `pptx/text.ts` writes a text box; the post-process
  (`pptx/build.ts` with jszip, after the shape rewrites of `ooxml/shapes.ts`) replaces that
  `p:sp` with the `mc:AlternateContent` tree of section 5.2: the Choice holds the same shape with
  one `a:p` whose child is `a14:m` > `m:oMathPara` > `m:oMath` and runs naming Cambria Math; the
  Fallback holds the shape with an `a:blipFill` of the block's 2x PNG (the same PNG the Editable
  text mode already writes for icons and diagrams, `pptx/images.ts`), and a new relationship id
  to the media part.
- The transform. Two routes exist. `mathml2omml` (fiduswriter, 0.5.0, tagged 2025-03-14, LGPL
  3.0 or later, pure JavaScript, no DOM, "a MathML to OMML converter" for DOCX) produces OMML with
  WordprocessingML run properties; Turboslide would rewrite `w:rPr` to `a:rPr` and carry an LGPL
  dependency inside an MIT repository (`LICENSE`: MIT, Kevin Liu 2026). The recommendation is
  Turboslide's own transform, `packages/export/src/ooxml/math.ts`: the input is Temml's MathML
  Core, a closed set of thirty elements with no `mfenced` or `menclose`; the output is the
  nineteen OMML objects of Murray Sargent's table (section 5.2) with `m:d` for a `mrow` that
  opens with a stretchy `mo` fence, `m:nary` for a `munderover` or `msubsup` whose base is an
  n-ary operator, `m:func` for an operator name followed by `mo` U+2061, `m:acc` and `m:bar` for
  `mover`/`munder` with an accent, `m:eqArr` and `m:m` for `mtable`, `m:rad` with the degree
  first, `m:sPre` for `mmultiscripts` with `mprescripts`. The element count is small, the mapping
  is documented by Microsoft, and every branch is testable against PowerPoint by opening the
  file. Runs carry `a:rPr` with `<a:latin typeface="Cambria Math"/>`, the block's size in
  hundredths of a point and its colour as `a:solidFill`; `m:sty` `p` marks plain (upright) text
  from `mtext`, `bi` bold italic from `mathvariant`.
- What stays raster: a construct the transform does not map (Temml's `\cancel`, colour boxes,
  `\raisebox`, chemistry arrows) falls back to the PNG shape alone, and the report's residual names
  the block and the construct, the way the table export names a cell that misses its budget
  (`docs/pptx.md`, Editable text).
- The report: `ExportReport` gains `equations: { native: number; raster: number }` per slide, so
  a CLI or MCP reader sees how many equations PowerPoint will open as editable.

### 8.3 The package walk and the validator

`ooxml/groups.ts` matches `p:sp`, `p:pic`, `p:graphicFrame` and `p:cxnSp` by object name; an
equation inside a group is addressed as the `mc:AlternateContent` element, whose two shapes carry
the same object name, so the grouping moves the wrapper as one node. `ooxml/validate.ts` must
resolve the Fallback's `r:embed` to the media part (it walks relationships already) and tolerate
the `mc` namespace on an element under `p:spTree`; the Open Packaging walk is otherwise unchanged.
The `--verify` step through LibreOffice measures the rendered file; whether LibreOffice Impress
draws `a14:m` or the Fallback picture is unverified (section 13), and either way the measured
picture is Turboslide's own PNG or LibreOffice's formula render, so the verify budget of that
block is reported and not gated in the first build.

### 8.4 PDF, HTML, TXT and JPEG

- PDF: `packages/export/src/pdf/build.ts` prints the render package's print document through
  Chromium (`page.pdf({ preferCSSPageSize: true, printBackground: true, scale: 0.8 })`); the
  MathML prints as vector glyphs of the shipped math font, and the pixelmatch gate against the 2x
  web render applies as it does to every other text. No new code path.
- HTML and the standalone runtime: the same `<math>` string, `Temml-Local.css` scoped by the
  renderer, and the math font as an inlined woff2 `@font-face` the way `theme-node.ts` inlines
  Inter (`inlineFontCss`); the `@font-face` is written only when the deck holds an equation block,
  so a deck without equations pays nothing.
- TXT: the `alt` when present, else the `tex` source on its own line.
- JPEG: the raster.

The math font. The Linux render worker has no Cambria Math or STIX Two Math, and a browser that
misses a math font draws MathML with the body font, so stretchy delimiters and large operators
fail. One font must ship. Latin Modern Math (GUST Font License, free redistribution) is the face
Temml's documentation treats as its reference, 380 KB as a woff2 per the README. The
alternatives Temml ships CSS for are STIX Two Math and Libertinus Math (both serif, SIL OFL),
Asana Math, and Noto Sans Math (SIL OFL, a sans face closer to Inter, but "Some do not stretch in
... NotoSans" per Temml's notes on extensible arrows). Section 12.2 asks Kevin to choose between
the reference serif face and a sans face that matches the deck; the report recommends Latin
Modern Math and a subset step later if the 380 KB shows in a budget (the `/edit` route's
`jsDecoded` ceiling is 2 MB and `largestJs` 600 KB in `perf-budget.mjs`; a font is not JS, and it
loads lazily with the first equation).

### 8.5 Import, for report 04

`File > Import slides` from a PPTX meets `mc:AlternateContent` with `a14:m`. The reader takes the
Choice branch's `m:oMath`, converts OMML to MathML (Microsoft's `OMML2MML.XSL` is the reference;
`omml2mathml` by plurimath is a Ruby port of it; a TypeScript port of the same nineteen objects
in reverse is `ooxml/math.ts` read backwards), and stores the MathML in the block's `mathml`
field with `tex` empty. The renderer draws `mathml` when `tex` is absent; the editor opens the
block with an empty source and a note that the equation was imported, and the first edit of the
source replaces it. A MathML to LaTeX converter is not required for the first build; the import
report lists the equation as "kept as MathML, editable in LaTeX after retyping".

## 9. The editing surface

### 9.1 Google's model on a slide

Insert > Equation places an equation block at the slide's centre with a placeholder source and
opens it for editing, the way Insert > Text box arms the draw tool and Insert > Chart places a
default (`menus/model.ts`). Double click on an equation block opens the same editor; Esc closes
it. While an equation block is being edited, the equation toolbar replaces the text toolbar, as
Google's does: a New equation button (inserts another block below the current one), then the
five dropdowns with Google's labels, Greek letters, Miscellaneous operations, Relations, Math
operations, Arrows, each a glyph grid drawn from section 4 with the command name as the tooltip,
and a sixth dropdown, More, holding the standard LaTeX beyond Google's table (matrices, cases,
aligned, accents, fonts, colour). View > Show equation toolbar toggles the toolbar, with a
`toggle('equationToolbar')` effect and the default on.

### 9.2 The source field and the preview

Under the toolbar, the block shows two things: the rendered MathML on the sheet (live, re-rendered
on every keystroke through Temml in the browser, the 164 KB module loaded on first use) and a
source field in the inspector's side panel with the LaTeX. A dropdown pick inserts its LaTeX at
the caret of the source field and places the caret inside the first empty `{}`; Tab moves to the
next empty `{}`, Shift+Tab to the previous. Google's typed grammar holds without translation:
`\alpha` followed by a space is LaTeX; `^` and `_` are LaTeX; Google's `\` then Shift+6 is `\^`,
which the field treats as `^` (the thirteen aliases and this one escape are the whole of the
compatibility layer). A parse error shows Temml's `merror` on the sheet in the error colour and a
one line message under the field; the block is saved as typed, so an agent can fix it later.

### 9.3 The alias macros

`GOOGLE_ALIASES` in `packages/schema/src/blocks/equation.ts`, passed as Temml's `macros`:
`\rootof` as `\sqrt[#1]{#2}`, `\superscript` as `{#1}^{#2}`, `\subscript` as `{#1}_{#2}`,
`\subsuperscript` as `{#1}_{#2}^{#3}`, `\rbracelr` as `\left(#1\right)`, `\sbracelr` as
`\left[#1\right]`, `\bracelr` as `\left\{#1\right\}`, `\abs` as `\left\lvert#1\right\rvert`,
`\limab` as `\lim_{#1\to#2}`, `\liminfa` as `\liminf_{#1}`, `\liminfab` as `\liminf_{#1\to#2}`,
`\limsupa` as `\limsup_{#1}`, `\limsupab` as `\limsup_{#1\to#2}`, `\choose` as `\binom` where
the renderer lacks it. The palette writes standard LaTeX, never the alias, so a source is portable
to any LaTeX tool; the aliases exist for a person typing what Google taught them.

### 9.4 The inspector

The equation block's inspector section: Size (the typography control's size ladder), Colour,
Display (Block, Inline), Alt text (the spoken form; the existing Alt text dialog of SPEC-2), and
the source field. Position, size and rotation are the object controls every block has.

## 10. Keyboard shortcuts

- Google Docs has no chord for Insert > Equation; PowerPoint uses Alt+= on Windows. Turboslide
  binds Insert > Equation to Cmd+Option+Shift+E on a Mac and Ctrl+Alt+Shift+E on Windows, marked
  `turboslide: true` in the model. The R04 fixture's Cmd+Option+Shift rows are f, c, s, p, b, i,
  h, k, a, j and g; the model's chords on E are Cmd+Shift+E (a Google row) and the Edit menu's
  access key Ctrl+Option+E, so E with Cmd+Option+Shift collides with nothing (`keys.ts` grammar,
  `shortcuts.test.ts` collision check).
- Inside the source field: Enter commits and leaves the equation (Google's documented exit per
  the 2024 guide, section 13), Shift+Enter inserts a line break inside an environment, Esc cancels
  the uncommitted edit, Tab and Shift+Tab move between empty groups, Cmd+. and Cmd+, insert `^{}`
  and `_{}` (the same chords that superscript and subscript text elsewhere; `google-shortcuts.json`
  rows), Cmd+Z undoes inside the field before the document's undo.
- On a selected equation block outside editing: Enter opens the editor (as a text box), every
  object chord applies (nudge, resize, rotate, order, group).
- The shortcuts dialog lists the chord under Insert with its Turboslide note, as `keys.ts`
  requires of a `turboslide: true` binding.

## 11. Accessibility

- MathML in the DOM is the accessible form: NVDA reads it with the MathCAT add-on ("plays a chirp
  when it encounters math"; Enter enters the expression), VoiceOver reads MathML in Safari, and
  the DAISY article states that with native MathML "A screen reader user can listen to the math,
  and navigate the expression also" and that "MathML expressions can be zoomed without them
  becoming fuzzy" (read 2026-09-14). Temml's `annotate: true` writes the LaTeX source into
  `<semantics><annotation encoding="application/x-tex">`, which a tool that prefers TeX can read.
- The `math` element carries the implicit ARIA role `math` (MDN). MDN's role guidance: "If the
  math element has only presentational children and the accessible name is intended to convey the
  mathematical expression, use `aria-label`" and for pictures "Make sure any images of math are
  labeled by an `alt` attribute that describes the mathematical expression as it would be
  spoken". Turboslide writes `aria-label` from `alt` only when the author wrote one; without it
  the MathML itself is the accessible content and no label overrides it.
- The `alt` travels: `aria-label` in the DOM, `descr` on `p:cNvPr` of both shapes in PPTX (the
  post-process already writes `descr` for blocks; `docs/pptx.md`), the invisible run in Perfect,
  the TXT export line. The validator's existing alt text finding applies to equation blocks the
  way it applies to pictures.
- Colour: the equation takes the block's colour token, so the ink and paper themes and the
  contrast floors of round four hold; no colour lives inside the LaTeX by default.
- Reduced motion, focus order and the escape key follow the text box's rules; the equation
  toolbar is a toolbar role with the five dropdowns as menu buttons, like the shape picker.

## 12. Recommendation and decisions for Kevin

### 12.1 Recommendation

1. Renderer: Temml 0.13.5 (MIT), `temml.mjs` bundled in `packages/render` for Node and the
   browser, loaded lazily in the studio on the first equation block; `Temml-Local.css` scoped by
   the renderer. Cost: 164 KB minified in one lazy chunk, under the 600 KB `largestJs` ceiling.
2. Document: the `equation` block of section 7.1 with `tex` canonical, `mathml` for imports, and
   `alt`. Catalog `export: 'mixed'`. Validator rule `equation/parse`.
3. Font: one math font shipped like Inter (inlined woff2, written only for decks with an
   equation); Latin Modern Math unless Kevin picks a sans face (12.2).
4. Editable text: Turboslide's own MathML Core to OMML transform in `ooxml/math.ts`, the
   `mc:AlternateContent` wrapper with the PNG Fallback in the post-process, Cambria Math named in
   the runs, the residual naming any block that fell back to the raster; no LGPL dependency.
5. Perfect and PDF: unchanged paths; the invisible run and the printed vectors come for free.
6. Surface: Google's toolbar (New equation, Greek letters, Miscellaneous operations, Relations,
   Math operations, Arrows) plus More, the source field with the live preview and the `{}`
   navigation, the thirteen alias macros, View > Show equation toolbar, Cmd+Option+Shift+E.
7. Agent surface, every entry an action with CLI, MCP and window handlers from the action table
   (`actions.ts`): `equation.render` (input `tex`, `display`, `size`; output MathML, the measured
   box in sheet px, the parse findings; read only) and `equation.symbols` (the section 4 table by
   group with each command's LaTeX and Unicode; read only), plus the existing `block.insert`,
   `block.set /tex`, `block.set /alt` and `deck.validate`. CLI usage
   `turboslide equation render '<tex>' [--display inline|block] [--out mathml|png]`,
   MCP `deck_render_equation` and `deck_equation_symbols`. Two new ids on the table of 203.
8. Tests: a Temml render snapshot per section 4 group; the transform against a fixture of each
   of the nineteen OMML objects; the PPTX opened by LibreOffice in `--verify` with the equation
   block's picture region reported; a PDF page with an equation under the pixelmatch gate; the
   parity audit's row for Insert > Equation with the chord, the toolbar toggle and the tooltip.

### 12.2 The math font

Latin Modern Math (serif, the LaTeX look, Temml's reference target, 380 KB) or a sans face to sit
with Inter (Noto Sans Math, SIL OFL, with Temml's note that some extensible arrows do not
stretch in it; Fira Math is not in Temml's CSS set). The report recommends Latin Modern Math for
correctness of stretchy operators and asks Kevin to confirm or to name the sans face.

### 12.3 Inline math in text

Whether a sixth markup rule `$tex$` inside a Text (Docs' inline model in paragraphs, text boxes
and table cells) belongs in this round or a later one. The block covers the slide use; the inline
rule costs the markup parser, the PPTX text writer, the measure worker and the copy rules.
Recommended: later, listed in SPEC-5's deferred section.

### 12.4 Cambria Math in the file

Whether to name Cambria Math in the OMML runs (PowerPoint's default, present on Windows and in
Office for Mac) or the shipped math font (which PowerPoint would substitute anyway without
`--embed-fonts`). Recommended: Cambria Math, as Microsoft's own example writes it; the Fallback
picture carries Turboslide's face for every other viewer.

## 13. Unverified

1. How Google Docs exports a native equation to DOCX (OMML or a picture) and to PDF (vector text
   or a picture). The help page is silent; third party guides disagree; the MathType page and the
   community thread describe MathType's add-on, not the native editor. A tester with a Google
   account can settle it in ten minutes by inspecting `word/document.xml` of a downloaded DOCX.
2. The caret behaviour of Google's inline box: that Enter leaves the equation (one 2024 guide),
   that the arrow keys cross placeholder boundaries, and that a click inside an existing equation
   reopens the toolbar. Only the backslash grammar, the New equation button and the View toggle
   are Google's words.
3. Whether the fifth dropdown's label is "Math operators" (the help page) or "Math operations"
   (the community lists and guides); the help page's label is used in the design.
4. Whether LibreOffice Impress reads `a14:m` as a formula object or shows the Fallback picture;
   the `--verify` measurement of the first build will show which.
5. The exact byte totals of the KaTeX woff2 set and the KaTeX README's gzipped size badge, which
   the fetch summarised; the per file sizes listed are jsDelivr's.
6. Whether Chromium 147's MathML layout with Latin Modern Math matches Temml's documented
   results for every construct of section 4; the render snapshot tests of 12.1 item 8 measure it.

## 14. Sources

Google, read 2026-09-14:

- Use equations in a document (Computer), https://support.google.com/docs/answer/160749
- Google Docs keyboard shortcuts, https://support.google.com/docs/answer/179738
- Google Slides keyboard shortcuts, https://support.google.com/docs/answer/1696717
- Google Docs API, `Equation` and `ParagraphElement`,
  https://developers.google.com/workspace/docs/api/reference/rest/v1/documents#Equation
- Google Slides API, `Shape.Type`,
  https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/shapes#Shape.Type
- Workspace Marketplace, math2slides,
  https://workspace.google.com/marketplace/app/math2slides/234821903210

Community lists of Google's commands, read 2026-09-14:

- Google Docs Equation Editor Shortcuts / Cheat Sheet, https://equation-shortcuts.notuom.com/
  ("Created in February 2017. Last updated in January 2021"; from `aria-label` attributes)
- Lukas Kollmer, List of mathematical symbol shortcuts supported in Google Docs equations,
  2020-07-18, https://lukaskollmer.de/posts/google-docs-math-symbols/

Third party guides, read 2026-09-14 (used for behaviour Google does not document; section 13):

- How-To Geek, How to Use the Equation Editor in Google Docs, 2019-08-14,
  https://www.howtogeek.com/436537/how-to-use-the-equation-editor-in-google-docs/
- MakeUseOf, How to Type Math Equations in Google Docs, 2024-11-03,
  https://www.makeuseof.com/type-math-equations-in-google-docs/
- freeCodeCamp, How to Write Math Equations in Google Docs, 2025-05-16,
  https://www.freecodecamp.org/news/write-math-equations-in-google-docs/
- GeeksforGeeks, Equation Editor in Google Docs, updated 2026-05-09,
  https://www.geeksforgeeks.org/google-docs/how-to-use-the-equation-editor-in-google-docs/
- SlideModel, How to Insert an Equation in Google Slides, 2024-08-29,
  https://slidemodel.com/how-to-insert-an-equation-in-google-slides/
- Wiris, Microsoft Word and Google Docs compatibility,
  https://docs.wiris.com/mathtype/en/mathtype-office-tools/support/microsoft-word-and-google-docs-compatibility.html

Microsoft and standards, read 2026-09-14:

- [MS-ODRAWXML] Math (the `a14:m` example), page updated 2026-02-17,
  https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/38b13e1f-1102-4bb7-819a-dd5d9abdb176
- Murray Sargent, MathML and Ecma Math (OMML), 2006-10-06,
  https://learn.microsoft.com/en-us/archive/blogs/murrays/mathml-and-ecma-math-omml
- Microsoft Support, Write an equation or formula (Word and PowerPoint),
  https://support.microsoft.com/en-us/office/write-an-equation-or-formula-1d01cabc-ceb1-458d-bc70-7f9737722702
- Unicode Technical Note 28, UnicodeMath version 3.1, 2016-11-16,
  https://www.unicode.org/notes/tn28/UTN28-PlainTextMath-v3.1.pdf
- W3C MathML Core, Candidate Recommendation Snapshot 2025-06-24, https://www.w3.org/TR/mathml-core/
- MDN, MathML, https://developer.mozilla.org/en-US/docs/Web/MathML (modified 2025-09-15)
- MDN, `<math>`, https://developer.mozilla.org/en-US/docs/Web/MathML/Reference/Element/math
- MDN, ARIA `math` role,
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/math_role
- DAISY Consortium, MathML what has changed and why it matters, 2023-03-13,
  https://daisy.org/news-events/articles/mathml-what-has-changed-and-why-it-matters/
- python-pptx pull request 706, Handle a Shape having formula, 2021-05-03,
  https://github.com/scanny/python-pptx/pull/706
- PptxGenJS issue 1456, Native mathematical notation support, 2026-05-07,
  https://github.com/gitbrent/pptxgenjs/issues/1456

Libraries, read 2026-09-14:

- KaTeX, https://github.com/KaTeX/KaTeX (README), https://katex.org/docs/options,
  https://katex.org/docs/browser, https://katex.org/docs/supported, https://katex.org/docs/issues,
  https://raw.githubusercontent.com/KaTeX/KaTeX/main/LICENSE,
  https://github.com/KaTeX/katex-fonts and its LICENSE,
  jsDelivr listings https://cdn.jsdelivr.net/npm/katex/dist/ and
  https://cdn.jsdelivr.net/npm/katex/dist/fonts/ (katex@0.18.7)
- Temml, https://temml.org/, https://github.com/ronkok/Temml (README),
  https://temml.org/docs/en/administration.html, https://temml.org/docs/en/supported.html,
  jsDelivr listing https://cdn.jsdelivr.net/npm/temml/dist/ (temml@0.13.5)
- MathJax, https://docs.mathjax.org/en/latest/output/index.html,
  https://docs.mathjax.org/en/latest/output/fonts.html,
  https://docs.mathjax.org/en/latest/upgrading/whats-new-4.0.html,
  https://raw.githubusercontent.com/mathjax/MathJax/master/LICENSE,
  jsDelivr listing https://cdn.jsdelivr.net/npm/mathjax/ (mathjax@4.1.3)
- mathml2omml, https://github.com/fiduswriter/mathml2omml (README, `package.json` 0.5.0,
  LGPL-3.0-or-later, tags: v0.5.0 2025-03-14)

Repository files, read 2026-09-14 at `d5d7f07`: listed in section 1.
