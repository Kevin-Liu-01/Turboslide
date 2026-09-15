108 of 151 asserted rows met (199 rows; 36 rows gained on the baseline, 57 lost, 15 unchanged, 91 new); run 2026-09-14T23:08:33.591Z to 2026-09-14T23:12:26.643Z against http://localhost:4346 (local); baseline 2026-09-14T14:53:08.794Z against http://localhost:4346 (local)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 6.91 ms         | 60        | ok       | 1.60      | +5.31 (+332%) loss     |
| routes      | / cold fcp                                                                           | 108 ms          |           | reported | 60        | +48 (+80%) loss        |
| routes      | / cold lcp                                                                           | 108 ms          | 450       | ok       | 692       | -584 (-84%) gain       |
| routes      | / cold ready                                                                         | 286 ms          | 450       | ok       | 673       | -387.60 (-58%) gain    |
| routes      | / cold js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / cold largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / cold longest animation frame                                                       | 72 ms           | 150       | ok       | 62        | +10 (+16%) loss        |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 498 live elements)                                       | 592             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 7.90 ms         | 40        | ok       | 1.84      | +6.07 (+330%) loss     |
| routes      | / warm fcp                                                                           | 96 ms           |           | reported | 60        | +36 (+60%) loss        |
| routes      | / warm lcp                                                                           | 96 ms           | 250       | ok       | 672       | -576 (-86%) gain       |
| routes      | / warm ready                                                                         | 261 ms          | 250       | MISS     | 653       | -391.30 (-60%) gain    |
| routes      | / warm js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / warm largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / warm longest animation frame                                                       | 78 ms           | 150       | ok       | 60        | +18 (+30%) loss        |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 498 live elements)                                       | 592             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 8.77 ms         | 60        | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 112 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 112 ms          | 400       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 52 ms           | 400       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold longest animation frame                                                   | 51 ms           | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 7.58 ms         | 40        | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 116 ms          |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 116 ms          | 200       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 44 ms           | 200       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm longest animation frame                                                   | 60 ms           | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 4.79 ms         | 60        | ok       | 2.02      | +2.77 (+137%) loss     |
| routes      | /new cold fcp                                                                        | 84 ms           | 250       | ok       | 64        | +20 (+31%) loss        |
| routes      | /new cold lcp                                                                        | 92 ms           | 450       | ok       | 688       | -596 (-87%) gain       |
| routes      | /new cold ready                                                                      | 270 ms          | 450       | ok       | 672       | -402 (-60%) gain       |
| routes      | /new cold js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new cold largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new cold longest animation frame                                                    | 67 ms           | 150       | ok       | 63        | +4 (+6%) loss          |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 498 live elements)                                    | 592             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 42 ms           |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 4.79 ms         | 40        | ok       | 2.00      | +2.79 (+140%) loss     |
| routes      | /new warm fcp                                                                        | 80 ms           | 150       | ok       | 60        | +20 (+33%) loss        |
| routes      | /new warm lcp                                                                        | 80 ms           | 250       | ok       | 660       | -580 (-88%) gain       |
| routes      | /new warm ready                                                                      | 215 ms          | 250       | ok       | 648       | -433.10 (-67%) gain    |
| routes      | /new warm js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new warm largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new warm longest animation frame                                                    | 68 ms           | 150       | ok       | 61        | +7 (+11%) loss         |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 498 live elements)                                    | 592             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 34 ms           | 150       | ok       | 18        | +16 (+90%) loss        |
| routes      | /decks cold fcp                                                                      | 172 ms          |           | reported | 120       | +52 (+43%) loss        |
| routes      | /decks cold lcp                                                                      | 304 ms          | 500       | ok       | 212       | +92 (+43%) loss        |
| routes      | /decks cold ready                                                                    | 253 ms          | 500       | ok       | 179       | +73 (+41%) loss        |
| routes      | /decks cold js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks cold largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 94 ms           | 150       | ok       | 63        | +31 (+49%) loss        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 552 live elements)                                  | 744             |           | reported |           | new row                |
| routes      | /decks cold images with 47 cards (decoded)                                           | 563,188 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 38 ms           |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 31 ms           | 100       | ok       | 18        | +12 (+69%) loss        |
| routes      | /decks warm fcp                                                                      | 156 ms          |           | reported | 116       | +40 (+34%) loss        |
| routes      | /decks warm lcp                                                                      | 256 ms          | 300       | ok       | 208       | +48 (+23%) loss        |
| routes      | /decks warm ready                                                                    | 209 ms          | 300       | ok       | 177       | +33 (+18%) loss        |
| routes      | /decks warm js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks warm largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 85 ms           | 150       | ok       | 59        | +26 (+44%) loss        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 552 live elements)                                  | 744             |           | reported |           | new row                |
| routes      | /decks warm images with 47 cards (decoded)                                           | 563,188 bytes   | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 23 ms           | 150       | ok       | 10        | +13 (+133%) loss       |
| routes      | /decks/trash cold fcp                                                                | 88 ms           |           | reported | 68        | +20 (+29%) loss        |
| routes      | /decks/trash cold lcp                                                                | 108 ms          | 500       | ok       | 76        | +32 (+42%) loss        |
| routes      | /decks/trash cold ready                                                              | 158 ms          | 500       | ok       | 135       | +24 (+18%) loss        |
| routes      | /decks/trash cold js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash cold largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 0 ms            | 150       | ok       | 64        | -64 (-100%) gain       |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 101 live elements)                            | 126             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 9,624 bytes     |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 17 ms           | 100       | ok       | 10        | +6.72 (+67%) loss      |
| routes      | /decks/trash warm fcp                                                                | 76 ms           |           | reported | 72        | +4 (+6%) loss          |
| routes      | /decks/trash warm lcp                                                                | 84 ms           | 300       | ok       | 128       | -44 (-34%) gain        |
| routes      | /decks/trash warm ready                                                              | 127 ms          | 300       | ok       | 120       | +7.40 (+6%) loss       |
| routes      | /decks/trash warm js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash warm largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 0 ms            | 150       | ok       | 62        | -62 (-100%) gain       |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 101 live elements)                            | 126             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 9,624 bytes     |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 49 ms           | 250       | ok       | 34        | +14 (+41%) loss        |
| routes      | /deck/gt-brand cold fcp                                                              | 220 ms          |           | reported | 140       | +80 (+57%) loss        |
| routes      | /deck/gt-brand cold lcp                                                              | 220 ms          | 500       | ok       | 140       | +80 (+57%) loss        |
| routes      | /deck/gt-brand cold ready                                                            | 393 ms          | 600       | ok       | 231       | +162 (+70%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 121 ms          | 150       | ok       | 64        | +57 (+89%) loss        |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1601 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 516,149 bytes   |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 49 ms           | 150       | ok       | 32        | +18 (+56%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 196 ms          |           | reported | 124       | +72 (+58%) loss        |
| routes      | /deck/gt-brand warm lcp                                                              | 196 ms          | 300       | ok       | 124       | +72 (+58%) loss        |
| routes      | /deck/gt-brand warm ready                                                            | 340 ms          | 400       | ok       | 216       | +124 (+57%) loss       |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 91 ms           | 150       | ok       | 60        | +31 (+52%) loss        |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1601 live elements)                         | 2,501           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 1,986,652 bytes |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 30 ms           | 60        | ok       | 2.37      | +28 (+1172%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 112 ms          | 250       | ok       | 60        | +52 (+87%) loss        |
| routes      | /edit/gt-brand cold lcp                                                              | 404 ms          | 700       | ok       | 796       | -392 (-49%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 365 ms          | 700       | ok       | 728       | -362.60 (-50%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 136 ms          | 150       | ok       | 90        | +46 (+51%) loss        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1807 live elements)                         | 2,615           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 33 ms           | 40        | ok       | 1.95      | +31 (+1573%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 112 ms          | 150       | ok       | 60        | +52 (+87%) loss        |
| routes      | /edit/gt-brand warm lcp                                                              | 344 ms          | 450       | ok       | 720       | -376 (-52%) gain       |
| routes      | /edit/gt-brand warm ready                                                            | 321 ms          | 450       | ok       | 699       | -378.50 (-54%) gain    |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 130 ms          | 150       | ok       | 93        | +37 (+40%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1772 live elements)                         | 2,581           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 31 ms           | 60        | ok       | 1.91      | +29 (+1531%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 128 ms          |           | reported | 692       | -564 (-82%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 128 ms          | 500       | ok       | 700       | -572 (-82%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 262 ms          | 500       | ok       | 667       | -405.20 (-61%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand cold largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 66 ms           | 150       | ok       | 59        | +7 (+12%) loss         |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 34 ms           | 40        | ok       | 1.97      | +32 (+1647%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 140 ms          |           | reported | 668       | -528 (-79%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 140 ms          | 300       | ok       | 808       | -668 (-83%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 219 ms          | 300       | ok       | 646       | -426.70 (-66%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand warm largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 67 ms           | 150       | ok       | 60        | +7 (+12%) loss         |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 368 ms          | 300       | MISS     |           | new row                |
| transitions | back (wall)                                                                          | 70 ms           | 100       | ok       |           | new row                |
| transitions | edit->decks (in page)                                                                | 15 ms           | 300       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 4.30 ms         | 300       | ok       |           | new row                |
| transitions | home->new (wall, document navigation)                                                | 159 ms          | 300       | ok       |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 14 ms           | 50        | ok       |           | new row                |
| transitions | slideshow (in page, painted frame)                                                   | 15 ms           | 50        | ok       |           | new row                |
| transitions | layoutGrid (in page, painted frame)                                                  | 13 ms           | 50        | ok       |           | new row                |
| filmstrip   | first pass longest frame                                                             | 50 ms           | 100       | ok       | 17        | +33 (+201%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 25 ms           | 20        | MISS     | 10        | +15 (+150%) loss       |
| filmstrip   | steady passes longest frame                                                          | 50 ms           | 50        | ok       | 17        | +33 (+194%) loss       |
| filmstrip   | steady passes fps                                                                    | 88 fps          | 50        | ok       | 120       | -31.35 (-26%) loss     |
| filmstrip   | dom nodes with 85 cards (after GC; 2170 live elements)                               | 5,974           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 3               | 4         | ok       | 5         | -2 (-40%) gain         |
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
| write       | text burst: last keyup to local commit                                               | 92 ms           | 450       | ok       | 92        | +0.40 (+0%) loss       |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)              | 92 ms           | 600       | ok       |           | new row                |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence)          | ms              |           | reported |           | new row                |
| write       | text burst: current card clone carries the text after the commit                     | 0 ms            | 50        | ok       | 0         | same                   |
| write       | new slide: pointerdown to painted card                                               | 12 ms           | 16        | ok       | 9.10      | +2.90 (+32%) loss      |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)              | 2032 ms         | 250       | MISS     |           | new row                |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence)          | 2032 ms         |           | reported |           | new row                |
| write       | capture of the edited slide after the save (status 200, cached 0)                    | 3,106 ms        | 2,000     | MISS     | 1,470     | +1,636 (+111%) loss    |
| write       | home card of the scratch deck on the next /decks visit                               | 3190 ms         | 1,500     | MISS     | 1,489     | +1701 (+114%) loss     |
