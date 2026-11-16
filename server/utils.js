// All candle times are unix seconds, shifted by +5:30 (IST) so that the chart,
// which always renders UTC, shows Indian market time (9:15 - 15:30).
export const IST = 19800;
export const STEP = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400, '1w': 604800 };
export const INTERVALS = Object.keys(STEP);
const SESSION_START = 33300; // 09:15 in seconds since midnight

// Start time of the candle bucket that contains `ts` (ts already IST-shifted).
export function bucketStart(ts, interval) {
  if (interval === '1d') return Math.floor(ts / 86400) * 86400;
  if (interval === '1w') {
    const off = 4 * 86400; // 1 Jan 1970 was Thursday -> shift to Monday
    return Math.floor((ts - off) / 604800) * 604800 + off;
  }
  const step = STEP[interval];
  const day = Math.floor(ts / 86400) * 86400;
  const sod = ts - day;
  if (sod < SESSION_START) return day + Math.floor(sod / step) * step;
  return day + SESSION_START + Math.floor((sod - SESSION_START) / step) * step;
}

export function cleanCandles(list) {
  const ok = list.filter(
    (c) =>
      Number.isFinite(c.time) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
  );
  ok.sort((a, b) => a.time - b.time);
  const out = [];
  for (const c of ok) {
    if (out.length && out[out.length - 1].time === c.time) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
}

export function aggregateWeekly(daily) {
  const map = new Map();
  for (const c of daily) {
    const k = bucketStart(c.time, '1w');
    const w = map.get(k);
    if (!w) map.set(k, { time: k, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 });
    else {
      w.high = Math.max(w.high, c.high);
      w.low = Math.min(w.low, c.low);
      w.close = c.close;
      w.volume += c.volume || 0;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function isMarketHours(now = Date.now()) {
  const t = new Date(now + IST * 1000);
  const dow = t.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const sod = t.getUTCHours() * 3600 + t.getUTCMinutes() * 60;
  return sod >= 9 * 3600 + 10 * 60 && sod <= 15 * 3600 + 35 * 60;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
