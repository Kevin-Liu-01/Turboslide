# Google Slides transitions and animations, and their OOXML equivalents

Research report 01 for round five of the Google Slides parity programme. Written 2026-09-14 for the Turboslide designers of scope item A (motion). Every fact below comes from a public page, a public source file or a public test file read on 2026-09-14; the sources are numbered and listed in section 9 with their URLs and dates. Nothing was signed in to, and no Google artwork or icon was copied. Claims that could not be confirmed from a public page are marked "unverified" in place and repeated in section 8.

Scope: (a) the Motion panel as Google Slides shows it on a computer (entry points, position, sections, the transition list, durations, Apply to all slides, the per object animation list with types, start conditions, By paragraph, speed, reorder, remove, Play), (b) keyboard access, (c) how motion plays in present mode and Presenter view, including autoplay, (d) what Google exports to PPTX and PDF and what it drops, (e) what the Slides API and Apps Script expose, and (f) the PowerPoint OOXML side: `p:transition` with its types and durations, and `p:timing` with the presets Google's animation types map to (Appear, Fade, Fly, Zoom, Spin), so the design can write one OOXML fragment per Google type.

Method note: Google's help page for motion is short. Positions, orders and control names therefore come from Google's help text plus dated third party walkthroughs, whose dates are given so the designers can judge freshness. Google's community threads on export (S9) are rendered by script and could not be read; they are listed but not cited for facts. On the OOXML side the schema facts come from the ISO 29500 schema mirror at datypic.com and from Microsoft's Open XML SDK and [MS-PPTX] pages; the effect bodies for Appear, Fade in, Fade out, Fly in, Spin, With previous, After previous and By paragraph are quoted from PowerPoint authored `.pptx` files in LibreOffice's public test corpus (L6), and the bodies for Disappear, Fly out, Zoom in and Zoom out are reconstructed from the schema and marked as such. The `presetID` numbers come from LibreOffice's import table (L1), which is the public table that maps PowerPoint preset ids to effect names.

Notation: "Cmd" is the Mac command key, "Option" the Mac alt key. Source tags such as [G1], [T3], [O5] and [L2] point at section 9. Column "OOXML equivalent" names the element the Editable text PPTX export should write for the row; "none" means the row is an editor behaviour with no file representation.

## 1. Where motion lives in Google Slides

Google Slides keeps all motion in one side panel called Motion. Transitions belong to a slide and animations belong to an object; both are edited in the same panel, which opens on the right of the canvas [G1] [T1] [T4].

| Feature | Behaviour | Position and label | Shortcut | OOXML equivalent | Source |
| --- | --- | --- | --- | --- | --- |
| Motion panel | One side panel holding the slide transition at the top and the object animations below. Opening it from any entry point shows the same panel; the panel stays open while slides and objects are selected and follows the selection. | Right of the canvas, title "Motion", an X at the top right (the side panel convention of R08 B10). | Ctrl+Alt+Shift+B (Windows, Chrome OS), Cmd+Option+Shift+B (Mac). Google's shortcut page names it "Open animations panel". | none | [G1] [G3] [T1] [R08] |
| Insert > Animation | Opens the Motion panel and adds an animation to the selected object, set to "Appear (On click)" by Google's help. | Insert menu, item "Animation". | none beyond the panel key | `p:timing` (section 6) | [G1] [R01] |
| View > Motion | Opens the Motion panel without adding anything. | View menu, item "Motion". | Ctrl+Alt+Shift+B | none | [G1] [T1] [T2] |
| Slide > Transition | Opens the Motion panel with the Slide Transition section for the selected slide. Older tutorials print "Change transition". | Slide menu, item "Transition". | none | `p:transition` (section 5) | [G1] [T1] [T8] [R01] |
| Toolbar Transition button | Text button at the tail of the toolbar (position 17 in R02) that toggles the Motion panel; it stays pressed while the panel is open. | Toolbar tail, label "Transition", after Background, Layout and Theme. | none | none | [T1] [R02] |
| Filmstrip context menu > Transition | Right clicking a slide thumbnail offers "Transition", which opens the panel for that slide. | Filmstrip context menu, row 11 in R08 A1. | none | none | [T10] [R08] |
| Object context menu > Animate | Right clicking an object offers an item that opens the panel and adds a default animation; the printed label is "Animate" in one walkthrough and "Animation" in another (R08 lists the label as unverified). | Object context menu, row 14 in R08. | none | none | [T2] [R08] |
| Filmstrip indicator | A slide that carries a transition or at least one animation shows a small motion icon beside its thumbnail in Filmstrip view and under the thumbnail in Grid view. | Filmstrip, left of or under the thumbnail. | none | none | [T1] [T10] |
| Mobile apps | Android and iOS do not edit motion. Google's page for those platforms says "To add or edit animations and slide transitions, use slides.google.com on a computer." | Not present on mobile. | none | none | [G2] |

## 2. The Slide Transition section

| Feature | Behaviour | Position and label | Shortcut | OOXML equivalent | Source |
| --- | --- | --- | --- | --- | --- |
| Section header | Heading "Slide Transition" at the top of the panel; Google's steps read: Under "Slide Transition," in the drop down menu, select the transition you want to use. | Top of the Motion panel. | none | `p:transition` on the slide the transition leads to (the transition is stored on the incoming slide) | [G1] [O3] |
| Transition type list | A drop down whose default is None. Choosing a type applies it to the selected slide only. Seven effects are listed by the 2022 and 2025 walkthroughs: Dissolve, Fade, Slide from right, Slide from left, Flip, Cube and Gallery. One 2026 page lists six (no Dissolve, no Gallery) and the 2019 page five; the seven item list is the one most sources agree on and the one this report designs against. | Drop down under the header, default "None". | none | one child of `p:transition` per type, section 5.3 | [T1] [T3] [T8] [T9] [T10] [T12] |
| None | Removes the transition from the slide; the slide cuts in. Combined with Apply to all slides it clears every slide. | First item of the list. | none | no `p:transition` element | [T1] [T9] [T10] |
| Dissolve | The incoming slide replaces the outgoing one through a random pixel or square scatter. Description from third parties; the exact pattern is unverified. | List item "Dissolve". | none | `<p:dissolve/>` | [T1] [T12] [O12] |
| Fade | The incoming slide cross fades over the outgoing one. | List item "Fade". | none | `<p:fade thruBlk="0"/>` | [T1] [T8] [O11] |
| Slide from right | The incoming slide moves in from the right edge toward the left. Whether the outgoing slide is pushed or covered is unverified; third parties map it to PowerPoint's Push or Cover. | List item "Slide from right". | none | `<p:push dir="l"/>` (motion toward the left), or `<p:cover dir="l"/>` if the outgoing slide is meant to stay | [T1] [T9] [O10] |
| Slide from left | Mirror of the above. | List item "Slide from left". | none | `<p:push dir="r"/>` | [T1] [T9] [O10] |
| Flip | The slide turns over on a vertical axis to reveal the incoming slide. | List item "Flip". | none | `<p14:flip dir="l"/>` inside `mc:AlternateContent`, fallback `<p:fade/>` | [T1] [T8] [O7] |
| Cube | The two slides are faces of a rotating box. | List item "Cube". | none | `<p14:prism dir="l" isContent="0" isInverted="0"/>` inside `mc:AlternateContent`, fallback `<p:fade/>`; LibreOffice maps its own cube to `p14:prism` the same way | [T1] [T8] [O8] [L2] |
| Gallery | The slides move sideways like frames on a rail, with the incoming slide arriving from the right. | List item "Gallery". | none | `<p14:gallery dir="l"/>` inside `mc:AlternateContent`, fallback `<p:fade/>` | [T1] [T3] [O9] |
| Speed slider | Google's step: "To change the transition speed, drag the slider." The slider sits under the drop down. Third parties describe its ends as Slow and Fast with a Medium mark in the centre and one calls it "Duration"; one claims the range is about 2 s at the slow end and 0.5 s at the fast end and another says clicks move it in one second steps. The exact scale and the displayed value are unverified. | Under the type list. | none | `p14:dur` in milliseconds on `p:transition`, plus `spd` as the fallback (section 5.2) | [G1] [T2] [T3] [T9] [T12] |
| Apply to all slides | A button that copies the selected slide's transition type and speed to every slide, including None. | Button under the slider, label "Apply to all slides". | none | the same `p:transition` written on every slide | [T4] [T6] [T8] [T10] |
| Play | Previews the transition (and the slide's animations) on the canvas; the button reads "Stop" while the preview runs. | Bottom of the panel, label "Play". | Enter continues an animation preview that is waiting on a click step | none | [G1] [G3] [T2] [T8] |

## 3. The Object Animations section

| Feature | Behaviour | Position and label | Shortcut | OOXML equivalent | Source |
| --- | --- | --- | --- | --- | --- |
| Section header | Heading "Object Animations" under the transition section. | Below the transition section. | none | `p:timing` | [G1] [T1] |
| Add animation | Adds one animation to the selected object and expands its row. When nothing is selected the button reads "Select an object to animate" and is inert. Google's help says a new animation is set to "Appear (On click)"; a 2024 walkthrough reports "Fade in" as the default, so the default type is unverified. Adding while an animated object is selected appends a second animation to the same object rather than editing the first. | Button at the end of the list, label "Add animation" or "Select an object to animate". | Insert > Animation does the same | one effect `p:par` in the main sequence | [G1] [T2] [T4] [T14] |
| Animation row | Each animation is a collapsible row whose header reads the type and the start condition, for example "Fade in (On click)". Clicking the header expands it; the rows are listed in play order, top first. | List under the header. | none | order of `p:par` nodes in the main sequence | [G1] [T1] [T11] |
| Type list | First drop down inside an expanded row. Fifteen types in the 2022 list: Appear, Disappear, Fade in, Fade out, Fly in from left, Fly in from right, Fly in from bottom, Fly in from top, Fly out to left, Fly out to right, Fly out to bottom, Fly out to top, Zoom in, Zoom out, Spin. There are no emphasis effects other than Spin and no motion paths. | First drop down in the row. | none | `presetClass`, `presetID`, `presetSubtype` on the effect's `p:cTn`, section 6.4 | [T1] [T2] [T12] [T13] |
| Start list | Second drop down: "On click", "After previous", "With previous". Google's definitions: On click starts when you click the mouse or press the space bar; After previous starts immediately after the previous animation ends; With previous starts at the same time the previous animation starts. | Second drop down in the row. | none | `nodeType="clickEffect"`, `"afterEffect"`, `"withEffect"` and the click group structure of section 6.3 | [G1] |
| By paragraph | A checkbox shown for text objects. Checked, the animation plays one paragraph (one list item) at a time in the order of the text, each paragraph waiting for the row's start condition. | Checkbox under the drop downs, label "By paragraph". | none | `<p:bldP build="p"/>` plus one effect per paragraph targeting `p:txEl/p:pRg`, section 6.5 | [G1] [T2] [T3] |
| Speed slider | Google's step: "To change the animation speed, drag the slider." Same control as the transition slider; slower to the left, faster to the right. Third parties call it Duration and quote about 0.5 s to 2 s; unverified. | Slider at the bottom of the expanded row. | none | `dur` in milliseconds on the behaviour `p:cTn` nodes of the effect | [G1] [T2] [T12] |
| Reorder | Drag a row by its handle (six dots) up or down; the cursor changes to a move cursor over the handle. | Handle at the far right of the row header. | none | order of `p:par` nodes; a moved On click row starts a new click group | [T1] [T2] [T3] [T11] |
| Remove | Expand the row and press the trash icon; the row and its animation disappear. Older walkthroughs describe a "Delete" button or an "X". | Trash icon at the right of the expanded row. | none | remove the `p:par` and its `p:bldP` | [T1] [T2] [T5] [T13] |
| Multiple objects | Selecting several objects and adding an animation adds one row per object, all with the same type and start; the rows can then be edited one by one. Google's help says "select one or more objects"; the per row behaviour is from third parties. | As above. | none | one `p:par` per shape | [T4] |
| Play | Previews the slide's animations from the first step; each click step waits for a click or Enter; the button reads "Stop" while running. | Bottom of the panel, label "Play". | Enter: "Continue in animation preview" | none | [G1] [G3] [T2] |
| Browser note | Google's help: "When presentations are viewed in some browsers, certain animations may not function." | none | none | none | [G1] |

## 4. Present mode and Presenter view

| Feature | Behaviour | Position and label | Shortcut | OOXML equivalent | Source |
| --- | --- | --- | --- | --- | --- |
| Advancing a step | In the slideshow a click or the space bar plays the next On click animation; only when the slide has no steps left does the next click move to the next slide. CustomGuide: "Click anywhere on a slide to advance one slide (or step)." The transition of the incoming slide plays first, then that slide's With previous and After previous chains that hang off the slide's start. | Whole stage. | Space bar, click, Right arrow (Google lists Right arrow as "Next") | `p:seq nextAc="seek"` with `onNext` and `onPrev` conditions, section 6.3 | [G1] [G3] [T7] |
| Going back | Left arrow steps back; whether it reverses one animation step or one whole slide is unverified. | none | Left arrow ("Previous") | `p:prevCondLst evt="onPrev"` | [G3] |
| Other keys during the show | Number then Enter jumps to a slide; Home and End go to the first and last slide; s opens speaker notes; a opens audience tools; l toggles the laser pointer; F11 (Cmd+Shift+f on Mac) toggles full screen; Ctrl+Shift+c toggles captions; b or . shows a black slide, w or , a white slide, any key returns; Esc stops presenting. | none | as listed | none | [G3] |
| Auto play in the show | Slideshow toolbar > Options (three dots) > Auto-play submenu: pick an interval, then Play; Loop restarts after the last slide; the setting must be set again each time you present. Third parties list the intervals as every 1, 2, 3, 5, 10, 15 and 30 seconds and every minute. Whether each tick advances one animation step or one slide is unverified. | Bottom left toolbar of the slideshow, Options menu, "Auto-play". | none | `p:transition advTm` (milliseconds) if the interval is baked into a file; Google keeps it as a session setting | [G4] [T10] [R04] |
| Publish to the web | File > Share > Publish to web: "Auto-advance slides" every 1, 2, 3, 5, 10, 15, 30 or 60 seconds, "Start slideshow as soon as the player loads", "Restart the slideshow after the last slide"; the published player is the same present runtime, so transitions and click steps are expected to play in it (unverified). | Publish dialog, Link and Embed tabs. | none | the autoplay HTML export of round five | [G5] [T9] [R03] [R04] |
| Presenter view | The presenter window's Previous and Next controls drive the same slideshow, so a Next press plays the next animation step before changing slides. Google's Presenter view shows the current slide, the timer and the notes; it does not preview the next animation step (unverified). | Separate presenter window (R04 A4). | s opens it from the show | none | [G4] [R04] |
| Stills | Transitions and animations do not affect the editor canvas, thumbnails or any still export; every object is drawn in its resting state. | none | none | Perfect PPTX and JPEG ignore `p:timing` and `p:transition` | [T9] |

## 5. What Google exports and exposes

### 5.1 Exports

| Feature | Behaviour | Position and label | Shortcut | OOXML equivalent | Source |
| --- | --- | --- | --- | --- | --- |
| Download as .pptx | Google writes transitions and animations into the PowerPoint file. Third parties in 2026 report that "most transitions survive intact", that "most basic animations (fade, slide in, appear) convert cleanly" and that chained builds may simplify to a default effect; a 2024 page says "some animations may not translate perfectly" and asks the user to review them. No Google authored `.pptx` was inspected for this report, so the exact XML Google writes is unverified. | File > Download > Microsoft PowerPoint (.pptx). | none | `p:transition` and `p:timing` per slide, sections 5 and 6 | [T16] [T17] |
| Download as PDF, print | Static pages; transitions are dropped ("PDF export strips all transitions"). Objects with exit animations are expected to print in their resting state (unverified). | File > Download > PDF Document. | none | none | [T9] |
| Import of a PowerPoint deck | The reverse direction matters for the round five importer: animations that also exist in Google Slides (appear, fly in and the rest of the fifteen) survive; anything else is dropped with the banner "Some PowerPoint features can't be displayed in Google Slides and will be lost if you make changes". Motion paths, emphasis sequences and PowerPoint only transitions such as Morph are the named casualties. | Banner at the top of the editor. | none | the importer should read `p:timing` and keep the presets of section 6.4, reporting the rest | [T2] [T18] |

### 5.2 APIs

| Feature | Behaviour | Position and label | Shortcut | OOXML equivalent | Source |
| --- | --- | --- | --- | --- | --- |
| Slides REST API | `Page`, `SlideProperties` (layoutObjectId, masterObjectId, notesPage, isSkipped), `PageProperties` and `PageElement` carry no transition, animation or timing field. Motion is not readable or writable through the API. | developers.google.com reference. | none | none | [G6] |
| Apps Script SlidesApp | The `Slide` class has no method touching transitions, animations or timing. | Apps Script reference. | none | none | [G7] |
| Feature request | Issue 36761236, "Expose creating and editing of animations via Slides API", opened 2016-11-21; its body needs a sign in and was not read. | issuetracker.google.com. | none | none | [G8] |

Reading this as a designer: Turboslide's action table will expose more than Google does here, because the round five actions (set transition, add animation, reorder, remove, play) will exist for the CLI, MCP and the window API while Google's API has none. That is a parity plus, not a gap.

## 6. The OOXML side

### 6.1 The transition element

`p:transition` is a child of `p:sld` (after `p:clrMapOvr`, before `p:timing`) and describes the transition into that slide [O3]. Its attributes and children [O1] [O2] [O5]:

| Attribute or child | Type and default | Meaning | Source |
| --- | --- | --- | --- |
| `spd` | `ST_TransitionSpeed`: `slow`, `med`, `fast`; default `fast` | Legacy speed. PowerPoint 2007 and any reader that ignores `p14` uses it. | [O1] [O2] [O3] |
| `advClick` | boolean, default `true` | A mouse click advances the slide. | [O1] [O3] |
| `advTm` | unsigned int, milliseconds, no default | Auto advance after this time; absent means no auto advance. PowerPoint starts the timer after the slide's animations finish. | [O1] [O3] [O29] |
| `p14:dur` | unsigned int, milliseconds, Office 2010 and later | The real duration. Written inside an `mc:AlternateContent` choice that `Requires="p14"`, with a fallback `p:transition` that omits it. | [O3] [O4] [O5] |
| type child (one of) | `blinds`, `checker`, `circle`, `dissolve`, `comb`, `cover`, `cut`, `diamond`, `fade`, `newsflash`, `plus`, `pull`, `push`, `random`, `randomBar`, `split`, `strips`, `wedge`, `wheel`, `wipe`, `zoom` | ISO 29500 transition types. `push`, `cover`, `pull`, `wipe` take `dir` (`l`, `r`, `u`, `d`; `cover` and `pull` also the corners); `fade` and `cut` take `thruBlk`; `split` takes `orient` and `dir`; `zoom` takes `dir="in|out"`; `wheel` takes `spokes`. | [O1] [O5] [O10] [O11] [O12] [L4] |
| `p14` type child (one of) | `vortex`, `switch`, `flip`, `ripple`, `honeycomb`, `prism`, `doors`, `window`, `ferris`, `gallery`, `conveyor`, `pan`, `glitter`, `warp`, `flythrough`, `flash`, `shred`, `reveal`, `wheelReverse` | PowerPoint 2010 types in namespace `http://schemas.microsoft.com/office/powerpoint/2010/main`. `flip` and `gallery` take `dir="l|r"`; `prism` takes `dir` (side direction, default `l`), `isContent` and `isInverted` (both default `false`). | [O5] [O6] [O7] [O8] [O9] |
| `p15:prstTrans` | `prst` string (`pageCurlDouble`, `pageCurlSingle`), `invX`, `invY` | PowerPoint 2013 preset transitions, namespace `.../powerpoint/2012/main`. Not needed for Google's list. | [O5] [O13] |
| `p:sndAc` | sound action | Optional transition sound. Not needed. | [O1] |

The canonical shape, from Microsoft's own sample (a ripple of 1.5 s) [O4]:

```xml
<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <mc:Choice Requires="p14" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">
    <p:transition spd="slow" p14:dur="1500">
      <p14:ripple dir="ld"/>
    </p:transition>
  </mc:Choice>
  <mc:Fallback>
    <p:transition spd="slow">
      <p:fade/>
    </p:transition>
  </mc:Fallback>
</mc:AlternateContent>
```

The same wrapper is used when only `p14:dur` is needed on an ISO type: the Choice carries `p:transition spd="slow" p14:dur="2000" advClick="1" advTm="3000"` and the Fallback repeats it without `p14:dur` [O3].

### 6.2 Duration to speed

PowerPoint 2010 and later show a Duration spinner in seconds with two decimals and a ceiling of 59 s; older versions only had the three speeds [O29] [O30]. LibreOffice's exporter, a public reference for the fallback mapping, writes `spd` from the millisecond duration as follows: at or under 500 ms it omits `spd` (the schema default is `fast`), between 500 and 1000 ms it writes `med`, at or over 1000 ms it writes `slow`; it always writes `p14:dur` in the Choice when a duration is set [L2]. The design should keep the same thresholds so a PowerPoint 2007 reader gets a sensible speed.

### 6.3 The timing tree

`p:timing` follows `p:transition` in `p:sld` and holds `p:tnLst` (the time node tree), `p:bldLst` (the per shape build list) and `p:extLst` [O24]. Every PowerPoint authored file in the corpus uses the same five level tree, and LibreOffice's export tests assert exactly this XPath: `/p:sld/p:timing/p:tnLst/p:par/p:cTn/p:childTnLst/p:seq/p:cTn/p:childTnLst/p:par/p:cTn/p:childTnLst/p:par/p:cTn/p:childTnLst/p:par/p:cTn` [L5] [L6].

| Level | Node | Attributes seen in PowerPoint files | Meaning | Source |
| --- | --- | --- | --- | --- |
| 1 | `p:par` > `p:cTn` | `id="1" dur="indefinite" restart="never" nodeType="tmRoot"` | The timing root. | [L6] [O16] |
| 2 | `p:seq` > `p:cTn` | `concurrent="1" nextAc="seek"` on `p:seq`; `id="2" dur="indefinite" nodeType="mainSeq"` on `p:cTn`; after the `p:cTn`, `p:prevCondLst` with `<p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond>` and `p:nextCondLst` with `evt="onNext"` | The main sequence. Each next event (click, space bar, arrow) seeks to the next click group; prev seeks back. This is the file level form of "click advances through the animations before the slide". | [L6] [O25] [O26] [O19] |
| 3 | `p:par` > `p:cTn` | `fill="hold"` with `<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>` | One click group. `delay="indefinite"` means it waits for the next event. Every On click animation starts a new click group; the very first group of a slide is also a click group unless the first animation is With previous or After previous, in which case PowerPoint adds `<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>` so it starts with the slide. | [L6] |
| 4 | `p:par` > `p:cTn` | `fill="hold"` with `<p:cond delay="0"/>`, or `delay="N"` for an After previous group | One timing group inside the click. With previous effects share the group of the effect they follow (delay 0); an After previous effect gets its own group whose delay is the end time of the previous group. | [L6] |
| 5 | `p:par` > `p:cTn` | `presetID`, `presetClass`, `presetSubtype`, `fill="hold"`, `grpId="0"`, `nodeType="clickEffect|withEffect|afterEffect"`, `<p:cond delay="0"/>` | The effect. Its `p:childTnLst` holds the behaviours (`p:set`, `p:animEffect`, `p:anim`, `p:animScale`, `p:animRot`, `p:animMotion`), each with a `p:cBhvr` naming its own `p:cTn dur` in milliseconds and a `p:tgtEl/p:spTgt spid` pointing at the shape id. | [L6] [O14] [O16] |

`nodeType` values are `clickEffect`, `withEffect`, `afterEffect`, `mainSeq`, `interactiveSeq`, `clickPar`, `withGroup`, `afterGroup`, `tmRoot` [O16]. `presetClass` values are `entr`, `exit`, `emph`, `path`, `verb`, `mediacall` [O15]. `fill="hold"` keeps the end state after the effect [O14]. Every `p:cTn id` is unique within the slide and PowerPoint numbers them in document order [L6].

### 6.4 Google's fifteen animation types as presets

The `presetID` numbers come from LibreOffice's import table, which maps PowerPoint ids to effect names (L1, 199 rows). The ids Google's list needs:

| Google type | `presetClass` | `presetID` | `presetSubtype` | Behaviours inside the effect | Sample | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Appear | `entr` | 1 (ooo-entrance-appear) | 0 | `p:set style.visibility` to `visible`, `dur="1"` | PowerPoint authored, `tdf112089.pptx` | [L1] [L6] |
| Disappear | `exit` | 1 (ooo-exit-disappear) | 0 | `p:set style.visibility` to `hidden`, `dur="1"` | reconstructed (mirror of Appear) | [L1] [O27] |
| Fade in | `entr` | 10 (ooo-entrance-fade-in) | 0 | `p:set` visible, then `p:animEffect transition="in" filter="fade"` with `dur` | PowerPoint authored, `tdf104792-smart-art-animation.pptx` | [L1] [L6] [O21] |
| Fade out | `exit` | 10 (ooo-exit-fade-out) | 0 | `p:animEffect transition="out" filter="fade"` with `dur`, then `p:set` hidden at `delay = dur - 1` | PowerPoint authored, `tdf107608.pptx` | [L1] [L6] |
| Fly in from left | `entr` | 2 (ooo-entrance-fly-in) | 8 | `p:set` visible, `p:anim` on `ppt_x` from `0-#ppt_w/2` to `#ppt_x`, `p:anim` on `ppt_y` from `#ppt_y` to `#ppt_y`, both `calcmode="lin" valueType="num"`, `additive="base"` | PowerPoint authored, `tdf111884.pptx` | [L1] [L6] |
| Fly in from right | `entr` | 2 | 2 | as above with `ppt_x` from `1+#ppt_w/2` | reconstructed from the left sample | [L1] |
| Fly in from top | `entr` | 2 | 1 | `ppt_y` from `0-#ppt_h/2` to `#ppt_y`, `ppt_x` constant | reconstructed | [L1] |
| Fly in from bottom | `entr` | 2 | 4 | `ppt_y` from `1+#ppt_h/2` to `#ppt_y` | reconstructed | [L1] |
| Fly out to left, right, top, bottom | `exit` | 2 (ooo-exit-fly-out) | 8, 2, 1, 4 | the reverse `p:anim` pair (from `#ppt_x` to `0-#ppt_w/2` and so on), then `p:set` hidden at the end | reconstructed | [L1] |
| Zoom in | `entr` | 23 (ooo-entrance-zoom) | 16 ("in") | `p:set` visible, `p:animScale` with `p:from x="0" y="0"` and `p:to x="100000" y="100000"` (percent in thousandths) | reconstructed | [L1] [O23] |
| Zoom out | `exit` | 23 (ooo-exit-zoom) | 32 ("out") | `p:animScale` from `100000` to `0` (or to a small value such as `10000` as PowerPoint's exit 51 sample does), then `p:set` hidden | reconstructed | [L1] [L6] [O23] |
| Spin | `emph` | 8 (ooo-emphasis-spin) | 0 | `p:animRot by="21600000"` (one full turn in 60000ths of a degree) with `p:attrName r` | PowerPoint authored, `tdf112280.pptx` | [L1] [L6] [O22] |

Subtype numbers for directions, from the same table (L1): 1 from top, 2 from right, 3 from top right, 4 from bottom, 6 from bottom right, 8 from left, 9 from top left, 12 from bottom left, 16 in, 32 out. Zoom's 16 and 32 are the "in" and "out" subtypes; PowerPoint also uses 272 and 288 for "slightly" and 528 for "in from screen center", which Google does not need.

The `p:anim` expressions use PowerPoint's relative coordinate space: `ppt_x`, `ppt_y` are the shape centre as a fraction of the slide, `ppt_w`, `ppt_h` the shape size as a fraction, so `0-#ppt_w/2` is just off the left edge [L6] [O31].

### 6.5 Start conditions and By paragraph in the file

| Google control | File form | Source |
| --- | --- | --- |
| On click | The effect's `nodeType="clickEffect"`; it opens a new level 3 click group with `delay="indefinite"` and a level 4 group with `delay="0"`. | [L6] |
| With previous | `nodeType="withEffect"`; the effect `p:par` is appended to the same level 4 group as the effect it follows, with `delay="0"` (or a larger delay to offset it). If it is the first effect of the slide the click group gets the extra `onBegin` condition so it starts with the slide. | [L6] |
| After previous | `nodeType="afterEffect"`; PowerPoint opens a new level 4 group inside the same click group with `delay` equal to the end time of the previous group. The writer owns the arithmetic: end time of a group is the largest `delay + dur` of its behaviours. | [L6] [O14] |
| By paragraph | `<p:bldP spid="N" grpId="0" build="p"/>` in `p:bldLst` for the shape; one effect `p:par` per paragraph whose `p:spTgt` carries `<p:txEl><p:pRg st="k" end="k"/></p:txEl>`. With On click each paragraph is its own click group; with After previous each is its own level 4 group; with With previous they share a group. PowerPoint's own file also adds `<p:iterate type="lt"><p:tmPct val="10000"/></p:iterate>` on the effect when the text animates by letter, which Google does not need. | [L6] [O17] [O18] [O20] |
| Whole object (default) | `<p:bldP spid="N" grpId="0"/>` (build defaults to `whole`); `animBg="1"` when the shape's fill animates with the text. | [L6] [O17] |
| Speed | `dur` in milliseconds on each behaviour's `p:cTn`; the PowerPoint defaults in the samples are 500 ms for Fade, Fly and Spin and 1 ms for Appear's `p:set`. Google's slider value maps straight onto `dur`. | [L6] |

A complete PowerPoint authored slide with two Fade in effects, the first on the whole shape and the second on paragraph 0 of another shape (`subtitle-animation-save.pptx` in L6), trimmed only of its `p:iterate` children:

```xml
<p:timing>
  <p:tnLst>
    <p:par>
      <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
        <p:childTnLst>
          <p:seq concurrent="1" nextAc="seek">
            <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
              <p:childTnLst>
                <p:par>
                  <p:cTn id="3" fill="hold">
                    <p:stCondLst>
                      <p:cond delay="indefinite"/>
                      <p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>
                    </p:stCondLst>
                    <p:childTnLst>
                      <p:par>
                        <p:cTn id="4" fill="hold">
                          <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                          <p:childTnLst>
                            <p:par>
                              <p:cTn id="5" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="withEffect">
                                <p:stCondLst><p:cond delay="1000"/></p:stCondLst>
                                <p:childTnLst>
                                  <p:set>
                                    <p:cBhvr>
                                      <p:cTn id="6" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>
                                      <p:tgtEl><p:spTgt spid="2"/></p:tgtEl>
                                      <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
                                    </p:cBhvr>
                                    <p:to><p:strVal val="visible"/></p:to>
                                  </p:set>
                                  <p:animEffect transition="in" filter="fade">
                                    <p:cBhvr>
                                      <p:cTn id="7" dur="400"/>
                                      <p:tgtEl><p:spTgt spid="2"/></p:tgtEl>
                                    </p:cBhvr>
                                  </p:animEffect>
                                </p:childTnLst>
                              </p:cTn>
                            </p:par>
                            <p:par>
                              <p:cTn id="8" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="withEffect">
                                <p:stCondLst><p:cond delay="2000"/></p:stCondLst>
                                <p:childTnLst>
                                  <p:set>
                                    <p:cBhvr>
                                      <p:cTn id="9" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>
                                      <p:tgtEl><p:spTgt spid="3"><p:txEl><p:pRg st="0" end="0"/></p:txEl></p:spTgt></p:tgtEl>
                                      <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
                                    </p:cBhvr>
                                    <p:to><p:strVal val="visible"/></p:to>
                                  </p:set>
                                  <p:animEffect transition="in" filter="fade">
                                    <p:cBhvr>
                                      <p:cTn id="10" dur="400"/>
                                      <p:tgtEl><p:spTgt spid="3"><p:txEl><p:pRg st="0" end="0"/></p:txEl></p:spTgt></p:tgtEl>
                                    </p:cBhvr>
                                  </p:animEffect>
                                </p:childTnLst>
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
        </p:childTnLst>
      </p:cTn>
    </p:par>
  </p:tnLst>
  <p:bldLst>
    <p:bldP spid="2" grpId="0"/>
    <p:bldP spid="3" grpId="0" build="p"/>
  </p:bldLst>
</p:timing>
```

The PowerPoint authored effect bodies for Fly in from left and Spin, verbatim from `tdf111884.pptx` and `tdf112280.pptx` (L6):

```xml
<p:par>
  <p:cTn id="5" presetID="2" presetClass="entr" presetSubtype="8" fill="hold" nodeType="withEffect">
    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
    <p:childTnLst>
      <p:set>
        <p:cBhvr>
          <p:cTn id="6" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>
          <p:tgtEl><p:spTgt spid="6"/></p:tgtEl>
          <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
        </p:cBhvr>
        <p:to><p:strVal val="visible"/></p:to>
      </p:set>
      <p:anim calcmode="lin" valueType="num">
        <p:cBhvr additive="base">
          <p:cTn id="7" dur="500" fill="hold"/>
          <p:tgtEl><p:spTgt spid="6"/></p:tgtEl>
          <p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
        </p:cBhvr>
        <p:tavLst>
          <p:tav tm="0"><p:val><p:strVal val="0-#ppt_w/2"/></p:val></p:tav>
          <p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>
        </p:tavLst>
      </p:anim>
      <p:anim calcmode="lin" valueType="num">
        <p:cBhvr additive="base">
          <p:cTn id="8" dur="500" fill="hold"/>
          <p:tgtEl><p:spTgt spid="6"/></p:tgtEl>
          <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
        </p:cBhvr>
        <p:tavLst>
          <p:tav tm="0"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>
          <p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>
        </p:tavLst>
      </p:anim>
    </p:childTnLst>
  </p:cTn>
</p:par>

<p:par>
  <p:cTn id="5" presetID="8" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="withEffect">
    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
    <p:childTnLst>
      <p:animRot by="21600000">
        <p:cBhvr>
          <p:cTn id="6" dur="500" fill="hold"/>
          <p:tgtEl><p:spTgt spid="4"/></p:tgtEl>
          <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
        </p:cBhvr>
      </p:animRot>
    </p:childTnLst>
  </p:cTn>
</p:par>
```

And Fade out, verbatim from `tdf107608.pptx` (L6), showing the exit pattern of effect first and `p:set hidden` one millisecond before the end:

```xml
<p:par>
  <p:cTn id="5" presetID="10" presetClass="exit" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect">
    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
    <p:childTnLst>
      <p:animEffect transition="out" filter="fade">
        <p:cBhvr>
          <p:cTn id="6" dur="500"/>
          <p:tgtEl><p:spTgt spid="5"/></p:tgtEl>
        </p:cBhvr>
      </p:animEffect>
      <p:set>
        <p:cBhvr>
          <p:cTn id="7" dur="1" fill="hold"><p:stCondLst><p:cond delay="499"/></p:stCondLst></p:cTn>
          <p:tgtEl><p:spTgt spid="5"/></p:tgtEl>
          <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
        </p:cBhvr>
        <p:to><p:strVal val="hidden"/></p:to>
      </p:set>
    </p:childTnLst>
  </p:cTn>
</p:par>
```

### 6.6 What a reader of Google's transitions must accept

For the round five importer (scope item D) the transition reader should accept every ISO type and every `p14` type in the tables above and fold them onto Google's seven: `fade` and `cut` to Fade, `dissolve`, `randomBar`, `checker`, `blinds`, `random` and the other pattern wipes to Dissolve, `push` and `cover` with `dir="l"` to Slide from right and with `dir="r"` to Slide from left (vertical directions to the nearest horizontal one, reported), `p14:flip` and `p14:switch` to Flip, `p14:prism`, `p14:doors` and `p14:window` to Cube, `p14:gallery` and `p14:conveyor` to Gallery, and everything else to Fade with a line in the import report. LibreOffice's import context is the public example of such a fold [L4]. On the animation side the reader keeps `entr` 1, 2, 10 and 23, `exit` 1, 2, 10 and 23 and `emph` 8 with their subtypes, folds any other `entr` preset to Fade in, any other `exit` to Fade out, and reports `path`, other `emph`, `verb` and `mediacall` nodes as dropped [L1].

## 7. Turboslide today

The ship tree at `d5d7f07` has no motion. In `packages/chrome/src/menus/model.ts` the rows read: `view.motion` is `omit` with the reason "Section 0.5; the one Transition stub sits in Google's three Transition positions"; `insert.animation` is `omit` ("Section 0.5"); `slide.transition` is `later` with the `STILL_SLIDES` reason; the toolbar control `toolbar.transition` (label "Transition", `status: 'later'`) points at `slide.transition`; and `slide.transition` sits in the filmstrip and empty canvas context menus after `slide.changeTheme` [model.ts lines 1003 to 1005, 1325, 1832, 2435 to 2440, 2519 and 2538]. SPEC-2 section 12 lists "Transition, Motion, Animation, Animate" under Slide > Transition, toolbar 17 and the filmstrip menu with the note "The GT theme presents still slides" and the placeholders `SlideBase.transition`, `Block.animation` and "the present runtime". R02 section 8.3 and R08 rows A1 11, 14 and B10 record the panel's entry points and the side panel convention. Round five turns the three `omit` and `later` rows into `now` rows backed by one Motion panel, a `transition` field on the slide, an ordered `animations` list on the slide (each entry naming a block id, a type, a start, a by paragraph flag and a duration in milliseconds), the present runtime's step model of section 6.3, and the Editable text export post process of sections 6.1 to 6.5.

## 8. Unverified items

1. The transition list. Seven effects (Dissolve, Fade, Slide from right, Slide from left, Flip, Cube, Gallery) plus None is the list of the 2022 and 2025 walkthroughs; one 2026 page lists six and the 2019 page five. No Google page lists the names.
2. The behaviours of Dissolve, Slide and Gallery (push against cover, the scatter pattern, the rail direction) are descriptions by third parties, not by Google.
3. The speed slider's scale, tick labels and the value it displays. Google says only "drag the slider"; third parties give Slow, Medium and Fast marks, the word Duration, and a 0.5 s to 2 s range.
4. The default type of a new animation: Google's help says "Appear (On click)", a 2024 walkthrough says Fade in.
5. Whether Left arrow in the slideshow reverses one animation step or one slide, and whether Auto-play ticks advance one step or one slide.
6. The in show Auto-play interval wording; the list 1, 2, 3, 5, 10, 15, 30 seconds and 1 minute comes from third parties (R04 carried the same caveat).
7. Whether the published player plays transitions and click steps, and whether Presenter view previews the next step.
8. The exact OOXML Google writes on Download as .pptx. No Google authored file was inspected; third parties report that transitions and basic animations survive.
9. That objects with exit animations print in their resting state in the PDF.
10. The effect bodies for Disappear, Fly out, Zoom in and Zoom out are reconstructed from the schema and the neighbouring PowerPoint authored samples; the `presetID` and `presetSubtype` numbers for them are from LibreOffice's table and are not reconstructed.
11. The exact `delay` arithmetic PowerPoint uses for After previous groups (end of the previous group) is inferred from the samples, not stated by a specification page.
12. The body of Google's feature request 36761236 (sign in required); only the title and date were seen.

## 9. Sources

Google pages, read 2026-09-14:

- G1 Add or change animations and transitions (Computer). https://support.google.com/docs/answer/1689475?hl=en&co=GENIE.Platform%3DDesktop
- G2 The same page, Android tab ("To add or edit animations and slide transitions, use slides.google.com on a computer."). https://support.google.com/docs/answer/1689475?hl=en&co=GENIE.Platform%3DAndroid
- G3 Keyboard shortcuts for Google Slides. https://support.google.com/docs/answer/1696717?hl=en
- G4 Present slides. https://support.google.com/docs/answer/1696787?hl=en&co=GENIE.Platform%3DDesktop
- G5 Publish to the web. https://support.google.com/docs/answer/183965?hl=en&co=GENIE.Platform%3DDesktop
- G6 Slides API, presentations.pages (Page, SlideProperties, PageProperties, PageElement). https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages
- G7 Apps Script, class Slide. https://developers.google.com/apps-script/reference/slides/slide
- G8 Issue Tracker 36761236, "Expose creating and editing of animations via Slides API", 2016-11-21 (title only). https://issuetracker.google.com/issues/36761236
- S9 Community threads not readable without script: 5750628 (export to PPTX with animations), 135519342 (more transitions), 92405299 (animations for several objects). https://support.google.com/docs/thread/5750628 and siblings

Third party walkthroughs, read 2026-09-14:

- T1 Help Desk Geek, How To Add Animation to Google Slides, 2022-01-09. https://helpdeskgeek.com/how-to-add-animation-to-google-slides/
- T2 Art of Presentations, How to Animate in Google Slides, 2023-02-24. https://artofpresentations.com/animate-in-google-slides/
- T3 Plus AI, How to master Google Slides transitions and animations, 2025-07-11. https://plusai.com/blog/how-to-master-google-slides-transitions-and-animations/
- T4 Slidesgo School, How to Add Animations and Transitions in Google Slides, undated. https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-add-animations-and-transitions-in-google-slides
- T5 CustomGuide, Google Slides animations. http://www.customguide.com/course/google-slides/google-slides-animations
- T6 CustomGuide, How to add slide transitions in Google Slides. http://www.customguide.com/course/google-slides/how-to-add-slide-transitions-in-google-slides
- T7 CustomGuide, Present ("Click anywhere on a slide to advance one slide (or step)."). http://www.customguide.com/course/google-slides/google-slides-present
- T8 How-To Geek, How to Use Google Slides Animated Transitions, 2019-11-14. https://www.howtogeek.com/446536/how-to-use-google-slides-animated-transitions/
- T9 Slidee, How to Add a Transition in Google Slides (2026). https://slidee.ai/blog/learn-google-slides/add-a-transition-in-google-slides
- T10 SlidesAI, How to Add Transitions on Google Slides, 2023-12-16, updated 2026-08-14. https://www.slidesai.io/blog/add-transitions-google-slides
- T11 SlidesAI, How to Add Google Slides Animations, 2025-04-04, updated 2026-09-14. https://www.slidesai.io/blog/add-google-slides-animations
- T12 The Bricks, How to Add Animations to Google Slides, 2025-07-12. https://www.thebricks.com/resources/how-to-add-animations-to-google-slides
- T13 SlideModel, How to Animate on Google Slides, 2024-08-06. https://slidemodel.com/google-slides-animations/
- T14 Tella, Google Slides: Animations & Transitions, 2024-03-05. https://www.tella.com/blog/google-slides-animations-transitions
- T15 SlideGenius, What are the options for custom animation in Google Slides. https://www.slidegenius.com/cm-faq-question/what-are-the-options-for-custom-animation-in-google-slides
- T16 ChatSlide, How to Convert Google Slides to PowerPoint, 2026-05-09. https://www.chatslide.ai/guides/how-to-convert-google-slides-to-powerpoint
- T17 PPT Productivity, How to convert Google Slides to PowerPoint, 2024-07-04, updated 2026-05-07. https://pptproductivity.com/blog/how-to-convert-google-slides-to-powerpoint
- T18 SlideModel, How to Fix Compatibility Issues from PowerPoint to Google Slides, 2026-01-27. https://slidemodel.com/fix-compatibility-powerpoint-google-slides/

OOXML schema and Microsoft pages, read 2026-09-14:

- O1 datypic, p:transition. http://www.datypic.com/sc/ooxml/e-p_transition-1.html
- O2 datypic, ST_TransitionSpeed. http://www.datypic.com/sc/ooxml/t-p_ST_TransitionSpeed.html
- O3 Microsoft Learn, How to: Add transitions between slides in a presentation (Open XML SDK), 2025-04-03. https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-add-transitions-between-slides-in-a-presentation
- O4 [MS-PPTX] Slide Transitions example (ripple, p14:dur), updated 2024-08-20. https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/99b95b35-568a-4652-9cba-df3d1175952f
- O5 Open XML SDK, Transition class (attributes and the full child list including p14 and p15). https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition?view=openxml-3.0.1
- O6 Open XML SDK, DocumentFormat.OpenXml.Office2010.PowerPoint namespace (the p14 transition classes). https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint?view=openxml-3.0.1
- O7 FlipTransition, p14:flip, [MS-PPTX] 2.3.3. https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint.fliptransition?view=openxml-3.0.1
- O8 PrismTransition, p14:prism, [MS-PPTX] 2.3.6 and 2.5.3. https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint.prismtransition?view=openxml-3.0.1
- O9 GalleryTransition, p14:gallery, [MS-PPTX] 2.3.10. https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.powerpoint.gallerytransition?view=openxml-3.0.1
- O10 PushTransition, p:push with dir l, r, u, d. https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.pushtransition?view=openxml-3.0.1
- O11 FadeTransition, p:fade with thruBlk. https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.fadetransition?view=openxml-3.0.1
- O12 DissolveTransition, p:dissolve. https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.dissolvetransition?view=openxml-3.0.1
- O13 PresetTransition, p15:prstTrans. https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2013.powerpoint.presettransition?view=openxml-3.0.1
- O14 datypic, CT_TLCommonTimeNodeData. http://www.datypic.com/sc/ooxml/t-p_CT_TLCommonTimeNodeData.html
- O15 datypic, ST_TLTimeNodePresetClassType. http://www.datypic.com/sc/ooxml/t-p_ST_TLTimeNodePresetClassType.html
- O16 datypic, ST_TLTimeNodeType. http://www.datypic.com/sc/ooxml/t-p_ST_TLTimeNodeType.html
- O17 datypic, p:bldP. http://www.datypic.com/sc/ooxml/e-p_bldP-1.html
- O18 datypic, ST_TLParaBuildType. http://www.datypic.com/sc/ooxml/t-p_ST_TLParaBuildType.html
- O19 datypic, ST_TLTriggerEvent. http://www.datypic.com/sc/ooxml/t-p_ST_TLTriggerEvent.html
- O20 datypic, p:pRg. http://www.datypic.com/sc/ooxml/e-p_pRg-1.html
- O21 datypic, p:animEffect. http://www.datypic.com/sc/ooxml/e-p_animEffect-1.html
- O22 datypic, p:animRot. http://www.datypic.com/sc/ooxml/e-p_animRot-1.html
- O23 datypic, p:animScale. http://www.datypic.com/sc/ooxml/e-p_animScale-1.html
- O24 datypic, p:timing. http://www.datypic.com/sc/ooxml/e-p_timing-1.html
- O25 datypic, p:seq. http://www.datypic.com/sc/ooxml/e-p_seq-1.html
- O26 datypic, p:cond. http://www.datypic.com/sc/ooxml/e-p_cond-1.html
- O27 datypic, p:set. http://www.datypic.com/sc/ooxml/e-p_set-1.html
- O28 datypic, p:tgtEl. http://www.datypic.com/sc/ooxml/e-p_tgtEl-1.html
- O29 Microsoft Support, Set the timing and speed of a transition. https://support.microsoft.com/en-us/powerpoint/set-the-timing-and-speed-of-a-transition
- O30 Indezine, Slide Transition Duration in PowerPoint 2010 for Windows. https://www.indezine.com/products/powerpoint/learn/animationsandtransitions/slide-transition-duration-ppt2010.html
- O31 DEV Community, Generating animated LINE-style chat slides with python-pptx and raw XML (a p:timing sample with ppt_y expressions). https://dev.to/_76130e67067eab4c8510/generating-animated-line-style-chat-slides-with-python-pptx-raw-xml-and-shipping-it-on-vercel-3g32

LibreOffice source and test corpus (MPL 2.0, public, master branch, read 2026-09-14):

- L1 oox/source/ppt/commontimenodecontext.cxx (the `preset_mapping` table of presetClass, presetID and effect name, 199 rows, and the `convert_subtype` table of presetSubtype numbers). https://github.com/LibreOffice/core/blob/master/oox/source/ppt/commontimenodecontext.cxx
- L2 sd/source/filter/eppt/pptx-epptooxml.cxx, `WriteTransition` (spd thresholds, p14:dur, the p14 element per transition, mc:AlternateContent). https://github.com/LibreOffice/core/blob/master/sd/source/filter/eppt/pptx-epptooxml.cxx
- L3 sd/source/filter/eppt/pptx-animations.cxx (how nodeType, presetID, presetSubtype, cond, seq, tgtEl and pRg are written). https://github.com/LibreOffice/core/blob/master/sd/source/filter/eppt/pptx-animations.cxx
- L4 oox/source/ppt/slidetransitioncontext.cxx (the import fold of ISO, p14 and p15 transition elements). https://github.com/LibreOffice/core/blob/master/oox/source/ppt/slidetransitioncontext.cxx
- L5 sd/qa/unit/export-tests-ooxml3.cxx (asserted p:timing XPaths). https://github.com/LibreOffice/core/blob/master/sd/qa/unit/export-tests-ooxml3.cxx
- L6 PowerPoint authored test decks under sd/qa/unit/data/pptx/: tdf104792-smart-art-animation.pptx (Fade in, clickEffect), tdf104786.pptx (exit preset 51 with animScale), subtitle-animation-save.pptx (withEffect, onBegin, By paragraph with bldP build="p" and pRg), connector-shape-animations.pptx (Wipe, withEffect), tdf111884.pptx (Fly in from left, presetSubtype 8), tdf112280.pptx (Spin, animRot by 21600000), tdf112089.pptx (Appear), tdf107608.pptx (Fade out), bnc591147.pptx (afterEffect). https://github.com/LibreOffice/core/tree/master/sd/qa/unit/data/pptx

Turboslide documents:

- R01 docs/gslides-parity/research/01-menu-bar.md (View > Motion, Insert > Animation, Slide > Transition rows).
- R02 docs/gslides-parity/research/02-editor-surface.md (toolbar position 17, section 8.3 Motion panel).
- R03 docs/gslides-parity/research/03-home-themes-layouts-io.md (Publish dialog intervals and checkboxes).
- R04 docs/gslides-parity/research/04-present-and-shortcuts.md (slideshow toolbar, Auto-play, Presenter view).
- R08 docs/gslides-parity/research/08-context-menus-and-menu-conventions.md (context menu rows 11 and 14, side panel B10).
- SPEC-2 docs/gslides-parity/SPEC-2.md section 12 (the deferred motion row).
- packages/chrome/src/menus/model.ts at d5d7f07 (the omit and later rows named in section 7).
