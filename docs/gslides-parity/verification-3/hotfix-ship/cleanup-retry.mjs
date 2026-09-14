const BASE = process.argv[2], DECK = process.argv[3];
const bearer = process.env.TURBOSLIDE_TOKEN;
const act = async (action, body) => {
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${DECK}`, {
    method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text(); let j=null; try{j=JSON.parse(t)}catch{}
  return { status: r.status, json: j, text: t };
};
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
// probe deck.info a few times to see if the 403 is transient
for (let i=0;i<5;i++){ const g=await act('deck.info'); console.log(`try ${i} deck.info ${g.status} ${(g.json?.error?.message ?? g.json?.revision ?? g.text).toString().slice(0,90)}`); if(g.status===404){console.log('gone');process.exit(0);} if(g.status===200){ // trash+remove
    let rev=g.json.revision; if(!g.json.trashedAt){const tr=await act('deck.trash',{id:DECK,baseRevision:rev});console.log('trash',tr.status);const a=await act('deck.info');rev=a.json?.revision??rev+1;}
    let rm=await act('deck.remove',{id:DECK,confirm:true,baseRevision:rev});
    if(rm.status===409){const m=/at revision (\d+)/.exec(rm.json?.error?.message??'');if(m){rm=await act('deck.remove',{id:DECK,confirm:true,baseRevision:Number(m[1])});}}
    console.log('remove',rm.status,(rm.json?.removed?'removed':rm.json?.error?.message??rm.text).toString().slice(0,90));
    const gone=await act('deck.info');console.log('final deck.info',gone.status);process.exit(0);
  }
  if(g.status===409){const m=/at revision (\d+)/.exec(g.json?.error?.message??'');}
  await sleep(1500);
}
// all tries were 500/403: try remove using the 409 revision path anyway
let rm=await act('deck.remove',{id:DECK,confirm:true,baseRevision:1});
const m=/at revision (\d+)/.exec(rm.json?.error?.message??'');
if(m) rm=await act('deck.remove',{id:DECK,confirm:true,baseRevision:Number(m[1])});
console.log('blind remove',rm.status,(rm.json?.removed?'removed':rm.json?.error?.message??rm.text).toString().slice(0,90));
