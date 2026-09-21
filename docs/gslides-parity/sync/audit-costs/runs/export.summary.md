# export against https://turboslide.vercel.app, 2026-09-20T19:24:58.319Z to 2026-09-20T19:29:13.593Z, deck untitled-20260920-fgtp
download: null, save state: All changes saved

## setup: from /new to the deck at /edit with its title written (0.08 min, 50 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 37 | 472.04 | 1436661 | 200:37 | HIT:37 | GET:37 |
| /api/x/csp/report | 3 | 38.27 | 450 | 204:2 pending:1 | MISS:2 | POST:3 |
| /new (document) | 1 | 12.76 | 23405 | 200:1 | MISS:1 | GET:1 |
| brand/* (static) | 1 | 12.76 | 13873 | 200:1 | HIT:1 | GET:1 |
| /_serverFn/8f65781f… | 1 | 12.76 | 323 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/3a277a5c… | 1 | 12.76 | 290 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/2d9a6ce6… | 1 | 12.76 | 1878 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/bf5e8df0… | 1 | 12.76 | 0 | pending:1 |  | POST:1 |
| /_serverFn/a98ce574… | 1 | 12.76 | 2075 | 200:1 | MISS:1 | POST:1 |
| /api/decks/<id>/stream | 1 | 12.76 | 0 | pending:1 |  | GET:1 |
| /_serverFn/376e57a1… | 1 | 12.76 | 0 | pending:1 |  | GET:1 |
| /_serverFn/5f3e5dc3… | 1 | 12.76 | 0 | pending:1 |  | POST:1 |

## export: File > Download > PDF, from the click to the download plus 4 s (4.07 min, 91 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /api/decks/<id>/presence | 49 | 12.05 | 0 | 200:49 | MISS:49 | POST:49 |
| /assets/* (static) | 34 | 8.36 | 61456 | 200:34 | HIT:34 | GET:34 |
| /_serverFn/bf5e8df0… | 8 | 1.97 | 2037 | 200:8 | MISS:8 | POST:8 |

## cleanup: File > Move to trash, Delete forever on /decks/trash, the 404 checks (0.09 min, 162 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 129 | 1377.71 | 2183299 | 200:129 | HIT:129 | GET:129 |
| /_serverFn/376e57a1… | 9 | 96.12 | 105214 | 200:8 pending:1 | MISS:8 | GET:9 |
| /_serverFn/4b2ac650… | 4 | 42.72 | 1170 | 200:4 | MISS:4 | POST:4 |
| /api/render/<slide> | 4 | 42.72 | 11870 | 200:2 302:2 | HIT:4 | GET:4 |
| /api/x/csp/report | 3 | 32.04 | 541 | 204:3 | MISS:3 | POST:3 |
| blob public host | 2 | 21.36 | 28237 | 200:2 | HIT:2 | GET:2 |
| /edit/<id> (document) | 1 | 10.68 | 23990 | 200:1 | MISS:1 | GET:1 |
| brand/* (static) | 1 | 10.68 | 13873 | 200:1 | HIT:1 | GET:1 |
| /api/decks/<id>/stream | 1 | 10.68 | 0 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/8f65781f… | 1 | 10.68 | 296 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/3a277a5c… | 1 | 10.68 | 293 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/2d9a6ce6… | 1 | 10.68 | 2132 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/bf5e8df0… | 1 | 10.68 | 0 | pending:1 |  | POST:1 |
| /api/decks/<id>/presence | 1 | 10.68 | 0 | 200:1 | MISS:1 | POST:1 |
| /decks (document) | 1 | 10.68 | 18529 | 200:1 | MISS:1 | GET:1 |
| /decks/trash (document) | 1 | 10.68 | 13478 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/4f13088a… | 1 | 10.68 | 0 | pending:1 |  | POST:1 |

## stream requests
- 19:25:03 200 still open at the end /api/decks/untitled-20260920-fgtp/stream?since=1&tab=e3aec685294149fe70bba1f5fb8545b5
- 19:25:03 200 still open at the end /api/decks/untitled-20260920-fgtp/stream?since=1&retire=fb90aa874b158dc47bf1e1f5cb2dd45c&tab=e3aec685294149fe70bba1f5fb8…
- 19:29:08 200 still open at the end /api/decks/untitled-20260920-fgtp/stream?since=1&retire=fb90aa874b158dc47bf1e1f5cb2dd45c,3789ed7e1f7ba93efbc08b5e2170ea1…

cleanup: {"trashed":"File > Move to trash","removed":"Delete forever on /decks/trash","edit":404,"deck":404}
