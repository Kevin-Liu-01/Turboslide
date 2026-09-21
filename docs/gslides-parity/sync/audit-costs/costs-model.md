## One editor hour and one show view, as the model counts them

| unit | invocations | active CPU s | memory GB-h (alone / shared) | Blob simple | Blob advanced | public host gets |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one editor hour (12 min editing, 48 idle, 2 /decks loads, 1 /home, 1 editor load, 0.5 PDF) | 1,663 | 146 | 3.67 / 1.83 | 7,315 | 1,801 | 1,762 |
| one show view (5 min) | 17 | 1 | 0.139 | 8 | 0 | 2 |

## Monthly usage and cost, streams billed as held (a tab alone on its instance)

| scenario | invocations | active CPU h | memory GB-h | Blob simple | Blob advanced | Blob transfer GB | FOT GB | Hobby | Pro on demand, no included amounts | Pro after the $20 team credit, applied once |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 5 editor h/day + 1,000 show views/day | 759,484 | 14 | 4,717 | 1,337,249 | 270,166 | 0.7 | 1.6 | paused: CPU day 9, memory day 3, Blob simple day 1, Blob advanced day 1, storage over 1 GB today | $54.30 (inv $0.46, CPU $1.79, mem $50.00, FOT $0.09, Blob $1.95) | $34.30 |
| 50 editor h/day + 1,000 show views/day | 3,004,837 | 68.9 | 9,673 | 11,212,493 | 2,701,656 | 5.9 | 6.5 | paused: invocations day 10, CPU day 2, memory day 2, Blob simple day 1, Blob advanced day 1, storage over 1 GB today | $131.86 (inv $1.80, CPU $8.82, mem $102.53, FOT $0.39, Blob $18.32) | $111.86 |
| 500 editor h/day + 1,000 show views/day | 25,458,374 | 617.5 | 59,229 | 109,964,932 | 27,016,557 | 57.5 | 55.4 | paused: invocations day 2, CPU day 1, memory day 1, Blob simple day 1, Blob advanced day 1, storage over 1 GB today | $907.44 (inv $15.28, CPU $79.04, mem $627.83, FOT $3.33, Blob $181.97) | $887.44 |

## Monthly usage and cost, streams billed at the measured shared rate (21 s of 265 s)

| scenario | invocations | active CPU h | memory GB-h | Blob simple | Blob advanced | Blob transfer GB | FOT GB | Hobby | Pro on demand, no included amounts | Pro after the $20 team credit, applied once |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 5 editor h/day + 1,000 show views/day | 759,484 | 14 | 4,441 | 1,337,249 | 270,166 | 0.7 | 1.6 | paused: CPU day 9, memory day 3, Blob simple day 1, Blob advanced day 1, storage over 1 GB today | $51.37 (inv $0.46, CPU $1.79, mem $47.08, FOT $0.09, Blob $1.95) | $31.37 |
| 50 editor h/day + 1,000 show views/day | 3,004,837 | 68.9 | 6,911 | 11,212,493 | 2,701,656 | 5.9 | 6.5 | paused: invocations day 10, CPU day 2, memory day 2, Blob simple day 1, Blob advanced day 1, storage over 1 GB today | $102.58 (inv $1.80, CPU $8.82, mem $73.25, FOT $0.39, Blob $18.32) | $82.58 |
| 500 editor h/day + 1,000 show views/day | 25,458,374 | 617.5 | 31,607 | 109,964,932 | 27,016,557 | 57.5 | 55.4 | paused: invocations day 2, CPU day 1, memory day 1, Blob simple day 1, Blob advanced day 1, storage over 1 GB today | $614.64 (inv $15.28, CPU $79.04, mem $335.03, FOT $3.33, Blob $181.97) | $594.64 |

## The savings at 50 editor hours a day plus 1,000 show views a day (Pro on demand, base $102.58 a month)

| saving | dollars a month | what it removes |
| --- | ---: | --- |
| the session long poll: none for viewers and shows, none while hidden, the stream carries the command frame | $70.95 | 6,667 GB-h and 480,000 invocations a month |
| the card thumbnail rendered once when the deck rests 30 s or the tab hides, not every 8 s of typing | $5.52 | 128,250 Chromium renders, 33.1 CPU h and 256,500 advanced operations a month |
| close an idle stream after 5 minutes without input and reopen on focus or input (the pulse poll stops with it) | $2.30 | about 152 GB-h shared (1,920 alone) and 1,728,000 heads a month |
| the presence heartbeat at 15 s when nothing moved (5 s while active) and the access and index records trusted for 60 s on the blob tier | $1.56 | 559,680 invocations and 2,266,704 heads a month |
| one put fewer per edit (the snapshot only at a named version or every tenth revision; the record proves the document) | $1.08 | 216,000 advanced operations a month |
| a show reading a published snapshot from the public host: no server function after the HTML | $1.00 | 180,000 invocations, 240,000 heads and 6.3 CPU h a month |
| no listVersions round trip after every write (the checkpoint frame carries the record; the panel reads when opened) | $0.84 | 216,000 invocations and 648,000 heads a month |
| the pulse tick at 2 s while an op landed in the last 30 s, 10 s otherwise (head() stays: it is the only fresh read) | $0.69 | 1,728,000 heads a month |
| the /decks cards preload the editor loader on intent only, and the listing reads one index record instead of one head per deck | $0.31 | 24,000 invocations and 315,000 heads a month |
| the viewer payload names the picture twin by its store URL: no 302 through the asset route per picture per load | $0.04 | 69,000 invocations a month at three pictures a deck |

Sum of the listed savings: $84.31 a month against a base of $102.58; the base counts today's usage pattern, the sum overlaps where two items remove the same call.
