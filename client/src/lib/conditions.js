// Extra conditions the user can add to ANY strategy ("Add condition" on the strategy settings page).
// A condition decides whether a BUY / SELL signal is allowed to count. Signals that fail are dropped, so the chart marks,
// the scanner, the setups list and the accuracy test all follow the same rules.
//   params.conditions = { match: 'all' | 'any', items: [{ id, type, enabled, scope: 'both'|'buy'|'sell', invert, ...fields }] }
import * as TA from './indicators.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export { DAYS, MONTHS };

const today = () => new Date().toISOString().slice(0, 10);

// type -> label, short help, starting values
export const COND_TYPES = [
  { type: 'date', label: 'Date range', hint: 'Signals only between two dates (same day twice = one day)', make: () => ({ from: today(), to: today() }) },
  { type: 'weekday', label: 'Days of the week', hint: 'Only on the days you tick', make: () => ({ days: [1, 2, 3, 4, 5] }) },
  { type: 'month', label: 'Months', hint: 'Only in the months you tick', make: () => ({ months: [new Date().getMonth() + 1] }) },
  { type: 'time', label: 'Time of day', hint: 'Intraday candles only (1m to 4h)', make: () => ({ from: '09:15', to: '15:30' }) },
  { type: 'price', label: 'Price level', hint: 'Close above or below a price', make: () => ({ op: 'above', value: 100 }) },
  { type: 'ma', label: 'Price vs moving average', hint: 'Close above / below an EMA or SMA', make: () => ({ kind: 'ema', length: 50, op: 'above' }) },
  { type: 'trend', label: 'Trend (fast vs slow EMA)', hint: 'Uptrend = fast EMA above slow EMA', make: () => ({ fast: 20, slow: 50, op: 'up' }) },
  { type: 'rsi', label: 'RSI', hint: 'RSI above or below a level', make: () => ({ length: 14, op: 'below', value: 30 }) },
  { type: 'volume', label: 'Volume', hint: 'Volume at least N times its recent average', make: () => ({ mult: 1.5, length: 20 }) },
  { type: 'candle', label: 'Signal candle colour', hint: 'Green (close above open) or red', make: () => ({ color: 'green' }) },
  { type: 'move', label: 'Candle size', hint: 'Body at least this % of the open', make: () => ({ min: 0.5 }) },
  { type: 'atr', label: 'Volatility (ATR %)', hint: 'ATR as % of price, above or below', make: () => ({ length: 14, op: 'above', value: 1 }) },
  { type: 'breakout', label: 'Breakout', hint: 'Close beyond the highest high / lowest low of the last N candles', make: () => ({ length: 20, op: 'high' }) },
];
export const typeInfo = (t) => COND_TYPES.find((x) => x.type === t);
export const newCondition = (type) => ({ id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, type, enabled: true, scope: 'both', invert: false, ...typeInfo(type).make() });

const pad = (n) => String(n).padStart(2, '0');
const niceDate = (s) => (s ? s : '…');
export function describe(c) {
  let t = '';
  switch (c.type) {
    case 'date': t = c.from === c.to ? `on ${niceDate(c.from)}` : `from ${niceDate(c.from)} to ${niceDate(c.to)}`; break;
    case 'weekday': t = c.days?.length ? `on ${[...c.days].sort().map((d) => DAYS[d]).join(', ')}` : 'on no day (nothing passes)'; break;
    case 'month': t = c.months?.length ? `in ${[...c.months].sort((a, b) => a - b).map((m) => MONTHS[m - 1]).join(', ')}` : 'in no month (nothing passes)'; break;
    case 'time': t = `between ${c.from} and ${c.to}`; break;
    case 'price': t = `close ${c.op} ${c.value}`; break;
    case 'ma': t = `close ${c.op} ${String(c.kind).toUpperCase()} ${c.length}`; break;
    case 'trend': t = `EMA ${c.fast} ${c.op === 'up' ? 'above' : 'below'} EMA ${c.slow}`; break;
    case 'rsi': t = `RSI(${c.length}) ${c.op} ${c.value}`; break;
    case 'volume': t = `volume ≥ ${c.mult}× average of ${c.length}`; break;
    case 'candle': t = `${c.color} signal candle`; break;
    case 'move': t = `candle body ≥ ${c.min}%`; break;
    case 'atr': t = `ATR(${c.length}) ${c.op} ${c.value}% of price`; break;
    case 'breakout': t = `close beyond the ${c.length}-candle ${c.op === 'high' ? 'high' : 'low'}`; break;
    default: t = '';
  }
  const who = c.scope === 'buy' ? 'BUY' : c.scope === 'sell' ? 'SELL' : 'BUY and SELL';
  return `${c.invert ? 'Skip' : 'Allow'} ${who} ${c.invert ? 'when' : 'only'} ${t}`.replace('only on', 'only on').replace('only in', 'only in');
}

const cmp = (op, a, b) => (op === 'above' ? a > b : op === 'below' ? a < b : false);

// returns true / false, or null when it cannot be worked out yet (not enough candles for the indicator)
function check(c, candles, i, cache) {
  const k = candles[i];
  const need = (key, fn) => (cache[key] ??= fn());
  const closes = () => need('close', () => candles.map((x) => x.close));
  const d = new Date(k.time * 1000); // candle times are already in India time
  switch (c.type) {
    case 'date': {
      const s = d.toISOString().slice(0, 10);
      return (!c.from || s >= c.from) && (!c.to || s <= c.to);
    }
    case 'weekday':
      return (c.days || []).includes(d.getUTCDay());
    case 'month':
      return (c.months || []).includes(d.getUTCMonth() + 1);
    case 'time': {
      const m = d.getUTCHours() * 60 + d.getUTCMinutes();
      const [fh, fm] = String(c.from).split(':').map(Number);
      const [th, tm] = String(c.to).split(':').map(Number);
      const a = fh * 60 + fm;
      const b = th * 60 + tm;
      return a <= b ? m >= a && m <= b : m >= a || m <= b;
    }
    case 'price':
      return cmp(c.op, k.close, Number(c.value));
    case 'ma': {
      const n = Math.max(1, Math.round(c.length));
      const arr = need(`${c.kind}${n}`, () => (c.kind === 'sma' ? TA.sma(closes(), n) : TA.ema(closes(), n)));
      return Number.isFinite(arr[i]) ? cmp(c.op, k.close, arr[i]) : null;
    }
    case 'trend': {
      const f = need(`ema${c.fast}`, () => TA.ema(closes(), Math.max(1, Math.round(c.fast))));
      const s = need(`ema${c.slow}`, () => TA.ema(closes(), Math.max(1, Math.round(c.slow))));
      if (!Number.isFinite(f[i]) || !Number.isFinite(s[i])) return null;
      return c.op === 'up' ? f[i] > s[i] : f[i] < s[i];
    }
    case 'rsi': {
      const n = Math.max(2, Math.round(c.length));
      const arr = need(`rsi${n}`, () => TA.rsi(closes(), n));
      return Number.isFinite(arr[i]) ? cmp(c.op, arr[i], Number(c.value)) : null;
    }
    case 'volume': {
      const n = Math.max(2, Math.round(c.length));
      if (i < n) return null;
      let sum = 0;
      for (let j = i - n; j < i; j++) sum += candles[j].volume || 0;
      const avg = sum / n;
      return avg > 0 ? (k.volume || 0) >= avg * Number(c.mult) : null;
    }
    case 'candle':
      return c.color === 'green' ? k.close > k.open : k.close < k.open;
    case 'move':
      return k.open > 0 ? (Math.abs(k.close - k.open) / k.open) * 100 >= Number(c.min) : null;
    case 'atr': {
      const n = Math.max(2, Math.round(c.length));
      const arr = need(`atr${n}`, () => TA.atr(candles, n));
      return Number.isFinite(arr[i]) && k.close > 0 ? cmp(c.op, (arr[i] / k.close) * 100, Number(c.value)) : null;
    }
    case 'breakout': {
      const n = Math.max(2, Math.round(c.length));
      if (i < n) return null;
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = i - n; j < i; j++) {
        hi = Math.max(hi, candles[j].high);
        lo = Math.min(lo, candles[j].low);
      }
      return c.op === 'high' ? k.close > hi : k.close < lo;
    }
    default:
      return true;
  }
}

export function applyConditions(candles, buy, sell, conds) {
  const items = (conds?.items || []).filter((c) => c && c.enabled !== false);
  if (!items.length) return { buy, sell };
  const any = conds.match === 'any';
  const cache = {};
  const pass = (side, i) => {
    const mine = items.filter((c) => !c.scope || c.scope === 'both' || c.scope === side);
    if (!mine.length) return true;
    let ok = !any; // all: start true, any: start false
    for (const c of mine) {
      let r;
      try {
        r = check(c, candles, i, cache);
      } catch {
        r = null;
      }
      if (r == null) {
        if (!any) return false; // cannot be checked yet = not allowed
        continue;
      }
      const v = c.invert ? !r : r;
      if (any && v) return true;
      if (!any && !v) return false;
    }
    return ok;
  };
  return { buy: buy.map((f, i) => !!f && pass('buy', i)), sell: sell.map((f, i) => !!f && pass('sell', i)) };
}

// Trading days: which weekdays may give signals (0 = Sun ... 6 = Sat) and single dates to leave out (YYYY-MM-DD).
export function applyTradingDays(candles, buy, sell, td) {
  const days = Array.isArray(td?.days) ? td.days : [0, 1, 2, 3, 4, 5, 6];
  const skip = new Set(td?.skip || []);
  if (days.length >= 7 && !skip.size) return { buy, sell };
  const ok = candles.map((k) => {
    const d = new Date(k.time * 1000);
    return days.includes(d.getUTCDay()) && !skip.has(d.toISOString().slice(0, 10));
  });
  return { buy: buy.map((f, i) => !!f && ok[i]), sell: sell.map((f, i) => !!f && ok[i]) };
}
