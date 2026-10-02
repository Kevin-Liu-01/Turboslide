# Lane B3a: the menus and the words

Lane B3a of Round 1 (docs/NEXT.md 4.1.3 items 19 to 22, pushes 7 and 8). The worktree is
`/Users/kevinliu/repos/Turboslide-next` on `next/round1`. My dev servers run on 4505 and 4515 only.
I wrote this note's requests on day 0, 2026-10-02 at 01:55 PDT (08:55Z), at a load of 17.58,
before I edited anything. The day 0 read, the pushes and their readings follow under their own
headings.

The files I own (NEXT.md 4.1.6): `packages/chrome/src/menus/model.ts`, `menus/strings.ts`,
`menus/toolbar-tails.ts`, `packages/identity/src/labels.ts` and `packages/store/src/select.ts`. I
treat their tests as mine (`packages/chrome/src/menus/__tests__/*`, `packages/identity/src/labels.test.ts`
and `packages/store/src/select.test.ts`). I also own the rows and drivers of 4.1.4: the `parks` of
`core-matrix.json`, the area drivers `scripts/probes/core-walk/areas/{logos,chrome,polish-chrome,shaders,brand}.mjs`,
the specs `apps/studio/e2e/core/{export,logos,chrome}.spec.ts` and `apps/studio/e2e/deck-transfer.spec.ts`,
the declared ids in `scripts/probes/core-matrix.mjs` and `core-matrix.test.mjs`. In a shared spec
file or driver I change only the hunk that names a cut id, and I stage only that hunk.

## Round 1

### Requests of day 0

1. **To the integrator, `scripts/hosted-smoke.mjs` 66 to 72, 884 and 975 to 976 (no Round 1 lane
   owns the file).** The smoke's build row looks for the literals `view.playShaders` and
   "Play shaders" in the client the deployment serves. B3a#7 moves that row to Tools > Preferences
   with the id `tools.preferences.playShaders`. B3a#8 renames it "Play animated patterns" (question
   10). The guard runs the smoke from the pushed sha (`~/.config/turboslide/gt-follow.sh` 104), so a
   request landed in a later commit cannot keep the smoke green. I therefore change the two marks,
   the row name and its sentence in the same commit as each push, and nothing else in the file.
   The integrator can move the hunk or object here.
2. **To the integrator, `apps/studio/src/editor/EditorRoot.tsx` `HostingBanner` (2602 to 2608 on
   this branch) with `packages/store/src/select.ts` 30 to 31 (mine), as one commit.** The banner
   draws `${notice}; connect one to the Vercel project to keep them.`, so a change of the notice
   alone leaves a sentence whose "one" names nothing. NEXT.md 4.1.3 item 21 asks for the seller's
   sentence "Edits on this copy of Turboslide are lost when it restarts" and the setup sentence in
   the server log. I consent to the integrator editing `select.ts` in that commit. The words:
   `NOT_PERSISTENT_NOTICE = 'Edits on this copy of Turboslide are lost when it restarts'` and a new
   `NOT_PERSISTENT_SETUP = 'Edits are kept on this server instance only. Connect a Blob store to the Vercel project to keep them'`.
   The banner draws `${notice}.` and the server logs `NOT_PERSISTENT_SETUP` once at start. The
   `select.test.ts` assertion at 36 then reads `/lost when it restarts/`. I leave `select.ts`
   unchanged in my pushes, so no commit of mine draws the broken sentence.
3. **To the integrator, the own chip and the generated label (no Round 1 lane owns
   `packages/chrome/src/presence/**`).** Item 21 asks for "You" on the own chip and
   "Guest <label>" for others. The words are composed outside my files:
   `presence/PresenceSlot.tsx` 231 (the own chip's tooltip name `${self.name ?? self.label} (you)`)
   and `presence/RosterMenu.tsx` 129 and 173 (the roster's own row). The request: the own chip's
   tooltip name and the roster's own row read `PRESENCE.youName` ("You", which B3a#8 adds to
   `strings.ts`), and a person with no typed name reads `guestNameFor(label)` ("Guest Felt 280",
   which B3a#8 adds to `labels.ts`) wherever a label is drawn as a name for another person. I do
   not change `labelFor` itself: the avatar initials and hue read the label
   (`packages/identity/src/marks.test.ts` 40), so a prefix there would draw "G" on every
   anonymous chip.
4. **To B3b (`packages/chrome/src/inspector/**`) and the integrator (the other files), the shader
   noun.** Question 10's default names Insert ("Animated pattern") and Preferences ("Play animated
   patterns"). B3a#8 renames those two rows and the gallery's words in `strings.ts`
   (`SHADER_GALLERY`). The block keeps the word "Shader" in four places outside my files: the
   section title in `inspector/shader.tsx` (B3b), the chip in `packages/viewer/src/Selection.tsx`,
   the alt text in `packages/chrome/src/editor-shell.ts` and the sheet label in
   `packages/render/src/blocks/material.ts`. The row `shaders.insert.words` (broken, parks
   `insert.shader`) states the one noun across all of them; B3a#8 rewrites its words to
   "Animated pattern" and it stays broken until those four land.
5. **To B3b, the title row's Sign In.** B3a#8 lands the item in `model.ts` from B3b's request
   (4.1.6). Until B3b's note names it, I land `title.signIn`: label "Sign In" (Title Case, a
   button), the dialog Sign in, `when: 'canSignIn'`, `turboslide: true`, between `title.share`
   and `title.account`. B3b draws it in `TitleRow.tsx`. B3b can amend the id or the place in its
   note before B3a#8.
6. **To the integrator, `packages/chrome/src/menus/finder.ts` 63 (no lane owns it).**
   `SELLER_TERMS['tools.assist']` names a row B3a#7 removes. The entry is read only by id, so it is
   dead and harmless; it can go in any later commit.
7. **To the integrator and B6, `skills/turboslide-studio/references/assist.md` 7 (hand written, no
   lane owns it).** It says "Tools > Assist opens the same panel (`tools.assist`)". After B3a#7 the
   panel opens from the title row's Assist and Cmd+J alone.
8. **To the integrator, the count in `scripts/probes/core-matrix.test.mjs` (mine to edit, shared
   with every push that enters a row).** Each of my pushes adds its rows with one count term and
   a comment line, staged from `HEAD` plus my hunk, the way HA and HB staged theirs.
9. **A notice to every lane: ids that move in B3a#7.** The removed rows are `insert.logo`
   (Insert > Image > Logo stays), `tools.assist` (the title row's Assist stays) and the
   `tools.accessibilitySettings` group. `slide.editTheme` becomes an omitted row (Google's
   position, not drawn). `format.textFitting` leaves the Format menu and stays on the right click
   menus of a text box and a shape. These rows get new ids under Tools > Preferences:
   `tools.preferences.playShaders` with `.on`, `.show` and `.off`, `tools.preferences.appearance`
   with `.light`, `.dark` and `.match`, and `tools.preferences.collaboratorAnnouncements`. The
   rows `file.download.html`, `file.download.zip` and `file.download.options` keep their ids
   inside the new submenu `file.download.more` ("More formats"). A driver reaches them through
   one more hover.
10. **A deviation I take, for the integrator to read.** The clutter audit moves the web page and
    the bundle into the Download options dialog. That dialog knows PowerPoint and PDF alone
    (`packages/chrome/src/dialogs/Download.tsx` 43 and 228, no lane's file). I draw More formats
    as a submenu that holds Web page, the Turboslide file and Download options. File > Download
    still lists five rows (`chrome.menus.download-four-first`).
11. **To the integrator, `packages/chrome/src/font-picker-model.ts` 45 and 46 with its test
    `packages/chrome/src/__tests__/font-picker-model.test.ts` 236 (no lane owns them), added at
    09:44Z.** The font field's disabled sentence says "Slide > Edit theme changes it", the row
    B3a#7 omits. I change the two sentences to "Slide > Change theme" and the test's literal in
    B3a#7, because the tooltip would name a row that no longer exists. B3a#8 then says "the theme's
    Display face" where it said "the brand kit's". The integrator can move the hunk.
12. **B3b's request 3 (round1/build/b3b.md), taken at 09:40Z.** The step
    `chrome.cluster.gaps-heights` in `scripts/probes/core-walk/areas/chrome.mjs` and its row's
    words now read Share square, the split button at 8 px, and the inset from Sign In when the
    title row draws it. The hunk is in the working tree (`.turboslide/b3a/b3b-req3.mjs`). It belongs
    to B3b's push 10, so I consent to B3b staging it with that push. If B3b's push 10 lands
    without it, I stage it with my next commit.
13. **A notice to every lane that bumps the matrix count:** B3a#7 moves the next program's terms of
    the total in `scripts/probes/core-matrix.test.mjs` into one constant, `NEXT_ROWS = 1 + 1 + 3 +
    1 + 1 + 3` (H6, H7, H2, H3, H4, then B3a#7), because the one line passed Prettier's width and
    Prettier would set every term on its own line. A push that adds rows after B3a#7 adds its term
    to `NEXT_ROWS`. The working tree carries every lane's term there already.
14. **Findings of the day 0 read for other owners (below):** to B5 (`packages/lint/src/**`), the
    Check slides panel reads "In native mode an image exports as a 2x raster." on a picture slide,
    three process words in a sentence a seller sees; to the integrator
    (`packages/chrome/src/panels/assist-strings.ts`), the Assist panel's first line reads
    "Slide 2: Slide 2" on an untitled slide and its foot names "this restricted presentation's"
    text.

15. **The shader noun outside my files, added at 11:15Z with B3a#8's words (question 10):** to B3b,
    the owner of `packages/chrome/src/palette-data.ts`, the Insert palette's entry still reads
    "Shader" (`insert-menu.test.tsx` 81 and 104 pin it); to the integrator,
    `apps/studio/src/components/Slideshow.tsx` 114, the show's Options row "Play shaders", which
    mirrors Tools > Preferences > Play animated patterns. Each can take "Animated pattern" and "Play
    animated patterns" with its test in its owner's next commit.

### Day 0: the first read of what the clutter audit did not open (item 19)

Driven by `build/b3a/day0.mjs` on my server at 4505 (tmp store, memory channel, local open
surface), 09:03:26Z to 09:04:48Z, load 12.56 at the start and 27.78 at the end, on `0b6df8d4`
plus the other lanes' working files of that minute and none of mine. One scratch deck from the
blank template with a text box, a rectangle, a line, a picture and a 3 by 2 table on its second
slide, removed by id at the end (`deck.trash` 200, `deck.remove` 200, `deck.info` 404). An
earlier run at 09:01Z read Format options with nothing selected, because the script's Escape
cleared the selection; it was not used. The output is `build/b3a/day0/day0.json`, with one picture
per surface and appearance (JPEG, 54 to 71 KB each). The counts were the same in both appearances.

The side panels at 1440 by 900:

| Panel | Opened from | Controls | Interactive | Words | Tooltip words |
| --- | --- | ---: | ---: | ---: | ---: |
| Format options (a text box selected) | Format > Format options | 127 | 115 | 159 | 212 |
| Brand kit | Slide > Change theme | 39 | 34 | 100 | 65 |
| Comments (no comment) | the title row's comments glyph | 5 | 2 | 17 | 3 |
| Version history | File > Version history > See version history | 19 | 18 | 63 | 101 |
| Assist | the title row's Assist | 10 | 6 | 84 | 15 |
| Check slides (the objects slide) | Tools > Check slides | 4 | 3 | 25 | 5 |
| Diagram | Insert > Diagram | 18 | 14 | 15 | 16 |

The right click menus at 1440 by 900 (rows at the first level, disabled rows, words), matching the
model's counts of audit-clutter 32:

| Target | Rows | Disabled | Words |
| --- | ---: | ---: | ---: |
| Filmstrip card | 12 | 0 | 26 |
| Empty slide | 10 | 1 | 21 |
| Text box | 17 | 3 | 32 |
| Picture | 17 | 1 | 33 |
| Shape | 18 | 3 | 34 |
| Line | 18 | 3 | 34 |
| Table (its ring) | 16 | 3 | 29 |
| Table cell | 17 | 2 | 38 |

The More overflow at 1440: the shape tail draws 17 controls and folds five into More (Bulleted
list, Numbered list, Decrease indent, Increase indent, Clear formatting); the table cell tail draws
16 and folds the same five. Both keep the fold: the five are the list and indent group, which
Google also draws last.

The 25 default view rows Google lacks (audit-clutter 24; `build/b3a/day0/model-before.json`, read
from the model under Node with Tools > Advanced tools off), each with its reason:

| Row | Kept or moved | Reason |
| --- | --- | --- |
| File > New > Presentation | kept | The one way to a new presentation while the template gallery is parked; drawn "New presentation" from B3a#8 |
| File > Share > Copy link | kept | The address without a token (SPEC-3 0.16) |
| File > Download > Web page | moved | Into More formats (B3a#7) |
| File > Download > Turboslide bundle | moved | Into More formats (B3a#7), "Turboslide file (.zip)" from B3a#8 |
| File > Download > Download options | moved | Into More formats (B3a#7) |
| View > Play shaders | moved | To Tools > Preferences (B3a#7), "Play animated patterns" from B3a#8 |
| View > Appearance | moved | To Tools > Preferences (B3a#7) |
| Insert > Image > Logo | kept | The one Logo row |
| Insert > Logo | cut | B3a#7; Insert > Image > Logo stays |
| Insert > Shape > Rectangle, Rounded rectangle, Ellipse | kept | The three named shape rows of the vector round, Google's gallery in three rows |
| Insert > Shader | kept | "Animated pattern" from B3a#8 |
| Format > Text > Font | kept | The toolbar's font list as a row (product round) |
| Format > Text > Tabular figures | kept | Numbers in a column (features round) |
| Format > Table > Header row | kept | The objects round's header row |
| Format > Image > Replace image > Logo | kept | Swaps a logo in its box |
| Format > Image > Add a caption | kept | Product round, used with pictures |
| Format > Image > Use on every slide | kept | The logo on every slide |
| Format > Text fitting | moved | Off the Format menu to the right click menus of a text box and a shape (B3a#7), where Google keeps it inside Format options |
| Tools > Preferences > Link detection | kept | Now inside a named Preferences group (B3a#7) |
| Tools > Tailor for a customer | kept | The one way to tailor |
| Tools > Assist | cut | B3a#7; the title row's Assist and Cmd+J stay |
| Tools > Check slides | kept | The suggestions panel |
| Tools > Advanced tools | kept | The one switch |

After B3a#7 the default view draws 249 rows (from 253) with these first level rows per menu: File
12, Edit 11, View 11 (from 13; Live pointers came back with the realtime round), Insert 13 (from
14), Format 10 (from 11), Slide 8 (from 9), Arrange 8, Tools 4 (from 6), Help 4. File > Download
draws 5 rows (from 7). 24 default view rows are rows Google lacks
(`build/b3a/day0/model-after7.json`).

The 107 leaf rows disabled with nothing selected (Format 77, Arrange 21, Slide 4, Edit 2, Insert
2, View 1) stay: each names its reason in its tooltip, and none of them is a cut of audit-clutter
96 to 103. After B3a#7 they are 106, Text fitting being the one that left the menu bar.

What the read found, each placed:

- The Check slides panel on the objects slide reads "In native mode an image exports as a 2x
  raster." and "This slide is arranged by hand. Apply layout re-flows it." The first carries
  "native" (already on the forbidden list) and "raster". The sentence is the deck linter's
  (`packages/lint/src`), B5's: request 14 above, and a row for the round that owns the linter's
  messages.
- The Assist panel's first line reads "Slide 2: Slide 2" for an untitled slide, and its foot
  sentence reads "Your slide text, including this restricted presentation's, goes to the model
  provider…". Request 14; not a word of B3a's files.
- Version history reads "02:03 AM" and names one change "named": B3b's item 17 owns the times.
- The name plate ("Your name", Continue, Sign in) opens in the title row after the first write, as
  the audit saw: B3b's item 13.
- The Brand kit panel's last button reads "Reset to General Translation", the default kit's name
  (HB's finding 4): B3b and B4.
- No finding is a word of B3a's files, so item 21 takes no word from the read beyond the list of
  NEXT.md 4.1.3 item 21.

### B3a#7: the cuts with their rows and drivers (`d85c7964`)

Committed at 11:10Z on top of `3263728a`, staged from `HEAD` plus my hunks alone
(`.turboslide/b3a/commit.mjs`), so the other lanes' working hunks in the shared files stayed
unstaged. 29 paths.

Items (NEXT.md 4.1.3 item 20; audit-clutter 96 to 103), all in `packages/chrome/src/menus/model.ts`:

| Cut | What changed | Where it stays reachable | Gain |
| --- | --- | --- | --- |
| `insert.logo` | removed | Insert > Image > Logo, Format > Image > Replace image > Logo, Search the menus "logo" (the Image row now answers first) | Insert 14 to 13 rows |
| `tools.assist` | removed; the title row's Assist doc no longer names tailoring | the title row's Assist, Cmd+J; the panel's tailoring starter already opened the Tailor dialog (`EditorShell.tsx` `onTailor`) | Tools loses a row |
| `slide.editTheme` | an omitted row in Google's position; Change theme carries its doc | Slide > Change theme, the toolbar's Theme | Slide 9 to 8 rows |
| `format.textFitting` | `contextOnly` | the right click menus of a text box and a shape, Format options, Search the menus | Format 11 to 10 rows |
| `view.playShaders`, `view.appearance`, `tools.accessibilitySettings` | one Tools > Preferences submenu: Link detection, Play shaders, Appearance, Turn on collaborator announcements, under `tools.preferences.*` ids; Google's Accessibility settings stays as omitted rows | Tools > Preferences, Search the menus | View 13 to 11, Tools 6 to 4: Preferences, Tailor for a customer, Check slides, Advanced tools |
| `file.download.zip`, `file.download.html` | the submenu More formats (`file.download.more`) with the two formats and Download options; the three keep their ids | File > Download > More formats | Download 7 to 5 rows |

Rows. Entered: `chrome.menus.one-logo-row`, `chrome.menus.preferences-named`,
`chrome.menus.download-four-first` (chrome, `core/chrome.spec.ts` through the new
`apps/studio/e2e/core/chrome-menus.ts`, today broken, severity 1, NEXT.md 4.1.5's words). Parks
rewritten to the id that stays: the twelve logos rows of 4.1.4 to `insert.image.logo`
(`logos.insert.row` from two ids to one), `assist.entry.title-row` and
`assist.panel.first-line-and-cards` to `title.assist`, `brand.panel.opens` to `slide.changeTheme`,
`shaders.view.play-setting`, `shaders.show.plays-when-on` and `shaders.show.frame-when-off` to
`tools.preferences.playShaders`. Words moved with the menus: `logos.insert.row`,
`assist.entry.title-row`, `brand.panel.opens`, `export.zip.bundle`, `export.html.web-page`,
`export.download.options-dialog`, `export.pdf.dialog`, `export.pptx.dialog`, `decks.card.download`,
`shaders.view.play-setting`, `view.appearance.rows`, `text.format-menu.text-fitting`,
`text.format-options.remembers-section`, `menus.icons.format-rows`, `chrome.words.one-spelling`,
`surface.domain.build-commit`. The declared ids `insert.logo`, `tools.assist` and
`view.playShaders` left `scripts/probes/core-matrix.mjs`; `core-matrix.test.mjs` follows the
parks and counts the next program's terms in `NEXT_ROWS` (notice 13).

Drivers moved (4.1.4, and every other driver that walked a cut path): `core/chrome.spec.ts` (the
Logo dialog's way in and the dark appearance), `core/logos.spec.ts`, `core/export.spec.ts`
(`downloadPath`, `MORE_FORMATS`, `reachDownloadRow` and `hasOptionsRow` hover More formats),
`core/decks.spec.ts` (the bundle), `core/brand.spec.ts` (Download options), `core/shaders.spec.ts`
and `core/surface.spec.ts` (Play shaders under Tools > Preferences), `deck-transfer.spec.ts`,
`presence.spec.ts` (the announcements row), and the walk areas `logos`, `chrome` (the
appearance, the icon lists: Text fitting is read on the shape's menu), `polish-chrome` (the
Download and More formats orders), `export`, `shaders`, `brand` (one theme row in Slide),
`assist` (no Tools row), `text` (Text fitting from the box's right click menu), `view` and
`people`. Outside 4.1.6's lists: `scripts/hosted-smoke.mjs` (request 1) and
`packages/chrome/src/font-picker-model.ts` with its test (request 11).

Readings on 4505 (tmp store, memory channel, local open surface), under `.turboslide/e2e.lock`,
with the other lanes' working files of that minute served beside mine
(`.turboslide/b3a/rows7/*.json`):

| UTC | Load | Rows | Result |
| --- | --- | --- | --- |
| 10:30:13 to 10:30:39 | 21.47 to 21.99 | `chrome.menus.one-logo-row`, `chrome.menus.preferences-named`, `chrome.menus.download-four-first`, `logos.picker.chrome-1280` | 4 passed |
| 10:30:39 to 10:31:54 | 21.99 to 18.61 | `export.zip.bundle`, `export.html.web-page`, `export.download.options-dialog` | 3 passed |
| 10:31:54 to 10:33:28 | 18.61 to 19.42 | `decks.file.open-upload-bundle`, `decks.file.import-slides-bundle` | 2 passed |
| 10:33:28 to 10:34:29 | 19.42 to 21.58 | `deck-transfer.spec.ts` bundle test | not a reading: the spec opens `/edit/fixture`, a file store deck the tmp store does not seed; the check chain's server runs it |
| 10:34:29 to 10:35:01 | 21.58 to 21.33 | `brand.template.blank-no-gt-mark` | passed |
| 10:35:01 to 10:35:34 | 21.33 to 22.32 | `shaders.show.plays-when-on`, `shaders.show.frame-when-off` | skipped as before (the show's layer is not on the build), after the rows were read under Tools > Preferences |
| 10:35:34 to 10:35:41 | 22.32 to 24.94 | `surface.domain.build-commit` | failed as before: a dev server answers no `instance.commit`; the annotation reads "Tools > Preferences > Play shaders drawn true" |
| 10:35:41 to 10:36:04 | 24.94 to 24.05 | `logos.picker.recents`, `logos.dialog.results-in-view` | failed as before on the dev index's results ("figma" not among them) and the dialog's height (709 to 728 px); both opened the dialog through Insert > Image > Logo. Both rows are not driven today |

The walk after the commit, on the same server (still serving the B3a#7 build), narrowed to the
areas whose steps moved: `core-gate.mjs --only probe --areas
view,export,chrome,polish-chrome,logos,brand,assist`, 13:43:38Z to 14:04:50Z, load 9.72 at the
start and 29.55 at the end, 1,272 s, `.turboslide/b3a/gate7/` (untracked). 116 rows judged: 104
passed, 9 failed, 3 not driven. Every row whose step B3a#7 moved passed: `logos.insert.row`
(Insert > Image > Logo in the default view, no top level Logo row, the finder's first row for
"logo" `insert.image.logo`), `menus.icons.insert-rows`, `menus.icons.format-rows` (Text fitting
read on the shape's menu), `menus.icons.one-family`, `chrome.words.one-spelling` (passed for the
first time: the four formats, a divider, More formats, and Download options last after a divider),
`view.appearance.rows`, `brand.panel.opens`, `assist.entry.title-row`,
`assist.panel.first-line-and-cards`, `export.pdf.dialog`, `export.pptx.dialog`, and the chrome
area's appearance steps. The nine failed are rows no step of mine touches, each failing on its
own reading: `chrome.cluster.gaps-heights` (B3b's request 3 hunk is in the working tree before
B3b's push 10; it read the inset 4 px from Sign In), `assist.tailor.dialog-one-undo`,
`assist.agent.propose-accept`, `brand.objects.kit-colours-first`, and five logos rows on the dev
index (`logos.picker.paper-and-ink`, `.empty-state`, `.licence-words`, `logos.insert.mono-tint`,
`logos.tailor.find-customer-logo`), all not driven today. Not run: the walk areas `text`,
`shaders` and `people`, whose moved steps (Text fitting from the box's menu, Play shaders under
Tools > Preferences, the appearance) are read in B3a#8's run or not at all; this note says which.

Pictures (`build/b3a/push7/`, JPEG, 13 to 68 KB each; `shoot-menus.mjs` with `--layout old` on
production for "before", 14:22Z and 14:42Z at loads 5.64 and 16.39, no write, and `--layout new`
on 4505 for "after", 14:22Z and 14:42Z at 4.88 and 16.56): Insert with Image open, Tools (with
Preferences open after), File > Download (with More formats open after) and View, at 1440 and 390
in both appearances, 32 pictures. I looked at each set. Before: Tools opens on "Link detection"
and "Turn on collaborator announcements" without their group names, then Tailor for a customer,
Assist, Check slides, Advanced tools; Download lists seven rows with Download options last;
Insert draws Logo twice. After: Tools reads Preferences, Tailor for a customer, Check slides,
Advanced tools, Preferences holds the four rows; Download lists the four formats and More formats,
which holds Web page, Turboslide bundle and, after a divider, Download options; Insert draws one
Logo, inside Image; View has no Play shaders and no Appearance. The first run's single level
menus (Tools before, View before and after) were shot before the menu had measured its place and
showed no menu; the script now waits 450 ms and those 12 were shot again (`shots-*-re.json`).
"Before" is production, which serves the build before the realtime round, so its title row and
Live pointers row differ from this branch's.

What the three rows read: Insert's first level rows Image, Text box, Shape, Table, Chart,
Diagram, Word art, Line, Link, Comment, New slide, Slide numbers, Shader, and Insert > Image's
Upload from computer, Logo, By URL; Tools' Preferences, Tailor for a customer, Check slides,
Advanced tools, and Preferences' Link detection, Play shaders, Appearance, Turn on collaborator
announcements; Format's ten rows without Text fitting; Slide's one theme row, Change theme; File >
Download's Microsoft PowerPoint (.pptx), PDF Document (.pdf), JPEG image (.jpg, current slide),
PNG image (.png, current slide), More formats, and More formats' Web page (.html), Turboslide
bundle (.zip), Download options.

Unit and static checks, at any load: the menus suite 134 passed; the chrome package 97 files and
916 passed; the matrix and README tests 43 passed on `HEAD` plus the commit alone (a scratch tree
of the staged text); the walk, gate and hosting tests 53 passed; `tsc -b` of `packages/chrome`
and `apps/studio` exit 0; Prettier clean on all 29 paths.

Deviations: More formats is a submenu, not the Download options dialog (request 10). Google's
Edit theme and Accessibility settings stay in the model as omitted rows, so the parity record of
`__fixtures__/google-menus.json` still holds every Google row. `format.textFitting` stays a row
(context only), since its id is the section the shell opens (`editor-shell.ts` 2070).

### B3a#8: the words and the forbidden list

Items (NEXT.md 4.1.3 items 21 and 22; audit-clutter 57 to 70, 112 to 124):

| Where | Before | After | File |
| --- | --- | --- | --- |
| Tools > Advanced tools tooltip | "Shows the tools that are not yet tested end to end, …" | "Shows more tools in every menu, on the toolbar and in the right click menus. Some of them may not work yet" | `model.ts` |
| File's first row (the template gallery parked) | "Presentation" | "New presentation" (a row's `collapsedLabel`, read by the collapse rule of `visibleItems`) | `model.ts` |
| Insert's shader row, the gallery it opens | "Shader", a gallery titled "Shader" | "Animated pattern", the gallery's title, sentence ("…the pattern takes your theme's colors"), search, chips and empty state | `model.ts`, `strings.ts` `SHADER_GALLERY` |
| Tools > Preferences > Play shaders | "Play shaders" and three docs on shaders | "Play animated patterns", the docs on animated patterns; Search the menus keeps "shader" and "play shaders" | `model.ts` |
| File > Download > More formats | "Turboslide bundle (.zip)" | "Turboslide file (.zip)", and in the PowerPoint import refusal | `model.ts`, `strings.ts` `IMPORT_PPTX` |
| The home link's tooltip | "Every presentation on this Turboslide" | "Your presentations" | `model.ts` |
| The theme's noun | panel "Brand kit" | panel "Theme" (the toolbar button and Slide > Change theme read the noun already); the side panel tooltip, the logo tile's sentence, "The theme cannot be changed here yet", the font field's sentence | `strings.ts` `PANELS.brand`, `model.ts`, `font-picker-model.ts` |
| The title row for a visitor who can sign in | Sign in in the account menu alone | "Sign In" as text after Share (`title.signIn`, `canSignIn`), B3b's request; `TitleRow.tsx` draws it | `model.ts` |
| Another person's generated label, the own chip | "Felt 280", "Felt 280 (you)" | `guestNameFor(label)` "Guest Felt 280" and a grammar that takes the guest word; `PRESENCE.youName` "You". The presence surfaces draw them by request 3 | `labels.ts`, `strings.ts` |
| Help > Help Turboslide improve | GitHub's new issue page | unchanged (question 11's default) | none |
| The tmp store banner | the Blob store sentence | request 2: the banner's suffix is composed in `EditorRoot.tsx` | none |
| The forbidden list | 38 words | 44: `tested`, `end to end`, `bundle`, `Blob store`, `server instance`, `this Turboslide` | `strings.ts` |

Also in the push, by B3b's request 7: no sparkle on a model row (`title.assist` draws no glyph,
Tailor for a customer the chat glyph, Insert > Icon `squares-2x2`, the Developer submenu's
suggestion marks the light bulb), so Search the menus draws none.

The row `chrome.words.no-process-words` enters without NEXT.md 4.1.5's clause "the account
tooltip reads You": that word is drawn by `presence/PresenceSlot.tsx`, which is not B3a's file. The
row's note says so, and the integrator adds the clause with request 3. `shaders.insert.words`
now reads the Insert row as Animated pattern and the block's own words as Animated pattern or
Shader (B3b's working `inspector/shader.tsx` already titles the section Animated pattern; the chip
and the alt are the integrator's). `shaders.insert.gallery-thumbnails` reads the gallery's new
title and its sentence naming the theme.

Committed as `9b70d0ae` at 16:10Z on top of `c9380a14`, 16 paths, staged from `HEAD` plus my
hunks alone.

Readings on my second server at 4515 (the tree of this push, the other lanes' working files
beside it), under `.turboslide/e2e.lock` (`.turboslide/b3a/rows8/`, untracked):

| UTC | Load | Rows | Result |
| --- | --- | --- | --- |
| 14:23:01 to 14:23:58 | 4.72 to 6.09 | `chrome.words.no-process-words` with the three menu rows of B3a#7 | 4 passed. The words row read 385 labels, tooltip names and tooltip sentences over 195 menu rows of 9 menus (two submenu levels), the toolbar and the title row, with no word of the extended list; the toolbar button "Theme", the Slide row "Change theme", the panel title "Theme" |
| 14:23:58 to 14:24:42 | 6.09 to 5.46 | `export.zip.bundle` | passed under "Turboslide file" |
| 14:24:42 to 14:24:48 | 5.46 to 6.30 | `surface.domain.build-commit` | failed as before (no `instance.commit` on a dev server), with "Play animated patterns drawn true" |
| 14:24:48 to 14:36:23 | 6.30 to 42.68 | the walk areas `shaders` and `text` (`.turboslide/b3a/gate8/`) | 103 rows: 92 passed, 8 failed, 3 not driven. The text rows whose steps open Text fitting from the box's right click menu passed: `text.format-menu.text-fitting`, `text.format-options.padding-grid`, `.remembers-section`, `text.autofit.shrink-on-overflow`. Two rows read red on this push's words: `shaders.insert.gallery-thumbnails` (it looked for the title Shader and a sentence naming the brand kit) and `shaders.insert.words` (it looked for the section title Shader, which B3b's working inspector already names Animated pattern). Both drivers moved to the new words before the commit; the run's own readings meet the new checks (title "Animated pattern", "…the pattern takes your theme's colors", 17 cards decoded in 5 ms; Insert row "Animated pattern", chip "Shader", section "Animated pattern", alt "The liquid metal shader", sheet, show and viewer clean). `shaders.view.play-setting` read its three rows under Tools > Preferences and stored Off across a reload, and failed on "the show's Options menu lists no Play shaders row", a part this push does not touch (the show's row is `Slideshow.tsx`'s). The others (`text.link.cmd-k-enter`, `text.select.shift-home-line`, `shaders.panel.preset-tiles` 826 ms against 500, `shaders.panel.kit-colours`, `shaders.background.place-answers` 13.5 s) read their own timings and states at a load that rose to 42 |

`scripts/hosted-smoke.mjs http://localhost:4515` (a fetch run, not a browser): "Tools >
Preferences > Play animated patterns" pass through the dev server's `/@fs` read of the model;
"build commit" fails on a dev server as it always has.

Unit and static checks: the menus suite 138 passed (new: the collapsed New presentation, the
seller's words, Sign In in the title row, the extended list over every row); the chrome package 98
files and 921 passed; the identity suite 94 passed; the store's select test 9 passed; the studio
tests that read the menus 84 passed; the matrix and README tests 43 passed on `HEAD` plus the
commit alone; Prettier clean on the 16 paths.

Deviations: the row `chrome.words.no-process-words` enters without the "You" clause (above).
The shader noun reaches the two rows question 10 names and the gallery they open; the block's
chip, alt and history label, the Background row, the palette entry and the show's Options row keep
"Shader" until their owners take it (requests 4 and 15). The tmp store banner is the integrator's
(request 2). The finder lists Sign In twice in effect (the title row's "Sign In" and the account
menu's "Sign in", one dialog); a later round can keep the title row's item out of Search the
menus.

Pictures (`build/b3a/push8/`, JPEG): before on 4505, which still served the B3a#7 build
(15:11:57Z, load 21.44 at the start and 30.60 at the end), and after on 4515 (14:43:53Z, load
21.71 to 41.99): File, Insert, Tools with Preferences open, File > Download > More formats and the
Theme panel, at 1440 in both appearances before and after, and at 390 in both appearances
before. I looked at them. Before: the panel reads "Brand kit", File's first row "Presentation",
Insert "Shader", Preferences "Play shaders", More formats "Turboslide bundle (.zip)". After: the
panel "Theme", "New presentation", "Animated pattern", "Play animated patterns", "Turboslide file
(.zip)". Not shot: the 390 "after" set. At 390 my second server drew B3b's working phone editor,
whose Menus key (`toolbar.menus`, `MenusKey.tsx`) folds the menu bar, and the first run's clicks on
the bar timed out; the script learned the key at about 14:55Z, and its rerun never met a load under 24
before I stopped at 18:35Z. The ten failed captures (one blank state) were removed.

The shaders area after the drivers moved: the rerun on 4515 never met a load under 24 between
14:55Z and 18:35Z (the one minute average read 24.95 to 91.50 at its five minute checks) and was not
run. A run of the same drivers on 4505 (the B3a#7 build), 16:55:36Z to 16:59:52Z, load 15.06 at
the start and 40.93 at the end, read `shaders.view.play-setting` passed (its three rows under
Tools > Preferences, Off stored across a reload, the show's Options row mirroring it), so the
failure of that row on 4515 is not the menus'; it read the gallery and the words rows red, as it
must on the old words with the new drivers.

### Commits

| Push | Commit | Paths |
| --- | --- | --- |
| B3a#7 the cuts with their rows and drivers | `d85c7964` | 29 |
| B3a#8 the words and the forbidden list | `9b70d0ae` | 16 |
| B3a#8 seam: this note, the day 0 read and the pictures | the commit that carries this table | `docs/gslides-parity/round1/build/b3a.md`, `build/b3a/**` |

None pushed. Every commit was staged by an explicit path list from `HEAD` plus my hunks under
`.turboslide/git.lock` (`.turboslide/b3a/commit.mjs`), so the other lanes' working hunks in
`core-matrix.json`, `core-matrix.test.mjs`, `README.md`, `chrome.spec.ts` and the walk areas stayed
in the working tree unstaged.

### Left open, for the integrator or a later round

- Requests 2 (the tmp store banner with `EditorRoot.tsx`), 3 (the own chip's "You" and
  "Guest <label>" in the presence surfaces, then the "You" clause of
  `chrome.words.no-process-words`), 4 and 15 (the shader noun in the block's chip, alt and history
  label, the Background row, the palette entry and the show's Options row), 6 (`finder.ts`'s dead
  `tools.assist` terms), 7 (`skills/turboslide-studio/references/assist.md`), 14 (the Check slides
  and Assist sentences).
- B3b's request 3: the hunk is in the working tree (`chrome.mjs`'s cluster step and its row's
  words) for B3b's push 10 to stage; I have no later push, so if push 10 lands without it the
  integrator stages `.turboslide/b3a/b3b-req3.mjs`'s two files with my consent.
- `apps/studio/e2e/deck-transfer.spec.ts` was not run (it needs the file store's fixture deck);
  the check chain's step 21 runs it.
- The 390 "after" pictures of B3a#8 and the shaders area's rerun on the B3a#8 build, both held by
  the load.
