122 of 151 asserted rows met (199 rows; 37 rows gained on the baseline, 56 lost, 15 unchanged, 91 new); run 2026-09-15T02:33:16.032Z to 2026-09-15T02:37:30.279Z against http://localhost:4321 (local); baseline 2026-09-14T14:53:08.794Z against http://localhost:4346 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 9.40 ms         | 60        | ok       | 1.60      | +7.80 (+488%) loss     |
| routes      | / cold fcp                                                                           | 164 ms          |           | reported | 60        | +104 (+173%) loss      |
| routes      | / cold lcp                                                                           | 164 ms          | 450       | ok       | 692       | -528 (-76%) gain       |
| routes      | / cold ready                                                                         | 381 ms          | 450       | ok       | 673       | -291.90 (-43%) gain    |
| routes      | / cold js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | / cold largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 93 ms           | 150       | ok       | 62        | +31 (+50%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 24 ms           | 40        | ok       | 1.84      | +22 (+1198%) loss      |
| routes      | / warm fcp                                                                           | 128 ms          |           | reported | 60        | +68 (+113%) loss       |
| routes      | / warm lcp                                                                           | 128 ms          | 250       | ok       | 672       | -544 (-81%) gain       |
| routes      | / warm ready                                                                         | 289 ms          | 250       | MISS     | 653       | -363.10 (-56%) gain    |
| routes      | / warm js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | / warm largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 82 ms           | 150       | ok       | 60        | +22 (+37%) loss        |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 9.78 ms         | 60        | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 136 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 136 ms          | 400       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 49 ms           | 400       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 0.12 ms         | 40        | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 112 ms          |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 112 ms          | 200       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 48 ms           | 200       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 53 ms           | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 18 ms           | 60        | ok       | 2.02      | +16 (+779%) loss       |
| routes      | /new cold fcp                                                                        | 204 ms          | 250       | ok       | 64        | +140 (+219%) loss      |
| routes      | /new cold lcp                                                                        | 204 ms          | 450       | ok       | 688       | -484 (-70%) gain       |
| routes      | /new cold ready                                                                      | 323 ms          | 450       | ok       | 672       | -349 (-52%) gain       |
| routes      | /new cold js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | /new cold largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 74 ms           | 150       | ok       | 63        | +11 (+17%) loss        |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 69 ms           |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 6.82 ms         | 40        | ok       | 2.00      | +4.82 (+241%) loss     |
| routes      | /new warm fcp                                                                        | 116 ms          | 150       | ok       | 60        | +56 (+93%) loss        |
| routes      | /new warm lcp                                                                        | 116 ms          | 250       | ok       | 660       | -544 (-82%) gain       |
| routes      | /new warm ready                                                                      | 242 ms          | 250       | ok       | 648       | -405.90 (-63%) gain    |
| routes      | /new warm js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | /new warm largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 75 ms           | 150       | ok       | 61        | +14 (+23%) loss        |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 57 ms           | 150       | ok       | 18        | +38 (+213%) loss       |
| routes      | /decks cold fcp                                                                      | 232 ms          |           | reported | 120       | +112 (+93%) loss       |
| routes      | /decks cold lcp                                                                      | 624 ms          | 500       | MISS     | 212       | +412 (+194%) loss      |
| routes      | /decks cold ready                                                                    | 549 ms          | 500       | MISS     | 179       | +370 (+206%) loss      |
| routes      | /decks cold js decoded                                                               | 730,075 bytes   | 600,000   | MISS     | 3,045,067 | -2,314,992 (-76%) gain |
| routes      | /decks cold largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 92 ms           | 150       | ok       | 63        | +29 (+46%) loss        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 724 live elements)                                  | 973             |           | reported |           | new row                |
| routes      | /decks cold images with 66 cards (decoded)                                           | 39,889 bytes    | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 100 ms          |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 63 ms           | 100       | ok       | 18        | +45 (+251%) loss       |
| routes      | /decks warm fcp                                                                      | 208 ms          |           | reported | 116       | +92 (+79%) loss        |
| routes      | /decks warm lcp                                                                      | 328 ms          | 300       | MISS     | 208       | +120 (+58%) loss       |
| routes      | /decks warm ready                                                                    | 260 ms          | 300       | ok       | 177       | +83 (+47%) loss        |
| routes      | /decks warm js decoded                                                               | 730,075 bytes   | 600,000   | MISS     | 3,045,067 | -2,314,992 (-76%) gain |
| routes      | /decks warm largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 63 ms           | 150       | ok       | 59        | +4 (+7%) loss          |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 724 live elements)                                  | 973             |           | reported |           | new row                |
| routes      | /decks warm images with 66 cards (decoded)                                           | 39,889 bytes    | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 35 ms           | 150       | ok       | 10        | +25 (+252%) loss       |
| routes      | /decks/trash cold fcp                                                                | 112 ms          |           | reported | 68        | +44 (+65%) loss        |
| routes      | /decks/trash cold lcp                                                                | 148 ms          | 500       | ok       | 76        | +72 (+95%) loss        |
| routes      | /decks/trash cold ready                                                              | 149 ms          | 500       | ok       | 135       | +14 (+10%) loss        |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash cold largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 0 ms            | 150       | ok       | 64        | -64 (-100%) gain       |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 12,312 bytes    |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 24 ms           | 100       | ok       | 10        | +14 (+144%) loss       |
| routes      | /decks/trash warm fcp                                                                | 92 ms           |           | reported | 72        | +20 (+28%) loss        |
| routes      | /decks/trash warm lcp                                                                | 120 ms          | 300       | ok       | 128       | -8 (-6%) gain          |
| routes      | /decks/trash warm ready                                                              | 135 ms          | 300       | ok       | 120       | +15 (+13%) loss        |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash warm largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 62        | -62 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 12,312 bytes    |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 48 ms           | 250       | ok       | 34        | +13 (+39%) loss        |
| routes      | /deck/gt-brand cold fcp                                                              | 196 ms          |           | reported | 140       | +56 (+40%) loss        |
| routes      | /deck/gt-brand cold lcp                                                              | 196 ms          | 500       | ok       | 140       | +56 (+40%) loss        |
| routes      | /deck/gt-brand cold ready                                                            | 332 ms          | 600       | ok       | 231       | +101 (+44%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 87 ms           | 150       | ok       | 64        | +23 (+36%) loss        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 53 ms           | 150       | ok       | 32        | +21 (+67%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 180 ms          |           | reported | 124       | +56 (+45%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 180 ms          | 300       | ok       | 124       | +56 (+45%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 293 ms          | 400       | ok       | 216       | +77 (+36%) loss        |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 73 ms           | 150       | ok       | 60        | +13 (+22%) loss        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 63 ms           | 60        | MISS     | 2.37      | +60 (+2544%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 128 ms          | 250       | ok       | 60        | +68 (+113%) loss       |
| routes      | /edit/gt-brand cold lcp                                                              | 352 ms          | 700       | ok       | 796       | -444 (-56%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 330 ms          | 700       | ok       | 728       | -397.80 (-55%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 3,263,637 | -1,028,033 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 128 ms          | 150       | ok       | 90        | +38 (+42%) loss        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1548 live elements)                         | 2,153           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 33 ms           | 40        | ok       | 1.95      | +31 (+1587%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 108 ms          | 150       | ok       | 60        | +48 (+80%) loss        |
| routes      | /edit/gt-brand warm lcp                                                              | 336 ms          | 450       | ok       | 720       | -384 (-53%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 312 ms          | 450       | ok       | 699       | -387 (-55%) gain       |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 3,263,637 | -1,028,033 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 130 ms          | 150       | ok       | 93        | +37 (+40%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1544 live elements)                         | 2,150           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 31 ms           | 60        | ok       | 1.91      | +29 (+1530%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 148 ms          |           | reported | 692       | -544 (-79%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 148 ms          | 500       | ok       | 700       | -552 (-79%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 227 ms          | 500       | ok       | 667       | -439.50 (-66%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand cold largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 71 ms           | 150       | ok       | 59        | +12 (+20%) loss        |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 32 ms           | 40        | ok       | 1.97      | +30 (+1503%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 100 ms          |           | reported | 668       | -568 (-85%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 100 ms          | 300       | ok       | 808       | -708 (-88%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 211 ms          | 300       | ok       | 646       | -434.80 (-67%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand warm largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 66 ms           | 150       | ok       | 60        | +6 (+10%) loss         |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 295 ms          | 300       | ok       |           | new row                |
| transitions | back (wall)                                                                          | 68 ms           | 100       | ok       |           | new row                |
| transitions | edit->decks (in page)                                                                | 13 ms           | 300       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 6.30 ms         | 300       | ok       |           | new row                |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 224 ms          | 300       | ok       |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 22 ms           | 50        | ok       |           | new row                |
| transitions | slideshow (in page, painted frame)                                                   | 21 ms           | 50        | ok       |           | new row                |
| transitions | layoutGrid (in page, painted frame)                                                  | 14 ms           | 50        | ok       |           | new row                |
| filmstrip   | first pass longest frame                                                             | 42 ms           | 100       | ok       | 17        | +25 (+151%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 9.20 ms         | 20        | ok       | 10        | -0.80 (-8%) gain       |
| filmstrip   | steady passes longest frame                                                          | 18 ms           | 50        | ok       | 17        | +0.50 (+3%) loss       |
| filmstrip   | steady passes fps                                                                    | 119 fps         | 50        | ok       | 120       | -0.80 (-1%) loss       |
| filmstrip   | dom nodes with 85 cards (after GC; 1815 live elements)                               | 2,688           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 5         | -3 (-60%) gain         |
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
| write       | text burst: last keyup to local commit                                               | 96 ms           | 450       | ok       | 92        | +4.60 (+5%) loss       |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 96 ms           | 600       | ok       |           | new row                |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | new row                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                   |
| write       | new slide: pointerdown to painted card                                               | 16 ms           | 16        | ok       | 9.10      | +6.90 (+76%) loss      |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2039 ms         | 250       | MISS     |           | new row                |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2039 ms         |           | reported |           | new row                |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 3,412 ms        | 2,000     | MISS     | 1,470     | +1,942 (+132%) loss    |
| write       | home card of the scratch deck on the next /decks visit                               | 2889 ms         | 1,500     | MISS     | 1,489     | +1400 (+94%) loss      |
