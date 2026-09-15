# The perf budget rows across the runs of 2026-09-14 (medians of three; ok or MISS against the profile's ceiling)

Deployment profile: the day 0 production run (the round three ship `d5d7f07`, 14:30 UTC), production after the ship (`43707c3`, 23:17 UTC) and the preview `turboslide-fw2ypjeei-kl01s-projects.vercel.app` (23:13 UTC). Local profile: the day 0 `vite preview` of the round three build (14:53 UTC), step 31's node-server build on 4321 (22:27 UTC) and `vite preview` of `apps/studio/dist` on 4346 (23:08 UTC). Units: ms unless the metric says KB or a ratio.

## deployment profile

| Route               | Metric                  | day 0 production (d5d7f07) cold / warm | production (43707c3) cold / warm | preview fw2ypjeei cold / warm |
| ------------------- | ----------------------- | -------------------------------------- | -------------------------------- | ----------------------------- |
| `/home`             | ttfb                    |                                        | 79 ok / 12 ok                    | 55 ok / 22 ok                 |
| `/home`             | fcp                     |                                        | 276 / 80                         | 236 / 108                     |
| `/home`             | lcp                     |                                        | 276 ok / 80 ok                   | 236 ok / 108 ok               |
| `/home`             | ready                   |                                        | 194 ok / 36 ok                   | 130 ok / 59 ok                |
| `/home`             | js decoded              |                                        | 963 KB MISS / 963 KB MISS        | 963 KB MISS / 963 KB MISS     |
| `/home`             | longest animation frame |                                        | 143 ok / 0.0 ok                  | 138 ok / 51 ok                |
| `/home`             | cls                     |                                        | 0.0000 ok / 0.0000 ok            | 0.0000 ok / 0.0000 ok         |
| `/`                 | ttfb                    | 95 ok / 91 ok                          | 146 ok / 120 ok                  | 238 MISS / 121 ok             |
| `/`                 | fcp                     | 300 / 280                              | 340 / 192                        | 832 / 220                     |
| `/`                 | lcp                     | 924 MISS / 896 MISS                    | 376 ok / 192 ok                  | 892 MISS / 220 ok             |
| `/`                 | ready                   | 908 MISS / 877 MISS                    | 500 ok / 309 ok                  | 1,008 MISS / 366 ok           |
| `/`                 | js decoded              | 3,049 KB MISS / 3,049 KB MISS          | 2,202 KB MISS / 2,202 KB MISS    | 2,202 KB MISS / 2,202 KB MISS |
| `/`                 | longest animation frame | 67 ok / 59 ok                          | 122 ok / 60 ok                   | 172 MISS / 74 ok              |
| `/`                 | cls                     | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok            | 0.0000 ok / 0.0000 ok         |
| `/new`              | ttfb                    | 113 ok / 83 ok                         | 215 MISS / 172 MISS              | 221 MISS / 188 MISS           |
| `/new`              | fcp                     | 208 ok / 148 ok                        | 460 MISS / 252 MISS              | 372 ok / 264 MISS             |
| `/new`              | lcp                     | 844 MISS / 764 MISS                    | 508 ok / 292 ok                  | 432 ok / 264 ok               |
| `/new`              | ready                   | 823 MISS / 750 MISS                    | 570 ok / 353 ok                  | 562 ok / 433 MISS             |
| `/new`              | js decoded              | 3,049 KB MISS / 3,049 KB MISS          | 2,202 KB MISS / 2,202 KB MISS    | 2,202 KB MISS / 2,202 KB MISS |
| `/new`              | longest animation frame | 67 ok / 60 ok                          | 63 ok / 53 ok                    | 105 ok / 71 ok                |
| `/new`              | cls                     | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok            | 0.0000 ok / 0.0000 ok         |
| `/decks`            | ttfb                    | 5,335 MISS / 6,300 MISS                | 409 MISS / 235 ok                | 404 MISS / 504 MISS           |
| `/decks`            | fcp                     | 5,644 / 6,420                          | 1,460 / 328                      | 560 / 636                     |
| `/decks`            | lcp                     | 6,072 MISS / 6,728 MISS                | 1,568 MISS / 420 ok              | 812 ok / 736 MISS             |
| `/decks`            | ready                   | 5,705 MISS / 6,492 MISS                | 1,532 MISS / 379 ok              | 686 ok / 692 MISS             |
| `/decks`            | js decoded              | 2,974 KB MISS / 2,974 KB MISS          | 2,121 KB MISS / 2,121 KB MISS    | 2,121 KB MISS / 2,121 KB MISS |
| `/decks`            | longest animation frame | 152 MISS / 85 ok                       | 111 ok / 66 ok                   | 112 ok / 121 ok               |
| `/decks`            | cls                     | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok            | 0.0000 ok / 0.0000 ok         |
| `/decks/trash`      | ttfb                    | 412 MISS / 396 MISS                    | 294 ok / 292 ok                  | 207 ok / 282 ok               |
| `/decks/trash`      | fcp                     | 524 / 480                              | 424 / 356                        | 340 / 348                     |
| `/decks/trash`      | lcp                     | 560 ok / 488 ok                        | 424 ok / 356 ok                  | 340 ok / 348 ok               |
| `/decks/trash`      | ready                   | 640 ok / 536 ok                        | 502 ok / 408 ok                  | 514 ok / 402 ok               |
| `/decks/trash`      | js decoded              | 2,962 KB MISS / 2,962 KB MISS          | 946 KB MISS / 946 KB MISS        | 946 KB MISS / 946 KB MISS     |
| `/decks/trash`      | longest animation frame | 85 ok / 59 ok                          | 68 ok / 0.0 ok                   | 118 ok / 51 ok                |
| `/decks/trash`      | cls                     | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok            | 0.0000 ok / 0.0000 ok         |
| `/deck/gt-brand`    | ttfb                    | 248 ok / 209 ok                        | 504 MISS / 505 MISS              | 348 ok / 307 ok               |
| `/deck/gt-brand`    | fcp                     | 376 / 300                              | 808 / 628                        | 708 / 504                     |
| `/deck/gt-brand`    | lcp                     | 400 ok / 324 ok                        | 808 MISS / 644 MISS              | 708 MISS / 504 MISS           |
| `/deck/gt-brand`    | ready                   | 560 ok / 452 ok                        | 1,067 MISS / 831 MISS            | 874 MISS / 663 MISS           |
| `/deck/gt-brand`    | js decoded              | 3,055 KB MISS / 3,055 KB MISS          | 1,825 KB MISS / 1,825 KB MISS    | 1,825 KB MISS / 1,825 KB MISS |
| `/deck/gt-brand`    | longest animation frame | 99 ok / 61 ok                          | 172 MISS / 58 ok                 | 307 MISS / 142 ok             |
| `/deck/gt-brand`    | cls                     | 0.0021 ok / 0.0021 ok                  | 0.0021 ok / 0.0021 ok            | 0.0021 ok / 0.0021 ok         |
| `/edit/gt-brand`    | ttfb                    | 141 ok / 120 ok                        | 345 MISS / 315 MISS              | 325 MISS / 436 MISS           |
| `/edit/gt-brand`    | fcp                     | 516 MISS / 180 ok                      | 596 MISS / 404 MISS              | 608 MISS / 500 MISS           |
| `/edit/gt-brand`    | lcp                     | 1,308 MISS / 896 MISS                  | 944 ok / 780 MISS                | 1,008 ok / 852 MISS           |
| `/edit/gt-brand`    | ready                   | 1,267 MISS / 862 MISS                  | 857 ok / 756 MISS                | 941 ok / 827 MISS             |
| `/edit/gt-brand`    | js decoded              | 3,187 KB MISS / 3,187 KB MISS          | 2,205 KB MISS / 2,205 KB MISS    | 2,205 KB MISS / 2,205 KB MISS |
| `/edit/gt-brand`    | longest animation frame | 321 MISS / 100 ok                      | 206 MISS / 141 ok                | 243 MISS / 150 ok             |
| `/edit/gt-brand`    | cls                     | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok            | 0.0000 ok / 0.0000 ok         |
| `/present/gt-brand` | ttfb                    | 141 ok / 135 ok                        | 2,127 MISS / 458 MISS            | 337 MISS / 316 MISS           |
| `/present/gt-brand` | fcp                     | 996 / 852                              | 2,272 / 540                      | 760 / 512                     |
| `/present/gt-brand` | lcp                     | 1,020 MISS / 888 MISS                  | 2,272 MISS / 540 MISS            | 792 ok / 512 MISS             |
| `/present/gt-brand` | ready                   | 974 MISS / 834 MISS                    | 2,437 MISS / 677 MISS            | 838 MISS / 652 MISS           |
| `/present/gt-brand` | js decoded              | 3,059 KB MISS / 3,059 KB MISS          | 1,364 KB MISS / 1,364 KB MISS    | 1,364 KB MISS / 1,364 KB MISS |
| `/present/gt-brand` | longest animation frame | 63 ok / 60 ok                          | 72 ok / 50 ok                    | 256 MISS / 129 ok             |
| `/present/gt-brand` | cls                     | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok            | 0.0000 ok / 0.0000 ok         |

| Check       | Row                                                                    | day 0 production (d5d7f07) | production (43707c3) | preview fw2ypjeei |
| ----------- | ---------------------------------------------------------------------- | -------------------------- | -------------------- | ----------------- |
| transitions | decks->edit (in page)                                                  | 598 MISS                   | 168 ok               | 340 ok            |
| transitions | back (wall)                                                            | 18 ok                      | 21 ok                | 76 ok             |
| transitions | edit->decks (in page)                                                  |                            | 16 ok                | 16 ok             |
| transitions | trash->decks (in page)                                                 | 3.8 ok                     | 6.1 ok               | 8.4 ok            |
| transitions | home->new (wall, document navigation)                                  |                            | 413 MISS             | 585 MISS          |
| transitions | slideChange (in page, painted frame)                                   | 14 ok                      | 13 ok                | 15 ok             |
| transitions | slideshow (in page, painted frame)                                     | 18 ok                      | 12 ok                | 19 ok             |
| transitions | layoutGrid (in page, painted frame)                                    | 11 ok                      | 10 ok                | 15 ok             |
| filmstrip   | first pass longest frame                                               | 17 ok                      | 42 ok                | 67 ok             |
| filmstrip   | steady passes p95 frame                                                | 10 ok                      | 17 ok                | 42 MISS           |
| filmstrip   | steady passes longest frame                                            | 18 ok                      | 42 ok                | 58 MISS           |
| filmstrip   | steady passes fps                                                      | 119 ok                     | 102 ok               | 66 ok             |
| filmstrip   | dom nodes with 85 cards (after GC; 2133 live elements)                 |                            | 5,923 MISS           |                   |
| idle        | server function calls per minute (60 s window)                         | 465 MISS                   | 3.0 ok               | 3.0 ok            |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)       |                            | 0.0 ok               | 0.0 ok            |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304) |                            | 0.0 ok               |                   |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)       |                            |                      |                   |

## local profile

| Route               | Metric                  | day 0 vite preview (d5d7f07) cold / warm | node server 4321 (step 31) cold / warm | vite preview 4346 cold / warm |
| ------------------- | ----------------------- | ---------------------------------------- | -------------------------------------- | ----------------------------- |
| `/home`             | ttfb                    |                                          | 5.9 ok / 0.1 ok                        | 8.8 ok / 7.6 ok               |
| `/home`             | fcp                     |                                          | 84 / 72                                | 112 / 116                     |
| `/home`             | lcp                     |                                          | 84 ok / 72 ok                          | 112 ok / 116 ok               |
| `/home`             | ready                   |                                          | 37 ok / 29 ok                          | 52 ok / 44 ok                 |
| `/home`             | js decoded              |                                          | 963 KB MISS / 963 KB MISS              | 963 KB MISS / 963 KB MISS     |
| `/home`             | longest animation frame |                                          | 0.0 ok / 0.0 ok                        | 51 ok / 60 ok                 |
| `/home`             | cls                     |                                          | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok         |
| `/`                 | ttfb                    | 1.6 ok / 1.8 ok                          | 8.6 ok / 6.6 ok                        | 6.9 ok / 7.9 ok               |
| `/`                 | fcp                     | 60 / 60                                  | 92 / 96                                | 108 / 96                      |
| `/`                 | lcp                     | 692 MISS / 672 MISS                      | 96 ok / 96 ok                          | 108 ok / 96 ok                |
| `/`                 | ready                   | 673 MISS / 652 MISS                      | 280 ok / 257 MISS                      | 286 ok / 261 MISS             |
| `/`                 | js decoded              | 3,049 KB MISS / 3,049 KB MISS            | 2,202 KB MISS / 2,202 KB MISS          | 2,202 KB MISS / 2,202 KB MISS |
| `/`                 | longest animation frame | 62 ok / 60 ok                            | 73 ok / 76 ok                          | 72 ok / 78 ok                 |
| `/`                 | cls                     | 0.0000 ok / 0.0000 ok                    | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok         |
| `/new`              | ttfb                    | 2.0 ok / 2.0 ok                          | 4.0 ok / 3.4 ok                        | 4.8 ok / 4.8 ok               |
| `/new`              | fcp                     | 64 ok / 60 ok                            | 88 ok / 88 ok                          | 84 ok / 80 ok                 |
| `/new`              | lcp                     | 688 MISS / 660 MISS                      | 88 ok / 88 ok                          | 92 ok / 80 ok                 |
| `/new`              | ready                   | 672 MISS / 648 MISS                      | 185 ok / 148 ok                        | 270 ok / 215 ok               |
| `/new`              | js decoded              | 3,049 KB MISS / 3,049 KB MISS            | 2,202 KB MISS / 2,202 KB MISS          | 2,202 KB MISS / 2,202 KB MISS |
| `/new`              | longest animation frame | 63 ok / 61 ok                            | 65 ok / 51 ok                          | 67 ok / 68 ok                 |
| `/new`              | cls                     | 0.0000 ok / 0.0000 ok                    | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok         |
| `/decks`            | ttfb                    | 18 ok / 18 ok                            | 21 ok / 22 ok                          | 34 ok / 31 ok                 |
| `/decks`            | fcp                     | 120 / 116                                | 112 / 104                              | 172 / 156                     |
| `/decks`            | lcp                     | 212 ok / 208 ok                          | 212 ok / 184 ok                        | 304 ok / 256 ok               |
| `/decks`            | ready                   | 179 ok / 177 ok                          | 167 ok / 141 ok                        | 253 ok / 209 ok               |
| `/decks`            | js decoded              | 2,974 KB MISS / 2,974 KB MISS            | 2,121 KB MISS / 2,121 KB MISS          | 2,121 KB MISS / 2,121 KB MISS |
| `/decks`            | longest animation frame | 63 ok / 59 ok                            | 57 ok / 0.0 ok                         | 94 ok / 85 ok                 |
| `/decks`            | cls                     | 0.0000 ok / 0.0000 ok                    | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok         |
| `/decks/trash`      | ttfb                    | 10 ok / 10 ok                            | 12 ok / 12 ok                          | 23 ok / 17 ok                 |
| `/decks/trash`      | fcp                     | 68 / 72                                  | 100 / 60                               | 88 / 76                       |
| `/decks/trash`      | lcp                     | 76 ok / 128 ok                           | 100 ok / 68 ok                         | 108 ok / 84 ok                |
| `/decks/trash`      | ready                   | 134 ok / 120 ok                          | 91 ok / 89 ok                          | 158 ok / 127 ok               |
| `/decks/trash`      | js decoded              | 2,962 KB MISS / 2,962 KB MISS            | 946 KB MISS / 946 KB MISS              | 946 KB MISS / 946 KB MISS     |
| `/decks/trash`      | longest animation frame | 64 ok / 62 ok                            | 52 ok / 0.0 ok                         | 0.0 ok / 0.0 ok               |
| `/decks/trash`      | cls                     | 0.0000 ok / 0.0000 ok                    | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok         |
| `/deck/gt-brand`    | ttfb                    | 34 ok / 32 ok                            | 32 ok / 31 ok                          | 49 ok / 49 ok                 |
| `/deck/gt-brand`    | fcp                     | 140 / 124                                | 132 / 140                              | 220 / 196                     |
| `/deck/gt-brand`    | lcp                     | 140 ok / 124 ok                          | 132 ok / 140 ok                        | 220 ok / 196 ok               |
| `/deck/gt-brand`    | ready                   | 231 ok / 216 ok                          | 223 ok / 239 ok                        | 393 ok / 340 ok               |
| `/deck/gt-brand`    | js decoded              | 3,055 KB MISS / 3,055 KB MISS            | 1,825 KB MISS / 1,825 KB MISS          | 1,825 KB MISS / 1,825 KB MISS |
| `/deck/gt-brand`    | longest animation frame | 64 ok / 60 ok                            | 59 ok / 0.0 ok                         | 121 ok / 91 ok                |
| `/deck/gt-brand`    | cls                     | 0.0021 ok / 0.0021 ok                    | 0.0021 ok / 0.0021 ok                  | 0.0021 ok / 0.0021 ok         |
| `/edit/gt-brand`    | ttfb                    | 2.4 ok / 1.9 ok                          | 82 MISS / 86 MISS                      | 30 ok / 33 ok                 |
| `/edit/gt-brand`    | fcp                     | 60 ok / 60 ok                            | 152 ok / 164 MISS                      | 112 ok / 112 ok               |
| `/edit/gt-brand`    | lcp                     | 796 MISS / 720 MISS                      | 436 ok / 416 ok                        | 404 ok / 344 ok               |
| `/edit/gt-brand`    | ready                   | 728 MISS / 699 MISS                      | 419 ok / 388 ok                        | 365 ok / 321 ok               |
| `/edit/gt-brand`    | js decoded              | 3,187 KB MISS / 3,187 KB MISS            | 2,205 KB MISS / 2,205 KB MISS          | 2,205 KB MISS / 2,205 KB MISS |
| `/edit/gt-brand`    | longest animation frame | 90 ok / 93 ok                            | 155 MISS / 127 ok                      | 136 ok / 130 ok               |
| `/edit/gt-brand`    | cls                     | 0.0000 ok / 0.0000 ok                    | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok         |
| `/present/gt-brand` | ttfb                    | 1.9 ok / 2.0 ok                          | 36 ok / 40 MISS                        | 31 ok / 34 ok                 |
| `/present/gt-brand` | fcp                     | 692 / 668                                | 128 / 112                              | 128 / 140                     |
| `/present/gt-brand` | lcp                     | 700 MISS / 808 MISS                      | 128 ok / 112 ok                        | 128 ok / 140 ok               |
| `/present/gt-brand` | ready                   | 667 MISS / 646 MISS                      | 182 ok / 204 ok                        | 262 ok / 219 ok               |
| `/present/gt-brand` | js decoded              | 3,059 KB MISS / 3,059 KB MISS            | 1,364 KB MISS / 1,364 KB MISS          | 1,364 KB MISS / 1,364 KB MISS |
| `/present/gt-brand` | longest animation frame | 59 ok / 60 ok                            | 58 ok / 64 ok                          | 66 ok / 67 ok                 |
| `/present/gt-brand` | cls                     | 0.0000 ok / 0.0000 ok                    | 0.0000 ok / 0.0000 ok                  | 0.0000 ok / 0.0000 ok         |

| Check       | Row                                                                         | day 0 vite preview (d5d7f07) | node server 4321 (step 31) | vite preview 4346 |
| ----------- | --------------------------------------------------------------------------- | ---------------------------- | -------------------------- | ----------------- |
| transitions | decks->edit (in page)                                                       |                              | 107 ok                     | 368 MISS          |
| transitions | back (wall)                                                                 |                              | 35 ok                      | 70 ok             |
| transitions | edit->decks (in page)                                                       |                              | 15 ok                      | 15 ok             |
| transitions | trash->decks (in page)                                                      |                              | 5.6 ok                     | 4.3 ok            |
| transitions | home->new (wall, document navigation)                                       |                              | 131 ok                     | 159 ok            |
| transitions | slideChange (in page, painted frame)                                        |                              | 12 ok                      | 14 ok             |
| transitions | slideshow (in page, painted frame)                                          |                              | 13 ok                      | 14 ok             |
| transitions | layoutGrid (in page, painted frame)                                         |                              | 9.2 ok                     | 13 ok             |
| filmstrip   | first pass longest frame                                                    | 17 ok                        | 50 ok                      | 50 ok             |
| filmstrip   | steady passes p95 frame                                                     | 10 ok                        | 25 MISS                    | 25 MISS           |
| filmstrip   | steady passes longest frame                                                 | 17 ok                        | 42 ok                      | 50 ok             |
| filmstrip   | steady passes fps                                                           | 120 ok                       | 90 ok                      | 88 ok             |
| filmstrip   | dom nodes with 85 cards (after GC; 2203 live elements)                      |                              | 5,148 MISS                 |                   |
| idle        | server function calls per minute (60 s window)                              | 5.0 MISS                     | 5.0 MISS                   | 3.0 ok            |
| idle        | stream connections per minute (/api/decks/*/stream, 60 s window)            |                              | 0.0 ok                     | 0.0 ok            |
| twins       | twins re-fetched on the second visit (of 16; 0 revalidated with a 304)      |                              | 0.0 ok                     | 0.0 ok            |
| vitals      | field INP p75 from /api/vitals (reserved; no ceiling this round)            |                              |                            |                   |
| write       | text burst: last keyup to local commit                                      | 92 ok                        | 90 ok                      | 92 ok             |
| write       | text burst: last keyup to saved revision (acknowledged; memory channel)     |                              | 90 ok                      | 92 ok             |
| write       | text burst: last keyup to checkpoint (reported; the memory channel cadence) |                              |                            |                   |
| write       | text burst: current card clone carries the text after the commit            | 0.0 ok                       | 0.0 ok                     | 0.0 ok            |
| write       | new slide: pointerdown to painted card                                      | 9.1 ok                       | 8.7 ok                     | 12 ok             |
| write       | new slide: pointerdown to saved revision (acknowledged; memory channel)     |                              | 2,023 MISS                 | 2,032 MISS        |
| write       | new slide: pointerdown to checkpoint (reported; the memory channel cadence) |                              | 2,023                      | 2,032             |
| write       | capture of the edited slide after the save (status 200, cached 0)           | 1,470 ok                     | 1,561 ok                   | 3,106 MISS        |
| write       | home card of the scratch deck on the next /decks visit                      | 1,489 ok                     | 1,590 MISS                 | 3,190 MISS        |

- day 0 production (d5d7f07): 58 of 121 asserted rows met, 141 rows, 2026-09-14T14:30:49.719Z to 2026-09-14T14:34:32.821Z
- production (43707c3): 86 of 151 asserted rows met, 190 rows, 2026-09-14T23:17:27.493Z to 2026-09-14T23:21:46.129Z
- preview fw2ypjeei: 80 of 151 asserted rows met, 190 rows, 2026-09-14T23:13:02.550Z to 2026-09-14T23:17:15.807Z
- day 0 vite preview (d5d7f07): 73 of 121 asserted rows met, 141 rows, 2026-09-14T14:53:08.794Z to 2026-09-14T14:55:56.430Z
- node server 4321 (step 31): 104 of 151 asserted rows met, 199 rows, 2026-09-14T22:27:35.649Z to 2026-09-14T22:31:19.488Z
- vite preview 4346: 108 of 151 asserted rows met, 199 rows, 2026-09-14T23:08:33.591Z to 2026-09-14T23:12:26.643Z
