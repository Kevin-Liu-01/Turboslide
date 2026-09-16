Run: https://turboslide-ho9rltx7u-kl01s-projects.vercel.app (deployment), 2026-09-15T22:39:40.792Z to 2026-09-15T22:45:59.696Z. Baseline: https://turboslide.vercel.app, 2026-09-15T11:02:02.345Z.

| Check | Row | Value | Ceiling | Verdict | Baseline (production, day 0) |
| ----- | --- | ----- | ------- | ------- | ---------------------------- |
| routes | / cold ttfb | 135.72 ms | 200 ms (ceiling) | ok | 119.45 ms ok |
| routes | / cold fcp | 416 ms | reported | info | 364 ms |
| routes | / cold lcp | 616 ms | 700 ms (ceiling) | ok | 440 ms ok |
| routes | / cold ready | 1263 ms | 700 ms (ceiling) | MISS | 486.5 ms ok |
| routes | / cold js decoded | 2618507 bytes | 2000000 bytes (ceiling) | MISS | 2235742 bytes MISS |
| routes | / cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | / cold longest animation frame | 184 ms | 150 ms (ceiling) | MISS | 127 ms ok |
| routes | / cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | / cold dom nodes (after GC; 531 live elements) | 624 count | reported | info | no row |
| routes | / cold images before ready (decoded) | 14830 bytes | reported | info | 14830 bytes |
| routes | / warm ttfb | 166.07 ms | 150 ms (ceiling) | MISS | 113.82 ms ok |
| routes | / warm fcp | 432 ms | reported | info | 188 ms |
| routes | / warm lcp | 432 ms | 400 ms (ceiling) | MISS | 188 ms ok |
| routes | / warm ready | 1061 ms | 400 ms (ceiling) | MISS | 264.2 ms ok |
| routes | / warm js decoded | 2618507 bytes | 2000000 bytes (ceiling) | MISS | 2235742 bytes MISS |
| routes | / warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | / warm longest animation frame | 151 ms | 150 ms (ceiling) | MISS | 0 ms ok |
| routes | / warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | / warm dom nodes (after GC; 531 live elements) | 624 count | reported | info | no row |
| routes | / warm images before ready (decoded) | 14830 bytes | reported | info | 14830 bytes |
| routes | /home cold ttfb | 47.18 ms | 150 ms (ceiling) | ok | 47.55 ms ok |
| routes | /home cold fcp | 372 ms | reported | info | 164 ms |
| routes | /home cold lcp | 392 ms | 800 ms (ceiling) | ok | 164 ms ok |
| routes | /home cold ready | 268.3 ms | 800 ms (ceiling) | ok | 110.2 ms ok |
| routes | /home cold js decoded | 796784 bytes | 600000 bytes (ceiling) | MISS | 678814 bytes MISS |
| routes | /home cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /home cold longest animation frame | 197 ms | 150 ms (ceiling) | MISS | 76 ms ok |
| routes | /home cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /home cold dom nodes (after GC; 783 live elements) | 1017 count | reported | info | 1017 count |
| routes | /home cold images before ready (decoded) | 40468 bytes | 500000 bytes (ceiling) | ok | 40468 bytes ok |
| routes | /home cold images after a full scroll (decoded) | 486017 bytes | 2000000 bytes (ceiling) | ok | 486017 bytes ok |
| routes | /home cold lcp element is the plate text or the twin (DIV.ts-product-hero-twin) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| routes | /home warm ttfb | 22.18 ms | 100 ms (ceiling) | ok | 16.15 ms ok |
| routes | /home warm fcp | 200 ms | reported | info | 84 ms |
| routes | /home warm lcp | 200 ms | 400 ms (ceiling) | ok | 84 ms ok |
| routes | /home warm ready | 94.7 ms | 400 ms (ceiling) | ok | 38.8 ms ok |
| routes | /home warm js decoded | 796784 bytes | 600000 bytes (ceiling) | MISS | 678814 bytes MISS |
| routes | /home warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /home warm longest animation frame | 94 ms | 150 ms (ceiling) | ok | 0 ms ok |
| routes | /home warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /home warm dom nodes (after GC; 783 live elements) | 1017 count | reported | info | 1017 count |
| routes | /home warm images before ready (decoded) | 40468 bytes | 500000 bytes (ceiling) | ok | 68020 bytes ok |
| routes | /home warm images after a full scroll (decoded) | 486017 bytes | 2000000 bytes (ceiling) | ok | 486017 bytes ok |
| routes | /home warm lcp element is the plate text or the twin (DIV.ts-product-hero-twin) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| routes | /new cold ttfb | 154.58 ms | 200 ms (ceiling) | ok | 135.08 ms ok |
| routes | /new cold fcp | 528 ms | 400 ms (ceiling) | MISS | 236 ms ok |
| routes | /new cold lcp | 636 ms | 700 ms (ceiling) | ok | 268 ms ok |
| routes | /new cold ready | 1053.3 ms | 700 ms (ceiling) | MISS | 342 ms ok |
| routes | /new cold js decoded | 2618507 bytes | 2000000 bytes (ceiling) | MISS | 2235742 bytes MISS |
| routes | /new cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /new cold longest animation frame | 264 ms | 150 ms (ceiling) | MISS | 68 ms ok |
| routes | /new cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /new cold dom nodes (after GC; 531 live elements) | 624 count | reported | info | no row |
| routes | /new cold images before ready (decoded) | 14830 bytes | reported | info | 14830 bytes |
| routes | /new cold first byte, worst cold sample (the fresh instance gate) | 155.88 ms | 1200 ms (ceiling) | ok | no row |
| routes | /new warm ttfb | 148.64 ms | 150 ms (ceiling) | ok | 114.23 ms ok |
| routes | /new warm fcp | 396 ms | 250 ms (ceiling) | MISS | 188 ms ok |
| routes | /new warm lcp | 396 ms | 400 ms (ceiling) | ok | 188 ms ok |
| routes | /new warm ready | 1020.5 ms | 400 ms (ceiling) | MISS | 255.3 ms ok |
| routes | /new warm js decoded | 2618507 bytes | 2000000 bytes (ceiling) | MISS | 2235742 bytes MISS |
| routes | /new warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /new warm longest animation frame | 142 ms | 150 ms (ceiling) | ok | 0 ms ok |
| routes | /new warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /new warm dom nodes (after GC; 531 live elements) | 624 count | reported | info | no row |
| routes | /new warm images before ready (decoded) | 14830 bytes | reported | info | 14830 bytes |
| routes | /decks cold ttfb | 262.2 ms | 400 ms (ceiling) | ok | 456.46 ms MISS |
| routes | /decks cold fcp | 868 ms | reported | info | 572 ms |
| routes | /decks cold lcp | 1072 ms | 1000 ms (ceiling) | MISS | 1252 ms MISS |
| routes | /decks cold ready | 959.1 ms | 1000 ms (ceiling) | ok | 610.4 ms ok |
| routes | /decks cold js decoded | 2534608 bytes | 600000 bytes (ceiling) | MISS | 2152912 bytes MISS |
| routes | /decks cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks cold longest animation frame | 328 ms | 150 ms (ceiling) | MISS | 87 ms ok |
| routes | /decks cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /decks cold dom nodes (after GC; 417 live elements) | 584 count | reported | info | no row |
| routes | /decks cold images with 28 cards (decoded) | 1149 bytes | 1500000 bytes (ceiling) | ok | no row |
| routes | /decks cold first byte, worst cold sample (the fresh instance gate) | 365.45 ms | 1200 ms (ceiling) | ok | no row |
| routes | /decks warm ttfb | 248.72 ms | 300 ms (ceiling) | ok | 2600.84 ms MISS |
| routes | /decks warm fcp | 516 ms | reported | info | 2708 ms |
| routes | /decks warm lcp | 724 ms | 600 ms (ceiling) | MISS | 2776 ms MISS |
| routes | /decks warm ready | 658 ms | 600 ms (ceiling) | MISS | 2732.7 ms MISS |
| routes | /decks warm js decoded | 2534608 bytes | 600000 bytes (ceiling) | MISS | 2152912 bytes MISS |
| routes | /decks warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks warm longest animation frame | 162 ms | 150 ms (ceiling) | MISS | 68 ms ok |
| routes | /decks warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /decks warm dom nodes (after GC; 417 live elements) | 583 count | reported | info | no row |
| routes | /decks warm images with 28 cards (decoded) | 1149 bytes | 1500000 bytes (ceiling) | ok | no row |
| routes | /decks/trash cold ttfb | 495.36 ms | 400 ms (ceiling) | MISS | 348.19 ms ok |
| routes | /decks/trash cold fcp | 696 ms | reported | info | 508 ms |
| routes | /decks/trash cold lcp | 696 ms | 1000 ms (ceiling) | ok | 508 ms ok |
| routes | /decks/trash cold ready | 854 ms | 1000 ms (ceiling) | ok | 610.6 ms ok |
| routes | /decks/trash cold js decoded | 780118 bytes | 600000 bytes (ceiling) | MISS | 633457 bytes MISS |
| routes | /decks/trash cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks/trash cold longest animation frame | 207 ms | 150 ms (ceiling) | MISS | 161 ms MISS |
| routes | /decks/trash cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /decks/trash cold dom nodes (after GC; 127 live elements) | 164 count | reported | info | no row |
| routes | /decks/trash cold images before ready (decoded) | 957 bytes | reported | info | 957 bytes |
| routes | /decks/trash warm ttfb | 310.48 ms | 300 ms (ceiling) | MISS | 376.49 ms MISS |
| routes | /decks/trash warm fcp | 404 ms | reported | info | 464 ms |
| routes | /decks/trash warm lcp | 404 ms | 600 ms (ceiling) | ok | 464 ms ok |
| routes | /decks/trash warm ready | 683.1 ms | 600 ms (ceiling) | MISS | 476.4 ms ok |
| routes | /decks/trash warm js decoded | 780118 bytes | 600000 bytes (ceiling) | MISS | 633457 bytes MISS |
| routes | /decks/trash warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks/trash warm longest animation frame | 105 ms | 150 ms (ceiling) | ok | 53 ms ok |
| routes | /decks/trash warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /decks/trash warm dom nodes (after GC; 127 live elements) | 164 count | reported | info | no row |
| routes | /decks/trash warm images before ready (decoded) | 957 bytes | reported | info | 957 bytes |
| routes | /deck/gt-brand cold ttfb | 418.56 ms | 500 ms (ceiling) | ok | 278.69 ms ok |
| routes | /deck/gt-brand cold fcp | 908 ms | reported | info | 412 ms |
| routes | /deck/gt-brand cold lcp | 908 ms | 600 ms (ceiling) | MISS | 412 ms ok |
| routes | /deck/gt-brand cold ready | 1319.3 ms | 800 ms (ceiling) | MISS | 506.7 ms ok |
| routes | /deck/gt-brand cold js decoded | 2133011 bytes | 1000000 bytes (ceiling) | MISS | 1844701 bytes MISS |
| routes | /deck/gt-brand cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /deck/gt-brand cold longest animation frame | 278 ms | 150 ms (ceiling) | MISS | 93 ms ok |
| routes | /deck/gt-brand cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /deck/gt-brand cold dom nodes (after GC; 1621 live elements) | 2522 count | 1500 count (ceiling) | MISS | no row |
| routes | /deck/gt-brand cold images before ready (decoded) | 516149 bytes | reported | info | 516149 bytes |
| routes | /deck/gt-brand warm ttfb | 318.72 ms | 400 ms (ceiling) | ok | 271.98 ms ok |
| routes | /deck/gt-brand warm fcp | 592 ms | reported | info | 376 ms |
| routes | /deck/gt-brand warm lcp | 592 ms | 400 ms (ceiling) | MISS | 452 ms MISS |
| routes | /deck/gt-brand warm ready | 994.2 ms | 600 ms (ceiling) | MISS | 504.9 ms ok |
| routes | /deck/gt-brand warm js decoded | 2133011 bytes | 1000000 bytes (ceiling) | MISS | 1844701 bytes MISS |
| routes | /deck/gt-brand warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /deck/gt-brand warm longest animation frame | 97 ms | 150 ms (ceiling) | ok | 0 ms ok |
| routes | /deck/gt-brand warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /deck/gt-brand warm dom nodes (after GC; 1621 live elements) | 2521 count | 1500 count (ceiling) | MISS | no row |
| routes | /deck/gt-brand warm images before ready (decoded) | 516149 bytes | reported | info | 516149 bytes |
| routes | /edit/gt-brand cold ttfb | 394.43 ms | 200 ms (ceiling) | MISS | 581.69 ms MISS |
| routes | /edit/gt-brand cold fcp | 652 ms | 400 ms (ceiling) | MISS | 676 ms MISS |
| routes | /edit/gt-brand cold lcp | 1592 ms | 1200 ms (ceiling) | MISS | 988 ms ok |
| routes | /edit/gt-brand cold ready | 1451.8 ms | 1200 ms (ceiling) | MISS | 935.4 ms ok |
| routes | /edit/gt-brand cold js decoded | 2621251 bytes | 2000000 bytes (ceiling) | MISS | 2238488 bytes MISS |
| routes | /edit/gt-brand cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /edit/gt-brand cold longest animation frame | 371 ms | 150 ms (ceiling) | MISS | 92 ms ok |
| routes | /edit/gt-brand cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /edit/gt-brand cold dom nodes (after GC; 1624 live elements) | 2231 count | 1500 count (ceiling) | MISS | no row |
| routes | /edit/gt-brand cold images before ready (decoded) | 14830 bytes | reported | info | 14830 bytes |
| routes | /edit/gt-brand warm ttfb | 311.84 ms | 150 ms (ceiling) | MISS | 263.92 ms MISS |
| routes | /edit/gt-brand warm fcp | 700 ms | 250 ms (ceiling) | MISS | 332 ms MISS |
| routes | /edit/gt-brand warm lcp | 1440 ms | 700 ms (ceiling) | MISS | 596 ms ok |
| routes | /edit/gt-brand warm ready | 1397.8 ms | 700 ms (ceiling) | MISS | 570.4 ms ok |
| routes | /edit/gt-brand warm js decoded | 2621251 bytes | 2000000 bytes (ceiling) | MISS | 2238488 bytes MISS |
| routes | /edit/gt-brand warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /edit/gt-brand warm longest animation frame | 295 ms | 150 ms (ceiling) | MISS | 90 ms ok |
| routes | /edit/gt-brand warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /edit/gt-brand warm dom nodes (after GC; 1624 live elements) | 2231 count | 1500 count (ceiling) | MISS | no row |
| routes | /edit/gt-brand warm images before ready (decoded) | 530022 bytes | reported | info | 530022 bytes |
| routes | /present/gt-brand cold ttfb | 261.54 ms | 200 ms (ceiling) | MISS | 296.3 ms MISS |
| routes | /present/gt-brand cold fcp | 648 ms | reported | info | 412 ms |
| routes | /present/gt-brand cold lcp | 648 ms | 800 ms (ceiling) | ok | 412 ms ok |
| routes | /present/gt-brand cold ready | 955 ms | 800 ms (ceiling) | MISS | 583.3 ms ok |
| routes | /present/gt-brand cold js decoded | 1581218 bytes | 1200000 bytes (ceiling) | MISS | 1365710 bytes MISS |
| routes | /present/gt-brand cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /present/gt-brand cold longest animation frame | 189 ms | 150 ms (ceiling) | MISS | 69 ms ok |
| routes | /present/gt-brand cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /present/gt-brand cold dom nodes (after GC; 318 live elements) | 386 count | reported | info | no row |
| routes | /present/gt-brand cold images before ready (decoded) | 14830 bytes | reported | info | 14830 bytes |
| routes | /present/gt-brand warm ttfb | 309.26 ms | 150 ms (ceiling) | MISS | 366.93 ms MISS |
| routes | /present/gt-brand warm fcp | 408 ms | reported | info | 420 ms |
| routes | /present/gt-brand warm lcp | 408 ms | 500 ms (ceiling) | ok | 420 ms ok |
| routes | /present/gt-brand warm ready | 778.6 ms | 500 ms (ceiling) | MISS | 572.6 ms MISS |
| routes | /present/gt-brand warm js decoded | 1581218 bytes | 1200000 bytes (ceiling) | MISS | 1365710 bytes MISS |
| routes | /present/gt-brand warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /present/gt-brand warm longest animation frame | 131 ms | 150 ms (ceiling) | ok | 0 ms ok |
| routes | /present/gt-brand warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | 0 ratio ok |
| routes | /present/gt-brand warm dom nodes (after GC; 318 live elements) | 386 count | reported | info | no row |
| routes | /present/gt-brand warm images before ready (decoded) | 14830 bytes | reported | info | 14830 bytes |
| routes | /decks/templates cold ttfb | 44.13 ms | 400 ms (ceiling) | ok | no row |
| routes | /decks/templates cold fcp | 216 ms | reported | info | no row |
| routes | /decks/templates cold lcp | 216 ms | 1000 ms (ceiling) | ok | no row |
| routes | /decks/templates cold ready | 151.1 ms | 1000 ms (ceiling) | ok | no row |
| routes | /decks/templates cold js decoded | 1217895 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks/templates cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks/templates cold longest animation frame | 111 ms | 150 ms (ceiling) | ok | no row |
| routes | /decks/templates cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | no row |
| routes | /decks/templates cold dom nodes (after GC; 248 live elements) | 381 count | reported | info | no row |
| routes | /decks/templates cold images before ready (decoded) | 0 bytes | reported | info | no row |
| routes | /decks/templates warm ttfb | 17.24 ms | 300 ms (ceiling) | ok | no row |
| routes | /decks/templates warm fcp | 132 ms | reported | info | no row |
| routes | /decks/templates warm lcp | 132 ms | 600 ms (ceiling) | ok | no row |
| routes | /decks/templates warm ready | 72.2 ms | 600 ms (ceiling) | ok | no row |
| routes | /decks/templates warm js decoded | 1217895 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks/templates warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /decks/templates warm longest animation frame | 84 ms | 150 ms (ceiling) | ok | no row |
| routes | /decks/templates warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | no row |
| routes | /decks/templates warm dom nodes (after GC; 248 live elements) | 381 count | reported | info | no row |
| routes | /decks/templates warm images before ready (decoded) | 0 bytes | reported | info | no row |
| routes | /help/training cold ttfb | 64.31 ms | 150 ms (ceiling) | ok | no row |
| routes | /help/training cold fcp | 504 ms | reported | info | no row |
| routes | /help/training cold lcp | 504 ms | 700 ms (ceiling) | ok | no row |
| routes | /help/training cold ready | 223.4 ms | 700 ms (ceiling) | ok | no row |
| routes | /help/training cold js decoded | 725831 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/training cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/training cold longest animation frame | 255 ms | 150 ms (ceiling) | MISS | no row |
| routes | /help/training cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | no row |
| routes | /help/training cold dom nodes (after GC; 1217 live elements) | 1939 count | reported | info | no row |
| routes | /help/training cold images before ready (decoded) | 0 bytes | reported | info | no row |
| routes | /help/training warm ttfb | 14.83 ms | 100 ms (ceiling) | ok | no row |
| routes | /help/training warm fcp | 144 ms | reported | info | no row |
| routes | /help/training warm lcp | 144 ms | 400 ms (ceiling) | ok | no row |
| routes | /help/training warm ready | 51 ms | 400 ms (ceiling) | ok | no row |
| routes | /help/training warm js decoded | 725831 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/training warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/training warm longest animation frame | 87 ms | 150 ms (ceiling) | ok | no row |
| routes | /help/training warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | no row |
| routes | /help/training warm dom nodes (after GC; 1217 live elements) | 1939 count | reported | info | no row |
| routes | /help/training warm images before ready (decoded) | 0 bytes | reported | info | no row |
| routes | /help/updates cold ttfb | 63.3 ms | 150 ms (ceiling) | ok | no row |
| routes | /help/updates cold fcp | 316 ms | reported | info | no row |
| routes | /help/updates cold lcp | 316 ms | 700 ms (ceiling) | ok | no row |
| routes | /help/updates cold ready | 224.3 ms | 700 ms (ceiling) | ok | no row |
| routes | /help/updates cold js decoded | 725817 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/updates cold largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/updates cold longest animation frame | 105 ms | 150 ms (ceiling) | ok | no row |
| routes | /help/updates cold cls | 0 ratio | 0.05 ratio (ceiling) | ok | no row |
| routes | /help/updates cold dom nodes (after GC; 193 live elements) | 340 count | reported | info | no row |
| routes | /help/updates cold images before ready (decoded) | 0 bytes | reported | info | no row |
| routes | /help/updates warm ttfb | 21.4 ms | 100 ms (ceiling) | ok | no row |
| routes | /help/updates warm fcp | 152 ms | reported | info | no row |
| routes | /help/updates warm lcp | 152 ms | 400 ms (ceiling) | ok | no row |
| routes | /help/updates warm ready | 52.6 ms | 400 ms (ceiling) | ok | no row |
| routes | /help/updates warm js decoded | 725817 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/updates warm largest js (index-yTIYsqrw.js) | 725671 bytes | 600000 bytes (ceiling) | MISS | no row |
| routes | /help/updates warm longest animation frame | 96 ms | 150 ms (ceiling) | ok | no row |
| routes | /help/updates warm cls | 0 ratio | 0.05 ratio (ceiling) | ok | no row |
| routes | /help/updates warm dom nodes (after GC; 193 live elements) | 340 count | reported | info | no row |
| routes | /help/updates warm images before ready (decoded) | 0 bytes | reported | info | no row |
| transitions | decks->edit (in page) | 613.3 ms | 500 ms (ceiling) | MISS | 94.4 ms ok |
| transitions | back (wall) | 186 ms | 100 ms (ceiling) | MISS | 30 ms ok |
| transitions | edit->decks (in page) | 33.8 ms | 400 ms (ceiling) | ok | 15.3 ms ok |
| transitions | trash->decks (in page) | 12.9 ms | 400 ms (ceiling) | ok | 5.7 ms ok |
| transitions | home->new (wall, document navigation, no prerender activation) | 833 ms | 300 ms (ceiling) | MISS | 302 ms MISS |
| transitions | slideChange (in page, painted frame) | 44.7 ms | 50 ms (ceiling) | ok | 10.6 ms ok |
| transitions | slideshow (in page, painted frame) | 51 ms | 50 ms (ceiling) | MISS | 20.2 ms ok |
| transitions | layoutGrid (in page, painted frame) | 39.4 ms | 50 ms (ceiling) | ok | 9.8 ms ok |
| filmstrip | first pass longest frame | 100.3 ms | 100 ms (ceiling) | MISS | 25.5 ms ok |
| filmstrip | steady passes p95 frame | 16.7 ms | 20 ms (ceiling) | ok | 10.2 ms ok |
| filmstrip | steady passes longest frame | 90.8 ms | 50 ms (ceiling) | MISS | 17 ms ok |
| filmstrip | steady passes fps | 101.27 fps | 50 fps (floor) | ok | 119.52 fps ok |
| filmstrip | dom nodes with 85 cards (after GC; 2103 live elements) | 2984 count | 1500 count (ceiling) | MISS | no row |
| idle | server function calls per minute (60 s window) | 2 count | 4 count (ceiling) | ok | 2 count ok |
| idle | stream connections per minute (/api/decks/*/stream, 60 s window) | 0 count | 2 count (ceiling) | ok | 0 count ok |
| twins | twins re-fetched on the second visit (of 16; 0 revalidated with a 304) | 0 count | 0 count (ceiling) | ok | 0 count ok |
| cdn | /favicon.ico second request is a CDN hit (status 200, x-vercel-cache HIT) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| cdn | /icon.svg second request is a CDN hit (status 200, x-vercel-cache HIT) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| cdn | /apple-touch-icon.png second request is a CDN hit (status 200, x-vercel-cache HIT) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| cdn | /manifest.webmanifest second request is a CDN hit (status 200, x-vercel-cache HIT) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| cdn | /icons/icon-512.png second request is a CDN hit (status 200, x-vercel-cache HIT) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| cdn | /og/turboslide.png second request is a CDN hit (status 200, x-vercel-cache HIT) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| cdn | /home second request is a CDN hit (status 200, x-vercel-cache HIT) | 1 flag | 1 flag (flag) | ok | 1 flag ok |
| vitals | field INP p75 on /edit from /api/vitals (no samples yet) | n/a | reported | info | no row |
| write | text burst: last keyup to local commit | -1047.3 ms | 450 ms (ceiling) | ok | no row |
| write | text burst: last keyup to saved revision | 4217.5 ms | 1000 ms (ceiling) | MISS | no row |
| write | text burst: last keyup to acknowledgement (reported) | -1047.3 ms | reported | info | no row |
| write | text burst: current card clone carries the text after the commit | 1128.9 ms | 50 ms (ceiling) | MISS | no row |
| write | new slide: pointerdown to painted card | 31.5 ms | 16 ms (ceiling) | MISS | no row |
| write | new slide: pointerdown to saved revision | 2284.9 ms | 500 ms (ceiling) | MISS | no row |
| write | new slide: pointerdown to acknowledgement (reported) | 796.7 ms | reported | info | no row |
| write | capture of the edited slide after the save (status 404, cached ?) | 339 ms | reported | info | no row |
| write | home card of the scratch deck on the next /decks visit | n/a | 2500 ms (ceiling) | MISS | no row |

99 of 201 asserted rows met (the baseline read 114 of 151).
