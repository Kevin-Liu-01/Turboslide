# The assist and the tailoring pass

Written by hand for the product round (docs/PRODUCT.md sections 5 and 6); the action contracts beside it (`actions.md` in `turboslide-api`) are generated.

## What a seller sees

- The Assist button sits in the title row between the collaborators and the comments glyph (`title.assist`, Cmd+J), and Tools > Assist opens the same panel (`tools.assist`). The panel's first line says where the slide text goes: to the assistant's model provider under General Translation's account, and nothing is written until a card is accepted.
- With a slide selected the panel shows three starter cards: Tailor for a customer (`panel.assist.starter.tailor`, opens the dialog below and calls no model), Make it shorter (`panel.assist.starter.shorter`) and Write speaker notes (`panel.assist.starter.notes`). Anything else goes in the box (`panel.assist.prompt`, Enter sends, `panel.assist.send`).
- A card (`panel.assist.card.<n>`) carries the sentence, the before and after per text with the changed words marked (`panel.assist.card.<n>.row.<slideId>`), Accept, Dismiss and Change the ask. Accept writes one revision labelled "Assist: <sentence>" and the snackbar carries Undo; Cmd+Z is the step back. An ask that fits neither shape draws one sentence and writes nothing.
- Search the menus (Option+/) understands a seller's words (hide slide, rename the customer, logo, bigger text, talk track, send a pdf) and, when nothing matches, offers "Ask the assistant: <phrase>" (`palette.finder.assist.ask`), which opens the panel with the phrase.
- A commenter or a viewer sees the panel disabled with "Commenters and editors can use the assistant" (`panel.assist.viewer`). When the deployment's switch is off the panel reads "The assistant is off on this Turboslide" (`panel.assist.off`).

## What an agent calls

Two actions on every transport, and the tailoring pass:

- `assist.propose { intent, prompt, slideIds?, baseRevision }` reads the named slides (the deck's first slide when none) and answers `{ cards, sentence?, readSlides? }`. A card is `{ id, intent, sentence, rows, mutations, deckId, baseRevision, expiresAt, signature }`, signed by the server and valid for ten minutes; nothing is stored between propose and accept. `intent` is `shorter`, `notes` or `ask` (the model resolves the ask to one of the two shapes or answers nothing).
- `assist.accept { card, baseRevision }` writes the card as one revision by the author Assistant. The server verifies the signature, the expiry and the deck; a card whose texts changed since is refused with "The slide changed while this was written; ask again" (409). Over HTTP the route is `POST /api/assist?deck=<id>` with `{ action, input }` and the bearer, or `/api/actions/assist.propose` and `/api/actions/assist.accept`; over MCP the tools are `deck_assist_propose` and `deck_assist_accept`, with the `deck_assist` prompt.
- `deck.tailor { replacements?: [{ from, to }], logo?: { assetId, replaceAlt? }, skip?, baseRevision }` renames the customer in every visible text and the notes (case insensitive, never inside a link address or the GT mark), swaps every picture whose alt text names the old customer for the asset, and skips the named slides, as one write. The CLI is `turboslide tailor --replace Acme=Globex --skip pricing-internal`, the MCP tool `deck_tailor`. A logo without `replaceAlt` is refused until the brand kit gives the deck a logo slot.

In the page, `window.turboslide.studio.invoke('assist.propose', input)` posts to the route with the page's session, and `invoke('assist.accept', { card })` commits through the editor's own history, so the write is one undo step of the person's stack. `invoke('deck.tailor', input)` commits one entry labelled "Tailor for <name>".

## The guardrails

- The server never writes on a propose; the seller's Accept is the only path to a write.
- A card holds only text rewrites of the named slide (`text.replace` or `slide.set` on a text field) or its speaker notes; an answer of any other shape earns no card, and an answer that names a text the slide lacks is dropped.
- Slide text is data: it travels in the user turn inside a fenced block and never in the system block, and a sentence on a slide that reads like an instruction produces a card about that slide's words or nothing.
- The mode: `TURBOSLIDE_ASSIST=fixture` answers canned cards (the preview's gate runs), `off` is the switch, and without the provider key the route answers 503 with "The assistant is not set up on this Turboslide yet".
- Every write the assistant makes carries `ext.assist = { at, runId, card }` on the block or the slide; the seller's next edit of that block clears it.
