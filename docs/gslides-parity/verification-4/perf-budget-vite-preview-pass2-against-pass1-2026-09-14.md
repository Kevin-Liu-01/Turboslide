121 of 151 asserted rows met (199 rows; 57 rows gained on the baseline, 56 lost, 48 unchanged, 36 new); run 2026-09-15T03:00:26.188Z to 2026-09-15T03:04:24.308Z against http://localhost:4346 (local); baseline 2026-09-14T23:08:33.591Z against http://localhost:4346 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 12 ms           | 60        | ok       | 6.91      | +5.05 (+73%) loss      |
| routes      | / cold fcp                                                                           | 140 ms          |           | reported | 108       | +32 (+30%) loss        |
| routes      | / cold lcp                                                                           | 156 ms          | 450       | ok       | 108       | +48 (+44%) loss        |
| routes      | / cold ready                                                                         | 361 ms          | 450       | ok       | 286       | +75 (+26%) loss        |
| routes      | / cold js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | / cold largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 80 ms           | 150       | ok       | 72        | +8 (+11%) loss         |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | / warm ttfb                                                                          | 7.64 ms         | 40        | ok       | 7.90      | -0.26 (-3%) gain       |
| routes      | / warm fcp                                                                           | 112 ms          |           | reported | 96        | +16 (+17%) loss        |
| routes      | / warm lcp                                                                           | 116 ms          | 250       | ok       | 96        | +20 (+21%) loss        |
| routes      | / warm ready                                                                         | 301 ms          | 250       | MISS     | 261       | +40 (+15%) loss        |
| routes      | / warm js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | / warm largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 82 ms           | 150       | ok       | 78        | +4 (+5%) loss          |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /home cold ttfb                                                                      | 10 ms           | 60        | ok       | 8.77      | +1.35 (+15%) loss      |
| routes      | /home cold fcp                                                                       | 216 ms          |           | reported | 112       | +104 (+93%) loss       |
| routes      | /home cold lcp                                                                       | 216 ms          | 400       | ok       | 112       | +104 (+93%) loss       |
| routes      | /home cold ready                                                                     | 129 ms          | 400       | ok       | 52        | +77 (+149%) loss       |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home cold largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 90 ms           | 150       | ok       | 51        | +39 (+76%) loss        |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 40,468    | same                   |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /home warm ttfb                                                                      | 5.62 ms         | 40        | ok       | 7.58      | -1.97 (-26%) gain      |
| routes      | /home warm fcp                                                                       | 96 ms           |           | reported | 116       | -20 (-17%) gain        |
| routes      | /home warm lcp                                                                       | 96 ms           | 200       | ok       | 116       | -20 (-17%) gain        |
| routes      | /home warm ready                                                                     | 34 ms           | 200       | ok       | 44        | -9.20 (-21%) gain      |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home warm largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 40,468    | same                   |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /new cold ttfb                                                                       | 4.66 ms         | 60        | ok       | 4.79      | -0.13 (-3%) gain       |
| routes      | /new cold fcp                                                                        | 88 ms           | 250       | ok       | 84        | +4 (+5%) loss          |
| routes      | /new cold lcp                                                                        | 88 ms           | 450       | ok       | 92        | -4 (-4%) gain          |
| routes      | /new cold ready                                                                      | 263 ms          | 450       | ok       | 270       | -6.70 (-2%) gain       |
| routes      | /new cold js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | /new cold largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 62 ms           | 150       | ok       | 67        | -5 (-7%) gain          |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 40 ms           |           | reported | 42        | -2.52 (-6%) gain       |
| routes      | /new warm ttfb                                                                       | 4.32 ms         | 40        | ok       | 4.79      | -0.48 (-10%) gain      |
| routes      | /new warm fcp                                                                        | 80 ms           | 150       | ok       | 80        | same                   |
| routes      | /new warm lcp                                                                        | 80 ms           | 250       | ok       | 80        | same                   |
| routes      | /new warm ready                                                                      | 223 ms          | 250       | ok       | 215       | +7.80 (+4%) loss       |
| routes      | /new warm js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | /new warm largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 65 ms           | 150       | ok       | 68        | -3 (-4%) gain          |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /decks cold ttfb                                                                     | 53 ms           | 150       | ok       | 34        | +19 (+55%) loss        |
| routes      | /decks cold fcp                                                                      | 188 ms          |           | reported | 172       | +16 (+9%) loss         |
| routes      | /decks cold lcp                                                                      | 428 ms          | 500       | ok       | 304       | +124 (+41%) loss       |
| routes      | /decks cold ready                                                                    | 370 ms          | 500       | ok       | 253       | +117 (+46%) loss       |
| routes      | /decks cold js decoded                                                               | 2,150,028 bytes | 600,000   | MISS     | 2,172,136 | -22,108 (-1%) gain     |
| routes      | /decks cold largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 93 ms           | 150       | ok       | 94        | -1 (-1%) gain          |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 733 live elements)                                  | 985             |           | reported |           | new row                |
| routes      | /decks cold images with 67 cards (decoded)                                           | 471,151 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 66 ms           |           | reported | 38        | +28 (+74%) loss        |
| routes      | /decks warm ttfb                                                                     | 48 ms           | 100       | ok       | 31        | +17 (+56%) loss        |
| routes      | /decks warm fcp                                                                      | 168 ms          |           | reported | 156       | +12 (+8%) loss         |
| routes      | /decks warm lcp                                                                      | 304 ms          | 300       | MISS     | 256       | +48 (+19%) loss        |
| routes      | /decks warm ready                                                                    | 229 ms          | 300       | ok       | 209       | +20 (+9%) loss         |
| routes      | /decks warm js decoded                                                               | 2,150,028 bytes | 600,000   | MISS     | 2,172,136 | -22,108 (-1%) gain     |
| routes      | /decks warm largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 88 ms           | 150       | ok       | 85        | +3 (+4%) loss          |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 733 live elements)                                  | 985             |           | reported |           | new row                |
| routes      | /decks warm images with 67 cards (decoded)                                           | 471,151 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 32 ms           | 150       | ok       | 23        | +8.11 (+35%) loss      |
| routes      | /decks/trash cold fcp                                                                | 104 ms          |           | reported | 88        | +16 (+18%) loss        |
| routes      | /decks/trash cold lcp                                                                | 124 ms          | 500       | ok       | 108       | +16 (+15%) loss        |
| routes      | /decks/trash cold ready                                                              | 158 ms          | 500       | ok       | 158       | +0.10 (+0%) loss       |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash cold largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 0 ms            | 150       | ok       | 0         | same                   |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 12,312 bytes    |           | reported | 9,624     | +2,688 (+28%) loss     |
| routes      | /decks/trash warm ttfb                                                               | 27 ms           | 100       | ok       | 17        | +11 (+63%) loss        |
| routes      | /decks/trash warm fcp                                                                | 88 ms           |           | reported | 76        | +12 (+16%) loss        |
| routes      | /decks/trash warm lcp                                                                | 132 ms          | 300       | ok       | 84        | +48 (+57%) loss        |
| routes      | /decks/trash warm ready                                                              | 142 ms          | 300       | ok       | 127       | +14 (+11%) loss        |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash warm largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 0         | same                   |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 12,312 bytes    |           | reported | 9,624     | +2,688 (+28%) loss     |
| routes      | /deck/gt-brand cold ttfb                                                             | 60 ms           | 250       | ok       | 49        | +12 (+24%) loss        |
| routes      | /deck/gt-brand cold fcp                                                              | 236 ms          |           | reported | 220       | +16 (+7%) loss         |
| routes      | /deck/gt-brand cold lcp                                                              | 236 ms          | 500       | ok       | 220       | +16 (+7%) loss         |
| routes      | /deck/gt-brand cold ready                                                            | 380 ms          | 600       | ok       | 393       | -13.10 (-3%) gain      |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 102 ms          | 150       | ok       | 121       | -19 (-16%) gain        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported | 516,149   | same                   |
| routes      | /deck/gt-brand warm ttfb                                                             | 51 ms           | 150       | ok       | 49        | +2.14 (+4%) loss       |
| routes      | /deck/gt-brand warm fcp                                                              | 180 ms          |           | reported | 196       | -16 (-8%) gain         |
| routes      | /deck/gt-brand warm lcp                                                              | 180 ms          | 300       | ok       | 196       | -16 (-8%) gain         |
| routes      | /deck/gt-brand warm ready                                                            | 290 ms          | 400       | ok       | 340       | -50.30 (-15%) gain     |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 74 ms           | 150       | ok       | 91        | -17 (-19%) gain        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported | 1,986,652 | -1,470,503 (-74%) gain |
| routes      | /edit/gt-brand cold ttfb                                                             | 62 ms           | 60        | MISS     | 30        | +32 (+106%) loss       |
| routes      | /edit/gt-brand cold fcp                                                              | 148 ms          | 250       | ok       | 112       | +36 (+32%) loss        |
| routes      | /edit/gt-brand cold lcp                                                              | 424 ms          | 700       | ok       | 404       | +20 (+5%) loss         |
| routes      | /edit/gt-brand cold ready                                                            | 379 ms          | 700       | ok       | 365       | +13 (+4%) loss         |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 2,257,712 | -22,108 (-1%) gain     |
| routes      | /edit/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 120 ms          | 150       | ok       | 136       | -16 (-12%) gain        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1548 live elements)                         | 2,153           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                   |
| routes      | /edit/gt-brand warm ttfb                                                             | 47 ms           | 40        | MISS     | 33        | +14 (+44%) loss        |
| routes      | /edit/gt-brand warm fcp                                                              | 124 ms          | 150       | ok       | 112       | +12 (+11%) loss        |
| routes      | /edit/gt-brand warm lcp                                                              | 344 ms          | 450       | ok       | 344       | same                   |
| routes      | /edit/gt-brand warm ready                                                            | 320 ms          | 450       | ok       | 321       | -1.30 (-0%) gain       |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 2,257,712 | -22,108 (-1%) gain     |
| routes      | /edit/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 121 ms          | 150       | ok       | 130       | -9 (-7%) gain          |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1544 live elements)                         | 2,150           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                   |
| routes      | /present/gt-brand cold ttfb                                                          | 53 ms           | 60        | ok       | 31        | +22 (+70%) loss        |
| routes      | /present/gt-brand cold fcp                                                           | 120 ms          |           | reported | 128       | -8 (-6%) gain          |
| routes      | /present/gt-brand cold lcp                                                           | 120 ms          | 500       | ok       | 128       | -8 (-6%) gain          |
| routes      | /present/gt-brand cold ready                                                         | 244 ms          | 500       | ok       | 262       | -17.40 (-7%) gain      |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand cold largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 70 ms           | 150       | ok       | 66        | +4 (+6%) loss          |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /present/gt-brand warm ttfb                                                          | 46 ms           | 40        | MISS     | 34        | +12 (+35%) loss        |
| routes      | /present/gt-brand warm fcp                                                           | 116 ms          |           | reported | 140       | -24 (-17%) gain        |
| routes      | /present/gt-brand warm lcp                                                           | 116 ms          | 300       | ok       | 140       | -24 (-17%) gain        |
| routes      | /present/gt-brand warm ready                                                         | 238 ms          | 300       | ok       | 219       | +19 (+9%) loss         |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand warm largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 69 ms           | 150       | ok       | 67        | +2 (+3%) loss          |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| transitions | decks->edit (in page)                                                                | 171 ms          | 300       | ok       | 368       | -196.60 (-53%) gain    |
| transitions | back (wall)                                                                          | 37 ms           | 100       | ok       | 70        | -33 (-47%) gain        |
| transitions | edit->decks (in page)                                                                | 12 ms           | 300       | ok       | 15        | -2.50 (-17%) gain      |
| transitions | trash->decks (in page)                                                               | 3.70 ms         | 300       | ok       | 4.30      | -0.60 (-14%) gain      |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 165 ms          | 300       | ok       |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 12 ms           | 50        | ok       | 14        | -2.20 (-15%) gain      |
| transitions | slideshow (in page, painted frame)                                                   | 15 ms           | 50        | ok       | 15        | same                   |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.70 ms         | 50        | ok       | 13        | -3 (-24%) gain         |
| filmstrip   | first pass longest frame                                                             | 50 ms           | 100       | ok       | 50        | same                   |
| filmstrip   | steady passes p95 frame                                                              | 10 ms           | 20        | ok       | 25        | -14.90 (-60%) gain     |
| filmstrip   | steady passes longest frame                                                          | 17 ms           | 50        | ok       | 50        | -33 (-66%) gain        |
| filmstrip   | steady passes fps                                                                    | 120 fps         | 50        | ok       | 88        | +31 (+36%) gain        |
| filmstrip   | dom nodes with 85 cards (after GC; 1815 live elements)                               | 2,688           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 3         | -1 (-33%) gain         |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       | 0         | same                   |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       | 0         | same                   |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache none)           | 0               |           | reported | 0         | same                   |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache none)              | 0               |           | reported | 0         | same                   |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache none)  | 0               |           | reported | 0         | same                   |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache none)  | 0               |           | reported | 0         | same                   |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache none)    | 0               |           | reported | 0         | same                   |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache none)     | 0               |           | reported | 0         | same                   |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache none)                  | 0               |           | reported | 0         | same                   |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | baseline               |
| write       | text burst: last keyup to local commit                                               | 96 ms           | 450       | ok       | 92        | +3.90 (+4%) loss       |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 96 ms           | 600       | ok       | 92        | +3.90 (+4%) loss       |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | baseline               |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                   |
| write       | new slide: pointerdown to painted card                                               | 16 ms           | 16        | MISS     | 12        | +4.40 (+37%) loss      |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2042 ms         | 250       | MISS     | 2032      | +9.30 (+0%) loss       |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2042 ms         |           | reported | 2032      | +9.30 (+0%) loss       |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 2,723 ms        | 2,000     | MISS     | 3,106     | -383 (-12%) gain       |
| write       | home card of the scratch deck on the next /decks visit                               | 3005 ms         | 1,500     | MISS     | 3190      | -184.70 (-6%) gain     |
