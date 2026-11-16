import { FORCE_POLL, wsUrl } from './config.js';
import { apiJson } from './api.js';

// Live prices for the whole app.
//  - WebSocket to our Node server (real-time), or
//  - polling /api/quotes every 10 s (Netlify / when no WebSocket is available).
// Both feed the same tick format to subscribers.
const POLL_MS = 10000;

export function createFeed() {
  const tickSubs = new Set();
  const statusSubs = new Set();
  const quotes = {}; // symbol -> { p, pc, o, h, l, v, t }
  let ws = null;
  let retry = 0;
  let fails = 0;
  let closed = false;
  let status = 'connecting';
  let pollTimer = null;

  const setStatus = (s) => {
    if (s === status) return;
    status = s;
    statusSubs.forEach((f) => f(s));
  };

  function emit(ticks) {
    for (const t of ticks) quotes[t.s] = { ...quotes[t.s], p: t.p, pc: t.pc ?? quotes[t.s]?.pc, o: t.o, h: t.h, l: t.l, v: t.v, t: t.t };
    tickSubs.forEach((f) => f(ticks));
  }

  async function pollOnce() {
    try {
      const j = await apiJson('/api/quotes');
      const ticks = [];
      for (const [s, q] of Object.entries(j)) {
        if (!q?.p) continue;
        const old = quotes[s];
        if (!old || old.p !== q.p || old.t !== q.t) ticks.push({ s, p: q.p, pc: q.pc, o: q.o, h: q.h, l: q.l, v: q.v, t: q.t || Math.floor(Date.now() / 1000) });
      }
      if (ticks.length) emit(ticks);
      setStatus('live');
    } catch {
      setStatus('offline');
    }
  }

  function startPolling() {
    if (pollTimer || closed) return;
    pollOnce();
    pollTimer = setInterval(() => {
      if (!document.hidden) pollOnce();
    }, POLL_MS);
  }
  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      // invalid ws:// address (sandboxed preview etc.): never crash the app, poll instead
      startPolling();
      return;
    }
    ws.onopen = () => {
      retry = 0;
      fails = 0;
      stopPolling();
      setStatus('live');
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'ticks') emit(msg.ticks);
    };
    ws.onclose = () => {
      if (closed) return;
      fails += 1;
      if (fails >= 3) startPolling(); // no WebSocket on this host: fall back to polling, keep retrying quietly
      else setStatus('offline');
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 1000 * retry * (fails >= 3 ? 10 : 1));
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }

  if (FORCE_POLL) startPolling();
  else connect();

  return {
    quotes,
    onTicks(fn) {
      tickSubs.add(fn);
      return () => tickSubs.delete(fn);
    },
    onStatus(fn) {
      statusSubs.add(fn);
      fn(status);
      return () => statusSubs.delete(fn);
    },
    // force = the data source just changed (Angel One <-> Yahoo): the new prices replace the old ones
    async loadSnapshot(force = false) {
      try {
        const j = await apiJson('/api/quotes');
        for (const [s, q] of Object.entries(j)) quotes[s] = force ? { ...quotes[s], ...q } : { ...q, ...quotes[s] };
      } catch {}
    },
    close() {
      closed = true;
      stopPolling();
      ws?.close();
    },
  };
}
