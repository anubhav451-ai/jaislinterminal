// Pure indicator maths. Every function takes arrays and returns an array of the
// same length with `null` where the value is not available yet.

const nulls = (n) => new Array(n).fill(null);
export const closes = (c) => c.map((x) => x.close);

export function sma(values, n) {
  const out = nulls(values.length);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      sum = 0;
      cnt = 0;
      continue;
    }
    sum += v;
    cnt++;
    if (cnt > n) {
      sum -= values[i - n];
      cnt--;
    }
    if (cnt === n) out[i] = sum / n;
  }
  return out;
}

export function ema(values, n) {
  const out = nulls(values.length);
  const k = 2 / (n + 1);
  let prev = null;
  let seed = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seed.push(v);
      if (seed.length === n) {
        prev = seed.reduce((a, b) => a + b, 0) / n;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function wma(values, n) {
  const out = nulls(values.length);
  const den = (n * (n + 1)) / 2;
  for (let i = n - 1; i < values.length; i++) {
    let s = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const v = values[i - j];
      if (v == null) {
        ok = false;
        break;
      }
      s += v * (n - j);
    }
    if (ok) out[i] = s / den;
  }
  return out;
}

// Wilder's smoothing (RMA)
export function rma(values, n) {
  const out = nulls(values.length);
  let prev = null;
  let seed = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seed.push(v);
      if (seed.length === n) {
        prev = seed.reduce((a, b) => a + b, 0) / n;
        out[i] = prev;
      }
    } else {
      prev = (prev * (n - 1) + v) / n;
      out[i] = prev;
    }
  }
  return out;
}

export function rsi(values, n = 14) {
  const gain = nulls(values.length);
  const loss = nulls(values.length);
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain[i] = Math.max(d, 0);
    loss[i] = Math.max(-d, 0);
  }
  const ag = rma(gain, n);
  const al = rma(loss, n);
  return values.map((_, i) => {
    if (ag[i] == null || al[i] == null) return null;
    if (al[i] === 0) return 100;
    return 100 - 100 / (1 + ag[i] / al[i]);
  });
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const sig = ema(line, signal);
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export function bollinger(values, n = 20, mult = 2) {
  const mid = sma(values, n);
  const upper = nulls(values.length);
  const lower = nulls(values.length);
  for (let i = n - 1; i < values.length; i++) {
    if (mid[i] == null) continue;
    let s = 0;
    for (let j = 0; j < n; j++) s += (values[i - j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

// VWAP resets every day (only meaningful on intraday timeframes).
export function vwap(candles) {
  const out = nulls(candles.length);
  let day = null;
  let pv = 0;
  let vol = 0;
  candles.forEach((c, i) => {
    const d = Math.floor(c.time / 86400);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * (c.volume || 0);
    vol += c.volume || 0;
    out[i] = vol > 0 ? pv / vol : tp;
  });
  return out;
}

export function trueRange(candles) {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

export function atr(candles, n = 14) {
  return rma(trueRange(candles), n);
}

export function supertrend(candles, n = 10, mult = 3) {
  const a = atr(candles, n);
  const out = nulls(candles.length);
  const dir = nulls(candles.length);
  let fu = null;
  let fl = null;
  let d = 1;
  for (let i = 0; i < candles.length; i++) {
    if (a[i] == null) continue;
    const c = candles[i];
    const hl2 = (c.high + c.low) / 2;
    const bu = hl2 + mult * a[i];
    const bl = hl2 - mult * a[i];
    const pc = i > 0 ? candles[i - 1].close : c.close;
    const nfu = fu == null || bu < fu || pc > fu ? bu : fu;
    const nfl = fl == null || bl > fl || pc < fl ? bl : fl;
    if (fu != null) {
      if (d === -1 && c.close > fu) d = 1;
      else if (d === 1 && c.close < fl) d = -1;
    }
    fu = nfu;
    fl = nfl;
    out[i] = d === 1 ? fl : fu;
    dir[i] = d;
  }
  return { line: out, dir };
}

export function stochastic(candles, kLen = 14, dLen = 3, smooth = 3) {
  const raw = nulls(candles.length);
  for (let i = kLen - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < kLen; j++) {
      hh = Math.max(hh, candles[i - j].high);
      ll = Math.min(ll, candles[i - j].low);
    }
    raw[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
  }
  const k = sma(raw, smooth);
  const d = sma(k, dLen);
  return { k, d };
}

export function adx(candles, n = 14) {
  const len = candles.length;
  const pdm = nulls(len);
  const mdm = nulls(len);
  for (let i = 1; i < len; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    pdm[i] = up > dn && up > 0 ? up : 0;
    mdm[i] = dn > up && dn > 0 ? dn : 0;
  }
  const tr = trueRange(candles);
  tr[0] = null;
  const str = rma(tr, n);
  const spdm = rma(pdm, n);
  const smdm = rma(mdm, n);
  const pdi = nulls(len);
  const mdi = nulls(len);
  const dx = nulls(len);
  for (let i = 0; i < len; i++) {
    if (str[i] == null || str[i] === 0 || spdm[i] == null || smdm[i] == null) continue;
    pdi[i] = (100 * spdm[i]) / str[i];
    mdi[i] = (100 * smdm[i]) / str[i];
    const s = pdi[i] + mdi[i];
    dx[i] = s === 0 ? 0 : (100 * Math.abs(pdi[i] - mdi[i])) / s;
  }
  return { adx: rma(dx, n), pdi, mdi };
}

export function cci(candles, n = 20) {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const m = sma(tp, n);
  return tp.map((v, i) => {
    if (m[i] == null) return null;
    let md = 0;
    for (let j = 0; j < n; j++) md += Math.abs(tp[i - j] - m[i]);
    md /= n;
    return md === 0 ? 0 : (v - m[i]) / (0.015 * md);
  });
}

export function obv(candles) {
  const out = [];
  let acc = 0;
  candles.forEach((c, i) => {
    if (i > 0) {
      if (c.close > candles[i - 1].close) acc += c.volume || 0;
      else if (c.close < candles[i - 1].close) acc -= c.volume || 0;
    }
    out.push(acc);
  });
  return out;
}

export function williamsR(candles, n = 14) {
  const out = nulls(candles.length);
  for (let i = n - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < n; j++) {
      hh = Math.max(hh, candles[i - j].high);
      ll = Math.min(ll, candles[i - j].low);
    }
    out[i] = hh === ll ? -50 : ((hh - candles[i].close) / (hh - ll)) * -100;
  }
  return out;
}

export function heikinAshi(candles) {
  const out = [];
  candles.forEach((c, i) => {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      time: c.time,
      open,
      close,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      volume: c.volume,
    });
  });
  return out;
}

// ---------- TradingView-style Bollinger Bands (Length, Basis MA Type, Source, StdDev, Offset) ----------
export function pickSource(candles, source = 'close') {
  switch (source) {
    case 'open': return candles.map((c) => c.open);
    case 'high': return candles.map((c) => c.high);
    case 'low': return candles.map((c) => c.low);
    case 'hl2': return candles.map((c) => (c.high + c.low) / 2);
    case 'hlc3': return candles.map((c) => (c.high + c.low + c.close) / 3);
    case 'ohlc4': return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
    default: return candles.map((c) => c.close);
  }
}

export function movingAverage(values, type, n) {
  if (type === 'EMA') return ema(values, n);
  if (type === 'WMA') return wma(values, n);
  if (type === 'RMA') return rma(values, n);
  return sma(values, n);
}

export function shiftSeries(arr, offset) {
  if (!offset) return arr;
  const out = nulls(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const j = i + offset;
    if (j >= 0 && j < arr.length) out[j] = arr[i];
  }
  return out;
}

export function bollingerBands(candles, { length = 20, basis = 'SMA', source = 'close', mult = 2, offset = 0 } = {}) {
  const src = pickSource(candles, source);
  const mid = movingAverage(src, basis, length);
  const upper = nulls(src.length);
  const lower = nulls(src.length);
  for (let i = length - 1; i < src.length; i++) {
    if (mid[i] == null) continue;
    let m = 0;
    for (let j = 0; j < length; j++) m += src[i - j];
    m /= length;
    let sq = 0;
    for (let j = 0; j < length; j++) sq += (src[i - j] - m) ** 2;
    const sd = Math.sqrt(sq / length); // population stdev, same as TradingView
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { basis: shiftSeries(mid, offset), upper: shiftSeries(upper, offset), lower: shiftSeries(lower, offset) };
}
