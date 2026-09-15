93 of 151 asserted rows met (190 rows; 58 rows gained on the baseline, 37 lost, 14 unchanged, 81 new); run 2026-09-15T03:38:08.308Z to 2026-09-15T03:42:18.267Z against https://turboslide.vercel.app (deployment); baseline 2026-09-14T14:30:49.719Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 126 ms          | 200       | ok       | 95        | +31 (+33%) loss        |
| routes      | / cold fcp                                                                           | 332 ms          |           | reported | 300       | +32 (+11%) loss        |
| routes      | / cold lcp                                                                           | 364 ms          | 700       | ok       | 924       | -560 (-61%) gain       |
| routes      | / cold ready                                                                         | 456 ms          | 700       | ok       | 908       | -452.10 (-50%) gain    |
| routes      | / cold js decoded                                                                    | 2,260,306 bytes | 2,000,000 | MISS     | 3,122,113 | -861,807 (-28%) gain   |
| routes      | / cold largest js (index-CDkNPPA9.js)                                                | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / cold longest animation frame                                                       | 130 ms          | 150       | ok       | 67        | +63 (+94%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 496 live elements)                                       | 589             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 116 ms          | 150       | ok       | 91        | +25 (+28%) loss        |
| routes      | / warm fcp                                                                           | 196 ms          |           | reported | 280       | -84 (-30%) gain        |
| routes      | / warm lcp                                                                           | 196 ms          | 400       | ok       | 896       | -700 (-78%) gain       |
| routes      | / warm ready                                                                         | 288 ms          | 400       | ok       | 877       | -588.70 (-67%) gain    |
| routes      | / warm js decoded                                                                    | 2,260,306 bytes | 2,000,000 | MISS     | 3,122,113 | -861,807 (-28%) gain   |
| routes      | / warm largest js (index-CDkNPPA9.js)                                                | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / warm longest animation frame                                                       | 53 ms           | 150       | ok       | 59        | -6 (-10%) gain         |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 496 live elements)                                       | 589             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 53 ms           | 150       | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 164 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 196 ms          | 800       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 127 ms          | 800       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 988,790 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-CDkNPPA9.js)                                            | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold longest animation frame                                                   | 80 ms           | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 18 ms           | 100       | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 112 ms          |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 112 ms          | 400       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 66 ms           | 400       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 988,790 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-CDkNPPA9.js)                                            | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 142 ms          | 200       | ok       | 113       | +28 (+25%) loss        |
| routes      | /new cold fcp                                                                        | 320 ms          | 400       | ok       | 208       | +112 (+54%) loss       |
| routes      | /new cold lcp                                                                        | 384 ms          | 700       | ok       | 844       | -460 (-55%) gain       |
| routes      | /new cold ready                                                                      | 501 ms          | 700       | ok       | 823       | -322.60 (-39%) gain    |
| routes      | /new cold js decoded                                                                 | 2,260,306 bytes | 2,000,000 | MISS     | 3,122,113 | -861,807 (-28%) gain   |
| routes      | /new cold largest js (index-CDkNPPA9.js)                                             | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new cold longest animation frame                                                    | 126 ms          | 150       | ok       | 67        | +59 (+88%) loss        |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 496 live elements)                                    | 589             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 149 ms          |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 117 ms          | 150       | ok       | 83        | +34 (+41%) loss        |
| routes      | /new warm fcp                                                                        | 208 ms          | 250       | ok       | 148       | +60 (+41%) loss        |
| routes      | /new warm lcp                                                                        | 224 ms          | 400       | ok       | 764       | -540 (-71%) gain       |
| routes      | /new warm ready                                                                      | 374 ms          | 400       | ok       | 750       | -375.80 (-50%) gain    |
| routes      | /new warm js decoded                                                                 | 2,260,306 bytes | 2,000,000 | MISS     | 3,122,113 | -861,807 (-28%) gain   |
| routes      | /new warm largest js (index-CDkNPPA9.js)                                             | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new warm longest animation frame                                                    | 79 ms           | 150       | ok       | 60        | +19 (+32%) loss        |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 496 live elements)                                    | 589             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 484 ms          | 400       | MISS     | 5335      | -4850.67 (-91%) gain   |
| routes      | /decks cold fcp                                                                      | 720 ms          |           | reported | 5,644     | -4,924 (-87%) gain     |
| routes      | /decks cold lcp                                                                      | 720 ms          | 1,000     | ok       | 6,072     | -5,352 (-88%) gain     |
| routes      | /decks cold ready                                                                    | 785 ms          | 1,000     | ok       | 5705      | -4919.60 (-86%) gain   |
| routes      | /decks cold js decoded                                                               | 2,177,480 bytes | 600,000   | MISS     | 3,045,067 | -867,587 (-28%) gain   |
| routes      | /decks cold largest js (index-CDkNPPA9.js)                                           | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 133 ms          | 150       | ok       | 152       | -19 (-13%) gain        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 363 live elements)                                  | 517             |           | reported |           | new row                |
| routes      | /decks cold images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 2495 ms         |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 334 ms          | 300       | MISS     | 6300      | -5966.16 (-95%) gain   |
| routes      | /decks warm fcp                                                                      | 440 ms          |           | reported | 6,420     | -5,980 (-93%) gain     |
| routes      | /decks warm lcp                                                                      | 896 ms          | 600       | MISS     | 6,728     | -5,832 (-87%) gain     |
| routes      | /decks warm ready                                                                    | 473 ms          | 600       | ok       | 6492      | -6019.00 (-93%) gain   |
| routes      | /decks warm js decoded                                                               | 2,177,480 bytes | 600,000   | MISS     | 3,045,067 | -867,587 (-28%) gain   |
| routes      | /decks warm largest js (index-CDkNPPA9.js)                                           | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 74 ms           | 150       | ok       | 85        | -11 (-13%) gain        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 363 live elements)                                  | 513             |           | reported |           | new row                |
| routes      | /decks warm images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 585 ms          | 400       | MISS     | 412       | +173 (+42%) loss       |
| routes      | /decks/trash cold fcp                                                                | 684 ms          |           | reported | 524       | +160 (+31%) loss       |
| routes      | /decks/trash cold lcp                                                                | 684 ms          | 1,000     | ok       | 560       | +124 (+22%) loss       |
| routes      | /decks/trash cold ready                                                              | 749 ms          | 1,000     | ok       | 640       | +109 (+17%) loss       |
| routes      | /decks/trash cold js decoded                                                         | 971,225 bytes   | 600,000   | MISS     | 3,032,656 | -2,061,431 (-68%) gain |
| routes      | /decks/trash cold largest js (index-CDkNPPA9.js)                                     | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 63 ms           | 150       | ok       | 85        | -22 (-26%) gain        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 273 ms          | 300       | ok       | 396       | -123.51 (-31%) gain    |
| routes      | /decks/trash warm fcp                                                                | 356 ms          |           | reported | 480       | -124 (-26%) gain       |
| routes      | /decks/trash warm lcp                                                                | 356 ms          | 600       | ok       | 488       | -132 (-27%) gain       |
| routes      | /decks/trash warm ready                                                              | 400 ms          | 600       | ok       | 536       | -136 (-25%) gain       |
| routes      | /decks/trash warm js decoded                                                         | 971,225 bytes   | 600,000   | MISS     | 3,032,656 | -2,061,431 (-68%) gain |
| routes      | /decks/trash warm largest js (index-CDkNPPA9.js)                                     | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 55 ms           | 150       | ok       | 59        | -4 (-7%) gain          |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 397 ms          | 500       | ok       | 248       | +149 (+60%) loss       |
| routes      | /deck/gt-brand cold fcp                                                              | 880 ms          |           | reported | 376       | +504 (+134%) loss      |
| routes      | /deck/gt-brand cold lcp                                                              | 880 ms          | 600       | MISS     | 400       | +480 (+120%) loss      |
| routes      | /deck/gt-brand cold ready                                                            | 1011 ms         | 800       | MISS     | 560       | +450 (+80%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,871,645 bytes | 1,000,000 | MISS     | 3,128,584 | -1,256,939 (-40%) gain |
| routes      | /deck/gt-brand cold largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 203 ms          | 150       | MISS     | 99        | +104 (+105%) loss      |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1601 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 258 ms          | 400       | ok       | 209       | +49 (+23%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 356 ms          |           | reported | 300       | +56 (+19%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 416 ms          | 400       | MISS     | 324       | +92 (+28%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 586 ms          | 600       | ok       | 452       | +135 (+30%) loss       |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,871,645 bytes | 1,000,000 | MISS     | 3,128,584 | -1,256,939 (-40%) gain |
| routes      | /deck/gt-brand warm largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 63 ms           | 150       | ok       | 61        | +2 (+3%) loss          |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1601 live elements)                         | 2,501           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 1,784,866 bytes |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 342 ms          | 200       | MISS     | 141       | +201 (+143%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 440 ms          | 400       | MISS     | 516       | -76 (-15%) gain        |
| routes      | /edit/gt-brand cold lcp                                                              | 748 ms          | 1,200     | ok       | 1,308     | -560 (-43%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 687 ms          | 1,200     | ok       | 1267      | -579.60 (-46%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,263,051 bytes | 2,000,000 | MISS     | 3,263,637 | -1,000,586 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 119 ms          | 150       | ok       | 321       | -202 (-63%) gain       |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1870 live elements)                         | 2,682           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 408 ms          | 150       | MISS     | 120       | +288 (+240%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 456 ms          | 250       | MISS     | 180       | +276 (+153%) loss      |
| routes      | /edit/gt-brand warm lcp                                                              | 748 ms          | 700       | MISS     | 896       | -148 (-17%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 722 ms          | 700       | MISS     | 862       | -139.90 (-16%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,263,051 bytes | 2,000,000 | MISS     | 3,263,637 | -1,000,586 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 115 ms          | 150       | ok       | 100       | +15 (+15%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1870 live elements)                         | 2,682           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 295 ms          | 200       | MISS     | 141       | +154 (+109%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 516 ms          |           | reported | 996       | -480 (-48%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 516 ms          | 800       | ok       | 1,020     | -504 (-49%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 593 ms          | 800       | ok       | 974       | -381.10 (-39%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,399,447 bytes | 1,200,000 | MISS     | 3,132,922 | -1,733,475 (-55%) gain |
| routes      | /present/gt-brand cold largest js (index-CDkNPPA9.js)                                | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 154 ms          | 150       | MISS     | 63        | +91 (+144%) loss       |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 381 ms          | 150       | MISS     | 135       | +246 (+183%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 440 ms          |           | reported | 852       | -412 (-48%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 440 ms          | 500       | ok       | 888       | -448 (-50%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 611 ms          | 500       | MISS     | 834       | -223.70 (-27%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,399,447 bytes | 1,200,000 | MISS     | 3,132,922 | -1,733,475 (-55%) gain |
| routes      | /present/gt-brand warm largest js (index-CDkNPPA9.js)                                | 916,787 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 52 ms           | 150       | ok       | 60        | -8 (-13%) gain         |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 108 ms          | 500       | ok       | 598       | -490.20 (-82%) gain    |
| transitions | back (wall)                                                                          | 39 ms           | 100       | ok       | 18        | +21 (+117%) loss       |
| transitions | edit->decks (in page)                                                                | 17 ms           | 400       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 5.80 ms         | 400       | ok       | 3.80      | +2 (+53%) loss         |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 435 ms          | 300       | MISS     |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 11 ms           | 50        | ok       | 14        | -2.90 (-20%) gain      |
| transitions | slideshow (in page, painted frame)                                                   | 13 ms           | 50        | ok       | 18        | -4.60 (-26%) gain      |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.40 ms         | 50        | ok       | 11        | -1.90 (-17%) gain      |
| filmstrip   | first pass longest frame                                                             | 34 ms           | 100       | ok       | 17        | +17 (+103%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 33 ms           | 20        | MISS     | 10        | +23 (+227%) loss       |
| filmstrip   | steady passes longest frame                                                          | 58 ms           | 50        | MISS     | 18        | +41 (+231%) loss       |
| filmstrip   | steady passes fps                                                                    | 89 fps          | 50        | ok       | 119       | -30.52 (-26%) loss     |
| filmstrip   | dom nodes with 85 cards (after GC; 2164 live elements)                               | 5,954           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 465       | -463 (-100%) gain      |
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
