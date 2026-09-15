122 of 151 asserted rows met (199 rows; 39 rows gained on the baseline, 81 lost, 41 unchanged, 36 new); run 2026-09-15T02:33:16.032Z to 2026-09-15T02:37:30.279Z against http://localhost:4321 (local); baseline 2026-09-14T22:27:35.649Z against http://localhost:4321 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 9.40 ms         | 60        | ok       | 8.56      | +0.85 (+10%) loss      |
| routes      | / cold fcp                                                                           | 164 ms          |           | reported | 92        | +72 (+78%) loss        |
| routes      | / cold lcp                                                                           | 164 ms          | 450       | ok       | 96        | +68 (+71%) loss        |
| routes      | / cold ready                                                                         | 381 ms          | 450       | ok       | 280       | +101 (+36%) loss       |
| routes      | / cold js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | / cold largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 93 ms           | 150       | ok       | 73        | +20 (+27%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | / warm ttfb                                                                          | 24 ms           | 40        | ok       | 6.65      | +17 (+259%) loss       |
| routes      | / warm fcp                                                                           | 128 ms          |           | reported | 96        | +32 (+33%) loss        |
| routes      | / warm lcp                                                                           | 128 ms          | 250       | ok       | 96        | +32 (+33%) loss        |
| routes      | / warm ready                                                                         | 289 ms          | 250       | MISS     | 257       | +33 (+13%) loss        |
| routes      | / warm js decoded                                                                    | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | / warm largest js (index-iYzVmBVs.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 82 ms           | 150       | ok       | 76        | +6 (+8%) loss          |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 499 live elements)                                       | 593             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /home cold ttfb                                                                      | 9.78 ms         | 60        | ok       | 5.88      | +3.90 (+66%) loss      |
| routes      | /home cold fcp                                                                       | 136 ms          |           | reported | 84        | +52 (+62%) loss        |
| routes      | /home cold lcp                                                                       | 136 ms          | 400       | ok       | 84        | +52 (+62%) loss        |
| routes      | /home cold ready                                                                     | 49 ms           | 400       | ok       | 37        | +12 (+33%) loss        |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home cold largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 0 ms            | 150       | ok       | 0         | same                   |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 68,020    | -27,552 (-41%) gain    |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /home warm ttfb                                                                      | 0.12 ms         | 40        | ok       | 0.07      | +0.04 (+53%) loss      |
| routes      | /home warm fcp                                                                       | 112 ms          |           | reported | 72        | +40 (+56%) loss        |
| routes      | /home warm lcp                                                                       | 112 ms          | 200       | ok       | 72        | +40 (+56%) loss        |
| routes      | /home warm ready                                                                     | 48 ms           | 200       | ok       | 29        | +19 (+65%) loss        |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home warm largest js (index-iYzVmBVs.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 53 ms           | 150       | ok       | 0         | +53 loss               |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       | 68,020    | same                   |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /new cold ttfb                                                                       | 18 ms           | 60        | ok       | 4.00      | +14 (+343%) loss       |
| routes      | /new cold fcp                                                                        | 204 ms          | 250       | ok       | 88        | +116 (+132%) loss      |
| routes      | /new cold lcp                                                                        | 204 ms          | 450       | ok       | 88        | +116 (+132%) loss      |
| routes      | /new cold ready                                                                      | 323 ms          | 450       | ok       | 185       | +138 (+74%) loss       |
| routes      | /new cold js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | /new cold largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 74 ms           | 150       | ok       | 65        | +9 (+14%) loss         |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 69 ms           |           | reported | 7.67      | +62 (+804%) loss       |
| routes      | /new warm ttfb                                                                       | 6.82 ms         | 40        | ok       | 3.42      | +3.39 (+99%) loss      |
| routes      | /new warm fcp                                                                        | 116 ms          | 150       | ok       | 88        | +28 (+32%) loss        |
| routes      | /new warm lcp                                                                        | 116 ms          | 250       | ok       | 88        | +28 (+32%) loss        |
| routes      | /new warm ready                                                                      | 242 ms          | 250       | ok       | 148       | +94 (+64%) loss        |
| routes      | /new warm js decoded                                                                 | 2,232,858 bytes | 2,000,000 | MISS     | 2,254,426 | -21,568 (-1%) gain     |
| routes      | /new warm largest js (index-iYzVmBVs.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 75 ms           | 150       | ok       | 51        | +24 (+47%) loss        |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 499 live elements)                                    | 593             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /decks cold ttfb                                                                     | 57 ms           | 150       | ok       | 21        | +36 (+169%) loss       |
| routes      | /decks cold fcp                                                                      | 232 ms          |           | reported | 112       | +120 (+107%) loss      |
| routes      | /decks cold lcp                                                                      | 624 ms          | 500       | MISS     | 212       | +412 (+194%) loss      |
| routes      | /decks cold ready                                                                    | 549 ms          | 500       | MISS     | 167       | +382 (+228%) loss      |
| routes      | /decks cold js decoded                                                               | 730,075 bytes   | 600,000   | MISS     | 2,172,136 | -1,442,061 (-66%) gain |
| routes      | /decks cold largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 92 ms           | 150       | ok       | 57        | +35 (+61%) loss        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 724 live elements)                                  | 973             |           | reported |           | new row                |
| routes      | /decks cold images with 66 cards (decoded)                                           | 39,889 bytes    | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 100 ms          |           | reported | 25        | +74 (+297%) loss       |
| routes      | /decks warm ttfb                                                                     | 63 ms           | 100       | ok       | 22        | +41 (+188%) loss       |
| routes      | /decks warm fcp                                                                      | 208 ms          |           | reported | 104       | +104 (+100%) loss      |
| routes      | /decks warm lcp                                                                      | 328 ms          | 300       | MISS     | 184       | +144 (+78%) loss       |
| routes      | /decks warm ready                                                                    | 260 ms          | 300       | ok       | 141       | +119 (+84%) loss       |
| routes      | /decks warm js decoded                                                               | 730,075 bytes   | 600,000   | MISS     | 2,172,136 | -1,442,061 (-66%) gain |
| routes      | /decks warm largest js (index-iYzVmBVs.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 63 ms           | 150       | ok       | 0         | +63 loss               |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 724 live elements)                                  | 973             |           | reported |           | new row                |
| routes      | /decks warm images with 66 cards (decoded)                                           | 39,889 bytes    | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 35 ms           | 150       | ok       | 12        | +23 (+197%) loss       |
| routes      | /decks/trash cold fcp                                                                | 112 ms          |           | reported | 100       | +12 (+12%) loss        |
| routes      | /decks/trash cold lcp                                                                | 148 ms          | 500       | ok       | 100       | +48 (+48%) loss        |
| routes      | /decks/trash cold ready                                                              | 149 ms          | 500       | ok       | 91        | +57 (+63%) loss        |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash cold largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 0 ms            | 150       | ok       | 52        | -52 (-100%) gain       |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 12,312 bytes    |           | reported | 9,624     | +2,688 (+28%) loss     |
| routes      | /decks/trash warm ttfb                                                               | 24 ms           | 100       | ok       | 12        | +13 (+107%) loss       |
| routes      | /decks/trash warm fcp                                                                | 92 ms           |           | reported | 60        | +32 (+53%) loss        |
| routes      | /decks/trash warm lcp                                                                | 120 ms          | 300       | ok       | 68        | +52 (+76%) loss        |
| routes      | /decks/trash warm ready                                                              | 135 ms          | 300       | ok       | 89        | +46 (+52%) loss        |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash warm largest js (index-iYzVmBVs.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 0         | same                   |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 143             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 12,312 bytes    |           | reported | 9,624     | +2,688 (+28%) loss     |
| routes      | /deck/gt-brand cold ttfb                                                             | 48 ms           | 250       | ok       | 32        | +16 (+50%) loss        |
| routes      | /deck/gt-brand cold fcp                                                              | 196 ms          |           | reported | 132       | +64 (+48%) loss        |
| routes      | /deck/gt-brand cold lcp                                                              | 196 ms          | 500       | ok       | 132       | +64 (+48%) loss        |
| routes      | /deck/gt-brand cold ready                                                            | 332 ms          | 600       | ok       | 223       | +110 (+49%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 87 ms           | 150       | ok       | 59        | +28 (+47%) loss        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported | 860,399   | -344,250 (-40%) gain   |
| routes      | /deck/gt-brand warm ttfb                                                             | 53 ms           | 150       | ok       | 31        | +21 (+68%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 180 ms          |           | reported | 140       | +40 (+29%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 180 ms          | 300       | ok       | 140       | +40 (+29%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 293 ms          | 400       | ok       | 239       | +54 (+23%) loss        |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 73 ms           | 150       | ok       | 0         | +73 loss               |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported | 1,986,652 | -1,470,503 (-74%) gain |
| routes      | /edit/gt-brand cold ttfb                                                             | 63 ms           | 60        | MISS     | 82        | -19.56 (-24%) gain     |
| routes      | /edit/gt-brand cold fcp                                                              | 128 ms          | 250       | ok       | 152       | -24 (-16%) gain        |
| routes      | /edit/gt-brand cold lcp                                                              | 352 ms          | 700       | ok       | 436       | -84 (-19%) gain        |
| routes      | /edit/gt-brand cold ready                                                            | 330 ms          | 700       | ok       | 419       | -89.10 (-21%) gain     |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 2,257,712 | -22,108 (-1%) gain     |
| routes      | /edit/gt-brand cold largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 128 ms          | 150       | ok       | 155       | -27 (-17%) gain        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1548 live elements)                         | 2,153           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                   |
| routes      | /edit/gt-brand warm ttfb                                                             | 33 ms           | 40        | ok       | 86        | -53.19 (-62%) gain     |
| routes      | /edit/gt-brand warm fcp                                                              | 108 ms          | 150       | ok       | 164       | -56 (-34%) gain        |
| routes      | /edit/gt-brand warm lcp                                                              | 336 ms          | 450       | ok       | 416       | -80 (-19%) gain        |
| routes      | /edit/gt-brand warm ready                                                            | 312 ms          | 450       | ok       | 388       | -75.40 (-19%) gain     |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,604 bytes | 2,000,000 | MISS     | 2,257,712 | -22,108 (-1%) gain     |
| routes      | /edit/gt-brand warm largest js (index-iYzVmBVs.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 130 ms          | 150       | ok       | 127       | +3 (+2%) loss          |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1544 live elements)                         | 2,150           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                   |
| routes      | /present/gt-brand cold ttfb                                                          | 31 ms           | 60        | ok       | 36        | -4.82 (-13%) gain      |
| routes      | /present/gt-brand cold fcp                                                           | 148 ms          |           | reported | 128       | +20 (+16%) loss        |
| routes      | /present/gt-brand cold lcp                                                           | 148 ms          | 500       | ok       | 128       | +20 (+16%) loss        |
| routes      | /present/gt-brand cold ready                                                         | 227 ms          | 500       | ok       | 183       | +45 (+24%) loss        |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand cold largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 71 ms           | 150       | ok       | 58        | +13 (+22%) loss        |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /present/gt-brand warm ttfb                                                          | 32 ms           | 40        | ok       | 40        | -8.62 (-21%) gain      |
| routes      | /present/gt-brand warm fcp                                                           | 100 ms          |           | reported | 112       | -12 (-11%) gain        |
| routes      | /present/gt-brand warm lcp                                                           | 100 ms          | 300       | ok       | 112       | -12 (-11%) gain        |
| routes      | /present/gt-brand warm ready                                                         | 211 ms          | 300       | ok       | 204       | +7.20 (+4%) loss       |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand warm largest js (index-iYzVmBVs.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 66 ms           | 150       | ok       | 64        | +2 (+3%) loss          |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| transitions | decks->edit (in page)                                                                | 295 ms          | 300       | ok       | 107       | +187 (+175%) loss      |
| transitions | back (wall)                                                                          | 68 ms           | 100       | ok       | 35        | +33 (+94%) loss        |
| transitions | edit->decks (in page)                                                                | 13 ms           | 300       | ok       | 15        | -1.70 (-11%) gain      |
| transitions | trash->decks (in page)                                                               | 6.30 ms         | 300       | ok       | 5.60      | +0.70 (+12%) loss      |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 224 ms          | 300       | ok       |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 22 ms           | 50        | ok       | 12        | +11 (+90%) loss        |
| transitions | slideshow (in page, painted frame)                                                   | 21 ms           | 50        | ok       | 13        | +8.30 (+64%) loss      |
| transitions | layoutGrid (in page, painted frame)                                                  | 14 ms           | 50        | ok       | 9.20      | +4.70 (+51%) loss      |
| filmstrip   | first pass longest frame                                                             | 42 ms           | 100       | ok       | 50        | -8.30 (-17%) gain      |
| filmstrip   | steady passes p95 frame                                                              | 9.20 ms         | 20        | ok       | 25        | -15.90 (-63%) gain     |
| filmstrip   | steady passes longest frame                                                          | 18 ms           | 50        | ok       | 42        | -24.40 (-58%) gain     |
| filmstrip   | steady passes fps                                                                    | 119 fps         | 50        | ok       | 90        | +29 (+32%) gain        |
| filmstrip   | dom nodes with 85 cards (after GC; 1815 live elements)                               | 2,688           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 5         | -3 (-60%) gain         |
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
| write       | text burst: last keyup to local commit                                               | 96 ms           | 450       | ok       | 90        | +6.50 (+7%) loss       |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 96 ms           | 600       | ok       | 90        | +6.50 (+7%) loss       |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | baseline               |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                   |
| write       | new slide: pointerdown to painted card                                               | 16 ms           | 16        | ok       | 8.70      | +7.30 (+84%) loss      |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2039 ms         | 250       | MISS     | 2023      | +16 (+1%) loss         |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2039 ms         |           | reported | 2023      | +16 (+1%) loss         |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 3,412 ms        | 2,000     | MISS     | 1,561     | +1,851 (+119%) loss    |
| write       | home card of the scratch deck on the next /decks visit                               | 2889 ms         | 1,500     | MISS     | 1590      | +1299 (+82%) loss      |
