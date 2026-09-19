# Layout shift audit

Base https://turboslide-5sw6p6url-kl01s-projects.vercel.app, deck gt-brand, 22 cells in 191 s, Chromium 147.0.7727.15 (Chrome for Testing 147.0.7727.15, ANGLE Metal, no WebGL), 2026-09-19T16:15:37.082Z.

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
| edit 1280 light notesHidden | 200 | 0.0120 | 1 | 0 | 0 |
| edit 1280 light listClosed | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1280 dark | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1280 dark notesHidden | 200 | 0.0120 | 1 | 0 | 0 |
| edit 1280 dark listClosed | 200 | 0.0000 | 0 | 0 | 0 |
| edit 390 light | 200 | 0.0000 | 0 | 0 | 0 |
| edit 390 dark | 200 | 0.0000 | 0 | 0 | 0 |
| edit 1440 light F | 200 | 0.0005 | 1 | 0 | 0 |
| edit 1440 light I | 200 | 0.0000 | 0 | 0 | 0 |

## Failures

| Cell | Audit id | Why |
| --- | --- | --- |
| edit 1440 light | ? | state panel: entries in 17 frames |
| edit 1440 light notesHidden | E2 | load entry 0.0131 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1440 dark notesHidden | E2 | load entry 0.0131 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1280 light notesHidden | E2 | load entry 0.0120 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1280 dark notesHidden | E2 | load entry 0.0120 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet |
| edit 1440 light F | E3 | load entry 0.0005 from body > div.ts-editor > div.pt-viewer.is-editor > header.ts-title-row > div.ts-title-r / div.ts-editor > div.pt-viewer.is-editor > div.ts-toolbar > div.ts-tb-tail > span.ts-tb-slot / div.pt-slide > section.slide.is-on > div.in > div.center > div.big / div.ts-editor > div.pt-viewer.is-editor > nav.ts-menubar > div.ts-menubar-titles > button.ts-menubar-title / div.ts-editor > div.pt-viewer.is-editor > div.ts-toolbar > div.ts-tb-tail > span.ts-tb-slot |

## Skipped states

- edit 1440 light: filmstrip (enter failed: page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[data-menu-item="view.filmstrip"]')
)
- edit 1440 light: write (enter failed: page.evaluate: RangeError: Unknown action "slide.setNotes"
    at t (https://turboslide-5sw6p6url-kl01s-projects.vercel.app/assets/useStudioSession-XkgTc1yt.js:1:1828)
    at Object.dispatch (https://turboslide-5sw6p6url-kl01s-projects.vercel.app/assets/useStudioSession-XkgTc1yt.js:1:2028)
    at bt (https://turboslide-5sw6p6url-kl01s-projects.vercel.app/assets/EditorRoot-DFwEbufU.js:25:27820)
    at Object.<anonymous> (https://turboslide-5sw6p6url-kl01s-projects.vercel.app/assets/useStudioSession-XkgTc1yt.js:1:2693)
    at tt (https://turboslide-5sw6p6url-kl01s-projects.vercel.app/assets/useStudioSession-XkgTc1yt.js:1:8927)
    at Object.invoke (https://turboslide-5sw6p6url-kl01s-projects.vercel.app/assets/useStudioSession-XkgTc1yt.js:1:11405)
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
