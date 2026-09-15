93 of 151 asserted rows met (190 rows; 57 rows gained on the baseline, 52 lost, 54 unchanged, 26 new); run 2026-09-15T03:38:08.308Z to 2026-09-15T03:42:18.267Z against https://turboslide.vercel.app (deployment); baseline 2026-09-14T23:17:27.493Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change               |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | -------------------- |
| routes      | / cold ttfb                                                                          | 126 ms          | 200       | ok       | 146       | -19.90 (-14%) gain   |
| routes      | / cold fcp                                                                           | 332 ms          |           | reported | 340       | -8 (-2%) gain        |
| routes      | / cold lcp                                                                           | 364 ms          | 700       | ok       | 376       | -12 (-3%) gain       |
| routes      | / cold ready                                                                         | 456 ms          | 700       | ok       | 500       | -44.50 (-9%) gain    |
| routes      | / cold js decoded                                                                    | 2,260,306 bytes | 2,000,000 | MISS     | 2,254,426 | +5,880 (+0%) loss    |
| routes      | / cold largest js (index-CDkNPPA9.js)                                                | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | / cold longest animation frame                                                       | 130 ms          | 150       | ok       | 122       | +8 (+7%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | / cold dom nodes (after GC; 496 live elements)                                       | 589             |           | reported | 589       | same                 |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                 |
| routes      | / warm ttfb                                                                          | 116 ms          | 150       | ok       | 120       | -4.05 (-3%) gain     |
| routes      | / warm fcp                                                                           | 196 ms          |           | reported | 192       | +4 (+2%) loss        |
| routes      | / warm lcp                                                                           | 196 ms          | 400       | ok       | 192       | +4 (+2%) loss        |
| routes      | / warm ready                                                                         | 288 ms          | 400       | ok       | 309       | -20.60 (-7%) gain    |
| routes      | / warm js decoded                                                                    | 2,260,306 bytes | 2,000,000 | MISS     | 2,254,426 | +5,880 (+0%) loss    |
| routes      | / warm largest js (index-CDkNPPA9.js)                                                | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | / warm longest animation frame                                                       | 53 ms           | 150       | ok       | 60        | -7 (-12%) gain       |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | / warm dom nodes (after GC; 496 live elements)                                       | 589             |           | reported | 589       | same                 |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                 |
| routes      | /home cold ttfb                                                                      | 53 ms           | 150       | ok       | 79        | -26.71 (-34%) gain   |
| routes      | /home cold fcp                                                                       | 164 ms          |           | reported | 276       | -112 (-41%) gain     |
| routes      | /home cold lcp                                                                       | 196 ms          | 800       | ok       | 276       | -80 (-29%) gain      |
| routes      | /home cold ready                                                                     | 127 ms          | 800       | ok       | 194       | -67.10 (-35%) gain   |
| routes      | /home cold js decoded                                                                | 988,790 bytes   | 600,000   | MISS     | 986,236   | +2,554 (+0%) loss    |
| routes      | /home cold largest js (index-CDkNPPA9.js)                                            | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /home cold longest animation frame                                                   | 80 ms           | 150       | ok       | 143       | -63 (-44%) gain      |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /home cold dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported | 1,016     | same                 |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 40,468    | same                 |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                 |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                 |
| routes      | /home warm ttfb                                                                      | 18 ms           | 100       | ok       | 12        | +6.19 (+51%) loss    |
| routes      | /home warm fcp                                                                       | 112 ms          |           | reported | 80        | +32 (+40%) loss      |
| routes      | /home warm lcp                                                                       | 112 ms          | 400       | ok       | 80        | +32 (+40%) loss      |
| routes      | /home warm ready                                                                     | 66 ms           | 400       | ok       | 36        | +30 (+82%) loss      |
| routes      | /home warm js decoded                                                                | 988,790 bytes   | 600,000   | MISS     | 986,236   | +2,554 (+0%) loss    |
| routes      | /home warm largest js (index-CDkNPPA9.js)                                            | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       | 0         | same                 |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /home warm dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported | 1,016     | same                 |
| routes      | /home warm images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 68,020    | -27,552 (-41%) gain  |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                 |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                 |
| routes      | /new cold ttfb                                                                       | 142 ms          | 200       | ok       | 215       | -72.99 (-34%) gain   |
| routes      | /new cold fcp                                                                        | 320 ms          | 400       | ok       | 460       | -140 (-30%) gain     |
| routes      | /new cold lcp                                                                        | 384 ms          | 700       | ok       | 508       | -124 (-24%) gain     |
| routes      | /new cold ready                                                                      | 501 ms          | 700       | ok       | 570       | -69.10 (-12%) gain   |
| routes      | /new cold js decoded                                                                 | 2,260,306 bytes | 2,000,000 | MISS     | 2,254,426 | +5,880 (+0%) loss    |
| routes      | /new cold largest js (index-CDkNPPA9.js)                                             | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /new cold longest animation frame                                                    | 126 ms          | 150       | ok       | 63        | +63 (+100%) loss     |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /new cold dom nodes (after GC; 496 live elements)                                    | 589             |           | reported | 589       | same                 |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                 |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 149 ms          |           | reported | 400       | -250.69 (-63%) gain  |
| routes      | /new warm ttfb                                                                       | 117 ms          | 150       | ok       | 172       | -54.63 (-32%) gain   |
| routes      | /new warm fcp                                                                        | 208 ms          | 250       | ok       | 252       | -44 (-17%) gain      |
| routes      | /new warm lcp                                                                        | 224 ms          | 400       | ok       | 292       | -68 (-23%) gain      |
| routes      | /new warm ready                                                                      | 374 ms          | 400       | ok       | 353       | +21 (+6%) loss       |
| routes      | /new warm js decoded                                                                 | 2,260,306 bytes | 2,000,000 | MISS     | 2,254,426 | +5,880 (+0%) loss    |
| routes      | /new warm largest js (index-CDkNPPA9.js)                                             | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /new warm longest animation frame                                                    | 79 ms           | 150       | ok       | 53        | +26 (+49%) loss      |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /new warm dom nodes (after GC; 496 live elements)                                    | 589             |           | reported | 589       | same                 |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                 |
| routes      | /decks cold ttfb                                                                     | 484 ms          | 400       | MISS     | 409       | +75 (+18%) loss      |
| routes      | /decks cold fcp                                                                      | 720 ms          |           | reported | 1,460     | -740 (-51%) gain     |
| routes      | /decks cold lcp                                                                      | 720 ms          | 1,000     | ok       | 1,568     | -848 (-54%) gain     |
| routes      | /decks cold ready                                                                    | 785 ms          | 1,000     | ok       | 1532      | -746.50 (-49%) gain  |
| routes      | /decks cold js decoded                                                               | 2,177,480 bytes | 600,000   | MISS     | 2,172,136 | +5,344 (+0%) loss    |
| routes      | /decks cold largest js (index-CDkNPPA9.js)                                           | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /decks cold longest animation frame                                                  | 133 ms          | 150       | ok       | 111       | +22 (+20%) loss      |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /decks cold dom nodes (after GC; 363 live elements)                                  | 517             |           | reported |           | new row              |
| routes      | /decks cold images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row              |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 2495 ms         |           | reported | 3782      | -1287.04 (-34%) gain |
| routes      | /decks warm ttfb                                                                     | 334 ms          | 300       | MISS     | 235       | +99 (+42%) loss      |
| routes      | /decks warm fcp                                                                      | 440 ms          |           | reported | 328       | +112 (+34%) loss     |
| routes      | /decks warm lcp                                                                      | 896 ms          | 600       | MISS     | 420       | +476 (+113%) loss    |
| routes      | /decks warm ready                                                                    | 473 ms          | 600       | ok       | 379       | +94 (+25%) loss      |
| routes      | /decks warm js decoded                                                               | 2,177,480 bytes | 600,000   | MISS     | 2,172,136 | +5,344 (+0%) loss    |
| routes      | /decks warm largest js (index-CDkNPPA9.js)                                           | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /decks warm longest animation frame                                                  | 74 ms           | 150       | ok       | 66        | +8 (+12%) loss       |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /decks warm dom nodes (after GC; 363 live elements)                                  | 513             |           | reported |           | new row              |
| routes      | /decks warm images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row              |
| routes      | /decks/trash cold ttfb                                                               | 585 ms          | 400       | MISS     | 294       | +291 (+99%) loss     |
| routes      | /decks/trash cold fcp                                                                | 684 ms          |           | reported | 424       | +260 (+61%) loss     |
| routes      | /decks/trash cold lcp                                                                | 684 ms          | 1,000     | ok       | 424       | +260 (+61%) loss     |
| routes      | /decks/trash cold ready                                                              | 749 ms          | 1,000     | ok       | 502       | +247 (+49%) loss     |
| routes      | /decks/trash cold js decoded                                                         | 971,225 bytes   | 600,000   | MISS     | 968,671   | +2,554 (+0%) loss    |
| routes      | /decks/trash cold largest js (index-CDkNPPA9.js)                                     | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /decks/trash cold longest animation frame                                            | 63 ms           | 150       | ok       | 68        | -5 (-7%) gain        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /decks/trash cold dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row              |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                 |
| routes      | /decks/trash warm ttfb                                                               | 273 ms          | 300       | ok       | 292       | -19.66 (-7%) gain    |
| routes      | /decks/trash warm fcp                                                                | 356 ms          |           | reported | 356       | same                 |
| routes      | /decks/trash warm lcp                                                                | 356 ms          | 600       | ok       | 356       | same                 |
| routes      | /decks/trash warm ready                                                              | 400 ms          | 600       | ok       | 408       | -7.90 (-2%) gain     |
| routes      | /decks/trash warm js decoded                                                         | 971,225 bytes   | 600,000   | MISS     | 968,671   | +2,554 (+0%) loss    |
| routes      | /decks/trash warm largest js (index-CDkNPPA9.js)                                     | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /decks/trash warm longest animation frame                                            | 55 ms           | 150       | ok       | 0         | +55 loss             |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /decks/trash warm dom nodes (after GC; 101 live elements)                            | 128             |           | reported |           | new row              |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                 |
| routes      | /deck/gt-brand cold ttfb                                                             | 397 ms          | 500       | ok       | 504       | -107.04 (-21%) gain  |
| routes      | /deck/gt-brand cold fcp                                                              | 880 ms          |           | reported | 808       | +72 (+9%) loss       |
| routes      | /deck/gt-brand cold lcp                                                              | 880 ms          | 600       | MISS     | 808       | +72 (+9%) loss       |
| routes      | /deck/gt-brand cold ready                                                            | 1011 ms         | 800       | MISS     | 1067      | -56.80 (-5%) gain    |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,871,645 bytes | 1,000,000 | MISS     | 1,868,879 | +2,766 (+0%) loss    |
| routes      | /deck/gt-brand cold largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /deck/gt-brand cold longest animation frame                                          | 203 ms          | 150       | MISS     | 172       | +31 (+18%) loss      |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                 |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1601 live elements)                         | 2,502           | 1,500     | MISS     | 2,502     | same                 |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported | 516,149   | same                 |
| routes      | /deck/gt-brand warm ttfb                                                             | 258 ms          | 400       | ok       | 505       | -247.58 (-49%) gain  |
| routes      | /deck/gt-brand warm fcp                                                              | 356 ms          |           | reported | 628       | -272 (-43%) gain     |
| routes      | /deck/gt-brand warm lcp                                                              | 416 ms          | 400       | MISS     | 644       | -228 (-35%) gain     |
| routes      | /deck/gt-brand warm ready                                                            | 586 ms          | 600       | ok       | 831       | -244.80 (-29%) gain  |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,871,645 bytes | 1,000,000 | MISS     | 1,868,879 | +2,766 (+0%) loss    |
| routes      | /deck/gt-brand warm largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /deck/gt-brand warm longest animation frame                                          | 63 ms           | 150       | ok       | 58        | +5 (+9%) loss        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                 |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1601 live elements)                         | 2,501           | 1,500     | MISS     | 2,501     | same                 |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 1,784,866 bytes |           | reported | 1,986,652 | -201,786 (-10%) gain |
| routes      | /edit/gt-brand cold ttfb                                                             | 342 ms          | 200       | MISS     | 345       | -3.42 (-1%) gain     |
| routes      | /edit/gt-brand cold fcp                                                              | 440 ms          | 400       | MISS     | 596       | -156 (-26%) gain     |
| routes      | /edit/gt-brand cold lcp                                                              | 748 ms          | 1,200     | ok       | 944       | -196 (-21%) gain     |
| routes      | /edit/gt-brand cold ready                                                            | 687 ms          | 1,200     | ok       | 857       | -169.90 (-20%) gain  |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,263,051 bytes | 2,000,000 | MISS     | 2,257,712 | +5,339 (+0%) loss    |
| routes      | /edit/gt-brand cold largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /edit/gt-brand cold longest animation frame                                          | 119 ms          | 150       | ok       | 206       | -87 (-42%) gain      |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1870 live elements)                         | 2,682           | 1,500     | MISS     |           | new row              |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported | 14,830    | same                 |
| routes      | /edit/gt-brand warm ttfb                                                             | 408 ms          | 150       | MISS     | 315       | +93 (+30%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 456 ms          | 250       | MISS     | 404       | +52 (+13%) loss      |
| routes      | /edit/gt-brand warm lcp                                                              | 748 ms          | 700       | MISS     | 780       | -32 (-4%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 722 ms          | 700       | MISS     | 756       | -33.30 (-4%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,263,051 bytes | 2,000,000 | MISS     | 2,257,712 | +5,339 (+0%) loss    |
| routes      | /edit/gt-brand warm largest js (index-CDkNPPA9.js)                                   | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /edit/gt-brand warm longest animation frame                                          | 115 ms          | 150       | ok       | 141       | -26 (-18%) gain      |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1870 live elements)                         | 2,682           | 1,500     | MISS     |           | new row              |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                 |
| routes      | /present/gt-brand cold ttfb                                                          | 295 ms          | 200       | MISS     | 2127      | -1831.20 (-86%) gain |
| routes      | /present/gt-brand cold fcp                                                           | 516 ms          |           | reported | 2,272     | -1,756 (-77%) gain   |
| routes      | /present/gt-brand cold lcp                                                           | 516 ms          | 800       | ok       | 2,272     | -1,756 (-77%) gain   |
| routes      | /present/gt-brand cold ready                                                         | 593 ms          | 800       | ok       | 2437      | -1843.50 (-76%) gain |
| routes      | /present/gt-brand cold js decoded                                                    | 1,399,447 bytes | 1,200,000 | MISS     | 1,396,740 | +2,707 (+0%) loss    |
| routes      | /present/gt-brand cold largest js (index-CDkNPPA9.js)                                | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /present/gt-brand cold longest animation frame                                       | 154 ms          | 150       | MISS     | 72        | +82 (+114%) loss     |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /present/gt-brand cold dom nodes (after GC; 302 live elements)                       | 367             |           | reported | 367       | same                 |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                 |
| routes      | /present/gt-brand warm ttfb                                                          | 381 ms          | 150       | MISS     | 458       | -76.74 (-17%) gain   |
| routes      | /present/gt-brand warm fcp                                                           | 440 ms          |           | reported | 540       | -100 (-19%) gain     |
| routes      | /present/gt-brand warm lcp                                                           | 440 ms          | 500       | ok       | 540       | -100 (-19%) gain     |
| routes      | /present/gt-brand warm ready                                                         | 611 ms          | 500       | MISS     | 677       | -66.10 (-10%) gain   |
| routes      | /present/gt-brand warm js decoded                                                    | 1,399,447 bytes | 1,200,000 | MISS     | 1,396,740 | +2,707 (+0%) loss    |
| routes      | /present/gt-brand warm largest js (index-CDkNPPA9.js)                                | 916,787 bytes   | 600,000   | MISS     |           | new row              |
| routes      | /present/gt-brand warm longest animation frame                                       | 52 ms           | 150       | ok       | 50        | +2 (+4%) loss        |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                 |
| routes      | /present/gt-brand warm dom nodes (after GC; 302 live elements)                       | 367             |           | reported | 367       | same                 |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                 |
| transitions | decks->edit (in page)                                                                | 108 ms          | 500       | ok       | 168       | -59.70 (-36%) gain   |
| transitions | back (wall)                                                                          | 39 ms           | 100       | ok       | 21        | +18 (+86%) loss      |
| transitions | edit->decks (in page)                                                                | 17 ms           | 400       | ok       | 16        | +0.80 (+5%) loss     |
| transitions | trash->decks (in page)                                                               | 5.80 ms         | 400       | ok       | 6.10      | -0.30 (-5%) gain     |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 435 ms          | 300       | MISS     |           | new row              |
| transitions | slideChange (in page, painted frame)                                                 | 11 ms           | 50        | ok       | 13        | -1.70 (-13%) gain    |
| transitions | slideshow (in page, painted frame)                                                   | 13 ms           | 50        | ok       | 12        | +0.70 (+6%) loss     |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.40 ms         | 50        | ok       | 11        | -1.10 (-10%) gain    |
| filmstrip   | first pass longest frame                                                             | 34 ms           | 100       | ok       | 42        | -7.30 (-18%) gain    |
| filmstrip   | steady passes p95 frame                                                              | 33 ms           | 20        | MISS     | 17        | +16 (+98%) loss      |
| filmstrip   | steady passes longest frame                                                          | 58 ms           | 50        | MISS     | 42        | +17 (+40%) loss      |
| filmstrip   | steady passes fps                                                                    | 89 fps          | 50        | ok       | 102       | -13.21 (-13%) loss   |
| filmstrip   | dom nodes with 85 cards (after GC; 2164 live elements)                               | 5,954           | 1,500     | MISS     |           | new row              |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 3         | -1 (-33%) gain       |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       | 0         | same                 |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       | 0         | same                 |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache HIT)            | 1               | 1         | ok       | 1         | same                 |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache HIT)               | 1               | 1         | ok       | 1         | same                 |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                 |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                 |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache HIT)     | 1               | 1         | ok       | 1         | same                 |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache HIT)      | 1               | 1         | ok       | 1         | same                 |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache HIT)                   | 1               | 1         | ok       | 1         | same                 |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | baseline             |
