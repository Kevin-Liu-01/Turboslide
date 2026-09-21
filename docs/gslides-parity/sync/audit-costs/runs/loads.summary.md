# loads against https://turboslide.vercel.app, 2026-09-20T19:23:18.776Z to 2026-09-20T19:24:19.352Z, deck untitled-20260920-493o

## setup: from /new to the deck at /edit with its title written (0.08 min, 50 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 37 | 467.57 | 1436724 | 200:37 | HIT:37 | GET:37 |
| /api/x/csp/report | 3 | 37.91 | 417 | 204:2 pending:1 | MISS:2 | POST:3 |
| /new (document) | 1 | 12.64 | 23551 | 200:1 | MISS:1 | GET:1 |
| brand/* (static) | 1 | 12.64 | 13873 | 200:1 | HIT:1 | GET:1 |
| /_serverFn/8f65781f… | 1 | 12.64 | 268 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/3a277a5c… | 1 | 12.64 | 344 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/2d9a6ce6… | 1 | 12.64 | 1879 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/bf5e8df0… | 1 | 12.64 | 0 | pending:1 |  | POST:1 |
| /_serverFn/a98ce574… | 1 | 12.64 | 2068 | 200:1 | MISS:1 | POST:1 |
| /api/decks/<id>/stream | 1 | 12.64 | 0 | pending:1 |  | GET:1 |
| /_serverFn/376e57a1… | 1 | 12.64 | 0 | pending:1 |  | GET:1 |
| /_serverFn/5f3e5dc3… | 1 | 12.64 | 0 | pending:1 |  | POST:1 |

## load home: one load of /home, recorded until the network rested plus 6 s (0.14 min, 30 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 15 | 109.36 | 763282 | 200:15 | HIT:14 MISS:1 | GET:15 |
| home/* (static) | 10 | 72.9 | 268727 | 200:10 | MISS:10 | GET:10 |
| brand/* (static) | 2 | 14.58 | 27552 | 200:2 | MISS:1 HIT:1 | GET:2 |
| /home (document) | 1 | 7.29 | 23587 | 200:1 | HIT:1 | GET:1 |
| /decks (document) | 1 | 7.29 | 17835 | 200:1 | MISS:1 | GET:1 |
| /deck/<id> (document) | 1 | 7.29 | 33223 | 200:1 | MISS:1 | GET:1 |

## load decks: one load of /decks, recorded until the network rested plus 6 s (0.21 min, 56 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 38 | 178.88 | 736552 | 200:38 | HIT:38 | GET:38 |
| /_serverFn/376e57a1… | 8 | 37.66 | 158880 | 200:8 | MISS:8 | GET:8 |
| /api/render/<slide> | 5 | 23.54 | 9169 | 200:2 302:3 | MISS:1 HIT:4 | GET:5 |
| blob public host | 3 | 14.12 | 30730 | 200:3 | HIT:3 | GET:3 |
| /decks (document) | 1 | 4.71 | 17906 | 200:1 | MISS:1 | GET:1 |
| /api/x/csp/report | 1 | 4.71 | 108 | 204:1 | MISS:1 | POST:1 |

## load deck: one load of /deck/untitled-20260920-493o, recorded until the network rested plus 6 s (0.44 min, 38 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 34 | 77.16 | 734868 | 200:34 | HIT:34 | GET:34 |
| /deck/<id> (document) | 1 | 2.27 | 25694 | 200:1 | MISS:1 | GET:1 |
| /api/x/csp/report | 1 | 2.27 | 284 | 204:1 | MISS:1 | POST:1 |
| /_serverFn/2d9a6ce6… | 1 | 2.27 | 540 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/bf5e8df0… | 1 | 2.27 | 241 | 200:1 | MISS:1 | POST:1 |

## cleanup: File > Move to trash, Delete forever on /decks/trash, the 404 checks (0.14 min, 167 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 129 | 929.84 | 2248577 | 200:129 | HIT:129 | GET:129 |
| /_serverFn/376e57a1… | 9 | 64.87 | 119616 | 200:7 pending:2 | MISS:7 | GET:9 |
| /api/render/<slide> | 7 | 50.46 | 15104 | 200:3 302:3 pending:1 | MISS:2 HIT:4 | GET:7 |
| /_serverFn/4b2ac650… | 4 | 28.83 | 1393 | 200:4 | MISS:4 | POST:4 |
| /api/x/csp/report | 3 | 21.62 | 292 | 204:3 | MISS:3 | POST:3 |
| blob public host | 3 | 21.62 | 30730 | 200:3 | HIT:3 | GET:3 |
| /edit/<id> (document) | 1 | 7.21 | 23886 | 200:1 | MISS:1 | GET:1 |
| brand/* (static) | 1 | 7.21 | 13873 | 200:1 | HIT:1 | GET:1 |
| /api/decks/<id>/stream | 1 | 7.21 | 0 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/8f65781f… | 1 | 7.21 | 460 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/3a277a5c… | 1 | 7.21 | 319 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/2d9a6ce6… | 1 | 7.21 | 2147 | 200:1 | MISS:1 | POST:1 |
| /api/decks/<id>/presence | 1 | 7.21 | 0 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/bf5e8df0… | 1 | 7.21 | 0 | pending:1 |  | POST:1 |
| /decks (document) | 1 | 7.21 | 17994 | 200:1 | MISS:1 | GET:1 |
| /decks/trash (document) | 1 | 7.21 | 13255 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/4f13088a… | 1 | 7.21 | 312 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/f742a258… | 1 | 7.21 | 1103 | 200:1 | MISS:1 | GET:1 |

## stream requests
- 19:23:23 pending still open at the end /api/decks/untitled-20260920-493o/stream?since=1&tab=a13860575366e1a30e179c583b213dea
- 19:24:11 200 still open at the end /api/decks/untitled-20260920-493o/stream?since=1&tab=a13860575366e1a30e179c583b213dea

cleanup: {"trashed":"File > Move to trash","removed":"Delete forever on /decks/trash","edit":404,"deck":404}
