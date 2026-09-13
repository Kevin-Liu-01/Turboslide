# Export fixture deck

The deck the Google Slides parity round exports in both PPTX modes and to PDF and text
(gslides-parity SPEC 14.5): one of every object the round added. Seven slides, no assets.

| Slide | What it carries |
| --- | --- |
| `title` | A title slide with speaker notes |
| `breaks` | Two multiline paragraphs (paragraph breaks) and two run slide links (`#s/table`, `#last`) |
| `table` | A 4 by 4 table with a header row, aligned columns and a 1 px border |
| `numbered` | A numbered ruled statement list (`plain.numbered`) |
| `links` | A freeform slide with block links: a box to `first`, a text box to the `table` slide, a shape to a URL |
| `skipped` | A skipped statement slide with notes; absent from every export unless `includeSkipped` |
| `prompt` | A Title only layout with an empty heading, the empty placeholder that renders as a prompt in the editor and as nothing elsewhere |

`deck.json` sets `defaults.appearance` to `light` and `defaults.counter` to `on`.
`turboslide validate decks/fixture/gslides` exits 0; `copy/empty-placeholder` fires once on
`prompt`, by design.
