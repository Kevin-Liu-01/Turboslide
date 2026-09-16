# Motion fixture deck

The deck the round five motion gates run on (gslides-parity SPEC-5 2.6, 0.54; MILESTONES-5 B1):
eleven slides on the GT theme at 1600 by 900, every one carrying motion, so `compileMotion`,
`motionCss`, the PPTX timing and transition writers, the ODP animation writer, the standalone
motion script and `apps/studio/e2e/motion.spec.ts` compare against one schedule snapshot
(`packages/render/src/__tests__/__snapshots__/motion.test.ts.snap`). The Perfect export of this
deck shows every object at rest (SPEC-5 0.3). Generated once by a script in the builder's
scratchpad and committed; edit the JSON by hand from here.

| Slide            | Transition             | Animations                                                                                                                                                                                                                                                                                                         | Clicks |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `t-none`         | None (stored as none)  | Appear on click on a rectangle                                                                                                                                                                                                                                                                                     | 1      |
| `t-dissolve`     | Dissolve, 500 ms       | Fade in on click on an ellipse                                                                                                                                                                                                                                                                                     | 1      |
| `t-fade`         | Fade, 500 ms           | Fly in from left, After previous, on a text box (a first After previous joins the entry step)                                                                                                                                                                                                                      | 0      |
| `t-slide-right`  | Slide from right, 1 s  | Zoom in, With previous, on a diamond (a first With previous joins the entry step)                                                                                                                                                                                                                                  | 0      |
| `t-slide-left`   | Slide from left, 1 s   | Spin on click on a star, 2 s                                                                                                                                                                                                                                                                                       | 1      |
| `t-flip`         | Flip, 2 s              | Fade out on click on a box                                                                                                                                                                                                                                                                                         | 1      |
| `t-cube`         | Cube, 999 ms           | Disappear on click on a hexagon                                                                                                                                                                                                                                                                                    | 1      |
| `t-gallery`      | Gallery, 5 s           | Zoom out, After previous, on a rounded rectangle                                                                                                                                                                                                                                                                   | 0      |
| `effects`        | none                   | The fifteen effects over fifteen blocks (shapes, text boxes, a box, an icon, a rule, a table, a chart) in a mixed trigger order: click, With previous, After previous repeating, so every step holds a group                                                                                                        | 6      |
| `paragraphs`     | none                   | A flow layout (cols): Fly in from top, With previous, on the heading (the fly offset falls back to the page height); Fade in on click By paragraph on a three paragraph text; Appear, After previous, By paragraph on a four item list chained behind the third paragraph; Disappear on click on the list afterwards | 4      |
| `media`          | none                   | A video (`bars-1s`, Play automatically) with a Play row With previous on the entry step, lasting the asset's 1000 ms; an audio (`tone-1s`, Play on click, volume 50) with no row                                                                                                                                    | 0      |

The three transition durations 500, 999 and 1000 ms are the `spd` thresholds of SPEC-5 0.11
(`transition.test.ts`). Fifteen clicks over the deck.

## The media files

Two stored media assets under `assets/`, digest named, generated once with ffmpeg 8.1.2 and
committed (the check chain never runs ffmpeg):

```
ffmpeg -y -f lavfi -i "smptebars=duration=1:size=320x180:rate=25" -c:v libvpx-vp9 -b:v 200k -pix_fmt yuv420p -an bars-1s.webm
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1:sample_rate=44100" -c:a pcm_s16le tone-1s.wav
```

`bars-1s.e5f1f192.webm` is 1,856 bytes of VP9 at 320 by 180, one second; `tone-1s.c087187e.wav`
is 88,278 bytes of 16 bit PCM at 44.1 kHz, one second. The `deck.media` records carry the bytes,
the sha256, the duration ffprobe reports (1000 ms) and the codec names; B2's sniff and parsers may
rewrite `codecs` through `media.info --refresh` without changing the schedule. Neither block names
a poster, so the renderer draws the resting media box.
