# Lane SD, security of stored data: wave 3a build notes

The lane's wave 3a push of `docs/hardening/HARDENING.md` (4.4, 5): HR-SD#2 (#60), which closes DATA-V5 and DATA-4. The worktree is `/Users/kevinliu/repos/Turboslide-harden3` on `harden/wave3a`, made from `origin/main` `f7e97039`. Port 4855. Other lanes of this workflow (W, SA, K2) worked in the same worktree at the same time.

## Settings of every local reading

The dev server ran from `apps/studio` on port 4855 with `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/sd-overlay`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-sd.sqlite`, `TURBOSLIDE_MAIL=capture`, the fake Google client, test values for `TURBOSLIDE_SESSION_SECRET` and `TURBOSLIDE_DOWNLOAD_SECRET` (never printed), and `-c vite.no-watch.config.ts`. `TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_AUTH_RATE_LIMIT` and `TURBOSLIDE_AUTHORIZE` were unset, as on production (4.0). The one minute load was 380 to 560 through the whole build; no reading below is a timing.

## HR-SD#2, an account's data at its deletion (DATA-V5, DATA-4)

Commits: `34e08c3e8ae0186532f7e2cbda05973825aedffe` (the push) and `a7e2aae26902627da0e69fa789ac40b94dd23e31` (`HR-SD#2 (test)`: the delete route test asserted the profile's `deletedAt` not null, which a missing profile also passes; it now requires a string). Ship them together.

What changed. better-auth's `/api/auth/delete-user` deleted the account's rows and left the rest. One hook now runs before the library deletes the rows (`beforeAccountDelete` in `apps/studio/src/server/auth/account-delete.ts`, bound in `apps/studio/src/start.ts`), over the account's principal id and the anonymous ids linked to it:

1. every deck whose stored record names one of them as the owner moves to the trash;
2. every other record drops the grants, the access requests and a pending ownership that name one of them, in one conditional write through the share actions' hooks (read past the cache, written with the etag, announced to the room), based again on a write another instance landed in between (`recordUpdater`, three attempts);
3. the deck index of each id goes with its immutable copies (`IndexStore.remove`, new on the file, Blob and memory backends in `packages/store/src/access-store.ts`);
4. the picture files go by the profile's key (`removePictureFiles` in `auth/avatar.ts`, now typed on the two methods it calls).

A failed step, or the read only switch, answers 503 with a sentence and the library deletes nothing; each step is idempotent, so the next attempt finishes the work. A pending grant by address is the inviter's and stays. One `delete` line goes to the security log with the counts and the principal id, never the address.

`bindIdentityHooks` now adds a list hook once per function. TanStack Start calls the start options on every request (`createStartHandler.js` 290 calls `startInstance.getOptions()` per request, and `start.ts` binds its seams inside them), so a pushed hook would have run once per request served by the instance. The new test bound one function three times and read three entries before the change, one after.

Files: `apps/studio/src/server/auth/account-delete.ts` (new), `account-delete.test.ts` (new), `auth/avatar.ts`, `auth/identity.ts` (the hook list's comment and `bindIdentityHooks`), `apps/studio/src/start.ts` (the binding), `packages/store/src/access-store.ts`, `packages/store/src/index-remove.test.ts` (new), `docs/security.md` section 15.

### The reproduction (gate 6)

`scratchpad/sd2/repro.mjs` on the lane's server: two people sign in by mail code, A makes two decks with an API key, sets a picture and a typed name, takes an editor grant on B's deck (opened once, so the address grant binds to A's principal) and asks for access to another of B's decks, then deletes the account through `POST /api/auth/delete-user` with the session cookie. The script reads the overlay's files before and after.

| Reading      | When (UTC), load | Code                                                                  | delete-user | A's decks             | B's records naming A                               | A's index | Picture files | Picture route after |
| ------------ | ---------------- | --------------------------------------------------------------------- | ----------- | --------------------- | -------------------------------------------------- | --------- | ------------- | ------------------- |
| before       | 04:58, 450       | `origin/main`'s deletion path                                         | 200         | both out of the trash | grant kept (revision 2), request kept (revision 1) | present   | 5             | 200                 |
| after        | 05:21, 428       | start.ts and identity.ts loaded from the dry run of the commit's text | 200         | both in the trash     | none (revisions 3 and 2)                           | gone      | 0             | 404                 |
| confirmation | 08:42, 393       | the committed tree                                                    | 200         | both in the trash     | none (revisions 3 and 2)                           | gone      | 0             | 404                 |

The confirmation's security line: `{"event":"delete","action":"account.delete","identity":"usr_…","status":200,"removed":2,"reason":"decks moved to the trash: 2; records of other decks released: 2; index files removed: 1; picture files removed: 5","ms":13}`, one line for one deletion. An earlier reading of this lane in the same session (03:16 UTC, `scratchpad/sd2/before.json`) read the same as the before row.

The after reading ran before the commit on a server whose Vite config loaded `start.ts` and `identity.ts` from the dry run of the edits (a config under the ignored `apps/studio/.turboslide/`, removed after), so the two shared files of the worktree stayed untouched outside the git lock. The confirmation ran on the committed files; the worktree then also held the SA and W lanes' uncommitted edits.

### Tests and gates

- `account-delete.test.ts`: 11 of 11 under the lock with the shared edits (08:36 UTC, load 459); 10 of 11 before the `identity.ts` change (the bind-once test). It covers `recordWithout`, the four steps over the memory stores (an access store behind two instances' caches, the index, the profiles, a picture folder in a temporary directory), a second run that finds nothing, a failed read that refuses before the index and the pictures go, a grant another instance wrote between the read and the write, the attempt limit, the bind-once rule, and the library's delete route over SQLite: the account's and its linked browser's decks in the trash, the index and the picture gone, the profile marked deleted, the log line without the address; read only answers 503 with its sentence and the session still works; a failed step answers 503 with its sentence and the account and the picture stay.
- `packages/store`: `index-remove.test.ts` and `access-cache.test.ts` 24 of 24 (04:49 UTC). The whole package from its folder (08:43 UTC, load 385, `--testTimeout=60000`): 288 passed, 1 skipped, 1 failed, `hosted.test.ts` "the watch polls one at a time", a 120 ms timing test the push does not touch; run alone twice at load 405 to 418 it passed both times.
- The studio's `src/server/auth` and `access-hooks.test.ts` (08:43 UTC, load 385, `--testTimeout=60000`): 233 of 236. The three failures are `google-tokens-at-rest.test.ts`, the K2 lane's untracked test of HR-K2#7, read before its change is in the tree.
- `tsc -p apps/studio --noEmit`: exit 0 before the shared edits (04:59 to 05:11 UTC, load about 410) and exit 0 at 08:39 to 08:42 UTC (load 390 to 460) on the worktree holding the commit and the SA and W lanes' uncommitted edits. The root `tsc -b`: exit 0 (the last section).
- The competitor guard, `core-matrix.test.mjs`, `what-works.test.mjs` and `docs-index.test.mjs`: 62 of 62; `what-works.mjs --check`: current.
- The brand lint in enforce mode: 0 open findings, exit 1 for one stale acceptance (`gt-ui/cta-title-case` on `packages/chrome/src/dialogs/ImportSlides.tsx`), a file this push does not touch.
- `prettier --check` on the push's files: clean.
- No new statement shape: the alias list (`select "anonymousId" from "ts_alias" where "userId" = ? order by "linkedAt" asc`) and the profile read (`select * from "ts_profile" where "userId" = ?`) are in `apps/realtime-worker/src/db-statements.json`.
- Not run: the node-server build and `check-client-bundle.mjs` (gate 7). The binding is one more dynamic import inside `bindServerSeams`, which only the server branch of `start.ts` reaches, like the other imports there; no surface a person sees changed, so there are no pictures.
- The row `security.delete.account-data-leaves` (8.2, `e2e/accounts.spec.ts`, local) is not entered: HR-0 is not on `origin/main`, so HR-0 enters it (4.0, rows).

### What stays after a deletion

- The decks stay in the trash. Nothing removes a trashed deck on a schedule (SPEC 0.24). The listings and the viewer routes leave a trashed deck out (`decks.ts` `loadShaped`), but the editor's loader serves it read only under the trash banner to whoever may still read it: a grant, a link, open access (`write.ts`, `EditorRoot.tsx` 565). Only the deployment's admin deletes it forever.
- The nightly backup of HR-O#1a keeps the documents and the index of a deleted account for its 30 days.
- A grant by address that was never accepted stays on the inviter's record.

## Requests

- To the ship step: HR-SD#2 is on the branch before HR-SA#3 (`c5b4e92b`), which ships before it (5). In section 5's order the three patches apply with `git apply --cached` on a scratch index of `730444e7` (HR-W#3a): HR-W#3b, then HR-SA#3, then HR-SD#2. HR-SD#2's hunks in the two shared files are `identity.ts` 111 to 117 and 499 to 517 and `start.ts` 81 to 83. SA#4 to SA#7 were not committed when this lane finished; any of them that edits those lines needs the same check.
- To the SA lane: its edits of `identity.ts`, `start.ts`, `better-auth.ts`, `tokens.ts`, `ratelimit.ts`, `auth/schema.ts`, `record-statements.test.ts` and `db-statements.json` were uncommitted in the worktree, outside the git lock, while this lane committed (08:35 UTC). HR-SD#2 staged its two shared files over `HEAD` (`git update-index --cacheinfo`), so none of those hunks entered it; HR-SA#3 committed them after.
- To the W lane: its `tsc -b` of 04:36 to 04:54 UTC failed on this lane's untracked `account-delete.ts` of that moment (TS2739 and TS2740 at line 155, the narrower deps passed to `removePictureFiles`). The signature change in `avatar.ts` fixed it; that `tsc -b` reading is worth taking again.
- To HR-0: the row `security.delete.account-data-leaves` in `e2e/accounts.spec.ts`: sign in by code in a fresh context, set a picture, make a deck, take a grant on a second person's deck, delete through `POST /api/auth/delete-user` with the page's session; then the deck's manifest in the overlay carries `trashedAt`, the second person's `share.get` names no grant of the deleted principal, and the picture's `/api/avatar/u/<key>/<file>` answers 404.
- To the lane that owns `packages/chrome` next (SA#5 in this wave, or C): the comments at `packages/chrome/src/dialogs/Profile.tsx` 21 and `packages/chrome/src/editor-shell.ts` 586 still say Delete account is refused while other people hold grants on the person's decks (SPEC-3 7.4). HR-SD#2 moves those decks to the trash instead, as HARDENING 4.4 says.
- To the orchestrator, for Kevin: the studio passes no `deleteAccount` to the Profile dialog, so its Delete account control is disabled and deletion is reached through `/api/auth/delete-user` alone. Two product questions: whether a deleted account's trashed decks should be deleted forever after a period, and whether their links and open access should close at the deletion. The default is as built: in the trash, read only to their remaining readers, until the admin deletes them.

## What went wrong in this lane

- At 05:25 UTC the lane ran `vitest run --dir packages/store` from the repository root, which runs the root project list: 546 files for 4,198 s (to 06:37 UTC) at a load of 400 to 560 on the shared machine. The package's suite runs from its own folder.
- At about 08:34 UTC a dry run of the staging script executed the edit script's main function and wrote the `identity.ts` and `start.ts` edits into the worktree outside the git lock. The lane took the lock at 08:35:06 UTC and committed at 08:36:47 UTC; no other commit landed in between.

## The root type check

`node_modules/.bin/tsc -b` from the repository root: exit 0, 08:46:46 to 08:53:28 UTC (load 410 to 526), on `HEAD` `6482b60e` (HR-SD#2 with HR-W#3b and HR-SA#3 above it) and the worktree's uncommitted edits of that moment (`better-auth.ts` and two untracked tests of other lanes).
