# Dropdowns

The binding specification of the dropdown round: one shared dropdown drawn by Turboslide in place of every native select, its behaviour, its look, the helpers that drive it in tests, the lint that keeps the native element out, the rows that pin it and the three lanes that build it. Written on 2026-10-08 from 10:30 to 11:30 PDT in the worktree `/Users/kevinliu/repos/Turboslide-dropdown` on `dropdowns/round` at `0d3920a3` (origin/main), from Kevin's message and screenshot of 2026-10-08 and the tree. Read in full: every `<select>` element under `apps/` and `packages/` (`git grep -n "<select" -- 'apps/**/*.tsx' 'packages/**/*.tsx'`, 40 elements in 26 files) with the component around each; `packages/chrome/src/Layer.ts`, `place.ts`, `usePlate.ts`, `Menu.tsx`, `Menu.css`, `presence/PlateMenu.tsx`, `Seg.tsx`, `Tooltip.tsx` 1 to 80, `inspector/select.tsx`, `select.css`, `seg.tsx`, `seg.css`, `props.ts`; `packages/theme/src/scale.ts`; `packages/agent/src/window/controls.ts` and `registry.test.ts`; `packages/lint/src/brand/competitor.ts`, `config.ts` 1 to 215, `run.ts` 74 to 135, `main.ts`; `docs/DESIGN.md` sections 1 to 4, 6, 9 to 13; `docs/POLISH-2.md` sections 6 to 9; `scripts/probes/core-matrix.mjs` 255 to 400 and `core-matrix.test.mjs` 55 to 130, 525 to 560, 1395 to 1425, 1845 to 1880. Read where a decision needed a line: the CSS of every site, `tokens.css` 485 to 535, `Dialog.css` 170 to 205 and 236 to 285, `useEditorKeys.ts` 55 to 80, `useShellKeys.ts` 134, `viewer/src/InlineText.tsx` 660 to 690 and 2790 to 2880, `Selection.tsx` 195 to 215, `Editor.tsx` 1010 to 1030, `EditorShell.tsx` 1320 to 1336 and 2600 to 2630, `scripts/tooltip-audit.mjs` 86 to 130, and every test, spec and probe line that drives a select (section 2.6). No server, browser or build ran, no picture was taken, and nothing was fetched from the network. The machine's one minute load read 84 at 10:51 PDT.

Contents: 1 the ask and the decisions, 2 every native popup today, 3 the component, 4 the four hidden mirrors, 5 the test helpers, 6 the lint, 7 the rows, 8 the lanes, 9 the gates, 10 the questions only Kevin can answer, sources.

## 1. The ask and the decisions

### 1.1 Kevin's words, verbatim

On 2026-10-08, with a screenshot of production's Share dialog in the dark appearance: "use custom dropdowns!!!". The screenshot shows the General access field's native select open as the operating system's popup: a translucent grey panel with large round corners, a system check mark before "Restricted", then "Anyone with the link", drawn over the field and over the sentence under it, in the system font, unlike every other surface of the dialog.

The standing words that bind this round: one shared component for a cross cutting UI standard, used on every surface, with no page copies; the design round's system (`docs/DESIGN.md`: one stacking scale, the radius ladder of 0, 4, 6 and 8 px with menus and controls at 6, the colour tokens, the original Inter with tabular figures, the shared 8 px scrollbar, nine themes in two appearances); plain technical English in every word a person reads (sentence case, no em dashes, no metaphors, no "X, not Y", Title Case only on buttons); "make sure to actually test our features and make sure they work"; no word a person reads names another company's slides app.

### 1.2 The decisions

| #   | Decision                                                                                                                                                                                                                                                                                                 | Reason                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | One component, `Select`, in `packages/chrome/src/Select.tsx` with `Select.css`, replaces all 40 select elements and the four hidden mirrors. No page keeps a select of its own                                                                                                                           | Kevin's rule of one shared component; the native popup cannot take the product's corners, font, colours or layer                                                                                                       |
| C2  | The behaviour is the WAI-ARIA Authoring Practices select-only combobox: a `button` with `role="combobox"` that keeps the focus, and a `role="listbox"` of `role="option"` rows named through `aria-activedescendant`                                                                                     | The pattern screen readers announce as a dropdown, with DOM focus never leaving the trigger, so every dialog's Tab trap, every popover's blur rule and every key rule of the editor keep working                       |
| C3  | The list is a plate of the popover layer through `usePlate` (`Layer.ts` and `place()`), with the menus' row styles shared from `Menu.css`. There is no second popover system                                                                                                                             | `docs/DESIGN.md` 2.2 to 2.4: the popover layer sits over every dialog, the top layer ignores the dialog's clipping, and `place()` keeps the plate inside the window                                                    |
| C4  | The listbox is always mounted, hidden while closed, right after its trigger in the DOM. It opens in the top layer from that place                                                                                                                                                                        | The window API sets a value in one synchronous call by clicking an option that exists; a dialog's outside press and Tab trap read the list as inside the dialog; inherited tokens keep applying (DESIGN.md 2.3 item 3) |
| C5  | `onChange` keeps the native change semantics: it runs once per choice, only for a value other than the current one, after the list closes, inside the input event that chose                                                                                                                             | Every site's handler stays as written, including the sites that open a file chooser or a confirmation from the change and need the person's activation                                                                 |
| C6  | Two sizes: `field` (32 px, 13 px text) for dialogs, panels and pages; `compact` (22 px, 12 px text) for the inspector's rows. A row of another height (the Share people row at 28, Format options and the Theme panel at 30, the shader uniforms at 24) sets `height` on its own class, as it does today | The two heights tokens.css (`.pt-select`) and `inspector/select.css` (`.ts-ctl-select`) already draw; the other heights are row layout facts that exist today                                                          |
| C7  | The window API learns the combobox: `controls()` lists it as kind `select` with its value, `set()` clicks the matching option, and a combobox is a control of its own even inside a `role="group"`                                                                                                       | Agents and probes set dropdowns today through `set()` on the native element (`controls.ts` 150 to 245); the contract stays                                                                                             |
| C8  | The four visually hidden native mirrors leave. The Seg fields and the dither plate are set through their Seg group, the palette through its swatch group and its hex field, the icon field through its picker's tiles (section 4)                                                                        | A keyboard Tab reaches each mirror and Space or Alt+Down opens the system popup at a 1 px box; the window API's group path (`controls.ts` 70 to 137) already sets a Seg by clicking its option                         |
| C9  | The viewer's link popover takes the dropdown through a context slot that the viewer declares and the studio fills, `packages/viewer/src/select-slot.ts`                                                                                                                                                  | `@turboslide/chrome` depends on `@turboslide/viewer` (`packages/chrome/package.json` 118), so the viewer cannot import chrome                                                                                          |
| C10 | A focused trigger counts as a field for the editor's key rules (`useEditorKeys.ts`, `Selection.tsx`, `InlineText.tsx`), as a focused select does today                                                                                                                                                   | Backspace on a trigger in Format options would otherwise delete the selected object, and a click on a trigger during a text session would park and refocus the text                                                    |
| C11 | One e2e helper, `chooseOption` in `apps/studio/e2e/choose-option.ts`, replaces every `selectOption` call; the probe toolkit and the scripts import it; one unit helper of the same name serves the chrome's unit tests                                                                                   | One way to drive a dropdown in every test and probe                                                                                                                                                                    |
| C12 | The lint `packages/lint/src/brand/native-select.ts` fails on a JSX `select` element in any `.tsx` file and on any `selectOption` call, scanned over the whole tree like the competitor guard                                                                                                             | The native element cannot come back by a later page                                                                                                                                                                    |
| C13 | The other native popups (the Theme panel's colour well, two `window.confirm` boxes) stay this round and are questions 1 and 2                                                                                                                                                                            | They are not dropdowns; each has its own product replacement to design                                                                                                                                                 |

### 1.3 What this round does not do

- It adopts no library: DESIGN.md 1.3 declined the Radix primitives, and a select library brings a portal and a placement of its own beside `usePlate`.
- It does not move the product's own lists that are already drawn by Turboslide (the font picker, the weight and dash lists, the show's and the presenter view's slide lists, the asset picker's list) onto `Select`; they draw samples, search fields or slide titles the shared list does not (question 3).
- It does not change any site's options, values or handlers beyond what section 2.1 names, and no word a person reads beyond section 3.9.
- It does not change `/home`: the landing draws no select (its Share figure's role is a `span`, `components/home/live/share.ts` 83) and its live core imports no `place()` (DESIGN.md 2.4).
- It does not replace the five "is this a field" predicates with one function; it adds one clause to the three the editor reads (C10).

## 2. Every native popup today

### 2.1 The 40 select elements

Line numbers at `0d3920a3`. "Size" is the size the site takes. The lane owns the file (section 8).

| #   | Site                                                    | `data-control`                                             | What the field chooses                                                                                                                                                                                    | Size    | Lane |
| --- | ------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- |
| 1   | `apps/studio/src/routes/decks.index.tsx:1003`           | `home.sort`                                                | The order of the presentations: Last opened by me, Last modified, Title                                                                                                                                   | field   | S1   |
| 2   | `apps/studio/src/routes/decks.index.tsx:1072`           | `home.show`                                                | The admin's filter: Yours and shared with you, Every presentation                                                                                                                                         | field   | S1   |
| 3   | `apps/studio/src/routes/dev.auth.tsx:150`               | `gallery.pick` (on the label)                              | The auth gallery's state and host, on a local server alone                                                                                                                                                | field   | S1   |
| 4   | `apps/studio/src/routes/print.$deckId.tsx:252`          | `print.layout`                                             | The print layout: slides, slides with notes, and the handout rows marked later (disabled options)                                                                                                         | field   | S1   |
| 5   | `packages/chrome/src/AssetPicker.tsx:181`               | `<control>.role.list`                                      | The asset picker's role filter when more than four roles are present: every role and each role                                                                                                            | compact | S2   |
| 6   | `packages/chrome/src/ThemesPanel.tsx:647`               | `panel.brand.logo.position`, `panel.brand.footer.position` | One function drawn twice: where the title mark sits (above the title, a corner, hidden) and where the footer logo sits (a corner, hidden)                                                                 | field   | S1   |
| 7   | `packages/chrome/src/ThemesPanel.tsx:1021`              | `panel.brand.footer.logo`                                  | The footer logo: the theme's, none, a picture; Picture with no picture yet opens the file chooser from the change                                                                                         | field   | S1   |
| 8   | `packages/chrome/src/ThemesPanel.tsx:1094`              | `panel.brand.counter.format`                               | The slide counter's format: `n / N`, `n`, `Slide n`                                                                                                                                                       | field   | S1   |
| 9   | `packages/chrome/src/YouNeedAccess.tsx:134`             | `access.role`                                              | The role a request asks for (Viewer, Commenter, Editor), posted as the form field `role`                                                                                                                  | field   | S1   |
| 10  | `packages/chrome/src/comments/CommentsPanel.tsx:135`    | `panel.comments.filter`                                    | The threads shown: All, Open, Resolved                                                                                                                                                                    | field   | S1   |
| 11  | `packages/chrome/src/dialogs/Download.tsx:499`          | `dialog.download.theme`                                    | The PowerPoint file's appearance: Light, Dark, Both                                                                                                                                                       | field   | S1   |
| 12  | `packages/chrome/src/dialogs/Download.tsx:513`          | `dialog.download.fonts`                                    | The PowerPoint file's font names: Standard, Exact                                                                                                                                                         | field   | S1   |
| 13  | `packages/chrome/src/dialogs/Link.tsx:106`              | `dialog.link.slide`                                        | A link's slide target: None, Next, Previous, First and Last slide, then every slide as `n. Title`                                                                                                         | field   | S1   |
| 14  | `packages/chrome/src/dialogs/MoreFonts.tsx:81`          | `dialog.moreFonts.category`                                | The font list's category: All categories and each category                                                                                                                                                | field   | S1   |
| 15  | `packages/chrome/src/dialogs/Publish.tsx:162`           | `dialog.publish.size`                                      | The embed frame's size preset (`Label (W by H)`) or Custom                                                                                                                                                | field   | S1   |
| 16  | `packages/chrome/src/dialogs/RequestAccess.tsx:65`      | `dialog.requestAccess.role`                                | The role a request asks for                                                                                                                                                                               | field   | S1   |
| 17  | `packages/chrome/src/dialogs/Share.tsx:1052`            | `dialog.share.mode`                                        | General access: Restricted, Anyone with the link (the field of Kevin's screenshot)                                                                                                                        | field   | S1   |
| 18  | `packages/chrome/src/dialogs/Share.tsx:1079`            | `dialog.share.linkRole`                                    | What anyone with the link may do: Viewer, Commenter, Editor                                                                                                                                               | field   | S1   |
| 19  | `packages/chrome/src/dialogs/Share.tsx:1302`            | `dialog.share.inviteRole`                                  | The role of the people an invitation adds                                                                                                                                                                 | field   | S1   |
| 20  | `packages/chrome/src/dialogs/Share.tsx:1729`            | `dialog.share.grant.<key>.role`                            | A person's role, then three actions in the same list: Transfer ownership, Add expiration, Remove access (Remove asks through `window.confirm`)                                                            | field   | S1   |
| 21  | `packages/chrome/src/dialogs/Share.tsx:1766`            | `dialog.share.grant.<key>.expiry`                          | The expiry of a person's access (no expiry, 7, 30, 90 days); drawn after Add expiration with a disabled placeholder row, focused on mount, hidden again on blur                                           | field   | S1   |
| 22  | `packages/chrome/src/dialogs/SpecialCharacters.tsx:144` | `dialog.specialCharacters.category`                        | The character category: arrows, punctuation, currency, math, symbols, emoji                                                                                                                               | field   | S1   |
| 23  | `packages/chrome/src/inspector/asset.tsx:121`           | `<spec.control>`                                           | A generated asset field's asset: none and every asset id                                                                                                                                                  | compact | S2   |
| 24  | `packages/chrome/src/inspector/asset.tsx:438`           | `<control>.role`                                           | The asset intake's role                                                                                                                                                                                   | compact | S2   |
| 25  | `packages/chrome/src/inspector/asset.tsx:527`           | `<control>.plate`                                          | The asset intake's two-tone plate side: none, lower left, lower right, upper left                                                                                                                         | compact | S2   |
| 26  | `packages/chrome/src/inspector/chart.tsx:793`           | `<control>.legend`                                         | The chart legend's position, None hides it                                                                                                                                                                | compact | S2   |
| 27  | `packages/chrome/src/inspector/chart.tsx:812`           | `<control>.numberFormat`                                   | The chart's number format                                                                                                                                                                                 | compact | S2   |
| 28  | `packages/chrome/src/inspector/dither.tsx:365`          | `asset.<id>.plate`                                         | A hidden mirror of the plate Seg beside it (section 4)                                                                                                                                                    | none    | S2   |
| 29  | `packages/chrome/src/inspector/fields.tsx:301`          | `SelectField`'s `control`                                  | The shared field of Format options, drawn at 11 call sites: line kind, start, end, weight and dash; picture border weight and dash; the shader's plate; text line spacing and columns; the dither channel | field   | S2   |
| 30  | `packages/chrome/src/inspector/icon.tsx:82`             | `<spec.control>`                                           | A hidden mirror of the icon picker (section 4)                                                                                                                                                            | none    | S2   |
| 31  | `packages/chrome/src/inspector/json.tsx:83`             | `<spec.control>` or `<spec.control>.form`                  | A JSON field's common forms, none and Custom                                                                                                                                                              | compact | S2   |
| 32  | `packages/chrome/src/inspector/palette.tsx:205`         | `<spec.control>`                                           | A hidden mirror of the colour swatches (section 4)                                                                                                                                                        | none    | S2   |
| 33  | `packages/chrome/src/inspector/seg.tsx:32`              | `<spec.control>`                                           | A hidden mirror of every generated Seg (section 4)                                                                                                                                                        | none    | S2   |
| 34  | `packages/chrome/src/inspector/select.tsx:18`           | `<spec.control>`                                           | `SelectControl`: a generated enum of five or more values (key widths, icon tones, an opener's section), with none for an optional field                                                                   | compact | S2   |
| 35  | `packages/chrome/src/inspector/shader.tsx:522`          | `<ID>.uniform.<name>`                                      | A shader's enum uniform                                                                                                                                                                                   | compact | S2   |
| 36  | `packages/chrome/src/inspector/table.tsx:303`           | `<control>.border.weight`                                  | The table's rule weight, None removes the rules                                                                                                                                                           | compact | S2   |
| 37  | `packages/chrome/src/inspector/table.tsx:328`           | `<control>.border.dash`                                    | The table's rule dash                                                                                                                                                                                     | compact | S2   |
| 38  | `packages/chrome/src/inspector/table.tsx:465`           | `<control>.cell.border.weight`                             | A cell's own rule weight, Table's returns to the table's                                                                                                                                                  | compact | S2   |
| 39  | `packages/chrome/src/inspector/table.tsx:498`           | `<control>.cell.border.dash`                               | A cell's own dash, Table's returns to the table's                                                                                                                                                         | compact | S2   |
| 40  | `packages/viewer/src/InlineText.tsx:2836`               | `popover.link.slide`                                       | The link popover's slide target: the four positions and every slide; empty shows "Slides in this presentation"                                                                                            | field   | S1   |

S1 holds 22 sites in 14 files, S2 holds 18 sites in 12 files. The prompt that started this round counted 23 files; `git grep -l "<select" -- 'apps/**/*.tsx' 'packages/**/*.tsx'` lists 26.

### 2.2 The four hidden mirrors

`seg.tsx` 32, `icon.tsx` 82, `palette.tsx` 205 and `dither.tsx` 365 draw a native select with the class `ts-native-mirror` (`seg.css` 25 to 35: 1 px, clipped). Each carries the field's accessible label and `data-control`, so the window API's `set()` writes it, and a Tab from the row reaches it. A focused mirror opens the system popup on Space or Alt+Down, anchored to its 1 px box at the field's top left. They are in scope; section 4 says what replaces each.

### 2.3 Other native popups

| Element                                                                                           | In scope | Why                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input type="color"`, `ThemesPanel.tsx` 699 (the brand kit's colour wells)                        | No       | It opens the system colour picker, which is not a dropdown; the product's colour plate with its hex field is the replacement for a later round (question 1) |
| `window.confirm`, `Share.tsx` 1740 (Remove access) and `dialogs/Profile.tsx` 254 (Delete account) | No       | A system confirmation box; the product's `Dialog` is the replacement for a later round (question 2)                                                         |
| `datalist`, `input list`, `input type="date"`, `time`, `month`, `week`                            | None     | `git grep` finds none under `apps/` and `packages/`                                                                                                         |
| `input type="file"` (the uploads)                                                                 | No       | The system file chooser is the only way to pick a file                                                                                                      |

### 2.4 The product's anchored surfaces this round builds on

- `Layer.ts`: `useLayer(ref, { layer, open })` puts an element in the top layer with `popover="manual"` at its layer of `LAYERS` (`packages/theme/src/scale.ts`: `popover` is 50, over `dialog` 40, under `toast` 60 and `tooltip` 70) and keeps the scale's order among open surfaces.
- `place.ts`: `place(anchor, plate, options)` on `@floating-ui/dom` 1.8.0 with `strategy: 'fixed'`, flip, shift 8 px from the edges, `fit` (a max-height from the room on the plate's side, never under 56 px) and `autoUpdate`.
- `usePlate.ts`: `usePlate(ref, { layer, anchor, open, side, align, gap, fit, follow })`, the doorway every anchored plate uses; returns null until the first placement.
- `Menu.tsx` and `Menu.css`: the menu primitive and its rows (28 px, a 16 px icon slot holding the check glyph on a checked row, the label, 4 px plate padding, dividers in `--pt-hair-soft`, the lit row on `--pt-plate`, disabled rows in `--pt-disabled`, type ahead with a one second buffer).
- `presence/PlateMenu.tsx`: a small anchored menu whose rows the caller draws, on the same hook.
- `Tooltip.tsx`: `tipProps({ name, doc, key })`; `hideTooltipUntilInput()` as a menu opens.
- `tokens.css` 490 to 534: the one select rule of chrome (`.pt-select`, `.ts-dialog select`: 32 px, the `--pt-field` boundary, the 6 px corner, a chevron drawn with two gradients, `appearance: none`); `Dialog.css` 175 to 177 and 198: a dialog's select fills its row.

### 2.5 Other code that reads a select

| File and line                                                                                                                     | What it does with a select                                                             | Change                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/agent/src/window/controls.ts` 14 to 256                                                                                 | `controls()` lists it as kind `select`; `set()` writes its value and dispatches change | The combobox branch of 3.11 (core)                      |
| `packages/chrome/src/useEditorKeys.ts` 70 to 76                                                                                   | `isChromeField`: a focused select keeps the browser's keys                             | Add `[role="combobox"]` (core)                          |
| `packages/viewer/src/Selection.tsx` 200 to 209                                                                                    | `isEditableTarget`: the shell keys are inert on a select                               | Add `[role="combobox"]` (core)                          |
| `packages/viewer/src/InlineText.tsx` 670 to 674                                                                                   | `isFieldElement`: a click into a select ends the text session                          | Add `[role="combobox"]` (S1, with site 40)              |
| `packages/viewer/src/InlineText.tsx` 685                                                                                          | `OPEN_PLATE_SELECTOR` matches `.ts-menu`                                               | None: the hidden listbox never carries `.ts-menu` (3.7) |
| `packages/lint/src/chrome.ts` 330                                                                                                 | `menu: Boolean(document.querySelector('.ts-menu'))`                                    | None, for the same reason                               |
| `packages/viewer/src/Editor.tsx` 1012                                                                                             | `CHROME_CONTROL` lists `select` and `button`                                           | None: the trigger is a `button`                         |
| `scripts/tooltip-audit.mjs` 87 to 91                                                                                              | `INTERACTIVE` lists `select` and `[role="option"]`; hidden trees are excluded          | None: every option carries `data-tip` (3.2)             |
| `apps/studio/src/components/docs/DocsShell.tsx` 72, `components/home/live/show.ts` 301, `packages/chrome/src/useShellKeys.ts` 134 | Field predicates on pages with no dropdown                                             | None                                                    |

### 2.6 Every test and driver that drives a select

| File                                                              | Lines                                                      | What it does                                                                                                                                                   | Lane |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `packages/chrome/src/__tests__/share-dialog.test.tsx`             | 685, 1063, 1203 to 1205                                    | Reads `.value` of the mode and link role; `fireEvent.change` on the mode                                                                                       | S1   |
| `apps/studio/e2e/core/share.spec.ts`                              | 236 to 240, 1380 to 1390, 1963 to 1967, 1993 to 2000, 2036 | `inputValue`, `selectOption`, `options[selectedIndex]` on the mode and link role                                                                               | S1   |
| `apps/studio/e2e/share.spec.ts`                                   | 136, 381                                                   | `toHaveValue` on the mode; `selectOption` on `access.role`                                                                                                     | S1   |
| `apps/studio/e2e/roles.spec.ts`                                   | 284                                                        | `toHaveValue` on the mode                                                                                                                                      | S1   |
| `apps/studio/e2e/accounts.spec.ts`                                | 742 to 760, 808                                            | `selectOption` on the mode, the link role and the invite role                                                                                                  | S1   |
| `apps/studio/e2e/core/chrome-surfaces.ts`                         | 547 to 550, 969 to 1030                                    | Reads `[data-control="dialog.share"] select`; `chrome.layers.menu-over-dialog` chooses through `selectOption` and expects `select` first at the field's centre | S1   |
| `apps/studio/e2e/core/brand.spec.ts`                              | 1060 to 1075, 1655 to 1665                                 | `selectOption` on the title mark position; reads `options[selectedIndex]`                                                                                      | S1   |
| `apps/studio/e2e/core/brand-themes.ts`                            | 541                                                        | Reads corners of `.ts-themes.ts-brand select`                                                                                                                  | S1   |
| `apps/studio/e2e/home.spec.ts`                                    | 160, 163                                                   | `selectOption` on `home.sort`                                                                                                                                  | S1   |
| `apps/studio/e2e/core/design-pages.ts`                            | 618                                                        | Reads the corners of `home.sort` (no change expected; read again)                                                                                              | S1   |
| `apps/studio/e2e/core/export.spec.ts`                             | 531, 1464 to 1469                                          | `selectOption` on `print.layout`; `check(page, 'dialog.download.fonts')`, a stale id for `dialog.download.embedFonts` that clicks the select                   | S1   |
| `apps/studio/e2e/core/present.spec.ts`                            | 675 to 695                                                 | `selectOption` on `popover.link.slide` when its tag is `select`                                                                                                | S1   |
| `apps/studio/e2e/core/chrome-pages.ts`                            | 72                                                         | Lists `select` among the controls it reads                                                                                                                     | S1   |
| `scripts/probes/core-walk/areas/brand.mjs`                        | 1002 to 1013                                               | `selectOption` when the counter format is a `select`, else a click on `[data-control^="panel.brand.counter.format."]`                                          | S1   |
| `scripts/probes/core-walk/areas/chrome.mjs`                       | 1093 to 1098, 1435 to 1463                                 | Reads `[data-control="dialog.share"] select` (border contrast, height, `appearance`) and the comments filter                                                   | S1   |
| `scripts/probes/core-walk/areas/export.mjs`                       | 315                                                        | `selectOption` on `print.layout`                                                                                                                               | S1   |
| `scripts/probes/core-walk/areas/polish-text.mjs`                  | 933 to 950                                                 | Reads the link field's label through `options` when it is a `select`                                                                                           | S1   |
| `scripts/probes/core-walk/areas/text.mjs`                         | 2713                                                       | Presence of `popover.link.slide` (no change expected)                                                                                                          | S1   |
| `scripts/probes/core-walk/areas/share.mjs`                        | 589                                                        | Count of `panel.comments.filter` (no change expected)                                                                                                          | S1   |
| `scripts/layout-shift-audit.mjs`                                  | 266, 267                                                   | `page.selectOption` on `print.layout`                                                                                                                          | S1   |
| `scripts/gslides-parity-audit.mjs`                                | 1463, 3636, 5391                                           | Selector lists that name `select`                                                                                                                              | S1   |
| `packages/chrome/src/__tests__/inspector-component.test.tsx`      | 80, 99, 169                                                | `getByLabelText('list: Key width')` and `fireEvent.change`; reads `data-control` of `slide: Type`                                                              | S2   |
| `packages/chrome/src/__tests__/inspector-sections.test.tsx`       | 222, 289                                                   | `fireEvent.change` on the palette mirror (`t: Color`) and on `slide: Type`                                                                                     | S2   |
| `packages/chrome/src/__tests__/format-options-round-two.test.tsx` | 95 to 98, 244, 251, 279                                    | `fireEvent.change` on line spacing, columns and line end                                                                                                       | S2   |
| `packages/chrome/src/__tests__/chart-grid.test.tsx`               | 318 to 350                                                 | `fireEvent.change` on the legend and number format                                                                                                             | S2   |
| `packages/chrome/src/__tests__/table-section.test.tsx`            | 86 to 101, 226 to 257, 375 to 377                          | `fireEvent.change` on the border and cell border fields; reads `.value` and `.disabled`                                                                        | S2   |
| `packages/chrome/src/__tests__/inspector-generate.test.ts`        | 92 to 99, 162                                              | The generator's `seg` and `select` kinds (changes with 4.1)                                                                                                    | S2   |
| `apps/studio/e2e/charts.spec.ts`                                  | 290 to 295                                                 | `selectOption` on the legend                                                                                                                                   | S2   |
| `apps/studio/e2e/window-api.spec.ts`                              | 221, 240                                                   | `set('list: Size', 22)` and `set('block.list.size', 22)`, which reach the Seg's mirror today                                                                   | S2   |
| `scripts/probes/core-walk/areas/charts.mjs`                       | 1216                                                       | Counts `select, [role="radiogroup"]` named chart type or kind                                                                                                  | S2   |
| `scripts/probes/core-walk/areas/tables.mjs`                       | 3385 to 3395                                               | Presence of the border fields in their groups (no change expected)                                                                                             | S2   |
| `packages/agent/src/window/registry.test.ts`                      | 90 to 130                                                  | The Seg group path and `controls()` kinds                                                                                                                      | core |
| `packages/viewer/src/__tests__/editor-keys.test.ts`               | 32, 119 to 139                                             | A `select` in the inspector fixture for `isChromeControlTarget`                                                                                                | core |
| `packages/chrome/src/__tests__/use-editor-keys.test.tsx`          | the field cases                                            | `isChromeField` through the hook                                                                                                                               | core |
| `apps/studio/e2e/core/chrome.spec.ts`                             | 524                                                        | Counts `input, button, select, textarea` in the shader section (no change expected: the trigger is a button)                                                   | core |

Archived scripts under `docs/` that call `selectOption` (`docs/archive/status/editor-depth-drive.mjs`, `docs/gslides-parity/**/*.mjs`, ten calls in eight files) are records of past rounds; they are not run, not changed and not read by the lint (section 6).

## 3. The component

### 3.1 Name, file and props

`packages/chrome/src/Select.tsx`, exported as `@turboslide/chrome/Select` (one line in `packages/chrome/package.json`), with `Select.css`:

```ts
import type { IconName } from './icons';
import type { TipInput } from './Tooltip';

/** One row of the list. */
export type SelectOption<T extends string = string> = {
  /** the value onChange reports and the row's `data-value` */
  value: T;
  /** the words of the row and of the closed trigger */
  label: string;
  /** a second line under the label, in 12 px titanium */
  description?: string;
  /** a glyph of the sprite in the row's 16 px slot, and before the label in the trigger */
  icon?: IconName;
  /** drawn in --pt-disabled, skipped by the keys and the pointer */
  disabled?: boolean;
};

/** Rows that belong together: a divider before every group but the first, and a heading when named. */
export type SelectGroup<T extends string = string> = {
  heading?: string;
  options: readonly SelectOption<T>[];
};

export type SelectProps<T extends string = string> = {
  /** the chosen value; a value no option carries shows the placeholder */
  value: string;
  options: readonly (SelectOption<T> | SelectGroup<T>)[];
  /** a different option was chosen (3.5) */
  onChange: (value: T) => void;
  /** the accessible name, as the site's aria-label is today */
  label: string;
  /** the trigger's data-control; each option takes `<control>.<value>` */
  control?: string;
  /** 32 px for dialogs, panels and pages; 22 px for the inspector's rows */
  size?: 'field' | 'compact';
  /** the trigger's tooltip, as the site passes to tipProps today */
  tip?: TipInput;
  disabled?: boolean;
  /** the trigger's words while no option carries the value */
  placeholder?: string;
  /** a form field: a hidden input of this name carries the value */
  name?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  /** classes on the trigger, for the site's layout (width, height, margin) */
  className?: string;
  id?: string;
};

export function Select<T extends string>(props: SelectProps<T>): JSX.Element;
```

Values are strings, as a select's are. A site with numeric values (the table weights) keeps converting with `String()` and `Number()` as it does today.

### 3.2 The DOM and its attributes

```text
<span class="ts-dropdown">
  <button type="button" role="combobox" class="ts-dropdown-trigger is-field"
          aria-haspopup="listbox" aria-expanded="false" aria-controls="LIST_ID"
          aria-label="General access" data-control="dialog.share.mode"
          value="restricted" data-tip="General access">
    <span class="ts-dropdown-value">Restricted</span>
    <span class="ts-dropdown-chevron" aria-hidden="true">(the sprite's chevron-down)</span>
  </button>
  <div id="LIST_ID" role="listbox" class="ts-dropdown-list pt-float"
       aria-label="General access" hidden>
    <div id="OPTION_ID" role="option" class="ts-dropdown-option" aria-selected="true"
         data-value="restricted" data-control="dialog.share.mode.restricted"
         data-tip="Restricted">
      <span class="ts-menu-ic" aria-hidden="true">(the sprite's check)</span>
      <span class="ts-menu-label">Restricted</span>
    </div>
    <div role="option" aria-selected="false" ...>Anyone with the link</div>
  </div>
  <input type="hidden" name="role" value="viewer">   (only with `name`)
</span>
```

- `.ts-dropdown` is `display: contents`, so a site's flex or grid places the trigger as it placed the select.
- Every class of the component carries the `ts-dropdown` prefix: `.ts-dropdown`, `.ts-dropdown-trigger` (with `is-field` or `is-compact`, and `is-placeholder` while no option carries the value), `.ts-dropdown-value`, `.ts-dropdown-icon`, `.ts-dropdown-text`, `.ts-dropdown-chevron`, `.ts-dropdown-list`, `.ts-dropdown-group`, `.ts-dropdown-heading`, `.ts-dropdown-option` (with `is-active` and `has-description`) and `.ts-dropdown-description`. Never `ts-select*`: `.ts-select` is the editor's selection ring (`Overlay.css` 25 to 30, `pointer-events: none`, which a dropdown inside it would inherit) and `.ts-select-chip` its chip, and the e2e specs find the ring by `.ts-overlay .ts-select` (DD-C#1).
- The trigger carries the `value` attribute with the chosen value, so `element.value`, `getAttribute('value')` and Playwright's `toHaveAttribute('value', v)` read it. While open it carries `aria-expanded="true"` and `aria-activedescendant` naming the active option; `aria-activedescendant` is absent while closed.
- Ids come from React's `useId`, so the server and the client agree.
- The listbox is named by the field's label (`aria-label`), as the trigger is. An `aria-labelledby` naming the trigger gave the list the combobox's value ("Restricted") as its name, since a combobox referenced by `aria-labelledby` gives its value (DD-fix, the keyboard and assistive technology verifier's pass 1 on `931f69d8`, finding 3). `getByLabelText(label)` finds the trigger and the list; a test finds the trigger by `role="combobox"`.
- Every option carries `data-value`, `data-control="<control>.<value>"` when `control` is given, `aria-selected` (true on the chosen option alone), `aria-disabled="true"` when disabled, and `data-tip` with its label (the tooltip audit's contract; a row shows no tooltip plate, as a quiet menu row does, `Menu.tsx` 531 to 535).
- A section with a heading is a `role="group"` named by its heading (`aria-labelledby`); the rows of a section with no heading are the listbox's own, because a group with no name is announced as an empty group (DD-fix, finding 4: the first group of the Link dialog, of the link popover and of the person row). A divider (`.ts-menu-divider`) stands before every section but the first, drawn with `aria-hidden="true"` rather than `role="separator"`, because a listbox owns only options and groups (WAI-ARIA 1.2) (DD-C#1).
- An option with a description is named by its label (`aria-labelledby` on the label) and described by its description (`aria-describedby`), so the description is never part of its name. While no option carries the value, the placeholder's words are `aria-hidden`, so the field reads its name and no value (DD-fix, finding 4).

### 3.3 The keyboard

The APG select-only combobox. DOM focus stays on the trigger at every step; the active option is the one `aria-activedescendant` names, drawn lit.

| Key                            | Closed                                                                                | Open                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Down, Alt+Down, Enter, Space   | Opens; the active option is the chosen one, or the first enabled when none            | Down moves to the next enabled option and stops at the last; Enter and Space choose the active option and close                                                                                                                        |
| Up                             | Opens with the chosen option active                                                   | Moves to the previous enabled option and stops at the first                                                                                                                                                                            |
| Alt+Up                         | Nothing                                                                               | Chooses the active option and closes                                                                                                                                                                                                   |
| Home, End                      | Opens with the first or last enabled option active                                    | The first or last enabled option                                                                                                                                                                                                       |
| PageUp, PageDown               | Nothing                                                                               | Ten enabled options up or down, or the first or last                                                                                                                                                                                   |
| A printable character          | Opens and moves to the first enabled option whose label starts with the typed letters | The same; letters typed within one second join (the menus' buffer, `Menu.tsx` 452 to 466); the same letter again moves to the next option that starts with it                                                                          |
| Space within the typing buffer |                                                                                       | Joins the typed letters ("Anyone w" reaches "Anyone with the link") instead of choosing                                                                                                                                                |
| Escape                         | Passes to the site (a dialog closes, as with a closed select)                         | Closes with no change; the key goes no further, so the dialog stays                                                                                                                                                                    |
| Tab, Shift+Tab                 | Moves on                                                                              | Chooses the active option, closes, and lets the focus move on (a dialog's Tab trap still runs); a choice that moved the focus itself keeps it there: Share's Add expiration draws the expiry field, which takes it (DD-fix, finding 6) |

The keys the trigger handles call `preventDefault` and `stopPropagation`, and a key that opens the list opens it once (Enter and Space on the button do not also run its click).

### 3.4 The pointer

- A click on the trigger opens the list, or closes it with no change when open. Opening focuses the trigger with `preventScroll`, because Safari does not focus a clicked button and the keys must reach it.
- A row lights under the pointer and becomes the active option. A click on an enabled row chooses it and closes; a click on a disabled row does nothing. A row's `pointerdown` calls `preventDefault`, so the focus stays on the trigger and a popover that closes on blur (the link popover) stays open; its `click` calls `preventDefault`, so a `<label>` around the dropdown does not click the trigger again (18 of the 40 sites sit in a `<label>`: `DialogField` renders one, `Dialog.tsx` 409 to 416, and so do the panels' and the pages' fields).
- The list stops the propagation of mouse and pointer events (`mouseover`, `mousemove`, `pointerdown`, `click`) to its ancestors, so a tooltip anchor around the dropdown (`DialogField`'s label carries `tipProps`) never shows its plate over the open rows.
- A press outside the trigger and the list closes it with no change, and the press goes on to what it hit, as a menu's does (`Menu.tsx` 704 to 724; question 6).
- The window losing focus closes it with no change.

### 3.5 The change semantics

`onChange(value)` runs when, and only when, an option whose value differs from `value` is chosen by a click, Enter, Space, Alt+Up or Tab. The list closes and the trigger holds the focus first; then `onChange` runs synchronously inside the same click or keydown handler, so a handler that calls `fileInput.click()` (site 7) or `window.confirm` (site 20) keeps the person's activation and runs with the list gone. Opening, moving, typing, Escape and an outside press never call it. The component holds no value of its own: until the site re-renders with a new `value`, the trigger shows the old one, as a controlled select does.

The focus stays on a field through the write its choice starts (DD-fix, finding 1: the `disabled` attribute a site sets while its write runs dropped the focus to the page body, and from the body Tab selected the slide's objects behind the Share dialog, Delete removed the selected table and typing replaced the title's text). A trigger that becomes disabled while it holds the focus carries `aria-disabled="true"` without the `disabled` attribute, takes no key and no click, and takes the attribute once the focus leaves. Every dialog control a write disables follows the same rule through one helper, `packages/chrome/src/FocusHold.tsx` (`useFocusHold`, `HoldButton`, and `DialogCheck`, which takes it): a Share Permissions box, Send, Copy link, Rotate, Revoke, Approve and Decline, Publish in Publish to the web, a dialog's action buttons, and the run buttons of Profile, Tailor, Import slides, Background and the avatar builder keep the focus through their write and ignore a press until it settles (DD-fix#9, the keyboard verifier's final pass 3, F1: a Permissions box toggled with Space took the attribute, the focus went to Done, and the next Space closed the dialog). A Share link row is keyed by its place, so Rotate, which replaces the link with one of a new id, keeps its button; Publish and Stop publishing are one button. A choice that removes its own field gives the focus to the field the person came from first (Share's expiry returns it to the person's role field). A modal `Dialog` gives a focus that a leaving or disabled control dropped to the same control while it stands in the card and takes the focus, else to the nearest control after it in document order that does (for a row that left, the next row's first control or the next section's), else the nearest before it, else the card; never to Close, never to a button of the actions row (Done, Cancel) for a control of the body, never by the control's old index in the Tab order, and scrolled into view with `block: 'nearest'` (DD-fix#9). The card reads the control that holds the focus with its neighbours at each focus and each change while it is in the card, in every engine: Chromium sends a `focusout` as the control leaves, Firefox sends none, so the card also checks after each change of its own tree (DD-fix, final pass 1, finding 2). The check runs in a task of its own, after the focus move has ended, never between the old control's `focusout` and the new control's focus, where the page body is the active element: a control that changes the card as it loses the focus (the expiry field hides, a trigger that kept the focus through its write takes the `disabled` attribute, Image by URL shows its preview) then leaves the person's Tab, Shift+Tab or click where it was aimed. The control the card focuses as it opens has its place too (DD-fix, final pass 2, F1). While a modal dialog is open no key reaches the stage or the document's key table, from outside the card or from a control inside it, and no clipboard event from outside it reaches the stage (`modalDialogOpen` and `outsideOpenModal`, `packages/viewer/src/Selection.tsx`): Cmd+Z, Cmd+D, Cmd+A and Cmd+/ on a dialog's button change nothing behind it, and Shift+Tab from a button moves the focus back inside the dialog (DD-fix, final pass 1, finding 1).

### 3.6 Placement and layer

`usePlate(listRef, { layer: 'popover', anchor: trigger, open, side: 'below', align: 'start', gap: 2, fit: true, matchWidth: true, maxHeight: 288 })`, with two new options of `place()` and `usePlate()` (core):

- `matchWidth`: the `size` middleware writes `min-width` equal to the anchor's width.
- `maxHeight`: the largest max-height `fit` writes, here ten rows of 28 px and the plate's 8 px of padding.

The list stands below the trigger with its left edge on the trigger's left edge; when its height does not fit below and more room is above, it flips above; it keeps 8 px inside the viewport on every side (`shift`); its height is the room on its side, at most 288 px, never under 56 px; longer lists scroll in the shared scrollbar (DESIGN.md 6.1, no local rule). Its width is at least the trigger's and at most 320 px (the menu plate's maximum), and a label that does not fit ends in an ellipsis. It is `visibility: hidden` until `usePlate` returns its first placement, which resolves before the browser paints. As the active option moves it is scrolled into view (`block: 'nearest'`).

The list is in the top layer at `popover` (50) while open: over every dialog and its scrim, over the inspector and the panels, under toasts, the tooltip and the hover preview. `autoUpdate` keeps it on its trigger through a window resize or a layout change. A scroll the person makes of any element that contains the trigger closes it with no change, as the system popup does (question 7; the list's own scroll does not count). While the list is open the trigger takes the scrolling keys and a press outside closes it first, so the wheel is the person's one road to a scroll: after a wheel outside the list, a `scroll` that moves the trigger closes it. A scroll the page makes itself leaves it on its trigger through `autoUpdate`, and the trigger's new place is where the next scroll is measured from (the place is read at the scroll events, never at the wheel, which a browser hands the page after its compositor has already scrolled): the focus scroll of the press that opened it, a panel's first layout and its scroll anchoring, a smooth scroll still running (DD-fix, finding 5: a list opened within about 100 ms of Format options laying out, or during a smooth scroll from PageDown, closed by itself). Opening calls `hideTooltipUntilInput()`, as a menu does.

### 3.7 The look

The trigger (`Select.css`):

| Part          | `field`                                                               | `compact`                                  |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Height        | 32 px                                                                 | 22 px                                      |
| Text          | 13 px Inter, `--pt-ink`                                               | 12 px Inter, `--pt-ink`                    |
| Padding       | 0 28 px 0 10 px                                                       | 0 24 px 0 8 px                             |
| Minimum width | none (the site's layout)                                              | 96 px; maximum 220 px (`select.css` today) |
| Chevron       | the sprite's `chevron-down`, 14 px, `--pt-ink-2`, 8 px from the right | 14 px, 5 px from the right                 |

Both: `box-sizing: border-box`, `appearance: none`, a 1 px `--pt-field` border, `border-radius: var(--pt-radius)` (6 px), `--pt-paper` ground, `font-variant-numeric: var(--pt-numerals)`, the value in one line with an ellipsis. Focus visible and open: a 1 px `--pt-ink` outline at -1 px (the rule `tokens.css` 524 to 528 draws today). Hover: the border in `--pt-ink-2`. Disabled: text in `--pt-disabled`, border in `--pt-hair-soft`, `cursor: default`. In a dialog field the trigger fills the row (`Dialog.css`, `.ts-dialog .ts-dropdown-trigger { width: 100% }`).

The list is `.pt-float` (paper, the `--pt-edge` frame, the 6 px corner, `--pt-ring`, no blur or offset) with the menu plate's geometry, and its rows are the menu's rows. `Menu.css` gains the dropdown's classes beside the menu's, so a row's height, padding, colours, hover and disabled ink stay in one rule: `.ts-menu, .ts-dropdown-list` (width, padding 4 px 0, 13 px Inter, the fade), `.ts-menu-item, .ts-dropdown-option` (the 28 px grid of a 16 px slot, the label and the trailing column), `.ts-menu-item:hover, .ts-dropdown-option.is-active` (the `--pt-plate` ground and ink), `.ts-menu-item.is-disabled, .ts-dropdown-option[aria-disabled='true']`. The option's children reuse `.ts-menu-ic`, `.ts-menu-check` and `.ts-menu-label`; groups reuse `.ts-menu-divider`. The list never carries `.ts-menu` itself, because two readers treat `.ts-menu` in the document as an open menu (2.5). `Select.css` adds the rest: the tabular figures on rows, a description row (`min-height: 28px`, 4 px above and below, the description in 12 px `--pt-titanium`), and a heading row (24 px, 12 px `--pt-titanium`, sentence case, no capitals or tracking).

The chosen option draws the sprite's `check` in the 16 px slot; an option's icon draws in that slot on the other rows (the menus' rule, `Menu.tsx` 595 to 605; question 9). Every colour is a token of `tokens.css`, so the dropdown draws the same in each of the nine deck themes and follows the chrome's light and dark appearances. Reduced motion drops the fade, as the menu's. In forced colours (Windows High Contrast), which drop every background, the active option and a lit menu row take the system's `Highlight` ground with `HighlightText` for every part of the row, a disabled row reads `GrayText`, and the focus ring of a focused or open trigger is a 2 px `Highlight` outline 1 px outside its border, where the 1 px outline over the 1 px border read as no focus (DD-fix, finding 2).

### 3.8 Phone width

The same component and list at every width. At 390 px the list keeps 8 px from both edges, is at least as wide as its trigger, and its rows stay 28 px tall, over the 24 px target of WCAG 2.2 SC 2.5.8. No sheet or system picker (question 8).

### 3.9 Words

The trigger and the rows read the site's own words. A site that writes a literal option word moves it to sentence case in the same push: `none` reads "None" (sites 23, 25, 31, 34), `every role` reads "Every role" (site 5), the plate sides read "Lower left", "Lower right", "Upper left" (site 25), and the gallery's `{state} in the {at}` keeps its words (a local page). Words that are schema tags stay as `optionLabel` writes them (SPEC 12; question 5). Two sites gain words: the Link dialog and the link popover head their slides with a group named "Slides" after the positions (13, 40); the Share person row's three actions sit in a second group after a divider (20). The Download dialog's Fonts rows take the sentences its tooltip carries today as descriptions: Standard, "Uses the names Inter installs under"; Exact, "Keeps one face per text size" (12).

### 3.10 Server rendering and forms

`/decks`, `/print/<deck>` and the access page render on the server. The component renders without `window` or `document` (the hook runs in effects), with `useId` ids, the listbox `hidden`, and the hidden input when `name` is given. The access page's request form (site 9) posts `role` from the hidden input before hydration as it does from the select today.

### 3.11 The window API

`packages/agent/src/window/controls.ts` (core):

1. `interactiveControls` keeps a `[role="combobox"]` that sits inside a `role="group"` (the table's Border group), and `groupOptions` leaves out `[role="combobox"]`, so a dropdown is never read as a Seg's option.
2. `listControls` lists a combobox as `{ kind: 'select', label, control, value }`, the value from its `value` attribute.
3. `setNativeValue` on a combobox finds, in the listbox its `aria-controls` names, the option whose `data-value` equals the value, else the one whose normalized label equals it. None: `RangeError` naming the control's label and the value. A disabled one: `RangeError` saying the option is disabled. The option already chosen: nothing. Otherwise `option.click()`, which chooses through 3.5 in the same call.
4. `activateControl` on a combobox clicks it, which opens the list.

The registry test gains these cases (core): a combobox found by label and by id, listed with its value, set by value and by label with one change, a second set to the same value with none, an unknown value refused, and a combobox inside a group listed apart from the group.

### 3.12 The editor's key rules

`useEditorKeys.ts` `isChromeField` and `Selection.tsx` `isEditableTarget` return true for an element with `role="combobox"` (core); `InlineText.tsx` `isFieldElement` does the same (S1, in the push of site 40). The stage's own predicate needs nothing: `Editor.tsx`'s `CHROME_CONTROL` lists `button`.

### 3.13 The viewer's slot

`packages/viewer/src/select-slot.ts` (core, exported as `@turboslide/viewer/select-slot`) declares `SelectSlotProps` (the props of 3.1 the popover needs: `value`, `options`, `onChange`, `label`, `control`, `size`, `placeholder`, `className`) and `SelectSlot = createContext<ComponentType<SelectSlotProps> | null>(null)`. `Select.tsx` imports the type, and `select.test.tsx` asserts `const slot: ComponentType<SelectSlotProps> = Select`, so the two cannot drift. `apps/studio/src/editor/EditorRoot.tsx` wraps the stage editor in `<SelectSlot.Provider value={Select}>` (core). `InlineText.tsx` draws its slide field through the slot; with no provider (the viewer's unit tests) the field is absent and the URL field works alone.

### 3.14 Costs

`Select.tsx` and `Select.css` are about 3 KB gzip in the editor's chunk, which already holds `place()`, `Layer.ts` and the menu rows. `/decks` already imports `Menu` and `place()`. `/print/<deck>` and the access page gain `place()` and `@floating-ui/dom` (7,057 B gzip, DESIGN.md C3) with the component; `scripts/check-client-bundle.mjs` reads their ceilings at the gate. Removing the tokens.css select rule and `inspector/select.css` saves about 1 KB of CSS.

## 4. The four hidden mirrors

Each mirror leaves, with `HIDDEN_NATIVE_CLASS` (`inspector/props.ts` 28) and the mirror rules of `seg.css` 23 to 40. Every value a mirror accepted stays settable through `set()` by the field's label and its id in one call, pinned by a unit test in the S2 push that removes it.

1. **The Seg fields** (`seg.tsx`). The Seg itself becomes the field's group: `label={spec.label}` (today `${spec.label} options`) and `control={spec.control}` (today `${spec.control}.option`), so its options are `<id>.<value>` and the window API's group path resolves `set('<label>' | '<id>', value)` by clicking the option, as `registry.test.ts` 90 to 130 pins with `list: Size`. An optional field of four or fewer values can be cleared only through the mirror today; `generate.ts` draws such a field as the dropdown with its None row, as it draws an optional field of five or more (question 4).
2. **The dither plate** (`dither.tsx`). The Seg beside the mirror already offers none: it takes `label={`${asset.id}: Plate`}` and `control={`asset.${asset.id}.plate`}`; `set(..., 'none')` clears it.
3. **The palette** (`palette.tsx`). The swatch group takes `aria-label={spec.label}` and `data-control={spec.control}`; its swatches are already `<id>.<token>` and `<id>.none`. A six digit hex goes through the hex field `<id>.hex`, which also commits on change when its draft is a complete six digit value (today on Enter and on blur).
4. **The icon field** (`icon.tsx`, `IconPicker.tsx`). The field's root takes `role="group"`, `aria-label={spec.label}` and `data-control={spec.control}`; the picker's tiles carry `data-control="<id>.<name>"` (today only in the embedded form) and a None tile `<id>.none`, and the card's grid stays mounted and hidden while the card is closed, so `set()` reaches a tile in one call. The tone stays in the open card.

## 5. The test helpers

### 5.1 The e2e helper

`apps/studio/e2e/choose-option.ts` (core), one function:

```ts
import type { Page } from '@playwright/test';

/**
 * Chooses an option of the dropdown whose trigger carries `data-control="<control>"`, the way a
 * person does: a click on the trigger, a click on the row whose `data-value` is `choice` (or whose
 * label is `choice.label`), then a wait until the list is closed. Throws naming the control and
 * the options when the row is absent or disabled. Waits through locators alone, so the probe
 * toolkit and the scripts import it outside the test runner.
 */
export async function chooseOption(
  page: Page,
  control: string,
  choice: string | { label: string },
): Promise<void>;
```

It reads the trigger as the first visible `[data-control="<control>"][role="combobox"]`, opens the list when `aria-expanded` is false, waits for the listbox `aria-controls` names, clicks the option, and waits for `aria-expanded="false"`. It asserts nothing about the new value, because the Share person row's actions (site 20) leave the value as it was.

### 5.2 Reading a dropdown in a driver

| Today                                                    | After                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `locator.selectOption(v)`, `page.selectOption(sel, v)`   | `chooseOption(page, control, v)`                                       |
| `expect(locator).toHaveValue(v)`, `locator.inputValue()` | `expect(locator).toHaveAttribute('value', v)`, `getAttribute('value')` |
| `el.value` in `evaluate`                                 | unchanged (the trigger's `value` attribute)                            |
| `el.options[el.selectedIndex].text`                      | the trigger's `.ts-dropdown-value` text                                |
| a CSS selector naming `select`                           | `[role="combobox"]`                                                    |
| `fireEvent.change(el, { target: { value } })`            | `chooseOption(control, value)` of 5.4                                  |

### 5.3 The probe toolkit

`scripts/probes/core-walk/toolkit.mjs` (core) gains `t.chooseOption(control, choice)`: it imports `chooseOption` from `apps/studio/e2e/choose-option.ts` (Node strips the types, as `scripts/layout-shift-audit.mjs` 43 already imports a `.ts` file), runs it on the toolkit's page and then `t.settled()`. `scripts/layout-shift-audit.mjs` imports the helper directly.

### 5.4 The unit helper

`packages/chrome/src/__tests__/choose-option.ts` (core):

```ts
/** Opens the dropdown `control` with a click and clicks the option `choice`, through the DOM a person uses. */
export function chooseOption(
  control: string,
  choice: string | { label: string },
  root: ParentNode = document,
): void;
```

It finds the trigger by `[data-control="<control>"][role="combobox"]` under `root`, `fireEvent.click`s it, finds the option in the listbox `aria-controls` names, `fireEvent.click`s it, and throws naming the control and the options when either is absent.

## 6. The lint

`packages/lint/src/brand/native-select.ts` with `native-select.test.ts` (core), on the pattern of `competitor.ts`:

- `NATIVE_SELECT_ROOTS = ['apps', 'packages', 'scripts']`, listed with `listFiles` of `run.ts`, leaving out `node_modules`, `dist`, `.output` and generated files. `docs/` is not read.
- Rule `dropdowns/no-native-select`: a JSX element named `select` (opening or self closing) in a `.tsx` file, tests and specs included, found with the TypeScript parser. Message: "A native select opens the system's popup; use Select from packages/chrome/src/Select.tsx (docs/DROPDOWNS.md 3)."
- Rule `dropdowns/no-select-option`: a call whose callee is a property named `selectOption` or `selectOptions` in a `.ts`, `.tsx`, `.mts`, `.mjs` or `.js` file. Message: "selectOption drives a native select; use chooseOption from apps/studio/e2e/choose-option.ts (docs/DROPDOWNS.md 5)."
- Exports `nativeSelects(file, text)`, `selectOptionCalls(file, text)` and `scanNativeSelects(root)`. Strings and comments never match, so the lint's own messages and fixtures pass.
- The test: unit cases for both rules (a JSX `select`, a self closing one, `<Select>` passing, a string `"<select"` passing, `locator.selectOption(...)`, `page.selectOption(...)`, `user.selectOptions(...)`, a comment passing) and the tree scan, `expect(scanNativeSelects(ROOT)).toEqual([])`, which `pnpm test` runs.
- It lands in the core's last push, after S1 and S2 have removed every finding (section 8.1).

## 7. The rows

### 7.1 Day 0 and the shape

New rows follow `docs/gslides-parity/focus/core-matrix.json`'s shape (`id`, `feature`, `interaction`, `driver`, `today`, `severity` on broken rows, `evidence`, `note`). `today` is what the tree at `0d3920a3` and Kevin's screenshot of production show. Every new row's note starts "Dropdowns (docs/DROPDOWNS.md 7), DD-C#<n>". The area `chrome` belongs to the unparkable feature `chrome`, so a red row blocks the ship. No row is restated or retired.

Day 0 is in DD-C#1 and changes `scripts/probes/core-matrix.test.mjs` only:

1. `const DROPDOWNS_NOTE = /^Dropdowns \(docs\/DROPDOWNS\.md 7\), DD-C#\d+[a-z]?\b/;`, `const DROPDOWNS_RETIRED = [];` and `const isDropdownsRow = (row) => (row.note ?? '').startsWith('Dropdowns');`.
2. The count gains `+ CORE_MATRIX.filter(isDropdownsRow).length - DROPDOWNS_RETIRED.filter((id) => !isCoreId(id)).length`.
3. Polish two's block reads `CORE_MATRIX.slice(first).every((row) => isPolish2Row(row) || isDropdownsRow(row))`, so the dropdown rows may follow polish two's.
4. A block "dropdowns": every dropdown row matches `DROPDOWNS_NOTE`, has a known driver and the id scheme, sits after every row that is not the round's, and carries no `measure`.

### 7.2 The rows

All eight rows: feature `chrome`, driver `core/chrome.spec.ts`, bodies in `apps/studio/e2e/core/dropdowns.ts` (`chromeDropdowns()`, imported by `core/chrome.spec.ts` and spread into its coverage list, as `font-p2.ts` is), each on the lane's local server with a fresh scratch deck of twelve slides that holds a line, a framed picture, a table, a chart, a shader, a dithered picture, an icon block, a list block and a text box with a link, torn down through the product.

| Id                          | Today  | Sev | Interaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Evidence                                               |
| --------------------------- | ------ | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `chrome.select.every-site`  | broken |   1 | At 1440 in the light appearance, each surface of DROPDOWNS.md 2.1 opened in turn: /decks (the admin filter where the server grants it), /print/<deck>, the access page with its request form, /dev/auth, the Share dialog in both access modes with one invited person and one expiry open, Download with More options open, Insert link, More fonts, Publish to the web, Request access, Special characters, the Comments panel, the Theme panel, Format options for each object of the deck, the asset intake, the asset picker, a text run's link popover. On every surface the document holds no `select` element; every field of 2.1 is a `button.ts-dropdown-trigger` with `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded="false"`, an accessible name, its `data-control`, a `value` attribute and `aria-controls` naming a `role="listbox"` whose options carry `data-value` with `aria-selected="true"` on the chosen one alone; a click opens each list in the popover layer and Escape closes it with the trigger's value unchanged | Kevin's screenshot of 2026-10-08; DROPDOWNS.md 2.1     |
| `chrome.select.keyboard`    | broken |   1 | The Link dialog (Insert > Link) on the twelve slide deck: Tab from the link field reaches the trigger; Down opens with None active and `aria-activedescendant` naming it; Down, Up, End ("12. ..."), Home, PageDown (ten rows on), PageUp move the active option; "l" reaches Last slide, "n" reaches Next slide and "n" again None, "pr" within a second reaches Previous slide; Escape closes with no change; Enter opens, Enter chooses "3. ..." and the link field empties; Space opens and Space chooses; Alt+Down opens and Alt+Up chooses; Tab with the list open chooses the active option and moves the focus to the next control; `document.activeElement` is the trigger at every step but the last. On /print/<deck> the disabled handout rows are skipped by Down and by type ahead. In the Share dialog, Escape on the open General access list sends no `share.setGeneralAccess` request within 2 s and leaves the dialog open; a second Escape closes the dialog                                                                             | DROPDOWNS.md 3.3                                       |
| `chrome.select.pointer`     | broken |   1 | The Share dialog: a click on General access opens the list under the trigger, its left edge within 1 px of the trigger's and its width at least the trigger's; the chosen row draws the check and `aria-selected`; a hovered row draws `--pt-plate`; a click on Anyone with the link closes the list, sends one `share.setGeneralAccess` and draws the link role field; a click on the open trigger closes the list with no request; a press on the dialog's sentence closes the list with no request and leaves the dialog open. The Download dialog's Appearance field, inside its `label`: a click on Dark closes the list, which stays closed 500 ms later, and the trigger reads Dark                                                                                                                                                                                                                                                                                                                                                                   | DROPDOWNS.md 3.4, 3.5                                  |
| `chrome.select.over-dialog` | broken |   1 | In both appearances at 1440: the open General access list matches `:popover-open` with `data-layer="popover"`; `elementsFromPoint` at each row's centre returns the row or its child first, above the dialog card and the scrim; a person row's role list opened from the card's last row reaches past the card's bottom edge with every row clickable; the Download dialog's Fonts list inside More options draws whole; choosing keeps the dialog open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Kevin's screenshot of 2026-10-08; DESIGN.md 2.2        |
| `chrome.select.placement`   | broken |   1 | A window of 1440 by 600: Format options' Line end field with its trigger within 120 px of the bottom opens its list above it; every list opened by this row keeps 8 px inside the viewport; the Link dialog's list of seventeen options is at most 288 px tall, scrolls in the shared bar (an 8 px gutter, DESIGN.md 6.2), and keeps the active row in view as PageDown moves it; every list is at least as wide as its trigger and at most 320 px; with a Format options list open, scrolling the panel by 120 px closes the list with no change; a resize from 1440 to 900 wide keeps an open Share list inside the viewport and under its trigger                                                                                                                                                                                                                                                                                                                                                                                                         | DROPDOWNS.md 3.6                                       |
| `chrome.select.phone`       | broken |   1 | At 390 by 844 with touch, in both appearances: the Share dialog's General access field, a person row's role field and the table's Border weight field open the same list, inside the viewport with 8 px on each side, at least as wide as the trigger, rows at least 28 px tall; a tap on a row chooses it with one write; the page holds no `select` element and no horizontal scroll while a list is open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DROPDOWNS.md 3.8                                       |
| `chrome.select.look`        | broken |   1 | At 1440 and 390 in both appearances, and in the light appearance with the deck in each of the nine themes: the field trigger is 32 px and the compact one 22 px, radius 6 px, a 1 px `--pt-field` border, `--pt-paper` ground, `--pt-ink` text in Inter, the sprite's chevron; the list computes radius 6 px, a 1 px `--pt-edge` border, `--pt-ring` and no shadow with a blur or an offset; rows are square and 28 px; trigger and rows compute tabular figures, and in the Publish size list the figures "480" of Small and "960" of Medium measure the same width; the colours computed in each theme equal the light appearance's; row text on paper and the lit row's ink on `--pt-plate` hold 4.5:1                                                                                                                                                                                                                                                                                                                                                    | DESIGN.md 3.1, 3.2, 4.5, 5.3                           |
| `chrome.select.agent-set`   | works  |     | With the Share dialog open, `window.turboslide.studio.set('dialog.share.mode', 'link')` chooses through the dropdown with one `share.setGeneralAccess` and the list closed, and `set('General access', 'Restricted')` returns it; `controls()` lists `{ kind: 'select', label: 'General access', control: 'dialog.share.mode', value }`; `set('dialog.share.mode', 'public')` throws `RangeError` naming the field and the value. In Format options, `set('list: Size', 22)`, a palette field set to `ink-2`, the icon block's field set to an icon name and `set('asset.<id>.plate', 'lower-left')` each write once, as the native mirrors did                                                                                                                                                                                                                                                                                                                                                                                                              | `controls.ts` 150 to 245; `registry.test.ts` 90 to 130 |

### 7.3 The rows that already exist

The lanes change the drivers of existing rows (section 8) and read each again on their local server; none changes its interaction. S1: `share.dialog.new-deck-restricted-viewer`, `share.role-change.keeps-link`, `share.dialog.restricted-and-more`, `inbox.notification-arrives`, `brand.logo.replace-every-slide`, `brand.panel.words-match-sheet`, `themes.picker.lists-library`, `export.print.download-pdf-follows-preview`, `export.download.large-deck-pptx`, `text.link.slide-target`, `chrome.layers.menu-over-dialog`, `chrome.radius.controls`, `decks.pages.radius`, the walk areas `brand`, `chrome`, `export`, `share`, `text` and `polish-text`, and the local accounts rows that call `setLinkAccess` and `inviteByEmail`. S2: the walk areas `charts`, `tables`, `formatting`, `lines`, `images` and `shaders`, and the rows of `core/chrome.spec.ts` that read Format options. The e2e specs outside the matrix that a lane changes (`home.spec.ts`, `share.spec.ts`, `roles.spec.ts`, `charts.spec.ts`, `window-api.spec.ts`) pass on the lane's server.

## 8. The lanes

### 8.0 Rules for every lane

- **Worktree and order.** `/Users/kevinliu/repos/Turboslide-dropdown` on `dropdowns/round`. DD-C#1 lands first and alone; S1 and S2 start after it and run side by side; DD-C#2 lands after the last push of S1 and of S2. Never touch `/Users/kevinliu/repos/Turboslide-favicon`, `Turboslide-harden` or `Turboslide-vector`.
- **Commits.** Under the git lock: `until mkdir /Users/kevinliu/repos/Turboslide-dropdown/.turboslide/git.lock 2>/dev/null; do sleep 3; done`, then `git -c user.email=kevin@generaltranslation.com -c user.name="Kevin Liu" add <the push's paths, listed>` and a commit whose message is written to a file first: the subject starting with the key (`DD-S1#2:`), a body naming the items, the files and the checks with their readings and loads, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `rmdir` the lock, also on failure. One commit per push. Never `git add -A`, rebase, reset, amend another's commit or switch branches. Each file belongs to one lane; a lane that needs a change in another's file asks for it in its notes.
- **Servers.** From `apps/studio`: `TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=.turboslide/<key>-overlay TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_DB=.turboslide/auth-<key>.sqlite TURBOSLIDE_MAIL=capture TURBOSLIDE_AUTH_RATE_LIMIT=off TURBOSLIDE_SESSION_SECRET=<32 or more characters> TURBOSLIDE_DOWNLOAD_SECRET=<32 or more characters> node_modules/.bin/vite dev --port <port> --strictPort`, with `-c vite.no-watch.config.ts` for any row run or picture, on the lane's port only, stopped before the lane returns. Ports: core 4781, S1 4782, S2 4783. Playwright uses `http://localhost:<port>` and takes `.turboslide/e2e.lock`. No lane edits a source file while its own run is on its server.
- **Builds.** `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` writes the checkout's one `apps/studio/.output`; a build takes `.turboslide/build.lock` from its start to the end of the readings that need it and is served on 4790.
- **Load.** The machine's one minute load is 100 to 400 from other sessions' jobs; no lane stops them. Every timing is recorded with the load beside it, and a timing at a load over 24 is not a verdict. Counts, boxes, colours and attributes do not move with load.
- **Production.** Read only. A lane that needs a deck there makes its own scratch deck and removes it by its id before it returns (`deck.info`, `deck.trash {id, baseRevision}`, `deck.remove {id, confirm: true, baseRevision}` through `scratchpad/realtime/remove-deck.mjs`), never a sweep. No token, cookie or secret is printed. Never push, deploy, or change a Vercel, Cloudflare, GitHub or Google setting.
- **Pictures.** PNG or JPEG under 200,000 B each, under `docs/gslides-parity/dropdowns/<key>/` (`core`, `s1`, `s2`), at 1440 and 390 in both appearances for every surface a push changes, each with one list open; the lane opens and looks at every picture it cites.
- **Notes.** Each lane writes `docs/gslides-parity/dropdowns/build/<key>.md`: each push's commit, readings, loads, pictures and requests.
- **Words.** Plain technical English in every word a person reads; section 3.9 lists every word this round changes.
- **Binaries.** `node_modules/.bin/<tool>`. No lane adds a dependency.

### 8.1 Core (DD-C, port 4781)

Files: `packages/chrome/src/Select.tsx`, `Select.css` (new); `packages/chrome/src/Menu.css` (the shared row selectors of 3.7); `packages/chrome/src/place.ts`, `usePlate.ts` (`matchWidth`, `maxHeight`); `packages/chrome/package.json` (the `./Select` export); `packages/chrome/src/tokens.css` (490 to 534 out in DD-C#2); `packages/chrome/src/Dialog.css` (the trigger's width in DD-C#1, the `select` rules 175 to 177 and 198 out in DD-C#2); `packages/chrome/src/useEditorKeys.ts`; `packages/viewer/src/Selection.tsx`; `packages/viewer/src/select-slot.ts` (new) and `packages/viewer/package.json` (its export); `apps/studio/src/editor/EditorRoot.tsx` (the provider); `packages/agent/src/window/controls.ts`; the tests `packages/chrome/src/__tests__/select.test.tsx` (new), `place.test.ts`, `use-editor-keys.test.tsx`, `packages/viewer/src/__tests__/editor-keys.test.ts`, `packages/agent/src/window/registry.test.ts`; the helpers `packages/chrome/src/__tests__/choose-option.ts`, `apps/studio/e2e/choose-option.ts` (new) and `scripts/probes/core-walk/toolkit.mjs`; the lint `packages/lint/src/brand/native-select.ts`, `native-select.test.ts` (new); the rows `apps/studio/e2e/core/dropdowns.ts` (new), `apps/studio/e2e/core/chrome.spec.ts` (the import and the spread), `scripts/probes/core-matrix.test.mjs` (day 0), `docs/gslides-parity/focus/core-matrix.json`, `README.md` (the "What works today" block through `node docs/readme/what-works.mjs`).

| Push   | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rows                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| DD-C#1 | Day 0 of 7.1; `Select` with its CSS and the shared rows of `Menu.css`; the two placement options; the export; the dialog width rule; the window API of 3.11; the two key predicates of 3.12; the viewer's slot and the provider; the unit, e2e and probe helpers; the unit tests: every key of 3.3, type ahead with the one second buffer and the repeated letter, disabled rows skipped, the change semantics of 3.5 (once, only on a new value, after the close, inside the event), the outside press, the click inside a `label`, no tooltip plate from an ancestor while a row is hovered, the hidden input, a `renderToString` with no `select` and stable ids, the ARIA of 3.2, the options passed to `place()`, the slot type | none (unit tests)     |
| DD-C#2 | After S1's and S2's last push: the eight rows of 7.2 with `dropdowns.ts`; the lint of section 6; the select rules out of `tokens.css` and `Dialog.css`; the gates of section 9 on the whole tree with every row of 7.2 and 7.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | the eight rows of 7.2 |

Pictures (`core/`): the trigger at both sizes, closed, focused, open and disabled; a list with a group heading, a divider, a description row, a disabled row and the check; each at 1440 and 390 in both appearances, from a test page the unit tests do not need (the Link dialog serves).

### 8.2 S1, the dialogs, the panels and the pages (port 4782)

Sites 1 to 4, 6 to 22 and 40 of 2.1. Files: `apps/studio/src/routes/decks.index.tsx`, `decks.css` (407 to 410), `dev.auth.tsx`, `print.$deckId.tsx`, `print.css` (74 to 97); `packages/chrome/src/ThemesPanel.tsx`, `ThemesPanel.css` (210 to 232); `YouNeedAccess.tsx`, `YouNeedAccess.css` (81 to 102); `comments/CommentsPanel.tsx`, `comments/comments.css` (463 to 470); `dialogs/Download.tsx`, `Link.tsx`, `MoreFonts.tsx`, `Publish.tsx`, `RequestAccess.tsx`, `Share.tsx`, `share.css` (142 to 146), `SpecialCharacters.tsx`; `packages/viewer/src/InlineText.tsx` (site 40 through the slot, the predicate of 3.12), `InlineText.css` (92 to 110); the tests and drivers of 2.6 marked S1.

| Push    | Content                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DD-S1#1 | The Share dialog, sites 17 to 21: the person row's three actions in a second group; the expiry field with the placeholder "Add expiration", `autoFocus` and `onBlur` as today; `share.css`; `share-dialog.test.tsx`, `core/share.spec.ts`, `share.spec.ts`, `roles.spec.ts`, `accounts.spec.ts`, `core/chrome-surfaces.ts` (`chrome.layers.menu-over-dialog` reads the row first at its centre), `chrome.mjs` |
| DD-S1#2 | The other dialogs and panels, sites 6 to 8, 10 to 16 and 22: Download's Fonts descriptions; the Link dialog's Slides group; the footer logo's Picture still opening the file chooser from the change; their CSS; `core/brand.spec.ts`, `core/brand-themes.ts`, `brand.mjs`, `core/export.spec.ts` (1464 to 1469 reads `dialog.download.embedFonts`)                                                           |
| DD-S1#3 | The pages and the link popover, sites 1 to 4, 9 and 40: the access form's `name="role"`; the popover's placeholder and Slides group; the predicate of 3.12; `home.spec.ts`, `core/design-pages.ts`, `core/export.spec.ts` (531), `export.mjs`, `layout-shift-audit.mjs`, `core/present.spec.ts`, `polish-text.mjs`, `text.mjs`, `share.mjs`, `core/chrome-pages.ts`, `gslides-parity-audit.mjs`               |

Pictures (`s1/`): Kevin's frame (the Share dialog in the dark appearance with General access open) before and after; each dialog, panel and page of the push with its list open at 1440 and 390 in both appearances.

### 8.3 S2, the inspector and Format options (port 4783)

Sites 5 and 23 to 39 of 2.1 and the mirrors of section 4. Files: `packages/chrome/src/AssetPicker.tsx`, `AssetPicker.css`; `packages/chrome/src/inspector/select.tsx` (`select.css` removed), `fields.tsx`, `fields.css` (227 to 233), `json.tsx`, `json.css`, `asset.tsx`, `asset.css`, `shader.tsx`, `shader.css` (245 to 275), `table.tsx`, `table.css`, `chart.tsx`, `chart.css`, `seg.tsx`, `seg.css` (23 to 40), `dither.tsx`, `palette.tsx`, `icon.tsx`, `props.ts`, `generate.ts`; `packages/chrome/src/IconPicker.tsx`; the tests and drivers of 2.6 marked S2.

| Push    | Content                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DD-S2#1 | The generic fields, sites 5, 23 to 25, 29, 31, 34 and 35: `SelectControl` and `SelectField` keep their props, so Format options' 11 call sites need no change; the words of 3.9; `inspector-component.test.tsx`, `format-options-round-two.test.tsx`             |
| DD-S2#2 | The table and the chart, sites 26, 27 and 36 to 39; `table-section.test.tsx`, `chart-grid.test.tsx`, `charts.spec.ts`, `charts.mjs`, `tables.mjs`                                                                                                                |
| DD-S2#3 | The mirrors of section 4, sites 28, 30, 32 and 33, with `generate.ts`'s optional rule, `props.ts` and `IconPicker.tsx`; a unit test per mirror for `set()` by label and by id; `inspector-sections.test.tsx`, `inspector-generate.test.ts`, `window-api.spec.ts` |

Pictures (`s2/`): Format options for a line, a table, a chart and a shader with a list open, the inspector of a list block, the asset intake and the asset picker, each at 1440 and 390 in both appearances.

### 8.4 Shared files and their order

| File                                                       | Owner and order                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `scripts/probes/core-matrix.test.mjs`                      | Core on day 0 (DD-C#1); nobody after                            |
| `docs/gslides-parity/focus/core-matrix.json`, `README.md`  | Core in DD-C#2, inside its lock                                 |
| `packages/chrome/src/tokens.css`, `Dialog.css`, `Menu.css` | Core                                                            |
| `apps/studio/e2e/core/chrome.spec.ts`                      | Core                                                            |
| `apps/studio/e2e/core/export.spec.ts`                      | S1 (two pushes)                                                 |
| `packages/viewer/src/InlineText.tsx`                       | S1; the core's slot lands first                                 |
| `scripts/probes/core-walk/toolkit.mjs`                     | Core; the lanes call `t.chooseOption`                           |
| `packages/chrome/src/Seg.tsx`                              | Nobody: its `label` and `control` props already serve section 4 |

### 8.5 Size

| Lane | Pushes | Sites | Files changed, estimate |
| ---- | -----: | ----: | ----------------------: |
| Core |      2 |     0 |                      29 |
| S1   |      3 |    22 |                      39 |
| S2   |      3 |    18 |                      32 |

## 9. The gates

Every push, before its commit:

1. `node_modules/.bin/tsc -b`.
2. The unit tests of every package the push touches (`node_modules/.bin/vitest run --dir <package>`); `pnpm test` on DD-C#1, DD-C#2 and the last push of each lane.
3. The brand lint in enforce mode, `node packages/lint/src/brand/main.ts --enforce --json .turboslide/brand-lint-<key>.json`, exit 0; the competitor guard, `node_modules/.bin/vitest run packages/lint/src/brand/competitor.test.ts`; from DD-C#2, `node_modules/.bin/vitest run packages/lint/src/brand/native-select.test.ts`, and before it, on each lane push, the same scan run by hand on the push's own files with no finding.
4. `node_modules/.bin/vitest run scripts/probes/core-matrix.test.mjs docs/readme/what-works.test.mjs docs/readme/docs-index.test.mjs`, and `node docs/readme/what-works.mjs --check`.
5. `node_modules/.bin/prettier --check` on the push's files.
6. The node-server build under `.turboslide/build.lock`, served on 4790, then `node scripts/check-client-bundle.mjs --base http://localhost:4790 --client apps/studio/.output/public` with every route ceiling held (`/decks`, `/edit/gt-brand`, `/print` and the access page gain bytes, 3.14).
7. The push's rows and the existing rows of 7.3 its drivers touch, on the lane's local server: `node scripts/probes/core-gate.mjs --base http://localhost:<port> --only specs --rows <ids>` for spec rows, `--only accounts --rows <ids>` for local rows, `--only probe --areas <areas>` for walk areas; every row passed with zero retries. A red row of an earlier round the push did not touch is recorded and does not hold the push.
8. The tooltip audit on the surfaces the push changed, `node scripts/tooltip-audit.mjs --base http://localhost:<port> --edit`, with no new finding.
9. Pictures of 8.1 to 8.3, each opened and looked at.

The round's acceptance, after DD-C#2: `git grep -n "<select" -- 'apps/**/*.tsx' 'packages/**/*.tsx'` prints nothing; the lint's tree scan is empty; every row of 7.2 and 7.3 passed on the node-server build; `pnpm check` on the tree; and a verifier's hand pass that opens every dropdown of 2.1 once by the pointer and once by the keyboard in both appearances, at 1440 and 390, and changes a value in each where the change is harmless on a scratch deck (Kevin: "make sure to actually test our features and make sure they work").

## 10. The questions only Kevin can answer

The build proceeds on the defaults; an answer that differs is a change the lane makes in a later push.

| #   | Question                                                                                                                                                                             | Default                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | The Theme panel's brand colour wells open the system colour picker. Move them to the product's colour plate with its hex field in this round?                                        | No; a later round, since the plate needs a free colour field it does not have                                                 |
| 2   | Share's Remove access and the profile's Delete account ask through the browser's confirmation box. Move them to the product's dialog in this round?                                  | No; a later round                                                                                                             |
| 3   | The lists Turboslide already draws (the font picker, the weight and dash lists, the show's and the presenter view's slide lists) stay as they are, or move onto the shared dropdown? | They stay: they draw samples, a search field or slide titles; each already sits on the popover layer with the product's plate |
| 4   | An optional inspector field of four or fewer values: the shared dropdown with its None row, or a Seg with a None segment?                                                            | The dropdown with None, the rule of an optional field of five or more                                                         |
| 5   | Literal option words move to sentence case ("None", "Every role", "Lower left"); the schema's tags stay as written (SPEC 12)?                                                        | Yes to both                                                                                                                   |
| 6   | A press outside an open list closes it and goes on to what it hit (the menus' rule), or closes it and stops there (the macOS popup's rule)?                                          | Goes on, as the menus do                                                                                                      |
| 7   | The list closes when the panel or page under it scrolls, or follows its trigger?                                                                                                     | Closes, as the system popup does; a resize still keeps it on its trigger                                                      |
| 8   | On a phone, the same list under the trigger, or a sheet from the bottom of the screen?                                                                                               | The same list                                                                                                                 |
| 9   | The chosen row's check at the left in the menus' icon slot, or at the right end of the row?                                                                                          | At the left, as a checked menu row draws it                                                                                   |

## Sources

- Kevin's message and screenshot of 2026-10-08 ("use custom dropdowns!!!"; production's Share dialog in the dark appearance with the General access list open).
- The tree at `0d3920a3`: the files and lines in the header paragraph and in sections 2.1, 2.5 and 2.6.
- `docs/DESIGN.md` 1 to 4, 6 and 9 to 13 (binding for layers, corners, plates, type, numbers, scrollbars and themes); `docs/POLISH-2.md` 6 to 9 (the shape of the rows, the lanes and the gates).
- The WAI-ARIA Authoring Practices Guide, the select-only combobox pattern, and WCAG 2.2 SC 2.5.8, as known to the author; nothing was fetched.
