113 of 157 asserted rows met (199 rows; 54 rows gained on the baseline, 41 lost, 14 unchanged, 90 new); run 2026-09-15T03:33:46.578Z to 2026-09-15T03:38:05.584Z against https://turboslide-ay9oweo3y-kl01s-projects.vercel.app (deployment); baseline 2026-09-14T14:30:49.719Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 157 ms          | 200       | ok       | 95        | +62 (+66%) loss        |
| routes      | / cold fcp                                                                           | 364 ms          |           | reported | 300       | +64 (+21%) loss        |
| routes      | / cold lcp                                                                           | 408 ms          | 700       | ok       | 924       | -516 (-56%) gain       |
| routes      | / cold ready                                                                         | 532 ms          | 700       | ok       | 908       | -375.60 (-41%) gain    |
| routes      | / cold js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | / cold largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 108 ms          | 150       | ok       | 67        | +41 (+61%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 119 ms          | 150       | ok       | 91        | +28 (+31%) loss        |
| routes      | / warm fcp                                                                           | 260 ms          |           | reported | 280       | -20 (-7%) gain         |
| routes      | / warm lcp                                                                           | 260 ms          | 400       | ok       | 896       | -636 (-71%) gain       |
| routes      | / warm ready                                                                         | 411 ms          | 400       | MISS     | 877       | -466.00 (-53%) gain    |
| routes      | / warm js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | / warm largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 72 ms           | 150       | ok       | 59        | +13 (+22%) loss        |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 39 ms           | 150       | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 200 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 200 ms          | 800       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 120 ms          | 800       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 113 ms          | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 16 ms           | 100       | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 116 ms          |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 116 ms          | 400       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 53 ms           | 400       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 181 ms          | 200       | ok       | 113       | +68 (+60%) loss        |
| routes      | /new cold fcp                                                                        | 420 ms          | 400       | MISS     | 208       | +212 (+102%) loss      |
| routes      | /new cold lcp                                                                        | 472 ms          | 700       | ok       | 844       | -372 (-44%) gain       |
| routes      | /new cold ready                                                                      | 586 ms          | 700       | ok       | 823       | -236.90 (-29%) gain    |
| routes      | /new cold js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | /new cold largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 126 ms          | 150       | ok       | 67        | +59 (+88%) loss        |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 348 ms          |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 135 ms          | 150       | ok       | 83        | +52 (+63%) loss        |
| routes      | /new warm fcp                                                                        | 304 ms          | 250       | MISS     | 148       | +156 (+105%) loss      |
| routes      | /new warm lcp                                                                        | 304 ms          | 400       | ok       | 764       | -460 (-60%) gain       |
| routes      | /new warm ready                                                                      | 389 ms          | 400       | ok       | 750       | -360.40 (-48%) gain    |
| routes      | /new warm js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 3,122,113 | -889,215 (-28%) gain   |
| routes      | /new warm largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 73 ms           | 150       | ok       | 60        | +13 (+22%) loss        |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 338 ms          | 400       | ok       | 5335      | -4996.28 (-94%) gain   |
| routes      | /decks cold fcp                                                                      | 584 ms          |           | reported | 5,644     | -5,060 (-90%) gain     |
| routes      | /decks cold lcp                                                                      | 692 ms          | 1,000     | ok       | 6,072     | -5,380 (-89%) gain     |
| routes      | /decks cold ready                                                                    | 636 ms          | 1,000     | ok       | 5705      | -5069.10 (-89%) gain   |
| routes      | /decks cold js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 3,045,067 | -894,999 (-29%) gain   |
| routes      | /decks cold largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 209 ms          | 150       | MISS     | 152       | +57 (+38%) loss        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 364 live elements)                                  | 516             |           | reported |           | new row                |
| routes      | /decks cold images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 355 ms          |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 719 ms          | 300       | MISS     | 6300      | -5581.02 (-89%) gain   |
| routes      | /decks warm fcp                                                                      | 872 ms          |           | reported | 6,420     | -5,548 (-86%) gain     |
| routes      | /decks warm lcp                                                                      | 956 ms          | 600       | MISS     | 6,728     | -5,772 (-86%) gain     |
| routes      | /decks warm ready                                                                    | 910 ms          | 600       | MISS     | 6492      | -5581.60 (-86%) gain   |
| routes      | /decks warm js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 3,045,067 | -894,999 (-29%) gain   |
| routes      | /decks warm largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 119 ms          | 150       | ok       | 85        | +34 (+40%) loss        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 364 live elements)                                  | 515             |           | reported |           | new row                |
| routes      | /decks warm images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 229 ms          | 400       | ok       | 412       | -182.84 (-44%) gain    |
| routes      | /decks/trash cold fcp                                                                | 420 ms          |           | reported | 524       | -104 (-20%) gain       |
| routes      | /decks/trash cold lcp                                                                | 420 ms          | 1,000     | ok       | 560       | -140 (-25%) gain       |
| routes      | /decks/trash cold ready                                                              | 446 ms          | 1,000     | ok       | 640       | -194.50 (-30%) gain    |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash cold largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 147 ms          | 150       | ok       | 85        | +62 (+73%) loss        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 213 ms          | 300       | ok       | 396       | -182.73 (-46%) gain    |
| routes      | /decks/trash warm fcp                                                                | 272 ms          |           | reported | 480       | -208 (-43%) gain       |
| routes      | /decks/trash warm lcp                                                                | 272 ms          | 600       | ok       | 488       | -216 (-44%) gain       |
| routes      | /decks/trash warm ready                                                              | 303 ms          | 600       | ok       | 536       | -232.80 (-43%) gain    |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash warm largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 59        | -59 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 276 ms          | 500       | ok       | 248       | +28 (+12%) loss        |
| routes      | /deck/gt-brand cold fcp                                                              | 512 ms          |           | reported | 376       | +136 (+36%) loss       |
| routes      | /deck/gt-brand cold lcp                                                              | 512 ms          | 600       | ok       | 400       | +112 (+28%) loss       |
| routes      | /deck/gt-brand cold ready                                                            | 787 ms          | 800       | ok       | 560       | +227 (+40%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 178 ms          | 150       | MISS     | 99        | +79 (+80%) loss        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 234 ms          | 400       | ok       | 209       | +25 (+12%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 412 ms          |           | reported | 300       | +112 (+37%) loss       |
| routes      | /deck/gt-brand warm lcp                                                              | 412 ms          | 400       | MISS     | 324       | +88 (+27%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 527 ms          | 600       | ok       | 452       | +75 (+17%) loss        |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 76 ms           | 150       | ok       | 61        | +15 (+25%) loss        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 283 ms          | 200       | MISS     | 141       | +143 (+102%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 484 ms          | 400       | MISS     | 516       | -32 (-6%) gain         |
| routes      | /edit/gt-brand cold lcp                                                              | 840 ms          | 1,200     | ok       | 1,308     | -468 (-36%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 778 ms          | 1,200     | ok       | 1267      | -489.30 (-39%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 3,263,637 | -1,027,993 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 167 ms          | 150       | MISS     | 321       | -154 (-48%) gain       |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1511 live elements)                         | 2,116           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 275 ms          | 150       | MISS     | 120       | +155 (+129%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 376 ms          | 250       | MISS     | 180       | +196 (+109%) loss      |
| routes      | /edit/gt-brand warm lcp                                                              | 728 ms          | 700       | MISS     | 896       | -168 (-19%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 705 ms          | 700       | MISS     | 862       | -157.50 (-18%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 3,263,637 | -1,027,993 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 125 ms          | 150       | ok       | 100       | +25 (+25%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1529 live elements)                         | 2,134           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 260 ms          | 200       | MISS     | 141       | +119 (+84%) loss       |
| routes      | /present/gt-brand cold fcp                                                           | 516 ms          |           | reported | 996       | -480 (-48%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 516 ms          | 800       | ok       | 1,020     | -504 (-49%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 620 ms          | 800       | ok       | 974       | -354.40 (-36%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand cold largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 167 ms          | 150       | MISS     | 63        | +104 (+165%) loss      |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 232 ms          | 150       | MISS     | 135       | +97 (+72%) loss        |
| routes      | /present/gt-brand warm fcp                                                           | 348 ms          |           | reported | 852       | -504 (-59%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 348 ms          | 500       | ok       | 888       | -540 (-61%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 509 ms          | 500       | MISS     | 834       | -325.80 (-39%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand warm largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 76 ms           | 150       | ok       | 60        | +16 (+27%) loss        |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 179 ms          | 500       | ok       | 598       | -418.70 (-70%) gain    |
| transitions | back (wall)                                                                          | 80 ms           | 100       | ok       | 18        | +62 (+344%) loss       |
| transitions | edit->decks (in page)                                                                | 17 ms           | 400       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 8.10 ms         | 400       | ok       | 3.80      | +4.30 (+113%) loss     |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 404 ms          | 300       | MISS     |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 15 ms           | 50        | ok       | 14        | +0.30 (+2%) loss       |
| transitions | slideshow (in page, painted frame)                                                   | 19 ms           | 50        | ok       | 18        | +1.30 (+7%) loss       |
| transitions | layoutGrid (in page, painted frame)                                                  | 14 ms           | 50        | ok       | 11        | +2.20 (+19%) loss      |
| filmstrip   | first pass longest frame                                                             | 41 ms           | 100       | ok       | 17        | +24 (+144%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 10 ms           | 20        | ok       | 10        | +0.10 (+1%) loss       |
| filmstrip   | steady passes longest frame                                                          | 25 ms           | 50        | ok       | 18        | +7.70 (+44%) loss      |
| filmstrip   | steady passes fps                                                                    | 118 fps         | 50        | ok       | 119       | -1.15 (-1%) loss       |
| filmstrip   | dom nodes with 85 cards (after GC; 1938 live elements)                               | 2,817           | 1,500     | MISS     |           | new row                |
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
| write       | text burst: last keyup to local commit                                               | 90 ms           | 450       | ok       |           | new row                |
| write       | text burst: last keyup to saved revision                                             | 1155 ms         | 1,000     | MISS     |           | new row                |
| write       | text burst: last keyup to acknowledgement (reported)                                 | 90 ms           |           | reported |           | new row                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       |           | new row                |
| write       | new slide: pointerdown to painted card                                               | 11 ms           | 16        | ok       |           | new row                |
| write       | new slide: pointerdown to saved revision                                             | 2784 ms         | 500       | MISS     |           | new row                |
| write       | new slide: pointerdown to acknowledgement (reported)                                 | 715 ms          |           | reported |           | new row                |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 1,468 ms        |           | reported |           | new row                |
| write       | home card of the scratch deck on the next /decks visit                               | 1355 ms         | 2,500     | ok       |           | new row                |
