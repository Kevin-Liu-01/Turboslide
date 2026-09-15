128 of 151 asserted rows met (199 rows; 61 rows gained on the baseline, 31 lost, 16 unchanged, 91 new); run 2026-09-15T05:50:02.002Z to 2026-09-15T05:53:43.052Z against http://localhost:4321 (local); baseline 2026-09-14T14:53:08.794Z against http://localhost:4346 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 3.91 ms         | 60        | ok       | 1.60      | +2.31 (+145%) loss     |
| routes      | / cold fcp                                                                           | 64 ms           |           | reported | 60        | +4 (+7%) loss          |
| routes      | / cold lcp                                                                           | 64 ms           | 450       | ok       | 692       | -628 (-91%) gain       |
| routes      | / cold ready                                                                         | 148 ms          | 450       | ok       | 673       | -524.90 (-78%) gain    |
| routes      | / cold js decoded                                                                    | 2,235,108 bytes | 2,000,000 | MISS     | 3,122,113 | -887,005 (-28%) gain   |
| routes      | / cold largest js (index-zmcb2DMX.js)                                                | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 0 ms            | 150       | ok       | 62        | -62 (-100%) gain       |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 3.98 ms         | 40        | ok       | 1.84      | +2.15 (+117%) loss     |
| routes      | / warm fcp                                                                           | 80 ms           |           | reported | 60        | +20 (+33%) loss        |
| routes      | / warm lcp                                                                           | 80 ms           | 250       | ok       | 672       | -592 (-88%) gain       |
| routes      | / warm ready                                                                         | 142 ms          | 250       | ok       | 653       | -510.10 (-78%) gain    |
| routes      | / warm js decoded                                                                    | 2,235,108 bytes | 2,000,000 | MISS     | 3,122,113 | -887,005 (-28%) gain   |
| routes      | / warm largest js (index-zmcb2DMX.js)                                                | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 5.74 ms         | 60        | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 84 ms           |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 84 ms           | 400       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 32 ms           | 400       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 678,544 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-zmcb2DMX.js)                                            | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 0.08 ms         | 40        | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 68 ms           |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 68 ms           | 200       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 33 ms           | 200       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 678,544 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-zmcb2DMX.js)                                            | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 3.53 ms         | 60        | ok       | 2.02      | +1.51 (+75%) loss      |
| routes      | /new cold fcp                                                                        | 60 ms           | 250       | ok       | 64        | -4 (-6%) gain          |
| routes      | /new cold lcp                                                                        | 60 ms           | 450       | ok       | 688       | -628 (-91%) gain       |
| routes      | /new cold ready                                                                      | 141 ms          | 450       | ok       | 672       | -530.60 (-79%) gain    |
| routes      | /new cold js decoded                                                                 | 2,235,108 bytes | 2,000,000 | MISS     | 3,122,113 | -887,005 (-28%) gain   |
| routes      | /new cold largest js (index-zmcb2DMX.js)                                             | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 0 ms            | 150       | ok       | 63        | -63 (-100%) gain       |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 4.13 ms         |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 3.17 ms         | 40        | ok       | 2.00      | +1.17 (+58%) loss      |
| routes      | /new warm fcp                                                                        | 80 ms           | 150       | ok       | 60        | +20 (+33%) loss        |
| routes      | /new warm lcp                                                                        | 80 ms           | 250       | ok       | 660       | -580 (-88%) gain       |
| routes      | /new warm ready                                                                      | 141 ms          | 250       | ok       | 648       | -507.30 (-78%) gain    |
| routes      | /new warm js decoded                                                                 | 2,235,108 bytes | 2,000,000 | MISS     | 3,122,113 | -887,005 (-28%) gain   |
| routes      | /new warm largest js (index-zmcb2DMX.js)                                             | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 0 ms            | 150       | ok       | 61        | -61 (-100%) gain       |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 34 ms           | 150       | ok       | 18        | +16 (+90%) loss        |
| routes      | /decks cold fcp                                                                      | 124 ms          |           | reported | 120       | +4 (+3%) loss          |
| routes      | /decks cold lcp                                                                      | 316 ms          | 500       | ok       | 212       | +104 (+49%) loss       |
| routes      | /decks cold ready                                                                    | 265 ms          | 500       | ok       | 179       | +86 (+48%) loss        |
| routes      | /decks cold js decoded                                                               | 2,152,278 bytes | 600,000   | MISS     | 3,045,067 | -892,789 (-29%) gain   |
| routes      | /decks cold largest js (index-zmcb2DMX.js)                                           | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 57 ms           | 150       | ok       | 63        | -6 (-10%) gain         |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 724 live elements)                                  | 973             |           | reported |           | new row                |
| routes      | /decks cold images with 66 cards (decoded)                                           | 469,584 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 36 ms           |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 31 ms           | 100       | ok       | 18        | +13 (+70%) loss        |
| routes      | /decks warm fcp                                                                      | 112 ms          |           | reported | 116       | -4 (-3%) gain          |
| routes      | /decks warm lcp                                                                      | 180 ms          | 300       | ok       | 208       | -28 (-13%) gain        |
| routes      | /decks warm ready                                                                    | 134 ms          | 300       | ok       | 177       | -43.20 (-24%) gain     |
| routes      | /decks warm js decoded                                                               | 2,152,278 bytes | 600,000   | MISS     | 3,045,067 | -892,789 (-29%) gain   |
| routes      | /decks warm largest js (index-zmcb2DMX.js)                                           | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 0 ms            | 150       | ok       | 59        | -59 (-100%) gain       |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 724 live elements)                                  | 973             |           | reported |           | new row                |
| routes      | /decks warm images with 66 cards (decoded)                                           | 469,584 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 16 ms           | 150       | ok       | 10        | +6.25 (+62%) loss      |
| routes      | /decks/trash cold fcp                                                                | 80 ms           |           | reported | 68        | +12 (+18%) loss        |
| routes      | /decks/trash cold lcp                                                                | 92 ms           | 500       | ok       | 76        | +16 (+21%) loss        |
| routes      | /decks/trash cold ready                                                              | 84 ms           | 500       | ok       | 135       | -50.90 (-38%) gain     |
| routes      | /decks/trash cold js decoded                                                         | 633,187 bytes   | 600,000   | MISS     | 3,032,656 | -2,399,469 (-79%) gain |
| routes      | /decks/trash cold largest js (index-zmcb2DMX.js)                                     | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 0 ms            | 150       | ok       | 64        | -64 (-100%) gain       |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 12,312 bytes    |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 16 ms           | 100       | ok       | 10        | +5.76 (+58%) loss      |
| routes      | /decks/trash warm fcp                                                                | 84 ms           |           | reported | 72        | +12 (+17%) loss        |
| routes      | /decks/trash warm lcp                                                                | 92 ms           | 300       | ok       | 128       | -36 (-28%) gain        |
| routes      | /decks/trash warm ready                                                              | 82 ms           | 300       | ok       | 120       | -37.80 (-32%) gain     |
| routes      | /decks/trash warm js decoded                                                         | 633,187 bytes   | 600,000   | MISS     | 3,032,656 | -2,399,469 (-79%) gain |
| routes      | /decks/trash warm largest js (index-zmcb2DMX.js)                                     | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 62        | -62 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 12,312 bytes    |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 36 ms           | 250       | ok       | 34        | +1.21 (+4%) loss       |
| routes      | /deck/gt-brand cold fcp                                                              | 120 ms          |           | reported | 140       | -20 (-14%) gain        |
| routes      | /deck/gt-brand cold lcp                                                              | 120 ms          | 500       | ok       | 140       | -20 (-14%) gain        |
| routes      | /deck/gt-brand cold ready                                                            | 189 ms          | 600       | ok       | 231       | -42.20 (-18%) gain     |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,844,190 bytes | 1,000,000 | MISS     | 3,128,584 | -1,284,394 (-41%) gain |
| routes      | /deck/gt-brand cold largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 0 ms            | 150       | ok       | 64        | -64 (-100%) gain       |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 35 ms           | 150       | ok       | 32        | +3.86 (+12%) loss      |
| routes      | /deck/gt-brand warm fcp                                                              | 132 ms          |           | reported | 124       | +8 (+6%) loss          |
| routes      | /deck/gt-brand warm lcp                                                              | 132 ms          | 300       | ok       | 124       | +8 (+6%) loss          |
| routes      | /deck/gt-brand warm ready                                                            | 206 ms          | 400       | ok       | 216       | -10.30 (-5%) gain      |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,844,190 bytes | 1,000,000 | MISS     | 3,128,584 | -1,284,394 (-41%) gain |
| routes      | /deck/gt-brand warm largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 34 ms           | 60        | ok       | 2.37      | +31 (+1312%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 88 ms           | 250       | ok       | 60        | +28 (+47%) loss        |
| routes      | /edit/gt-brand cold lcp                                                              | 248 ms          | 700       | ok       | 796       | -548 (-69%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 224 ms          | 700       | ok       | 728       | -503.50 (-69%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,237,854 bytes | 2,000,000 | MISS     | 3,263,637 | -1,025,783 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 90 ms           | 150       | ok       | 90        | same                   |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1548 live elements)                         | 2,153           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 34 ms           | 40        | ok       | 1.95      | +32 (+1666%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 92 ms           | 150       | ok       | 60        | +32 (+53%) loss        |
| routes      | /edit/gt-brand warm lcp                                                              | 248 ms          | 450       | ok       | 720       | -472 (-66%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 225 ms          | 450       | ok       | 699       | -474.30 (-68%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,237,854 bytes | 2,000,000 | MISS     | 3,263,637 | -1,025,783 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 95 ms           | 150       | ok       | 93        | +2 (+2%) loss          |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1531 live elements)                         | 2,137           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 32 ms           | 60        | ok       | 1.91      | +30 (+1569%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 108 ms          |           | reported | 692       | -584 (-84%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 108 ms          | 500       | ok       | 700       | -592 (-85%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 153 ms          | 500       | ok       | 667       | -513.40 (-77%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,365,383 bytes | 1,200,000 | MISS     | 3,132,922 | -1,767,539 (-56%) gain |
| routes      | /present/gt-brand cold largest js (index-zmcb2DMX.js)                                | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 0 ms            | 150       | ok       | 59        | -59 (-100%) gain       |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 34 ms           | 40        | ok       | 1.97      | +32 (+1626%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 84 ms           |           | reported | 668       | -584 (-87%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 84 ms           | 300       | ok       | 808       | -724 (-90%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 156 ms          | 300       | ok       | 646       | -489.50 (-76%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,365,383 bytes | 1,200,000 | MISS     | 3,132,922 | -1,767,539 (-56%) gain |
| routes      | /present/gt-brand warm largest js (index-zmcb2DMX.js)                                | 578,754 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 132 ms          | 300       | ok       |           | new row                |
| transitions | back (wall)                                                                          | 32 ms           | 100       | ok       |           | new row                |
| transitions | edit->decks (in page)                                                                | 15 ms           | 300       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 5.70 ms         | 300       | ok       |           | new row                |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 130 ms          | 300       | ok       |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 10 ms           | 50        | ok       |           | new row                |
| transitions | slideshow (in page, painted frame)                                                   | 14 ms           | 50        | ok       |           | new row                |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.30 ms         | 50        | ok       |           | new row                |
| filmstrip   | first pass longest frame                                                             | 33 ms           | 100       | ok       | 17        | +17 (+101%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 9.20 ms         | 20        | ok       | 10        | -0.80 (-8%) gain       |
| filmstrip   | steady passes longest frame                                                          | 9.40 ms         | 50        | ok       | 17        | -7.60 (-45%) gain      |
| filmstrip   | steady passes fps                                                                    | 120 fps         | 50        | ok       | 120       | +0.49 (+0%) gain       |
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
| write       | text burst: last keyup to local commit                                               | 88 ms           | 450       | ok       | 92        | -3.70 (-4%) gain       |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 88 ms           | 600       | ok       |           | new row                |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | new row                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                   |
| write       | new slide: pointerdown to painted card                                               | 8.90 ms         | 16        | ok       | 9.10      | -0.20 (-2%) gain       |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2021 ms         | 250       | MISS     |           | new row                |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2021 ms         |           | reported |           | new row                |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 1,512 ms        | 2,000     | ok       | 1,470     | +42 (+3%) loss         |
| write       | home card of the scratch deck on the next /decks visit                               | 1584 ms         | 1,500     | MISS     | 1,489     | +95 (+6%) loss         |
