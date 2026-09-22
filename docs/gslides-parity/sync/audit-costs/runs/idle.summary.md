# idle against https://turboslide.vercel.app, 2026-09-20T19:24:35.685Z to 2026-09-20T19:27:59.873Z, deck untitled-20260920-tcjp

## setup: from /new to the deck at /edit with its title written (0.08 min, 50 requests)

| route                  | requests | per minute |   bytes | statuses        | cache  | methods |
| ---------------------- | -------: | ---------: | ------: | --------------- | ------ | ------- |
| /assets/* (static)     |       37 |     470.24 | 1436641 | 200:37          | HIT:37 | GET:37  |
| /api/x/csp/report      |        3 |      38.13 |     416 | 204:2 pending:1 | MISS:2 | POST:3  |
| /new (document)        |        1 |      12.71 |   23529 | 200:1           | MISS:1 | GET:1   |
| brand/* (static)       |        1 |      12.71 |   13873 | 200:1           | HIT:1  | GET:1   |
| /_serverFn/8f65781f…   |        1 |      12.71 |     299 | 200:1           | MISS:1 | GET:1   |
| /_serverFn/3a277a5c…   |        1 |      12.71 |     294 | 200:1           | MISS:1 | GET:1   |
| /_serverFn/2d9a6ce6…   |        1 |      12.71 |    1877 | 200:1           | MISS:1 | POST:1  |
| /_serverFn/bf5e8df0…   |        1 |      12.71 |       0 | pending:1       |        | POST:1  |
| /_serverFn/a98ce574…   |        1 |      12.71 |    2082 | 200:1           | MISS:1 | POST:1  |
| /api/decks/<id>/stream |        1 |      12.71 |       0 | pending:1       |        | GET:1   |
| /_serverFn/376e57a1…   |        1 |      12.71 |       0 | pending:1       |        | GET:1   |
| /_serverFn/5f3e5dc3…   |        1 |      12.71 |       0 | pending:1       |        | POST:1  |

## window: idle for 3 minutes (3 min, 41 requests)

| route                    | requests | per minute | bytes | statuses        | cache   | methods |
| ------------------------ | -------: | ---------: | ----: | --------------- | ------- | ------- |
| /api/decks/<id>/presence |       35 |      11.66 |     0 | 200:35          | MISS:35 | POST:35 |
| /_serverFn/bf5e8df0…     |        6 |          2 |  1263 | 200:5 pending:1 | MISS:5  | POST:6  |

## cleanup: File > Move to trash, Delete forever on /decks/trash, the 404 checks (0.24 min, 167 requests)

| route                    | requests | per minute |   bytes | statuses              | cache        | methods |
| ------------------------ | -------: | ---------: | ------: | --------------------- | ------------ | ------- |
| /assets/* (static)       |      129 |     537.39 | 2260979 | 200:129               | HIT:129      | GET:129 |
| /_serverFn/376e57a1…     |        9 |      37.49 |  171070 | 200:9                 | MISS:9       | GET:9   |
| /api/render/<slide>      |        7 |      29.16 |   16445 | 200:3 302:3 pending:1 | MISS:3 HIT:3 | GET:7   |
| /_serverFn/4b2ac650…     |        4 |      16.66 |    1436 | 200:4                 | MISS:4       | POST:4  |
| /api/x/csp/report        |        3 |       12.5 |     328 | 204:3                 | MISS:3       | POST:3  |
| blob public host         |        3 |       12.5 |   41654 | 200:3                 | HIT:2 MISS:1 | GET:3   |
| /edit/<id> (document)    |        1 |       4.17 |   23931 | 200:1                 | MISS:1       | GET:1   |
| brand/* (static)         |        1 |       4.17 |   13873 | 200:1                 | HIT:1        | GET:1   |
| /api/decks/<id>/stream   |        1 |       4.17 |       0 | 200:1                 | MISS:1       | GET:1   |
| /_serverFn/8f65781f…     |        1 |       4.17 |     292 | 200:1                 | MISS:1       | GET:1   |
| /_serverFn/3a277a5c…     |        1 |       4.17 |     319 | 200:1                 | MISS:1       | GET:1   |
| /_serverFn/2d9a6ce6…     |        1 |       4.17 |    2287 | 200:1                 | MISS:1       | POST:1  |
| /_serverFn/bf5e8df0…     |        1 |       4.17 |       0 | pending:1             |              | POST:1  |
| /api/decks/<id>/presence |        1 |       4.17 |       0 | 200:1                 | MISS:1       | POST:1  |
| /decks (document)        |        1 |       4.17 |   18081 | 200:1                 | MISS:1       | GET:1   |
| /decks/trash (document)  |        1 |       4.17 |   13549 | 200:1                 | MISS:1       | GET:1   |
| /_serverFn/4f13088a…     |        1 |       4.17 |     311 | 200:1                 | MISS:1       | POST:1  |
| /_serverFn/f742a258…     |        1 |       4.17 |    1374 | 200:1                 | MISS:1       | GET:1   |

## stream requests

- 19:24:40 200 still open at the end /api/decks/untitled-20260920-tcjp/stream?since=1&tab=0de55aeb0ac582142dc894a6d245eaf0
- 19:27:45 200 still open at the end /api/decks/untitled-20260920-tcjp/stream?since=1&retire=9a298c3a92b3714ab0c870361089474a&tab=0de55aeb0ac582142dc894a6d24…

cleanup: {"trashed":"File > Move to trash","removed":"Delete forever on /decks/trash","edit":404,"deck":404}
