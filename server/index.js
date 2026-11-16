import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import os from 'node:os';
import dgram from 'node:dgram';
import { SYMBOLS, BY_SYMBOL } from './symbols.js';
import { INTERVALS } from './utils.js';
import { YAHOO_LABEL, yahooCandles, yahooQuotes } from './yahoo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

// a stray error in one request / one data poll must never kill the whole server
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e?.message || e));

const withTimeout = (p, ms, what) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

// ---------- data source: Angel One first, Yahoo Finance (15 min delayed) second, never fake data ----------
// The web server starts listening FIRST (Render needs the port open quickly). Angel One logs in in the
// background and is retried every 30 s. While it is not connected every request is answered with real Yahoo
// Finance data (15 min delayed); as soon as Angel One connects, Angel One data is used.
let provider = null;
let providerError = 'Connecting to Angel One...';
let connecting = false;
async function connectAngel() {
  if (provider || connecting) return;
  connecting = true;
  let p = null;
  let retry = true;
  try {
    const { AngelProvider } = await import('./providers/angel.js');
    p = new AngelProvider(process.env);
    await withTimeout(p.init(), 30000, 'Angel One login');
    provider = p;
    providerError = '';
    p.on('tick', (t) => pending.set(t.s, t));
    console.log('[server] data provider: angel');
  } catch (e) {
    try {
      p?.ws?.close?.();
    } catch {}
    providerError = e.message;
    if (/keys missing/i.test(e.message)) {
      retry = false; // no Angel keys at all: Yahoo only, nothing to retry
      console.warn('[server] Angel One keys are not set. Using Yahoo Finance (15 min delayed).');
    } else {
      console.error(`[server] Angel One is NOT connected: ${e.message}. Using Yahoo Finance (15 min delayed), retrying Angel in 30 s`);
    }
    if (retry) setTimeout(connectAngel, 30000);
  } finally {
    connecting = false;
  }
}

// ---------- optional password (set APP_PASSWORD in .env before sharing a public link) ----------
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest();
function passwordOk(header) {
  if (!APP_PASSWORD) return true;
  const m = /^Basic\s+(.+)$/i.exec(header || '');
  if (!m) return false;
  const given = Buffer.from(m[1], 'base64').toString('utf8');
  return crypto.timingSafeEqual(sha(given.slice(given.indexOf(':') + 1)), sha(APP_PASSWORD)); // any user name, right password
}

// ---------- HTTP API ----------
const app = express();
app.use((req, res, next) => {
  if (req.path === '/healthz' || passwordOk(req.headers.authorization)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Nifty50 Terminal"').status(401).send('Password required');
});
app.use(cors());
app.get('/healthz', (_req, res) => res.type('text').send('ok')); // Render health check (never waits)
const sourceInfo = () =>
  provider
    ? { source: 'angel', label: provider.label, delayed: false }
    : { source: 'yahoo', label: YAHOO_LABEL, delayed: true };

// health + symbols never wait for any provider
app.get('/api/health', (_req, res) => res.json({ ok: true, provider: sourceInfo().source, connected: !!provider, ...sourceInfo(), error: provider ? '' : providerError }));
app.get('/api/symbols', (_req, res) =>
  res.json(SYMBOLS.map(({ symbol, name, index, groups }) => ({ symbol, name, index, groups })))
);

// 1st priority Angel One, 2nd priority Yahoo Finance. Errors are reported, nothing is ever invented.
app.get('/api/quotes', async (_req, res) => {
  if (provider) {
    try {
      const q = await provider.quotes();
      if (q && Object.keys(q).length) return res.json(q);
    } catch (e) {
      console.warn('[quotes] Angel One failed, using Yahoo:', e.message);
    }
  }
  try {
    res.json(await yahooQuotes());
  } catch (e) {
    res.status(502).json({ error: provider ? `Angel One and Yahoo both failed: ${e.message}` : `Angel One not connected (${providerError}) and Yahoo failed: ${e.message}` });
  }
});

const cache = new Map(); // short cache so quick timeframe switching doesn't hammer the broker
app.get('/api/candles', async (req, res) => {
  const symbol = String(req.query.symbol || '');
  const interval = String(req.query.interval || '1d');
  if (!BY_SYMBOL[symbol]) return res.status(400).json({ error: 'Unknown symbol' });
  if (!INTERVALS.includes(interval)) return res.status(400).json({ error: 'Bad interval' });
  const key = `${symbol}|${interval}|${provider ? 'angel' : 'yahoo'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15000) return res.json({ candles: hit.candles, source: hit.source });
  let angelErr = '';
  if (provider) {
    try {
      const candles = await provider.candles(symbol, interval);
      cache.set(key, { at: Date.now(), candles, source: 'angel' });
      return res.json({ candles, source: 'angel' });
    } catch (e) {
      angelErr = e.message;
      console.warn('[candles] Angel One failed, using Yahoo:', symbol, interval, e.message);
    }
  }
  try {
    const candles = await yahooCandles(symbol, interval);
    cache.set(key, { at: Date.now(), candles, source: 'yahoo' });
    res.json({ candles, source: 'yahoo' });
  } catch (e) {
    console.error('[candles]', symbol, interval, e.message);
    res.status(502).json({ error: angelErr ? `Angel One: ${angelErr}. Yahoo: ${e.message}` : `Angel One not connected (${providerError}). Yahoo: ${e.message}` });
  }
});

// serve built client (npm run build) in production
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ---------- WebSocket: push ticks to browsers ----------
const pending = new Map();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: (info) => passwordOk(info.req.headers.authorization) });

setInterval(() => {
  if (!pending.size || !wss.clients.size) {
    pending.clear();
    return;
  }
  const msg = JSON.stringify({ type: 'ticks', ticks: [...pending.values()] });
  pending.clear();
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}, 500);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', provider: provider ? 'angel' : 'yahoo' }));
});

// While Angel One is not connected, push Yahoo prices (15 min delayed) to the browsers every 30 s.
const lastYahoo = {};
setInterval(async () => {
  if (provider || !wss.clients.size) return;
  try {
    const q = await yahooQuotes();
    for (const [s, x] of Object.entries(q)) {
      const o = lastYahoo[s];
      if (!o || o.p !== x.p || o.t !== x.t) {
        lastYahoo[s] = x;
        pending.set(s, { s, ...x });
      }
    }
  } catch (e) {
    console.warn('[yahoo] quotes failed:', e.message);
  }
}, 30000);

// Same idea as "npm run dev": print a Local link and a Network link (open it on a phone on the same Wi-Fi).
function lanAddress() {
  return new Promise((resolve) => {
    try {
      const found = Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address);
      if (found.length) return resolve(found);
    } catch {
      /* Android can refuse this call; use the fallback below */
    }
    try {
      const sock = dgram.createSocket('udp4');
      sock.on('error', () => resolve([]));
      sock.connect(80, '8.8.8.8', () => {
        let a = null;
        try {
          a = sock.address().address;
        } catch {}
        sock.close();
        resolve(a && a !== '0.0.0.0' ? [a] : []);
      });
    } catch {
      resolve([]);
    }
  });
}

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[server] listening on port ${PORT}`);
  console.log(`  Local:    http://localhost:${PORT}`);
  connectAngel();
  const ips = await lanAddress();
  if (ips.length) for (const ip of ips) console.log(`  Network:  http://${ip}:${PORT}   <- open this on your phone (same Wi-Fi)`);
  else console.log('  Network:  could not detect. Find the tablet IP in Settings -> Wi-Fi, then open http://THAT-IP:' + PORT);
});
