# B3a Chrome shell, day one: the menu model, Menu.tsx and Snackbar.tsx

Builder B3a of the Google Slides parity round (`docs/gslides-parity/MILESTONES.md`, "B3 Chrome
shell"). Day one delivers the data every other menu surface is generated from, the one menu
primitive and the snackbar, plus the three model tests of SPEC 14.2. The rest of B3 (the title
row, the menu bar, the toolbar, the panels, the dialogs, the shell keys) runs after merge 1.
Written 2026-09-12 against `main` at `14da621` with B1's uncommitted schema changes in the shared
checkout.

## 1. What landed

| File                                                             | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/chrome/src/menus/model.ts`                             | Every row of SPEC 2.0 to 2.10 as data (`TITLE_ROW_ITEMS`, `MENUS`), the Slideshow arrow of 9.1 as the children of `title.slideshow`, the toolbar order of 3.1 (`TOOLBAR_HEAD`, `TOOLBAR_TAIL_DEFAULT`), the right-click menus of 4.2 and 4.3 (`CONTEXT_MENUS`), the omitted Accessibility menu, `MenuContext` with `DEFAULT_MENU_CONTEXT` (the fresh presentation of 11.1), the named predicates and `evaluate`, `isEnabled`, `isChecked`, `resolveLabel`, `tooltipDoc`, `walkItems`, `allItems`, `findItem`, `itemById`, `itemPath`, `visibleItems`, `contextMenuItems`, `actionIdsOf`, `GS1_ACTION_IDS` (the fourteen of 7.5)                                                                                      |
| `packages/chrome/src/menus/strings.ts`                           | SPEC 12: `STUB_PREFIX`, `stubClause`, `stubTooltip`, the title row words, prompts, snackbars, dialogs, panels, filmstrip, home, the PowerPoint import sentence, present mode, errors, `FORBIDDEN_DEFAULT_VIEW_WORDS` and `forbiddenWordsIn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/chrome/src/menus/keys.ts`                              | The chord grammar (`parseChord`, `chordsOf`, `chordText`, `normalizeBinding`, `winChordOf`, `formatChord` in symbols or words, `shortcutLabel`, `tooltipKey`, `ariaKeyShortcuts`, `matchesChord`, `matchesShortcut`, `bindingsFor`, `detectPlatform`, `normalizeGoogleChord` for Google's spelling), the key table (`buildKeyTable`: every menu item, toolbar control and menu access key with a key plus `EXTRA_BINDINGS`), `buildEditorKeymap`, `SHARED_CHORDS`, `OMITTED_SHORTCUTS`, `GESTURES`, `ITEM_GOOGLE_ROWS`, `isBareKey`, `assignAccessKeys`                                                                                                                                                              |
| `packages/chrome/src/menus/__fixtures__/google-menus.json`       | R01's items per menu with their paths, plus the title row and Slideshow arrow controls (source noted per entry where it is SPEC 2.0 rather than R01); unverified items flagged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/chrome/src/menus/__fixtures__/google-shortcuts.json`   | R04 Part B tables B1 to B9 and A10 in Google's spelling, one row per action with a stable id                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/chrome/src/Menu.tsx`, `Menu.css`                       | The one menu primitive (SPEC 13.1, 2.11): roving focus, arrows skipping disabled rows with wrapping, Home and End, type ahead, the underlined access key runs its row, submenus on Right, Enter and 120 ms hover, Left and Esc close one level with focus back on the parent row, Esc at the root and Tab restore the trigger, click outside closes, `placeMenu` keeps the plate inside the viewport (below the bar title, right of the parent row with a flip to the left, at the pointer with flips left and up); rows carry `role`, `aria-disabled`, `aria-checked`, `aria-haspopup`, `aria-expanded`, `aria-keyshortcuts`, `data-menu-item`, `data-control="menu.<id>"`, `data-status` and the Tooltip primitive |
| `packages/chrome/src/Snackbar.tsx`, `Snackbar.css`               | SPEC 1.1: bottom left, 8 px above the bottom bar, 5 s, one action, an X, Esc while the action or the X has focus, `role="status"` kept mounted; `useSnackbar()` and `<Snackbar>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/chrome/src/menus/__tests__/menu-model.test.ts`         | Every SPEC row present with its status (the SPEC tables transcribed as `SPEC_ROWS`), every R01 item in the model, nothing in the model outside R01 unless marked as ours or context-only, effects by status, action ids in the table or the fourteen, the counts per menu, the twenty additions, the title row and Slideshow arrow order, predicates, access keys, the toolbar order of 3.1, the card menu order of 4.2, the canvas menus of 4.3                                                                                                                                                                                                                                                                     |
| `packages/chrome/src/menus/__tests__/shortcuts.test.ts`          | The grammar; every R04 row bound, bound as disabled, a gesture or omitted with a reason; every bound chord equals Google's; every Turboslide key with no Google row listed; no collision in the editor map outside `SHARED_CHORDS`; no bare key outside present mode; the retired letters and the moved Cmd+K, Cmd+/, Cmd+S                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/chrome/src/menus/__tests__/default-view-words.test.ts` | The forbidden words over every label, tooltip sentence and stub clause of the model, the toolbar and the SPEC 12 strings, outside Tools > Advanced and Extensions > Agent access                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/chrome/src/menus/__tests__/menu-component.test.tsx`    | Menu.tsx behaviours above, with jsdom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `packages/chrome/src/__tests__/snackbar.test.tsx`                | Snackbar behaviours above, with jsdom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Relative imports inside `menus/` carry the `.ts` extension and the only import from outside the
folder is the type `IconName`, so `scripts/gslides-parity-audit.mjs` can load `model.ts` under
Node's type stripping without React.

## 2. Decisions taken in the data

1. **Counting unit.** SPEC 2.12 says it counts the rows of the SPEC tables. The model's items are
   Google items (Move slide has four, Order has four, Zoom has six), so `menu-model.test.ts`
   carries the SPEC tables as rows (`SPEC_ROWS`, one entry per table row with the ids it covers)
   and counts those. Section 3 below records where the SPEC's printed tally is off its own tables.
2. **Later containers have no effect.** A submenu whose children are all Later (Guides, Comments,
   Chart, Rotate) is one grey row that does not open; `sub()` derives a container's status from its
   children (now over later over omit) and gives a submenu effect only to a Now container.
3. **Context-only items.** SPEC 4.3 lists Text fitting and Alt text on the canvas menus and no SPEC
   2.x table carries them, while R07 rule 2 says every context menu item is also in the menu bar.
   They are in the model under Format with `contextOnly: true` (Alt text Now, opens Format options
   at its section, Cmd+Option+Y; Text fitting Later), so Search the menus finds them and the menu
   bar does not draw them. See the amendment request in section 4.
4. **Regroup.** R01 names it as product knowledge only. It is in the model as `arrange.regroup`,
   omitted with that reason, so the R01 fixture is fully covered; Arrange gains one Omit row.
5. **Installed add-on entries.** R01 prints it as its own Extensions row; the model holds it as
   `extensions.installedAddOns` (omit), a sibling of the Add-ons submenu.
6. **Extensions access key.** Ctrl+Option+X and Alt+X per SPEC 2.11; Google publishes none, so the
   binding is in `TURBOSLIDE_ONLY_KEYS` with Paste without formatting (Cmd+Shift+V, an item Google
   has whose key the Slides shortcut page does not print).
7. **Windows forms Google does not print.** Slide Alt+S and Arrange Alt+R (by pattern, R01),
   Start from beginning Ctrl+Shift+F5 (R04 unverified 2); the fixture rows have no Windows chord,
   so the equality test has nothing to compare and the report says so here.
8. **Mode as a radio pair.** Editing and Viewing are `toggle('viewing', false | true)`; `isChecked`
   reads a boolean value as a flag, so Editing is checked while Viewing is not on. Zoom levels and
   Appearance are radios by value (`aria-checked` from `settings.zoom` and `settings.appearance`).
9. **Access keys.** Assigned per sibling level from the letters of the label, items with fewer
   distinct letters choosing first (Print before Print settings and preview); a label with no
   letters (50%, 1.15) takes a digit. Every drawn item in every menu has one (the test asserts it).
10. **Chord grammar.** `Cmd+Shift+H`, alternates with `or`, two step chords with `then`, named
    keys Plus, Minus, Enter, Esc, Tab, Space, Delete, Backspace, Home, End, PageUp, PageDown, Up,
    Down, Left, Right, F1 to F12. Google's Fn+Left and Fn+Right on a Mac are Home and End. "Arrow
    keys" is the four arrows as alternates. Menus print symbols on a Mac (⇧⌘H) and words on Windows
    (Ctrl+Shift+H); tooltips print words on both (Cmd Shift H) so the Tooltip primitive's chip reads
    them.
11. **Scopes.** A binding fires in `editor` (everywhere), `filmstrip`, `canvas`, `text`, `menu` or
    `present`. Two bindings on one chord collide only in the same scope or when one is `editor`;
    Cmd+Up on the filmstrip (Move slide up) and on the canvas (Bring forward) are therefore two
    scoped bindings, and the pairs Google binds twice on purpose (Cmd+D, the four order keys) are in
    `SHARED_CHORDS` as `focus` pairs. The present keys (SPEC 9.2) are in the table for B6 and the
    shortcuts dialog; they are the only bare letters and the bare letter test skips that scope.
12. **The Title row's App icon and Title field** are the model items `title.appIcon` (label
    "Turboslide home", route `/decks`) and `title.name` (label "Rename", `deck.rename`), with
    Google's control names in `google` for the fixture.

## 3. SPEC 2.12: the printed tally against the tables

Counting the rows of SPEC 2.0 to 2.10 as section 2.12 says it does, the model reads:

| Menu       | Now (SPEC) | Later (SPEC) | Omit (SPEC) |
| ---------- | ---------- | ------------ | ----------- |
| Title row  | 6 (6)      | 1 (1)        | 4 (6)       |
| File       | 22 (24)    | 1 (1)        | 7 (9)       |
| Edit       | 10 (9)     | 1 (1)        | 0 (0)       |
| View       | 11 (12)    | 3 (3)        | 3 (3)       |
| Insert     | 13 (13)    | 5 (5)        | 10 (11)     |
| Format     | 15 (16)    | 6 (6)        | 6 (7)       |
| Slide      | 8 (8)      | 2 (2)        | 0 (0)       |
| Arrange    | 4 (4)      | 2 (2)        | 1 (0)       |
| Tools      | 12 (12)    | 2 (2)        | 3 (4)       |
| Extensions | 2 (2)      | 0 (0)        | 2 (2)       |
| Help       | 3 (3)      | 1 (1)        | 2 (3)       |
| Total      | 106 (109)  | 24 (24)      | 38 (45)     |

The Later column agrees everywhere. No single counting rule reproduces the printed Now and Omit
figures: File's 24 Now has 22 rows under any reading, Edit's 9 Now has 10 rows (Find and replace
is the eleventh row, Select none the one Later), and the Omit figures match Google items for the
title row, File, View and Format but rows for Insert, Tools, Extensions and Help. The Arrange Omit
is Regroup (decision 4). Section 2.12's sentence "the nine Advanced rows" also counts ten rows in
section 2.8 (the twenty additions add up only with ten). `menu-model.test.ts` holds the model to
the table rows (the middle figures above) and records the printed figures beside them, so the
integrator sees the delta on every run.

## 4. Requests to the integrator

1. **SPEC 2.12 amendment (7.9 style).** Replace the table with the row counts of section 3 above
   (106, 24, 38) or state the counting unit that yields 109, 24, 45; change "the nine Advanced
   rows" to ten.
2. **SPEC 4.3 amendment.** Add to the sentence "Every item here is also in the menu bar" the two
   exceptions, Text fitting and Alt text, which are Format options sections in Google (R01 Format
   options row) and appear as `contextOnly` items under Format in the model so Search the menus
   finds them.
3. **SPEC 14.4 item 2.** The Tooltip primitive prints the name first and the sentence under it, so
   "its tooltip starts with 'Not available in Turboslide yet'" should read the `.pt-tip-doc` span
   (or `tooltipDoc(item, ctx)` from the model), not the plate's whole text. `isStubTooltip` in
   `model.ts` is the check.
4. **`packages/chrome/package.json` exports.** Add `"./Menu": "./src/Menu.tsx"`,
   `"./Snackbar": "./src/Snackbar.tsx"`, `"./menus/model": "./src/menus/model.ts"`,
   `"./menus/strings": "./src/menus/strings.ts"`, `"./menus/keys": "./src/menus/keys.ts"` so
   B4's `ContextMenu.tsx` and the studio route can import them (the file is outside B3's list).
5. **Icons.** The model names only icons `packages/chrome/src/icons.tsx` has today. Google's menus
   carry an icon on every row (R08 B4); the rows without one need these Heroicons 20 solid added
   to `icons.tsx` and to the theme sprite (SPEC 3, "the sprite gains the ones marked new"):
   `arrow-uturn-left`, `arrow-uturn-right`, `printer`, `paint-brush`, `scissors`, `clipboard`,
   `document-duplicate`, `trash`, `eye-slash`, `folder-open`, `arrow-down-tray`,
   `arrow-up-tray`, `cursor-arrow-rays`, `square-2-stack`, `chevron-up`, `chevron-right`,
   `check`, `magnifying-glass-plus`, `magnifying-glass-minus`, `rectangle-group`,
   `arrows-pointing-in`, `bars-3-center-left`, `bars-3`, `list-bullet`, `numbered-list`,
   `bold`, `italic`, `underline`, `strikethrough`, `link-slash`, `photo`, `table-cells`,
   `presentation-chart-line`, `chart-bar`, `speaker-wave`, `video-camera`, `chat-bubble-left`,
   `hashtag`, `document-plus`, `folder-plus`, `share`, `globe-alt`, `information-circle`,
   `book-open`, `academic-cap`, `sparkles`. `icons.tsx` is in no builder's list; B3 can take it
   on day two if the integrator assigns it, since the sprite regeneration is in `packages/theme`.
6. **Tokens.** `--pt-menu-w: 220px` and `--pt-status-h: 32px` (SPEC 1.2) are read with fallbacks
   in `Menu.css` and `Snackbar.css`; B3 adds them to `tokens.css` on day two with the other
   tokens of 1.2 (the file is B3's; day one did not touch it).
7. **After merge 1, in B3's own files:** `packages/chrome/src/inspector/sections.ts` needs the
   `table` block's icon (B1 added the type; `tsc -b` fails there today) and `palette-data.ts`
   needs the same for `KIND_ICONS`, which is why `insert-menu.test.tsx` and
   `palette-component.test.tsx` fail on the shared checkout (`Icon` at `icons.tsx:407` gets an
   unknown name); `inspector-generate.test.ts` expects the field list before B1's `link` field.
   These are B1's day one landing in B3's files and are fixed when B3 continues.

## 5. What is not proven yet

- `Menu.tsx` has run only under jsdom, where `offsetHeight` is 0: `placeMenu` is unit tested with
  real sizes, but the plate has not been seen in a browser. The menu bar (hover switching between
  open bar menus, `onNavigate` on Left and Right) is day two; the primitive exposes the hooks.
- The dynamic Apply layout submenu renders whatever `renderDynamic` returns; the layout grid over
  B1's `LAYOUTS` and B2's `renderThumb` is day two.
- The Snackbar's vertical position reads `--pt-status-h` with a 32 px fallback until the token
  lands; its place relative to the filmstrip has not been checked against a screenshot.
- The present scope bindings are data for B6 and the shortcuts dialog; nothing binds them yet.
- Google's Windows access keys for Slide and Arrange and the Windows Start from beginning chord
  are unverified (R01, R04); the fixture carries no Windows value for those rows.

## 6. Commands run and their results

All from `/Users/kevinliu/repos/Turboslide` on 2026-09-12, Node 24.13.0.

| Command                                                                                                                                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cd packages/chrome && ../../node_modules/.bin/vitest run src/menus src/__tests__/snackbar.test.tsx`                                                               | 5 files, 63 tests, 63 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `cd packages/chrome && ../../node_modules/.bin/vitest run` (the whole chrome suite)                                                                                | 24 files: 21 passed, 3 failed; 187 tests: 176 passed, 11 failed, all eleven in `insert-menu.test.tsx` (4), `palette-component.test.tsx` (6) and `inspector-generate.test.ts` (1), caused by B1's uncommitted schema changes as section 4 item 7 describes; the 63 new tests pass. One earlier run of the whole suite while other builders' processes loaded the machine also failed five jsdom tests (three existing, two new) that pass alone and passed on the next full run; the pattern looks like the 5 s test timeout under load and is noted here rather than hidden |
| `node_modules/.bin/tsc -b packages/chrome`                                                                                                                         | The new files typecheck; two errors remain in files that are not B3's: `packages/render/src/blocks/render-block.ts(24,63)` (TS2366) and `packages/chrome/src/inspector/sections.ts(210,14)` (TS2741, `table` missing from the icon map), both from B1's in-progress catalog change                                                                                                                                                                                                                                                                                          |
| `node_modules/.bin/eslint packages/chrome/src/menus packages/chrome/src/Menu.tsx packages/chrome/src/Snackbar.tsx packages/chrome/src/__tests__/snackbar.test.tsx` | Clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `node_modules/.bin/prettier --check` on the same files and the two CSS files and fixtures                                                                          | Clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

`pnpm --dir packages/chrome test` is the MILESTONES acceptance for B3 and is not green on the
shared checkout for the reason above; it is green for the five files this day delivers. No dev
server was started; no git write command, `pnpm install`, `pnpm build` or `pnpm generate:contracts`
was run.
