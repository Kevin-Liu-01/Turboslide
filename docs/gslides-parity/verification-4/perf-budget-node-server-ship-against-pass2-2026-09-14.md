128 of 151 asserted rows met (199 rows; 93 rows gained on the baseline, 23 lost, 64 unchanged, 17 new); run 2026-09-15T05:50:02.002Z to 2026-09-15T05:53:43.052Z against http://localhost:4321 (local); baseline 2026-09-15T02:33:16.032Z against http://localhost:4321 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                  |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ----------------------- |
| routes      | / cold ttfb                                                                          | 3.91 ms         | 60        | ok       | 9.40      | -5.49 (-58%) gain       |
| routes      | / cold fcp                                                                           | 64 ms           |           | reported | 164       | -100 (-61%) gain        |
| routes      | / cold lcp                                                                           | 64 ms           | 450       | ok       | 164       | -100 (-61%) gain        |
| routes      | / cold ready                                                                         | 148 ms          | 450       | ok       | 381       | -233 (-61%) gain        |
| routes      | / cold js decoded                                                                    | 2,235,108 bytes | 2,000,000 | MISS     | 2,232,858 | +2,250 (+0%) loss       |
| routes      | / cold largest js (index-zmcb2DMX.js)                                                | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | / cold longest animation frame                                                       | 0 ms            | 150       | ok       | 93        | -93 (-100%) gain        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | / cold dom nodes (after GC; 499 live elements)                                       | 593             |           | reported | 593       | same                    |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                    |
| routes      | / warm ttfb                                                                          | 3.98 ms         | 40        | ok       | 24        | -19.86 (-83%) gain      |
| routes      | / warm fcp                                                                           | 80 ms           |           | reported | 128       | -48 (-38%) gain         |
| routes      | / warm lcp                                                                           | 80 ms           | 250       | ok       | 128       | -48 (-38%) gain         |
| routes      | / warm ready                                                                         | 142 ms          | 250       | ok       | 289       | -147 (-51%) gain        |
| routes      | / warm js decoded                                                                    | 2,235,108 bytes | 2,000,000 | MISS     | 2,232,858 | +2,250 (+0%) loss       |
| routes      | / warm largest js (index-zmcb2DMX.js)                                                | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | / warm longest animation frame                                                       | 0 ms            | 150       | ok       | 82        | -82 (-100%) gain        |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | / warm dom nodes (after GC; 499 live elements)                                       | 593             |           | reported | 593       | same                    |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                    |
| routes      | /home cold ttfb                                                                      | 5.74 ms         | 60        | ok       | 9.78      | -4.05 (-41%) gain       |
| routes      | /home cold fcp                                                                       | 84 ms           |           | reported | 136       | -52 (-38%) gain         |
| routes      | /home cold lcp                                                                       | 84 ms           | 400       | ok       | 136       | -52 (-38%) gain         |
| routes      | /home cold ready                                                                     | 32 ms           | 400       | ok       | 49        | -17.10 (-35%) gain      |
| routes      | /home cold js decoded                                                                | 678,544 bytes   | 600,000   | MISS     | 677,739   | +805 (+0%) loss         |
| routes      | /home cold largest js (index-zmcb2DMX.js)                                            | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /home cold longest animation frame                                                   | 0 ms            | 150       | ok       | 0         | same                    |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported | 1,017     | same                    |
| routes      | /home cold images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       | 40,468    | +27,552 (+68%) loss     |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                    |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                    |
| routes      | /home warm ttfb                                                                      | 0.08 ms         | 40        | ok       | 0.12      | -0.03 (-30%) gain       |
| routes      | /home warm fcp                                                                       | 68 ms           |           | reported | 112       | -44 (-39%) gain         |
| routes      | /home warm lcp                                                                       | 68 ms           | 200       | ok       | 112       | -44 (-39%) gain         |
| routes      | /home warm ready                                                                     | 33 ms           | 200       | ok       | 48        | -15.00 (-31%) gain      |
| routes      | /home warm js decoded                                                                | 678,544 bytes   | 600,000   | MISS     | 677,739   | +805 (+0%) loss         |
| routes      | /home warm largest js (index-zmcb2DMX.js)                                            | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       | 53        | -53 (-100%) gain        |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported | 1,017     | same                    |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       | 68,020    | same                    |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                    |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                    |
| routes      | /new cold ttfb                                                                       | 3.53 ms         | 60        | ok       | 18        | -14.21 (-80%) gain      |
| routes      | /new cold fcp                                                                        | 60 ms           | 250       | ok       | 204       | -144 (-71%) gain        |
| routes      | /new cold lcp                                                                        | 60 ms           | 450       | ok       | 204       | -144 (-71%) gain        |
| routes      | /new cold ready                                                                      | 141 ms          | 450       | ok       | 323       | -181.60 (-56%) gain     |
| routes      | /new cold js decoded                                                                 | 2,235,108 bytes | 2,000,000 | MISS     | 2,232,858 | +2,250 (+0%) loss       |
| routes      | /new cold largest js (index-zmcb2DMX.js)                                             | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /new cold longest animation frame                                                    | 0 ms            | 150       | ok       | 74        | -74 (-100%) gain        |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /new cold dom nodes (after GC; 499 live elements)                                    | 593             |           | reported | 593       | same                    |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                    |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 4.13 ms         |           | reported | 69        | -65.25 (-94%) gain      |
| routes      | /new warm ttfb                                                                       | 3.17 ms         | 40        | ok       | 6.82      | -3.65 (-54%) gain       |
| routes      | /new warm fcp                                                                        | 80 ms           | 150       | ok       | 116       | -36 (-31%) gain         |
| routes      | /new warm lcp                                                                        | 80 ms           | 250       | ok       | 116       | -36 (-31%) gain         |
| routes      | /new warm ready                                                                      | 141 ms          | 250       | ok       | 242       | -101.40 (-42%) gain     |
| routes      | /new warm js decoded                                                                 | 2,235,108 bytes | 2,000,000 | MISS     | 2,232,858 | +2,250 (+0%) loss       |
| routes      | /new warm largest js (index-zmcb2DMX.js)                                             | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /new warm longest animation frame                                                    | 0 ms            | 150       | ok       | 75        | -75 (-100%) gain        |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /new warm dom nodes (after GC; 499 live elements)                                    | 593             |           | reported | 593       | same                    |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                    |
| routes      | /decks cold ttfb                                                                     | 34 ms           | 150       | ok       | 57        | -22.29 (-39%) gain      |
| routes      | /decks cold fcp                                                                      | 124 ms          |           | reported | 232       | -108 (-47%) gain        |
| routes      | /decks cold lcp                                                                      | 316 ms          | 500       | ok       | 624       | -308 (-49%) gain        |
| routes      | /decks cold ready                                                                    | 265 ms          | 500       | ok       | 549       | -284.20 (-52%) gain     |
| routes      | /decks cold js decoded                                                               | 2,152,278 bytes | 600,000   | MISS     | 730,075   | +1,422,203 (+195%) loss |
| routes      | /decks cold largest js (index-zmcb2DMX.js)                                           | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /decks cold longest animation frame                                                  | 57 ms           | 150       | ok       | 92        | -35 (-38%) gain         |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /decks cold dom nodes (after GC; 724 live elements)                                  | 973             |           | reported | 973       | same                    |
| routes      | /decks cold images with 66 cards (decoded)                                           | 469,584 bytes   | 1,500,000 | ok       | 39,889    | +429,695 (+1077%) loss  |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 36 ms           |           | reported | 100       | -63.05 (-63%) gain      |
| routes      | /decks warm ttfb                                                                     | 31 ms           | 100       | ok       | 63        | -32.71 (-52%) gain      |
| routes      | /decks warm fcp                                                                      | 112 ms          |           | reported | 208       | -96 (-46%) gain         |
| routes      | /decks warm lcp                                                                      | 180 ms          | 300       | ok       | 328       | -148 (-45%) gain        |
| routes      | /decks warm ready                                                                    | 134 ms          | 300       | ok       | 260       | -126.10 (-49%) gain     |
| routes      | /decks warm js decoded                                                               | 2,152,278 bytes | 600,000   | MISS     | 730,075   | +1,422,203 (+195%) loss |
| routes      | /decks warm largest js (index-zmcb2DMX.js)                                           | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /decks warm longest animation frame                                                  | 0 ms            | 150       | ok       | 63        | -63 (-100%) gain        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /decks warm dom nodes (after GC; 724 live elements)                                  | 973             |           | reported | 973       | same                    |
| routes      | /decks warm images with 66 cards (decoded)                                           | 469,584 bytes   | 1,500,000 | ok       | 39,889    | +429,695 (+1077%) loss  |
| routes      | /decks/trash cold ttfb                                                               | 16 ms           | 150       | ok       | 35        | -19.08 (-54%) gain      |
| routes      | /decks/trash cold fcp                                                                | 80 ms           |           | reported | 112       | -32 (-29%) gain         |
| routes      | /decks/trash cold lcp                                                                | 92 ms           | 500       | ok       | 148       | -56 (-38%) gain         |
| routes      | /decks/trash cold ready                                                              | 84 ms           | 500       | ok       | 149       | -65.00 (-44%) gain      |
| routes      | /decks/trash cold js decoded                                                         | 633,187 bytes   | 600,000   | MISS     | 632,382   | +805 (+0%) loss         |
| routes      | /decks/trash cold largest js (index-zmcb2DMX.js)                                     | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /decks/trash cold longest animation frame                                            | 0 ms            | 150       | ok       | 0         | same                    |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 143             |           | reported | 143       | same                    |
| routes      | /decks/trash cold images before ready (decoded)                                      | 12,312 bytes    |           | reported | 12,312    | same                    |
| routes      | /decks/trash warm ttfb                                                               | 16 ms           | 100       | ok       | 24        | -8.62 (-35%) gain       |
| routes      | /decks/trash warm fcp                                                                | 84 ms           |           | reported | 92        | -8 (-9%) gain           |
| routes      | /decks/trash warm lcp                                                                | 92 ms           | 300       | ok       | 120       | -28 (-23%) gain         |
| routes      | /decks/trash warm ready                                                              | 82 ms           | 300       | ok       | 135       | -53 (-39%) gain         |
| routes      | /decks/trash warm js decoded                                                         | 633,187 bytes   | 600,000   | MISS     | 632,382   | +805 (+0%) loss         |
| routes      | /decks/trash warm largest js (index-zmcb2DMX.js)                                     | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 0         | same                    |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 143             |           | reported | 143       | same                    |
| routes      | /decks/trash warm images before ready (decoded)                                      | 12,312 bytes    |           | reported | 12,312    | same                    |
| routes      | /deck/gt-brand cold ttfb                                                             | 36 ms           | 250       | ok       | 48        | -12.28 (-26%) gain      |
| routes      | /deck/gt-brand cold fcp                                                              | 120 ms          |           | reported | 196       | -76 (-39%) gain         |
| routes      | /deck/gt-brand cold lcp                                                              | 120 ms          | 500       | ok       | 196       | -76 (-39%) gain         |
| routes      | /deck/gt-brand cold ready                                                            | 189 ms          | 600       | ok       | 332       | -143.30 (-43%) gain     |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,844,190 bytes | 1,000,000 | MISS     | 1,843,084 | +1,106 (+0%) loss       |
| routes      | /deck/gt-brand cold largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /deck/gt-brand cold longest animation frame                                          | 0 ms            | 150       | ok       | 87        | -87 (-100%) gain        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                    |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     | 2,503     | same                    |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported | 516,149   | same                    |
| routes      | /deck/gt-brand warm ttfb                                                             | 35 ms           | 150       | ok       | 53        | -17.35 (-33%) gain      |
| routes      | /deck/gt-brand warm fcp                                                              | 132 ms          |           | reported | 180       | -48 (-27%) gain         |
| routes      | /deck/gt-brand warm lcp                                                              | 132 ms          | 300       | ok       | 180       | -48 (-27%) gain         |
| routes      | /deck/gt-brand warm ready                                                            | 206 ms          | 400       | ok       | 293       | -87.20 (-30%) gain      |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,844,190 bytes | 1,000,000 | MISS     | 1,843,084 | +1,106 (+0%) loss       |
| routes      | /deck/gt-brand warm largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /deck/gt-brand warm longest animation frame                                          | 0 ms            | 150       | ok       | 73        | -73 (-100%) gain        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                    |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     | 2,502     | same                    |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported | 516,149   | same                    |
| routes      | /edit/gt-brand cold ttfb                                                             | 34 ms           | 60        | ok       | 63        | -29.23 (-47%) gain      |
| routes      | /edit/gt-brand cold fcp                                                              | 88 ms           | 250       | ok       | 128       | -40 (-31%) gain         |
| routes      | /edit/gt-brand cold lcp                                                              | 248 ms          | 700       | ok       | 352       | -104 (-30%) gain        |
| routes      | /edit/gt-brand cold ready                                                            | 224 ms          | 700       | ok       | 330       | -105.70 (-32%) gain     |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,237,854 bytes | 2,000,000 | MISS     | 2,235,604 | +2,250 (+0%) loss       |
| routes      | /edit/gt-brand cold largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /edit/gt-brand cold longest animation frame                                          | 90 ms           | 150       | ok       | 128       | -38 (-30%) gain         |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1548 live elements)                         | 2,153           | 1,500     | MISS     | 2,153     | same                    |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                    |
| routes      | /edit/gt-brand warm ttfb                                                             | 34 ms           | 40        | ok       | 33        | +1.53 (+5%) loss        |
| routes      | /edit/gt-brand warm fcp                                                              | 92 ms           | 150       | ok       | 108       | -16 (-15%) gain         |
| routes      | /edit/gt-brand warm lcp                                                              | 248 ms          | 450       | ok       | 336       | -88 (-26%) gain         |
| routes      | /edit/gt-brand warm ready                                                            | 225 ms          | 450       | ok       | 312       | -87.30 (-28%) gain      |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,237,854 bytes | 2,000,000 | MISS     | 2,235,604 | +2,250 (+0%) loss       |
| routes      | /edit/gt-brand warm largest js (index-zmcb2DMX.js)                                   | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /edit/gt-brand warm longest animation frame                                          | 95 ms           | 150       | ok       | 130       | -35 (-27%) gain         |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1531 live elements)                         | 2,137           | 1,500     | MISS     |           | new row                 |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                    |
| routes      | /present/gt-brand cold ttfb                                                          | 32 ms           | 60        | ok       | 31        | +0.75 (+2%) loss        |
| routes      | /present/gt-brand cold fcp                                                           | 108 ms          |           | reported | 148       | -40 (-27%) gain         |
| routes      | /present/gt-brand cold lcp                                                           | 108 ms          | 500       | ok       | 148       | -40 (-27%) gain         |
| routes      | /present/gt-brand cold ready                                                         | 153 ms          | 500       | ok       | 227       | -73.90 (-33%) gain      |
| routes      | /present/gt-brand cold js decoded                                                    | 1,365,383 bytes | 1,200,000 | MISS     | 1,364,425 | +958 (+0%) loss         |
| routes      | /present/gt-brand cold largest js (index-zmcb2DMX.js)                                | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /present/gt-brand cold longest animation frame                                       | 0 ms            | 150       | ok       | 71        | -71 (-100%) gain        |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported | 368       | same                    |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                    |
| routes      | /present/gt-brand warm ttfb                                                          | 34 ms           | 40        | ok       | 32        | +2.43 (+8%) loss        |
| routes      | /present/gt-brand warm fcp                                                           | 84 ms           |           | reported | 100       | -16 (-16%) gain         |
| routes      | /present/gt-brand warm lcp                                                           | 84 ms           | 300       | ok       | 100       | -16 (-16%) gain         |
| routes      | /present/gt-brand warm ready                                                         | 156 ms          | 300       | ok       | 211       | -54.70 (-26%) gain      |
| routes      | /present/gt-brand warm js decoded                                                    | 1,365,383 bytes | 1,200,000 | MISS     | 1,364,425 | +958 (+0%) loss         |
| routes      | /present/gt-brand warm largest js (index-zmcb2DMX.js)                                | 578,754 bytes   | 600,000   | ok       |           | new row                 |
| routes      | /present/gt-brand warm longest animation frame                                       | 0 ms            | 150       | ok       | 66        | -66 (-100%) gain        |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                    |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported | 368       | same                    |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                    |
| transitions | decks->edit (in page)                                                                | 132 ms          | 300       | ok       | 295       | -162.80 (-55%) gain     |
| transitions | back (wall)                                                                          | 32 ms           | 100       | ok       | 68        | -36 (-53%) gain         |
| transitions | edit->decks (in page)                                                                | 15 ms           | 300       | ok       | 13        | +1.80 (+14%) loss       |
| transitions | trash->decks (in page)                                                               | 5.70 ms         | 300       | ok       | 6.30      | -0.60 (-10%) gain       |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 130 ms          | 300       | ok       | 224       | -94 (-42%) gain         |
| transitions | slideChange (in page, painted frame)                                                 | 10 ms           | 50        | ok       | 22        | -12.10 (-55%) gain      |
| transitions | slideshow (in page, painted frame)                                                   | 14 ms           | 50        | ok       | 21        | -7.80 (-37%) gain       |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.30 ms         | 50        | ok       | 14        | -4.60 (-33%) gain       |
| filmstrip   | first pass longest frame                                                             | 33 ms           | 100       | ok       | 42        | -8.30 (-20%) gain       |
| filmstrip   | steady passes p95 frame                                                              | 9.20 ms         | 20        | ok       | 9.20      | same                    |
| filmstrip   | steady passes longest frame                                                          | 9.40 ms         | 50        | ok       | 18        | -8.10 (-46%) gain       |
| filmstrip   | steady passes fps                                                                    | 120 fps         | 50        | ok       | 119       | +1.28 (+1%) gain        |
| filmstrip   | dom nodes with 85 cards (after GC; 1815 live elements)                               | 2,688           | 1,500     | MISS     | 2,688     | same                    |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 2         | same                    |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       | 0         | same                    |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       | 0         | same                    |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache none)           | 0               |           | reported | 0         | same                    |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache none)              | 0               |           | reported | 0         | same                    |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache none)  | 0               |           | reported | 0         | same                    |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache none)  | 0               |           | reported | 0         | same                    |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache none)    | 0               |           | reported | 0         | same                    |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache none)     | 0               |           | reported | 0         | same                    |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache none)                  | 0               |           | reported | 0         | same                    |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | baseline                |
| write       | text burst: last keyup to local commit                                               | 88 ms           | 450       | ok       | 96        | -8.30 (-9%) gain        |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 88 ms           | 600       | ok       | 96        | -8.30 (-9%) gain        |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | baseline                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                    |
| write       | new slide: pointerdown to painted card                                               | 8.90 ms         | 16        | ok       | 16        | -7.10 (-44%) gain       |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2021 ms         | 250       | MISS     | 2039      | -17.30 (-1%) gain       |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2021 ms         |           | reported | 2039      | -17.30 (-1%) gain       |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 1,512 ms        | 2,000     | ok       | 3,412     | -1,900 (-56%) gain      |
| write       | home card of the scratch deck on the next /decks visit                               | 1584 ms         | 1,500     | MISS     | 2889      | -1305.60 (-45%) gain    |
