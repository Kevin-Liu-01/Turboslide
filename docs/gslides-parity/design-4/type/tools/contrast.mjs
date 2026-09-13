const hex = (h) => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const lin = (c) => { c/=255; return c<=0.04045? c/12.92 : ((c+0.055)/1.055)**2.4; };
const L = (rgb) => 0.2126*lin(rgb[0])+0.7152*lin(rgb[1])+0.0722*lin(rgb[2]);
const ratio = (a,b) => { const [x,y]=[L(hex(a)),L(hex(b))]; const [hi,lo]= x>y?[x,y]:[y,x]; return ((hi+0.05)/(lo+0.05)).toFixed(2); };
const comp = (rgba, ground) => { const [r,g,b,a]=rgba; const gg=hex(ground); return '#'+[r,g,b].map((c,i)=>Math.round(gg[i]+(c-gg[i])*a).toString(16).padStart(2,'0')).join(''); };
const light = { paper:'#ffffff', ink:'#070707', ink2:'#3a3d44', ti:'#8a8f98', edge: comp([7,7,7,0.62],'#ffffff'), hair: comp([7,7,7,0.18],'#ffffff'), plate: comp([7,7,7,0.035],'#ffffff'), cross: comp([7,7,7,0.38],'#ffffff') };
const dark = { paper:'#070707', ink:'#f2f2f0', ink2:'#b9bcc3', ti:'#8a8f98', edge: comp([242,242,240,0.55],'#070707'), hair: comp([242,242,240,0.22],'#070707'), plate: comp([242,242,240,0.05],'#070707'), cross: comp([255,255,255,0.34],'#070707') };
for (const [name, t] of [['light', light], ['dark', dark]]) {
  console.log(name, 'edge', t.edge, 'hair', t.hair, 'plate', t.plate, 'cross', t.cross);
  console.log(' ink on paper', ratio(t.ink, t.paper), '| ink-2 on paper', ratio(t.ink2, t.paper), '| titanium on paper', ratio(t.ti, t.paper), '| edge on paper', ratio(t.edge, t.paper), '| hair on paper', ratio(t.hair, t.paper), '| ink on plate', ratio(t.ink, t.plate), '| titanium on plate', ratio(t.ti, t.plate));
}
console.log('panel text rgba(255,255,255,.87) on #101010', ratio(comp([255,255,255,0.87],'#101010'), '#101010'));
console.log('paper T on ink tile (dark favicon) ', ratio('#f2f2f0','#070707'), '| ink T on paper tile', ratio('#070707','#ffffff'));
console.log('titanium on white (large text 3:1?)', ratio('#8a8f98','#ffffff'), 'titanium on #070707', ratio('#8a8f98','#070707'));
console.log('chrome light tab strip #dee1e6 vs paper tile', ratio('#dee1e6','#ffffff'), 'edge frame vs strip', ratio(light.edge,'#dee1e6'), 'chrome dark strip #202124 vs ink tile', ratio('#202124','#070707'), 'dark frame vs strip', ratio(dark.edge, '#202124'));
