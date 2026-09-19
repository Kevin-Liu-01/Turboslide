// The chrome (docs/RETURN.md section 4, section 5 `chrome.*` with the driver `probe --core`):
// the Slideshow split button read from pixels (one box, the divider, no notch), its hover, its
// click, the chevron's menu and its alignment, Enter, Space, ArrowDown and Tab, its ARIA, its
// collapse at 900 px; the eleven seams read from a 1x screenshot in both appearances at 1440 and
// at 900; the toolbar dividers; the right cluster's gaps and heights; the comments glyph as a
// toggle. The pixel reads are the toolkit's port of audit-chrome.mjs (RETURN.md 4.4): a computed
// style can ask for a token the pixels never show (audit-chrome row 9), so these rows read the
// screenshot. The chrome feature is unparkable (RETURN.md rule 2): a red row here blocks the ship.

export const NAME = 'chrome';
export const IDS = [
  'chrome.split.one-box',
  'chrome.split.hover-no-inversion',
  'chrome.split.click-show',
  'chrome.split.chevron-menu-aligned',
  'chrome.split.enter-chevron',
  'chrome.split.enter-label',
  'chrome.split.space-both',
  'chrome.split.arrow-down-label',
  'chrome.split.tab-order',
  'chrome.split.aria',
  'chrome.split.collapse-900',
  'chrome.separators.once',
  'chrome.separators.toolbar-dividers',
  'chrome.cluster.gaps-heights',
  'chrome.comments-glyph.toggle',
];

const VIEWPORT = { width: 1440, height: 900 };

export async function run(t) {
  const { page } = t;
  const T = t.deck.titleSlide;
  await t.clickCard(T);
  await t.clearAll();

  /** The viewport boxes and computed edges of the right cluster's controls. */
  const cluster = () =>
    page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          right: r.right,
          radius: cs.borderRadius,
          background: cs.backgroundColor,
          color: cs.color,
          borderLeft: `${cs.borderLeftWidth} ${cs.borderLeftColor}`,
          border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
          opacity: cs.opacity,
          visible:
            el.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
        };
      };
      return {
        viewport: window.innerWidth,
        row: read('.ts-title-row'),
        presence: read('[data-control="title.presence"]'),
        more: read('[data-control="presence.more"]'),
        commentsSlot: read('[data-control="title.comments.slot"]'),
        comments: read('[data-control="title.comments"]'),
        inboxSlot: read('[data-control="title.inbox.slot"]'),
        inbox: read('[data-control="title.inbox"]'),
        split: read('[data-control="present.split"]'),
        open: read('[data-control="present.open"]'),
        arrow: read('[data-control="present.arrow"]'),
        label: read('[data-control="present.open"] .pt-lb'),
        share: read('[data-control="share.open"]'),
        theme: document.documentElement.getAttribute('data-theme'),
      };
    });
  const themeNow = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  /** View > Appearance > light or dark through the product (the row itself is the view area's). */
  const setChrome = async (appearance) => {
    if ((await themeNow()) === appearance) return true;
    const r = await t.reachRow('view', 'view.appearance', `view.appearance.${appearance}`);
    if (!r.present) return false;
    await t.menuPath('view', 'view.appearance', `view.appearance.${appearance}`);
    return (
      (await t.pollUntil(themeNow, (x) => x === appearance, 5000).catch(themeNow)) === appearance
    );
  };
  /** Both appearances, starting from the current one and coming back to it. */
  const eachAppearance = async (fn) => {
    const start = await themeNow();
    const other = start === 'dark' ? 'light' : 'dark';
    const out = {};
    out[start] = await fn(start);
    const switched = await setChrome(other);
    out[other] = switched
      ? await fn(other)
      : { error: `View > Appearance > ${other} not reachable` };
    await setChrome(start);
    return out;
  };
  /** A paper like pixel: within 40 of the title row's background on every channel. */
  const rgbOf = (css) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const closeTo = (a, b, tol = 40) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol);

  await t.step(
    'chrome.split.one-box',
    'read the Slideshow control from a 1x screenshot, both appearances',
    'one 32 px box with 8 px outer corners, halves with no corners, no notch under the top edge, one 1 px divider at mid height reading on the ink ground at 1.7:1 or more',
    async () => {
      await t.clearAll();
      const result = await eachAppearance(async (appearance) => {
        const c = await cluster();
        if (!c.split || !c.open || !c.arrow) return { error: 'no split button in the title row' };
        const img = await t.shotPixels();
        const seam = t.splitSeamFromShot(img, c.open, c.arrow);
        const rowBg = rgbOf(c.row?.background);
        const paperLike = (run) => closeTo(hexToRgb(run.color), rowBg);
        const ground = rgbOf(c.split.background) ?? hexToRgb(seam.mid[0]?.color ?? '#000000');
        const thin = seam.mid.filter((r) => r.thickness <= 3);
        const divider = thin.length === 1 ? thin[0] : null;
        const dividerContrast = divider
          ? Number(t.contrastRgb(hexToRgb(divider.color), ground).toFixed(2))
          : null;
        const notch1 = seam.top1.filter((r) => r.thickness <= 8 && paperLike(r)).length;
        const notch2 = seam.top2.filter((r) => r.thickness <= 8 && paperLike(r)).length;
        return {
          appearance,
          box: `${Math.round(c.split.w)}x${Math.round(c.split.h)} radius ${c.split.radius}`,
          halves: `open ${Math.round(c.open.h)} radius ${c.open.radius}; arrow ${Math.round(c.arrow.w)}x${Math.round(c.arrow.h)} radius ${c.arrow.radius}`,
          mid: seam.mid.map((r) => `${r.color}x${r.thickness}`).join(' '),
          top1: seam.top1.map((r) => `${r.color}x${r.thickness}`).join(' '),
          top2: seam.top2.map((r) => `${r.color}x${r.thickness}`).join(' '),
          divider: divider
            ? `${divider.color} ${divider.thickness} px at ${dividerContrast}:1`
            : `${thin.length} thin runs`,
          notch: notch1 + notch2,
          ok:
            Math.round(c.split.h) === 32 &&
            /^8px/.test(c.split.radius) &&
            c.open.radius === '0px' &&
            c.arrow.radius === '0px' &&
            divider !== null &&
            divider.thickness === 1 &&
            dividerContrast !== null &&
            dividerContrast >= 1.7 &&
            notch1 === 0 &&
            notch2 === 0,
        };
      });
      const both = Object.values(result);
      return {
        ok: both.length === 2 && both.every((r) => r.ok === true),
        observed: both
          .map((r) =>
            r.error
              ? r.error
              : `${r.appearance}: box ${r.box}; halves ${r.halves}; mid ${r.mid}; divider ${r.divider}; top1 ${r.top1}; top2 ${r.top2}; paper notches ${r.notch}`,
          )
          .join(' | '),
      };
    },
  );

  await t.step(
    'chrome.split.hover-no-inversion',
    'hover the Slideshow half, then the chevron half',
    'the hovered half is shaded with --pt-plate-on-ink and nothing inverts',
    async () => {
      await t.clearAll();
      const rest = await cluster();
      const token = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--pt-plate-on-ink').trim(),
      );
      await page.mouse.move(rest.open.x + rest.open.w / 2, rest.open.y + rest.open.h / 2);
      await t.sleep(300);
      const overOpen = await cluster();
      await page.mouse.move(rest.arrow.x + rest.arrow.w / 2, rest.arrow.y + rest.arrow.h / 2);
      await t.sleep(300);
      const overArrow = await cluster();
      await page.mouse.move(rest.row.x + 20, rest.row.y + rest.row.h + 200);
      await t.sleep(200);
      const shaded = (before, after) =>
        after.background !== before.background && after.background !== 'rgba(0, 0, 0, 0)';
      const same = (a, b) => a.background === b.background && a.color === b.color;
      const noInversion = (half) =>
        half.color === rest.open.color && half.background !== rest.split.background;
      const ok =
        shaded(rest.open, overOpen.open) &&
        noInversion(overOpen.open) &&
        same(overOpen.arrow, rest.arrow) &&
        overOpen.split.background === rest.split.background &&
        shaded(rest.arrow, overArrow.arrow) &&
        noInversion(overArrow.arrow) &&
        same(overArrow.open, rest.open) &&
        overArrow.split.background === rest.split.background;
      return {
        ok,
        observed: `token --pt-plate-on-ink "${token}"; wrapper ${rest.split.background}; label half ${rest.open.background}/${rest.open.color} -> hovered ${overOpen.open.background}/${overOpen.open.color} (chevron then ${overOpen.arrow.background}); chevron half ${rest.arrow.background} -> hovered ${overArrow.arrow.background}/${overArrow.arrow.color} (label then ${overArrow.open.background})`,
      };
    },
  );

  const showOpen = () => t.has('[data-control="present.show"]');
  const leaveShow = async () => {
    await t.press('Escape');
    await page
      .locator('[data-control="present.show"]')
      .waitFor({ state: 'detached', timeout: 8000 })
      .catch(() => undefined);
    await t.sleep(300);
  };
  await t.step(
    'chrome.split.click-show',
    'click the Slideshow half, Escape',
    'the show opens from the current slide; Escape leaves',
    async () => {
      await t.clearAll();
      await t.clickControl('present.open');
      const open = await t.pollUntil(showOpen, (x) => x, 8000).catch(showOpen);
      const slide = await page.evaluate(
        () =>
          document
            .querySelector(
              '.ts-stagewrap.is-present .pt-slide:not(.is-leaving), .pt-viewer.is-present .pt-slide:not(.is-leaving)',
            )
            ?.getAttribute('data-slide-id') ?? null,
      );
      await leaveShow();
      const gone = !(await showOpen());
      return {
        ok: open && gone,
        observed: `show ${open} (slide ${slide ?? 'unread'}); left on Escape ${gone}`,
      };
    },
  );

  const menuFacts = () =>
    page.evaluate(() => {
      const menu = document.getElementById('ts-menu-slideshow');
      const arrow = document.querySelector('[data-control="present.arrow"]');
      const split = document.querySelector('[data-control="present.split"]');
      const r = menu?.getBoundingClientRect();
      return {
        open: menu !== null && menu.getClientRects().length > 0,
        right: r ? Math.round(r.right * 10) / 10 : null,
        left: r ? Math.round(r.left * 10) / 10 : null,
        controlRight: split ? Math.round(split.getBoundingClientRect().right * 10) / 10 : null,
        expanded: arrow?.getAttribute('aria-expanded') ?? null,
        controls: arrow?.getAttribute('aria-controls') ?? null,
        focus:
          document.activeElement?.getAttribute('data-control') ??
          document.activeElement?.tagName.toLowerCase() ??
          null,
        firstRowFocused: document.activeElement?.closest('#ts-menu-slideshow') !== null,
      };
    });
  await t.step(
    'chrome.split.chevron-menu-aligned',
    'click the chevron; read the menu; Escape',
    "the menu's right edge within 1 px of the control's, aria-expanded true and aria-controls naming the mounted menu; Escape closes, aria-controls leaves, focus returns",
    async () => {
      await t.clearAll();
      await t.clickControl('present.arrow');
      const open = await t.pollUntil(menuFacts, (f) => f.open, 5000).catch(menuFacts);
      await t.press('Escape');
      const closed = await t.pollUntil(menuFacts, (f) => !f.open, 5000).catch(menuFacts);
      const aligned =
        open.right !== null &&
        open.controlRight !== null &&
        Math.abs(open.right - open.controlRight) <= 1;
      return {
        ok:
          open.open &&
          aligned &&
          open.expanded === 'true' &&
          open.controls === 'ts-menu-slideshow' &&
          !closed.open &&
          closed.controls === null &&
          closed.focus === 'present.arrow',
        observed: `menu open ${open.open}, x ${open.left} to ${open.right} against the control's right ${open.controlRight} (aligned ${aligned}); aria-expanded ${open.expanded}, aria-controls ${open.controls}; after Escape open ${closed.open}, aria-controls ${closed.controls}, focus ${closed.focus}`,
      };
    },
  );

  /** Focuses a title row control without a click and presses a key, reading defaultPrevented from a window listener. */
  const keyOn = async (control, key) => {
    await page.evaluate((c) => {
      window.__b4Prevented = null;
      const el = document.querySelector(`[data-control="${c}"]`);
      el?.focus();
      window.addEventListener(
        'keydown',
        (e) => {
          if (e.key === (c ? e.key : e.key)) window.__b4Prevented = e.defaultPrevented;
        },
        { once: true },
      );
    }, control);
    await t.sleep(100);
    await page.keyboard.press(key);
    await t.sleep(400);
    return page.evaluate(() => window.__b4Prevented);
  };
  const selectTitle = async () => {
    const head = t.deck.head;
    const block = head ? await t.blockOfRun(head) : null;
    if (!block) return false;
    const info = await t.runInfo(head);
    const { facts } = await t.clickSelect(block, {
      x: info.rect.x + info.rect.w / 2,
      y: info.rect.y + info.rect.h / 2,
    });
    return facts.selected && !facts.editing;
  };

  await t.step(
    'chrome.split.enter-chevron',
    'nothing selected: focus the chevron, Enter; then with the title selected by one click',
    "the menu opens both times and the key's defaultPrevented reads false",
    async () => {
      await t.clearAll();
      const p1 = await keyOn('present.arrow', 'Enter');
      const m1 = await menuFacts();
      await t.press('Escape');
      await t.sleep(300);
      const selected = await selectTitle();
      const p2 = await keyOn('present.arrow', 'Enter');
      const m2 = await menuFacts();
      await t.press('Escape');
      await t.sleep(200);
      await t.clearAll();
      return {
        ok: m1.open && p1 === false && selected && m2.open && p2 === false,
        observed: `nothing selected: menu ${m1.open}, defaultPrevented ${p1}; title selected ${selected}: menu ${m2.open}, defaultPrevented ${p2}`,
      };
    },
  );
  await t.step(
    'chrome.split.enter-label',
    'focus the Slideshow half, Enter',
    'the show opens',
    async () => {
      await t.clearAll();
      const prevented = await keyOn('present.open', 'Enter');
      const open = await t.pollUntil(showOpen, (x) => x, 5000).catch(showOpen);
      if (open) await leaveShow();
      return { ok: open, observed: `show ${open}; defaultPrevented ${prevented}` };
    },
  );
  await t.step(
    'chrome.split.space-both',
    'Space on the chevron; Space on the label',
    'the menu opens; the show opens',
    async () => {
      await t.clearAll();
      await keyOn('present.arrow', 'Space');
      const menu = (await menuFacts()).open;
      await t.press('Escape');
      await t.sleep(300);
      await keyOn('present.open', 'Space');
      const show = await t.pollUntil(showOpen, (x) => x, 5000).catch(showOpen);
      if (show) await leaveShow();
      return { ok: menu && show, observed: `menu on Space ${menu}; show on Space ${show}` };
    },
  );
  await t.step(
    'chrome.split.arrow-down-label',
    'focus the Slideshow half, ArrowDown; Escape',
    'the menu opens with its first row focused; Escape returns focus to the Slideshow half',
    async () => {
      await t.clearAll();
      await keyOn('present.open', 'ArrowDown');
      const m = await menuFacts();
      await t.press('Escape');
      const after = await t.pollUntil(menuFacts, (f) => !f.open, 4000).catch(menuFacts);
      return {
        ok: m.open && m.firstRowFocused && !after.open && after.focus === 'present.open',
        observed: `menu ${m.open}, focus in the menu ${m.firstRowFocused} (${m.focus}); after Escape open ${after.open}, focus ${after.focus}`,
      };
    },
  );
  await t.step(
    'chrome.split.tab-order',
    'focus the Slideshow half, Tab, with nothing selected and with the title selected',
    'the chevron takes the focus both times and the canvas selection does not move',
    async () => {
      await t.clearAll();
      await page.evaluate(() => document.querySelector('[data-control="present.open"]')?.focus());
      await page.keyboard.press('Tab');
      await t.sleep(200);
      const f1 = await page.evaluate(
        () =>
          document.activeElement?.getAttribute('data-control') ??
          document.activeElement?.tagName.toLowerCase(),
      );
      const selected = await selectTitle();
      const chipBefore = await t.chip();
      await page.evaluate(() => document.querySelector('[data-control="present.open"]')?.focus());
      await page.keyboard.press('Tab');
      await t.sleep(200);
      const f2 = await page.evaluate(
        () =>
          document.activeElement?.getAttribute('data-control') ??
          document.activeElement?.tagName.toLowerCase(),
      );
      const chipAfter = await t.chip();
      await t.clearAll();
      return {
        ok:
          f1 === 'present.arrow' && selected && f2 === 'present.arrow' && chipAfter === chipBefore,
        observed: `nothing selected: Tab -> ${f1}; title selected ${selected} (chip "${chipBefore}"): Tab -> ${f2}, chip after "${chipAfter}"`,
      };
    },
  );
  await t.step(
    'chrome.split.aria',
    'read the wrapper and the chevron, closed and open',
    'a group labelled Slideshow; aria-haspopup menu, aria-expanded, aria-controls only while the menu is mounted',
    async () => {
      await t.clearAll();
      const read = () =>
        page.evaluate(() => {
          const split = document.querySelector('[data-control="present.split"]');
          const arrow = document.querySelector('[data-control="present.arrow"]');
          return {
            role: split?.getAttribute('role') ?? null,
            label: split?.getAttribute('aria-label') ?? null,
            haspopup: arrow?.getAttribute('aria-haspopup') ?? null,
            expanded: arrow?.getAttribute('aria-expanded') ?? null,
            controls: arrow?.getAttribute('aria-controls') ?? null,
            mounted: document.getElementById('ts-menu-slideshow') !== null,
          };
        });
      const closed = await read();
      await t.clickControl('present.arrow');
      await t.pollUntil(menuFacts, (f) => f.open, 5000).catch(() => undefined);
      const open = await read();
      await t.press('Escape');
      await t.sleep(300);
      return {
        ok:
          closed.role === 'group' &&
          closed.label === 'Slideshow' &&
          closed.haspopup === 'menu' &&
          closed.expanded === 'false' &&
          closed.controls === null &&
          !closed.mounted &&
          open.expanded === 'true' &&
          open.controls === 'ts-menu-slideshow' &&
          open.mounted,
        observed: `closed ${JSON.stringify(closed)}; open ${JSON.stringify(open)}`,
      };
    },
  );

  await t.step(
    'chrome.split.collapse-900',
    'the viewport at 900 px wide',
    'the word leaves and the control is a 58 px button of two 28 px halves',
    async () => {
      await t.clearAll();
      await page.setViewportSize({ width: 900, height: 900 });
      await t.sleep(700);
      const c = await cluster();
      await page.setViewportSize(VIEWPORT);
      await t.sleep(500);
      const labelGone = !c.label || !c.label.visible || c.label.w === 0;
      return {
        ok:
          c.viewport === 900 &&
          labelGone &&
          t.near(c.split.w, 58, 1) &&
          t.near(c.open.w, 28, 1) &&
          t.near(c.arrow.w, 28, 1),
        observed: `viewport ${c.viewport}; word visible ${!labelGone}; split ${Math.round(c.split.w)} px (label half ${Math.round(c.open.w)}, chevron ${Math.round(c.arrow.w)}); Share ${Math.round(c.share?.w ?? 0)}`,
      };
    },
  );

  /** The seams read from a 1x screenshot at the current viewport, with the Comments panel open. */
  /** The Comments panel open for the right panel seam (the 900 px pass closes it). */
  const ensureCommentsPanel = async () => {
    if (await t.visible('panel.comments')) return true;
    await t.clickControl('title.comments');
    return t
      .pollUntil(
        () => t.visible('panel.comments'),
        (x) => x,
        5000,
      )
      .catch(() => t.visible('panel.comments'));
  };
  const readSeams = async (width) => {
    if (width !== VIEWPORT.width) await page.setViewportSize({ width, height: 900 });
    else await ensureCommentsPanel();
    await t.sleep(600);
    const pts = await t.boundaryPoints();
    const img = await t.shotPixels();
    const seams = t.seamsFromShot(img, pts);
    const hair = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--pt-hair').trim(),
    );
    const out = {};
    for (const [name, seam] of Object.entries(seams)) {
      const thin = seam.runs.filter((r) => r.thickness >= 1 && r.thickness <= 4);
      const hairline = thin.filter((r) => (r.contrastToPrevious ?? 1) >= 1.2);
      const wantNone = name === 'menu bar -> toolbar';
      out[name] = {
        thin: thin.map((r) => `${r.color}x${r.thickness}`).join(' ') || 'none',
        ok: wantNone ? hairline.length === 0 : hairline.length === 1 && hairline[0].thickness === 1,
      };
    }
    if (width !== VIEWPORT.width) await page.setViewportSize(VIEWPORT);
    await t.sleep(400);
    return { hair, seams: out, present: Object.keys(seams) };
  };
  await t.step(
    'chrome.separators.once',
    'read the eleven seams from a 1x screenshot with the Comments panel open and the notes pane present, both appearances at 1440, and the horizontal seams at 900',
    'each seam holds one 1 px run in --pt-hair, or none where the rule says none',
    async () => {
      await t.clearAll();
      await ensureCommentsPanel();
      if (!(await t.has('.pt-viewer.is-editor > .pt-main > .ts-notes-slot'))) {
        await t.menuPath('view', 'view.showSpeakerNotes').catch(() => undefined);
      }
      await t.sleep(400);
      const result = await eachAppearance(async (appearance) => {
        const wide = await readSeams(VIEWPORT.width);
        const narrow = await readSeams(900);
        const failures = [
          ...Object.entries(wide.seams)
            .filter(([, s]) => !s.ok)
            .map(([n, s]) => `1440 ${n}: ${s.thin}`),
          ...Object.entries(narrow.seams)
            .filter(([n, s]) => !s.ok && !/vertical|notes|filmstrip head/.test(n))
            .map(([n, s]) => `900 ${n}: ${s.thin}`),
        ];
        return {
          appearance,
          hair: wide.hair,
          seams: wide.present.length,
          failures,
          wide: wide.seams,
        };
      });
      const both = Object.values(result);
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      return {
        ok:
          both.length === 2 &&
          both.every((r) => !r.error && r.seams >= 10 && r.failures.length === 0),
        observed: both
          .map((r) =>
            r.error
              ? r.error
              : `${r.appearance} (--pt-hair ${r.hair}): ${r.seams} seams read; ${Object.entries(
                  r.wide,
                )
                  .map(([n, s]) => `${n} ${s.thin}`)
                  .join('; ')}; failing ${r.failures.join(' | ') || 'none'}`,
          )
          .join(' || '),
      };
    },
  );

  await t.step(
    'chrome.separators.toolbar-dividers',
    'read the two toolbar dividers',
    '1 by 20 px in --pt-hair with 8 px of space to each neighbour',
    async () => {
      /* the default toolbar (a tail adds its own dividers; the gate run read five with a table
         selected, each 1 by 20 in the hair): the selection is cleared and every divider judged */
      await t.clearAll();
      const facts = await page.evaluate(() => {
        const hair = getComputedStyle(document.documentElement)
          .getPropertyValue('--pt-hair')
          .trim();
        return {
          hair,
          seps: [...document.querySelectorAll('.ts-toolbar .ts-tb-sep')].map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const prev = el.previousElementSibling?.getBoundingClientRect();
            const next = el.nextElementSibling?.getBoundingClientRect();
            return {
              w: Math.round(r.width),
              h: Math.round(r.height),
              background: cs.backgroundColor,
              gapBefore: prev ? Math.round((r.left - prev.right) * 10) / 10 : null,
              gapAfter: next ? Math.round((next.left - r.right) * 10) / 10 : null,
            };
          }),
        };
      });
      /* the token as the sheet declares it: rgba() on a dev server, a hex colour on a built
         deployment, where the CSS minifier writes rgba(242, 242, 240, 0.22) as #f2f2f038 (the
         first preview drive read the divider right and the token unreadable, and failed the row
         on every built deployment; return/build/integrator.md) */
      const tokenRgb = (() => {
        const m = /rgba?\(([\d\s.,]+)\)/.exec(facts.hair);
        if (m) return m[1].split(',').map((v) => Number(v.trim()));
        const hex = /^#([0-9a-f]{3,8})$/i.exec(facts.hair);
        if (!hex) return null;
        const h = hex[1];
        const wide = h.length <= 4 ? [...h].map((c) => c + c).join('') : h;
        const part = (i) => parseInt(wide.slice(i, i + 2), 16);
        return [part(0), part(2), part(4), wide.length === 8 ? part(6) / 255 : 1];
      })();
      const isHair = (bg) => {
        const m = /rgba?\(([\d\s.,]+)\)/.exec(bg);
        if (!m || !tokenRgb) return false;
        const v = m[1].split(',').map((x) => Number(x.trim()));
        return (
          v.slice(0, 3).every((c, i) => Math.abs(c - tokenRgb[i]) <= 2) &&
          Math.abs((v[3] ?? 1) - (tokenRgb[3] ?? 1)) <= 0.02
        );
      };
      const ok =
        facts.seps.length >= 2 &&
        facts.seps.every(
          (s) =>
            s.w === 1 &&
            s.h === 20 &&
            isHair(s.background) &&
            (s.gapBefore ?? 8) >= 7 &&
            (s.gapAfter ?? 8) >= 7,
        );
      return {
        ok,
        observed: `--pt-hair ${facts.hair}; ${facts.seps.length} dividers: ${facts.seps.map((s) => `${s.w}x${s.h} ${s.background}, gaps ${s.gapBefore}/${s.gapAfter}`).join('; ')}`,
      };
    },
  );

  await t.step(
    'chrome.cluster.gaps-heights',
    "read the right cluster's controls",
    'gaps 8 px, inset 12 px, Share, the split button and the comments glyph 32 px tall, both with the 8 px corner, no empty +N box, no inbox slot while the plate is parked',
    async () => {
      await t.clearAll();
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      const c = await cluster();
      const controls = [c.presence, c.commentsSlot, c.inboxSlot, c.split, c.share].filter(
        (x) => x && x.w > 0,
      );
      const gaps = [];
      for (let i = 1; i < controls.length; i += 1)
        gaps.push(Math.round((controls[i].x - controls[i - 1].right) * 10) / 10);
      const inset = Math.round((c.viewport - c.share.right) * 10) / 10;
      const heights = {
        share: Math.round(c.share.h),
        split: Math.round(c.split.h),
        comments: c.comments ? Math.round(c.comments.h) : null,
      };
      const moreHidden =
        !c.more || c.more.w === 0 || Number(c.more.opacity) === 0 || !c.more.visible;
      const inboxCollapsed = !c.inbox && (!c.inboxSlot || c.inboxSlot.w === 0);
      const inboxParked = !(await t.advancedOn()) && !c.inbox;
      const ok =
        gaps.every((g) => Math.abs(g - 8) <= 1) &&
        Math.abs(inset - 12) <= 1 &&
        heights.share === 32 &&
        heights.split === 32 &&
        heights.comments === 32 &&
        /^8px/.test(c.share.radius) &&
        /^8px/.test(c.split.radius) &&
        moreHidden &&
        (!inboxParked || inboxCollapsed);
      return {
        ok,
        observed: `gaps ${gaps.join(', ')}; inset ${inset}; heights ${JSON.stringify(heights)}; corners share ${c.share.radius}, split ${c.split.radius}; +N box ${c.more ? `${Math.round(c.more.w)}x${Math.round(c.more.h)} opacity ${c.more.opacity}` : 'absent'} hidden ${moreHidden}; inbox plate ${c.inbox ? 'drawn' : 'parked'}, slot ${c.inboxSlot ? `${Math.round(c.inboxSlot.w)} px` : 'absent'}${c.share.radius.startsWith('6px') && c.split.radius.startsWith('6px') ? '; note: both corners read 6 px (--pt-radius), the alternative of question 1' : ''}`,
      };
    },
  );

  await t.step(
    'chrome.comments-glyph.toggle',
    'click Show all comments, then again',
    'the panel opens with aria-pressed true; the second click closes it',
    async () => {
      await t.clearAll();
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      await t.clickControl('title.comments');
      const open = await t
        .pollUntil(
          () => t.visible('panel.comments'),
          (x) => x,
          5000,
        )
        .catch(() => false);
      const pressed = await t.attr('[data-control="title.comments"]', 'aria-pressed');
      await t.clickControl('title.comments');
      const closed = await t
        .pollUntil(
          () => t.visible('panel.comments'),
          (x) => !x,
          4000,
        )
        .catch(() => t.visible('panel.comments'));
      const pressedAfter = await t.attr('[data-control="title.comments"]', 'aria-pressed');
      if (closed !== false && (await t.visible('panel.comments.close')))
        await t.clickControl('panel.comments.close');
      return {
        ok: open && pressed === 'true' && closed === false && pressedAfter === 'false',
        observed: `open ${open} (aria-pressed ${pressed}); after the second click open ${closed} (aria-pressed ${pressedAfter})`,
      };
    },
  );
  await t.advancedBack('the chrome rows');
}
