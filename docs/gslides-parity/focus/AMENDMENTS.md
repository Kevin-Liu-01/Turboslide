# Focus round amendments

Binding above `docs/FOCUS.md` where they differ. Written by the orchestrator from Kevin's messages during the build.

## A1. The click model of the canvas (2026-09-16 11:25 PDT)

Kevin, verbatim, with a screenshot of a two object selection of text boxes: "moving selection areas should be a lot easier, like when you click and drag in the selection area, it shoulddrag, and double clicking is what goes inside".

The verifier's pass 1 saw the same mechanism from the other side (F4, F5): a single click at the centre of a text box opens the text session at once, so a drag that starts inside the box selects text instead of moving the box, a right click inside shows no object menu and a Shift click adds nothing.

The rule, for every object kind including text boxes and the title, subtitle and body placeholders:

1. One click on an object selects it: the ring, the eight handles, the rotation handle and the chip appear; no caret is placed and no text session opens. A click on an object inside a multiple selection keeps the selection.
2. Pointer down anywhere inside a selected object's area followed by a move drags the object; when several objects are selected, the whole selection moves together from a pointer down inside any of them. The border is not the only handle for a move. The threshold and the snapping are the existing move gesture's.
3. Double click on a text object opens the text session with the caret at the double click position; a double click inside an open session selects the word, as Google does. Double click on a picture opens crop, on a shape with text opens its text, on a group selects the member.
4. Typing a printable character while a text object is selected and no session is open starts the session with the whole text selected, so the first character replaces the text (Google's behaviour); Enter starts the session with the caret at the end; Escape inside a session returns to the selected object, and a second Escape clears the selection.
5. A placeholder ("Click to add title") follows the same rule; its prompt reads "Double click to add title" or "Click, then type" is not adopted: the prompt text stays Google's and the matrix row records the two step entry.
6. Right click on any object, inside or outside a session, opens the object's menu.

Matrix consequences (B4 owns the rows, B2 the text session, B3 the move gesture): the rows `text.title.single-click`, `text.textbox.click-caret` and every row that asserted a caret after one click now assert a selection with handles and no caret; new rows `text.title.double-click-enters`, `text.textbox.drag-inside-moves`, `arrange.multi.drag-inside-moves-all`, `text.selected.typing-replaces`, `text.selected.enter-appends`, `text.session.escape-twice`; the walk's text battery enters every session by double click. The audits' rows that passed on the one click model are re-driven under this rule.

Where FOCUS.md section 2.3 says "single click" for entering text, this amendment wins.

## A2. The second click on a selected text object (2026-10-02)

Kevin, verbatim, about the editor on production: "for textboxes, clicking it shouldnt go stragiht itno typing but once i click again, i should be able to write".

Measured on production the same day: one click on a new deck's title placeholder selects it with no caret (A1 rule 1 holds), and a slow second click (900 ms later) leaves it selected with no caret, so the only ways into the text were the double click, Enter and a typed character.

The rule, binding above A1 rule 3 for a click on a selected text object:

1. One click on an unselected text object (a text box, a placeholder or grammar field such as the cover title and subtitle, a shape with a label) selects it as A1 rule 1 says: no caret, no session.
2. A second click on that object while it is the one selected object, a press and a release with less movement than the move gesture's threshold at any time after the first click, opens the text session with the caret at the release point: the run under the pointer and the character nearest the point, the start of an empty placeholder, the end of the first run on the box's padding. A press on the selected object that moves past the threshold still moves it (A1 rule 2) and opens nothing. The release disarms the drag before the session opens, writes nothing and creates no undo entry, and leaving the session without typing writes nothing either (a list's key, a figure's label and a quote's note are drawn as `<b data-run>`, and the session no longer reads that frame as a bold mark); the session draws the ring and the chip as every session does.
3. The double click keeps A1 rule 3, selected or not: a fast double click on an unselected text object selects it and opens the session once with the caret at the point, and a double click on a selected one gives the same caret (its first press opens the session, and the browser's word selection and the session's whole address selection do not run for its second press) or, on a shape's label and a diagram member's text, the word at the point. A double click inside a session that was already open stays the browser's word selection.
4. Unchanged: a picture's second click does not crop (crop stays on the double click); a table cell's tap places the caret as before; a member of a group not yet entered keeps the group's selection on the second click (the double click enters it, and a click on the entered member opens its text); a press inside a multiple selection keeps the selection; Shift and Cmd clicks toggle; Paint format paints; Commenting and Viewing mode open nothing; the printable key and Enter entries of A1 rule 4 stay as they are.

The click on the ring's frame edge is the selection's border and keeps the selection, as in Google Slides. Code: `objectPressPlan` (`open`, packages/viewer/src/Selection.tsx), `openOnSecondClick`, `onMouseDown` and `onDoubleClickCapture` (packages/viewer/src/Editor.tsx); matrix row `text.click.second-click-caret`.
