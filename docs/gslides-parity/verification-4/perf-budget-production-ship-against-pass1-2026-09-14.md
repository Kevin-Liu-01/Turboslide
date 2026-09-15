119 of 151 asserted rows met (190 rows; 84 rows gained on the baseline, 25 lost, 44 unchanged, 36 new); run 2026-09-15T06:17:26.123Z to 2026-09-15T06:21:21.367Z against https://turboslide.vercel.app (deployment); baseline 2026-09-14T23:17:27.493Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 175 ms          | 200       | ok       | 146       | +30 (+20%) loss        |
| routes      | / cold fcp                                                                           | 348 ms          |           | reported | 340       | +8 (+2%) loss          |
| routes      | / cold lcp                                                                           | 348 ms          | 700       | ok       | 376       | -28 (-7%) gain         |
| routes      | / cold ready                                                                         | 421 ms          | 700       | ok       | 500       | -79.20 (-16%) gain     |
| routes      | / cold js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | / cold largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / cold longest animation frame                                                       | 80 ms           | 150       | ok       | 122       | -42 (-34%) gain        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | / warm ttfb                                                                          | 130 ms          | 150       | ok       | 120       | +9.69 (+8%) loss       |
| routes      | / warm fcp                                                                           | 224 ms          |           | reported | 192       | +32 (+17%) loss        |
| routes      | / warm lcp                                                                           | 224 ms          | 400       | ok       | 192       | +32 (+17%) loss        |
| routes      | / warm ready                                                                         | 316 ms          | 400       | ok       | 309       | +6.70 (+2%) loss       |
| routes      | / warm js decoded                                                                    | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | / warm largest js (index-CQkTTK17.js)                                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | / warm longest animation frame                                                       | 0 ms            | 150       | ok       | 60        | -60 (-100%) gain       |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 497 live elements)                                       | 590             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /home cold ttfb                                                                      | 37 ms           | 150       | ok       | 79        | -42.39 (-53%) gain     |
| routes      | /home cold fcp                                                                       | 164 ms          |           | reported | 276       | -112 (-41%) gain       |
| routes      | /home cold lcp                                                                       | 164 ms          | 800       | ok       | 276       | -112 (-41%) gain       |
| routes      | /home cold ready                                                                     | 99 ms           | 800       | ok       | 194       | -94.40 (-49%) gain     |
| routes      | /home cold js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home cold largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home cold longest animation frame                                                   | 90 ms           | 150       | ok       | 143       | -53 (-37%) gain        |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home cold dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       | 40,468    | same                   |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /home warm ttfb                                                                      | 11 ms           | 100       | ok       | 12        | -0.79 (-6%) gain       |
| routes      | /home warm fcp                                                                       | 84 ms           |           | reported | 80        | +4 (+5%) loss          |
| routes      | /home warm lcp                                                                       | 84 ms           | 400       | ok       | 80        | +4 (+5%) loss          |
| routes      | /home warm ready                                                                     | 37 ms           | 400       | ok       | 36        | +1.10 (+3%) loss       |
| routes      | /home warm js decoded                                                                | 677,739 bytes   | 600,000   | MISS     | 986,236   | -308,497 (-31%) gain   |
| routes      | /home warm largest js (index-CQkTTK17.js)                                            | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /home warm longest animation frame                                                   | 0 ms            | 150       | ok       | 0         | same                   |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /home warm dom nodes (after GC; 783 live elements)                                   | 1,017           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       | 68,020    | same                   |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       | 486,017   | same                   |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       | 1         | same                   |
| routes      | /new cold ttfb                                                                       | 172 ms          | 200       | ok       | 215       | -42.35 (-20%) gain     |
| routes      | /new cold fcp                                                                        | 264 ms          | 400       | ok       | 460       | -196 (-43%) gain       |
| routes      | /new cold lcp                                                                        | 296 ms          | 700       | ok       | 508       | -212 (-42%) gain       |
| routes      | /new cold ready                                                                      | 387 ms          | 700       | ok       | 570       | -182.50 (-32%) gain    |
| routes      | /new cold js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | /new cold largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new cold longest animation frame                                                    | 66 ms           | 150       | ok       | 63        | +3 (+5%) loss          |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 174 ms          |           | reported | 400       | -225.60 (-56%) gain    |
| routes      | /new warm ttfb                                                                       | 135 ms          | 150       | ok       | 172       | -36.66 (-21%) gain     |
| routes      | /new warm fcp                                                                        | 188 ms          | 250       | ok       | 252       | -64 (-25%) gain        |
| routes      | /new warm lcp                                                                        | 196 ms          | 400       | ok       | 292       | -96 (-33%) gain        |
| routes      | /new warm ready                                                                      | 303 ms          | 400       | ok       | 353       | -50.10 (-14%) gain     |
| routes      | /new warm js decoded                                                                 | 2,232,898 bytes | 2,000,000 | MISS     | 2,254,426 | -21,528 (-1%) gain     |
| routes      | /new warm largest js (index-CQkTTK17.js)                                             | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /new warm longest animation frame                                                    | 0 ms            | 150       | ok       | 53        | -53 (-100%) gain       |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 497 live elements)                                    | 590             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /decks cold ttfb                                                                     | 241 ms          | 400       | ok       | 409       | -167.88 (-41%) gain    |
| routes      | /decks cold fcp                                                                      | 372 ms          |           | reported | 1,460     | -1,088 (-75%) gain     |
| routes      | /decks cold lcp                                                                      | 464 ms          | 1,000     | ok       | 1,568     | -1,104 (-70%) gain     |
| routes      | /decks cold ready                                                                    | 406 ms          | 1,000     | ok       | 1532      | -1125.70 (-73%) gain   |
| routes      | /decks cold js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 2,172,136 | -22,068 (-1%) gain     |
| routes      | /decks cold largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 98 ms           | 150       | ok       | 111       | -13 (-12%) gain        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 364 live elements)                                  | 509             |           | reported |           | new row                |
| routes      | /decks cold images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 263 ms          |           | reported | 3782      | -3519.08 (-93%) gain   |
| routes      | /decks warm ttfb                                                                     | 292 ms          | 300       | ok       | 235       | +57 (+24%) loss        |
| routes      | /decks warm fcp                                                                      | 404 ms          |           | reported | 328       | +76 (+23%) loss        |
| routes      | /decks warm lcp                                                                      | 892 ms          | 600       | MISS     | 420       | +472 (+112%) loss      |
| routes      | /decks warm ready                                                                    | 423 ms          | 600       | ok       | 379       | +44 (+12%) loss        |
| routes      | /decks warm js decoded                                                               | 2,150,068 bytes | 600,000   | MISS     | 2,172,136 | -22,068 (-1%) gain     |
| routes      | /decks warm largest js (index-CQkTTK17.js)                                           | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 55 ms           | 150       | ok       | 66        | -11 (-17%) gain        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 364 live elements)                                  | 513             |           | reported |           | new row                |
| routes      | /decks warm images with 26 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 241 ms          | 400       | ok       | 294       | -52.72 (-18%) gain     |
| routes      | /decks/trash cold fcp                                                                | 380 ms          |           | reported | 424       | -44 (-10%) gain        |
| routes      | /decks/trash cold lcp                                                                | 380 ms          | 1,000     | ok       | 424       | -44 (-10%) gain        |
| routes      | /decks/trash cold ready                                                              | 379 ms          | 1,000     | ok       | 502       | -123.10 (-25%) gain    |
| routes      | /decks/trash cold js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash cold largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 75 ms           | 150       | ok       | 68        | +7 (+10%) loss         |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 114 live elements)                            | 146             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                   |
| routes      | /decks/trash warm ttfb                                                               | 344 ms          | 300       | MISS     | 292       | +52 (+18%) loss        |
| routes      | /decks/trash warm fcp                                                                | 416 ms          |           | reported | 356       | +60 (+17%) loss        |
| routes      | /decks/trash warm lcp                                                                | 416 ms          | 600       | ok       | 356       | +60 (+17%) loss        |
| routes      | /decks/trash warm ready                                                              | 435 ms          | 600       | ok       | 408       | +27 (+7%) loss         |
| routes      | /decks/trash warm js decoded                                                         | 632,382 bytes   | 600,000   | MISS     | 968,671   | -336,289 (-35%) gain   |
| routes      | /decks/trash warm largest js (index-CQkTTK17.js)                                     | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 0         | same                   |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 114 live elements)                            | 146             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported | 957       | same                   |
| routes      | /deck/gt-brand cold ttfb                                                             | 384 ms          | 500       | ok       | 504       | -119.26 (-24%) gain    |
| routes      | /deck/gt-brand cold fcp                                                              | 488 ms          |           | reported | 808       | -320 (-40%) gain       |
| routes      | /deck/gt-brand cold lcp                                                              | 572 ms          | 600       | ok       | 808       | -236 (-29%) gain       |
| routes      | /deck/gt-brand cold ready                                                            | 633 ms          | 800       | ok       | 1067      | -434.80 (-41%) gain    |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 74 ms           | 150       | ok       | 172       | -98 (-57%) gain        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0045          | 0.0500    | ok       | 0.0021    | +0.0024 (+110%) loss   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1602 live elements)                         | 2,503           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported | 516,149   | same                   |
| routes      | /deck/gt-brand warm ttfb                                                             | 254 ms          | 400       | ok       | 505       | -251.59 (-50%) gain    |
| routes      | /deck/gt-brand warm fcp                                                              | 392 ms          |           | reported | 628       | -236 (-38%) gain       |
| routes      | /deck/gt-brand warm lcp                                                              | 408 ms          | 400       | MISS     | 644       | -236 (-37%) gain       |
| routes      | /deck/gt-brand warm ready                                                            | 472 ms          | 600       | ok       | 831       | -359.00 (-43%) gain    |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,843,084 bytes | 1,000,000 | MISS     | 1,868,879 | -25,795 (-1%) gain     |
| routes      | /deck/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 0 ms            | 150       | ok       | 58        | -58 (-100%) gain       |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1602 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 516,149 bytes   |           | reported | 1,986,652 | -1,470,503 (-74%) gain |
| routes      | /edit/gt-brand cold ttfb                                                             | 415 ms          | 200       | MISS     | 345       | +70 (+20%) loss        |
| routes      | /edit/gt-brand cold fcp                                                              | 564 ms          | 400       | MISS     | 596       | -32 (-5%) gain         |
| routes      | /edit/gt-brand cold lcp                                                              | 820 ms          | 1,200     | ok       | 944       | -124 (-13%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 763 ms          | 1,200     | ok       | 857       | -94.10 (-11%) gain     |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 2,257,712 | -22,068 (-1%) gain     |
| routes      | /edit/gt-brand cold largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 96 ms           | 150       | ok       | 206       | -110 (-53%) gain       |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1554 live elements)                         | 2,159           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /edit/gt-brand warm ttfb                                                             | 385 ms          | 150       | MISS     | 315       | +70 (+22%) loss        |
| routes      | /edit/gt-brand warm fcp                                                              | 440 ms          | 250       | MISS     | 404       | +36 (+9%) loss         |
| routes      | /edit/gt-brand warm lcp                                                              | 664 ms          | 700       | ok       | 780       | -116 (-15%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 640 ms          | 700       | ok       | 756       | -115.50 (-15%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,235,644 bytes | 2,000,000 | MISS     | 2,257,712 | -22,068 (-1%) gain     |
| routes      | /edit/gt-brand warm largest js (index-CQkTTK17.js)                                   | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 91 ms           | 150       | ok       | 141       | -50 (-35%) gain        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1590 live elements)                         | 2,197           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported | 530,022   | same                   |
| routes      | /present/gt-brand cold ttfb                                                          | 340 ms          | 200       | MISS     | 2127      | -1786.57 (-84%) gain   |
| routes      | /present/gt-brand cold fcp                                                           | 516 ms          |           | reported | 2,272     | -1,756 (-77%) gain     |
| routes      | /present/gt-brand cold lcp                                                           | 516 ms          | 800       | ok       | 2,272     | -1,756 (-77%) gain     |
| routes      | /present/gt-brand cold ready                                                         | 640 ms          | 800       | ok       | 2437      | -1797.10 (-74%) gain   |
| routes      | /present/gt-brand cold js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand cold largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 64 ms           | 150       | ok       | 72        | -8 (-11%) gain         |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| routes      | /present/gt-brand warm ttfb                                                          | 346 ms          | 150       | MISS     | 458       | -111.53 (-24%) gain    |
| routes      | /present/gt-brand warm fcp                                                           | 404 ms          |           | reported | 540       | -136 (-25%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 404 ms          | 500       | ok       | 540       | -136 (-25%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 572 ms          | 500       | MISS     | 677       | -104.90 (-15%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,364,425 bytes | 1,200,000 | MISS     | 1,396,740 | -32,315 (-2%) gain     |
| routes      | /present/gt-brand warm largest js (index-CQkTTK17.js)                                | 577,949 bytes   | 600,000   | ok       |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 0 ms            | 150       | ok       | 50        | -50 (-100%) gain       |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 303 live elements)                       | 368             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported | 14,830    | same                   |
| transitions | decks->edit (in page)                                                                | 95 ms           | 500       | ok       | 168       | -72.80 (-43%) gain     |
| transitions | back (wall)                                                                          | 33 ms           | 100       | ok       | 21        | +12 (+57%) loss        |
| transitions | edit->decks (in page)                                                                | 16 ms           | 400       | ok       | 16        | same                   |
| transitions | trash->decks (in page)                                                               | 5.40 ms         | 400       | ok       | 6.10      | -0.70 (-11%) gain      |
| transitions | home->new (wall, document navigation, no prerender activation)                       | 326 ms          | 300       | MISS     |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 11 ms           | 50        | ok       | 13        | -2.30 (-18%) gain      |
| transitions | slideshow (in page, painted frame)                                                   | 15 ms           | 50        | ok       | 12        | +2.60 (+21%) loss      |
| transitions | layoutGrid (in page, painted frame)                                                  | 9.90 ms         | 50        | ok       | 11        | -0.60 (-6%) gain       |
| filmstrip   | first pass longest frame                                                             | 26 ms           | 100       | ok       | 42        | -16 (-38%) gain        |
| filmstrip   | steady passes p95 frame                                                              | 10 ms           | 20        | ok       | 17        | -6.40 (-38%) gain      |
| filmstrip   | steady passes longest frame                                                          | 18 ms           | 50        | ok       | 42        | -23.60 (-57%) gain     |
| filmstrip   | steady passes fps                                                                    | 119 fps         | 50        | ok       | 102       | +17 (+17%) gain        |
| filmstrip   | dom nodes with 85 cards (after GC; 2077 live elements)                               | 2,958           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 2               | 4         | ok       | 3         | -1 (-33%) gain         |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       | 0         | same                   |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)               | 0               | 0         | ok       | 0         | same                   |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache HIT)            | 1               | 1         | ok       | 1         | same                   |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache HIT)               | 1               | 1         | ok       | 1         | same                   |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                   |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       | 1         | same                   |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache HIT)     | 1               | 1         | ok       | 1         | same                   |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache HIT)      | 1               | 1         | ok       | 1         | same                   |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache HIT)                   | 1               | 1         | ok       | 1         | same                   |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | baseline               |
