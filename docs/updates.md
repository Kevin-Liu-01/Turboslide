# Updates

The release notes of Turboslide, newest first. An entry names the date, what changed in the default view and where the evidence is; the counts a release passed are in the release note it names and in the README section "What works today", which is rendered from the test matrix and never typed here.

## 2026-09-15, the focus round

The rule this release sets, and every later release keeps: a feature is in the editor's default view only when every one of its interactions works on production and is in the test matrix ([docs/FOCUS.md](FOCUS.md) section 1). The default view is what a seller does weekly: open a deck that exists, duplicate, delete, skip and reorder slides, retype a name and a few numbers, replace a logo or a screenshot, present over a call, and send a PDF or a link.

What changed:

- Tools > Advanced tools. One check row in the Tools menu, off by default and remembered in the browser. Off, the menu bar, the toolbar, the right click menus, Search the menus and the Keyboard shortcuts dialog show the core set and nothing else. On, every parked feature appears in Google's position exactly as before. The parked set, by menu, is FOCUS.md section 3 and the README section "Advanced tools".
- Parked, never deleted. A deck that carries a chart, a table, a diagram, an icon, a material, a code panel, a word art block or a gallery shape still draws it everywhere, and the block can be selected, moved, resized, ordered, aligned, duplicated and deleted through the rows of the default view. The keyboard shortcut of a parked row does nothing while the switch is off. The Font box on the text tail stays visible and disabled with its sentence.
- Shapes. The shape galleries drew every preset as its bounding rectangle, so a seller who picked a callout got a box. Insert > Shape keeps Rectangle, Rounded rectangle and Ellipse, and Insert > Line keeps Line and Arrow, as the minimal set; each is in the default view of a release only when every one of its matrix rows passes, and the rest of the galleries return with the geometry interpreter (FOCUS.md section 4). At the first ship of the round both sit behind Tools > Advanced tools: the verifier's second pass failed 4 of 20 shapes rows and 1 of 5 lines rows on the preview.
- The test matrix. Every interaction of the default view is a row with a stable id in `docs/gslides-parity/focus/core-matrix.json`, driven against the preview and against production at human speed before a release; a row nobody drove is not driven, never passed, and one not driven or failed row keeps its whole feature behind the switch for that release (FOCUS.md section 6). The README section "What works today" is rendered from that file.
- Sharing. A new deck's general access defaults to restricted, the owner alone, and the Share dialog's links grant the viewer, commenter or editor role. Sharing is in the default view only once a stranger and a browser that came by the view link cannot edit on production; until then the PDF is the safe send.
- Fixes to the core set. FOCUS.md section 5 ranks the broken and flaky interactions the production audits of 2026-09-15 found, with the mechanism each audit saw; the release note of the ship lists which passed.
- For agents nothing moves. Every action stays on the CLI, MCP, HTTP and the window API whether or not its menu row is in the default view; `GET /api/agent` lists them all, and the skills document the parked ones as advanced.

The evidence: the seven production audits and their screenshots under `docs/gslides-parity/focus/`, the two judgments beside them, and the build notes under `docs/gslides-parity/focus/build/`.
