119 of 151 asserted rows met (190 rows; 66 rows gained on the baseline, 30 lost, 13 unchanged, 81 new); run 2026-09-15T06:17:26.123Z to 2026-09-15T06:21:21.367Z against https://turboslide.vercel.app (deployment); baseline 2026-09-14T14:30:49.719Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 175 ms          | 200       | ok       | 95        | +81 (+85%) loss        |
| routes      | / cold fcp                                                                           | 348 ms          |           | reported | 300       | +48 (+16%) loss        |
| routes      | / cold lcp                                                                           | 348 ms          | 700       | ok       | 924       | -576 (-62%) gain       |
| routes      | / cold ready                                                                         | 421 ms          | 700       | ok       | 908       | -486.80 (-54%) gain    |
| routes      | / cold js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | / cold largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 80 ms           | 150       | ok       | 67        | +13 (+19%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 130 ms          | 150       | ok       | 91        | +39 (+43%) loss        |
| routes      | / warm fcp                                                                           | 224 ms          |           | reported | 280       | -56 (-20%) gain        |
| routes      | / warm lcp                                                                           | 224 ms          | 400       | ok       | 896       | -672 (-75%) gain       |
| routes      | / warm ready                                                                         | 316 ms          | 400       | ok       | 877       | -561.40 (-64%) gain    |
| routes      | / warm js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | / warm largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 0 ms            | 150       | ok       | 59        | -59 (-100%) gain       |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 37 ms           | 150       | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 164 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 164 ms          | 800       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 99 ms           | 800       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 90 ms           | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 11 ms           | 100       | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 84 ms           |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 84 ms           | 400       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 37 ms           | 400       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 172 ms          | 200       | ok       | 113       | +59 (+52%) loss        |
| routes      | /new cold fcp                                                                        | 264 ms          | 400       | ok       | 208       | +56 (+27%) loss        |
| routes      | /new cold lcp                                                                        | 296 ms          | 700       | ok       | 844       | -548 (-65%) gain       |
| routes      | /new cold ready                                                                      | 387 ms          | 700       | ok       | 823       | -436.00 (-53%) gain    |
| routes      | /new cold js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | /new cold largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 66 ms           | 150       | ok       | 67        | -1 (-1%) gain          |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 174 ms          |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 135 ms          | 150       | ok       | 83        | +52 (+63%) loss        |
| routes      | /new warm fcp                                                                        | 188 ms          | 250       | ok       | 148       | +40 (+27%) loss        |
| routes      | /new warm lcp                                                                        | 196 ms          | 400       | ok       | 764       | -568 (-74%) gain       |
| routes      | /new warm ready                                                                      | 303 ms          | 400       | ok       | 750       | -446.80 (-60%) gain    |
| routes      | /new warm js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | /new warm largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 241 ms          | 400       | ok       | 5335      | -5093.73 (-95%) gain   |
| routes      | /decks cold fcp                                                                      | 372 ms          |           | reported | 5,644     | -5,272 (-93%) gain     |
| routes      | /decks cold lcp                                                                      | 464 ms          | 1,000     | ok       | 6,072     | -5,608 (-92%) gain     |
| routes      | /decks cold ready                                                                    | 406 ms          | 1,000     | ok       | 5705      | -5298.80 (-93%) gain   |
| routes      | /decks cold js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 3,045,067 | -894,999 (-29%) gain   |
| routes      | /decks cold largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 98 ms           | 150       | ok       | 152       | -54 (-36%) gain        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 364 live elements)                                  | 509             |           | reported |           | new row                |
| routes      | /decks cold images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 263 ms          |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 292 ms          | 300       | ok       | 6300      | -6008.57 (-95%) gain   |
| routes      | /decks warm fcp                                                                      | 404 ms          |           | reported | 6,420     | -6,016 (-94%) gain     |
| routes      | /decks warm lcp                                                                      | 892 ms          | 600       | MISS     | 6,728     | -5,836 (-87%) gain     |
| routes      | /decks warm ready                                                                    | 423 ms          | 600       | ok       | 6492      | -6068.70 (-93%) gain   |
| routes      | /decks warm js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 3,045,067 | -894,999 (-29%) gain   |
| routes      | /decks warm largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 55 ms           | 150       | ok       | 85        | -30 (-35%) gain        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 364 live elements)                                  | 513             |           | reported |           | new row                |
| routes      | /decks warm images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 241 ms          | 400       | ok       | 412       | -170.64 (-41%) gain    |
| routes      | /decks/trash cold fcp                                                                | 380 ms          |           | reported | 524       | -144 (-27%) gain       |
| routes      | /decks/trash cold lcp                                                                | 380 ms          | 1,000     | ok       | 560       | -180 (-32%) gain       |
| routes      | /decks/trash cold ready                                                              | 379 ms          | 1,000     | ok       | 640       | -260.90 (-41%) gain    |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash cold largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 75 ms           | 150       | ok       | 85        | -10 (-12%) gain        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 146             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 344 ms          | 300       | MISS     | 396       | -51.78 (-13%) gain     |
| routes      | /decks/trash warm fcp                                                                | 416 ms          |           | reported | 480       | -64 (-13%) gain        |
| routes      | /decks/trash warm lcp                                                                | 416 ms          | 600       | ok       | 488       | -72 (-15%) gain        |
| routes      | /decks/trash warm ready                                                              | 435 ms          | 600       | ok       | 536       | -100.80 (-19%) gain    |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash warm largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 59        | -59 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 146             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 384 ms          | 500       | ok       | 248       | +137 (+55%) loss       |
| routes      | /deck/gt-brand cold fcp                                                              | 488 ms          |           | reported | 376       | +112 (+30%) loss       |
| routes      | /deck/gt-brand cold lcp                                                              | 572 ms          | 600       | ok       | 400       | +172 (+43%) loss       |
| routes      | /deck/gt-brand cold ready                                                            | 633 ms          | 800       | ok       | 560       | +72 (+13%) loss        |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 74 ms           | 150       | ok       | 99        | -25 (-25%) gain        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0045          | 0.0500    | ok       | 0.0021    | +0.0024 (+110%) loss   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 254 ms          | 400       | ok       | 209       | +45 (+21%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 392 ms          |           | reported | 300       | +92 (+31%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 408 ms          | 400       | MISS     | 324       | +84 (+26%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 472 ms          | 600       | ok       | 452       | +21 (+5%) loss         |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 0 ms            | 150       | ok       | 61        | -61 (-100%) gain       |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 415 ms          | 200       | MISS     | 141       | +274 (+195%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 564 ms          | 400       | MISS     | 516       | +48 (+9%) loss         |
| routes      | /edit/gt-brand cold lcp                                                              | 820 ms          | 1,200     | ok       | 1,308     | -488 (-37%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 763 ms          | 1,200     | ok       | 1267      | -503.80 (-40%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 3,263,637 | -1,027,993 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 96 ms           | 150       | ok       | 321       | -225 (-70%) gain       |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1554 live elements)                         | 2,159           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 385 ms          | 150       | MISS     | 120       | +265 (+221%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 440 ms          | 250       | MISS     | 180       | +260 (+144%) loss      |
| routes      | /edit/gt-brand warm lcp                                                              | 664 ms          | 700       | ok       | 896       | -232 (-26%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 640 ms          | 700       | ok       | 862       | -222.10 (-26%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 3,263,637 | -1,027,993 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 91 ms           | 150       | ok       | 100       | -9 (-9%) gain          |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1590 live elements)                         | 2,197           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 340 ms          | 200       | MISS     | 141       | +199 (+141%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 516 ms          |           | reported | 996       | -480 (-48%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 516 ms          | 800       | ok       | 1,020     | -504 (-49%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 640 ms          | 800       | ok       | 974       | -334.70 (-34%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand cold largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 64 ms           | 150       | ok       | 63        | +1 (+2%) loss          |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 346 ms          | 150       | MISS     | 135       | +212 (+157%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 404 ms          |           | reported | 852       | -448 (-53%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 404 ms          | 500       | ok       | 888       | -484 (-55%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 572 ms          | 500       | MISS     | 834       | -262.50 (-31%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand warm largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 95 ms           | 500       | ok       | 598       | -503.30 (-84%) gain    |
| transitions | back (wall)                                                                          | 33 ms           | 100       | ok       | 18        | +15 (+83%) loss        |
| transitions | edit->decks (in page)                                                                | 16 ms           | 400       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 5.40 ms         | 400       | ok       | 3.80      | +1.60 (+42%) loss      |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 326 ms          | 300       | MISS     |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 11 ms           | 50        | ok       | 14        | -3.50 (-24%) gain      |
| transitions | slideshow (in page, painted frame)                                                   | 15 ms           | 50        | ok       | 18        | -2.70 (-15%) gain      |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.90 ms         | 50        | ok       | 11        | -1.40 (-12%) gain      |
| filmstrip   | first pass longest frame                                                             | 26 ms           | 100       | ok       | 17        | +8.70 (+51%) loss      |
| filmstrip   | steady passes p95 frame                                                              | 10 ms           | 20        | ok       | 10        | +0.20 (+2%) loss       |
| filmstrip   | steady passes longest frame                                                          | 18 ms           | 50        | ok       | 18        | +0.50 (+3%) loss       |
| filmstrip   | steady passes fps                                                                    | 119 fps         | 50        | ok       | 119       | -0.04 (-0%) loss       |
| filmstrip   | dom nodes with 85 cards (after GC; 2077 live elements)                               | 2,958           | 1,500     | MISS     |           | new row                |
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
