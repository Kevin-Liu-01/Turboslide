# Core gate matrix

Base https://turboslide-lav4xmwv1-kl01s-projects.vercel.app, started 2026-09-30T11:03:12.248Z, 3127 s. 46 rows judged: 6 passed, 39 failed, 1 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): charts, inbox, assist, logos, shaders; rows whose own controls a ship would keep parked: view.live-pointers.second-browser (view.livePointers.mine, view.livePointers.collaborators); decks.file.open-upload-bundle (file.open); decks.file.import-slides-bundle (file.importSlides); export.zip.bundle (file.download.zip); templates.gallery.page (home.gallery, file.new.templateGallery); templates.save.as-template (file.saveAsTemplate); templates.card.rename-and-delete (templates.card.menu); logos.picker.recents (dialog.logo.group.recent); svg.render.vector-at-zoom (intake.svg.upload, intake.svg.paste, intake.svg.drop, intake.svg.url); svg.render.picture-gestures (intake.svg.upload, intake.svg.paste, intake.svg.drop, intake.svg.url); svg.copy.markup (picture.svg.copy); collab.follow.anonymous-editor (title.presence.follow); rows of an unparkable feature blocking the ship: decks.trash.restore, decks.trash.delete-forever-button, decks.card.download, share.dialog.open, share.dialog.more-row, share.name-prompt.first-share, decks.trash.button-heights, sync.structural.concurrent, sync.block.offline-replay-converges, shaders.export.pdf-frame, decks.recent.keeps-new-deck, export.refusal.sentence-and-retry, export.print.opens, present.bar.no-dead-control, decks.polish.pages-sweep, sync.reject.sentence-below-toolbar, share.name-prompt.never-mid-drag, decks.thumbnail.never-502.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `decks.list.open-title` | decks | core/decks.spec.ts | works | passed |  |
| `decks.trash.restore` | decks | core/decks.spec.ts | works | failed | [31mTest timeout of 90000ms exceeded.[39m |
| `decks.trash.delete-forever-button` | decks | core/decks.spec.ts | works | failed | TimeoutError: locator.waitFor: Timeout 30000ms exceeded. |
| `decks.card.download` | decks | core/decks.spec.ts | works | failed | Error: the card menu mints the bundle ticket and starts the download (the server functions answered: 200 {"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":1,"s":"null"},{"t":2,"s":1},{"t":11,"i":1,"p":{"k":[],"v":[]},"o":0}]},"o":0} \| 200 {"t":10,"i":0,"p":{"k":["result","error","contex |
| `share.dialog.open` | share | core/share.spec.ts | works | failed | [31mTest timeout of 60000ms exceeded.[39m |
| `share.copy-view-link` | share | core/share.spec.ts | works | passed |  |
| `charts.export.pdf` | charts | core/export.spec.ts | not driven | failed | Error: North is in the PDF text |
| `view.live-pointers.second-browser` | view | core/share.spec.ts | not driven | failed | Error: the second browser's pointer is drawn on the first within 10 s |
| `decks.file.open-upload-bundle` | decks | core/decks.spec.ts | works | failed | Error: the bundle opens as a new deck at /edit/<id> |
| `decks.file.import-slides-bundle` | decks | core/decks.spec.ts | works | failed | TimeoutError: page.waitForFunction: Timeout 90000ms exceeded. |
| `export.zip.bundle` | export | core/export.spec.ts | works | failed | Error: the snackbar names the bundle |
| `inbox.notification-arrives` | inbox | core/share.spec.ts | not driven | failed | Error: the first browser's bell shows a count of 1 within 10 s |
| `share.dialog.more-row` | share | core/chrome.spec.ts | broken | failed | TimeoutError: page.waitForFunction: Timeout 90000ms exceeded. |
| `share.name-prompt.first-share` | share | core/share.spec.ts | not driven | failed | Error: the name shows on the presence chip in the second browser within 35 s |
| `decks.trash.button-heights` | decks | core/decks.spec.ts | broken | failed | Error: Empty trash is the page's one solid button |
| `templates.gallery.page` | templates | core/decks.spec.ts | broken | failed | TimeoutError: browserContext.waitForEvent: Timeout 20000ms exceeded while waiting for event "page" |
| `templates.save.as-template` | templates | core/brand.spec.ts | not driven | failed | Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed |
| `templates.save.same-name-replaces` | templates | core/brand.spec.ts | not driven | passed |  |
| `templates.card.rename-and-delete` | templates | core/brand.spec.ts | not driven | failed | Error: the card reads the new name |
| `brand.colors.collab-rerender` | brand | core/share.spec.ts | not driven | passed |  |
| `assist.viewer.disabled` | assist | core/share.spec.ts | not driven | failed | Error: the viewer sees the disabled panel with its sentence |
| `sync.structural.concurrent` | sync | core/sync.spec.ts | not driven | failed | Error: the loser's reject card is shown |
| `sync.block.offline-replay-converges` | sync | core/sync.spec.ts | works | failed | Error: A's resend carries the offset shifted past B's words |
| `logos.picker.recents` | logos | core/logos.spec.ts | not driven | failed | Error: the Recent group lists the two inserts |
| `shaders.frame.reuse-and-prune` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.export.pdf-frame` | export | core/export.spec.ts | broken | failed | Error: the image's aspect is the box's |
| `svg.render.vector-at-zoom` | svg | core/svg.spec.ts | not driven | failed | TimeoutError: page.waitForFunction: Timeout 90000ms exceeded. |
| `svg.render.picture-gestures` | svg | core/svg.spec.ts | not driven | failed | Error: every gesture writes, draws and undoes (move 400,200 -> 480,240 (true); se with Shift 360x240 -> 450x300 (aspect 1.500 -> 1.500, true); rotate 15 (true); mask ellipse drawn ellipse clip path("M 0 120 A 180 120 0 0 1 180 0 A 18 (true); border weight {"weight":2} drawn 2px (true); shadow {"colo |
| `svg.copy.markup` | svg | core/svg.spec.ts | not driven | failed | Error: text/plain begins with the prolog or <svg |
| `shaders.frame.large-png-lands` | shaders | core/shaders.spec.ts | broken | failed | Error: page.screenshot: Clipped area is either empty or outside the resulting image |
| `logos.dialog.results-in-view` | logos | core/logos.spec.ts | broken | failed | Error: the dialog's height does not change |
| `logos.dialog.sentence-case-whole-names` | logos | core/logos.spec.ts | broken | failed | Error: the preselected tile carries is-active |
| `shaders.gallery.words-and-head` | shaders | core/shaders.spec.ts | broken | failed | Error: the section head's name and Change 8 px apart or more |
| `shaders.insert.free-rectangle` | shaders | core/shaders.spec.ts | broken | failed | Error: the content box on an empty slide |
| `decks.recent.keeps-new-deck` | decks | core/decks.spec.ts | broken | failed | Error: File > Open lists it |
| `export.refusal.sentence-and-retry` | export | core/export.spec.ts | broken | failed | Error: after two 429s no file |
| `export.print.opens` | export | core/export.spec.ts | broken | failed | Error: the checked box shows the chrome's tick |
| `present.bar.no-dead-control` | present | core/present.spec.ts | broken | failed | Error: every control's click changes the state |
| `decks.polish.pages-sweep` | decks | core/decks.spec.ts | broken | not driven | skipped |
| `sync.reject.sentence-below-toolbar` | sync | core/sync.spec.ts | broken | failed | Error: one snackbar sentence |
| `share.name-prompt.never-mid-drag` | share | core/share.spec.ts | broken | failed | Error: never over the sheet |
| `collab.follow.anonymous-editor` | share | core/share.spec.ts | not driven | failed | Error: the roster lists Follow for an anonymous editor |
| `collab.presence.join-within-2s` | share | core/share.spec.ts | broken | passed |  |
| `decks.thumbnail.never-502` | decks | core/decks.spec.ts | broken | failed | [31m"beforeAll" hook timeout of 60000ms exceeded.[39m |
| `assist.panel.words-and-layout` | assist | core/assist.spec.ts | broken | failed | Error: one line under the composer |
| `assist.polish.agent-sweep` | assist | core/assist.spec.ts | broken | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m |

## Not driven rows, by id and reason

- `decks.polish.pages-sweep`: skipped

## Failed rows, by id and reason

- `decks.trash.restore`: [31mTest timeout of 90000ms exceeded.[39m
- `decks.trash.delete-forever-button`: TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
- `decks.card.download`: Error: the card menu mints the bundle ticket and starts the download (the server functions answered: 200 {"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":1,"s":"null"},{"t":2,"s":1},{"t":11,"i":1,"p":{"k":[],"v":[]},"o":0}]},"o":0} \| 200 {"t":10,"i":0,"p":{"k":["result","error","contex
- `share.dialog.open`: [31mTest timeout of 60000ms exceeded.[39m
- `charts.export.pdf`: Error: North is in the PDF text
- `view.live-pointers.second-browser`: Error: the second browser's pointer is drawn on the first within 10 s
- `decks.file.open-upload-bundle`: Error: the bundle opens as a new deck at /edit/<id>
- `decks.file.import-slides-bundle`: TimeoutError: page.waitForFunction: Timeout 90000ms exceeded.
- `export.zip.bundle`: Error: the snackbar names the bundle
- `inbox.notification-arrives`: Error: the first browser's bell shows a count of 1 within 10 s
- `share.dialog.more-row`: TimeoutError: page.waitForFunction: Timeout 90000ms exceeded.
- `share.name-prompt.first-share`: Error: the name shows on the presence chip in the second browser within 35 s
- `decks.trash.button-heights`: Error: Empty trash is the page's one solid button
- `templates.gallery.page`: TimeoutError: browserContext.waitForEvent: Timeout 20000ms exceeded while waiting for event "page"
- `templates.save.as-template`: Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed
- `templates.card.rename-and-delete`: Error: the card reads the new name
- `assist.viewer.disabled`: Error: the viewer sees the disabled panel with its sentence
- `sync.structural.concurrent`: Error: the loser's reject card is shown
- `sync.block.offline-replay-converges`: Error: A's resend carries the offset shifted past B's words
- `logos.picker.recents`: Error: the Recent group lists the two inserts
- `shaders.export.pdf-frame`: Error: the image's aspect is the box's
- `svg.render.vector-at-zoom`: TimeoutError: page.waitForFunction: Timeout 90000ms exceeded.
- `svg.render.picture-gestures`: Error: every gesture writes, draws and undoes (move 400,200 -> 480,240 (true); se with Shift 360x240 -> 450x300 (aspect 1.500 -> 1.500, true); rotate 15 (true); mask ellipse drawn ellipse clip path("M 0 120 A 180 120 0 0 1 180 0 A 18 (true); border weight {"weight":2} drawn 2px (true); shadow {"colo
- `svg.copy.markup`: Error: text/plain begins with the prolog or <svg
- `shaders.frame.large-png-lands`: Error: page.screenshot: Clipped area is either empty or outside the resulting image
- `logos.dialog.results-in-view`: Error: the dialog's height does not change
- `logos.dialog.sentence-case-whole-names`: Error: the preselected tile carries is-active
- `shaders.gallery.words-and-head`: Error: the section head's name and Change 8 px apart or more
- `shaders.insert.free-rectangle`: Error: the content box on an empty slide
- `decks.recent.keeps-new-deck`: Error: File > Open lists it
- `export.refusal.sentence-and-retry`: Error: after two 429s no file
- `export.print.opens`: Error: the checked box shows the chrome's tick
- `present.bar.no-dead-control`: Error: every control's click changes the state
- `sync.reject.sentence-below-toolbar`: Error: one snackbar sentence
- `share.name-prompt.never-mid-drag`: Error: never over the sheet
- `collab.follow.anonymous-editor`: Error: the roster lists Follow for an anonymous editor
- `decks.thumbnail.never-502`: [31m"beforeAll" hook timeout of 60000ms exceeded.[39m
- `assist.panel.words-and-layout`: Error: one line under the composer
- `assist.polish.agent-sweep`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

