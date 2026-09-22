# Layout shift audit

Base https://turboslide-bkwnt59my-kl01s-projects.vercel.app, deck gt-brand, 22 cells in 182 s, Chromium 147.0.7727.15 (Chrome for Testing 147.0.7727.15, ANGLE Metal, no WebGL), 2026-09-22T02:14:31.690Z.

| Cell | Status | Load CLS | Load entries | States run | States skipped |
| --- | --- | --- | --- | --- | --- |
| new 1440 light | 200 | 0.0000 | 0 | 1 | 0 |
| new 1440 dark | 200 | 0.0000 | 0 | 0 | 0 |
| new 1280 light | 200 | 0.0000 | 0 | 0 | 0 |
| new 1280 dark | 200 | 0.0000 | 0 | 0 | 0 |
| new 390 light | 200 | 0.0000 | 0 | 0 | 0 |
| new 390 dark | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1440 light | 200 | 0.0000 | 0 | 8 | 10 |
| edit 1440 light notesHidden | 200 | 0.0131 | 1 | 0 | 0 |
| edit 1440 light listClosed | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1440 dark | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1440 dark notesHidden | 200 | 0.0131 | 1 | 0 | 0 |
| edit 1440 dark listClosed | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1280 light | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1280 light notesHidden | 200 | 0.0139 | 2 | 0 | 0 |
| edit 1280 light listClosed | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1280 dark | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1280 dark notesHidden | 200 | 0.0139 | 1 | 0 | 0 |
| edit 1280 dark listClosed | 200 | 0.0000 | 0 | 0 | 0 |
| edit 390 light | 200 | 0.0000 | 0 | 0 | 0 |
| edit 390 dark | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1440 light F | 200 | 0.0006 | 1 | 0 | 0 |
| edit 1440 light I | 200 | 0.0001 | 1 | 0 | 0 |

## Failures

| Cell | Audit id | Why |
| --- | --- | --- |
| edit 1440 light | ? | state panel: entries in 17 frames |
| edit 1440 light notesHidden | E2 | load entry 0.0131 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1440 dark notesHidden | E2 | load entry 0.0131 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1280 light notesHidden | E2 | load entry 0.0139 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1280 light notesHidden | P1 | load entry 0.0000 from header.ts-title-row > div.ts-title-r > div.ts-presence.ts-presence > button.ts-presence-slot.ts-presence-chip > span.ts-chip.is-live / div.ts-film.pt-scroll > div.ts-card.is-current.is-selected > span.ts-card-frame > span.ts-card-marks > span.ts-chip.is-live |
| edit 1280 dark notesHidden | E2 | load entry 0.0139 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1440 light F | E3 | load entry 0.0006 from body > div.ts-editor > div.pt-viewer.is-editor > header.ts-title-row > div.ts-title-r / div.ts-editor > div.pt-viewer.is-editor > div.ts-toolbar > div.ts-tb-tail > span.ts-tb-slot / div.pt-slide > section.slide.is-on > div.in > div.center > div.big / div.ts-editor > div.pt-viewer.is-editor > nav.ts-menubar > div.ts-menubar-titles > button.ts-menubar-title / div.ts-editor > div.pt-viewer.is-editor > div.ts-toolbar > div.ts-tb-tail > span.ts-tb-slot |
| edit 1440 light I | G1 | load entry 0.0001 from body > div.pt-viewer.is-editor.ts-skeleton > nav.ts-menubar.ts-skeleton-row > div.ts-menubar-titles > span.ts-skeleton-menu / body > div.pt-viewer.is-editor.ts-skeleton > nav.ts-menubar.ts-skeleton-row > div.ts-menubar-titles > span.ts-skeleton-menu / body > div.pt-viewer.is-editor.ts-skeleton > nav.ts-menubar.ts-skeleton-row > div.ts-menubar-titles > span.ts-skeleton-menu / body > div.pt-viewer.is-editor.ts-skeleton > nav.ts-menubar.ts-skeleton-row > div.ts-menubar-titles > span.ts-skeleton-menu / body > div.pt-viewer.is-editor.ts-skeleton > nav.ts-menubar.ts-skeleton-row > div.ts-menubar-titles > span.ts-skeleton-menu |

## Skipped states

- edit 1440 light: filmstrip (enter failed: page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[data-menu-item="view.filmstrip"]')
)
- edit 1440 light: write (enter failed: page.evaluate: RangeError: Unknown action "slide.setNotes"
    at t (https://turboslide-bkwnt59my-kl01s-projects.vercel.app/assets/SlideList-s-9hN-vf.js:1:1107)
    at Object.dispatch (https://turboslide-bkwnt59my-kl01s-projects.vercel.app/assets/SlideList-s-9hN-vf.js:1:1307)
    at Rt (https://turboslide-bkwnt59my-kl01s-projects.vercel.app/assets/EditorRoot-BV8EQdXa.js:24:33109)
    at Object.<anonymous> (https://turboslide-bkwnt59my-kl01s-projects.vercel.app/assets/SlideList-s-9hN-vf.js:1:1972)
    at nt (https://turboslide-bkwnt59my-kl01s-projects.vercel.app/assets/SlideList-s-9hN-vf.js:1:8148)
    at Object.invoke (https://turboslide-bkwnt59my-kl01s-projects.vercel.app/assets/SlideList-s-9hN-vf.js:1:10090)
    at eval (eval at evaluate (:311:30), <anonymous>:7:22)
    at async <anonymous>:337:30)
- edit 1440 light: ditherDrag (control absent: [data-control="formatOptions.dither.black.slider"])
- edit 1440 light: share (control absent: [data-control="title.share"])
- edit 1440 light: inbox (control absent: [data-control="title.inbox"])
- edit 1440 light: signIn (control absent: [data-control="title.account"])
- edit 1440 light: profile (control absent: [data-control="title.account"])
- edit 1440 light: avatarBuilder (control absent: [data-control="title.account"])
- edit 1440 light: follow (control absent: [data-control="title.presence.more"])
- edit 1440 light: join20 (enter failed: page.evaluate: Error: skip:no presence simulation hook (window.__tsPresenceSimulate)
    at eval (eval at evaluate (:311:30), <anonymous>:4:17)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44))
