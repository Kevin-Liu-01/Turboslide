# Production smoke after the push

`node scripts/hosted-smoke.mjs https://turboslide.vercel.app` at 2026-09-11 21:28 PDT, production deployment `turboslide-kgu6an9md` of commit 3f1be80ed8871e5cba24e718d704a353f7e6ae4c (docs/EDITOR-DEPTH-STATUS.md section 12):

```
path                                       status  ms     result  detail
/                                          307     3505   pass    location /edit/editor-depth-09120413
/deck/gt-brand                             200     275    pass    374609 chars
/edit/gt-brand                             200     100    pass    17235 chars; 3/3 shell marks
/decks                                     200     279    pass    42426 chars
/decks/gt-brand/assets/cover-fumadocs.png  200     190    pass    image/png 335538 B
/api/agent                                 401     96     pass    bearer rule
6/6 passed against https://turboslide.vercel.app/
```
