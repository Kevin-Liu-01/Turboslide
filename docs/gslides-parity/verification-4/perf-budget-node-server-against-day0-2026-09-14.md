104 of 151 asserted rows met (199 rows; 56 rows gained on the baseline, 35 lost, 17 unchanged, 91 new); run 2026-09-14T22:27:35.649Z to 2026-09-14T22:31:19.488Z against http://localhost:4321 (local); baseline 2026-09-14T14:53:08.794Z against http://localhost:4346 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 8.56 ms         | 60        | ok       | 1.60      | +6.96 (+435%) loss     |
| routes      | / cold fcp                                                                           | 92 ms           |           | reported | 60        | +32 (+53%) loss        |
| routes      | / cold lcp                                                                           | 96 ms           | 450       | ok       | 692       | -596 (-86%) gain       |
| routes      | / cold ready                                                                         | 280 ms          | 450       | ok       | 673       | -392.90 (-58%) gain    |
| routes      | / cold js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / cold largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / cold longest animation frame                                                       | 73 ms           | 150       | ok       | 62        | +11 (+18%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 498 live elements)                                       | 592             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 6.65 ms         | 40        | ok       | 1.84      | +4.81 (+262%) loss     |
| routes      | / warm fcp                                                                           | 96 ms           |           | reported | 60        | +36 (+60%) loss        |
| routes      | / warm lcp                                                                           | 96 ms           | 250       | ok       | 672       | -576 (-86%) gain       |
| routes      | / warm ready                                                                         | 257 ms          | 250       | MISS     | 653       | -395.90 (-61%) gain    |
| routes      | / warm js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / warm largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / warm longest animation frame                                                       | 76 ms           | 150       | ok       | 60        | +16 (+27%) loss        |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 498 live elements)                                       | 592             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 5.88 ms         | 60        | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 84 ms           |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 84 ms           | 400       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 37 ms           | 400       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 0.07 ms         | 40        | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 72 ms           |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 72 ms           | 200       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 29 ms           | 200       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 4.00 ms         | 60        | ok       | 2.02      | +1.99 (+98%) loss      |
| routes      | /new cold fcp                                                                        | 88 ms           | 250       | ok       | 64        | +24 (+38%) loss        |
| routes      | /new cold lcp                                                                        | 88 ms           | 450       | ok       | 688       | -600 (-87%) gain       |
| routes      | /new cold ready                                                                      | 185 ms          | 450       | ok       | 672       | -486.70 (-72%) gain    |
| routes      | /new cold js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new cold largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new cold longest animation frame                                                    | 65 ms           | 150       | ok       | 63        | +2 (+3%) loss          |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 498 live elements)                                    | 592             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 7.67 ms         |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 3.42 ms         | 40        | ok       | 2.00      | +1.43 (+71%) loss      |
| routes      | /new warm fcp                                                                        | 88 ms           | 150       | ok       | 60        | +28 (+47%) loss        |
| routes      | /new warm lcp                                                                        | 88 ms           | 250       | ok       | 660       | -572 (-87%) gain       |
| routes      | /new warm ready                                                                      | 148 ms          | 250       | ok       | 648       | -499.90 (-77%) gain    |
| routes      | /new warm js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new warm largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new warm longest animation frame                                                    | 51 ms           | 150       | ok       | 61        | -10 (-16%) gain        |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 498 live elements)                                    | 592             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 21 ms           | 150       | ok       | 18        | +2.99 (+17%) loss      |
| routes      | /decks cold fcp                                                                      | 112 ms          |           | reported | 120       | -8 (-7%) gain          |
| routes      | /decks cold lcp                                                                      | 212 ms          | 500       | ok       | 212       | same                   |
| routes      | /decks cold ready                                                                    | 167 ms          | 500       | ok       | 179       | -12.10 (-7%) gain      |
| routes      | /decks cold js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks cold largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 57 ms           | 150       | ok       | 63        | -6 (-10%) gain         |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 552 live elements)                                  | 744             |           | reported |           | new row                |
| routes      | /decks cold images with 47 cards (decoded)                                           | 563,188 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 25 ms           |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 22 ms           | 100       | ok       | 18        | +3.99 (+22%) loss      |
| routes      | /decks warm fcp                                                                      | 104 ms          |           | reported | 116       | -12 (-10%) gain        |
| routes      | /decks warm lcp                                                                      | 184 ms          | 300       | ok       | 208       | -24 (-12%) gain        |
| routes      | /decks warm ready                                                                    | 141 ms          | 300       | ok       | 177       | -35.90 (-20%) gain     |
| routes      | /decks warm js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks warm largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 0 ms            | 150       | ok       | 59        | -59 (-100%) gain       |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 552 live elements)                                  | 744             |           | reported |           | new row                |
| routes      | /decks warm images with 47 cards (decoded)                                           | 563,188 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 12 ms           | 150       | ok       | 10        | +1.86 (+18%) loss      |
| routes      | /decks/trash cold fcp                                                                | 100 ms          |           | reported | 68        | +32 (+47%) loss        |
| routes      | /decks/trash cold lcp                                                                | 100 ms          | 500       | ok       | 76        | +24 (+32%) loss        |
| routes      | /decks/trash cold ready                                                              | 91 ms           | 500       | ok       | 135       | -43.30 (-32%) gain     |
| routes      | /decks/trash cold js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash cold largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 52 ms           | 150       | ok       | 64        | -12 (-19%) gain        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 101 live elements)                            | 126             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 9,624 bytes     |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 12 ms           | 100       | ok       | 10        | +1.79 (+18%) loss      |
| routes      | /decks/trash warm fcp                                                                | 60 ms           |           | reported | 72        | -12 (-17%) gain        |
| routes      | /decks/trash warm lcp                                                                | 68 ms           | 300       | ok       | 128       | -60 (-47%) gain        |
| routes      | /decks/trash warm ready                                                              | 89 ms           | 300       | ok       | 120       | -31.20 (-26%) gain     |
| routes      | /decks/trash warm js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash warm largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 62        | -62 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 101 live elements)                            | 126             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 9,624 bytes     |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 32 ms           | 250       | ok       | 34        | -2.52 (-7%) gain       |
| routes      | /deck/gt-brand cold fcp                                                              | 132 ms          |           | reported | 140       | -8 (-6%) gain          |
| routes      | /deck/gt-brand cold lcp                                                              | 132 ms          | 500       | ok       | 140       | -8 (-6%) gain          |
| routes      | /deck/gt-brand cold ready                                                            | 223 ms          | 600       | ok       | 231       | -8.40 (-4%) gain       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 59 ms           | 150       | ok       | 64        | -5 (-8%) gain          |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1601 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 860,399 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 31 ms           | 150       | ok       | 32        | -0.11 (-0%) gain       |
| routes      | /deck/gt-brand warm fcp                                                              | 140 ms          |           | reported | 124       | +16 (+13%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 140 ms          | 300       | ok       | 124       | +16 (+13%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 239 ms          | 400       | ok       | 216       | +23 (+11%) loss        |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1601 live elements)                         | 2,501           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 1,986,652 bytes |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 82 ms           | 60        | MISS     | 2.37      | +80 (+3368%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 152 ms          | 250       | ok       | 60        | +92 (+153%) loss       |
| routes      | /edit/gt-brand cold lcp                                                              | 436 ms          | 700       | ok       | 796       | -360 (-45%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 419 ms          | 700       | ok       | 728       | -308.70 (-42%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 155 ms          | 150       | MISS     | 90        | +65 (+72%) loss        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1839 live elements)                         | 2,649           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 86 ms           | 40        | MISS     | 1.95      | +84 (+4316%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 164 ms          | 150       | MISS     | 60        | +104 (+173%) loss      |
| routes      | /edit/gt-brand warm lcp                                                              | 416 ms          | 450       | ok       | 720       | -304 (-42%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 388 ms          | 450       | ok       | 699       | -311.60 (-45%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 127 ms          | 150       | ok       | 93        | +34 (+37%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1822 live elements)                         | 2,633           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 36 ms           | 60        | ok       | 1.91      | +34 (+1783%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 128 ms          |           | reported | 692       | -564 (-82%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 128 ms          | 500       | ok       | 700       | -572 (-82%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 183 ms          | 500       | ok       | 667       | -484.20 (-73%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand cold largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 58 ms           | 150       | ok       | 59        | -1 (-2%) gain          |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 40 ms           | 40        | MISS     | 1.97      | +38 (+1941%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 112 ms          |           | reported | 668       | -556 (-83%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 112 ms          | 300       | ok       | 808       | -696 (-86%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 204 ms          | 300       | ok       | 646       | -442 (-68%) gain       |
| routes      | /present/gt-brand warm js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand warm largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 64 ms           | 150       | ok       | 60        | +4 (+7%) loss          |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 107 ms          | 300       | ok       |           | new row                |
| transitions | back (wall)                                                                          | 35 ms           | 100       | ok       |           | new row                |
| transitions | edit->decks (in page)                                                                | 15 ms           | 300       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 5.60 ms         | 300       | ok       |           | new row                |
| transitions | home->new (wall, document navigation)                                                | 131 ms          | 300       | ok       |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 12 ms           | 50        | ok       |           | new row                |
| transitions | slideshow (in page, painted frame)                                                   | 13 ms           | 50        | ok       |           | new row                |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.20 ms         | 50        | ok       |           | new row                |
| filmstrip   | first pass longest frame                                                             | 50 ms           | 100       | ok       | 17        | +33 (+201%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 25 ms           | 20        | MISS     | 10        | +15 (+151%) loss       |
| filmstrip   | steady passes longest frame                                                          | 42 ms           | 50        | ok       | 17        | +25 (+146%) loss       |
| filmstrip   | steady passes fps                                                                    | 90 fps          | 50        | ok       | 120       | -29.51 (-25%) loss     |
| filmstrip   | dom nodes with 85 cards (after GC; 2203 live elements)                               | 5,148           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 5               | 4         | MISS     | 5         | same                   |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       |           | new row                |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       |           | new row                |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache none)           | 0               |           | reported |           | new row                |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache none)              | 0               |           | reported |           | new row                |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache none)  | 0               |           | reported |           | new row                |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache none)  | 0               |           | reported |           | new row                |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache none)    | 0               |           | reported |           | new row                |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache none)     | 0               |           | reported |           | new row                |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache none)                  | 0               |           | reported |           | new row                |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | new row                |
| write       | text burst: last keyup to local commit                                               | 90 ms           | 450       | ok       | 92        | -1.90 (-2%) gain       |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 90 ms           | 600       | ok       |           | new row                |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | new row                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                   |
| write       | new slide: pointerdown to painted card                                               | 8.70 ms         | 16        | ok       | 9.10      | -0.40 (-4%) gain       |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2023 ms         | 250       | MISS     |           | new row                |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2023 ms         |           | reported |           | new row                |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 1,561 ms        | 2,000     | ok       | 1,470     | +91 (+6%) loss         |
| write       | home card of the scratch deck on the next /decks visit                               | 1590 ms         | 1,500     | MISS     | 1,489     | +101 (+7%) loss        |
