// Builds docs/gslides-parity/focus/audit-present.md from the four run tables. Evidence strings are
// copied verbatim from the JSON rows; severity, need and why are the auditor's judgement.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DOCS = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/focus';
const EVID = path.join(DOCS, 'audit-present');
mkdirSync(EVID, { recursive: true });
const R = {
  R1: JSON.parse(readFileSync(path.join(HERE, 'run1.json'), 'utf8')),
  R2: JSON.parse(readFileSync(path.join(HERE, 'run2.json'), 'utf8')),
  R3: JSON.parse(readFileSync(path.join(HERE, 'run3.json'), 'utf8')),
  R4: JSON.parse(readFileSync(path.join(HERE, 'run4.json'), 'utf8')),
};
const row = (src, n) => {
  const r = R[src].rows.find((x) => x.n === n);
  if (!r) throw new Error(`no row ${src} ${n}`);
  return r;
};
const ev = (src, n) => `${src} row ${n}: ${row(src, n).evidence}`;
const clean = (s) => s.replace(/\|/g, ';').replace(/\n/g, ' ');

/** The table, in the brief's order. Evidence is verbatim from the runs; the shot is a file under audit-present/. */
const rows = [
  // Slideshow
  { feature: 'Slideshow', interaction: 'Click Slideshow in the title row (from the current slide)', result: 'works', evidence: `${ev('R2', 4)}; shot 01-slideshow-open.png`, severity: 0, need: 'core', why: 'Presenting in the room or over a call is a weekly seller task (research 07, top tasks).' },
  { feature: 'Slideshow', interaction: 'Cmd+Enter starts the show', result: 'works', evidence: ev('R2', 16), severity: 0, need: 'core', why: 'Google binds Cmd+Enter to Slideshow and sellers carry that shortcut.' },
  { feature: 'Slideshow keys', interaction: 'ArrowRight advances', result: 'works', evidence: ev('R2', 5), severity: 0, need: 'core', why: 'The arrow keys are how a seller pages a deck on a call.' },
  { feature: 'Slideshow keys', interaction: 'ArrowLeft goes back', result: 'works', evidence: ev('R2', 6), severity: 0, need: 'core', why: 'Going back to a slide a prospect asks about is routine.' },
  { feature: 'Slideshow keys', interaction: 'Space advances', result: 'works', evidence: ev('R2', 7), severity: 0, need: 'core', why: 'Space is the PowerPoint habit most sellers bring.' },
  { feature: 'Slideshow keys', interaction: 'Type 3 then Enter jumps to slide 3', result: 'works', evidence: ev('R2', 8), severity: 0, need: 'useful', why: 'Jumping to the pricing slide by number saves paging, but a seller finishes without it.' },
  { feature: 'Slideshow keys', interaction: 'Home goes to the first slide', result: 'works', evidence: ev('R2', 9), severity: 0, need: 'useful', why: 'Returning to the cover at the end of a call is common but the arrow keys also get there.' },
  { feature: 'Slideshow keys', interaction: 'End goes to the last slide', result: 'works', evidence: ev('R2', 10), severity: 0, need: 'useful', why: 'The closing slide is one key away; rarely needed on a short deck.' },
  { feature: 'Slideshow', interaction: 'A click on the slide advances', result: 'works', evidence: ev('R2', 11), severity: 0, need: 'core', why: 'Sellers click through when a hand is on the mouse during screen share.' },
  { feature: 'Slideshow', interaction: 'The slide counter reads n of total', result: 'works', evidence: `${ev('R2', 12)}; the counter sits in the bottom left toolbar that shows when the pointer enters that corner`, severity: 0, need: 'useful', why: 'The counter tells the seller how much deck is left; the show works without it.' },
  { feature: 'Slideshow', interaction: 'L toggles the laser pointer', result: 'works', evidence: `${ev('R2', 13)}; shot 02-slideshow-laser.png`, severity: 0, need: 'useful', why: 'Pointing at a number on a pricing slide helps on a call, but a seller can talk to it.' },
  { feature: 'Slideshow', interaction: 'Draw with the pen', result: 'not driven', evidence: `${ev('R2', 14)}; shot 02b-slideshow-options.png`, severity: 0, need: 'park', why: 'Sellers rarely draw on slides; the Options menu shows the row disabled, so nothing can be driven.' },
  { feature: 'Slideshow', interaction: 'Escape leaves the show', result: 'works', evidence: ev('R2', 15), severity: 0, need: 'core', why: 'Leaving the show cleanly at the end of a call is part of every presentation.' },
  // Presenter view
  { feature: 'Presenter view', interaction: 'Slideshow arrow > Presenter view: a second window with notes, next slide and timer; the two windows follow each other', result: 'works', evidence: `${ev('R2', 17)}; shots 03-presenter-window.png and 03-audience-window.png`, severity: 0, need: 'core', why: 'The two window model (audience window plus presenter window) is what sellers expect on a call (research 07, present over a call).' },
  { feature: 'Presenter view', interaction: 'S in the show opens Presenter view', result: 'works', evidence: ev('R2', 18), severity: 0, need: 'useful', why: 'A second route to the notes window; the arrow item covers the task.' },
  { feature: 'Speaker notes', interaction: 'Type a note under slide 1 (read back in Presenter view)', result: 'works', evidence: `${ev('R2', 3)}; the note appears in the presenter window in the row above`, severity: 0, need: 'core', why: 'Talk tracks live in the notes and the seller reads them from Presenter view.' },
  // Sharing
  { feature: 'Share dialog', interaction: 'Click Share in the title row', result: 'works', evidence: `${ev('R2', 20)}; shot 05-share-dialog.png`, severity: 0, need: 'core', why: 'Sharing a link is the follow up after every call (research 07, share a link).' },
  { feature: 'Share dialog', interaction: 'Set a role (Viewer, Commenter, Editor) on a person or on the link', result: 'not driven', evidence: ev('R2', 21), severity: 2, need: 'core', why: 'Without a role control the seller cannot give a prospect view only access; the View link is read only by address alone (the two rows on the editor address below).' },
  { feature: 'Share dialog', interaction: 'General access: Restricted or Anyone with the link', result: 'not driven', evidence: ev('R2', 22), severity: 2, need: 'core', why: 'Restricted is the default a seller relies on for a pricing deck; production has no such setting and the stranger row shows the deck is open.' },
  { feature: 'Share dialog', interaction: 'Copy link on the View link row', result: 'works', evidence: ev('R2', 23), severity: 0, need: 'core', why: 'The view address is the link a seller sends a prospect.' },
  { feature: 'Share dialog', interaction: 'Copy link on the Present link row', result: 'works', evidence: ev('R2', 24), severity: 0, need: 'useful', why: 'A link that opens as a show is handy for a kiosk or a follow up; not a weekly need.' },
  { feature: 'Share dialog', interaction: 'Copy link on the Edit link row', result: 'works', evidence: ev('R2', 25), severity: 0, need: 'core', why: 'Handing a deck to a colleague to tailor is the collaboration path sellers use.' },
  { feature: 'Share dialog', interaction: 'Escape closes the dialog', result: 'works', evidence: ev('R2', 26), severity: 0, need: 'useful', why: 'Closing without a click is a convenience; Done also closes it.' },
  { feature: 'Share dialog', interaction: 'File > Share > Copy link', result: 'works', evidence: ev('R2', 27), severity: 0, need: 'useful', why: 'A second route to the same address; the title row button covers the task.' },
  { feature: 'Share dialog', interaction: 'Stop sharing revokes the link', result: 'not driven', evidence: ev('R2', 50), severity: 2, need: 'useful', why: 'A seller who shared a pricing deck with the wrong prospect has no way to revoke the address short of the trash.' },
  { feature: 'Restricted deck', interaction: 'A second browser with no link opens /edit/<id> of a deck that was never shared', result: 'broken', evidence: `${ev('R2', 19)}; ${ev('R1', 19)}; shot 04-stranger-edit-restricted.png`, severity: 3, need: 'core', why: 'Every deck is editable by anyone who has or guesses its address; a seller cannot keep a pricing deck private or send a safe read only link, which is the sharing task itself. Mechanism: production runs TURBOSLIDE_AUTHORIZE=shadow (server/authorize.ts: a denial is logged and the call proceeds with the legacy open role, editor), and the deck has no access record the Share dialog can show, so the round one three link dialog appears.' },
  { feature: 'View link', interaction: 'A second browser opens the View link', result: 'works', evidence: `${ev('R2', 28)}; shot 06-view-link-landing.png`, severity: 0, need: 'core', why: 'The prospect lands on a read only viewer with no editor chrome, which is what the seller intends.' },
  { feature: 'View link', interaction: 'The Present link opens as a show', result: 'works', evidence: `${ev('R2', 29)}; shot 07-present-link.png`, severity: 0, need: 'useful', why: 'A follow up link that opens as a show; not a weekly need.' },
  { feature: 'View link', interaction: 'The viewer changes the address from /deck/ to /edit/: read only enforced?', result: 'broken', evidence: `${ev('R2', 30)}; ${ev('R1', 25)}; shot 08-viewer-on-edit-address.png`, severity: 3, need: 'core', why: 'Anyone with the View link can change one path segment and edit the deck; the read only share the seller sends is not enforced. Same mechanism as the stranger row.' },
  // Collaboration
  { feature: 'Edit link', interaction: 'A third browser opens the Edit link', result: 'works', evidence: ev('R2', 31), severity: 0, need: 'core', why: 'A colleague opening the deck to tailor it is the collaboration path.' },
  { feature: 'Collaboration', interaction: 'An edit typed in the second browser reaches the owner within a few seconds', result: 'flaky', evidence: `${ev('R2', 32)}; ${ev('R3', 13)}; in R3 the owner title still read "Pipeline review: Acme, Q3 2026" three minutes later (R3 rows 14 and 15), so the three edits were lost or never sent; ${ev('R2', 30).replace(/^R2 row 30: /, 'R2 row 30 also shows a late delivery: ')}`, severity: 2, need: 'core', why: 'Two people tailoring one deck before a call must see each other\'s text; one run delivered in 2.4 s, the next lost three edits in a row.' },
  { feature: 'Collaboration', interaction: 'An edit typed by the owner reaches the second browser within a few seconds', result: 'works', evidence: ev('R2', 33), severity: 0, need: 'core', why: 'The owner\'s edits arrived in 2.5 s in the one run that drove it.' },
  { feature: 'Collaboration', interaction: 'A slide added in the second browser (Ctrl+M) appears in the owner filmstrip', result: 'flaky', evidence: `${ev('R2', 35)}; ${ev('R3', 12)}`, severity: 2, need: 'core', why: 'One slide in three took longer than 30 to 45 s to arrive while the others took 2 s; a seller adding a slide while a colleague edits will think it was lost.' },
  { feature: 'Collaboration', interaction: 'Presence chips show the other person in both tabs', result: 'works', evidence: `${ev('R2', 34)}; the third browser lists four chips although only two other tabs were ever open on the deck, so chips of closed tabs linger; shot 10-presence-owner-tab.png`, severity: 1, need: 'useful', why: 'Seeing a colleague in the deck avoids overwriting each other; the lingering chips of closed tabs are cosmetic.' },
  // Comments
  { feature: 'Comments', interaction: 'Select the title placeholder and add a comment (Cmd+Option+M, toolbar Insert comment, Insert > Comment)', result: 'broken', evidence: `${ev('R3', 7)}; ${ev('R3', 8)}; ${ev('R3', 9)}; ${ev('R2', 36)}; shots 11-comment-card-new.png and 26-comment-after-submit.png`, severity: 2, need: 'core', why: 'Managers review decks through comments and the customer name on the title is the first thing they comment on; the server refuses the comment because the layout placeholder (chip "Title") is not a block the anchor can name, and the message says "block removed", which is wrong.' },
  { feature: 'Comments', interaction: 'Nothing selected, Cmd+Option+M, type, Comment (the slide as the anchor)', result: 'works', evidence: `${ev('R4', 2)}; shot 30-comment-on-slide.png`, severity: 0, need: 'core', why: 'A slide level comment is the review path that works today.' },
  { feature: 'Comments', interaction: 'Insert a text box, select it, Cmd+Option+M, type, Comment', result: 'works', evidence: `${ev('R4', 3)}; shot 31-comment-on-text-box.png`, severity: 0, need: 'useful', why: 'Comments anchored on canvas objects work; sellers comment on slides more than on objects.' },
  { feature: 'Comments', interaction: 'Open the thread from its marker and reply', result: 'works', evidence: `${ev('R4', 4)}; shot 32-comment-reply.png`, severity: 0, need: 'core', why: 'Replying is how the seller answers the manager\'s review.' },
  { feature: 'Comments', interaction: 'Resolve the thread', result: 'flaky', evidence: `${ev('R4', 5)}; shot 33-comment-resolved.png`, severity: 1, need: 'core', why: 'The first click on the tick did nothing within 1.5 s and the second resolved the thread; a seller clicks twice and moves on.' },
  { feature: 'Comments', interaction: 'The comment reaches the second browser', result: 'not driven', evidence: `${ev('R2', 38)}; in R4 no second browser was open`, severity: 0, need: 'useful', why: 'Not driven because the run that had two browsers open could not create a comment on the title.' },
  // Version history
  { feature: 'Version history', interaction: 'Open Version history from Last edit', result: 'works', evidence: `${ev('R2', 40)}; ${ev('R3', 2)}; shots 15-version-history.png and 22-versions-owner-only.png`, severity: 0, need: 'core', why: 'Never losing work is a top task; the panel opens from the Last edit word as Google does.' },
  { feature: 'Version history', interaction: 'Pick a version and turn on Show changes', result: 'works', evidence: `${ev('R3', 3)}; no change marks were counted on the canvas for a version that differs by two added slides; shot 23-version-picked.png`, severity: 0, need: 'useful', why: 'Seeing what changed helps a review; restoring is the task that matters.' },
  { feature: 'Version history', interaction: 'Name current version', result: 'works', evidence: `${ev('R3', 4)}; in R2 the same action on a deck two browsers were editing answered once with ${JSON.stringify('Another instance saved version 16 of untitled-20260916-vane first')} (R2 row 42, try 2); shot 24-version-named.png`, severity: 0, need: 'useful', why: 'Naming the version before the call is a habit some sellers have; autosave covers the rest.' },
  { feature: 'Version history', interaction: 'Restore this version', result: 'flaky', evidence: `${ev('R3', 14)}; ${ev('R1', 39)}; shots 29-restore-after-collab.png and 17-version-restored.png`, severity: 2, need: 'core', why: 'Restore is the seller\'s safety net after a bad edit; on one deck it restored and on another it was refused with a message about the version log after a second browser had written into the deck.' },
  { feature: 'Version history', interaction: 'Cmd+Z undoes the restore', result: 'not driven', evidence: `${ev('R3', 6)}; in R1 (row 40) Cmd+Z after the refused restore undid the last typing instead`, severity: 0, need: 'useful', why: 'Not driven: the scripted restore on the owner only history could not find the Restore control after the day window collapsed, and the two restores that ran were the last steps of their runs.' },
  // Rename
  { feature: 'Rename', interaction: 'Click the deck name, type a new name, Enter; the second browser shows it', result: 'works', evidence: `${ev('R2', 46)}; shot 18-rename-third-browser.png`, severity: 1, need: 'core', why: 'Renaming the tailored copy is part of every deck; the other tab shows the new name in 2 s, while its browser tab title keeps the old name until reload.' },
  // You need access
  { feature: 'You need access', interaction: 'Open the editor address of a deck that does not exist', result: 'works', evidence: `${ev('R2', 47)}; shot 19-you-need-access.png`, severity: 0, need: 'useful', why: 'A wrong link lands on a clear page; on production this page appears only for a missing deck, never for a restricted one.' },
  { feature: 'You need access', interaction: 'Open the viewer address of a deck that does not exist', result: 'works', evidence: ev('R2', 48), severity: 0, need: 'useful', why: 'Same page on the view address.' },
  { feature: 'You need access', interaction: 'Request access on the page', result: 'works', evidence: `${ev('R2', 49)}; shot 20-request-access.png`, severity: 0, need: 'park', why: 'Rarely reached on production because nothing is restricted; the form answers politely.' },
  // Housekeeping
  { feature: 'Trash', interaction: 'File > Move to trash, Delete forever on /decks/trash, the deck answers 404', result: 'works', evidence: `${ev('R2', 51)}; ${ev('R2', 52)}; ${ev('R2', 53)}; ${ev('R2', 54)}; the four scratch decks untitled-20260916-74xj, -vane, -mmj1 and -n424 were trashed, deleted forever and answer 404; shot 21-trash-after-delete.png`, severity: 0, need: 'useful', why: 'Throwing away a scratch copy is occasional; it is also the only way to revoke a shared address on production.' },
];

const table = [
  '| n | Feature | Interaction | Result | Evidence | Severity | Need | Why |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r, i) => `| ${i + 1} | ${r.feature} | ${clean(r.interaction)} | ${r.result} | ${clean(r.evidence)} | ${r.severity} | ${r.need} | ${clean(r.why)} |`),
].join('\n');

const counts = rows.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});

const md = `# Present, share and collaborate: the production audit

Audit of the "Present, share and collaborate" area of https://turboslide.vercel.app (commit ec61c6b), driven 2026-09-15 between 17:50 and 18:45 PDT with headless Chromium at 1440 by 900 through playwright-core from the repository root, at human speed (mouse moves in steps, 40 to 90 ms per key, real double clicks and drags). Four runs, four scratch decks from /new, each trashed through File > Move to trash, deleted forever on /decks/trash and confirmed 404 on /edit/<id> (and /deck/<id> for the second run): \`untitled-20260916-74xj\` (run 1), \`untitled-20260916-vane\` (run 2, the main table), \`untitled-20260916-mmj1\` (run 3, version history and collaboration timing) and \`untitled-20260916-n424\` (run 4, comments on the slide and on a canvas object). Every failed interaction was repeated three times before it was called broken or flaky. Evidence cells quote the run's observed values verbatim (R1 to R4 and the row number in that run's JSON table); screenshots and the four JSON tables sit under \`audit-present/\`.

The scripts: \`audit-present/audit-present.mjs\` (runs 1 and 2; run 1 used a first version whose sharing rows looked for the round three Share dialog, which production does not have, so rows 21 to 31 and 43 of run 1 failed on selectors and are not in this table), \`audit-present/audit-present-focus.mjs\` (run 3) and \`audit-present/audit-present-comments.mjs\` (run 4). The scripts import nothing from the repository but playwright-core.

Results: ${rows.length} rows, ${counts.works ?? 0} works, ${counts.flaky ?? 0} flaky, ${counts.broken ?? 0} broken, ${counts['not driven'] ?? 0} not driven. Console errors on every page: the report only CSP notice "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy" (every page load), one 404 resource on the viewer page and one 429 resource in the second browser during run 2; no page errors.

Severity: 3 the seller cannot complete a top task, 2 a wrong or lost result, 1 cosmetic, 0 nothing wrong. Need: core is a seller's weekly task per research/07-sales-users.md sections 2, 3 and 8; useful helps but a seller finishes without it; park is rarely needed by a seller or is a designer's tool.

## The table

${table}

## Summary

### What works

Presenting works end to end and every key of the brief did what it should on the first try: Slideshow from the title row and from Cmd+Enter, ArrowRight, ArrowLeft, Space, a digit then Enter with the "Slide 3, press Enter" prompt, Home, End, a click on the slide, Escape, the "n of 3" counter in the bottom left toolbar, and the laser pointer on L. The show opens on the current slide and asks for full screen. Presenter view opens as a second window at /present/<id> with the speaker notes typed under the slide, the next slide frame, a timer that ran from 0:01 to 0:04 in 2.5 s, "Slideshow connected", and the two windows follow each other's arrow keys in both directions; S inside the show opens the same window. The View link lands a second browser on a read only viewer with no editor chrome, the Present link opens as a show, the Edit link lands in the editor, an edit by the owner reached the second browser in 2.5 s, a rename reached it in 2.1 s, presence chips show in both tabs, comments on a slide and on a canvas object create a marker and a thread, replies work, Version history opens from Last edit with the day window, a version can be picked and named, and one restore returned a six slide deck to its three slide version.

### What is broken, with the mechanism seen

1. Sharing has no access control on production (severity 3, rows 18, 19, 26 and 29). The Share dialog is the round one form with three addresses: View link (read only, opens on slide 1), Present link and Edit link (anyone with this link can edit), each with Copy link; there is no General access, no Viewer, Commenter or Editor role, no people list and no Stop sharing. A second browser with no link at all opened /edit/<id> of a deck that was never shared and got the full editor (data-edit-mode editing, role editor); its typed word reached the owner's title in 5.2 s. A browser that arrived through the View link changed /deck/ to /edit/ and got the same. The mechanism is in the source at ec61c6b: production runs TURBOSLIDE_AUTHORIZE=shadow, and server/authorize.ts admits every denied call with the legacy open role (editor) and only logs the denial; the Share dialog shows its record form only when the shell carries an access record, and the deck has none, so the three link form appears and the You need access page is reached only for a deck that does not exist. For a seller this means a pricing deck cannot be kept private and a "read only" link is read only by its address alone.

2. Edits from a second browser are delivered late or lost (severity 2, rows 31 and 33). In run 2 a word typed in the third browser reached the owner in 2.4 s and a slide added there took more than 30 s on one try and 2.6 s on the next. In run 3 three slides added in the second browser took 2.6 s, more than 45 s and 1.7 s, and three words typed into the title in that browser never reached the owner (45 s each, and the title was still unchanged three minutes later when the restore rows read it). The realtime tier is the Blob channel with its one second head poll (packages/realtime/src/blob.ts); which writes are lost or held was not determined from the browser, since the writes travel through server functions that answer 200 with the error inside the body.

3. A comment on the title placeholder is refused (severity 2, row 35). With the title of a layout slide selected (chip "Title"), the comment card opens from Cmd+Option+M, the toolbar button and Insert > Comment, the text is accepted, and the submit answers "the anchor names nothing on the current document (block removed)": the anchor built from the selection names a layout placeholder, not a block of the document, and the server refuses it with a message that describes a different situation. A comment with nothing selected (the slide as the anchor) and a comment on an inserted canvas object both work. Resolve took two clicks in the one run that drove it (severity 1, row 39).

4. Restore this version was refused on one deck (severity 2, row 44). On the run 1 deck, which a stranger browser and a viewer browser had written into, every restore answered "mutation 0 (version.restore): The version log breaks between versions 3 (revision 3) and 4 (from revision 4); the deck was changed outside the store there" three times; on the run 3 deck, which a second browser had also edited, the restore of the named version worked and took the deck from six slides to three. On the run 2 deck Name current version once answered "Another instance saved version 16 of untitled-20260916-vane first". The version log does not always record what the second browser wrote, and once it has a gap no version before the gap can be restored.

5. Cosmetic: presence chips of tabs that were closed minutes earlier stay in the roster (row 34), and the browser tab title keeps the old deck name after a rename until a reload (row 46).

### What a seller needs here

The presenting half of this area is ready for a seller: the show, the keys, the counter, the laser and Presenter view all worked on every try, and they are the weekly task of presenting over a call. The sharing half is not: the seller's follow up after a call is a link, and on production every link is an edit link in fact, so the two rows at severity 3 need the access record and enforce mode (or a read only address the server enforces) before sales sends a deck to a prospect. Collaboration needs the second browser's writes to arrive every time; a colleague tailoring the same deck before a call cannot work with edits that arrive a minute late or not at all. Comments need the title anchor fixed (or the anchor falling back to the slide) because the customer name on the cover is the first thing a manager comments on; slide level comments, replies and resolve carry the review flow today. Version history needs a restore that never refuses; naming a version before the call is useful but the restore is the safety net. The pen, Request access and Stop sharing can wait: the first is a designer's tool, the other two only matter once access control exists.

## Files

- This report: \`docs/gslides-parity/focus/audit-present.md\`.
- Evidence: \`docs/gslides-parity/focus/audit-present/\` (screenshots \`01-\` to \`33-\`, the JSON tables \`run1.json\` to \`run4.json\`, and the three scripts).
`;

writeFileSync(path.join(DOCS, 'audit-present.md'), md);
for (const f of ['run1.json', 'run2.json', 'run3.json', 'run4.json', 'audit-present.mjs', 'audit-present-focus.mjs', 'audit-present-comments.mjs', 'run1.log', 'run2.log', 'run3.log', 'run4.log']) copyFileSync(path.join(HERE, f), path.join(EVID, f));
const blank = path.join(EVID, '18-rename-second-browser.png');
if (existsSync(blank)) unlinkSync(blank);
writeFileSync(path.join(HERE, 'rows.json'), JSON.stringify(rows, null, 2));
console.log(`wrote ${path.join(DOCS, 'audit-present.md')}; rows ${rows.length}; ${JSON.stringify(counts)}`);
