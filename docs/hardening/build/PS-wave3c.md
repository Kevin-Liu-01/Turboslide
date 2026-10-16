# Lane PS, wave 3c: build notes

Work in progress (restart notes). Worktree `/Users/kevinliu/repos/Turboslide-harden5`, branch `harden/wave3c` from `origin/main` `8c9465b6`. Port 4862. Scratch: `scratchpad/ps3c/`.

## Progress

- [x] HR-PS#2: committed d06ce3159 (2026-10-12). Ten writes on 1,000 records: 9 parses, 10 validations (origin/main 10,045 and 30); unchanged mirror 0 and 0 (origin/main 300 and 10).

Restart of 2026-10-15 17:32Z: the scratch folder was wiped (ps3c/ps3-block.ts lost). Found in the tree: PS#3 pulse rule in pulse.ts; PS#4 in blob-store.ts, snapshots.ts and commit-cost.test.ts (three tests); PS#11a in render-worker main.ts and server.ts. RT's notes say RT#10/11/15 are in the tree uncommitted; room.ts is unmodified. Wave 3b holds O#5 (1e26b503e) and O#8 (4584d865e) on harden/wave3b, not on origin/main.

- [x] HR-PS#3: committed 43c76a07e (pulse rule in pulse.ts, room.ts pulseWantedOnTier, commit-cost PS#3 block, pulse-rule.test.ts, performance.md 12). Before: 5 puts per commit with pulse; after on do: 4. tsc -b not yet run (lock held by another session).
      Restart of 2026-10-16 00:28Z: the tree holds PS#4 (store suite 305 of 306 green at 12:43 local, studio 33 of 33 at 12:51 local) and PS#5's editor-load.ts, editor-load.test.ts and the identity round in room.ts (uncommitted, mixed in room.ts with RT#13's purgeRoom). The tsc lock is held since 16:30 local.
      Restart of 2026-10-16 02:16Z (Mac up 21 min, load 21): no git lock, no tsc lock; RT, O, RC have committed nothing since 544583d6b.
- [x] HR-PS#4: committed b1fb1ab58 (finish run of 2026-10-15 19:40 local). Readings in the commit: GT deck, 20 commits, 80 puts 8,643,592 B before, 62 puts 2,694,752 B after; a warm reader learning one commit 331,070 B before, 568 B after. tsc -p packages/store and apps/studio clean.
- [x] HR-PS#12a (the reader): committed 9dd82514b. Both manifest shapes read as one document in file-store's reader and in the Blob mirror (head snapshot, named snapshots, replay, the body paths fetch `assets.json` and prove its md5). Pin `packages/store/src/asset-catalog.test.ts`. Waits on wave 3b's HR-O#5 for the second pin (O#5's previous-release fixture reading both shapes); order it after O#5.
- [x] HR-PS#5: committed dac2b7270, on RT#13 and RT#15. `editor-load.ts` (three rounds), the handler in write.ts, the identity round in room.ts, `editor-load.test.ts`. Not built: the cost probe's measurement row `cost.editor-load.server-time` (8.2): where the loader's `server-timing` lands on an SSR load of /edit needs a reading on a server first.
- [ ] HR-PS#6: not built. The presenter and viewer loader with one `<script type="application/json">` payload changes how the route's data reaches hydration; it needs the node-server build's /present HTML to check (190 KB, one element), which this run does not make.
- [x] HR-PS#7: the first half committed bc4f93b02: `ensurePackages` through `ensureDeckAssets` alone; `root-packages.test.ts`. Not built: the package files and the seed as `traceInclude` files of the function (needs a Vercel build to read). Order after wave 3b's HR-O#8 (root.ts).
- [x] HR-PS#8: committed 72a2dad95: the logo route and the export route import their heavy modules inside the handlers. The assist modules stay: the action table imports `assist.ts` (light, no SDK) for every dispatcher.
- [x] HR-PS#9: committed e61764469: `mintsIdentityCookie` in auth/middleware.ts, the contracts prerendered with route rules, smoke rows `no cookie on contracts`, `mint-rule.test.ts`. The `cdn` HIT budget is the integrator's reading.
- HR-PS#11b and HR-PS#12b: held by design (Kevin's second deployment; a day after PS#12a on production). Nothing written.

The finish run (2026-10-15 19:23 to 20:50 local) ran no test, server or browser by Kevin's order of 2026-10-16: only tsc -p of the changed packages, prettier and node --check. Every new test above is unrun; the integrator runs them.

## Push order of this lane on harden/wave3c

PS#2 d06ce3159, PS#11a 3ad644ae2, PS#3 43c76a07e, PS#4 b1fb1ab58, PS#12a 9dd82514b (after
wave 3b's O#5 for its compatibility pin), PS#5 dac2b7270 (on RT#13 fe3b8f117 and RT#15
b800e7ee3), PS#7 bc4f93b02 (after wave 3b's O#8, root.ts), PS#8 72a2dad95, PS#9 e61764469.
Requests to the integrator: run `asset-catalog.test.ts`, `editor-load.test.ts`,
`root-packages.test.ts`, `mint-rule.test.ts` and `close-snapshot.test.ts`, none of which ran in
the finish run; read the router chunk for `logos-*` and the `cdn` HIT budget on the build.
