#!/usr/bin/env node
// The dev WebSocket sidecar (gslides-parity SPEC-5 11; SPEC-3 17): on a checkout the studio's
// Vite dev server cannot upgrade a request, so this process on 4322 stands in for the node-server
// preset's `/api/decks/:id/ws` route. One socket per open: the sidecar reads the studio's SSE
// stream for the deck (`/api/decks/:id/stream?since=&client=&retire=`) and forwards every event
// as one text message (the envelope unchanged), and turns the client's request frames
// (`{ kind: 'ops' | 'presence', id, body, leave? }`) into the same POSTs the SSE transport makes,
// answering `{ kind: 'answer', id, status, body }`. No dependency: the RFC 6455 handshake and
// framing below cover text frames, ping, pong and close (the client's frames are masked, the
// server's are not), which is all the room needs.
//
//   TURBOSLIDE_REALTIME_WS=1 node scripts/ws-sidecar.mjs --studio http://localhost:4321 --port 4322
//
// The studio reads TURBOSLIDE_REALTIME_WS=1 and tells the editor (server/write.ts `room.ws`), and
// the editor's room client opens ws://<host>:4322/api/decks/<id>/ws (packages/realtime/src/client/ws.ts).
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const STUDIO = value('studio', process.env.TURBOSLIDE_STUDIO ?? 'http://localhost:4321').replace(
  /\/$/,
  '',
);
const PORT = Number(value('port', process.env.PORT ?? '4322'));
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function accept(key) {
  return createHash('sha1').update(`${key}${GUID}`).digest('base64');
}

/** One unmasked server frame: text (1), close (8), ping (9) or pong (10). */
function frame(opcode, payload = Buffer.alloc(0)) {
  const length = payload.length;
  let header;
  if (length < 126) header = Buffer.from([0x80 | opcode, length]);
  else if (length < 65_536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Reads every complete client frame at the head of `buffer`; answers the frames and the rest. */
function readFrames(buffer) {
  const frames = [];
  let at = 0;
  while (buffer.length - at >= 2) {
    const first = buffer[at];
    const second = buffer[at + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = at + 2;
    if (length === 126) {
      if (buffer.length - offset < 2) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length - offset < 8) break;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const maskLength = masked ? 4 : 0;
    if (buffer.length - offset < maskLength + length) break;
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    offset += maskLength;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    if (mask !== null) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    frames.push({ opcode, payload });
    at = offset + length;
  }
  return { frames, rest: buffer.subarray(at) };
}

/** Follows the studio's SSE stream for a deck and hands each block's event and data to `onBlock`. */
async function followStream(url, headers, onBlock, signal) {
  const response = await fetch(url, {
    headers: { accept: 'text/event-stream', ...headers },
    signal,
  });
  if (!response.ok || response.body === null) throw new Error(`stream ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    text += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = text.indexOf('\n\n')) >= 0) {
      const block = text.slice(0, cut);
      text = text.slice(cut + 2);
      const lines = block.split('\n');
      let event;
      const data = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length > 0) onBlock(event, data.join('\n'));
    }
  }
}

const server = createServer((request, response) => {
  response.writeHead(426, { 'content-type': 'text/plain' });
  response.end('the WebSocket sidecar upgrades /api/decks/<id>/ws alone');
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const match = /^\/api\/decks\/([^/]+)\/ws$/.exec(url.pathname);
  const key = request.headers['sec-websocket-key'];
  if (match === null || typeof key !== 'string') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  const deckId = decodeURIComponent(match[1]);
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept(key)}`,
      '',
      '',
    ].join('\r\n'),
  );
  const send = (text) => {
    if (!socket.destroyed) socket.write(frame(1, Buffer.from(text, 'utf8')));
  };
  // the cookie of the page rides to the studio so the room sees the same principal
  const forward = request.headers.cookie ? { cookie: request.headers.cookie } : {};
  const controller = new AbortController();
  const base = `${STUDIO}/api/decks/${encodeURIComponent(deckId)}`;
  followStream(
    `${base}/stream?${url.searchParams.toString()}`,
    forward,
    (event, data) => {
      // the SSE block as one JSON message: the event name rides inside the data already
      // (protocol.ts roomEventOf reads `type` from the data; the block's event name is the same word)
      send(event === undefined ? data : data);
    },
    controller.signal,
  ).catch((error) => {
    send(JSON.stringify({ type: 'resync', revision: 0, reason: String(error?.message ?? error) }));
    socket.end(frame(8));
  });
  let buffer = Buffer.alloc(0);
  if (head.length > 0) buffer = Buffer.concat([buffer, head]);
  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { frames, rest } = readFrames(buffer);
    buffer = rest;
    for (const { opcode, payload } of frames) {
      if (opcode === 8) {
        controller.abort();
        socket.end(frame(8));
        return;
      }
      if (opcode === 9) {
        socket.write(frame(10, payload));
        continue;
      }
      if (opcode !== 1) continue;
      let message;
      try {
        message = JSON.parse(payload.toString('utf8'));
      } catch {
        continue;
      }
      if (message?.kind !== 'ops' && message?.kind !== 'presence') continue;
      const path =
        message.kind === 'ops'
          ? `${base}/ops`
          : `${base}/presence${message.leave ? '?leave=1' : ''}`;
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', ...forward },
          body: JSON.stringify(message.body),
        });
        const text = await response.text();
        let body = {};
        try {
          body = JSON.parse(text);
        } catch {
          body = { message: text.slice(0, 200) };
        }
        const retry = response.headers.get('retry-after');
        if (retry !== null && typeof body === 'object' && body !== null)
          body.retryAfterMs = Number(retry) * 1000;
        send(JSON.stringify({ kind: 'answer', id: message.id, status: response.status, body }));
      } catch (error) {
        send(
          JSON.stringify({
            kind: 'answer',
            id: message.id,
            status: 503,
            body: { message: error instanceof Error ? error.message : String(error) },
          }),
        );
      }
    }
  });
  socket.on('close', () => controller.abort());
  socket.on('error', () => controller.abort());
});

server.listen(PORT, () => {
  console.log(`ws sidecar on ws://localhost:${PORT}/api/decks/<id>/ws -> ${STUDIO}`);
});
