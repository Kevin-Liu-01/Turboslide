86 of 151 asserted rows met (190 rows; 60 rows gained on the baseline, 35 lost, 14 unchanged, 81 new); run 2026-09-14T23:17:27.493Z to 2026-09-14T23:21:46.129Z against https://turboslide.vercel.app (deployment); baseline 2026-09-14T14:30:49.719Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 146 ms          | 200       | ok       | 95        | +51 (+54%) loss        |
| routes      | / cold fcp                                                                           | 340 ms          |           | reported | 300       | +40 (+13%) loss        |
| routes      | / cold lcp                                                                           | 376 ms          | 700       | ok       | 924       | -548 (-59%) gain       |
| routes      | / cold ready                                                                         | 500 ms          | 700       | ok       | 908       | -407.60 (-45%) gain    |
| routes      | / cold js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / cold largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / cold longest animation frame                                                       | 122 ms          | 150       | ok       | 67        | +55 (+82%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 496 live elements)                                       | 589             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 120 ms          | 150       | ok       | 91        | +29 (+32%) loss        |
| routes      | / warm fcp                                                                           | 192 ms          |           | reported | 280       | -88 (-31%) gain        |
| routes      | / warm lcp                                                                           | 192 ms          | 400       | ok       | 896       | -704 (-79%) gain       |
| routes      | / warm ready                                                                         | 309 ms          | 400       | ok       | 877       | -568.10 (-65%) gain    |
| routes      | / warm js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / warm largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / warm longest animation frame                                                       | 60 ms           | 150       | ok       | 59        | +1 (+2%) loss          |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 496 live elements)                                       | 589             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 79 ms           | 150       | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 276 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 276 ms          | 800       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 194 ms          | 800       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold longest animation frame                                                   | 143 ms          | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 12 ms           | 100       | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 80 ms           |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 80 ms           | 400       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 36 ms           | 400       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 215 ms          | 200       | MISS     | 113       | +101 (+89%) loss       |
| routes      | /new cold fcp                                                                        | 460 ms          | 400       | MISS     | 208       | +252 (+121%) loss      |
| routes      | /new cold lcp                                                                        | 508 ms          | 700       | ok       | 844       | -336 (-40%) gain       |
| routes      | /new cold ready                                                                      | 570 ms          | 700       | ok       | 823       | -253.50 (-31%) gain    |
| routes      | /new cold js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new cold largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new cold longest animation frame                                                    | 63 ms           | 150       | ok       | 67        | -4 (-6%) gain          |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 496 live elements)                                    | 589             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 400 ms          |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 172 ms          | 150       | MISS     | 83        | +89 (+107%) loss       |
| routes      | /new warm fcp                                                                        | 252 ms          | 250       | MISS     | 148       | +104 (+70%) loss       |
| routes      | /new warm lcp                                                                        | 292 ms          | 400       | ok       | 764       | -472 (-62%) gain       |
| routes      | /new warm ready                                                                      | 353 ms          | 400       | ok       | 750       | -396.70 (-53%) gain    |
| routes      | /new warm js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new warm largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new warm longest animation frame                                                    | 53 ms           | 150       | ok       | 60        | -7 (-12%) gain         |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 496 live elements)                                    | 589             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 409 ms          | 400       | MISS     | 5335      | -4925.86 (-92%) gain   |
| routes      | /decks cold fcp                                                                      | 1,460 ms        |           | reported | 5,644     | -4,184 (-74%) gain     |
| routes      | /decks cold lcp                                                                      | 1,568 ms        | 1,000     | MISS     | 6,072     | -4,504 (-74%) gain     |
| routes      | /decks cold ready                                                                    | 1532 ms         | 1,000     | MISS     | 5705      | -4173.10 (-73%) gain   |
| routes      | /decks cold js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks cold largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 111 ms          | 150       | ok       | 152       | -41 (-27%) gain        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 282 live elements)                                  | 400             |           | reported |           | new row                |
| routes      | /decks cold images with 17 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 3782 ms         |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 235 ms          | 300       | ok       | 6300      | -6065.33 (-96%) gain   |
| routes      | /decks warm fcp                                                                      | 328 ms          |           | reported | 6,420     | -6,092 (-95%) gain     |
| routes      | /decks warm lcp                                                                      | 420 ms          | 600       | ok       | 6,728     | -6,308 (-94%) gain     |
| routes      | /decks warm ready                                                                    | 379 ms          | 600       | ok       | 6492      | -6112.50 (-94%) gain   |
| routes      | /decks warm js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks warm largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 66 ms           | 150       | ok       | 85        | -19 (-22%) gain        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 282 live elements)                                  | 400             |           | reported |           | new row                |
| routes      | /decks warm images with 17 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 294 ms          | 400       | ok       | 412       | -117.92 (-29%) gain    |
| routes      | /decks/trash cold fcp                                                                | 424 ms          |           | reported | 524       | -100 (-19%) gain       |
| routes      | /decks/trash cold lcp                                                                | 424 ms          | 1,000     | ok       | 560       | -136 (-24%) gain       |
| routes      | /decks/trash cold ready                                                              | 502 ms          | 1,000     | ok       | 640       | -137.80 (-22%) gain    |
| routes      | /decks/trash cold js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash cold largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 68 ms           | 150       | ok       | 85        | -17 (-20%) gain        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 88 live elements)                             | 110             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 292 ms          | 300       | ok       | 396       | -103.84 (-26%) gain    |
| routes      | /decks/trash warm fcp                                                                | 356 ms          |           | reported | 480       | -124 (-26%) gain       |
| routes      | /decks/trash warm lcp                                                                | 356 ms          | 600       | ok       | 488       | -132 (-27%) gain       |
| routes      | /decks/trash warm ready                                                              | 408 ms          | 600       | ok       | 536       | -128.10 (-24%) gain    |
| routes      | /decks/trash warm js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash warm largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 59        | -59 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 88 live elements)                             | 110             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 504 ms          | 500       | MISS     | 248       | +256 (+103%) loss      |
| routes      | /deck/gt-brand cold fcp                                                              | 808 ms          |           | reported | 376       | +432 (+115%) loss      |
| routes      | /deck/gt-brand cold lcp                                                              | 808 ms          | 600       | MISS     | 400       | +408 (+102%) loss      |
| routes      | /deck/gt-brand cold ready                                                            | 1067 ms         | 800       | MISS     | 560       | +507 (+90%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 172 ms          | 150       | MISS     | 99        | +73 (+74%) loss        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1601 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 505 ms          | 400       | MISS     | 209       | +296 (+142%) loss      |
| routes      | /deck/gt-brand warm fcp                                                              | 628 ms          |           | reported | 300       | +328 (+109%) loss      |
| routes      | /deck/gt-brand warm lcp                                                              | 644 ms          | 400       | MISS     | 324       | +320 (+99%) loss       |
| routes      | /deck/gt-brand warm ready                                                            | 831 ms          | 600       | MISS     | 452       | +380 (+84%) loss       |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 58 ms           | 150       | ok       | 61        | -3 (-5%) gain          |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1601 live elements)                         | 2,501           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 1,986,652 bytes |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 345 ms          | 200       | MISS     | 141       | +205 (+146%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 596 ms          | 400       | MISS     | 516       | +80 (+16%) loss        |
| routes      | /edit/gt-brand cold lcp                                                              | 944 ms          | 1,200     | ok       | 1,308     | -364 (-28%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 857 ms          | 1,200     | ok       | 1267      | -409.70 (-32%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 206 ms          | 150       | MISS     | 321       | -115 (-36%) gain       |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1770 live elements)                         | 2,578           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 315 ms          | 150       | MISS     | 120       | +195 (+162%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 404 ms          | 250       | MISS     | 180       | +224 (+124%) loss      |
| routes      | /edit/gt-brand warm lcp                                                              | 780 ms          | 700       | MISS     | 896       | -116 (-13%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 756 ms          | 700       | MISS     | 862       | -106.60 (-12%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 141 ms          | 150       | ok       | 100       | +41 (+41%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1813 live elements)                         | 2,621           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 2127 ms         | 200       | MISS     | 141       | +1985 (+1405%) loss    |
| routes      | /present/gt-brand cold fcp                                                           | 2,272 ms        |           | reported | 996       | +1,276 (+128%) loss    |
| routes      | /present/gt-brand cold lcp                                                           | 2,272 ms        | 800       | MISS     | 1,020     | +1,252 (+123%) loss    |
| routes      | /present/gt-brand cold ready                                                         | 2437 ms         | 800       | MISS     | 974       | +1462 (+150%) loss     |
| routes      | /present/gt-brand cold js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand cold largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 72 ms           | 150       | ok       | 63        | +9 (+14%) loss         |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 458 ms          | 150       | MISS     | 135       | +323 (+240%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 540 ms          |           | reported | 852       | -312 (-37%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 540 ms          | 500       | MISS     | 888       | -348 (-39%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 677 ms          | 500       | MISS     | 834       | -157.60 (-19%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand warm largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 50 ms           | 150       | ok       | 60        | -10 (-17%) gain        |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 168 ms          | 500       | ok       | 598       | -430.50 (-72%) gain    |
| transitions | back (wall)                                                                          | 21 ms           | 100       | ok       | 18        | +3 (+17%) loss         |
| transitions | edit->decks (in page)                                                                | 16 ms           | 400       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 6.10 ms         | 400       | ok       | 3.80      | +2.30 (+61%) loss      |
| transitions | home->new (wall, document navigation)                                                | 413 ms          | 300       | MISS     |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 13 ms           | 50        | ok       | 14        | -1.20 (-8%) gain       |
| transitions | slideshow (in page, painted frame)                                                   | 12 ms           | 50        | ok       | 18        | -5.30 (-30%) gain      |
| transitions | layoutGrid (in page, painted frame)                                                  | 11 ms           | 50        | ok       | 11        | -0.80 (-7%) gain       |
| filmstrip   | first pass longest frame                                                             | 42 ms           | 100       | ok       | 17        | +25 (+146%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 17 ms           | 20        | ok       | 10        | +6.60 (+65%) loss      |
| filmstrip   | steady passes longest frame                                                          | 42 ms           | 50        | ok       | 18        | +24 (+137%) loss       |
| filmstrip   | steady passes fps                                                                    | 102 fps         | 50        | ok       | 119       | -17.31 (-14%) loss     |
| filmstrip   | dom nodes with 85 cards (after GC; 2133 live elements)                               | 5,923           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 3               | 4         | ok       | 465       | -462 (-99%) gain       |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       |           | new row                |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       |           | new row                |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache HIT)            | 1               | 1         | ok       |           | new row                |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache HIT)               | 1               | 1         | ok       |           | new row                |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       |           | new row                |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       |           | new row                |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache HIT)     | 1               | 1         | ok       |           | new row                |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache HIT)      | 1               | 1         | ok       |           | new row                |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache HIT)                   | 1               | 1         | ok       |           | new row                |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | new row                |
