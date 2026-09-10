# Fixture deck

Two slides in the SPEC 4.2 document shape, for the studio's viewer before the
imported GT deck (decks/gt-brand) exists: a title slide and one content slide
(the deck's slide 53, the copy rule). The studio serves this deck for a
missing deck id and marks the page as a fixture; apps/studio/e2e/viewer.spec.ts
runs against it when gt-brand is absent. No assets: the fixture has no
full-picture slide.
