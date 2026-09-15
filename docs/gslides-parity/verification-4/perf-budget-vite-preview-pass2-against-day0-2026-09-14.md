121 of 151 asserted rows met (199 rows; 37 rows gained on the baseline, 55 lost, 16 unchanged, 91 new); run 2026-09-15T03:00:26.188Z to 2026-09-15T03:04:24.308Z against http://localhost:4346 (local); baseline 2026-09-14T14:53:08.794Z against http://localhost:4346 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 12 ms           | 60        | ok       | 1.60      | +10 (+648%) loss       |
| routes      | / cold fcp                                                                           | 140 ms          |           | reported | 60        | +80 (+133%) loss       |
| routes      | / cold lcp                                                                           | 156 ms          | 450       | ok       | 692       | -536 (-77%) gain       |
| routes      | / cold ready                                                                         | 361 ms          | 450       | ok       | 673       | -312.60 (-46%) gain    |
| routes      | / cold js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | / cold largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 80 ms           | 150       | ok       | 62        | +18 (+29%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 7.64 ms         | 40        | ok       | 1.84      | +5.81 (+316%) loss     |
| routes      | / warm fcp                                                                           | 112 ms          |           | reported | 60        | +52 (+87%) loss        |
| routes      | / warm lcp                                                                           | 116 ms          | 250       | ok       | 672       | -556 (-83%) gain       |
| routes      | / warm ready                                                                         | 301 ms          | 250       | MISS     | 653       | -351.30 (-54%) gain    |
| routes      | / warm js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | / warm largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 82 ms           | 150       | ok       | 60        | +22 (+37%) loss        |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 10 ms           | 60        | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 216 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 216 ms          | 400       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 129 ms          | 400       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 90 ms           | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 5.62 ms         | 40        | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 96 ms           |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 96 ms           | 200       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 34 ms           | 200       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 4.66 ms         | 60        | ok       | 2.02      | +2.64 (+131%) loss     |
| routes      | /new cold fcp                                                                        | 88 ms           | 250       | ok       | 64        | +24 (+38%) loss        |
| routes      | /new cold lcp                                                                        | 88 ms           | 450       | ok       | 688       | -600 (-87%) gain       |
| routes      | /new cold ready                                                                      | 263 ms          | 450       | ok       | 672       | -408.70 (-61%) gain    |
| routes      | /new cold js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | /new cold largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 62 ms           | 150       | ok       | 63        | -1 (-2%) gain          |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 40 ms           |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 4.32 ms         | 40        | ok       | 2.00      | +2.32 (+116%) loss     |
| routes      | /new warm fcp                                                                        | 80 ms           | 150       | ok       | 60        | +20 (+33%) loss        |
| routes      | /new warm lcp                                                                        | 80 ms           | 250       | ok       | 660       | -580 (-88%) gain       |
| routes      | /new warm ready                                                                      | 223 ms          | 250       | ok       | 648       | -425.30 (-66%) gain    |
| routes      | /new warm js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 3,122,113 | -889,255 (-28%) gain   |
| routes      | /new warm largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 65 ms           | 150       | ok       | 61        | +4 (+7%) loss          |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 53 ms           | 150       | ok       | 18        | +35 (+194%) loss       |
| routes      | /decks cold fcp                                                                      | 188 ms          |           | reported | 120       | +68 (+57%) loss        |
| routes      | /decks cold lcp                                                                      | 428 ms          | 500       | ok       | 212       | +216 (+102%) loss      |
| routes      | /decks cold ready                                                                    | 370 ms          | 500       | ok       | 179       | +190 (+106%) loss      |
| routes      | /decks cold js decoded                                                               | 2,150,028 bytes | 600,000   | MISS     | 3,045,067 | -895,039 (-29%) gain   |
| routes      | /decks cold largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 93 ms           | 150       | ok       | 63        | +30 (+48%) loss        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 733 live elements)                                  | 985             |           | reported |           | new row                |
| routes      | /decks cold images with 67 cards (decoded)                                           | 471,151 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 66 ms           |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 48 ms           | 100       | ok       | 18        | +29 (+163%) loss       |
| routes      | /decks warm fcp                                                                      | 168 ms          |           | reported | 116       | +52 (+45%) loss        |
| routes      | /decks warm lcp                                                                      | 304 ms          | 300       | MISS     | 208       | +96 (+46%) loss        |
| routes      | /decks warm ready                                                                    | 229 ms          | 300       | ok       | 177       | +52 (+29%) loss        |
| routes      | /decks warm js decoded                                                               | 2,150,028 bytes | 600,000   | MISS     | 3,045,067 | -895,039 (-29%) gain   |
| routes      | /decks warm largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 88 ms           | 150       | ok       | 59        | +29 (+49%) loss        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 733 live elements)                                  | 985             |           | reported |           | new row                |
| routes      | /decks warm images with 67 cards (decoded)                                           | 471,151 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 32 ms           | 150       | ok       | 10        | +21 (+213%) loss       |
| routes      | /decks/trash cold fcp                                                                | 104 ms          |           | reported | 68        | +36 (+53%) loss        |
| routes      | /decks/trash cold lcp                                                                | 124 ms          | 500       | ok       | 76        | +48 (+63%) loss        |
| routes      | /decks/trash cold ready                                                              | 158 ms          | 500       | ok       | 135       | +24 (+18%) loss        |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash cold largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 0 ms            | 150       | ok       | 64        | -64 (-100%) gain       |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 12,312 bytes    |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 27 ms           | 100       | ok       | 10        | +17 (+173%) loss       |
| routes      | /decks/trash warm fcp                                                                | 88 ms           |           | reported | 72        | +16 (+22%) loss        |
| routes      | /decks/trash warm lcp                                                                | 132 ms          | 300       | ok       | 128       | +4 (+3%) loss          |
| routes      | /decks/trash warm ready                                                              | 142 ms          | 300       | ok       | 120       | +22 (+18%) loss        |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 3,032,656 | -2,400,274 (-79%) gain |
| routes      | /decks/trash warm largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 62        | -62 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 12,312 bytes    |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 60 ms           | 250       | ok       | 34        | +26 (+75%) loss        |
| routes      | /deck/gt-brand cold fcp                                                              | 236 ms          |           | reported | 140       | +96 (+69%) loss        |
| routes      | /deck/gt-brand cold lcp                                                              | 236 ms          | 500       | ok       | 140       | +96 (+69%) loss        |
| routes      | /deck/gt-brand cold ready                                                            | 380 ms          | 600       | ok       | 231       | +149 (+65%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 102 ms          | 150       | ok       | 64        | +38 (+59%) loss        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 51 ms           | 150       | ok       | 32        | +20 (+63%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 180 ms          |           | reported | 124       | +56 (+45%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 180 ms          | 300       | ok       | 124       | +56 (+45%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 290 ms          | 400       | ok       | 216       | +74 (+34%) loss        |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 3,128,584 | -1,285,500 (-41%) gain |
| routes      | /deck/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 74 ms           | 150       | ok       | 60        | +14 (+23%) loss        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 62 ms           | 60        | MISS     | 2.37      | +60 (+2516%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 148 ms          | 250       | ok       | 60        | +88 (+147%) loss       |
| routes      | /edit/gt-brand cold lcp                                                              | 424 ms          | 700       | ok       | 796       | -372 (-47%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 379 ms          | 700       | ok       | 728       | -349.20 (-48%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 3,263,637 | -1,028,033 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 120 ms          | 150       | ok       | 90        | +30 (+33%) loss        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1548 live elements)                         | 2,153           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 47 ms           | 40        | MISS     | 1.95      | +45 (+2313%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 124 ms          | 150       | ok       | 60        | +64 (+107%) loss       |
| routes      | /edit/gt-brand warm lcp                                                              | 344 ms          | 450       | ok       | 720       | -376 (-52%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 320 ms          | 450       | ok       | 699       | -379.80 (-54%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 3,263,637 | -1,028,033 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 121 ms          | 150       | ok       | 93        | +28 (+30%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1544 live elements)                         | 2,150           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 53 ms           | 60        | ok       | 1.91      | +51 (+2672%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 120 ms          |           | reported | 692       | -572 (-83%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 120 ms          | 500       | ok       | 700       | -580 (-83%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 244 ms          | 500       | ok       | 667       | -422.60 (-63%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand cold largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 70 ms           | 150       | ok       | 59        | +11 (+19%) loss        |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 46 ms           | 40        | MISS     | 1.97      | +44 (+2262%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 116 ms          |           | reported | 668       | -552 (-83%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 116 ms          | 300       | ok       | 808       | -692 (-86%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 238 ms          | 300       | ok       | 646       | -407.70 (-63%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 3,132,922 | -1,768,497 (-56%) gain |
| routes      | /present/gt-brand warm largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 69 ms           | 150       | ok       | 60        | +9 (+15%) loss         |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 171 ms          | 300       | ok       |           | new row                |
| transitions | back (wall)                                                                          | 37 ms           | 100       | ok       |           | new row                |
| transitions | edit->decks (in page)                                                                | 12 ms           | 300       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 3.70 ms         | 300       | ok       |           | new row                |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 165 ms          | 300       | ok       |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 12 ms           | 50        | ok       |           | new row                |
| transitions | slideshow (in page, painted frame)                                                   | 15 ms           | 50        | ok       |           | new row                |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.70 ms         | 50        | ok       |           | new row                |
| filmstrip   | first pass longest frame                                                             | 50 ms           | 100       | ok       | 17        | +33 (+201%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 10 ms           | 20        | ok       | 10        | +0.10 (+1%) loss       |
| filmstrip   | steady passes longest frame                                                          | 17 ms           | 50        | ok       | 17        | same                   |
| filmstrip   | steady passes fps                                                                    | 120 fps         | 50        | ok       | 120       | +0.00 (+0%) gain       |
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
| write       | text burst: last keyup to local commit                                               | 96 ms           | 450       | ok       | 92        | +4.30 (+5%) loss       |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 96 ms           | 600       | ok       |           | new row                |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | new row                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                   |
| write       | new slide: pointerdown to painted card                                               | 16 ms           | 16        | MISS     | 9.10      | +7.30 (+80%) loss      |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2042 ms         | 250       | MISS     |           | new row                |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2042 ms         |           | reported |           | new row                |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 2,723 ms        | 2,000     | MISS     | 1,470     | +1,253 (+85%) loss     |
| write       | home card of the scratch deck on the next /decks visit                               | 3005 ms         | 1,500     | MISS     | 1,489     | +1516 (+102%) loss     |
