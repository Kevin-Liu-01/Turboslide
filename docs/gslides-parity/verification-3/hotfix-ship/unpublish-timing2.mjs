const BASE='https://turboslide.vercel.app';
const bearer=process.env.TURBOSLIDE_TOKEN;
const act=async(a,deck,b)=>{const r=await fetch(`${BASE}/api/actions/${a}?deck=${deck}`,{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify(b??{})});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return{status:r.status,json:j,text:t};};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const recordRev=async(id)=>{const sg=await act('share.get',id);return sg.json?.record?.revision??sg.json?.revision??0;};
const info=await act('deck.info','gt-brand');
const id=`ship-unpub-${Date.now().toString(36)}`;
const cp=await act('deck.copy','gt-brand',{id:'gt-brand',name:'Unpublish timing',newId:id,slideIds:['title'],baseRevision:info.json.revision});
console.log('copy', cp.status, cp.json?.deckId);
let pub; for(let i=0;i<6;i++){pub=await act('deck.publish',id,{id,baseRevision:await recordRev(id)});if(pub.status===200)break;await sleep(1500);}
const player=pub.json?.url; console.log('publish', pub.status, 'player', String(player).replace(/p=[^&]+/,'p=<t>'));
const cookieJar={};
const get=async(url)=>{const r=await fetch(url,{redirect:'manual',headers:{cookie:cookieJar.c??''}});const sc=r.headers.get('set-cookie');if(sc)cookieJar.c=sc.split(';')[0];const t=await r.text();return{status:r.status,sentence:/no longer published/i.test(t)};};
console.log('player before unpublish', (await get(player)).status);
let unp; for(let i=0;i<6;i++){unp=await act('deck.unpublish',id,{id,baseRevision:await recordRev(id)});if(unp.status===200)break;console.log(`  unpublish try ${i}: ${unp.status} ${(unp.json?.error?.message??'').slice(0,50)}`);await sleep(1500);}
console.log('unpublish', unp.status);
const t0=Date.now();
for(let i=0;i<15;i++){const g=await get(player);console.log(`  +${((Date.now()-t0)/1000).toFixed(1)}s player ${g.status}${g.sentence?' (sentence)':''}`);if(g.status===410)break;await sleep(2000);}
for(let i=0;i<8;i++){const gi=await act('deck.info',id);if(gi.status===404){console.log('cleanup removed');break;}if(gi.status===200){let rev=gi.json.revision;if(!gi.json.trashedAt){await act('deck.trash',id,{id,baseRevision:rev});const a=await act('deck.info',id);if(a.status===200)rev=a.json.revision;}let rm=await act('deck.remove',id,{id,confirm:true,baseRevision:rev});if(rm.status===409){const m=/at revision (\d+)/.exec(rm.json?.error?.message??'');if(m)rm=await act('deck.remove',id,{id,confirm:true,baseRevision:Number(m[1])});}if(rm.json?.removed){console.log('cleanup removed');break;}}await sleep(2000);}
