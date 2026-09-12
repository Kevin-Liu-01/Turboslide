# The verifier's drive of the final preview

Preview `turboslide-8hol2vfyy` (the tree of the editor depth commit), `node scripts/editor-depth-drive.mjs` at 2026-09-11 21:13 PDT (2026-09-12 04:13 UTC), stopped by the verifier after the tenth row because every row after the text insert could only time out on the broken deck (docs/EDITOR-DEPTH-STATUS.md section 9). The rows as the script wrote them:

| Step                                                           | Result | Numbers                                                                                                       |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| viewer head reads Turboslide, list in thumbnail density        | pass   | head "Turboslide", density thumbs, 85 thumbnail cards, settled 4138 ms, status slot "GT brand deck" (4168 ms) |
| create a deck from the GT template on /decks                   | pass   | deck editor-depth-09120413, 85 slides, created in 4691 ms (8811 ms)                                           |
| open the editor on content-rule                                | pass   | layout cols, r0, 3 blocks (1605 ms)                                                                           |
| insert a box primitive from the Insert menu                    | pass   | block box (box), r0 to r1 (3573 ms)                                                                           |
| insert a shape primitive from the Insert menu                  | pass   | block shape (shape), r1 to r2 (3801 ms)                                                                       |
| insert a text primitive from the Insert menu                   | fail   | page.waitForFunction: Timeout 120000ms exceeded. (120084 ms)                                                  |
| switch the slide to the freeform layout                        | fail   | page.waitForFunction: Timeout 120000ms exceeded. (120061 ms)                                                  |
| drag a block, guides show, one snapped mutation                | fail   | page.waitForFunction: Timeout 120000ms exceeded. (120898 ms)                                                  |
| resize a block from a corner handle                            | fail   | page.waitForFunction: Target page, context or browser has been closed (7991 ms)                               |
| align two blocks on an edge                                    | fail   | page.evaluate: Target page, context or browser has been closed (2 ms)                                         |
| palette color then custom color with the off-palette lint mark | fail   | keyboard.press: Target page, context or browser has been closed (0 ms)                                        |
| typography size, weight (cap mark) and alignment               | fail   | locator.boundingBox: Target page, context or browser has been closed (1 ms)                                   |
| drag a block into the other column on a cols slide             | fail   | page.evaluate: Target page, context or browser has been closed (0 ms)                                         |
| tooltips on three controls                                     | fail   | page.evaluate: Target page, context or browser has been closed (0 ms)                                         |
| export perfect PPTX from the Export menu (sync)                | fail   | locator.click: Target page, context or browser has been closed (1 ms)                                         |
| download the deck bundle from the Export menu                  | fail   | locator.click: Target page, context or browser has been closed (0 ms)                                         |
| upload the bundle back on /decks as a new deck                 | fail   | no bundle to upload (0 ms)                                                                                    |
| create a blank deck, download and upload its bundle            | fail   | page.goto: Target page, context or browser has been closed (1 ms)                                             |
| open /deck/<id>?present=1                                      | fail   | page.goto: Target page, context or browser has been closed (0 ms)                                             |
