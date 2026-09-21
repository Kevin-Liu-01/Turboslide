# edit against https://turboslide.vercel.app, 2026-09-20T19:24:42.471Z to 2026-09-20T19:28:12.431Z, deck untitled-20260920-a4f4
edits made: 36, revision after: 37, save state: All changes saved

## setup: from /new to the deck at /edit with its title written (0.09 min, 50 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 37 | 414.33 | 1436592 | 200:37 | HIT:37 | GET:37 |
| /api/x/csp/report | 3 | 33.59 | 415 | 204:2 pending:1 | MISS:2 | POST:3 |
| /new (document) | 1 | 11.2 | 23520 | 200:1 | MISS:1 | GET:1 |
| brand/* (static) | 1 | 11.2 | 13873 | 200:1 | HIT:1 | GET:1 |
| /_serverFn/8f65781f… | 1 | 11.2 | 299 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/3a277a5c… | 1 | 11.2 | 290 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/2d9a6ce6… | 1 | 11.2 | 1878 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/bf5e8df0… | 1 | 11.2 | 0 | pending:1 |  | POST:1 |
| /_serverFn/a98ce574… | 1 | 11.2 | 2076 | 200:1 | MISS:1 | POST:1 |
| /api/decks/<id>/stream | 1 | 11.2 | 0 | pending:1 |  | GET:1 |
| /_serverFn/376e57a1… | 1 | 11.2 | 0 | pending:1 |  | GET:1 |
| /_serverFn/5f3e5dc3… | 1 | 11.2 | 0 | pending:1 |  | POST:1 |

## window: edit for 3 minutes (3 min, 238 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /api/decks/<id>/presence | 160 | 53.33 | 0 | 200:160 | MISS:160 | POST:160 |
| /api/decks/<id>/ops | 36 | 12 | 15729 | 200:36 | MISS:36 | POST:36 |
| /_serverFn/f1dbc072… | 36 | 12 | 27793 | 200:35 pending:1 | MISS:35 | GET:36 |
| /_serverFn/bf5e8df0… | 6 | 2 | 1204 | 200:5 pending:1 | MISS:5 | POST:6 |

## cleanup: File > Move to trash, Delete forever on /decks/trash, the 404 checks (0.33 min, 163 requests)
| route | requests | per minute | bytes | statuses | cache | methods |
| --- | ---: | ---: | ---: | --- | --- | --- |
| /assets/* (static) | 129 | 395.36 | 2260862 | 200:129 | HIT:129 | GET:129 |
| /_serverFn/376e57a1… | 9 | 27.58 | 171953 | 200:9 | MISS:9 | GET:9 |
| /_serverFn/4b2ac650… | 4 | 12.26 | 1263 | 200:4 | MISS:4 | POST:4 |
| /api/decks/<id>/presence | 3 | 9.19 | 0 | 200:2 pending:1 | MISS:2 | POST:3 |
| /api/x/csp/report | 3 | 9.19 | 306 | 204:3 | MISS:3 | POST:3 |
| /api/render/<slide> | 3 | 9.19 | 13211 | 200:2 302:1 | MISS:2 HIT:1 | GET:3 |
| /edit/<id> (document) | 1 | 3.06 | 24598 | 200:1 | MISS:1 | GET:1 |
| brand/* (static) | 1 | 3.06 | 13873 | 200:1 | HIT:1 | GET:1 |
| /api/decks/<id>/stream | 1 | 3.06 | 0 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/8f65781f… | 1 | 3.06 | 291 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/3a277a5c… | 1 | 3.06 | 320 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/2d9a6ce6… | 1 | 3.06 | 2284 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/bf5e8df0… | 1 | 3.06 | 0 | pending:1 |  | POST:1 |
| /decks (document) | 1 | 3.06 | 18421 | 200:1 | MISS:1 | GET:1 |
| blob public host | 1 | 3.06 | 19641 | 200:1 | HIT:1 | GET:1 |
| /decks/trash (document) | 1 | 3.06 | 13626 | 200:1 | MISS:1 | GET:1 |
| /_serverFn/4f13088a… | 1 | 3.06 | 317 | 200:1 | MISS:1 | POST:1 |
| /_serverFn/f742a258… | 1 | 3.06 | 1168 | 200:1 | MISS:1 | GET:1 |

## stream requests
- 19:24:47 200 still open at the end /api/decks/untitled-20260920-a4f4/stream?since=1&tab=a650f03db89832ad7c1246c32749ceb7
- 19:27:53 200 still open at the end /api/decks/untitled-20260920-a4f4/stream?since=37&retire=4c404cf9a2e52af4dcdd2875770c961d&tab=a650f03db89832ad7c1246c327…

cleanup: {"trashed":"File > Move to trash","removed":"Delete forever on /decks/trash","edit":404,"deck":404}
