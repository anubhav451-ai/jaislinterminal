// More indicator maths. Same rules as indicators.js: arrays in, same-length arrays out, null = not ready yet.
import { sma, rma, rsi, trueRange, bollingerBands } from './indicators.js';

const N = (n) => new Array(n).fill(null);
const ok = (v) => v != null && Number.isFinite(v);
const sub = (a, b) => a.map((x, i) => (ok(x) && ok(b[i]) ? x - b[i] : null));
const add = (a, b) => a.map((x, i) => (ok(x) && ok(b[i]) ? x + b[i] : null));
const scale = (a, k) => a.map((x) => (ok(x) ? x * k : null));

export const hl2 = (c) => c.map((x) => (x.high + x.low) / 2);
export const hlc3 = (c) => c.map((x) => (x.high + x.low + x.close) / 3);
const vol = (c) => c.map((x) => x.volume || 0);

export function emaN(v, n) {
  const out = N(v.length);
  const k = 2 / (n + 1);
  let prev = null;
  let cnt = 0;
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (!ok(x)) {
      prev = null;
      cnt = 0;
      sum = 0;
      continue;
    }
    if (prev == null) {
      sum += x;
      cnt++;
      if (cnt === n) {
        prev = sum / n;
        out[i] = prev;
      }
    } else {
      prev = x * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function windowed(v, n, fn) {
  const out = N(v.length);
  for (let i = n - 1; i < v.length; i++) {
    let good = true;
    for (let j = i - n + 1; j <= i; j++) if (!ok(v[j])) { good = false; break; }
    if (good) out[i] = fn(v, i - n + 1, i);
  }
  return out;
}
export const highest = (v, n) => windowed(v, n, (a, s, e) => { let m = -Infinity; for (let j = s; j <= e; j++) if (a[j] > m) m = a[j]; return m; });
export const lowest = (v, n) => windowed(v, n, (a, s, e) => { let m = Infinity; for (let j = s; j <= e; j++) if (a[j] < m) m = a[j]; return m; });
export const sumN = (v, n) => windowed(v, n, (a, s, e) => { let t = 0; for (let j = s; j <= e; j++) t += a[j]; return t; });
export const stdev = (v, n) => windowed(v, n, (a, s, e) => { let m = 0; for (let j = s; j <= e; j++) m += a[j]; m /= n; let q = 0; for (let j = s; j <= e; j++) q += (a[j] - m) ** 2; return Math.sqrt(q / n); });
export const wmaN = (v, n) => windowed(v, n, (a, s, e) => { let t = 0; for (let j = s; j <= e; j++) t += a[j] * (j - s + 1); return t / ((n * (n + 1)) / 2); });
export const linreg = (v, n) =>
  windowed(v, n, (a, s, e) => {
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let j = s; j <= e; j++) { const x = j - s; sx += x; sy += a[j]; sxy += x * a[j]; sxx += x * x; }
    const den = n * sxx - sx * sx;
    const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
    return (sy - slope * sx) / n + slope * (n - 1);
  });
export const rocArr = (v, n) => v.map((x, i) => (i >= n && ok(x) && ok(v[i - n]) && v[i - n] !== 0 ? (x / v[i - n] - 1) * 100 : null));

// ---------------- moving averages ----------------
export const hma = (v, n) => wmaN(sub(scale(wmaN(v, Math.max(1, Math.floor(n / 2))), 2), wmaN(v, n)), Math.max(1, Math.round(Math.sqrt(n))));
export function dema(v, n) { const e1 = emaN(v, n); return sub(scale(e1, 2), emaN(e1, n)); }
export function tema(v, n) { const e1 = emaN(v, n); const e2 = emaN(e1, n); const e3 = emaN(e2, n); return add(sub(scale(e1, 3), scale(e2, 3)), e3); }
export function zlema(v, n) { const lag = Math.floor((n - 1) / 2); return emaN(v.map((x, i) => (i >= lag ? 2 * x - v[i - lag] : null)), n); }
export function vwma(c, n) { const pv = c.map((x) => x.close * (x.volume || 0)); const a = sumN(pv, n); const b = sumN(vol(c), n); return a.map((x, i) => (ok(x) && b[i] > 0 ? x / b[i] : null)); }
export function kama(v, n = 10, fast = 2, slow = 30) {
  const out = N(v.length);
  const f = 2 / (fast + 1), s = 2 / (slow + 1);
  let prev = null;
  for (let i = n; i < v.length; i++) {
    let vsum = 0;
    for (let j = i - n + 1; j <= i; j++) vsum += Math.abs(v[j] - v[j - 1]);
    const er = vsum === 0 ? 0 : Math.abs(v[i] - v[i - n]) / vsum;
    const sc = (er * (f - s) + s) ** 2;
    prev = prev == null ? v[i - 1] : prev;
    prev = prev + sc * (v[i] - prev);
    out[i] = prev;
  }
  return out;
}
export function mcginley(v, n) {
  const out = N(v.length);
  let md = null;
  for (let i = 0; i < v.length; i++) {
    md = md == null ? v[i] : md + (v[i] - md) / (0.6 * n * (v[i] / md) ** 4);
    out[i] = i >= n ? md : null;
  }
  return out;
}

// ---------------- overlays ----------------
export function keltner(c, n = 20, mult = 2, atrN = 10) {
  const mid = emaN(c.map((x) => x.close), n);
  const tr = trueRange(c);
  const a = rma(tr, atrN);
  return { mid, upper: mid.map((m, i) => (ok(m) && ok(a[i]) ? m + mult * a[i] : null)), lower: mid.map((m, i) => (ok(m) && ok(a[i]) ? m - mult * a[i] : null)) };
}
export function donchian(c, n = 20) {
  const upper = highest(c.map((x) => x.high), n);
  const lower = lowest(c.map((x) => x.low), n);
  return { upper, lower, mid: upper.map((u, i) => (ok(u) && ok(lower[i]) ? (u + lower[i]) / 2 : null)) };
}
export function psar(c, step = 0.02, inc = 0.02, max = 0.2) {
  const n = c.length;
  const up = N(n), dn = N(n);
  if (n < 3) return { up, dn };
  let bull = c[1].close >= c[0].close;
  let sar = bull ? c[0].low : c[0].high;
  let ep = bull ? c[0].high : c[0].low;
  let af = step;
  for (let i = 1; i < n; i++) {
    let next = sar + af * (ep - sar);
    if (bull) {
      next = Math.min(next, c[i - 1].low, i >= 2 ? c[i - 2].low : c[i - 1].low);
      if (c[i].low < next) { bull = false; next = ep; ep = c[i].low; af = step; }
      else if (c[i].high > ep) { ep = c[i].high; af = Math.min(af + inc, max); }
    } else {
      next = Math.max(next, c[i - 1].high, i >= 2 ? c[i - 2].high : c[i - 1].high);
      if (c[i].high > next) { bull = true; next = ep; ep = c[i].high; af = step; }
      else if (c[i].low < ep) { ep = c[i].low; af = Math.min(af + inc, max); }
    }
    sar = next;
    if (bull) up[i] = sar; else dn[i] = sar;
  }
  return { up, dn };
}
export function ichimoku(c, conv = 9, base = 26, spanB = 52, disp = 26) {
  const h = c.map((x) => x.high), l = c.map((x) => x.low);
  const mid = (len) => { const hh = highest(h, len), ll = lowest(l, len); return hh.map((x, i) => (ok(x) && ok(ll[i]) ? (x + ll[i]) / 2 : null)); };
  const tenkan = mid(conv), kijun = mid(base);
  const a0 = tenkan.map((x, i) => (ok(x) && ok(kijun[i]) ? (x + kijun[i]) / 2 : null));
  const b0 = mid(spanB);
  const shift = (arr, k) => { const out = N(arr.length); for (let i = 0; i < arr.length; i++) { const j = i + k; if (j >= 0 && j < arr.length) out[j] = arr[i]; } return out; };
  return { tenkan, kijun, spanA: shift(a0, disp), spanB: shift(b0, disp), lag: shift(c.map((x) => x.close), -disp) };
}
export function alligator(c) {
  const m = hl2(c);
  const shift = (arr, k) => { const out = N(arr.length); for (let i = 0; i < arr.length; i++) if (i + k < arr.length) out[i + k] = arr[i]; return out; };
  return { jaw: shift(rma(m, 13), 8), teeth: shift(rma(m, 8), 5), lips: shift(rma(m, 5), 3) };
}
export function chandelier(c, n = 22, mult = 3) {
  const a = rma(trueRange(c), n);
  const hh = highest(c.map((x) => x.high), n), ll = lowest(c.map((x) => x.low), n);
  return { long: hh.map((x, i) => (ok(x) && ok(a[i]) ? x - mult * a[i] : null)), short: ll.map((x, i) => (ok(x) && ok(a[i]) ? x + mult * a[i] : null)) };
}

// ---------------- oscillators ----------------
export function mfi(c, n = 14) {
  const tp = hlc3(c);
  const pos = N(c.length), neg = N(c.length);
  for (let i = 1; i < c.length; i++) {
    const f = tp[i] * (c[i].volume || 0);
    pos[i] = tp[i] > tp[i - 1] ? f : 0;
    neg[i] = tp[i] < tp[i - 1] ? f : 0;
  }
  const p = sumN(pos, n), q = sumN(neg, n);
  return p.map((x, i) => (ok(x) && ok(q[i]) ? (q[i] === 0 ? (x === 0 ? null : 100) : 100 - 100 / (1 + x / q[i])) : null));
}
export function aroon(c, n = 14) {
  const up = N(c.length), dn = N(c.length);
  for (let i = n; i < c.length; i++) {
    let hi = i, lo = i;
    for (let j = i - n; j <= i; j++) { if (c[j].high >= c[hi].high) hi = j; if (c[j].low <= c[lo].low) lo = j; }
    up[i] = (100 * (n - (i - hi))) / n;
    dn[i] = (100 * (n - (i - lo))) / n;
  }
  return { up, dn };
}
const mfm = (x) => (x.high === x.low ? 0 : ((x.close - x.low) - (x.high - x.close)) / (x.high - x.low));
export function adl(c) { let t = 0; return c.map((x) => (t += mfm(x) * (x.volume || 0))); }
export function cmf(c, n = 20) {
  const a = sumN(c.map((x) => mfm(x) * (x.volume || 0)), n), b = sumN(vol(c), n);
  return a.map((x, i) => (ok(x) && b[i] > 0 ? x / b[i] : null));
}
export function forceIndex(c, n = 13) { return emaN(c.map((x, i) => (i ? (x.close - c[i - 1].close) * (x.volume || 0) : null)), n); }
export function stochRsi(v, rsiN = 14, stN = 14, kN = 3, dN = 3) {
  const r = rsi(v, rsiN);
  const hh = highest(r, stN), ll = lowest(r, stN);
  const st = r.map((x, i) => (ok(x) && ok(hh[i]) && ok(ll[i]) ? (hh[i] === ll[i] ? 0 : ((x - ll[i]) / (hh[i] - ll[i])) * 100) : null));
  const k = sma(st, kN);
  return { k, d: sma(k, dN) };
}
export function ultimate(c, a = 7, b = 14, d = 28) {
  const bp = N(c.length), tr = N(c.length);
  for (let i = 1; i < c.length; i++) {
    const lo = Math.min(c[i].low, c[i - 1].close), hi = Math.max(c[i].high, c[i - 1].close);
    bp[i] = c[i].close - lo;
    tr[i] = hi - lo;
  }
  const avg = (n) => { const x = sumN(bp, n), y = sumN(tr, n); return x.map((v, i) => (ok(v) && y[i] > 0 ? v / y[i] : null)); };
  const A = avg(a), B = avg(b), C = avg(d);
  return A.map((x, i) => (ok(x) && ok(B[i]) && ok(C[i]) ? (100 * (4 * x + 2 * B[i] + C[i])) / 7 : null));
}
export function elder(c, n = 13) {
  const e = emaN(c.map((x) => x.close), n);
  return { bull: c.map((x, i) => (ok(e[i]) ? x.high - e[i] : null)), bear: c.map((x, i) => (ok(e[i]) ? x.low - e[i] : null)) };
}
export function bbPercent(c, n = 20, mult = 2) {
  const b = bollingerBands(c, { length: n, mult });
  return c.map((x, i) => (ok(b.upper[i]) && b.upper[i] !== b.lower[i] ? (x.close - b.lower[i]) / (b.upper[i] - b.lower[i]) : null));
}
export function bbWidth(c, n = 20, mult = 2) {
  const b = bollingerBands(c, { length: n, mult });
  return c.map((_, i) => (ok(b.upper[i]) && b.basis[i] ? (b.upper[i] - b.lower[i]) / b.basis[i] : null));
}
export function vortex(c, n = 14) {
  const vp = N(c.length), vm = N(c.length);
  for (let i = 1; i < c.length; i++) { vp[i] = Math.abs(c[i].high - c[i - 1].low); vm[i] = Math.abs(c[i].low - c[i - 1].high); }
  const tr = sumN(trueRange(c).map((x, i) => (i ? x : null)), n);
  const p = sumN(vp, n), m = sumN(vm, n);
  return { plus: p.map((x, i) => (ok(x) && tr[i] > 0 ? x / tr[i] : null)), minus: m.map((x, i) => (ok(x) && tr[i] > 0 ? x / tr[i] : null)) };
}
export function kst(v) {
  const s = (len, sm) => sma(rocArr(v, len), sm);
  const a = s(10, 10), b = s(15, 10), c2 = s(20, 10), d = s(30, 15);
  const line = a.map((x, i) => (ok(x) && ok(b[i]) && ok(c2[i]) && ok(d[i]) ? x + 2 * b[i] + 3 * c2[i] + 4 * d[i] : null));
  return { line, signal: sma(line, 9) };
}
export function coppock(v, w = 10, l = 14, s = 11) { return wmaN(add(rocArr(v, l), rocArr(v, s)), w); }
export function tsi(v, long = 25, short = 13, sig = 13) {
  const m = v.map((x, i) => (i ? x - v[i - 1] : null));
  const num = emaN(emaN(m, long), short);
  const den = emaN(emaN(m.map((x) => (ok(x) ? Math.abs(x) : null)), long), short);
  const line = num.map((x, i) => (ok(x) && ok(den[i]) && den[i] !== 0 ? (100 * x) / den[i] : null));
  return { line, signal: emaN(line, sig) };
}
export function dpo(v, n = 20) { const s = sma(v, n); const k = Math.floor(n / 2) + 1; return v.map((_, i) => (ok(s[i]) && i - k >= 0 ? v[i - k] - s[i] : null)); }
export function fisher(c, n = 9) {
  const m = hl2(c);
  const hh = highest(m, n), ll = lowest(m, n);
  const fish = N(c.length), sig = N(c.length);
  let v = 0, f = 0;
  for (let i = 0; i < c.length; i++) {
    if (!ok(hh[i])) continue;
    const raw = hh[i] === ll[i] ? 0 : (m[i] - ll[i]) / (hh[i] - ll[i]) - 0.5;
    v = Math.max(-0.999, Math.min(0.999, 0.66 * raw + 0.67 * v));
    const prev = f;
    f = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * f;
    fish[i] = f;
    sig[i] = prev;
  }
  return { fish, sig };
}
export function cmo(v, n = 9) {
  const up = v.map((x, i) => (i ? Math.max(x - v[i - 1], 0) : null)), dn = v.map((x, i) => (i ? Math.max(v[i - 1] - x, 0) : null));
  const a = sumN(up, n), b = sumN(dn, n);
  return a.map((x, i) => (ok(x) && ok(b[i]) && x + b[i] !== 0 ? (100 * (x - b[i])) / (x + b[i]) : null));
}
export function ppo(v, fast = 12, slow = 26, sig = 9) {
  const f = emaN(v, fast), s = emaN(v, slow);
  const line = f.map((x, i) => (ok(x) && ok(s[i]) && s[i] !== 0 ? ((x - s[i]) / s[i]) * 100 : null));
  const signal = emaN(line, sig);
  return { line, signal, hist: sub(line, signal) };
}
export function eom(c, n = 14) {
  const m = hl2(c);
  const raw = c.map((x, i) => (i && x.volume > 0 ? (10000 * (m[i] - m[i - 1]) * (x.high - x.low)) / x.volume : null));
  return sma(raw, n);
}
export function massIndex(c, n = 25) {
  const r = c.map((x) => x.high - x.low);
  const e1 = emaN(r, 9), e2 = emaN(e1, 9);
  return sumN(e1.map((x, i) => (ok(x) && ok(e2[i]) && e2[i] !== 0 ? x / e2[i] : null)), n);
}
export function choppiness(c, n = 14) {
  const tr = sumN(trueRange(c).map((x, i) => (i ? x : null)), n);
  const hh = highest(c.map((x) => x.high), n), ll = lowest(c.map((x) => x.low), n);
  return tr.map((x, i) => (ok(x) && ok(hh[i]) && hh[i] !== ll[i] ? (100 * Math.log10(x / (hh[i] - ll[i]))) / Math.log10(n) : null));
}
export function squeeze(c, n = 20, bbMult = 2, kcMult = 1.5) {
  const close = c.map((x) => x.close);
  const basis = sma(close, n), dev = scale(stdev(close, n), bbMult);
  const tr = sma(trueRange(c), n);
  const hh = highest(c.map((x) => x.high), n), ll = lowest(c.map((x) => x.low), n);
  const on = c.map((_, i) => ok(basis[i]) && ok(dev[i]) && ok(tr[i]) && basis[i] - dev[i] > basis[i] - kcMult * tr[i] && basis[i] + dev[i] < basis[i] + kcMult * tr[i]);
  const src = close.map((x, i) => (ok(hh[i]) && ok(basis[i]) ? x - ((hh[i] + ll[i]) / 2 + basis[i]) / 2 : null));
  return { val: linreg(src, n), on };
}
export function waveTrend(c, n1 = 10, n2 = 21) {
  const ap = hlc3(c);
  const esa = emaN(ap, n1);
  const d = emaN(ap.map((x, i) => (ok(esa[i]) ? Math.abs(x - esa[i]) : null)), n1);
  const ci = ap.map((x, i) => (ok(esa[i]) && ok(d[i]) && d[i] !== 0 ? (x - esa[i]) / (0.015 * d[i]) : null));
  const wt1 = emaN(ci, n2);
  return { wt1, wt2: sma(wt1, 4) };
}
export function histVol(c, n = 10, annual = 252) {
  const r = c.map((x, i) => (i && c[i - 1].close > 0 ? Math.log(x.close / c[i - 1].close) : null));
  return stdev(r, n).map((x) => (ok(x) ? x * Math.sqrt(annual) * 100 : null));
}
