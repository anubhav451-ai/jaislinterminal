// Strategy engine: built-in strategies + strategies the user pastes in as code.
// A strategy turns candles into BUY / SELL flags. Pure functions, no UI.
import * as TA from './indicators.js';
import { applyConditions, applyTradingDays } from './conditions.js';
import { bollingerBands } from './indicators.js';
import { STEP } from './time.js';
import { INDICATORS, defaultParams } from './registry.js';
import { pyEvaluate, pyIndicators } from './py.js';

export const INTERVAL_OPTIONS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
const INTERVAL_LABELS = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '1h': '1 hour', '4h': '4 hours', '1d': '1 day', '1w': '1 week' };

const titleCase = (k) => k.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase()).trim();

// ---------------------------------------------------------------- built-in strategy
const BUILTIN = [
  {
    id: 'bb-lower-close',
    builtin: true,
    name: 'Bollinger Band Close',
    side: 'both',
    short: 'BUY below the lower Bollinger Band, SELL above the upper Bollinger Band',
    levels: true, // this strategy sets its own stop-loss and target for every signal
    rules: [
      'Timeframe: 1 Day (changeable).',
      'BUY setup: a candle CLOSES below the lower Bollinger Band. The whole candle must be below the band: open, close, high and low. If even the wick touches the band, there is no setup.',
      'BUY entry (confirmation): after the setup, wait. The first GREEN candle (close above open) is the entry, at that candle\'s close.',
      'BUY stop-loss: the low (lower wick) of the candle just before the entry candle. BUY target: the upper Bollinger Band at the entry candle.',
      'SELL is the mirror: a candle fully ABOVE the upper band is the setup, the first RED candle after it is the entry, stop-loss is the high of the candle before it, target is the lower band.',
      'If the stop-loss would not be on the right side of the entry, or the target is not beyond it, that signal is skipped.',
      'Only closed candles are used. A candle that is still forming never gives a signal.',
      'In Settings you can switch the green / red candle confirmation off (then the signal comes on the setup candle itself, like before), and choose BUY + SELL, BUY only or SELL only.',
    ],
    defaults: { interval: '1d', period: 20, basis: 'SMA', source: 'close', mult: 1.5, offset: 0, validBars: 1, signal: 'both', entry: 'confirm', wait: 10 },
    fields: [
      { key: 'signal', label: 'Signals', type: 'select', options: ['both', 'buy', 'sell'], labels: { both: 'BUY + SELL', buy: 'BUY only', sell: 'SELL only' } },
      { key: 'entry', label: 'Entry', type: 'select', options: ['confirm', 'direct'], labels: { confirm: 'Wait for green / red candle', direct: 'On the setup candle' } },
      { key: 'wait', label: 'Wait for the candle (max candles)', type: 'number', min: 1, max: 100, step: 1 },
      { key: 'period', label: 'Length', type: 'number', min: 2, max: 500, step: 1 },
      { key: 'basis', label: 'Basis MA Type', type: 'select', options: ['SMA', 'EMA', 'WMA', 'RMA'] },
      { key: 'source', label: 'Source', type: 'select', options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] },
      { key: 'mult', label: 'StdDev', type: 'number', min: 0.1, max: 10, step: 0.1 },
      { key: 'offset', label: 'Offset', type: 'number', min: -100, max: 100, step: 1 },
    ],
    minBars: 20,
    indicators: (p) => [{ type: 'bb', params: { period: p.period, basis: p.basis, source: p.source, mult: p.mult, offset: p.offset } }],
    evaluate(candles, p) {
      const b = bollingerBands(candles, { length: p.period, basis: p.basis, source: p.source, mult: p.mult, offset: p.offset });
      const sig = p.signal || 'both'; // settings saved before SELL existed have no "signal": they now get BUY + SELL
      const n = candles.length;
      const buySetup = candles.map((c, i) => b.lower[i] != null && c.high < b.lower[i]); // whole candle below the lower band
      const sellSetup = candles.map((c, i) => b.upper[i] != null && c.low > b.upper[i]); // whole candle above the upper band
      if (p.entry === 'direct') {
        return { buy: buySetup.map((x) => sig !== 'sell' && x), sell: sellSetup.map((x) => sig !== 'buy' && x) };
      }
      // confirmation: setup candle -> wait -> first green (BUY) / red (SELL) candle = entry
      const wait = Math.max(1, Math.round(p.wait || 10));
      const buy = new Array(n).fill(false);
      const sell = new Array(n).fill(false);
      const stop = new Array(n).fill(null);
      const target = new Array(n).fill(null);
      let bp = -1; // index of the BUY setup candle we are waiting on
      let sp = -1;
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        if (bp >= 0 && i - bp > wait) bp = -1;
        if (sp >= 0 && i - sp > wait) sp = -1;
        if (bp >= 0 && i > bp && c.close > c.open) {
          const sl = candles[i - 1].low;
          const tp = b.upper[i];
          if (sig !== 'sell' && tp != null && sl < c.close && tp > c.close) {
            buy[i] = true;
            stop[i] = sl;
            target[i] = tp;
          }
          bp = -1;
          continue;
        }
        if (sp >= 0 && i > sp && c.close < c.open) {
          const sl = candles[i - 1].high;
          const tp = b.lower[i];
          if (sig !== 'buy' && tp != null && sl > c.close && tp < c.close) {
            sell[i] = true;
            stop[i] = sl;
            target[i] = tp;
          }
          sp = -1;
          continue;
        }
        if (buySetup[i]) {
          bp = i;
          sp = -1;
        } else if (sellSetup[i]) {
          sp = i;
          bp = -1;
        }
      }
      return { buy, sell, stop, target };
    },
  },
];

// ---------------------------------------------------------------- custom (pasted) strategies
const compiled = new Map(); // code -> definition body (cached)
let custom = []; // [{ id, name, code }]
let names = {}; // id -> renamed title (works for built-in strategies too)

export function setRegistry(customList, nameMap) {
  custom = customList || [];
  names = nameMap || {};
}

// Turn pasted code into a strategy. The code must evaluate to (or `return`) an object:
//   { description, rules[], defaults{}, fields[]?, indicators(p)?, evaluate(candles, p, ta) }
// Accepted shapes: `return {...}`, `({...})`, `module.exports = {...}`, `export default {...}`.
export function compileStrategy(code) {
  if (compiled.has(code)) return compiled.get(code);
  let src = String(code || '').trim();
  if (!src) throw new Error('The code is empty.');
  src = src.replace(/export\s+default\s+/, 'return ').replace(/module\.exports\s*=\s*/, 'return ');
  if (!/\breturn\b/.test(src)) src = `return (${src.replace(/;\s*$/, '')});`;
  let spec;
  try {
    spec = new Function('ta', `"use strict";\n${src}`)(TA);
  } catch (e) {
    throw new Error(`Code error: ${e.message}`);
  }
  if (!spec || typeof spec.evaluate !== 'function') throw new Error('The code must give an object with an evaluate(candles, p, ta) function. Use "Copy AI prompt" so the AI writes it in the right format.');
  const defaults = { interval: '1d', validBars: 1, ...(spec.defaults || {}) };
  if (!INTERVAL_OPTIONS.includes(defaults.interval)) defaults.interval = '1d';
  const body = {
    side: spec.side || 'both',
    short: spec.description || 'Custom strategy',
    rules: Array.isArray(spec.rules) && spec.rules.length ? spec.rules.map(String) : [spec.description || 'Custom strategy (code).'],
    defaults,
    fields: Array.isArray(spec.fields) && spec.fields.length ? spec.fields : autoFields(defaults),
    minBars: Number(spec.minBars) || 2,
    indicators: typeof spec.indicators === 'function' ? spec.indicators : () => [],
    evaluate: spec.evaluate,
  };
  compiled.set(code, body);
  return body;
}

function autoFields(defaults) {
  return Object.entries(defaults)
    .filter(([k, v]) => k !== 'interval' && k !== 'validBars' && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'))
    .map(([k, v]) => (typeof v === 'number' ? { key: k, label: titleCase(k), type: 'number', step: Number.isInteger(v) ? 1 : 0.1 } : typeof v === 'boolean' ? { key: k, label: titleCase(k), type: 'bool' } : { key: k, label: titleCase(k), type: 'text' }));
}

function withTail(def) {
  // every strategy gets the same two common inputs at the end
  const fields = [
    ...def.fields.filter((f) => f.key !== 'interval' && f.key !== 'validBars'),
    { key: 'interval', label: 'Timeframe', type: 'select', options: INTERVAL_OPTIONS, labels: INTERVAL_LABELS },
    { key: 'validBars', label: 'Keep highlighted for (candles)', type: 'number', min: 1, max: 20, step: 1 },
  ];
  return { ...def, fields };
}

export function allStrategies() {
  const list = [...BUILTIN];
  for (const c of custom) {
    if (c.lang === 'py') {
      const m = c.meta || {};
      const defaults = { interval: '1d', validBars: 1, ...(m.defaults || {}) };
      if (!INTERVAL_OPTIONS.includes(defaults.interval)) defaults.interval = '1d';
      list.push({
        id: c.id,
        builtin: false,
        python: true,
        fileName: c.fileName,
        error: null,
        code: c.code,
        name: c.name,
        side: ['buy', 'sell'].includes(m.side) ? m.side : 'both',
        short: m.description || 'Python strategy',
        rules: m.rules?.length ? m.rules : [m.description || 'Python strategy (uploaded file).'],
        defaults,
        fields: autoFields(defaults),
        minBars: m.minBars || 2,
        indicators: (p) => pyIndicators(c.code, p),
        evaluate: (candles, p) => pyEvaluate(c.code, candles, p),
      });
      continue;
    }
    try {
      list.push({ id: c.id, builtin: false, error: null, code: c.code, ...compileStrategy(c.code), name: c.name });
    } catch (e) {
      list.push({ id: c.id, builtin: false, code: c.code, error: e.message, name: c.name, side: 'both', short: 'Code error – open Edit code', rules: [e.message], defaults: { interval: '1d', validBars: 1 }, fields: [], minBars: 2, indicators: () => [], evaluate: () => ({ buy: [], sell: [] }) });
    }
  }
  return list.map((d) => withTail({ ...d, name: names[d.id] || d.name }));
}

export const strategyById = (id) => allStrategies().find((s) => s.id === id) || null;

// ---------------------------------------------------------------- running a strategy
const toFlags = (arr, n) => Array.from({ length: n }, (_, i) => !!(arr && arr[i]));

// Always returns { buy: boolean[n], sell: boolean[n] }, whatever shape the code returned.
export function runStrategy(def, candles, params) {
  const n = candles.length;
  const res = def.evaluate(candles, params, TA);
  let buy;
  let sell;
  if (Array.isArray(res)) buy = res;
  else if (res && typeof res === 'object') {
    if (Array.isArray(res.signal)) {
      buy = res.signal.map((x) => x > 0);
      sell = res.signal.map((x) => x < 0);
    } else {
      buy = res.buy ?? res.signals ?? res.long;
      sell = res.sell ?? res.short ?? res.exit;
    }
  }
  const out = { buy: toFlags(buy, n), sell: toFlags(sell, n) };
  // a strategy can give its own stop-loss and target for each signal (arrays of prices, one per candle)
  const lv = (a) => (Array.isArray(a) ? Array.from({ length: n }, (_, i) => (Number.isFinite(a[i]) ? a[i] : null)) : null);
  const stop = res && !Array.isArray(res) && typeof res === 'object' ? lv(res.stop) : null;
  const target = res && !Array.isArray(res) && typeof res === 'object' ? lv(res.target) : null;
  // the user's extra conditions (dates, days, RSI, trend ...) decide which signals count
  const td = params?.tradingDays ? applyTradingDays(candles, out.buy, out.sell, params.tradingDays) : out;
  const fin = params?.conditions?.items?.length ? applyConditions(candles, td.buy, td.sell, params.conditions) : td;
  return { buy: fin.buy, sell: fin.sell, stop, target };
}

// Try a strategy on REAL candles (passed in) so mistakes are caught when the code is added.
export function testStrategy(def, candles) {
  try {
    const params = { ...def.defaults };
    const t0 = performance.now();
    const { buy, sell } = runStrategy(def, candles, params);
    const ms = Math.round(performance.now() - t0);
    const inds = (def.indicators(params) || []).filter((i) => !INDICATORS[i?.type]);
    return { ok: true, bars: candles.length, buys: buy.filter(Boolean).length, sells: sell.filter(Boolean).length, ms, badIndicators: inds.map((i) => i?.type) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Indicators the strategy wants on the chart, in the shape the chart expects.
export function indicatorsFor(def, params) {
  let list = [];
  try {
    list = def.indicators(params) || [];
  } catch {
    list = [];
  }
  // params.ind[k] = visual overrides the user made on the strategy's settings page ({ params, color })
  return list
    .filter((i) => i && INDICATORS[i.type])
    .map((i, k) => {
      const ov = params?.ind?.[k] || {};
      return { id: `strat-${def.id}-${k}`, type: i.type, locked: true, color: ov.color || i.color || '#1a56db', params: { ...defaultParams(i.type), ...(i.params || {}), ...(ov.params || {}) } };
    });
}

// ---------------------------------------------------------------- candle timing
export function closeTimeOf(c, interval) {
  if (interval === '1d') return c.time + 15 * 3600 + 30 * 60; // NSE closes 15:30 IST
  if (interval === '1w') return c.time + 4 * 86400 + 15 * 3600 + 30 * 60; // Friday 15:30
  if (interval === '4h') return Math.min(c.time + STEP['4h'], Math.floor(c.time / 86400) * 86400 + 15 * 3600 + 30 * 60); // the afternoon bar ends at 15:30
  return c.time + STEP[interval];
}

// Is this candle finished? (nowShift = unix seconds + 19800, same clock as candle times)
export function isComplete(c, interval, nowShift) {
  if (interval === '1d') {
    const day = Math.floor(nowShift / 86400) * 86400;
    return c.time < day || (c.time === day && nowShift - day >= 15 * 3600 + 30 * 60);
  }
  return closeTimeOf(c, interval) <= nowShift;
}

export function closedCandles(candles, interval, nowShift) {
  let n = candles.length;
  while (n > 0 && !isComplete(candles[n - 1], interval, nowShift)) n--;
  return candles.slice(0, n);
}

// All setups in history + the "active" one (inside the last validBars closed candles).
export function scan(candles, def, params, nowShift) {
  const done = closedCandles(candles, params.interval, nowShift);
  if (done.length < Math.max(2, params.period || def.minBars || 2)) return { hits: [], active: null, count: done.length };
  const { buy, sell, stop, target } = runStrategy(def, done, params);
  const hits = [];
  const lv = (i) => ({ stop: stop?.[i] ?? null, target: target?.[i] ?? null });
  done.forEach((c, i) => {
    if (buy[i]) hits.push({ time: c.time, price: c.close, i, side: 'buy', formedAt: closeTimeOf(c, params.interval), ...lv(i) });
    if (sell[i]) hits.push({ time: c.time, price: c.close, i, side: 'sell', formedAt: closeTimeOf(c, params.interval), ...lv(i) });
  });
  const n = done.length;
  const recent = hits.filter((h) => h.i >= n - Math.max(1, params.validBars || 1));
  return { hits, active: recent.length ? recent[recent.length - 1] : null, count: n };
}

export function markersFor(candles, def, params, nowShift, upColor = '#26a69a', downColor = '#ef5350') {
  return scan(candles, def, params, nowShift).hits.map((h) =>
    h.side === 'buy'
      ? { time: h.time, position: 'belowBar', color: upColor, shape: 'arrowUp', text: 'BUY' }
      : { time: h.time, position: 'aboveBar', color: downColor, shape: 'arrowDown', text: 'SELL' }
  );
}

// "5m ago" style text
export function agoText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ${Math.floor((s % 3600) / 60)} min ago`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} hr` : ''} ago`;
}

// a setup is "fresh" while it is on the newest candle(s)
export const isFresh = (sig, nowShift) => nowShift - sig.formedAt <= Math.max(1800, Math.min(STEP[sig.interval] || 3600, 86400));

// ---------------------------------------------------------------- templates for the "Add strategy" screen
export const STRATEGY_TEMPLATE = `// Example: EMA crossover. Replace the logic with your own.
// ta has: sma, ema, wma, rma, rsi, macd, bollingerBands, atr, supertrend, vwap, stochastic, adx, cci, obv, williamsR ...
return {
  description: 'BUY when fast EMA crosses above slow EMA, SELL when it crosses below',
  rules: [
    'BUY on the candle where EMA(fast) closes above EMA(slow) after being below.',
    'SELL on the candle where EMA(fast) closes below EMA(slow) after being above.',
  ],
  defaults: { interval: '15m', fast: 9, slow: 21 },
  // lines drawn on the chart when this strategy is applied (types: sma ema wma bb vwap supertrend rsi macd ...)
  indicators: (p) => [
    { type: 'ema', params: { period: p.fast }, color: '#f6c343' },
    { type: 'ema', params: { period: p.slow }, color: '#2962ff' },
  ],
  // candles = [{ time, open, high, low, close, volume }]  ->  must return { buy: boolean[], sell: boolean[] }
  evaluate: (candles, p, ta) => {
    const close = candles.map((c) => c.close);
    const f = ta.ema(close, p.fast);
    const s = ta.ema(close, p.slow);
    const buy = candles.map((_, i) => i > 0 && f[i] != null && s[i] != null && f[i - 1] != null && s[i - 1] != null && f[i - 1] <= s[i - 1] && f[i] > s[i]);
    const sell = candles.map((_, i) => i > 0 && f[i] != null && s[i] != null && f[i - 1] != null && s[i - 1] != null && f[i - 1] >= s[i - 1] && f[i] < s[i]);
    return { buy, sell };
  },
};`;

export const AI_PROMPT = `Write a trading strategy for my web terminal in plain JavaScript (the app runs it in the browser, no imports, no network calls).

Output ONLY one code block, in exactly this shape:

return {
  description: 'one line',
  rules: ['rule 1', 'rule 2'],
  defaults: { interval: '15m', someParam: 20 },   // every number/text/boolean here becomes an editable input; interval is one of 1m 5m 15m 1h 1d 1w
  indicators: (p) => [ { type: 'ema', params: { period: p.someParam }, color: '#f6c343' } ],   // optional, drawn on the chart. types: sma ema wma bb vwap supertrend rsi macd stoch adx atr cci willr obv
  evaluate: (candles, p, ta) => {
    // candles = [{ time, open, high, low, close, volume }] oldest first
    // ta = { sma, ema, wma, rma, rsi, macd, bollingerBands, atr, supertrend, vwap, stochastic, adx, cci, obv, williamsR }
    // return { buy: boolean[], sell: boolean[] } -- same length as candles. Use only data up to candle i (no look-ahead). Use null-checks for indicator warm-up.
    return { buy, sell };
  },
};

My strategy logic:
`;

// ---------------------------------------------------------------- download as a Python file
const BUILTIN_PY = {
  'bb-lower-close': `# Bollinger Band Close  (built-in strategy, exported as a Python file)
# You can upload this file again from Strategy tab -> Add strategy.
DESCRIPTION = "BUY below the lower Bollinger Band, SELL above the upper Bollinger Band"
RULES = [
    "BUY: a candle closes below the lower Bollinger Band (the whole candle is below the band).",
    "SELL: a candle closes above the upper Bollinger Band (the whole candle is above the band).",
    "Only closed candles are used.",
]
DEFAULTS = {"interval": "1d", "period": 20, "mult": 1.5, "signal": "both"}   # signal: both / buy / sell
SIDE = "both"
MIN_BARS = 20


def indicators(p):
    return [{"type": "bb", "params": {"period": p["period"], "basis": "SMA", "source": "close", "mult": p["mult"], "offset": 0}}]


def evaluate(candles, p):
    high, low = candles["high"], candles["low"]
    mid, upper, lower = ta.bbands(candles["close"], p["period"], p["mult"])
    sig = p["signal"]
    n = len(high)
    buy = [sig != "sell" and lower[i] is not None and high[i] < lower[i] for i in range(n)]
    sell = [sig != "buy" and upper[i] is not None and low[i] > upper[i] for i in range(n)]
    return {"buy": buy, "sell": sell}
`,
};

export function strategyPySource(def) {
  if (def.code) return def.code;
  return BUILTIN_PY[def.id] || `# ${def.name}\n# No Python source is available for this strategy.\n`;
}

export function downloadPy(def) {
  const text = strategyPySource(def);
  const base = (def.name || 'strategy').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'strategy';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/x-python' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.py`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
