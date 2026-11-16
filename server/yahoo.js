// Yahoo Finance data (about 15 minutes delayed). Used when Angel One is not connected, and on hosts that
// cannot run the Node server (Netlify functions). It only ever returns what Yahoo returned. If Yahoo cannot
// be reached the caller gets an error, never invented prices.
import { SYMBOLS, BY_SYMBOL } from './symbols.js';
import { IST, aggregateWeekly, cleanCandles } from './utils.js';

const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// our interval -> Yahoo interval + how far back Yahoo allows
const YMAP = {
  '1m': { interval: '1m', range: '7d' },
  '5m': { interval: '5m', range: '60d' },
  '15m': { interval: '15m', range: '60d' },
  '1h': { interval: '60m', range: '730d' },
  '1d': { interval: '1d', range: '10y' },
  '1w': { interval: '1d', range: '10y' }, // weekly candles are built from daily ones
};

export const YAHOO_LABEL = 'Yahoo Finance (15 min delayed)';

async function chart(ysym, interval, range) {
  let lastErr = null;
  for (const host of HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ysym)}?interval=${interval}&range=${range}&includePrePost=false`;
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      if (!r) throw new Error(j?.chart?.error?.description || 'Yahoo returned no data');
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(lastErr?.message || 'Yahoo Finance is not reachable');
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const istDay = (unix) => Math.floor((unix + IST) / 86400);

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch {
          out[k] = null;
        }
      }
    })
  );
  return out;
}

// ---------- quotes ----------
async function quoteOf(sym) {
  const r = await chart(sym.yahoo, '1d', '5d');
  const m = r.meta || {};
  const price = num(m.regularMarketPrice);
  if (price == null) return null;
  const t = num(m.regularMarketTime) || Math.floor(Date.now() / 1000);
  const ts = r.timestamp || [];
  const qd = r.indicators?.quote?.[0] || {};
  // previous close = close of the last daily bar that belongs to an earlier day than the latest price
  let pc = null;
  for (let i = ts.length - 1; i >= 0; i--) {
    if (istDay(ts[i]) < istDay(t) && num(qd.close?.[i]) != null) {
      pc = qd.close[i];
      break;
    }
  }
  if (pc == null) pc = num(m.previousClose) ?? num(m.chartPreviousClose);
  // today's open from today's daily bar when it exists
  let o = null;
  const last = ts.length - 1;
  if (last >= 0 && istDay(ts[last]) === istDay(t)) o = num(qd.open?.[last]);
  return {
    p: price,
    pc: pc ?? undefined,
    o: o ?? undefined,
    h: num(m.regularMarketDayHigh) ?? undefined,
    l: num(m.regularMarketDayLow) ?? undefined,
    v: sym.index ? undefined : num(m.regularMarketVolume) ?? undefined,
    t,
  };
}

let quoteCache = { at: 0, data: {} };
let quoteFlight = null;
const QUOTE_TTL = 30000;

export async function yahooQuotes() {
  if (Date.now() - quoteCache.at < QUOTE_TTL && Object.keys(quoteCache.data).length) return quoteCache.data;
  if (quoteFlight) return quoteFlight;
  quoteFlight = (async () => {
    const list = await pool(SYMBOLS, 8, async (s) => [s.symbol, await quoteOf(s)]);
    const data = { ...quoteCache.data }; // a symbol that failed this round keeps its last REAL value (it carries its own time)
    let got = 0;
    for (const x of list) {
      if (x && x[1]) {
        data[x[0]] = x[1];
        got++;
      }
    }
    if (!got) {
      // nothing came back: serve the last real snapshot only if it is recent, else fail honestly
      if (Object.keys(quoteCache.data).length && Date.now() - quoteCache.at < 30 * 60000) return quoteCache.data;
      throw new Error('Yahoo Finance did not return any prices');
    }
    quoteCache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    quoteFlight = null;
  });
  return quoteFlight;
}

// ---------- candles ----------
const candleCache = new Map();

export async function yahooCandles(symbol, interval) {
  const sym = BY_SYMBOL[symbol];
  const cfg = YMAP[interval];
  if (!sym || !cfg) throw new Error('Unknown symbol or interval');
  const key = `${symbol}|${interval}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < 45000) return hit.candles;
  const r = await chart(sym.yahoo, cfg.interval, cfg.range);
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const daily = interval === '1d' || interval === '1w';
  let list = [];
  for (let i = 0; i < ts.length; i++) {
    const o = num(q.open?.[i]);
    const h = num(q.high?.[i]);
    const l = num(q.low?.[i]);
    const c = num(q.close?.[i]);
    if (o == null || h == null || l == null || c == null) continue; // Yahoo has empty rows: skip, never fill
    let time = ts[i] + IST;
    if (daily) time = Math.floor(time / 86400) * 86400;
    list.push({ time, open: o, high: h, low: l, close: c, volume: sym.index ? 0 : num(q.volume?.[i]) || 0 });
  }
  list = cleanCandles(list);
  if (interval === '1w') list = aggregateWeekly(list);
  candleCache.set(key, { at: Date.now(), candles: list });
  return list;
}
