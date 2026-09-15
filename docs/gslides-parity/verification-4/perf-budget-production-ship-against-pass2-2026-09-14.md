119 of 151 asserted rows met (190 rows; 83 rows gained on the baseline, 26 lost, 47 unchanged, 33 new); run 2026-09-15T06:17:26.123Z to 2026-09-15T06:21:21.367Z against https://turboslide.vercel.app (deployment); baseline 2026-09-15T03:38:08.308Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 175 ms          | 200       | ok       | 126       | +50 (+40%) loss        |
| routes      | / cold fcp                                                                           | 348 ms          |           | reported | 332       | +16 (+5%) loss         |
| routes      | / cold lcp                                                                           | 348 ms          | 700       | ok       | 364       | -16 (-4%) gain         |
| routes      | / cold ready                                                                         | 421 ms          | 700       | ok       | 456       | -34.70 (-8%) gain      |
| routes      | / cold js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 2,260,306 | -27,408 (-1%) gain     |
| routes      | / cold largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 80 ms           | 150       | ok       | 130       | -50 (-38%) gain        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | / warm ttfb                                                                          | 130 ms          | 150       | ok       | 116       | +14 (+12%) loss        |
| routes      | / warm fcp                                                                           | 224 ms          |           | reported | 196       | +28 (+14%) loss        |
| routes      | / warm lcp                                                                           | 224 ms          | 400       | ok       | 196       | +28 (+14%) loss        |
| routes      | / warm ready                                                                         | 316 ms          | 400       | ok       | 288       | +27 (+9%) loss         |
| routes      | / warm js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 2,260,306 | -27,408 (-1%) gain     |
| routes      | / warm largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 0 ms            | 150       | ok       | 53        | -53 (-100%) gain       |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /home cold ttfb                                                                      | 37 ms           | 150       | ok       | 53        | -15.68 (-30%) gain     |
| routes      | /home cold fcp                                                                       | 164 ms          |           | reported | 164       | same                   |
| routes      | /home cold lcp                                                                       | 164 ms          | 800       | ok       | 196       | -32 (-16%) gain        |
| routes      | /home cold ready                                                                     | 99 ms           | 800       | ok       | 127       | -27.30 (-22%) gain     |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 988,790   | -311,051 (-31%) gain   |
| routes      | /home cold largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 90 ms           | 150       | ok       | 80        | +10 (+13%) loss        |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 40,468    | same                   |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /home warm ttfb                                                                      | 11 ms           | 100       | ok       | 18        | -6.98 (-38%) gain      |
| routes      | /home warm fcp                                                                       | 84 ms           |           | reported | 112       | -28 (-25%) gain        |
| routes      | /home warm lcp                                                                       | 84 ms           | 400       | ok       | 112       | -28 (-25%) gain        |
| routes      | /home warm ready                                                                     | 37 ms           | 400       | ok       | 66        | -28.50 (-44%) gain     |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 988,790   | -311,051 (-31%) gain   |
| routes      | /home warm largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       | 0         | same                   |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       | 40,468    | +27,552 (+68%) loss    |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /new cold ttfb                                                                       | 172 ms          | 200       | ok       | 142       | +31 (+22%) loss        |
| routes      | /new cold fcp                                                                        | 264 ms          | 400       | ok       | 320       | -56 (-18%) gain        |
| routes      | /new cold lcp                                                                        | 296 ms          | 700       | ok       | 384       | -88 (-23%) gain        |
| routes      | /new cold ready                                                                      | 387 ms          | 700       | ok       | 501       | -113.40 (-23%) gain    |
| routes      | /new cold js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 2,260,306 | -27,408 (-1%) gain     |
| routes      | /new cold largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 66 ms           | 150       | ok       | 126       | -60 (-48%) gain        |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 174 ms          |           | reported | 149       | +25 (+17%) loss        |
| routes      | /new warm ttfb                                                                       | 135 ms          | 150       | ok       | 117       | +18 (+15%) loss        |
| routes      | /new warm fcp                                                                        | 188 ms          | 250       | ok       | 208       | -20 (-10%) gain        |
| routes      | /new warm lcp                                                                        | 196 ms          | 400       | ok       | 224       | -28 (-13%) gain        |
| routes      | /new warm ready                                                                      | 303 ms          | 400       | ok       | 374       | -71.00 (-19%) gain     |
| routes      | /new warm js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 2,260,306 | -27,408 (-1%) gain     |
| routes      | /new warm largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 0 ms            | 150       | ok       | 79        | -79 (-100%) gain       |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /decks cold ttfb                                                                     | 241 ms          | 400       | ok       | 484       | -243.06 (-50%) gain    |
| routes      | /decks cold fcp                                                                      | 372 ms          |           | reported | 720       | -348 (-48%) gain       |
| routes      | /decks cold lcp                                                                      | 464 ms          | 1,000     | ok       | 720       | -256 (-36%) gain       |
| routes      | /decks cold ready                                                                    | 406 ms          | 1,000     | ok       | 785       | -379.20 (-48%) gain    |
| routes      | /decks cold js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 2,177,480 | -27,412 (-1%) gain     |
| routes      | /decks cold largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 98 ms           | 150       | ok       | 133       | -35 (-26%) gain        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 364 live elements)                                  | 509             |           | reported |           | new row                |
| routes      | /decks cold images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       | 957       | same                   |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 263 ms          |           | reported | 2495      | -2232.04 (-89%) gain   |
| routes      | /decks warm ttfb                                                                     | 292 ms          | 300       | ok       | 334       | -42.41 (-13%) gain     |
| routes      | /decks warm fcp                                                                      | 404 ms          |           | reported | 440       | -36 (-8%) gain         |
| routes      | /decks warm lcp                                                                      | 892 ms          | 600       | MISS     | 896       | -4 (-0%) gain          |
| routes      | /decks warm ready                                                                    | 423 ms          | 600       | ok       | 473       | -49.70 (-11%) gain     |
| routes      | /decks warm js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 2,177,480 | -27,412 (-1%) gain     |
| routes      | /decks warm largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 55 ms           | 150       | ok       | 74        | -19 (-26%) gain        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 364 live elements)                                  | 513             |           | reported |           | new row                |
| routes      | /decks warm images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       | 957       | same                   |
| routes      | /decks/trash cold ttfb                                                               | 241 ms          | 400       | ok       | 585       | -343.35 (-59%) gain    |
| routes      | /decks/trash cold fcp                                                                | 380 ms          |           | reported | 684       | -304 (-44%) gain       |
| routes      | /decks/trash cold lcp                                                                | 380 ms          | 1,000     | ok       | 684       | -304 (-44%) gain       |
| routes      | /decks/trash cold ready                                                              | 379 ms          | 1,000     | ok       | 749       | -369.90 (-49%) gain    |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 971,225   | -338,843 (-35%) gain   |
| routes      | /decks/trash cold largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 75 ms           | 150       | ok       | 63        | +12 (+19%) loss        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 146             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                   |
| routes      | /decks/trash warm ttfb                                                               | 344 ms          | 300       | MISS     | 273       | +72 (+26%) loss        |
| routes      | /decks/trash warm fcp                                                                | 416 ms          |           | reported | 356       | +60 (+17%) loss        |
| routes      | /decks/trash warm lcp                                                                | 416 ms          | 600       | ok       | 356       | +60 (+17%) loss        |
| routes      | /decks/trash warm ready                                                              | 435 ms          | 600       | ok       | 400       | +35 (+9%) loss         |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 971,225   | -338,843 (-35%) gain   |
| routes      | /decks/trash warm largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 55        | -55 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 146             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                   |
| routes      | /deck/gt-brand cold ttfb                                                             | 384 ms          | 500       | ok       | 397       | -12.23 (-3%) gain      |
| routes      | /deck/gt-brand cold fcp                                                              | 488 ms          |           | reported | 880       | -392 (-45%) gain       |
| routes      | /deck/gt-brand cold lcp                                                              | 572 ms          | 600       | ok       | 880       | -308 (-35%) gain       |
| routes      | /deck/gt-brand cold ready                                                            | 633 ms          | 800       | ok       | 1011      | -378.00 (-37%) gain    |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,871,645 | -28,561 (-2%) gain     |
| routes      | /deck/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 74 ms           | 150       | ok       | 203       | -129 (-64%) gain       |
| routes      | /deck/gt-brand cold cls                                                              | 0.0045          | 0.0500    | ok       | 0.0021    | +0.0024 (+110%) loss   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported | 516,149   | same                   |
| routes      | /deck/gt-brand warm ttfb                                                             | 254 ms          | 400       | ok       | 258       | -4.01 (-2%) gain       |
| routes      | /deck/gt-brand warm fcp                                                              | 392 ms          |           | reported | 356       | +36 (+10%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 408 ms          | 400       | MISS     | 416       | -8 (-2%) gain          |
| routes      | /deck/gt-brand warm ready                                                            | 472 ms          | 600       | ok       | 586       | -114.20 (-19%) gain    |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,871,645 | -28,561 (-2%) gain     |
| routes      | /deck/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 0 ms            | 150       | ok       | 63        | -63 (-100%) gain       |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported | 1,784,866 | -1,268,717 (-71%) gain |
| routes      | /edit/gt-brand cold ttfb                                                             | 415 ms          | 200       | MISS     | 342       | +73 (+21%) loss        |
| routes      | /edit/gt-brand cold fcp                                                              | 564 ms          | 400       | MISS     | 440       | +124 (+28%) loss       |
| routes      | /edit/gt-brand cold lcp                                                              | 820 ms          | 1,200     | ok       | 748       | +72 (+10%) loss        |
| routes      | /edit/gt-brand cold ready                                                            | 763 ms          | 1,200     | ok       | 687       | +76 (+11%) loss        |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 2,263,051 | -27,407 (-1%) gain     |
| routes      | /edit/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 96 ms           | 150       | ok       | 119       | -23 (-19%) gain        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1554 live elements)                         | 2,159           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /edit/gt-brand warm ttfb                                                             | 385 ms          | 150       | MISS     | 408       | -23.18 (-6%) gain      |
| routes      | /edit/gt-brand warm fcp                                                              | 440 ms          | 250       | MISS     | 456       | -16 (-4%) gain         |
| routes      | /edit/gt-brand warm lcp                                                              | 664 ms          | 700       | ok       | 748       | -84 (-11%) gain        |
| routes      | /edit/gt-brand warm ready                                                            | 640 ms          | 700       | ok       | 722       | -82.20 (-11%) gain     |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 2,263,051 | -27,407 (-1%) gain     |
| routes      | /edit/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 91 ms           | 150       | ok       | 115       | -24 (-21%) gain        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1590 live elements)                         | 2,197           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                   |
| routes      | /present/gt-brand cold ttfb                                                          | 340 ms          | 200       | MISS     | 295       | +45 (+15%) loss        |
| routes      | /present/gt-brand cold fcp                                                           | 516 ms          |           | reported | 516       | same                   |
| routes      | /present/gt-brand cold lcp                                                           | 516 ms          | 800       | ok       | 516       | same                   |
| routes      | /present/gt-brand cold ready                                                         | 640 ms          | 800       | ok       | 593       | +46 (+8%) loss         |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,399,447 | -35,022 (-3%) gain     |
| routes      | /present/gt-brand cold largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 64 ms           | 150       | ok       | 154       | -90 (-58%) gain        |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /present/gt-brand warm ttfb                                                          | 346 ms          | 150       | MISS     | 381       | -34.79 (-9%) gain      |
| routes      | /present/gt-brand warm fcp                                                           | 404 ms          |           | reported | 440       | -36 (-8%) gain         |
| routes      | /present/gt-brand warm lcp                                                           | 404 ms          | 500       | ok       | 440       | -36 (-8%) gain         |
| routes      | /present/gt-brand warm ready                                                         | 572 ms          | 500       | MISS     | 611       | -38.80 (-6%) gain      |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,399,447 | -35,022 (-3%) gain     |
| routes      | /present/gt-brand warm largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 0 ms            | 150       | ok       | 52        | -52 (-100%) gain       |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| transitions | decks->edit (in page)                                                                | 95 ms           | 500       | ok       | 108       | -13.10 (-12%) gain     |
| transitions | back (wall)                                                                          | 33 ms           | 100       | ok       | 39        | -6 (-15%) gain         |
| transitions | edit->decks (in page)                                                                | 16 ms           | 400       | ok       | 17        | -0.80 (-5%) gain       |
| transitions | trash->decks (in page)                                                               | 5.40 ms         | 400       | ok       | 5.80      | -0.40 (-7%) gain       |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 326 ms          | 300       | MISS     | 435       | -109 (-25%) gain       |
| transitions | slideChange (in page, painted frame)                                                 | 11 ms           | 50        | ok       | 11        | -0.60 (-5%) gain       |
| transitions | slideshow (in page, painted frame)                                                   | 15 ms           | 50        | ok       | 13        | +1.90 (+15%) loss      |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.90 ms         | 50        | ok       | 9.40      | +0.50 (+5%) loss       |
| filmstrip   | first pass longest frame                                                             | 26 ms           | 100       | ok       | 34        | -8.70 (-25%) gain      |
| filmstrip   | steady passes p95 frame                                                              | 10 ms           | 20        | ok       | 33        | -22.70 (-69%) gain     |
| filmstrip   | steady passes longest frame                                                          | 18 ms           | 50        | ok       | 58        | -40.20 (-69%) gain     |
| filmstrip   | steady passes fps                                                                    | 119 fps         | 50        | ok       | 89        | +30 (+34%) gain        |
| filmstrip   | dom nodes with 85 cards (after GC; 2077 live elements)                               | 2,958           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 2         | same                   |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       | 0         | same                   |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       | 0         | same                   |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache HIT)            | 1               | 1         | ok       | 1         | same                   |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache HIT)               | 1               | 1         | ok       | 1         | same                   |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                   |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                   |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache HIT)     | 1               | 1         | ok       | 1         | same                   |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache HIT)      | 1               | 1         | ok       | 1         | same                   |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache HIT)                   | 1               | 1         | ok       | 1         | same                   |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | baseline               |
