# Layout shift audit

Base http://localhost:4344, deck gt-brand, 22 cells in 164 s, Chromium 147.0.7727.15 (Chrome for Testing 147.0.7727.15, ANGLE Metal, no WebGL), 2026-09-20T16:31:33.177Z.

| Cell                        | Status | Load CLS | Load entries | States run | States skipped |
| --------------------------- | ------ | -------- | ------------ | ---------- | -------------- |
| new 1440 light              | 200    | 0.0000   | 0            | 1          | 0              |
| new 1440 dark               | 200    | 0.0000   | 0            | 0          | 0              |
| new 1280 light              | 200    | 0.0000   | 0            | 0          | 0              |
| new 1280 dark               | 200    | 0.0000   | 0            | 0          | 0              |
| new 390 light               | 200    | 0.0000   | 0            | 0          | 0              |
| new 390 dark                | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1440 light             | 200    | 0.0000   | 0            | 8          | 10             |
| edit 1440 light notesHidden | 200    | 0.0130   | 1            | 0          | 0              |
| edit 1440 light listClosed  | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1440 dark              | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1440 dark notesHidden  | 200    | 0.0130   | 1            | 0          | 0              |
| edit 1440 dark listClosed   | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1280 light             | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1280 light notesHidden | 200    | 0.0137   | 1            | 0          | 0              |
| edit 1280 light listClosed  | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1280 dark              | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1280 dark notesHidden  | 200    | 0.0137   | 1            | 0          | 0              |
| edit 1280 dark listClosed   | 200    | 0.0000   | 0            | 0          | 0              |
| edit 390 light              | 200    | 0.0000   | 0            | 0          | 0              |
| edit 390 dark               | 200    | 0.0000   | 0            | 0          | 0              |
| edit 1440 light F           | 200    | 0.0006   | 1            | 0          | 0              |
| edit 1440 light I           | 200    | 0.0000   | 0            | 0          | 0              |

## Failures

| Cell                        | Audit id | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| edit 1440 light             | ?        | state panel: entries in 17 frames                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| edit 1440 light notesHidden | E2       | load entry 0.0130 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet                                                                                                                                                                                                                                                                                                                                                           |
| edit 1440 dark notesHidden  | E2       | load entry 0.0130 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet                                                                                                                                                                                                                                                                                                                                                           |
| edit 1280 light notesHidden | E2       | load entry 0.0137 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet                                                                                                                                                                                                                                                                                                                                                           |
| edit 1280 dark notesHidden  | E2       | load entry 0.0137 from section.pt-main > div.pt-stagewrap > div.ts-stagewrap.ts-sheet.ts-editor > div.pt-sheet-stage > div.sheet                                                                                                                                                                                                                                                                                                                                                           |
| edit 1440 light F           | E3       | load entry 0.0006 from body > div.ts-editor > div.pt-viewer.is-editor > header.ts-title-row > div.ts-title-r / div.ts-editor > div.pt-viewer.is-editor > div.ts-toolbar > div.ts-tb-tail > span.ts-tb-slot / div.pt-slide > section.slide.is-on > div.in > div.center > div.big / div.ts-editor > div.pt-viewer.is-editor > nav.ts-menubar > div.ts-menubar-titles > button.ts-menubar-title / div.ts-editor > div.pt-viewer.is-editor > div.ts-toolbar > div.ts-tb-tail > span.ts-tb-slot |

## Skipped states

- edit 1440 light: filmstrip (enter failed: page.click: Timeout 30000ms exceeded.
  Call log:
  - waiting for locator('[data-menu-item="view.filmstrip"]')
    )
- edit 1440 light: write (enter failed: page.evaluate: RangeError: Unknown action "slide.setNotes"
  at t (http://localhost:4344/assets/useStudioSession-Dmgkcxzu.js:1:1930)
  at Object.dispatch (http://localhost:4344/assets/useStudioSession-Dmgkcxzu.js:1:2130)
  at Mt (http://localhost:4344/assets/EditorRoot-D0tHWmjt.js:25:31953)
  at Object.<anonymous> (http://localhost:4344/assets/useStudioSession-Dmgkcxzu.js:1:2795)
  at ot (http://localhost:4344/assets/useStudioSession-Dmgkcxzu.js:1:9029)
  at Object.invoke (http://localhost:4344/assets/useStudioSession-Dmgkcxzu.js:1:11507)
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
