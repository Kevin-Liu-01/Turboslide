80 of 151 asserted rows met (190 rows; 53 rows gained on the baseline, 42 lost, 14 unchanged, 81 new); run 2026-09-14T23:13:02.550Z to 2026-09-14T23:17:15.807Z against https://turboslide-fw2ypjeei-kl01s-projects.vercel.app (deployment); baseline 2026-09-14T14:30:49.719Z against https://turboslide.vercel.app (deployment)

| Check       | Row                                                                                  | Value           | Ceiling   | Result   | Baseline  | Change                 |
| ----------- | ------------------------------------------------------------------------------------ | --------------- | --------- | -------- | --------- | ---------------------- |
| routes      | / cold ttfb                                                                          | 238 ms          | 200       | MISS     | 95        | +144 (+151%) loss      |
| routes      | / cold fcp                                                                           | 832 ms          |           | reported | 300       | +532 (+177%) loss      |
| routes      | / cold lcp                                                                           | 892 ms          | 700       | MISS     | 924       | -32 (-3%) gain         |
| routes      | / cold ready                                                                         | 1008 ms         | 700       | MISS     | 908       | +100 (+11%) loss       |
| routes      | / cold js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / cold largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / cold longest animation frame                                                       | 172 ms          | 150       | MISS     | 67        | +105 (+157%) loss      |
| routes      | / cold cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / cold dom nodes (after GC; 496 live elements)                                       | 589             |           | reported |           | new row                |
| routes      | / cold images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | / warm ttfb                                                                          | 121 ms          | 150       | ok       | 91        | +30 (+33%) loss        |
| routes      | / warm fcp                                                                           | 220 ms          |           | reported | 280       | -60 (-21%) gain        |
| routes      | / warm lcp                                                                           | 220 ms          | 400       | ok       | 896       | -676 (-75%) gain       |
| routes      | / warm ready                                                                         | 366 ms          | 400       | ok       | 877       | -510.80 (-58%) gain    |
| routes      | / warm js decoded                                                                    | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | / warm largest js (index-BHhOwNLI.js)                                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | / warm longest animation frame                                                       | 74 ms           | 150       | ok       | 59        | +15 (+25%) loss        |
| routes      | / warm cls                                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | / warm dom nodes (after GC; 496 live elements)                                       | 589             |           | reported |           | new row                |
| routes      | / warm images before ready (decoded)                                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /home cold ttfb                                                                      | 55 ms           | 150       | ok       |           | new row                |
| routes      | /home cold fcp                                                                       | 236 ms          |           | reported |           | new row                |
| routes      | /home cold lcp                                                                       | 236 ms          | 800       | ok       |           | new row                |
| routes      | /home cold ready                                                                     | 130 ms          | 800       | ok       |           | new row                |
| routes      | /home cold js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home cold longest animation frame                                                   | 138 ms          | 150       | ok       |           | new row                |
| routes      | /home cold cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home cold dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home cold images before ready (decoded)                                             | 40,468 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home cold images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /home warm ttfb                                                                      | 22 ms           | 100       | ok       |           | new row                |
| routes      | /home warm fcp                                                                       | 108 ms          |           | reported |           | new row                |
| routes      | /home warm lcp                                                                       | 108 ms          | 400       | ok       |           | new row                |
| routes      | /home warm ready                                                                     | 59 ms           | 400       | ok       |           | new row                |
| routes      | /home warm js decoded                                                                | 986,236 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm largest js (index-BHhOwNLI.js)                                            | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /home warm longest animation frame                                                   | 51 ms           | 150       | ok       |           | new row                |
| routes      | /home warm cls                                                                       | 0.0000          | 0.0500    | ok       |           | new row                |
| routes      | /home warm dom nodes (after GC; 782 live elements)                                   | 1,016           |           | reported |           | new row                |
| routes      | /home warm images before ready (decoded)                                             | 68,020 bytes    | 500,000   | ok       |           | new row                |
| routes      | /home warm images after a full scroll (decoded)                                      | 486,017 bytes   | 2,000,000 | ok       |           | new row                |
| routes      | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin)      | 1               | 1         | ok       |           | new row                |
| routes      | /new cold ttfb                                                                       | 221 ms          | 200       | MISS     | 113       | +107 (+95%) loss       |
| routes      | /new cold fcp                                                                        | 372 ms          | 400       | ok       | 208       | +164 (+79%) loss       |
| routes      | /new cold lcp                                                                        | 432 ms          | 700       | ok       | 844       | -412 (-49%) gain       |
| routes      | /new cold ready                                                                      | 562 ms          | 700       | ok       | 823       | -261.70 (-32%) gain    |
| routes      | /new cold js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new cold largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new cold longest animation frame                                                    | 105 ms          | 150       | ok       | 67        | +38 (+57%) loss        |
| routes      | /new cold cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new cold dom nodes (after GC; 496 live elements)                                    | 589             |           | reported |           | new row                |
| routes      | /new cold images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /new cold first byte, worst cold sample (a fresh instance is not forced; reported)   | 230 ms          |           | reported |           | new row                |
| routes      | /new warm ttfb                                                                       | 188 ms          | 150       | MISS     | 83        | +105 (+127%) loss      |
| routes      | /new warm fcp                                                                        | 264 ms          | 250       | MISS     | 148       | +116 (+78%) loss       |
| routes      | /new warm lcp                                                                        | 264 ms          | 400       | ok       | 764       | -500 (-65%) gain       |
| routes      | /new warm ready                                                                      | 433 ms          | 400       | MISS     | 750       | -316.80 (-42%) gain    |
| routes      | /new warm js decoded                                                                 | 2,254,426 bytes | 2,000,000 | MISS     | 3,122,113 | -867,687 (-28%) gain   |
| routes      | /new warm largest js (index-BHhOwNLI.js)                                             | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /new warm longest animation frame                                                    | 71 ms           | 150       | ok       | 60        | +11 (+18%) loss        |
| routes      | /new warm cls                                                                        | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /new warm dom nodes (after GC; 496 live elements)                                    | 589             |           | reported |           | new row                |
| routes      | /new warm images before ready (decoded)                                              | 14,830 bytes    |           | reported |           | new row                |
| routes      | /decks cold ttfb                                                                     | 404 ms          | 400       | MISS     | 5335      | -4930.57 (-92%) gain   |
| routes      | /decks cold fcp                                                                      | 560 ms          |           | reported | 5,644     | -5,084 (-90%) gain     |
| routes      | /decks cold lcp                                                                      | 812 ms          | 1,000     | ok       | 6,072     | -5,260 (-87%) gain     |
| routes      | /decks cold ready                                                                    | 686 ms          | 1,000     | ok       | 5705      | -5018.50 (-88%) gain   |
| routes      | /decks cold js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks cold largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks cold longest animation frame                                                  | 112 ms          | 150       | ok       | 152       | -40 (-26%) gain        |
| routes      | /decks cold cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks cold dom nodes (after GC; 291 live elements)                                  | 409             |           | reported |           | new row                |
| routes      | /decks cold images with 18 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks cold first byte, worst cold sample (a fresh instance is not forced; reported) | 472 ms          |           | reported |           | new row                |
| routes      | /decks warm ttfb                                                                     | 504 ms          | 300       | MISS     | 6300      | -5796.33 (-92%) gain   |
| routes      | /decks warm fcp                                                                      | 636 ms          |           | reported | 6,420     | -5,784 (-90%) gain     |
| routes      | /decks warm lcp                                                                      | 736 ms          | 600       | MISS     | 6,728     | -5,992 (-89%) gain     |
| routes      | /decks warm ready                                                                    | 693 ms          | 600       | MISS     | 6492      | -5799.10 (-89%) gain   |
| routes      | /decks warm js decoded                                                               | 2,172,136 bytes | 600,000   | MISS     | 3,045,067 | -872,931 (-29%) gain   |
| routes      | /decks warm largest js (index-BHhOwNLI.js)                                           | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks warm longest animation frame                                                  | 121 ms          | 150       | ok       | 85        | +36 (+42%) loss        |
| routes      | /decks warm cls                                                                      | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks warm dom nodes (after GC; 291 live elements)                                  | 412             |           | reported |           | new row                |
| routes      | /decks warm images with 18 cards (decoded)                                           | 957 bytes       | 1,500,000 | ok       |           | new row                |
| routes      | /decks/trash cold ttfb                                                               | 207 ms          | 400       | ok       | 412       | -204.82 (-50%) gain    |
| routes      | /decks/trash cold fcp                                                                | 340 ms          |           | reported | 524       | -184 (-35%) gain       |
| routes      | /decks/trash cold lcp                                                                | 340 ms          | 1,000     | ok       | 560       | -220 (-39%) gain       |
| routes      | /decks/trash cold ready                                                              | 514 ms          | 1,000     | ok       | 640       | -126.50 (-20%) gain    |
| routes      | /decks/trash cold js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash cold largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash cold longest animation frame                                            | 118 ms          | 150       | ok       | 85        | +33 (+39%) loss        |
| routes      | /decks/trash cold cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash cold dom nodes (after GC; 88 live elements)                             | 110             |           | reported |           | new row                |
| routes      | /decks/trash cold images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /decks/trash warm ttfb                                                               | 282 ms          | 300       | ok       | 396       | -114.50 (-29%) gain    |
| routes      | /decks/trash warm fcp                                                                | 348 ms          |           | reported | 480       | -132 (-28%) gain       |
| routes      | /decks/trash warm lcp                                                                | 348 ms          | 600       | ok       | 488       | -140 (-29%) gain       |
| routes      | /decks/trash warm ready                                                              | 402 ms          | 600       | ok       | 536       | -134 (-25%) gain       |
| routes      | /decks/trash warm js decoded                                                         | 968,671 bytes   | 600,000   | MISS     | 3,032,656 | -2,063,985 (-68%) gain |
| routes      | /decks/trash warm largest js (index-BHhOwNLI.js)                                     | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /decks/trash warm longest animation frame                                            | 51 ms           | 150       | ok       | 59        | -8 (-14%) gain         |
| routes      | /decks/trash warm cls                                                                | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /decks/trash warm dom nodes (after GC; 88 live elements)                             | 110             |           | reported |           | new row                |
| routes      | /decks/trash warm images before ready (decoded)                                      | 957 bytes       |           | reported |           | new row                |
| routes      | /deck/gt-brand cold ttfb                                                             | 348 ms          | 500       | ok       | 248       | +101 (+41%) loss       |
| routes      | /deck/gt-brand cold fcp                                                              | 708 ms          |           | reported | 376       | +332 (+88%) loss       |
| routes      | /deck/gt-brand cold lcp                                                              | 708 ms          | 600       | MISS     | 400       | +308 (+77%) loss       |
| routes      | /deck/gt-brand cold ready                                                            | 874 ms          | 800       | MISS     | 560       | +314 (+56%) loss       |
| routes      | /deck/gt-brand cold js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand cold longest animation frame                                          | 307 ms          | 150       | MISS     | 99        | +208 (+210%) loss      |
| routes      | /deck/gt-brand cold cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand cold dom nodes (after GC; 1601 live elements)                         | 2,502           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand cold images before ready (decoded)                                    | 1,546,533 bytes |           | reported |           | new row                |
| routes      | /deck/gt-brand warm ttfb                                                             | 307 ms          | 400       | ok       | 209       | +98 (+47%) loss        |
| routes      | /deck/gt-brand warm fcp                                                              | 504 ms          |           | reported | 300       | +204 (+68%) loss       |
| routes      | /deck/gt-brand warm lcp                                                              | 504 ms          | 400       | MISS     | 324       | +180 (+56%) loss       |
| routes      | /deck/gt-brand warm ready                                                            | 663 ms          | 600       | MISS     | 452       | +212 (+47%) loss       |
| routes      | /deck/gt-brand warm js decoded                                                       | 1,868,879 bytes | 1,000,000 | MISS     | 3,128,584 | -1,259,705 (-40%) gain |
| routes      | /deck/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /deck/gt-brand warm longest animation frame                                          | 142 ms          | 150       | ok       | 61        | +81 (+133%) loss       |
| routes      | /deck/gt-brand warm cls                                                              | 0.0021          | 0.0500    | ok       | 0.0021    | same                   |
| routes      | /deck/gt-brand warm dom nodes (after GC; 1601 live elements)                         | 2,501           | 1,500     | MISS     |           | new row                |
| routes      | /deck/gt-brand warm images before ready (decoded)                                    | 3,017,036 bytes |           | reported |           | new row                |
| routes      | /edit/gt-brand cold ttfb                                                             | 325 ms          | 200       | MISS     | 141       | +185 (+131%) loss      |
| routes      | /edit/gt-brand cold fcp                                                              | 608 ms          | 400       | MISS     | 516       | +92 (+18%) loss        |
| routes      | /edit/gt-brand cold lcp                                                              | 1,008 ms        | 1,200     | ok       | 1,308     | -300 (-23%) gain       |
| routes      | /edit/gt-brand cold ready                                                            | 941 ms          | 1,200     | ok       | 1267      | -325.70 (-26%) gain    |
| routes      | /edit/gt-brand cold js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand cold largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand cold longest animation frame                                          | 243 ms          | 150       | MISS     | 321       | -78 (-24%) gain        |
| routes      | /edit/gt-brand cold cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand cold dom nodes (after GC; 1813 live elements)                         | 2,621           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand cold images before ready (decoded)                                    | 14,830 bytes    |           | reported |           | new row                |
| routes      | /edit/gt-brand warm ttfb                                                             | 436 ms          | 150       | MISS     | 120       | +316 (+263%) loss      |
| routes      | /edit/gt-brand warm fcp                                                              | 500 ms          | 250       | MISS     | 180       | +320 (+178%) loss      |
| routes      | /edit/gt-brand warm lcp                                                              | 852 ms          | 700       | MISS     | 896       | -44 (-5%) gain         |
| routes      | /edit/gt-brand warm ready                                                            | 827 ms          | 700       | MISS     | 862       | -34.70 (-4%) gain      |
| routes      | /edit/gt-brand warm js decoded                                                       | 2,257,712 bytes | 2,000,000 | MISS     | 3,263,637 | -1,005,925 (-31%) gain |
| routes      | /edit/gt-brand warm largest js (index-BHhOwNLI.js)                                   | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /edit/gt-brand warm longest animation frame                                          | 150 ms          | 150       | ok       | 100       | +50 (+50%) loss        |
| routes      | /edit/gt-brand warm cls                                                              | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /edit/gt-brand warm dom nodes (after GC; 1813 live elements)                         | 2,621           | 1,500     | MISS     |           | new row                |
| routes      | /edit/gt-brand warm images before ready (decoded)                                    | 530,022 bytes   |           | reported |           | new row                |
| routes      | /present/gt-brand cold ttfb                                                          | 337 ms          | 200       | MISS     | 141       | +196 (+139%) loss      |
| routes      | /present/gt-brand cold fcp                                                           | 760 ms          |           | reported | 996       | -236 (-24%) gain       |
| routes      | /present/gt-brand cold lcp                                                           | 792 ms          | 800       | ok       | 1,020     | -228 (-22%) gain       |
| routes      | /present/gt-brand cold ready                                                         | 838 ms          | 800       | MISS     | 974       | -136.40 (-14%) gain    |
| routes      | /present/gt-brand cold js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand cold largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand cold longest animation frame                                       | 256 ms          | 150       | MISS     | 63        | +193 (+306%) loss      |
| routes      | /present/gt-brand cold cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand cold dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand cold images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| routes      | /present/gt-brand warm ttfb                                                          | 316 ms          | 150       | MISS     | 135       | +181 (+134%) loss      |
| routes      | /present/gt-brand warm fcp                                                           | 512 ms          |           | reported | 852       | -340 (-40%) gain       |
| routes      | /present/gt-brand warm lcp                                                           | 512 ms          | 500       | MISS     | 888       | -376 (-42%) gain       |
| routes      | /present/gt-brand warm ready                                                         | 652 ms          | 500       | MISS     | 834       | -182.10 (-22%) gain    |
| routes      | /present/gt-brand warm js decoded                                                    | 1,396,740 bytes | 1,200,000 | MISS     | 3,132,922 | -1,736,182 (-55%) gain |
| routes      | /present/gt-brand warm largest js (index-BHhOwNLI.js)                                | 914,233 bytes   | 600,000   | MISS     |           | new row                |
| routes      | /present/gt-brand warm longest animation frame                                       | 129 ms          | 150       | ok       | 60        | +69 (+115%) loss       |
| routes      | /present/gt-brand warm cls                                                           | 0.0000          | 0.0500    | ok       | 0.0000    | same                   |
| routes      | /present/gt-brand warm dom nodes (after GC; 302 live elements)                       | 367             |           | reported |           | new row                |
| routes      | /present/gt-brand warm images before ready (decoded)                                 | 14,830 bytes    |           | reported |           | new row                |
| transitions | decks->edit (in page)                                                                | 340 ms          | 500       | ok       | 598       | -258.50 (-43%) gain    |
| transitions | back (wall)                                                                          | 76 ms           | 100       | ok       | 18        | +58 (+322%) loss       |
| transitions | edit->decks (in page)                                                                | 16 ms           | 400       | ok       |           | new row                |
| transitions | trash->decks (in page)                                                               | 8.40 ms         | 400       | ok       | 3.80      | +4.60 (+121%) loss     |
| transitions | home->new (wall, document navigation)                                                | 585 ms          | 300       | MISS     |           | new row                |
| transitions | slideChange (in page, painted frame)                                                 | 15 ms           | 50        | ok       | 14        | +1.10 (+8%) loss       |
| transitions | slideshow (in page, painted frame)                                                   | 19 ms           | 50        | ok       | 18        | +1.30 (+7%) loss       |
| transitions | layoutGrid (in page, painted frame)                                                  | 15 ms           | 50        | ok       | 11        | +3.80 (+34%) loss      |
| filmstrip   | first pass longest frame                                                             | 67 ms           | 100       | ok       | 17        | +50 (+298%) loss       |
| filmstrip   | steady passes p95 frame                                                              | 42 ms           | 20        | MISS     | 10        | +32 (+313%) loss       |
| filmstrip   | steady passes longest frame                                                          | 58 ms           | 50        | MISS     | 18        | +41 (+232%) loss       |
| filmstrip   | steady passes fps                                                                    | 66 fps          | 50        | ok       | 119       | -53.23 (-45%) loss     |
| filmstrip   | dom nodes with 85 cards (after GC; 2613 live elements)                               | 5,583           | 1,500     | MISS     |           | new row                |
| idle        | server function calls per minute (60 s window)                                       | 3               | 4         | ok       | 465       | -462 (-99%) gain       |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)                     | 0               | 2         | ok       |           | new row                |
| twins       | twins re-fetched on the second visit (of 36; 0 revalidated with a 304)               | 18              | 0         | MISS     |           | new row                |
| cdn         | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache HIT)            | 1               | 1         | ok       |           | new row                |
| cdn         | /icon.svg second request is a CDN hit (status 200, x-vercel-cache HIT)               | 1               | 1         | ok       |           | new row                |
| cdn         | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       |           | new row                |
| cdn         | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache HIT)   | 1               | 1         | ok       |           | new row                |
| cdn         | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache HIT)     | 1               | 1         | ok       |           | new row                |
| cdn         | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache HIT)      | 1               | 1         | ok       |           | new row                |
| cdn         | /home second request is a CDN hit (status 200, x-vercel-cache HIT)                   | 1               | 1         | ok       |           | new row                |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)                     | ms              |           | reported |           | new row                |
