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
