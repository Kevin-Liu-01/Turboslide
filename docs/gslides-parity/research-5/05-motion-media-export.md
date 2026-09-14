# Motion, media and equations in the exports

Report 05 of the Turboslide round five research set, written 2026-09-14 against commit d5d7f07 on `main` (the working tree carries round four's uncommitted edits, which this report does not read; every repository fact below comes from `git show d5d7f07:<path>`) and the production deployment at https://turboslide.vercel.app. It answers one question for the motion, media and equation areas of round five (Kevin: "it has all the features and exact behaviors of google slides", "mimic it perfectly"): how the Editable text PPTX export gains slide transitions, object animations, audio, video and equations, what the Perfect, PDF and HTML exports do with them, and what the render worker container can prove. It reads `packages/export/src/pptx/**`, `packages/export/src/ooxml/**`, `packages/export/src/pdf/build.ts`, `packages/render/src/standalone.ts`, `packages/viewer/standalone/runtime.ts` and the installed pptxgenjs 4.0.1. It does not design the editing surface (the Motion panel, the media insert dialogs, the equation editor); reports 02 and 06 of this set and the design set own those, and section 3 states only the fields the exporters read.

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings. No Google or Microsoft artwork is reproduced or proposed. Every web source was read on 2026-09-14 and the Sources section gives the URL. Source keys: P for a primary page (a specification, a vendor's own documentation, a vendor's own source code), T for a third party page, L for a file in this repository at d5d7f07, R for a report of an earlier research set, M for a fact read off the installed pptxgenjs 4.0.1 code on this machine (`node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs/dist/pptxgen.cjs.js`, line numbers from that file).

## How to read this report

- A statement with a P key is documented by the vendor or the standards body. A statement with a T key alone is a third party account and is marked "single source" or "corroborated". "Unverified" means the statement follows from product knowledge or from a page that could not be fetched, and every unverified statement is repeated in section 13.
- "The post process" is the jszip pass over the pptxgenjs buffer in `pptx/build.ts` (L2) and the rewrite modules under `ooxml/` (L3 to L8). "Editable text" is the native mode, "Perfect" the flatten mode (L15). "The render worker container" is the Docker image of `docker/render-worker.Dockerfile` with LibreOffice 25.2 and poppler (L13, L14).
- "Google's list" for transitions is None, Dissolve, Fade, Slide from right, Slide from left, Flip, Cube, Gallery, and for animations Appear, Disappear, Fade in, Fade out, Fly in from left, right, bottom, top, Fly out to left, right, bottom, top, Zoom in, Zoom out, Spin. Both lists come from third parties collected in R05 (rows "Transition names" and "Animation names"); Google's own page names no transition or animation (P1). The start conditions "On click", "After previous" and "With previous", the "By paragraph" checkbox, the speed slider and the Play button are on Google's page (P1).
- XML fragments give the elements the post process writes. Attribute values in angle brackets are placeholders. Prefixes: `p` PresentationML, `a` DrawingML, `r` relationships, `p14` `http://schemas.microsoft.com/office/powerpoint/2010/main`, `a14` `http://schemas.microsoft.com/office/drawing/2010/main`, `mc` `http://schemas.openxmlformats.org/markup-compatibility/2006`, `m` `http://schemas.openxmlformats.org/officeDocument/2006/math`.

## Summary

1. pptxgenjs 4.0.1 writes no `p:transition` and no `p:timing` anywhere (M1: a search of the built library finds neither element), so every transition and animation of the Editable text file comes from the post process, inserted between `</p:clrMapOvr>` and `</p:sld>` of each slide part. The library's one request for transitions (issue 823, 2020) was closed as a question (P13). Its `addMedia` writes an `a:videoFile` reference for audio as well as video (M1 lines 5622 to 5623), gives the media picture a `cNvPr id` derived from a relationship id rather than a shape counter (M1 lines 5602 and 5620), declares `audio/mp3` as the content type of an mp3 (M1 lines 6340 to 6345), and ships a default play button poster (M1 line 617). Section 7 therefore writes media through the post process as well: the builder places the poster as a named picture, and the post process turns that `p:pic` into a media picture with the right file reference, the `p14:media` extension, the two relationships and a stored media part.
2. Every Google transition has an OOXML form (section 5). Dissolve, Fade, Slide from right and Slide from left are ECMA 376 elements (`p:dissolve`, `p:fade`, `p:push dir="l"`, `p:push dir="r"`; P4, P5). Flip, Cube and Gallery are PowerPoint 2010 elements in the `p14` namespace (`p14:flip`, `p14:prism`, `p14:gallery`; P8, P9) and travel inside `mc:AlternateContent` with a `p:fade` fallback, which is also where the millisecond duration goes (`p14:dur`). LibreOffice reads every ECMA transition and the `p14` vortex, ripple, glitter, honeycomb, flash and prism elements, and has no handler for flip or gallery (P14), so those two depend on the fallback branch.
3. Every Google animation is a PowerPoint preset with a known id (section 6): Appear and Disappear are preset 1 (entrance, exit), Fly in and Fly out preset 2 with subtypes 1 top, 2 right, 4 bottom, 8 left, Fade in and Fade out preset 10, Zoom in and Zoom out preset 23, Spin emphasis preset 8. LibreOffice's own import table maps exactly these numbers to its preset names (P15), which is the machine check of section 10. On click, After previous and With previous are the `nodeType` values `clickEffect`, `afterEffect` and `withEffect` (P6, P15, P18). By paragraph is `p:bldP build="p"` plus one effect per paragraph targeting `p:txEl/p:pRg`.
4. Audio and video are a `p:pic` whose `p:nvPr` carries `a:audioFile` or `a:videoFile` (`r:link` to the media part) and a `p14:media` extension (`r:embed` to the same part), a poster blip, and a `p:audio` or `p:video` node in the timing tree whose `p:cMediaNode` carries volume, mute, `showWhenStopped` (Google's Hide icon when presenting) and `numSld`, with `repeatCount="indefinite"` for Loop and `p14:trim` for Start at and End at (P7, P8, P10, P16). YouTube travels as pptxgenjs's `online` form: an external video relationship plus a poster, viewable in Microsoft 365 and not in LibreOffice (P3, M1).
5. Equations follow report 06: the Editable text file carries an `mc:AlternateContent` shape whose Choice holds `a14:m` with OMML and whose Fallback holds the block's PNG (P11, R06 sections 5.2 and 8.2). This report adds the placement rules for that wrapper inside the post process (it is a third element kind the shape regex must match) and the verification stance.
6. The stills never carry motion. The Perfect page raster, the PDF page and the JPEG show the slide as the editor shows it, every object at rest, whatever its animations: an object with an entrance animation is present, an object with an exit animation is present. Google's PDF download is widely described as behaving the same way and PowerPoint's print does; neither is confirmed on a vendor page (section 9, unverified). The alternative, the state after the last animation, was rejected because a Disappear would empty a page.
7. The HTML export and present mode share one compiled schedule and one CSS text (section 9): a pure function turns a slide's transition and animation list into steps, and the React present layer and the standalone runtime both drive the same `data-step` attribute and the same generated keyframes, so the timing is identical by construction. The standalone runtime is frozen (L12 header); it gains one optional hook rather than a port of the present layer. An autoplay option runs the step advance on a timer.
8. Verification in the container (section 10) has three legs: an XML read back in `export check` (counts of transitions, timing nodes, media references, `a14:m`), a LibreOffice round trip to ODP whose `content.xml` names the transition types, the preset ids, the node types and the media links LibreOffice parsed (the PDF that the verify loop renders cannot show motion), and the existing still gate unchanged. PowerPoint stays the manual checklist.
9. Size caps (section 8): the studio's presigned upload path already exists for pictures over 3 MB with a 25 MB anonymous and 50 MB account cap (L21); media reuses it with its own quota rows. PowerPoint documents no size limit for embedded media and recommends mp4 with H.264 and AAC, and m4a for audio (P12). The PPTX assembly must not pass media through base64 strings; the post process writes the bytes into the zip as stored parts, the way `writePackage` already stores `ppt/media/` (L6).

## 1 What main holds today

| Item | State at d5d7f07 | Hook for round five | Evidence |
| --- | --- | --- | --- |
| Export entry | `exportPptx` extracts scenes per theme, builds one file per theme through `buildPptx`, runs the OOXML post process and the package validation, writes `export-report-<theme>.json` and the merged report; `verify` runs the LibreOffice loop inside the export and rebuilds a table as ruled rows when a cell misses 3 px | the scene gains `transition`, `animations` and `media` records; the report gains counts and residual lines | L1 |
| Builder | pptxgenjs `addSlide`, `addText`, `addImage`, `addShape`, `addTable`, `addChart`, `addNotes`; every object named `ts:<slide>#<block>[@group keys]` through `objectName`; a per slide `rewrites` record (connectors, adjust values, columns, alt texts) applied after `pptx.write` by object name | a fifth and sixth rewrite list (media, equations) and two slide level records (transition, timing) | L2 |
| Post process order | `stripRepairRisks` (kern, empty extLst), adjust values, columns, connectors, alt text, `groupShapes`, `setSlideName`, `addHiddenTitle`, then `cleanContentTypes`, `setAppTitles`, `embedFonts`, `validatePackage`, `readGeometry`, `writePackage` | media and equation rewrites before grouping (they change the element a group must wrap); transition and timing after `addHiddenTitle` (they need every shape id final) | L2, L3, L4, L8 |
| Shape addressing | `listShapes` matches top level `p:sp`, `p:pic`, `p:graphicFrame`, `p:cxnSp` with id, name, offset and extent; `toConnector` resolves a target name to its id with a group suffix tolerance | `spTgt spid` for animations and media nodes resolves the same way; the regex must also match `mc:AlternateContent` (equation wrappers) so grouping and addressing keep working | L3, L4 |
| Validation | Open Packaging walk: every part typed, every override present, every relationship resolving, ids unique per rels part | unchanged; the new relationships (`relationships/audio`, `relationships/video`, `http://schemas.microsoft.com/office/2007/relationships/media`) and parts pass the same walk; an external YouTube target is skipped as `TargetMode="External"` already is | L7 |
| Zip writing | `ppt/media/` and `ppt/fonts/` stored, XML deflated, DOS epoch dates | media parts land under `ppt/media/` and are stored without deflate at no code change | L6 |
| Content types | overrides for missing parts removed, `image/jpg` corrected to `image/jpeg` | `audio/mp3` corrected to `audio/mpeg`; defaults added for `m4a`, `wav`, `webm`, `mp3` when the package holds one | L5 |
| Perfect mode | the text layer at alpha 0, the 2x sheet raster as a full page picture at a 0.01 mm offset, hyperlink hit rectangles above it | the sheet raster already shows a media poster and an equation as Chromium drew them; nothing else is added (section 9) | L2, L9 |
| PDF | the print document through Chromium `page.pdf`, the poppler gate against the 2x render | unchanged; the print document never applies present mode state | L10 |
| HTML | `renderStandalone` inlines assets by rule under a 16 MB budget and appends the frozen standalone runtime; `#ts-notes` JSON when notes travel | a `#ts-motion` JSON and a motion script (section 9) | L11, L12 |
| Document | `SlideBase` has `notes`, `skip`, `template`, `background`, `grammar`, `ext`; no transition, animation or media field anywhere in `packages/schema` | the fields of section 3 | L16 |
| Menus | `slide.transition` is a Later row ("The GT theme presents still slides"), `insert.audio` and `insert.video` are Later rows ("Link to a recording instead"), `view.motion` and `insert.animation` are Omit rows pointing at SPEC decision 0.5 | every one becomes Now | L17, SPEC 0.5 |
| Deferrals | SPEC-2 12 lists "Transition, Motion, Animation, Animate" with the design note "`SlideBase.transition`, `Block.animation`; the present runtime" and "Audio, Video" with "a `media` block with an asset kind"; SPEC-3 17 and SPEC-4 7 carry them forward | this report follows those two notes | L20 |

### 1.1 What pptxgenjs 4.0.1 does and does not write

Read from the installed library (M1). These are the facts the post process design rests on.

| Fact | Where | Consequence |
| --- | --- | --- |
| No `p:transition`, no `p:timing`, no `xmlns:mc` on the slide root; the slide root declares `a`, `r` and `p` only | a search of the library for `p:timing` finds nothing; the `p:sld` root string at line 6496 | the post process writes both elements and declares the `mc` and `p14` prefixes on the root (or inline on the elements it inserts) |
| `addMedia` accepts `type` audio, video or online, `data` or `path`, `link` for online, `cover` as a data URI, `extn` | lines 2062 to 2171; documented at P3 with the supported formats "mpg, mov, mp4, m4v" and "mp3, wav" | the API exists but section 7 does not use it for embedded media |
| Audio and video both get `<a:videoFile r:link="rIdN"/>` in `p:nvPr`; there is no `a:audioFile` branch | lines 5620 to 5623 | an mp3 written through `addMedia` is a video object to PowerPoint; the relationship type is right (`relationships/audio`, line 5767) but the shape says video |
| The media picture's `cNvPr id` is `mediaRid + 2`, a relationship id, while every other shape's id is its index plus 2 | lines 5602 and 5620 versus the shape writer | ids can collide on a slide with several relationships; PowerPoint's repair pass is a known reaction to duplicate ids (unverified for this case) and `listShapes` addresses by name, so the post process renumbers |
| The `p14:media` extension is written for embedded media with `r:embed` to the second relationship; the online form writes none | lines 5622 to 5626 and 5605 | matches what PowerPoint 2010 and later write; kept in section 7 |
| Each embedded media adds two relationships to one target, `relationships/video` or `relationships/audio` and `http://schemas.microsoft.com/office/2007/relationships/media`, then a third for the poster image | lines 2137 to 2170, 5755 to 5790 | the post process writes the same three |
| Content types: `m4v` and `mp4` are hard coded as `video/mp4`; any other extension gets `<Default Extension="<extn>" ContentType="<type>/<extn>"/>`, so an mp3 becomes `audio/mp3` and a wav `audio/wav` | lines 6338 to 6346 | `cleanContentTypes` gains the `audio/mp3` to `audio/mpeg` correction; PowerPoint writes `audio/mpeg` for mp3 (unverified against a saved file; `audio/mpeg` is the registered type) |
| The default poster is a built in play button PNG | line 617, `IMG_PLAYBTN` | never used; the poster is Turboslide's own frame (section 7.3) |
| The online form writes `<a:videoFile r:link>` to an external relationship (`TargetMode="External"`) plus a poster blip and no `p14:media` | lines 5598 to 5615, 5785 | kept for YouTube; the documentation states it opens in Microsoft 365 and may error in older desktop versions (P3) |
| `descr` is written for pictures and charts only | as round two found (L3 header) | the media picture's alt text goes through `writeAltText` like every shape |
| No OMML, no `a14:m`, no `mc:AlternateContent` anywhere | search of the library | report 06's wrapper is written by the post process |

## 2 Google's motion model as the reference

The facts the export must reproduce, with their sources.

| Item | Google | Source |
| --- | --- | --- |
| Where transitions live | Slide > Transition opens the Motion panel; "Under 'Slide Transition,' choose a transition from the dropdown menu"; a slider adjusts the speed | P1 |
| Transition names | None, Dissolve, Fade, Slide from right, Slide from left, Flip, Cube, Gallery | R05 row "Transition names" (third parties; Google's page prints none), R03 row "Transition types" |
| Apply to all slides | A button in the Slide Transition section that copies the transition to every slide | R05 (third parties, corroborated); not on Google's page (unverified) |
| Where animations live | Insert > Animation or View > Motion; "Under 'Object Animations,' choose an animation type"; the default is "Appear (On click)" | P1 |
| Animation names | Appear, Disappear, Fade in, Fade out, Fly in from left, right, bottom, top, Fly out to left, right, bottom, top, Zoom in, Zoom out, Spin | R05 row "Animation names" (third parties; Google's page prints none) |
| Start conditions | "On click" (a mouse click or the space bar), "After previous" (starts when the prior animation ends), "With previous" (starts with the prior animation) | P1 |
| By paragraph | A checkbox for lists, "animating lists line by line" | P1 |
| Speed | A draggable slider per animation and per transition; no numeric labels are printed on the page | P1; the range and the default are unverified (section 13) |
| Order and preview | The panel lists the slide's animations in play order, drag reorders, an X removes, "Play" previews | P1 (Play); reorder and remove from R05 (corroborated) |
| Media in the panel | A video set to Play automatically is sequenced "in the animations sidebar, so you can coordinate playback with other animations on the slide" (Google, 2020) | R02 a.2 row "Sequencing with animations" |
| Audio playback fields | "Start playing" On click or Automatically, "Volume when presenting" 0 to 100, "Loop audio", "Stop on slide change" (default on), "Hide icon when presenting" (only with Automatically) | R05 row "Audio playback", R02 a.1 (third parties, corroborated) |
| Video playback fields | "Play (on click)" default, "Play (automatically)", "Play (manual)"; "Start at", "End at"; "Mute audio" | P2, R02 a.2 |
| Audio sources and formats | ".mp3 and .wav files stored in your Drive"; wav playback listed for Chrome, Firefox, Safari and Edge | P2 |
| Video sources | Search YouTube, By URL, Google Drive | P2 |
| Google's own exports | No Google page read describes how a downloaded PPTX or PDF treats transitions, animations, audio or video (R02 a.1 and a.2 "Export" rows); the PDF is widely described as showing every object of every slide | unverified (section 13) |

Two readings the export must settle where Google's page is silent:

- Slide from right. Google's name says where the new slide comes from. PowerPoint's `p:push dir="l"` "moves the new slide in from an off-screen location, continually pushing the previous slide to an opposite off-screen location" (P5) and `dir` "specifies the direction of the slide transition", so the new slide enters from the right when `dir="l"` (the content moves left). Whether Google pushes the old slide out or covers it is not stated on a Google page; this report chooses push (both slides move), which is the reading of every third party description collected in R05. A cover (`p:cover dir="l"`) is the one line change if a live look shows the old slide standing still (unverified).
- Zoom in and Zoom out. Google's zoom scales about the object's own centre (R05, third parties). PowerPoint's Zoom entrance has two subtypes, object centre (16) and slide centre (528) (P15 table); the export writes object centre.

## 3 The document shape the exporters read

Report 02 and the design set own the editing model; this section fixes only the fields the export compiler consumes so the two designs agree. Every field is optional and additive at version 1, the rule SPEC 7.7 set for later items.

```ts
// packages/schema/src/deck.ts (SlideBase)
transition?: {
  kind: 'none' | 'dissolve' | 'fade' | 'slideRight' | 'slideLeft' | 'flip' | 'cube' | 'gallery';
  /** milliseconds; the speed slider stores a duration */
  durationMs: number;
};
/** the Motion panel's list, in play order; one entry per animation, media playback included */
animations?: Animation[];

type Animation = {
  id: string;
  blockId: BlockId;
  effect:
    | 'appear' | 'disappear' | 'fadeIn' | 'fadeOut'
    | 'flyIn' | 'flyOut' | 'zoomIn' | 'zoomOut' | 'spin'
    | 'playMedia';
  /** flyIn and flyOut only */
  direction?: 'left' | 'right' | 'top' | 'bottom';
  trigger: 'click' | 'afterPrevious' | 'withPrevious';
  durationMs: number;
  /** text blocks only: one step per paragraph */
  byParagraph?: true;
};

// packages/schema/src/blocks.ts: a positioned object like picture or shape
type MediaBlock = {
  type: 'media';
  kind: 'audio' | 'video';
  /** a stored file (the asset record carries mime, bytes, duration) or a YouTube video */
  source: { asset: AssetId } | { youtube: string };
  /** the still the editor, the stills and the PPTX show; the frame at startMs for a video, the speaker glyph for audio */
  poster?: AssetId;
  playback: {
    start: 'click' | 'auto' | 'manual';
    loop?: true;
    /** 0 to 100 */
    volume?: number;
    mute?: true;
    /** audio: keep playing across slides when false; Google's Stop on slide change is the default */
    stopOnSlideChange?: false;
    /** audio: Google's Hide icon when presenting */
    hideIcon?: true;
    /** video: Google's Start at and End at */
    startMs?: number;
    endMs?: number;
  };
};
```

Notes for the compiler:

- The order of `animations` is the Motion panel's order and the play order. A `playMedia` entry is how a video set to "Play (automatically)" or an audio set to "Automatically" takes its place among the animations (R02 a.2 "Sequencing with animations"); a media block with `start: 'click'` and no entry plays on the first click after the slide's own click steps are exhausted, which is Google's "Video plays when you advance the slide" (P2), and `manual` plays only when the object itself is clicked.
- The equation block is report 06's `equation` (`tex`, `alt`, optional display mode); the exporter reads `tex` for the invisible text run and the block's raster for the fallback picture.
- "Apply to all slides" is an action that writes `transition` on every slide; the file format has no deck level transition, and PowerPoint has none either (a transition is a slide property, P4).

## 4 One timing model for present mode, the HTML export and the PPTX writer

The three consumers must agree on what a slide does at each click, so the schedule is computed once by a pure function and every consumer reads the result. Proposed home: `packages/render/src/motion.ts` (the render package already owns the string renderer and the stage markup, L11), exported as `compileMotion(slide, blocks)`.

```ts
type MotionSchedule = {
  /** the first step plays on slide entry; the rest on clicks */
  steps: MotionStep[];
  /** blocks hidden before their entrance step */
  hiddenAtStart: BlockId[];
  transition: { kind: TransitionKind; durationMs: number } | null;
};
type MotionStep = {
  effects: {
    animation: Animation;
    /** ms after the step begins */
    delayMs: number;
    /** byParagraph: the paragraph index this effect plays for */
    paragraph?: number;
  }[];
  /** the step's length: max(delay + duration) over its effects */
  durationMs: number;
};
```

Semantics, which are PowerPoint's and, by every description collected in R05, Google's:

- An animation with trigger `click` opens a new step. `withPrevious` joins the current step at delay 0. `afterPrevious` joins the current step at a delay equal to the end of the previous effect. The first animation of a slide with `afterPrevious` or `withPrevious` joins step 0, which plays on entry.
- `byParagraph` expands one animation into one effect per paragraph of the text block. With trigger `click` each paragraph is its own step (Google's "line by line"); with `afterPrevious` the paragraphs chain inside one step; with `withPrevious` they play together.
- Entrance effects (`appear`, `fadeIn`, `flyIn`, `zoomIn`) put their block in `hiddenAtStart`; exit effects leave it visible until their step and hide it at their end; `spin` changes visibility never. An object with both an entrance and a later exit is hidden at start, shown at the entrance step, hidden again at the exit step.
- `playMedia` is an effect whose duration is the media's remaining length after `startMs` and `endMs`, or the step's length when `loop` is set (a looping medium never ends a step; the step ends with its other effects).
- A step advances the show when the pointer clicks or a next key fires; the show advances the slide when no step remains, then the transition plays. This is `advance()` in both runtimes.
- Reduced motion (`prefers-reduced-motion: reduce`): transitions cut, animations jump to their end state, steps still gate the content. Google has no such rule; Turboslide's round four already committed to it for the live hero (SPEC-4 7), and it applies here.

Durations. Google's slider has no printed values (P1), so the numbers are Turboslide's: the slider stores `durationMs` from 100 to 5000 and the three labelled stops Slow, Medium and Fast are 2000, 1000 and 500 ms for animations and transitions alike (a design choice, marked unverified against Google in section 13). The PPTX writes the milliseconds; nothing rounds.

## 5 OOXML per Google transition

The element sits in the slide part after `</p:clrMapOvr>` and before `<p:timing>` (schema order of `p:sld`: `cSld`, `clrMapOvr`, `transition`, `timing`, `extLst`; P4 lists `transition` under the slide with attributes `spd`, `advClick`, `advTm`). `spd` is the three step speed of ECMA 376 (`slow`, `med`, `fast`); the millisecond duration is `p14:dur`, a PowerPoint 2010 attribute that only a `p14` aware reader accepts, so PowerPoint 2010 and later write every transition inside `mc:AlternateContent`: the Choice requires `p14` and carries `p14:dur`, the Fallback carries the plain element with `spd` alone. The post process writes that wrapper for every transition, so a duration never breaks an older reader, and the `p14` only kinds fall back to a fade.

```xml
<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14">
    <p:transition spd="<spd>" p14:dur="<ms>"><!-- the Choice element of the table --></p:transition>
  </mc:Choice>
  <mc:Fallback>
    <p:transition spd="<spd>"><!-- the Fallback element of the table --></p:transition>
  </mc:Fallback>
</mc:AlternateContent>
```

`spd` from `durationMs`: under 750 ms `fast`, under 1500 ms `med`, else `slow` (a Turboslide mapping; ECMA 376 gives the three names and no milliseconds, P4). `advClick` stays at its default of true and `advTm` is never written: Google's transitions have no per slide auto advance (autoplay is a present mode setting, SPEC 9.2 Later).

| Google | Choice element | Fallback element | PowerPoint | LibreOffice 25.2 | Notes |
| --- | --- | --- | --- | --- | --- |
| None | no `p:transition` written | none | plain cut | plain cut | a slide with `kind: 'none'` carries no wrapper |
| Dissolve | `<p:dissolve/>` | same | ECMA element (P4) | read, no parameters (P14) | |
| Fade | `<p:fade/>` | same | ECMA element; `thruBlk="1"` would be Fade through black, not written (P4) | read with `thruBlk` (P14) | Google's Fade is the smooth crossfade (R05) |
| Slide from right | `<p:push dir="l"/>` | same | ECMA element; `dir` is `l`, `r`, `u`, `d`, the direction the slides move (P5) | read with direction (P14) | push versus cover is unverified (section 2) |
| Slide from left | `<p:push dir="r"/>` | same | as above | as above | |
| Flip | `<p14:flip dir="l"/>` | `<p:fade/>` | `p14:flip`, Office 2010 and later (P8) | no handler; the Fallback branch if LibreOffice honours `mc:Fallback` (P14, unverified) | direction is a left or right type (P8 enum `TransitionLeftRightDirectionTypeValues`) |
| Cube | `<p14:prism dir="l"/>` | `<p:fade/>` | `p14:prism` with `dir`, `isContent` (content and background drawn separately) and `isInverted` (concave instead of convex), all defaulting to false and `l` (P9) | read as prism with the inverted flag (P14) | PowerPoint's Cube is the convex whole slide form, so the defaults; Box would be `isInverted="1"`, Rotate and Orbit the `isContent="1"` pair (the mapping of the four UI names to the two flags is unverified, section 13) |
| Gallery | `<p14:gallery dir="l"/>` | `<p:fade/>` | `p14:gallery`, Office 2010 and later (P8) | no handler; Fallback (P14, unverified) | |

The direction `l` on flip, prism and gallery is PowerPoint's default and matches the new slide arriving from the right, the same reading as Slide from right.

## 6 OOXML per Google animation

### 6.1 The tree

One `p:timing` per slide that has animations or automatic media, after the transition element. The structure is PowerPoint's: a root parallel node, one main sequence, one parallel node per click step, and inside it one parallel node per effect carrying the preset attributes.

```xml
<p:timing>
  <p:tnLst>
    <p:par>
      <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
        <p:childTnLst>
          <p:seq concurrent="1" nextAc="seek">
            <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
              <p:childTnLst>
                <!-- one per step -->
                <p:par>
                  <p:cTn id="3" fill="hold">
                    <p:stCondLst>
                      <p:cond delay="indefinite"/>
                      <!-- step 0 only, when it plays on entry: -->
                      <p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>
                    </p:stCondLst>
                    <p:childTnLst>
                      <p:par>
                        <p:cTn id="4" fill="hold">
                          <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                          <p:childTnLst>
                            <!-- one per effect of the step -->
                            <p:par>
                              <p:cTn id="5" presetID="<id>" presetClass="<entr|exit|emph>"
                                     presetSubtype="<sub>" fill="hold" grpId="0"
                                     nodeType="<clickEffect|afterEffect|withEffect>">
                                <p:stCondLst><p:cond delay="<delayMs>"/></p:stCondLst>
                                <p:childTnLst><!-- behaviours of 6.2 --></p:childTnLst>
                              </p:cTn>
                            </p:par>
                          </p:childTnLst>
                        </p:cTn>
                      </p:par>
                    </p:childTnLst>
                  </p:cTn>
                </p:par>
              </p:childTnLst>
            </p:cTn>
            <p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>
            <p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>
          </p:seq>
          <!-- p:audio and p:video nodes of section 7.4 sit here, after the sequence -->
        </p:childTnLst>
      </p:cTn>
    </p:par>
  </p:tnLst>
  <p:bldLst>
    <!-- one per animated shape with a text body -->
    <p:bldP spid="<id>" grpId="0"/>
    <!-- byParagraph: -->
    <p:bldP spid="<id>" grpId="0" build="p"/>
  </p:bldLst>
</p:timing>
```

The attributes are those of `p:cTn` (P6): `presetID`, `presetClass` (`entr`, `exit`, `emph`, `path`, `verb`, `mediacall`), `presetSubtype` ("a bitflag that specifies a direction or some other attribute of the effect. For example it can be set to specify a 'From Bottom' for the Fly In effect"), `nodeType`, `dur`, `fill`, `grpId`, `restart`, `repeatCount`. Time node ids are unique integers per slide; the post process numbers them from 1 in document order. `delayMs` inside a step is the `MotionStep` effect delay of section 4, so After previous is a delay equal to the previous effect's end and With previous a delay of 0, both with the matching `nodeType`. The `onBegin` condition on step 0 is what makes a first After previous or With previous animation play when the slide appears (the form PowerPoint writes; unverified against a saved file, section 13).

### 6.2 The behaviours per effect

`D` is `durationMs`, `N` the target shape's `cNvPr id`. `style.visibility` is set with a 1 ms `p:set`. Positions in `p:anim` are PowerPoint's slide relative variables: `#ppt_x`, `#ppt_y` the object's centre as a fraction of the slide, `#ppt_w`, `#ppt_h` its size; `1+#ppt_h/2` is just below the bottom edge, `0-#ppt_h/2` just above the top.

| Google | presetClass, presetID, presetSubtype | Behaviours | LibreOffice preset (P15) |
| --- | --- | --- | --- |
| Appear | entr 1 0 | `set style.visibility` to `visible` | ooo-entrance-appear |
| Disappear | exit 1 0 | `set style.visibility` to `hidden` | ooo-exit-disappear |
| Fade in | entr 10 0 | `set visible` at delay 0, then `<p:animEffect transition="in" filter="fade">` with `dur="D"` | ooo-entrance-fade-in |
| Fade out | exit 10 0 | `<p:animEffect transition="out" filter="fade">` with `dur="D"`, then `set hidden` at delay `D-1` | ooo-exit-fade-out |
| Fly in from bottom | entr 2 4 | `set visible`; `p:anim` on `ppt_y` from `1+#ppt_h/2` to `#ppt_y` and on `ppt_x` from `#ppt_x` to `#ppt_x`, `calcmode="lin" valueType="num"`, two `p:tav` at `tm="0"` and `tm="100000"`, `dur="D"` | ooo-entrance-fly-in, from-bottom |
| Fly in from top | entr 2 1 | as above with `ppt_y` from `0-#ppt_h/2` | from-top |
| Fly in from left | entr 2 8 | `ppt_x` from `0-#ppt_w/2` to `#ppt_x`, `ppt_y` constant | from-left |
| Fly in from right | entr 2 2 | `ppt_x` from `1+#ppt_w/2` | from-right |
| Fly out to bottom, top, left, right | exit 2 with 4, 1, 8, 2 | the reverse paths (from `#ppt_y` to `1+#ppt_h/2` and so on), then `set hidden` at `D-1` | ooo-exit-fly-out with the same subtype names |
| Zoom in | entr 23 16 | `set visible`; `<p:animScale>` with `<p:from x="0" y="0"/><p:to x="100000" y="100000"/>`, `dur="D"` | ooo-entrance-zoom, in |
| Zoom out | exit 23 32 | `<p:animScale>` from `100000,100000` to `0,0`, then `set hidden` at `D-1` | ooo-exit-zoom (the exit subtype number is unverified, section 13) |
| Spin | emph 8 0 | `<p:animRot by="21600000">` (360 degrees in 60000ths) with `attrName r`, `dur="D"` | ooo-emphasis-spin |

The direction bits (1 top, 2 right, 4 bottom, 8 left) and the zoom subtypes (16 object centre, 528 slide centre) are LibreOffice's own conversion table (P15: `{ 1, "from-top" }, { 2, "from-right" }, { 4, "from-bottom" }, { 8, "from-left" }, { 16, "in" }, { 528, "in-from-screen-center" }`), the same numbers PowerPoint writes. LibreOffice reads `p:animEffect` through its filter and `transition` attributes, `p:animScale` `from`, `to` and `by`, `p:animRot` in 60000ths of a degree, `p:set` through its target value, and `p:cMediaNode` for `showWhenStopped` (P16), and reads `nodeType` `clickEffect`, `afterEffect`, `withEffect` (P15); its PPTX exporter writes the same three strings (P18).

### 6.3 Targets

- A block exported as one shape targets that shape: `<p:tgtEl><p:spTgt spid="N"/></p:tgtEl>`. `N` is resolved from the object name `ts:<slide>#<block>` by `listShapes`, with the group suffix tolerance `toConnector` already uses (L3).
- A block exported as a group (a ruled row, a user group, a table written as ruled rows) targets the `p:grpSp` id; PowerPoint and LibreOffice animate a group as one object. `groupShapes` must therefore report the id it gives each group (it already returns `groups[].ids` of the members, L4; it gains the group's own id).
- A table written as `a:tbl` or a chart is a `p:graphicFrame`; `spTgt` targets it (LibreOffice's importer keeps a frame as one shape).
- By paragraph on a text box: one effect per paragraph with `<p:spTgt spid="N"><p:txEl><p:pRg st="k" end="k"/></p:txEl></p:spTgt>` and `build="p"` on the shape's `p:bldP`. The paragraph count is the number of `a:p` elements pptxgenjs wrote for the block, which `text.ts` knows (the lines of the measured text); a table cell's paragraphs are not animated (Google animates a table as one object, R05).
- A block that exported as several shapes without a group (the flatten cover, the hidden title) is never a target; the compiler skips an animation whose block has no exported shape and the residual names it.

### 6.4 Shape ids

Every `spTgt` and every `bldP` needs a stable, unique `cNvPr id`. `addHiddenTitle` already allocates `nextShapeId` (L8). The post process gains a renumber pass that runs once, after every insertion and before the timing tree is written: it walks the part in document order, assigns ids from 2 upwards to every `cNvPr` (shapes, pictures, frames, connectors, groups), and rewrites `a:stCxn` and `a:endCxn` ids of connectors to the new numbers. The timing writer then reads the final ids by name. This also removes the pptxgenjs media id derived from a relationship id (section 1.1), should `addMedia` ever be used.

## 7 Audio and video

### 7.1 The shape

The builder places the poster with `addImage` at the block's box, named `ts:<slide>#<block>`, with the block's alt text; the post process rewrites that `p:pic` into a media picture. Writing the media through the post process rather than `addMedia` avoids the audio as video reference, the relationship derived id and the base64 doubling of the media bytes inside a JavaScript string (a 100 MB video is a 133 MB string before jszip sees it); the bytes go straight into the zip as a stored part.

```xml
<p:pic>
  <p:nvPicPr>
    <p:cNvPr id="N" name="ts:<slide>#<block>" descr="<alt>">
      <a:hlinkClick r:id="" action="ppaction://media"/>
    </p:cNvPr>
    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
    <p:nvPr>
      <a:audioFile r:link="rIdV"/>            <!-- or <a:videoFile r:link="rIdV"/> -->
      <p:extLst>
        <p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}">
          <p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rIdM">
            <p14:trim st="<startMs>" end="<trimmedFromEndMs>"/>   <!-- video with Start at or End at -->
          </p14:media>
        </p:ext>
      </p:extLst>
    </p:nvPr>
  </p:nvPicPr>
  <p:blipFill><a:blip r:embed="rIdP"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr><!-- the xfrm and prstGeom rect pptxgenjs wrote --></p:spPr>
</p:pic>
```

- `rIdV` is a `http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio` or `.../video` relationship and `rIdM` a `http://schemas.microsoft.com/office/2007/relationships/media` relationship, both to the same part `ppt/media/media-<n>.<ext>`; `rIdP` is the poster's image relationship pptxgenjs already wrote (M1 lines 5755 to 5790 show the same three).
- `p14:trim` `st` and `end` are durations removed from the start and from the end of the media (P10: "a duration of time to be removed from the start of the media during playback", type `ST_UniversalTimeOffset`); the value PowerPoint writes is milliseconds, possibly with a decimal fraction (unverified against the type's text, section 13). Google's End at is a position, so `end` is the media length minus End at, which needs the duration the asset record stores.
- `a:audioFile` and `a:videoFile` are the elements LibreOffice's shape importer distinguishes: it sets `audio/unknown` for `audioFile` and `video/unknown` otherwise and keeps the `r:link` target as the media (P17). LibreOffice ignores `p14:media` and the `ppaction://media` click (P17), so the poster is a separate blip to it and the media still imports through the ECMA elements.
- The content type defaults: `mp4` and `m4v` as `video/mp4` (pptxgenjs writes them, M1), and the post process adds `mp3` as `audio/mpeg`, `m4a` as `audio/mp4`, `wav` as `audio/wav`, `webm` as `video/webm` when the package holds one, correcting any `audio/mp3` default pptxgenjs left (`cleanContentTypes`, L5).

### 7.2 YouTube

A `source.youtube` block is written with pptxgenjs's `online` form (M1 lines 5598 to 5615): an external `relationships/video` relationship to `https://www.youtube.com/embed/<id>` and the poster blip, no `p14:media`. PowerPoint opens it in Microsoft 365 and may error in older desktop versions (P3); LibreOffice imports an external video link it cannot play. The Perfect still shows the poster. The poster for a YouTube block is either a frame the user set or Turboslide's own placeholder frame with the video's title; fetching a YouTube thumbnail is a server egress the studio's host rules must allow explicitly (the bundle fetch of round three lists its hosts, L21 header), a decision for the design set.

### 7.3 The poster

- Video: the frame at `startMs`, captured by the editor through a `<video>` element and a canvas when the file is uploaded or the start time changes, stored as a picture asset (`poster`); the renderer shows it in the editor, the sheet route, the print document and the stills. Without one, a neutral frame in the theme's ink and paper with a play glyph of Turboslide's own drawing.
- Audio: Google shows a speaker icon (R02 a.1). Turboslide draws its own speaker glyph in the theme's ink (never Google's or PowerPoint's icon) at the block's box; the same raster is the `p:pic` blip, so PowerPoint shows the same picture for the audio object it would otherwise draw with its own speaker icon.
- The Perfect page raster contains the poster because the sheet shot contains it; the JPEG and the PDF likewise (section 9).

### 7.4 Playback in the timing tree

Google's five audio fields and three video fields map onto `p:cMediaNode` (P7: `vol` a positive fixed percentage, `mute`, `numSld` "the numbers of slides across which the media should play", `showWhenStopped` "whether the media should be displayed when it is stopped") and its `p:cTn`.

| Google field | OOXML | Notes |
| --- | --- | --- |
| Volume when presenting 0 to 100 | `vol="<n*1000>"` | thousandths of a percent, 100 is `100000` |
| Mute audio (video) | `mute="1"` | |
| Loop audio | `repeatCount="indefinite"` on the media node's `p:cTn` | P6 `repeatCount` |
| Stop on slide change unchecked | `numSld="999"` | PowerPoint's Play across slides; the default (stop) writes no attribute |
| Hide icon when presenting | `showWhenStopped="0"` | LibreOffice reads it as hide during show (P16: `mbHideDuringShow = !rAttribs.getBool(XML_showWhenStopped, true)`) |
| Start at, End at (video) | `p14:trim` on the shape (7.1) | |
| Start playing Automatically, Play (automatically) | a `playMedia` effect in the main sequence: a `p:par` with `presetClass="mediacall" presetID="1" nodeType="<afterEffect|withEffect>"` whose behaviour is `<p:cmd type="call" cmd="playFrom(0.0)">` targeting the shape; plus the `p:audio` or `p:video` node below | the form PowerPoint writes (unverified against a saved file) |
| On click, Play (on click) | the same `mediacall` par with `nodeType="clickEffect"` as its own step | Google's "plays when you advance the slide" (P2) |
| Play (manual) | no main sequence entry; an interactive sequence `<p:seq concurrent="1" nextAc="seek"><p:cTn nodeType="interactiveSeq">` whose `p:nextCondLst` condition is `evt="onClick"` on the shape and whose command is `togglePause` | PowerPoint's click the object to play |

The media node itself, a sibling of the main sequence under the root:

```xml
<p:audio>                                    <!-- or <p:video fullScrn="0"> -->
  <p:cMediaNode vol="80000" mute="0" showWhenStopped="0" numSld="1">
    <p:cTn id="<n>" fill="hold" display="0" repeatCount="indefinite">
      <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
      <p:endCondLst>
        <p:cond evt="onStopAudio" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond>
      </p:endCondLst>
    </p:cTn>
    <p:tgtEl><p:spTgt spid="N"/></p:tgtEl>
  </p:cMediaNode>
</p:audio>
```

`cMediaNode` sits under `audio` and `video` and holds `cTn` and `tgtEl` (P7). The Perfect file writes none of this: a still.

### 7.5 What each reader does

| Reader | Embedded mp4 or mp3 | YouTube | Poster | Timing |
| --- | --- | --- | --- | --- |
| PowerPoint for Windows and Mac | plays `.mp4` (H.264 with AAC), `.m4a`, `.mp3`, `.wav`; Microsoft recommends "Video: .mp4 files encoded with H.264 video and AAC audio. Audio: .m4a files encoded with AAC audio" and documents no file size limit (P12) | Microsoft 365 (P3) | the blip | honoured |
| LibreOffice Impress 25.2 | the `audioFile` or `videoFile` link with a generic mime type (P17); playback depends on the platform's GStreamer or AVFoundation | an external link, no playback | a separate blip fill | `showWhenStopped` read (P16); the rest imported as its own effects |
| QuickLook, the verify PDF | the poster | the poster | the blip | ignored |

The formats Turboslide accepts on upload, so every reader above plays them: video `mp4` (H.264 and AAC) and `webm` (accepted for the HTML export and the editor, transcoding is not offered, so a webm travels into the PPTX as is and PowerPoint for Windows plays it while the Mac list does not include it, P12); audio `mp3`, `m4a`, `wav`. The upload route sniffs the container the way it sniffs pictures.

## 8 Size caps for media

Facts:

- The studio's presigned upload path exists for pictures over 3 MB because a function body caps at 4.5 MB (L21 `upload.ts` header); the caps are `largestPictureBytes` 25 MB anonymous, 50 MB account and agent (L21 `ratelimit.ts`), and the blob backend is Vercel Blob's client upload behind a token.
- The realtime caps bound a slide document at 200 KB and a deck at 25 MB of documents (L21 `admission.ts`), which media bytes never enter: an asset is a store object, the block holds an id.
- The standalone HTML has a 16 MB budget (L11).
- PowerPoint documents no size limit for embedded media (P12). Google publishes no Slides specific cap for audio or video beyond Drive's (R02 a.1 and a.2).

Proposal, for the design set to confirm:

| Cap | Value | Reason |
| --- | --- | --- |
| One audio file | 25 MB anonymous, 50 MB account | the picture caps, so the quota rows and the upload path are shared; an mp3 hour at 128 kbps is about 58 MB, so an account holds a talk, an anonymous session a song |
| One video file | 25 MB anonymous, 200 MB account | a two minute 1080p clip at 8 Mbps is 120 MB; anonymous stays at the picture cap |
| Media per deck | 300 MB | the Editable text export embeds everything under this; over it the export writes posters only for the largest files first and the residual names them (`media: 'poster'` per file), and the Download dialog says so before the run |
| Standalone HTML | media inlined as data URIs only while the file stays under its 16 MB budget, largest files first to be dropped to a hosted URL (when the deck is hosted and the store URL is readable by the reader) or to the poster | the budget exists and a data URI grows the bytes by a third |
| Editable text assembly | the media bytes enter the zip as a stored part through jszip from a Uint8Array, never as a base64 string; the export report's `files[].bytes` shows the result | memory in the worker |

## 9 Perfect, PDF, JPEG and HTML

### 9.1 The stills

The Perfect page raster is the 2x sheet shot of the render surface, the PDF is Chromium's print of the print document, the JPEG is the render route at 2x (L2, L10, SPEC 7.6). None of them runs present mode, and this report fixes the rule: the still is the document with every object at rest. An object with an entrance animation is drawn, an object with an exit animation is drawn, a Disappear removes nothing, a Spin rotates nothing, a video shows its poster, an audio shows its icon unless `hideIcon` is set (the icon then shows in the stills too, because a still is not a show; the residual says so). Transitions are absent by definition.

The two alternatives were the first state (entrance objects hidden) and the state after the last animation (exit objects hidden). Both drop content the editor shows, the second can empty a page, and neither is what readers of Google's PDF report: the download is widely described as showing every object of every slide regardless of animations, which is also how PowerPoint prints. No Google page read states it (section 13), so the rule stands on its own merits and Google's reported behaviour agrees with it.

Consequences: the render surface must not carry present mode state. The `hiddenAtStart` set of section 4 becomes a class only inside the present layer and the HTML runtime's show, never in the sheet route or the print document; the Perfect gate and the PDF gate are unchanged. The equation block prints as MathML glyphs in the PDF and as pixels in the Perfect raster (R06 8.1 and 8.4).

### 9.2 The HTML export

`renderStandalone` (L11) appends the frozen standalone runtime (L12: "framework-free, feature-frozen port"), which shows one slide at a time by toggling `.slide.is-on` (L12 `show(n)`). Motion needs two things the frozen runtime does not have: a per step state within a slide and two slides visible during a transition. The design keeps the freeze and adds one hook:

- The document gains `<script type="application/json" id="ts-motion">` holding `compileMotion` output per slide id (section 4) and `<style id="ts-motion-css">` holding the generated keyframes, both written only when a slide has a transition or an animation, so a still deck pays nothing.
- A second standalone script, `viewer/standalone/motion.ts`, ported the same way as `runtime.ts` (types stripped, inlined), reads `#ts-motion`, and the runtime calls `window.__tsMotion?.advance(dir)` before its own `go(k)`: when the current slide has a step left, the motion script plays it and returns true, and the runtime does nothing; otherwise the runtime changes the slide and the motion script plays the transition by keeping the outgoing slide `is-leaving` for `durationMs` while the incoming one is `is-entering`. That call is the one change to the frozen runtime, recorded in SPEC 5.3's amendment list.
- Autoplay: an export option `autoplay: { intervalMs: number; loop: boolean }` (the Download dialog offers the same intervals as Google's present mode Auto-play menu, 1, 2, 3, 5, 10, 15, 30 s and 1 min, SPEC 9.2) writes `data-autoplay` on the stage; the motion script calls `advance(1)` on that interval, so each animation step and each slide change take one tick, the reading of Google's autoplay that every step is an advance (unverified, section 13). A click or a key pauses the timer, the way Google's Play or pause item does.
- Media: `<audio>` and `<video>` elements with the poster attribute, `data-start` and `data-end` for trimming through `currentTime` and a `timeupdate` listener, `loop`, `muted`, and volume set by the script. Browsers block unmuted autoplay before a user gesture; the show starts on a click or a key in this runtime, which is that gesture, and the export's `autoplay` variant plays media muted until the first interaction and says so in a one line notice the viewer chrome already has (`#toast`, L12).

### 9.3 Present mode

The React present layer (`packages/viewer/src/present/*`, `apps/studio/src/components/Slideshow.tsx`) drives the same `data-step` attribute on the sheet and the same generated CSS; `goto` and `advance` extend the existing `stepPlayIndex` logic so that an advance consumes a step before moving the play index. Presenter view shows the current step count beside the slide number ("Step 2 of 4") and its next slide preview shows the resting slide. Both windows already sync over `BroadcastChannel` (SPEC 9.1); the step index joins the message.

### 9.4 The CSS forms

One generator, `motionCss(schedule)`, writes the keyframes both runtimes load, so the curves are equal by construction. The forms:

| Effect | CSS |
| --- | --- |
| Appear, Disappear | `visibility` toggled by the step class, no animation |
| Fade in, Fade out | `opacity` 0 to 1 and 1 to 0 over `D`, `ease-in-out` |
| Fly in, Fly out | `transform: translate(...)` from or to just outside the sheet edge (the sheet is 1600 by 900, so the offset is the object's box against the edge), over `D`, `ease-out` in, `ease-in` out |
| Zoom in, Zoom out | `transform: scale(0)` to `scale(1)` and back about the object's centre over `D` |
| Spin | `transform: rotate(0)` to `rotate(360deg)` over `D`, linear |
| Dissolve | a crossfade under a stepped Bayer mask: `mask-image` of an 8 by 512 px sprite whose frame k has the k lowest ranked cells of the 8 by 8 matrix transparent, `mask-size: 8px 8px`, `mask-position` stepped through 64 frames with `steps(64)` over `D`; the same matrix as `@turboslide/effects/bayer`, so the dissolve is a real pixel dissolve in the house pattern rather than an opacity fade |
| Fade | `opacity` crossfade of the two slides over `D` |
| Slide from right, Slide from left | both slides `translateX` by one sheet width over `D`, `ease-in-out` |
| Flip | `perspective` on the stage, the outgoing slide `rotateY(0)` to `rotateY(-90deg)` and the incoming `rotateY(90deg)` to `rotateY(0)` with `backface-visibility: hidden`, each half of `D` |
| Cube | the two slides as adjacent faces, the stage `rotateY(0)` to `rotateY(-90deg)` with `transform-style: preserve-3d` over `D` |
| Gallery | both slides translate by a sheet width while rotating a few degrees about Y with perspective, scaled to 0.9 at the midpoint, over `D` |

Easing values are Turboslide's; Google's curves are not published (section 13). Reduced motion replaces every duration with 0.

## 10 Verification in the render worker container

The verify loop converts the file to PDF with LibreOffice and diffs the pages (L14, SPEC 8.5); a PDF cannot show a transition, an animation or a media node, so motion needs its own proof. Three legs, all inside the existing image (L13):

1. The XML read back in `export check` (`packages/export/src/check.ts`) gains a "round five:" line: per slide the transition element name and duration, the count of `p:par` effect nodes with `presetID`, the `nodeType` histogram, the `bldP build="p"` count, the `a:audioFile` and `a:videoFile` count, the `p14:media` count, the `mc:AlternateContent` count split by `Requires` (`p14` transitions, `a14` equations), and the media parts by extension and bytes (the media classing by header already exists for PNG and JPEG). The export report gains `motion: { transitions: number; animations: number; media: number; equations: { native: number; raster: number } }` (the last from R06 8.2).
2. The LibreOffice round trip. `soffice --headless --convert-to odp --outdir <dir> <file>.pptx` in the container, then `content.xml` from the ODP zip is read with the same regex style the post process uses. The assertions: each `draw:page` with a transition carries `presentation:transition-type`, `smil:type` and `smil:subtype` matching the kind (`fade`, `dissolve`, `push` with `fromRight` or `fromLeft`; a `p14` kind maps to whatever LibreOffice made of the fallback), and `smil:dur` or `presentation:transition-speed`; each animated shape produces an `anim:par` with `presentation:preset-id` equal to the P15 name of the table in 6.2 and `presentation:preset-sub-type` equal to the direction, and `presentation:node-type` equal to `on-click`, `after-previous` or `with-previous`; each media block produces a `draw:plugin` or `draw:frame` with an `xlink:href` into the ODP's `Media/` folder and a `presentation:` playback attribute for `showWhenStopped`; each equation produces either a `draw:object` with a formula or a `draw:image` of the fallback (R06 8.3 leaves which one open). This leg proves LibreOffice parsed what Turboslide wrote, and the P15 table makes the expected strings stable across LibreOffice versions.
3. The stills. The PDF the verify loop renders must show the resting document of section 9.1: the poster region of a media block is a picture region reported and never gated (the viewer resamples it, as with charts, L2), and the equation region is gated at the picture budget because both sides are Turboslide's own PNG or LibreOffice's formula render (R06 8.3 reports it in the first build and gates it once measured). The Perfect budget is unchanged: a media poster and an equation are pixels of the sheet shot.

QuickLook (macOS, where present) renders the first page only and ignores timing; its picture stays a residual line. python-pptx reopens the file and counts slides; it does not read `p:timing`. PowerPoint stays the manual checklist of `docs/export-verification.md`, extended with: the Transitions gallery shows the kind and the duration in seconds; the Animation Pane lists the effects in the panel's order with their triggers and by paragraph builds; audio and video play with the volume, loop, trim and hide settings; the repair dialog does not appear. The known repair risks this round adds are duplicate `cNvPr` ids (section 6.4 removes them), a `p:transition` written after `p:timing` (order fixed in section 5), a `bldP` naming a shape without a text body (only text shapes get one), a media relationship whose type does not match the element (`audioFile` with `relationships/video`), and an `mc:Choice` without the `Requires` prefix declared in scope.

## 11 The post process design

The modules, in the pattern of `ooxml/shapes.ts` (take and return the part's XML, address by object name, report whether anything was written):

- `ooxml/media.ts`: `toMedia(xml, name, { kind, audioRel, mediaRel, trim })` rewrites a `p:pic` into the media picture of 7.1; `addMediaPart(zip, slidePart, bytes, ext)` writes the stored part, the two relationships and the content type default, returning the relationship ids. Relationship ids are allocated by reading the part's `.rels` for the highest `rIdN`, the way `embedFonts` does for its parts (L4 header, L8).
- `ooxml/math.ts` (R06 8.2): `toEquation(xml, name, { omml, pngRel })` replaces the placeholder `p:sp` with the `mc:AlternateContent` wrapper.
- `ooxml/ids.ts`: `renumberShapeIds(xml)` of 6.4, returning the name to id map the timing writer reads.
- `ooxml/transition.ts`: `writeTransition(xml, transition)` inserts the wrapper of section 5 after `</p:clrMapOvr>` (pptxgenjs's `makeXmlSlide` closes every slide part with `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`, M1 lines 6494 to 6500) and declares `xmlns:mc` and `xmlns:p14` on `p:sld` when absent (the same lines declare `a`, `r` and `p` only).
- `ooxml/timing.ts`: `writeTiming(xml, schedule, ids)` inserts the tree of section 6 with the media nodes of 7.4 after the transition; a slide with no effects and no automatic media gets no `p:timing`.
- `ooxml/groups.ts`: the shape regex gains `mc:AlternateContent` as a fifth element kind so an equation inside a group is wrapped as one node (R06 8.3), and `groupShapes` returns each group's own id.
- `ooxml/clean.ts`: the `audio/mp3` correction and the new defaults.
- `pptx/build.ts` order: strip, adjust values, columns, connectors, alt text, media, equations, grouping, slide name, hidden title, renumber, transition, timing; then the package level passes as today. The rewrites record per slide gains `media`, `equations`, `transition` and `schedule`.

The scene (`scene/types.ts`) carries per slide the `transition`, the compiled `schedule` (the extractor calls `compileMotion` so the builder and the verify leg read one object), and per media block its asset bytes path, poster path, mime, duration and playback record; the extractor already reads assets from the deck directory for pictures and variants (L1 `materializeForExport`, L9).

## 12 The action surface

Export facing only; the editing actions (transition set and apply to all, animation add, remove, reorder, media insert and playback, equation edit) belong to the design set with the rest of the Motion panel.

| Action | Change | CLI, MCP, window |
| --- | --- | --- |
| `export.run` | `motion?: 'keep' \| 'drop'` (default keep) for PPTX and HTML; `media?: 'embed' \| 'poster'` (default embed under the deck cap, section 8); for HTML `autoplay?: { intervalMs: number; loop?: boolean }`; the report gains `motion` counts and the residual lines of sections 5 to 9 | `turboslide export pptx --motion drop --media poster`, `export html --autoplay 5000 --loop`; the MCP tool and the window API take the same fields (SPEC 7.1: every CLI flag is an input field) |
| `export.check` | the "round five:" read back of section 10 leg 1 and, with `--libreoffice`, leg 2 | `turboslide export check <file> --libreoffice` |
| `motion.compile` (new, read only) | returns `compileMotion` for a slide, so an agent can ask "what plays on the third click of slide 4" without reading the panel | `turboslide motion compile --slide <id>`; MCP `deck_motion_schedule` |
| `view.present` | gains `step?: number` so `deck_goto_slide` can land on a step, and the present state reports `step` and `steps` | existing action, two fields |

## 13 Unverified statements and decisions for the design set

Unverified, each to be closed by the named check:

1. Google's transition and animation name lists are third party collections (R05); Google's page prints neither (P1). Closed by a live look at the Motion panel, which this session could not take.
2. "Apply to all slides" exists in Google's Slide Transition section (R05 third parties); not on P1.
3. Google's speed slider range and default, and whether Slow, Medium, Fast labels exist; the 2000, 1000, 500 ms stops and the 100 to 5000 ms range are Turboslide's.
4. Whether Google's Slide from right pushes the old slide out (push) or slides the new one over it (cover).
5. Google's PDF download shows every object regardless of animations; widely reported, not on a Google page (R02 a.1 and a.2 "Export" rows say the same for media).
6. Google's PPTX download writes `p:timing` for animations and which elements it uses for its three `p14` style transitions; no page read.
7. PowerPoint's Cube is `p14:prism` with default flags (and Box, Rotate, Orbit the other three combinations); the flags are documented (P9), the UI name to flag mapping is not.
8. The exit Zoom subtype (32 written here); P15 lists the entrance subtypes 16 and 528 only.
9. The `onBegin` condition form for a first After previous effect, the `mediacall` preset form for automatic media and the `interactiveSeq` form for manual media are the forms PowerPoint writes; from product knowledge, to be confirmed by saving a file in PowerPoint (the manual checklist).
10. `p14:trim` values are milliseconds with an optional fraction; P10 gives the type name `ST_UniversalTimeOffset` and no unit text.
11. LibreOffice honours `mc:Fallback` for a `Requires` prefix it does not know, so Flip and Gallery arrive as fades; its `oox` layer must read `mc:Choice` to import PowerPoint 2010 files at all, and the round trip of section 10 leg 2 measures the answer.
12. LibreOffice Impress imports `a14:m` as a formula or shows the fallback picture (R06 section 13 carries the same item).
13. `audio/mpeg` is the content type PowerPoint writes for mp3; the registered type is `audio/mpeg`.
14. pptxgenjs's relationship derived media id collides with shape ids on some slides and PowerPoint repairs the file; the renumber pass removes the question.
15. Google's autoplay advances one animation step per tick; the HTML autoplay follows that reading.
16. Google's easing curves and its Spin direction (360 degrees clockwise written here).

Decisions for the design set, from this report:

- The still rule of 9.1 (every object at rest, the audio icon shown in stills even with Hide icon).
- The push reading of Slide from right and left, and the fade fallback for Flip, Cube and Gallery.
- Turboslide's duration stops and easing curves.
- The media caps of section 8 and the per deck 300 MB embed guard with posters beyond it.
- Media written through the post process, not `addMedia`; YouTube through pptxgenjs's online form; the poster policy of 7.3 and the egress question of 7.2.
- The one hook in the frozen standalone runtime and the second standalone script.
- The Bayer sprite dissolve.
- `compileMotion` in the render package as the one schedule for present mode, the HTML export and the PPTX writer.

## 14 Sources

Primary pages and vendor source code (P), read 2026-09-14:

- P1 Google, "Add or change animations and transitions", https://support.google.com/docs/answer/1689475
- P2 Google, "Insert or delete images & videos", https://support.google.com/docs/answer/97447
- P3 PptxGenJS, "Media", https://gitbrent.github.io/PptxGenJS/docs/api-media/
- P4 Microsoft Learn, Open XML SDK, Transition class (`p:transition`, ISO/IEC 29500 remarks, children and attributes), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition
- P5 Microsoft Learn, PushTransition class (`p:push`, `dir`), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.pushtransition
- P6 Microsoft Learn, CommonTimeNode class (`p:cTn` attributes), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commontimenode
- P7 Microsoft Learn, CommonMediaNode class (`p:cMediaNode`), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commonmedianode
- P8 Microsoft Learn, DocumentFormat.OpenXml.Office2010.PowerPoint namespace (the `p14` transition and media classes), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint
- P9 Microsoft Learn, PrismTransition class ([MS-PPTX] 2.3.6 and 2.5.3), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint.prismtransition
- P10 Microsoft Learn, MediaTrim class ([MS-PPTX] 2.5.10), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint.mediatrim
- P11 Microsoft Learn, TextMath class (`a14:m`, [MS-ODRAWXML] 2.3.3 and 2.5.34), https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.drawing.textmath
- P12 Microsoft Support, "Video and audio file formats supported in PowerPoint", https://support.microsoft.com/en-us/office/video-and-audio-file-formats-supported-in-powerpoint-d8b12450-26db-4c7b-a5c1-593d3418fb59
- P13 GitHub API, gitbrent/PptxGenJS issue 823 "[QUESTION] Please add transitions support" (2020-08-12, closed), https://api.github.com/search/issues?q=repo:gitbrent/PptxGenJS+transition+in:title
- P14 LibreOffice core, `oox/source/ppt/slidetransitioncontext.cxx`, https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/ppt/slidetransitioncontext.cxx
- P15 LibreOffice core, `oox/source/ppt/commontimenodecontext.cxx`, https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/ppt/commontimenodecontext.cxx
- P16 LibreOffice core, `oox/source/ppt/timenodelistcontext.cxx`, https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/ppt/timenodelistcontext.cxx
- P17 LibreOffice core, `oox/source/drawingml/graphicshapecontext.cxx`, https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/drawingml/graphicshapecontext.cxx
- P18 LibreOffice core, `sd/source/filter/eppt/pptx-animations.cxx`, https://raw.githubusercontent.com/LibreOffice/core/master/sd/source/filter/eppt/pptx-animations.cxx

Repository files at d5d7f07 (L):

- L1 `packages/export/src/export-pptx.ts`
- L2 `packages/export/src/pptx/build.ts`
- L3 `packages/export/src/ooxml/shapes.ts`
- L4 `packages/export/src/ooxml/groups.ts`
- L5 `packages/export/src/ooxml/clean.ts`
- L6 `packages/export/src/ooxml/zip.ts`
- L7 `packages/export/src/ooxml/validate.ts`
- L8 `packages/export/src/ooxml/titles.ts`, `packages/export/src/ooxml/fonts.ts`
- L9 `packages/export/src/pptx/images.ts`, `packages/export/src/pptx/notes.ts`
- L10 `packages/export/src/pdf/build.ts`
- L11 `packages/render/src/standalone.ts`
- L12 `packages/viewer/standalone/runtime.ts`
- L13 `docker/render-worker.Dockerfile`
- L14 `packages/export/src/verify/libreoffice.ts`
- L15 `packages/schema/src/export.ts`
- L16 `packages/schema/src/deck.ts`
- L17 `packages/chrome/src/menus/model.ts`
- L20 `docs/gslides-parity/SPEC.md` sections 0.5, 6.7, 7.6, 7.7, 9; `SPEC-2.md` section 12; `SPEC-3.md` section 17; `SPEC-4.md` section 7
- L21 `apps/studio/src/server/upload.ts`, `apps/studio/src/server/ratelimit.ts`, `packages/realtime/src/admission.ts`
- L22 `docs/pptx.md`

Earlier and sibling reports (R):

- R02 `docs/gslides-parity/research-5/02-media-templates-import-page.md` (audio and video tables, design notes)
- R03 `docs/gslides-parity/research/03-home-themes-layouts-io.md` (transition types row)
- R05 `docs/gslides-parity/research/05-objects-and-format-options.md` (transition names, animation names, audio playback, video playback rows)
- R06 `docs/gslides-parity/research-5/06-equation-editor.md` (sections 5.2, 8.1 to 8.4, 13)

Installed library (M):

- M1 pptxgenjs 4.0.1, `node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs/dist/pptxgen.cjs.js`: `IMG_PLAYBTN` line 617; `addMediaDefinition` lines 2062 to 2171; media slide XML lines 5597 to 5638; the slide body generator returning after `</p:cSld>` at lines 5719 to 5723; relationship writer lines 5755 to 5790; content types lines 6328 to 6346; `makeXmlSlide` with the root declarations and the `p:clrMapOvr` tail at lines 6494 to 6500; no match for `p:timing` or `p:transition` in the file.
