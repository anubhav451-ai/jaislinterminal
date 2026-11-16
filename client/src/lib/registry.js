import * as I from './indicators.js';
import { isIntraday } from './time.js';
import { MORE, GROUP_OF } from './registryMore.js';

// Each indicator: where it is drawn (main price pane or its own pane), its
// editable params and a compute() that returns line/histogram descriptors.

export const PALETTE = ['#1a56db', '#0b2a6f', '#0ea5e9', '#6366f1', '#0891b2', '#64748b', '#3b82f6', '#1e3a8a'];

const pts = (candles, arr, color) =>
  candles.reduce((acc, c, i) => {
    if (arr[i] != null && Number.isFinite(arr[i])) acc.push({ time: c.time, value: arr[i], ...(color ? { color: color(i) } : {}) });
    return acc;
  }, []);

const line = (name, candles, arr, color, width = 2, extra = {}) => ({
  type: 'line',
  name,
  color,
  width,
  data: pts(candles, arr),
  ...extra,
});

export const INDICATORS = {
  sma: {
    usesColor: true,
    label: 'SMA – Simple Moving Average',
    short: 'SMA',
    pane: 'main',
    params: [{ key: 'period', label: 'Period', def: 20, min: 1, max: 500 }],
    compute: (c, p, color) => ({ series: [line(`SMA ${p.period}`, c, I.sma(I.closes(c), p.period), color)] }),
  },
  ema: {
    usesColor: true,
    label: 'EMA – Exponential Moving Average',
    short: 'EMA',
    pane: 'main',
    params: [{ key: 'period', label: 'Period', def: 20, min: 1, max: 500 }],
    compute: (c, p, color) => ({ series: [line(`EMA ${p.period}`, c, I.ema(I.closes(c), p.period), color)] }),
  },
  wma: {
    usesColor: true,
    label: 'WMA – Weighted Moving Average',
    short: 'WMA',
    pane: 'main',
    params: [{ key: 'period', label: 'Period', def: 20, min: 1, max: 500 }],
    compute: (c, p, color) => ({ series: [line(`WMA ${p.period}`, c, I.wma(I.closes(c), p.period), color)] }),
  },
  bb: {
    label: 'Bollinger Bands',
    short: 'BB',
    pane: 'main',
    params: [
      { key: 'period', label: 'Length', def: 20, min: 2, max: 500 },
      { key: 'basis', label: 'Basis MA Type', type: 'select', options: ['SMA', 'EMA', 'WMA', 'RMA'], def: 'SMA' },
      { key: 'source', label: 'Source', type: 'select', options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'], def: 'close' },
      { key: 'mult', label: 'StdDev', def: 2, min: 0.1, max: 10, step: 0.1 },
      { key: 'offset', label: 'Offset', def: 0, min: -100, max: 100, title: false },
      { key: 'cUpper', label: 'Upper colour', type: 'color', def: '#0b2a6f' },
      { key: 'cBasis', label: 'Basis colour', type: 'color', def: '#1a56db' },
      { key: 'cLower', label: 'Lower colour', type: 'color', def: '#0ea5e9' },
      { key: 'fill', label: 'Fill between bands', type: 'bool', def: true },
    ],
    compute: (c, p0) => {
      const p = { ...defaultParams('bb'), ...p0 };
      const b = I.bollingerBands(c, { length: p.period, basis: p.basis, source: p.source, mult: p.mult, offset: p.offset });
      return {
        series: [line('BB upper', c, b.upper, p.cUpper, 1), line('BB basis', c, b.mid ?? b.basis, p.cBasis, 1), line('BB lower', c, b.lower, p.cLower, 1)],
      };
    },
  },
  vwap: {
    usesColor: true,
    label: 'VWAP (intraday only)',
    short: 'VWAP',
    pane: 'main',
    params: [],
    compute: (c, _p, color, ctx) => ({
      series: isIntraday(ctx.interval) ? [line('VWAP', c, I.vwap(c), color)] : [],
    }),
  },
  supertrend: {
    label: 'Supertrend',
    short: 'ST',
    pane: 'main',
    params: [
      { key: 'period', label: 'ATR', def: 10, min: 1, max: 100 },
      { key: 'mult', label: 'Factor', def: 3, min: 0.5, max: 10, step: 0.5 },
    ],
    compute: (c, p) => {
      const st = I.supertrend(c, p.period, p.mult);
      return {
        series: [
          {
            type: 'line',
            name: `Supertrend`,
            color: '#1a56db',
            width: 2,
            data: c.reduce((acc, x, i) => {
              if (st.line[i] != null) acc.push({ time: x.time, value: st.line[i], color: st.dir[i] === 1 ? '#1a56db' : '#0b2a6f' });
              return acc;
            }, []),
          },
        ],
      };
    },
  },
  rsi: {
    usesColor: true,
    label: 'RSI – Relative Strength Index',
    short: 'RSI',
    pane: 'sub',
    params: [{ key: 'period', label: 'Period', def: 14, min: 2, max: 200 }],
    compute: (c, p, color) => ({
      series: [line(`RSI ${p.period}`, c, I.rsi(I.closes(c), p.period), color || '#1a56db')],
      levels: [70, 50, 30],
      range: [0, 100],
    }),
  },
  macd: {
    label: 'MACD',
    short: 'MACD',
    pane: 'sub',
    params: [
      { key: 'fast', label: 'Fast', def: 12, min: 2, max: 100 },
      { key: 'slow', label: 'Slow', def: 26, min: 3, max: 200 },
      { key: 'signal', label: 'Signal', def: 9, min: 2, max: 100 },
    ],
    compute: (c, p) => {
      const m = I.macd(I.closes(c), p.fast, p.slow, p.signal);
      const hist = c.reduce((acc, x, i) => {
        if (m.hist[i] == null) return acc;
        const prev = m.hist[i - 1] ?? 0;
        const up = m.hist[i] >= 0;
        const strong = Math.abs(m.hist[i]) >= Math.abs(prev);
        const color = up ? (strong ? '#1a56db' : '#93b4f3') : strong ? '#0b2a6f' : '#8da0c4';
        acc.push({ time: x.time, value: m.hist[i], color });
        return acc;
      }, []);
      return {
        series: [
          { type: 'hist', name: 'Hist', color: '#1a56db', data: hist },
          line('MACD', c, m.line, '#1a56db', 2),
          line('Signal', c, m.signal, '#0ea5e9', 2),
        ],
        levels: [0],
      };
    },
  },
  stoch: {
    label: 'Stochastic',
    short: 'Stoch',
    pane: 'sub',
    params: [
      { key: 'k', label: '%K', def: 14, min: 1, max: 100 },
      { key: 'd', label: '%D', def: 3, min: 1, max: 50 },
      { key: 'smooth', label: 'Smooth', def: 3, min: 1, max: 50 },
    ],
    compute: (c, p) => {
      const s = I.stochastic(c, p.k, p.d, p.smooth);
      return { series: [line('%K', c, s.k, '#1a56db', 2), line('%D', c, s.d, '#0b2a6f', 2)], levels: [80, 20], range: [0, 100] };
    },
  },
  adx: {
    label: 'ADX / DMI',
    short: 'ADX',
    pane: 'sub',
    params: [{ key: 'period', label: 'Period', def: 14, min: 2, max: 100 }],
    compute: (c, p) => {
      const a = I.adx(c, p.period);
      return {
        series: [line('ADX', c, a.adx, '#0b2a6f', 2), line('+DI', c, a.pdi, '#1a56db', 1), line('-DI', c, a.mdi, '#0ea5e9', 1)],
        levels: [25],
      };
    },
  },
  atr: {
    usesColor: true,
    label: 'ATR – Average True Range',
    short: 'ATR',
    pane: 'sub',
    params: [{ key: 'period', label: 'Period', def: 14, min: 1, max: 100 }],
    compute: (c, p, color) => ({ series: [line(`ATR ${p.period}`, c, I.atr(c, p.period), color || '#0b2a6f')] }),
  },
  cci: {
    usesColor: true,
    label: 'CCI – Commodity Channel Index',
    short: 'CCI',
    pane: 'sub',
    params: [{ key: 'period', label: 'Period', def: 20, min: 2, max: 200 }],
    compute: (c, p, color) => ({ series: [line(`CCI ${p.period}`, c, I.cci(c, p.period), color || '#0ea5e9')], levels: [100, 0, -100] }),
  },
  willr: {
    usesColor: true,
    label: 'Williams %R',
    short: '%R',
    pane: 'sub',
    params: [{ key: 'period', label: 'Period', def: 14, min: 2, max: 200 }],
    compute: (c, p, color) => ({
      series: [line(`%R ${p.period}`, c, I.williamsR(c, p.period), color || '#6366f1')],
      levels: [-20, -80],
      range: [-100, 0],
    }),
  },
  obv: {
    usesColor: true,
    label: 'OBV – On Balance Volume',
    short: 'OBV',
    pane: 'sub',
    params: [],
    compute: (c, _p, color) => ({ series: [line('OBV', c, I.obv(c), color || '#64748b')] }),
  },
};

Object.assign(INDICATORS, MORE);
for (const [id, g] of Object.entries(GROUP_OF)) if (INDICATORS[id]) INDICATORS[id].group = g;

export const INDICATOR_LIST = Object.entries(INDICATORS).map(([id, d]) => ({ id, ...d }));

export function defaultParams(type) {
  return Object.fromEntries(INDICATORS[type].params.map((p) => [p.key, p.def]));
}

export function indicatorTitle(ind) {
  const d = INDICATORS[ind.type];
  const vals = d.params
    .filter((p) => p.type !== 'color' && p.type !== 'bool' && !(p.title === false && !ind.params[p.key]))
    .map((p) => ind.params[p.key] ?? p.def)
    .join(' ');
  return vals ? `${d.short} ${vals}` : d.short;
}
