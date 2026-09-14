import http from 'node:http';
const server = http.createServer((req, res) => {
  const picked = Object.fromEntries(
    Object.entries(req.headers).filter(([k]) => k.startsWith('sec-fetch') || k === 'user-agent'),
  );
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(picked));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const show = async (label, init) => {
  const r = await fetch(base + '/s/x', init);
  console.log(label, '->', await r.text());
};
await show('fetch, no headers', {});
await show('fetch, navigate+document+none', {
  headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' },
});
await show('fetch, redirect manual + navigate', {
  redirect: 'manual',
  headers: { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' },
});
server.close();
console.log('node', process.version);
