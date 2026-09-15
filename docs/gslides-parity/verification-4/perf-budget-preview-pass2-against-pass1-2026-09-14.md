113 of 157 asserted rows met (199 rows; 86 rows gained on the baseline, 25 lost, 41 unchanged, 46 new); run 2026-09-15T03:33:46.578Z to 2026-09-15T03:38:05.584Z against https://turboslide-ay9oweo3y-kl01s-projects.vercel.app (deployment); baseline 2026-09-14T23:13:02.550Z against https://turboslide-fw2ypjeei-kl01s-projects.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 157 ms          | 200       | ok       | 238       | -81.22 (-34%) gain     |
| routes      | / cold fcp                                                                           | 364 ms          |           | reported | 832       | -468 (-56%) gain       |
| routes      | / cold lcp                                                                           | 408 ms          | 700       | ok       | 892       | -484 (-54%) gain       |
| routes      | / cold ready                                                                         | 532 ms          | 700       | ok       | 1008      | -476 (-47%) gain       |
| routes      | / cold js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | / cold largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 108 ms          | 150       | ok       | 172       | -64 (-37%) gain        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | / warm ttfb                                                                          | 119 ms          | 150       | ok       | 121       | -2.52 (-2%) gain       |
| routes      | / warm fcp                                                                           | 260 ms          |           | reported | 220       | +40 (+18%) loss        |
| routes      | / warm lcp                                                                           | 260 ms          | 400       | ok       | 220       | +40 (+18%) loss        |
| routes      | / warm ready                                                                         | 411 ms          | 400       | MISS     | 366       | +45 (+12%) loss        |
| routes      | / warm js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | / warm largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 72 ms           | 150       | ok       | 74        | -2 (-3%) gain          |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /home cold ttfb                                                                      | 39 ms           | 150       | ok       | 55        | -16.13 (-29%) gain     |
| routes      | /home cold fcp                                                                       | 200 ms          |           | reported | 236       | -36 (-15%) gain        |
| routes      | /home cold lcp                                                                       | 200 ms          | 800       | ok       | 236       | -36 (-15%) gain        |
| routes      | /home cold ready                                                                     | 120 ms          | 800       | ok       | 130       | -9.90 (-8%) gain       |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home cold largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 113 ms          | 150       | ok       | 138       | -25 (-18%) gain        |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 40,468    | same                   |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /home warm ttfb                                                                      | 16 ms           | 100       | ok       | 22        | -5.77 (-27%) gain      |
| routes      | /home warm fcp                                                                       | 116 ms          |           | reported | 108       | +8 (+7%) loss          |
| routes      | /home warm lcp                                                                       | 116 ms          | 400       | ok       | 108       | +8 (+7%) loss          |
| routes      | /home warm ready                                                                     | 53 ms           | 400       | ok       | 59        | -6 (-10%) gain         |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home warm largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       | 51        | -51 (-100%) gain       |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       | 68,020    | same                   |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /new cold ttfb                                                                       | 181 ms          | 200       | ok       | 221       | -39.43 (-18%) gain     |
| routes      | /new cold fcp                                                                        | 420 ms          | 400       | MISS     | 372       | +48 (+13%) loss        |
| routes      | /new cold lcp                                                                        | 472 ms          | 700       | ok       | 432       | +40 (+9%) loss         |
| routes      | /new cold ready                                                                      | 586 ms          | 700       | ok       | 562       | +25 (+4%) loss         |
| routes      | /new cold js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | /new cold largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 126 ms          | 150       | ok       | 105       | +21 (+20%) loss        |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 348 ms          |           | reported | 230       | +118 (+52%) loss       |
| routes      | /new warm ttfb                                                                       | 135 ms          | 150       | ok       | 188       | -52.93 (-28%) gain     |
| routes      | /new warm fcp                                                                        | 304 ms          | 250       | MISS     | 264       | +40 (+15%) loss        |
| routes      | /new warm lcp                                                                        | 304 ms          | 400       | ok       | 264       | +40 (+15%) loss        |
| routes      | /new warm ready                                                                      | 389 ms          | 400       | ok       | 433       | -43.60 (-10%) gain     |
| routes      | /new warm js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | /new warm largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 73 ms           | 150       | ok       | 71        | +2 (+3%) loss          |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /decks cold ttfb                                                                     | 338 ms          | 400       | ok       | 404       | -65.72 (-16%) gain     |
| routes      | /decks cold fcp                                                                      | 584 ms          |           | reported | 560       | +24 (+4%) loss         |
| routes      | /decks cold lcp                                                                      | 692 ms          | 1,000     | ok       | 812       | -120 (-15%) gain       |
| routes      | /decks cold ready                                                                    | 636 ms          | 1,000     | ok       | 686       | -50.60 (-7%) gain      |
| routes      | /decks cold js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 2,172,136 | -22,068 (-1%) gain     |
| routes      | /decks cold largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 209 ms          | 150       | MISS     | 112       | +97 (+87%) loss        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 364 live elements)                                  | 516             |           | reported |           | new row                |
| routes      | /decks cold images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 355 ms          |           | reported | 472       | -116.41 (-25%) gain    |
| routes      | /decks warm ttfb                                                                     | 719 ms          | 300       | MISS     | 504       | +215 (+43%) loss       |
| routes      | /decks warm fcp                                                                      | 872 ms          |           | reported | 636       | +236 (+37%) loss       |
| routes      | /decks warm lcp                                                                      | 956 ms          | 600       | MISS     | 736       | +220 (+30%) loss       |
| routes      | /decks warm ready                                                                    | 910 ms          | 600       | MISS     | 693       | +218 (+31%) loss       |
| routes      | /decks warm js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 2,172,136 | -22,068 (-1%) gain     |
| routes      | /decks warm largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 119 ms          | 150       | ok       | 121       | -2 (-2%) gain          |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 364 live elements)                                  | 515             |           | reported |           | new row                |
| routes      | /decks warm images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 229 ms          | 400       | ok       | 207       | +22 (+11%) loss        |
| routes      | /decks/trash cold fcp                                                                | 420 ms          |           | reported | 340       | +80 (+24%) loss        |
| routes      | /decks/trash cold lcp                                                                | 420 ms          | 1,000     | ok       | 340       | +80 (+24%) loss        |
| routes      | /decks/trash cold ready                                                              | 446 ms          | 1,000     | ok       | 514       | -68.00 (-13%) gain     |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash cold largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 147 ms          | 150       | ok       | 118       | +29 (+25%) loss        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                   |
| routes      | /decks/trash warm ttfb                                                               | 213 ms          | 300       | ok       | 282       | -68.22 (-24%) gain     |
| routes      | /decks/trash warm fcp                                                                | 272 ms          |           | reported | 348       | -76 (-22%) gain        |
| routes      | /decks/trash warm lcp                                                                | 272 ms          | 600       | ok       | 348       | -76 (-22%) gain        |
| routes      | /decks/trash warm ready                                                              | 303 ms          | 600       | ok       | 402       | -98.80 (-25%) gain     |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash warm largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 51        | -51 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                   |
| routes      | /deck/gt-brand cold ttfb                                                             | 276 ms          | 500       | ok       | 348       | -72.28 (-21%) gain     |
| routes      | /deck/gt-brand cold fcp                                                              | 512 ms          |           | reported | 708       | -196 (-28%) gain       |
| routes      | /deck/gt-brand cold lcp                                                              | 512 ms          | 600       | ok       | 708       | -196 (-28%) gain       |
| routes      | /deck/gt-brand cold ready                                                            | 787 ms          | 800       | ok       | 874       | -86.90 (-10%) gain     |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 178 ms          | 150       | MISS     | 307       | -129 (-42%) gain       |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported | 1,546,533 | -1,030,384 (-67%) gain |
| routes      | /deck/gt-brand warm ttfb                                                             | 234 ms          | 400       | ok       | 307       | -72.36 (-24%) gain     |
| routes      | /deck/gt-brand warm fcp                                                              | 412 ms          |           | reported | 504       | -92 (-18%) gain        |
| routes      | /deck/gt-brand warm lcp                                                              | 412 ms          | 400       | MISS     | 504       | -92 (-18%) gain        |
| routes      | /deck/gt-brand warm ready                                                            | 527 ms          | 600       | ok       | 663       | -136.30 (-21%) gain    |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 76 ms           | 150       | ok       | 142       | -66 (-46%) gain        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported | 3,017,036 | -2,500,887 (-83%) gain |
| routes      | /edit/gt-brand cold ttfb                                                             | 283 ms          | 200       | MISS     | 325       | -41.87 (-13%) gain     |
| routes      | /edit/gt-brand cold fcp                                                              | 484 ms          | 400       | MISS     | 608       | -124 (-20%) gain       |
| routes      | /edit/gt-brand cold lcp                                                              | 840 ms          | 1,200     | ok       | 1,008     | -168 (-17%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 778 ms          | 1,200     | ok       | 941       | -163.60 (-17%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 2,257,712 | -22,068 (-1%) gain     |
| routes      | /edit/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 167 ms          | 150       | MISS     | 243       | -76 (-31%) gain        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1511 live elements)                         | 2,116           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /edit/gt-brand warm ttfb                                                             | 275 ms          | 150       | MISS     | 436       | -160.22 (-37%) gain    |
| routes      | /edit/gt-brand warm fcp                                                              | 376 ms          | 250       | MISS     | 500       | -124 (-25%) gain       |
| routes      | /edit/gt-brand warm lcp                                                              | 728 ms          | 700       | MISS     | 852       | -124 (-15%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 705 ms          | 700       | MISS     | 827       | -122.80 (-15%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 2,257,712 | -22,068 (-1%) gain     |
| routes      | /edit/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 125 ms          | 150       | ok       | 150       | -25 (-17%) gain        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1529 live elements)                         | 2,134           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                   |
| routes      | /present/gt-brand cold ttfb                                                          | 260 ms          | 200       | MISS     | 337       | -77.31 (-23%) gain     |
| routes      | /present/gt-brand cold fcp                                                           | 516 ms          |           | reported | 760       | -244 (-32%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 516 ms          | 800       | ok       | 792       | -276 (-35%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 620 ms          | 800       | ok       | 838       | -218 (-26%) gain       |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand cold largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 167 ms          | 150       | MISS     | 256       | -89 (-35%) gain        |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /present/gt-brand warm ttfb                                                          | 232 ms          | 150       | MISS     | 316       | -83.51 (-26%) gain     |
| routes      | /present/gt-brand warm fcp                                                           | 348 ms          |           | reported | 512       | -164 (-32%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 348 ms          | 500       | ok       | 512       | -164 (-32%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 509 ms          | 500       | MISS     | 652       | -143.70 (-22%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand warm largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 76 ms           | 150       | ok       | 129       | -53 (-41%) gain        |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| transitions | decks->edit (in page)                                                                | 179 ms          | 500       | ok       | 340       | -160.20 (-47%) gain    |
| transitions | back (wall)                                                                          | 80 ms           | 100       | ok       | 76        | +4 (+5%) loss          |
| transitions | edit->decks (in page)                                                                | 17 ms           | 400       | ok       | 16        | +0.30 (+2%) loss       |
| transitions | trash->decks (in page)                                                               | 8.10 ms         | 400       | ok       | 8.40      | -0.30 (-4%) gain       |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 404 ms          | 300       | MISS     |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 15 ms           | 50        | ok       | 15        | -0.80 (-5%) gain       |
| transitions | slideshow (in page, painted frame)                                                   | 19 ms           | 50        | ok       | 19        | same                   |
| transitions | layoutGrid (in page, painted frame)                                                  | 14 ms           | 50        | ok       | 15        | -1.60 (-11%) gain      |
| filmstrip   | first pass longest frame                                                             | 41 ms           | 100       | ok       | 67        | -25.90 (-39%) gain     |
| filmstrip   | steady passes p95 frame                                                              | 10 ms           | 20        | ok       | 42        | -31.50 (-76%) gain     |
| filmstrip   | steady passes longest frame                                                          | 25 ms           | 50        | ok       | 58        | -33.10 (-57%) gain     |
| filmstrip   | steady passes fps                                                                    | 118 fps         | 50        | ok       | 66        | +52 (+79%) gain        |
| filmstrip   | dom nodes with 85 cards (after GC; 1938 live elements)                               | 2,817           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 3         | -1 (-33%) gain         |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       | 0         | same                   |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       |           | new row                |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache HIT)            | 1               | 1         | ok       | 1         | same                   |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache HIT)               | 1               | 1         | ok       | 1         | same                   |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                   |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                   |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache HIT)     | 1               | 1         | ok       | 1         | same                   |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache HIT)      | 1               | 1         | ok       | 1         | same                   |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache HIT)                   | 1               | 1         | ok       | 1         | same                   |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | baseline               |
| write       | text burst: last keyup to local commit                                               | 90 ms           | 450       | ok       |           | new row                |
| write       | text burst: last keyup to saved revision                                             | 1155 ms         | 1,000     | MISS     |           | new row                |
| write       | text burst: last keyup to acknowledgement (reported)                                 | 90 ms           |           | reported |           | new row                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       |           | new row                |
| write       | new slide: pointerdown to painted card                                               | 11 ms           | 16        | ok       |           | new row                |
| write       | new slide: pointerdown to saved revision                                             | 2784 ms         | 500       | MISS     |           | new row                |
| write       | new slide: pointerdown to acknowledgement (reported)                                 | 715 ms          |           | reported |           | new row                |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 1,468 ms        |           | reported |           | new row                |
| write       | home card of the scratch deck on the next /decks visit                               | 1355 ms         | 2,500     | ok       |           | new row                |
