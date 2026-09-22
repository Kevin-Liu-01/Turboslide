// The surface rows of the feature gaps audit: the menus and dialogs a seller reaches weekly that
// Turboslide lacks or half has (fonts, video, page setup, print handouts, transitions, spelling,
// find and replace, the shortcuts dialog, slide numbers and footers, publish and embed, PPTX
// import, links to slides, alt text, text fitting, speaker notes, offline, sections). One scratch
// deck from /new, trashed and deleted forever in the finally block.
//   node gaps-surface.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE, EVIDENCE, bind, cleanupDeck, launch, makeTable, newDeck, sleep } from './lib.mjs';

const PPTX = path.join(path.dirname(new URL(import.meta.url).pathname), '01-text.pptx');
const table = makeTable('surface');
const { browser, context, page, consoleErrors } = await launch();
const t = bind(page, table);
let deck = null;
try {
  deck = await newDeck(t);
  table.record(
    'a scratch deck from /new',
    'the address moves to /edit/<id>',
    `${deck.id}; ${page.url().replace(BASE, '')}`,
    /\/edit\//.test(page.url()),
  );
  const X = deck.titleSlide;

  // ---- 1. the Insert menu, default view and with the switch on: video, audio, animation
  await t.step('Insert menu, switch off', 'the default rows; no Video or Audio row', async () => {
    await t.openMenu('insert');
    const rows = await t.menuRows('insert');
    const shot = await t.shot('insert-menu-default');
    await t.closeMenus();
    return {
      ok: rows.length > 0,
      observed: `${rows.map((r) => `${r.id}${r.disabled ? '(disabled)' : ''}`).join(', ')}; ${shot}`,
    };
  });
  await t.step('Tools > Advanced tools on', 'the switch reads on', async () => {
    const on = await t.setAdvanced(true);
    return { ok: on, observed: `advancedTools ${on}` };
  });
  await t.step(
    'Insert > Video and Insert > Audio with the switch on',
    'both rows are Later stubs: drawn disabled with the clause "Not available in Turboslide yet"',
    async () => {
      await t.openMenu('insert');
      const rows = await t.menuRows('insert');
      const video = rows.find((r) => r.id === 'insert.video');
      const audio = rows.find((r) => r.id === 'insert.audio');
      const tip = video ? await t.rowTooltip('insert.video') : null;
      const shot = await t.shot('insert-video-later');
      await t.closeMenus();
      return {
        ok: Boolean(video && video.disabled),
        observed: `video ${JSON.stringify(video)}; audio ${JSON.stringify(audio)}; tooltip "${tip}"; ${shot}`,
      };
    },
  );

  // ---- 2. the font family picker on a selected title
  await t.step(
    'Font family: select the title, read the toolbar Font control',
    'the Font dropdown is drawn disabled with the sentence "The GT theme sets Inter"; no other family is offered',
    async () => {
      const info = await t.runInfo(deck.headRun);
      await t.clickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
      if (await t.editing()) await t.press('Escape');
      await sleep(300);
      const font = await page.evaluate(() => {
        const el = document.querySelector('[data-control="toolbar.font"]');
        return el
          ? {
              disabled: el.getAttribute('aria-disabled') ?? String(el.hasAttribute('disabled')),
              text: el.textContent?.trim(),
              title: el.getAttribute('title'),
              desc: el.getAttribute('aria-description'),
            }
          : null;
      });
      const size = await t.textOf('[data-control="toolbar.fontSize"]');
      const r = await t.rectOf('[data-control="toolbar.font"]');
      if (r) {
        await t.moveHuman(
          { x: r.x - 30, y: r.y + r.h / 2 },
          { x: r.x + r.w / 2, y: r.y + r.h / 2 },
          6,
        );
        await sleep(900);
      }
      const tip = await page.evaluate(
        () =>
          [...document.querySelectorAll('[role="tooltip"], .ts-tooltip, .ts-tip')]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.textContent?.trim())
            .join(' | ') || null,
      );
      const shot = await t.shot('font-control-disabled');
      if (r) {
        await t.clickAt(r.x + r.w / 2, r.y + r.h / 2);
        await sleep(400);
      }
      const opened = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll(
              '[role="listbox"], [role="menu"], .ts-picker, .ts-popover',
            ),
          ].filter((el) => el.getClientRects().length > 0).length,
      );
      await t.press('Escape');
      return {
        ok: Boolean(font),
        observed: `font ${JSON.stringify(font)}; size "${size}"; tooltip "${tip}"; click opened ${opened} popups; chip "${await t.chip()}"; ${shot}`,
      };
    },
  );

  // ---- 3. File: Page setup, Download ODP and SVG, Make available offline, Language
  await t.step(
    'File > Page setup, ODP, SVG, offline, Language with the switch on',
    'Page setup, ODP and SVG are Later stubs (disabled); no Make available offline row; File > Language absent',
    async () => {
      await t.openMenu('file');
      const rows = await t.menuRows('file');
      const ps = rows.find((r) => r.id === 'file.pageSetup');
      const tip = ps ? await t.rowTooltip('file.pageSetup') : null;
      const shot1 = await t.shot('file-menu-page-setup');
      await t.hoverRow('file.download', '[data-control="menu.file.download.pptx"]');
      const dlRows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu.file.download."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map(
            (el) =>
              `${el.getAttribute('data-control').replace('menu.', '')}${el.getAttribute('aria-disabled') === 'true' ? '(disabled)' : ''}`,
          ),
      );
      const shot2 = await t.shot('file-download-rows');
      await t.closeMenus();
      return {
        ok: Boolean(ps && ps.disabled),
        observed: `pageSetup ${JSON.stringify(ps)}; tooltip "${tip}"; offline row ${rows.some((r) => r.id === 'file.offline')}; language row ${rows.some((r) => r.id === 'file.language')}; download rows ${dlRows.join(', ')}; ${shot1}; ${shot2}`,
      };
    },
  );

  // ---- 4. Slide > Transition
  await t.step(
    'Slide > Transition with the switch on',
    'a Later stub, drawn disabled with its clause',
    async () => {
      await t.openMenu('slide');
      const rows = await t.menuRows('slide');
      const tr = rows.find((r) => r.id === 'slide.transition');
      const tip = tr ? await t.rowTooltip('slide.transition') : null;
      const shot = await t.shot('slide-transition-later');
      await t.closeMenus();
      const toolbar = await page.evaluate(() => {
        const el = document.querySelector('[data-control="toolbar.transition"]');
        return el
          ? { present: el.getClientRects().length > 0, disabled: el.getAttribute('aria-disabled') }
          : null;
      });
      return {
        ok: Boolean(tr && tr.disabled),
        observed: `transition ${JSON.stringify(tr)}; tooltip "${tip}"; toolbar Transition ${JSON.stringify(toolbar)}; ${shot}`,
      };
    },
  );

  // ---- 5. Tools > Spelling
  await t.step(
    'Tools > Spelling with the switch on',
    'Spell check is a Later stub; Underline errors toggles; no Personal dictionary',
    async () => {
      await t.openMenu('tools');
      await t.hoverRow('tools.spelling', '[data-control="menu.tools.spelling.underlineErrors"]');
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu.tools.spelling."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            id: el.getAttribute('data-control').replace('menu.', ''),
            disabled: el.getAttribute('aria-disabled') === 'true',
            checked: el.getAttribute('aria-checked'),
          })),
      );
      const tip = rows.some((r) => r.id === 'tools.spelling.spellCheck')
        ? await t.rowTooltip('tools.spelling.spellCheck')
        : null;
      const shot = await t.shot('tools-spelling');
      await t.closeMenus();
      return {
        ok: rows.length > 0,
        observed: `${JSON.stringify(rows)}; spell check tooltip "${tip}"; ${shot}`,
      };
    },
  );
  await t.step(
    'Spelling marks: type a misspelt word into the body and read the browser attribute',
    'the run carries spellcheck=true and nothing of the product marks the word (the browser draws its own underline, invisible to a script)',
    async () => {
      const on = await t.openRun(deck.bodyRun);
      await t.typeHuman('Thsi propsal covers teh renewal');
      await sleep(600);
      const facts = await page.evaluate(() => {
        const a = document.activeElement;
        return {
          spellcheck: a?.getAttribute('spellcheck'),
          lang: document.documentElement.lang || null,
          marks: document.querySelectorAll('.ts-misspelling, [data-misspelt], .ts-spell').length,
        };
      });
      const shot = await t.shot('spelling-typed');
      await t.press('Escape', 2);
      await t.settled();
      return { ok: on, observed: `${JSON.stringify(facts)}; ${shot}` };
    },
  );

  // ---- 6. Edit > Find and replace
  await t.step(
    'Edit > Find and replace: Acme to Globex, Replace all',
    'the count, the replacement and the title changed',
    async () => {
      await t.menuPath('edit', 'edit.findReplace');
      await page.locator('[data-control="dialog.findReplace.find"]').waitFor({ timeout: 8000 });
      await t.clickControl('dialog.findReplace.find');
      await t.typeHuman('Acme');
      await sleep(500);
      const hint1 = await t.textOf('[data-control="dialog.findReplace.result"]');
      await t.clickControl('dialog.findReplace.replace');
      await t.typeHuman('Globex');
      const shot = await t.shot('find-replace');
      const btn = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-dialog-scrim button, [role="dialog"] button')].map((b) =>
          b.textContent?.trim(),
        ),
      );
      const all = page.locator('[role="dialog"] button:has-text("Replace all")').first();
      await all.click();
      await sleep(800);
      const hint2 = await t.textOf('[data-control="dialog.findReplace.result"]');
      await t.closeDialogs();
      await t.settled();
      const title = (await t.runInfo(deck.headRun))?.text;
      return {
        ok: /Globex/.test(title ?? ''),
        observed: `hint before "${hint1}"; buttons ${btn.join('/')}; after "${hint2}"; title "${title}"; ${shot}`,
      };
    },
  );

  // ---- 7. Help > Keyboard shortcuts
  await t.step(
    'Help > Keyboard shortcuts: the dialog, its rows and the Google chords',
    'the dialog lists the bound chords; the seller chords are present',
    async () => {
      await t.menuPath('help', 'help.keyboardShortcuts');
      await page.locator('[data-control="dialog.keyboardShortcuts"]').waitFor({ timeout: 8000 });
      const facts = await page.evaluate(() => {
        const root = document.querySelector('[data-control="dialog.keyboardShortcuts"]');
        const text = root?.textContent ?? '';
        const rows = root ? root.querySelectorAll('tr, li, .ts-shortcut-row, dt').length : 0;
        const kbd = root ? root.querySelectorAll('kbd').length : 0;
        const has = (s) => text.includes(s);
        return {
          rows,
          kbd,
          hasComment: has('Comment') || has('comment'),
          hasLink: has('Link') || has('link'),
          hasNewSlide: has('New slide'),
          hasNotes: has('notes') || has('Notes'),
          hasPresent: has('Slideshow') || has('Present'),
          hasFind: has('Find'),
          hasPasteWithout: has('without formatting'),
          notAvailable: (text.match(/Not available/g) || []).length,
          sample: text.slice(0, 400),
        };
      });
      const shot = await t.shot('keyboard-shortcuts');
      await t.clickControl('dialog.keyboardShortcuts.search');
      await t.typeHuman('comment');
      await sleep(500);
      const filtered = await page.evaluate(() =>
        document
          .querySelector('[data-control="dialog.keyboardShortcuts"]')
          ?.textContent?.replace(/\s+/g, ' ')
          .slice(0, 500),
      );
      const shot2 = await t.shot('keyboard-shortcuts-search-comment');
      await t.closeDialogs();
      return {
        ok: facts.rows > 10,
        observed: `${JSON.stringify(facts)}; filtered "${filtered}"; ${shot}; ${shot2}`,
      };
    },
  );

  // ---- 8. Slide numbers and footers
  await t.step(
    'Insert > Slide numbers: Apply',
    'the dialog offers Apply and Skip title slides; the slide draws a number; no footer text row exists',
    async () => {
      await t.menuPath('insert', 'insert.slideNumbers');
      await page.locator('[data-control="dialog.slideNumbers"]').waitFor({ timeout: 8000 });
      const dialog = await page.evaluate(() =>
        document
          .querySelector('[data-control="dialog.slideNumbers"]')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim(),
      );
      const shot = await t.shot('slide-numbers-dialog');
      const apply = page
        .locator('[data-control="dialog.slideNumbers"] button:has-text("Apply")')
        .first();
      const applied = (await apply.count()) > 0;
      if (applied) await apply.click();
      await sleep(800);
      await t.closeDialogs();
      await t.settled();
      const counter = await page.evaluate(() => {
        const el = document.querySelector(
          '.ts-stagewrap.ts-editor .pt-slide .counter, .ts-stagewrap.ts-editor .pt-slide [data-control="view.count"], .ts-stagewrap.ts-editor .pt-slide .pt-counter',
        );
        return el ? el.textContent?.trim() : null;
      });
      const info = await t.invoke('deck.info');
      const shot2 = await t.shot('slide-numbers-applied');
      await t.openMenu('insert');
      const rows = await t.menuRows('insert');
      await t.closeMenus();
      return {
        ok: applied,
        observed: `dialog "${dialog}"; counter on the sheet "${counter}"; deck.info keys ${Object.keys(info).join(',')}; footer row in Insert ${rows.some((r) => /footer/i.test(r.label))}; ${shot}; ${shot2}`,
      };
    },
  );

  // ---- 9. Speaker notes
  await t.step(
    'Speaker notes: type a note, View > Show speaker notes off and on',
    'the pane below the canvas takes the note, the toggle hides and shows it',
    async () => {
      const field = await t.rectOf('[data-control="notes.text"]');
      if (!field) return { ok: false, observed: 'no notes field under the canvas' };
      await t.clickAt(field.x + field.w / 2, field.y + field.h / 2);
      await t.typeHuman('Open with the renewal date and the two new logos.');
      await t.press('Tab');
      await t.settled();
      const stored = (await t.slideJson(X)).notes ?? null;
      const shot = await t.shot('notes-typed');
      await t.menuPath('view', 'view.showSpeakerNotes');
      await sleep(500);
      const hidden = !(await t.visible('[data-control="notes.text"]'));
      await t.menuPath('view', 'view.showSpeakerNotes');
      await sleep(500);
      const shown = await t.visible('[data-control="notes.text"]');
      const placeholder = await t.attr('[data-control="notes.text"]', 'placeholder');
      return {
        ok: Boolean(stored) && hidden && shown,
        observed: `stored "${stored}"; hidden after the toggle ${hidden}; shown again ${shown}; placeholder "${placeholder}"; ${shot}`,
      };
    },
  );

  // ---- 10. Text fitting and overflow in a text box
  let boxId = null;
  await t.step(
    'Text box: type a long paragraph; read the box against its content',
    'the box grows or the text shrinks (Google: autofit); the text stays inside the box',
    async () => {
      const obj = await t.insertByTool(X, ['insert.textBox'], { x: 900, y: 500 }, { text: null });
      if (!obj) return { ok: false, observed: 'no text box landed' };
      boxId = obj.id;
      if (!(await t.editing())) await t.openRun(obj.id);
      const long =
        'Quarterly reviews included, onboarding for every regional team, a named success manager, priority support with a four hour response, and the usage dashboard for finance. Renewal terms follow the master agreement signed in March.';
      await t.typeHuman(long.slice(0, 120));
      await page.keyboard.type(long.slice(120));
      await sleep(600);
      const facts = await page.evaluate((id) => {
        const inner = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
        );
        if (!inner) return null;
        const free = inner.closest('.free') ?? inner;
        const f = free.getBoundingClientRect();
        const text = inner.matches('p, h1, h2, .text')
          ? inner
          : inner.querySelector('p, h1, h2, [data-run]');
        const r = (text ?? inner).getBoundingClientRect();
        return {
          box: `${Math.round(f.width)}x${Math.round(f.height)}`,
          content: `${Math.round(r.width)}x${Math.round(r.height)}`,
          overflows: r.bottom > f.bottom + 2,
          overflow: getComputedStyle(free).overflow,
          font: getComputedStyle(text ?? inner).fontSize,
        };
      }, obj.id);
      await t.press('Escape', 2);
      await t.settled();
      const block = (await t.objectsOf(X)).find((o) => o.id === obj.id)?.block;
      const shot = await t.shot('text-box-overflow');
      return {
        ok: facts !== null && !facts.overflows,
        observed: `${JSON.stringify(facts)}; autofit stored "${block?.autofit}"; pos ${JSON.stringify(block?.pos)}; ${shot}`,
      };
    },
  );
  await t.step(
    'Format > Text fitting on the text box',
    'Format options opens at Text fitting with Do not autofit, Shrink on overflow, Resize shape',
    async () => {
      if (!boxId) return { ok: false, observed: 'no text box' };
      await t.selectObject(boxId);
      await t.menuPath('format', 'format.textFitting');
      await sleep(700);
      const facts = await page.evaluate(() => {
        const panel = document.querySelector('[data-control="panel.formatOptions"]');
        const seg = document.querySelector('[data-control="formatOptions.textFitting.autofit"]');
        return {
          panel: panel !== null,
          fitting: seg ? seg.textContent?.replace(/\s+/g, ' ').trim() : null,
          checked: seg
            ? [...seg.querySelectorAll('[aria-pressed="true"], [aria-checked="true"], .is-on')].map(
                (b) => b.textContent?.trim(),
              )
            : null,
        };
      });
      const shot = await t.shot('text-fitting-panel');
      return {
        ok: facts.panel && facts.fitting !== null,
        observed: `${JSON.stringify(facts)}; ${shot}`,
      };
    },
  );

  // ---- 11. Alt text
  await t.step(
    'Alt text on the text box (Format options, Alt text section)',
    'a description field; the block carries alt after Tab',
    async () => {
      if (!boxId) return { ok: false, observed: 'no text box' };
      const present = await t.visible('[data-control="formatOptions.altText.description"]');
      if (!present) {
        const heads = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-control="panel.formatOptions"] .ts-panel-section-head',
            ),
          ].map((h) => h.textContent?.trim()),
        );
        const alt = heads.find((h) => /alt/i.test(h ?? ''));
        if (alt) {
          await page
            .locator('[data-control="panel.formatOptions"] .ts-panel-section-head', {
              hasText: /alt text/i,
            })
            .first()
            .click();
          await sleep(400);
        }
      }
      const field = await t.rectOf('[data-control="formatOptions.altText.description"]');
      if (!field) {
        const heads = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-control="panel.formatOptions"] .ts-panel-section-head',
            ),
          ].map((h) => h.textContent?.trim()),
        );
        return { ok: false, observed: `no Alt text field; panel sections ${heads.join(', ')}` };
      }
      await t.clickAt(field.x + field.w / 2, field.y + field.h / 2);
      await t.typeHuman('Renewal terms paragraph');
      await t.press('Tab');
      await t.settled();
      const block = (await t.objectsOf(X)).find((o) => o.id === boxId)?.block;
      const shot = await t.shot('alt-text');
      return {
        ok: typeof block?.alt === 'string' && block.alt.length > 0,
        observed: `alt "${block?.alt}"; ${shot}`,
      };
    },
  );
  await t.closeDialogs();

  // ---- 12. Links: to a URL from a text selection, to a slide from a block
  await t.step(
    'Link a word: double click a word in the title, Cmd+K, type a URL, Enter',
    'the word becomes a link and the URL is not inserted as text',
    async () => {
      const info = await t.runInfo(deck.headRun);
      const words = await page.evaluate((r) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        const out = [];
        while ((node = walker.nextNode())) {
          if (node.parentElement?.closest('[data-prompt]')) continue;
          const re = /\S+/g;
          let m;
          while ((m = re.exec(node.textContent))) {
            const range = document.createRange();
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            const b = range.getBoundingClientRect();
            out.push({ word: m[0], x: b.x + b.width / 2, y: b.y + b.height / 2 });
          }
        }
        return out;
      }, deck.headRun);
      const w = words[1] ?? words[0];
      await t.dblclickAt(w.x, w.y);
      await sleep(300);
      const selected = await page.evaluate(() => window.getSelection()?.toString());
      await t.press('Meta+k');
      await sleep(600);
      const pop = await t.visible('[data-control="run.link.href"]');
      const dialog = await t.visible('[data-control="dialog.link.url"]');
      if (pop) {
        await t.typeHuman('https://example.com/acme');
        await t.press('Enter');
      } else if (dialog) {
        await t.clickControl('dialog.link.url');
        await t.typeHuman('https://example.com/acme');
        await t.press('Enter');
      }
      await sleep(800);
      const shot = await t.shot('link-word');
      await t.press('Escape', 2);
      await t.settled();
      const text = (await t.runInfo(deck.headRun))?.text;
      const json = JSON.stringify(await t.slideJson(X));
      const hasLink = /example\.com\/acme/.test(json) && !/example\.com\/acme/.test(text ?? '');
      return {
        ok: hasLink,
        observed: `selected "${selected}"; popover ${pop}; dialog ${dialog}; title text "${text}"; stored link ${/example\.com\/acme/.test(json)}; ${shot}`,
      };
    },
  );
  await t.step(
    'Link a block to a slide: New slide, select the text box on slide 1, Insert > Link, pick the slide, Apply',
    'the block carries link { slide }; the show jumps on a click',
    async () => {
      const r = await t
        .invoke('slide.new', {
          layout: 'split',
          after: X,
          baseRevision: (await t.state()).revision,
        })
        .catch((e) => ({ error: String(e) }));
      await t.settled();
      const order = ((await t.invoke('slide.list', {})).slides ?? []).map((s) => s.id ?? s);
      const second = order.find((id) => id !== X) ?? null;
      if (!boxId || !second)
        return {
          ok: false,
          observed: `no text box or second slide; ${JSON.stringify(r).slice(0, 200)}`,
        };
      const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
      if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
      await sleep(600);
      await t.selectObject(boxId);
      await t.menuPath('insert', 'insert.link');
      await sleep(600);
      const dialog = await t.visible('[data-control="dialog.link.slide"]');
      const pop = await t.visible('[data-control="run.link.href"]');
      let options = null;
      if (dialog) {
        options = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control="dialog.link.slide"] option')].map(
            (o) => `${o.value}:${o.textContent?.trim()}`,
          ),
        );
        await page.selectOption('[data-control="dialog.link.slide"]', second);
        await sleep(300);
        await page.locator('[role="dialog"] button:has-text("Apply")').first().click();
      }
      const shot = await t.shot('link-block-dialog');
      await sleep(800);
      await t.closeDialogs();
      await t.settled();
      const block = (await t.objectsOf(X)).find((o) => o.id === boxId)?.block;
      return {
        ok: dialog && JSON.stringify(block?.link ?? null).includes(second),
        observed: `dialog ${dialog}; popover ${pop}; options ${JSON.stringify(options)}; link ${JSON.stringify(block?.link)}; ${shot}`,
        extra: { second },
      };
    },
  );
  await t.step(
    'The linked block in the show: Slideshow, click the box',
    'the show jumps to the linked slide',
    async () => {
      if (!boxId) return { ok: false, observed: 'no text box' };
      const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
      if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
      await sleep(500);
      const box = await t.boxOf(boxId);
      await t.clickControl('title.slideshow');
      await page
        .waitForSelector('.ts-slideshow, [data-control="present.toolbar"], .ts-present', {
          timeout: 15_000,
        })
        .catch(() => undefined);
      await sleep(1200);
      const before = await t.state();
      const linked = await page.evaluate((id) => {
        const el =
          document.querySelector(
            `.ts-slideshow [data-block="${id}"], .ts-present [data-block="${id}"], [data-present] [data-block="${id}"]`,
          ) ?? document.querySelector(`a[href*="#"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          tag: el.tagName,
          href: el.getAttribute('href'),
        };
      }, boxId);
      if (linked) await t.clickAt(linked.x, linked.y);
      await sleep(900);
      const after = await t.state();
      const shot = await t.shot('link-in-show');
      await t.press('Escape');
      await sleep(600);
      return {
        ok: Boolean(linked) && after.slideId !== before.slideId,
        observed: `present ${JSON.stringify(before.present ?? before.mode ?? null)}; linked element ${JSON.stringify(linked)}; slide ${before.slideId} -> ${after.slideId}; ${shot}`,
      };
    },
  );

  // ---- 13. Print settings and preview
  await t.step(
    'File > Print settings and preview: the layout dropdown, paper and orientation',
    'the handout rows are drawn disabled; no Paper or Orientation control',
    async () => {
      const [tab] = await Promise.all([
        context.waitForEvent('page', { timeout: 15_000 }).catch(() => null),
        t.menuPath('file', 'file.printPreview'),
      ]);
      const p = tab ?? page;
      if (tab) await tab.waitForLoadState('domcontentloaded');
      await p.waitForSelector('[data-control="print.layout"]', { timeout: 30_000 });
      await sleep(1500);
      const facts = await p.evaluate(() => {
        const sel = document.querySelector('[data-control="print.layout"]');
        return {
          url: location.pathname,
          options: sel
            ? [...sel.querySelectorAll('option')].map(
                (o) => `${o.textContent?.trim()}${o.disabled ? '(disabled)' : ''}`,
              )
            : null,
          controls: [...document.querySelectorAll('[data-control^="print."]')]
            .map((el) => el.getAttribute('data-control'))
            .filter((c, i, a) => a.indexOf(c) === i)
            .filter((c) => !/print\.notes\./.test(c)),
          paper: document.body.textContent?.includes('Paper'),
          orientation:
            document.body.textContent?.includes('Orientation') ||
            document.body.textContent?.includes('Landscape'),
          pages: document.querySelector('[data-control="print.pages"]')?.getAttribute('data-count'),
        };
      });
      const file = table.shotName('print-preview');
      await p.screenshot({ path: file });
      if (tab) await tab.close();
      else await page.goBack();
      return {
        ok: Array.isArray(facts.options),
        observed: `${JSON.stringify(facts)}; ${path.basename(file)}`,
      };
    },
  );
  if (!/\/edit\//.test(page.url())) {
    await page.goto(`${BASE}/edit/${deck.id}`, { waitUntil: 'domcontentloaded' });
    await t.editorReady();
    await t.settled();
  }

  // ---- 14. PPTX import through File > Open and File > Import slides
  await t.step(
    'File > Open > Upload with a .pptx',
    'the file is refused with the PowerPoint sentence',
    async () => {
      await t.menuPath('file', 'file.open');
      await page
        .locator('[data-control="dialog.open.search"], [data-control="dialog.open.file"]')
        .first()
        .waitFor({ timeout: 8000 });
      const tabs = await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"] [role="tab"], [role="dialog"] button')]
          .map((b) => b.textContent?.trim())
          .filter(Boolean),
      );
      const up = page
        .locator(
          '[role="dialog"] [role="tab"]:has-text("Upload"), [role="dialog"] button:has-text("Upload")',
        )
        .first();
      if ((await up.count()) > 0) await up.click();
      await sleep(400);
      const input = page.locator('[data-control="dialog.open.file"]');
      const accept = await input.getAttribute('accept').catch(() => null);
      await input.setInputFiles(PPTX);
      await sleep(1500);
      const text = await page.evaluate(() =>
        document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, ' ').trim(),
      );
      const shot = await t.shot('open-pptx-refused');
      await t.closeDialogs();
      return {
        ok: /PowerPoint import is not available/.test(text ?? ''),
        observed: `tabs ${tabs.join('/')}; accept "${accept}"; dialog "${text?.slice(0, 400)}"; ${shot}`,
      };
    },
  );
  await t.step('File > Import slides > Upload with a .pptx', 'the same refusal', async () => {
    await t.menuPath('file', 'file.importSlides');
    await page
      .locator('[data-control="dialog.importSlides.file"]')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    const up = page
      .locator(
        '[role="dialog"] [role="tab"]:has-text("Upload"), [role="dialog"] button:has-text("Upload")',
      )
      .first();
    if ((await up.count()) > 0) await up.click();
    await sleep(400);
    const input = page.locator('[data-control="dialog.importSlides.file"]');
    if ((await input.count()) === 0) {
      await t.closeDialogs();
      return { ok: false, observed: 'no upload input in Import slides' };
    }
    await input.setInputFiles(PPTX);
    await sleep(1500);
    const text = await page.evaluate(() =>
      document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, ' ').trim(),
    );
    const shot = await t.shot('import-slides-pptx-refused');
    await t.closeDialogs();
    return {
      ok: /PowerPoint import is not available/.test(text ?? ''),
      observed: `dialog "${text?.slice(0, 400)}"; ${shot}`,
    };
  });

  // ---- 15. Publish to web and Embed (switch on)
  await t.step(
    'File > Share > Publish to web: Publish, the link, a fetch with no cookie, Done, reopen',
    'a published link; the player answers 200 without its token or a 4xx with it; Stop publishing offered on reopen',
    async () => {
      await t.menuPath('file', 'file.share', 'file.share.publish');
      await page.locator('[data-control="dialog.publish.state"]').waitFor({ timeout: 8000 });
      const before = await t.textOf('[data-control="dialog.publish.state"]');
      if (await t.visible('[data-control="dialog.publish.publish"]'))
        await t.clickControl('dialog.publish.publish');
      await sleep(2500);
      const after = await t.textOf('[data-control="dialog.publish.state"]');
      const link = await t.textOf('[data-control="dialog.publish.link.url"]');
      const shot = await t.shot('publish-dialog');
      const embedTab = page
        .locator(
          '[role="dialog"] [role="tab"]:has-text("Embed"), [role="dialog"] button:has-text("Embed")',
        )
        .first();
      if ((await embedTab.count()) > 0) await embedTab.click();
      await sleep(500);
      const embed = await t.textOf('[data-control="dialog.publish.embed.code"]');
      const shot2 = await t.shot('publish-embed-tab');
      await t.closeDialogs();
      let statusWith = null;
      let statusWithout = null;
      let statusPlainDeck = null;
      if (link && /^https?:/.test(link)) {
        const { request } = await import('playwright-core');
        const fresh = await request.newContext();
        statusWith = (await fresh.get(link, { maxRedirects: 0 })).status();
        statusWithout = (
          await fresh.get(link.replace(/\?p=[^&]+&?/, '?'), { maxRedirects: 0 })
        ).status();
        statusPlainDeck = (
          await fresh.get(`${BASE}/deck/${deck.id}`, { maxRedirects: 0 })
        ).status();
        await fresh.dispose();
      }
      await t.menuPath('file', 'file.share', 'file.share.publish');
      await page.locator('[data-control="dialog.publish.state"]').waitFor({ timeout: 8000 });
      const reopened = await t.textOf('[data-control="dialog.publish.state"]');
      const stop = await t.visible('[data-control="dialog.publish.stop"]');
      const shot3 = await t.shot('publish-reopened');
      await t.closeDialogs();
      return {
        ok: Boolean(link) && stop,
        observed: `state before "${before}"; after "${after}"; link ${link}; fresh GET with token ${statusWith}, without token ${statusWithout}, /deck/<id> ${statusPlainDeck}; embed "${embed?.slice(0, 120)}"; reopened "${reopened}"; Stop publishing offered ${stop}; ${shot}; ${shot2}; ${shot3}`,
      };
    },
  );

  // ---- 16. Sections
  await t.step(
    'View > Show sections on a one section deck',
    'the row checks; the filmstrip shows a section label only when the deck has more than one section',
    async () => {
      await t.menuPath('view', 'view.showSections');
      await sleep(500);
      const labels = await page.evaluate(
        () =>
          document.querySelectorAll(
            '.ts-filmstrip [data-control^="filmstrip.section"], .ts-filmstrip .ts-section-head, .ts-section',
          ).length,
      );
      const info = await t.invoke('deck.info');
      const shot = await t.shot('show-sections');
      await t.menuPath('view', 'view.showSections');
      return {
        ok: true,
        observed: `section labels drawn ${labels}; deck sections ${JSON.stringify(info.sections ?? info.sectionCount ?? null).slice(0, 200)}; ${shot}`,
      };
    },
  );

  // ---- 17. Comments with a mention
  await t.step(
    'Comment on the text box: Cmd+Option+M, type "@" and read the mention list, Comment, Resolve',
    'a composer with a mention picker; the thread lists; Resolve works',
    async () => {
      if (!boxId) return { ok: false, observed: 'no text box' };
      await t.selectObject(boxId);
      await t.press('Meta+Alt+m');
      await sleep(900);
      const field = page.locator('[data-control$=".field"]').last();
      const present = (await field.count()) > 0 && (await field.isVisible());
      if (!present)
        return { ok: false, observed: `no comment field; snackbar "${await t.snackbar()}"` };
      await field.click();
      await t.typeHuman('Swap the logo before the call @');
      await sleep(900);
      const mentions = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control$=".mentions"], [data-control*=".mention."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.textContent?.trim()?.slice(0, 80)),
      );
      const shot = await t.shot('comment-mentions');
      await t.press('Backspace');
      const submit = page.locator('[data-control$=".submit"]').last();
      await submit.click();
      await sleep(2500);
      const markers = await t.count('[data-control="comment.marker"]');
      const snack = await t.snackbar();
      const shot2 = await t.shot('comment-posted');
      let resolved = null;
      const resolve = page.locator('[data-control$=".resolve"]').first();
      if ((await resolve.count()) > 0 && (await resolve.isVisible())) {
        await resolve.click();
        await sleep(1500);
        resolved = await t.count('[data-control="comment.marker"]');
      }
      return {
        ok: markers > 0,
        observed: `mention list ${JSON.stringify(mentions)}; markers ${markers}; snackbar "${snack}"; markers after Resolve ${resolved}; ${shot}; ${shot2}`,
      };
    },
  );
  await t.closeDialogs();

  // ---- 18. Paste without formatting
  await t.step('Cmd+Shift+V pastes plain text', 'the pasted text takes the box style', async () => {
    await page.evaluate(() => navigator.clipboard.writeText('Pasted plain text'));
    const on = await t.openRun(deck.bodyRun);
    await t.press('End');
    await t.press('Meta+Shift+v');
    await sleep(800);
    const text = (await t.runInfo(deck.bodyRun))?.text;
    await t.press('Escape', 2);
    await t.settled();
    return {
      ok: on && /Pasted plain text/.test(text ?? ''),
      observed: `session ${on}; body "${text?.slice(0, 160)}"`,
    };
  });

  table.record(
    'console errors of the run',
    'zero',
    `${consoleErrors.length}: ${consoleErrors.slice(0, 6).join(' || ')}`,
    consoleErrors.length === 0,
  );
} finally {
  if (deck?.id) await cleanupDeck(t, deck.id, context);
  await browser.close().catch(() => undefined);
  const out = table.finish({ deck: deck?.id ?? null, consoleErrors: consoleErrors.slice(0, 40) });
  writeFileSync(
    path.join(EVIDENCE, 'surface-console.json'),
    JSON.stringify(consoleErrors, null, 2),
  );
  process.exitCode = out.failed > 0 ? 1 : 0;
}
