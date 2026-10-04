// R2's probe of fix round 3: how Chromium's contenteditable (white-space: normal) treats a space
// typed at a text node's end, a no break space or a plain space written there by a rewrite, a no
// break space at the end of one text node before a text node that begins with a space, and a space
// typed before another space. Prints each text node after each step; no server, no judgement.
//   node docs/gslides-parity/realtime/build/r2/fix3/ws-probe.mjs
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  '<div id="e" contenteditable="true" style="font: 20px sans-serif; width: 600px; white-space: normal">T ta1</div>',
);
const dump = () =>
  page.evaluate(() =>
    [...document.getElementById('e').childNodes].map((n) =>
      n.nodeType === 3
        ? JSON.stringify(n.nodeValue).replace(/\u00a0/g, '<NBSP>')
        : `<${n.nodeName}>`,
    ),
  );
const caretEnd = () =>
  page.evaluate(() => {
    const e = document.getElementById('e');
    e.focus();
    const r = document.createRange();
    const last = e.lastChild;
    r.setStart(last, last.nodeValue.length);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
await caretEnd();
await page.keyboard.type(' ');
console.log('1 typed space at end:', await dump());
await page.keyboard.type('u');
console.log('2 then u:', await dump());

// a rewrite that writes the trailing space as nbsp at the node end, caret after it
await page.evaluate(() => {
  const e = document.getElementById('e');
  e.innerHTML = 'T ta1 tb1 ';
});
await caretEnd();
await page.keyboard.type('u');
console.log('3 nbsp at end by rewrite, then u:', await dump());

// a rewrite with a plain trailing space (no nbsp), caret after it
await page.evaluate(() => {
  const e = document.getElementById('e');
  e.innerHTML = 'T ta1 tb1 ';
});
await caretEnd();
await page.keyboard.type('u');
console.log('4 plain trailing space by rewrite, then u:', await dump());

// two nodes: "T ta1 " then " tb1", caret at the end of the first
await page.evaluate(() => {
  const e = document.getElementById('e');
  e.textContent = '';
  e.append(document.createTextNode('T ta1 '), document.createTextNode(' tb1'));
  e.focus();
  const r = document.createRange();
  r.setStart(e.firstChild, e.firstChild.nodeValue.length);
  r.collapse(true);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
});
await page.keyboard.type('u');
console.log('5 split nodes, u at first node end:', await dump());

// a space typed before an existing space in the middle
await page.evaluate(() => {
  const e = document.getElementById('e');
  e.textContent = 'T ta1 tb1';
  e.focus();
  const r = document.createRange();
  r.setStart(e.firstChild, 5);
  r.collapse(true);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
});
await page.keyboard.type(' ');
console.log('6 space typed before " tb1":', await dump());
await page.keyboard.type('u');
console.log('7 then u:', await dump());
await browser.close();
