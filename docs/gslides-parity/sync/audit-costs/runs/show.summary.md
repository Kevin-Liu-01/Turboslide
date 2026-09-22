# show against https://turboslide.vercel.app, 2026-09-20T19:24:51.372Z to 2026-09-20T19:28:16.043Z, deck untitled-20260920-9oun

## setup: from /new to the deck at /edit with its title written (0.09 min, 50 requests)

| route                  | requests | per minute |   bytes | statuses        | cache  | methods |
| ---------------------- | -------: | ---------: | ------: | --------------- | ------ | ------- |
| /assets/* (static)     |       37 |     428.41 | 1436687 | 200:37          | HIT:37 | GET:37  |
| /api/x/csp/report      |        3 |      34.74 |     417 | 204:2 pending:1 | MISS:2 | POST:3  |
| /new (document)        |        1 |      11.58 |   23434 | 200:1           | MISS:1 | GET:1   |
| brand/* (static)       |        1 |      11.58 |   13873 | 200:1           | HIT:1  | GET:1   |
| /_serverFn/8f65781f…   |        1 |      11.58 |     267 | 200:1           | MISS:1 | GET:1   |
| /_serverFn/3a277a5c…   |        1 |      11.58 |     321 | 200:1           | MISS:1 | GET:1   |
| /_serverFn/2d9a6ce6…   |        1 |      11.58 |    1876 | 200:1           | MISS:1 | POST:1  |
| /_serverFn/bf5e8df0…   |        1 |      11.58 |       0 | pending:1       |        | POST:1  |
| /_serverFn/a98ce574…   |        1 |      11.58 |    2076 | 200:1           | MISS:1 | POST:1  |
| /api/decks/<id>/stream |        1 |      11.58 |       0 | pending:1       |        | GET:1   |
| /_serverFn/376e57a1…   |        1 |      11.58 |       0 | pending:1       |        | GET:1   |
| /_serverFn/5f3e5dc3…   |        1 |      11.58 |       0 | pending:1       |        | POST:1  |

## showLoad: the show load, /deck/<id>?present=1, until 8 s after load (0.15 min, 44 requests)

| route                    | requests | per minute |  bytes | statuses        | cache  | methods |
| ------------------------ | -------: | ---------: | -----: | --------------- | ------ | ------- |
| /assets/* (static)       |       34 |     234.46 | 734595 | 200:34          | HIT:34 | GET:34  |
| /_serverFn/4b2ac650…     |        4 |      27.58 |    557 | 200:2 pending:2 | MISS:2 | POST:4  |
| /deck/<id> (document)    |        1 |        6.9 |  25465 | 200:1           | MISS:1 | GET:1   |
| /api/decks/<id>/presence |        1 |        6.9 |      0 | pending:1       |        | POST:1  |
| /_serverFn/f1dbc072…     |        1 |        6.9 |      0 | pending:1       |        | GET:1   |
| /api/x/csp/report        |        1 |        6.9 |     95 | 204:1           | MISS:1 | POST:1  |
| /_serverFn/2d9a6ce6…     |        1 |        6.9 |    529 | 200:1           | MISS:1 | POST:1  |
| /_serverFn/bf5e8df0…     |        1 |        6.9 |      0 | pending:1       |        | POST:1  |

## window: the show left alone for 3 minutes (3 min, 6 requests)

| route                | requests | per minute | bytes | statuses        | cache  | methods |
| -------------------- | -------: | ---------: | ----: | --------------- | ------ | ------- |
| /_serverFn/bf5e8df0… |        6 |          2 |  1443 | 200:5 pending:1 | MISS:5 | POST:6  |

## cleanup: File > Move to trash, Delete forever on /decks/trash, the 404 checks (0.18 min, 162 requests)

| route                    | requests | per minute |   bytes | statuses    | cache        | methods |
| ------------------------ | -------: | ---------: | ------: | ----------- | ------------ | ------- |
| /assets/* (static)       |      129 |      720.6 | 2257789 | 200:129     | HIT:129      | GET:129 |
| /_serverFn/376e57a1…     |        9 |      50.27 |  171440 | 200:9       | MISS:9       | GET:9   |
| /_serverFn/4b2ac650…     |        4 |      22.34 |    1397 | 200:4       | MISS:4       | POST:4  |
| /api/render/<slide>      |        4 |      22.34 |   17805 | 200:3 302:1 | MISS:3 HIT:1 | GET:4   |
| /api/x/csp/report        |        3 |      16.76 |     515 | 204:3       | MISS:3       | POST:3  |
| /edit/<id> (document)    |        1 |       5.59 |   23773 | 200:1       | MISS:1       | GET:1   |
| brand/* (static)         |        1 |       5.59 |   13873 | 200:1       | HIT:1        | GET:1   |
| /api/decks/<id>/stream   |        1 |       5.59 |       0 | 200:1       | MISS:1       | GET:1   |
| /_serverFn/8f65781f…     |        1 |       5.59 |     483 | 200:1       | MISS:1       | GET:1   |
| /_serverFn/3a277a5c…     |        1 |       5.59 |     290 | 200:1       | MISS:1       | GET:1   |
| /_serverFn/2d9a6ce6…     |        1 |       5.59 |    2123 | 200:1       | MISS:1       | POST:1  |
| /_serverFn/bf5e8df0…     |        1 |       5.59 |       0 | pending:1   |              | POST:1  |
| /api/decks/<id>/presence |        1 |       5.59 |       0 | 200:1       | MISS:1       | POST:1  |
| /decks (document)        |        1 |       5.59 |   18026 | 200:1       | MISS:1       | GET:1   |
| blob public host         |        1 |       5.59 |   19641 | 200:1       | HIT:1        | GET:1   |
| /decks/trash (document)  |        1 |       5.59 |   13470 | 200:1       | MISS:1       | GET:1   |
| /_serverFn/4f13088a…     |        1 |       5.59 |     310 | 200:1       | MISS:1       | POST:1  |
| /_serverFn/f742a258…     |        1 |       5.59 |    1103 | 200:1       | MISS:1       | GET:1   |

## stream requests

- 19:24:56 200 still open at the end /api/decks/untitled-20260920-9oun/stream?since=1&tab=13b70efc0147775645ba10f1b5c82cce
- 19:28:05 200 still open at the end /api/decks/untitled-20260920-9oun/stream?since=1&retire=44fa218d9d6d151a45384cf59fa573b8&tab=13b70efc0147775645ba10f1b5c…

cleanup: {"trashed":"File > Move to trash","removed":"Delete forever on /decks/trash","edit":404,"deck":404}
