/* The page deck's nine slides for the mocks (docs/LANDING.md 2.0, the page deck table), drawn in
   the sheet grammar at any size: <div class="sheet" data-slide="plan" data-name="Globex" data-mark>.
   data-mark highlights each customer name (the Tailor highlight). A research file, never served. */
(function () {
  const P = '../../../../../apps/studio/public';
  const rails = '<span class="rl"></span><span class="rr"></span><span class="rt"></span><span class="rb"></span>';
  const foot = (n, credit = '') =>
    `<div class="foot"><svg><use href="#ts-mark"/></svg><span>${credit}</span><span>${n} / 9</span></div>`;
  const rows = (pairs) => `<div class="rows">${pairs.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div>`;
  const S = {
    title: (N) =>
      `${rails}<canvas class="dither" data-dither="raw" data-src="${P}/brand/mood-earth-light.jpg" data-crop="0,30,820,560" style="right:3.5%;bottom:6.22%;width:40%;aspect-ratio:820/560"></canvas>
      <div class="in" style="display:flex;flex-direction:column;justify-content:center"><div class="t1" style="max-width:62%">Onboarding plan for ${N}</div><div class="p" style="margin-top:2cqw">Four weeks from the first call to the first deck.</div></div>${foot(1, 'Image: NASA, Reto Stöckli, 2007, public domain')}`,
    plan: (N) =>
      `${rails}<div class="in" style="display:grid;grid-template-columns:38% 1fr;align-items:center;gap:4cqw"><div class="t2">The four weeks</div>${rows([
        ['Week 1', `The first call and access for the ${N} team`],
        ['Week 2', `The first deck in ${N}'s colors`],
        ['Week 3', `Review with ${N}'s sales leads`],
        ['Week 4', 'The deck goes to every seller'],
      ])}</div>${foot(2)}`,
    gets: (N) =>
      `${rails}<div class="in" style="display:grid;grid-template-columns:38% 1fr;align-items:center;gap:4cqw"><div><div class="t2">What ${N} gets</div><div class="p" style="margin-top:1.2cqw">Three things on the first day.</div></div>${rows([
        ['Name', 'Their name on every slide'],
        ['Theme', 'One theme for every deck'],
        ['Drafts', 'Agents that draft the first slides'],
      ])}</div>${foot(3)}`,
    ships: (N) =>
      `${rails}<div class="in" style="display:grid;place-items:center;text-align:center"><div class="t1" style="font-size:4.4cqw;max-width:70%">The first ${N} deck ships in week one</div></div>${foot(4)}`,
    next: (N) =>
      `${rails}<div class="in" style="display:grid;grid-template-columns:38% 1fr;align-items:center;gap:4cqw"><div class="t2" data-h>Next steps with ${N}</div>${rows([
        ['Monday', `${N} sellers get the deck`],
        ['Wednesday', 'Agents draft slides over MCP'],
        ['Friday', 'The first call uses this deck'],
      ])}</div>${foot(5)}`,
    lighthouse: () =>
      `<canvas class="dither" data-dither="picture" data-src="${P}/home/lighthouse-tone-e58fc86d6e.jpg" style="inset:0;width:100%;height:100%"></canvas>${rails}
      <div data-plate style="position:absolute;right:8%;bottom:14%;width:36%;padding:1.8cqw 2cqw;background:var(--pt-paper)"><div class="t2">Louisbourg lighthouse</div><div class="p" style="margin-top:0.8cqw;color:var(--pt-ink)">A lighthouse at Louisbourg, Nova Scotia, printed through an 8 by 8 screen at 2 px cells.</div><div class="cap" style="margin-top:1cqw">Photograph: Ken Heaton, CC BY-SA 4.0</div></div>${foot(6)}`,
    field: () =>
      `<canvas class="dither" data-dither="field" data-cx="0.86" data-cy="1.05" data-r="0.78" style="inset:0;width:100%;height:100%"></canvas>${rails}
      <div style="position:absolute;right:8%;bottom:14%;width:34%;padding:1.8cqw 2cqw;background:var(--pt-paper)"><div class="t2">The opener field</div><div class="p" style="margin-top:0.8cqw;color:var(--pt-ink)">A lit sphere drawn from a formula and printed through an 8 by 8 screen at 2 px cells.</div><div class="cap" style="margin-top:1cqw">Drawn in Turboslide</div></div>${foot(7)}`,
    pattern: (N) =>
      `${rails}<canvas class="dither" data-dither="sphere" data-cx="0.5" data-cy="0.5" data-r="0.46" style="left:12%;top:16%;width:30%;aspect-ratio:1"></canvas>
      <div style="position:absolute;left:58%;bottom:22%"><div class="t2" style="font-size:2.4cqw">Questions from ${N}</div><div class="p" style="font-size:1.2cqw;margin-top:0.6cqw">Thank you for the time today.</div></div>${foot(8)}`,
    close: () =>
      `${rails}<div class="in" style="display:grid;place-items:center;align-content:center;gap:2cqw"><svg style="width:19%;fill:var(--pt-ink)"><use href="#ts-mark"/></svg><div class="t2" style="font-size:3.4cqw">Turboslide</div></div>
      <div class="foot"><svg><use href="#ts-mark"/></svg><span>Made in Turboslide. Set in Inter.</span><span>9 / 9</span></div>`,
  };
  document.querySelectorAll('[data-slide]').forEach((el) => {
    const kind = el.dataset.slide;
    let name = el.dataset.name || 'Northwind';
    if (el.hasAttribute('data-mark')) name = `<mark style="background:color-mix(in srgb, var(--pt-select) 22%, transparent);color:inherit;outline:1px solid var(--pt-select)">${name}</mark>`;
    el.classList.add('sheet');
    let html = S[kind](name);
    if (el.classList.contains('thumb') || el.hasAttribute('data-small')) html = html.replace(/data-dither=/g, 'data-cell="1" data-dither=');
    el.innerHTML = html + el.innerHTML;
  });
})();
