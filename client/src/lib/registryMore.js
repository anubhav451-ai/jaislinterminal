// Extra indicators (merged into INDICATORS by registry.js).
import * as I from './indicators.js';
import * as J from './indicators2.js';

const ok = (v) => v != null && Number.isFinite(v);
const closes = (c) => c.map((x) => x.close);
const num = (key, label, def, min = 1, max = 500, step) => ({ key, label, def, min, max, ...(step ? { step } : {}) });
const col = (key, label, def) => ({ key, label, type: 'color', def });
const B = { blue: '#1a56db', navy: '#0b2a6f', sky: '#0ea5e9', indigo: '#6366f1', teal: '#0891b2', slate: '#64748b', light: '#93b4f3', deep: '#1e3a8a' };

const line = (name, c, arr, color, width = 2) => ({
  type: 'line',
  name,
  color,
  width,
  data: c.reduce((acc, x, i) => (ok(arr[i]) ? (acc.push({ time: x.time, value: arr[i] }), acc) : acc), []),
});
// line with real gaps (Parabolic SAR changes side)
const gapLine = (name, c, arr, color, width = 2) => ({ type: 'line', name, color, width, data: c.map((x, i) => (ok(arr[i]) ? { time: x.time, value: arr[i] } : { time: x.time })) });
const hist = (name, c, arr, colorOf) => ({
  type: 'hist',
  name,
  color: B.blue,
  data: c.reduce((acc, x, i) => (ok(arr[i]) ? (acc.push({ time: x.time, value: arr[i], color: colorOf(arr[i], arr[i - 1], i) }), acc) : acc), []),
});
const single = (short, label, group, params, fn, extra = {}) => ({
  label,
  short,
  group,
  pane: extra.pane || 'main',
  usesColor: true,
  params,
  compute: (c, p, color, ctx) => ({ series: [line(short, c, fn(c, p, ctx), color || B.blue)], ...(extra.levels ? { levels: extra.levels } : {}), ...(extra.range ? { range: extra.range } : {}) }),
});
const cl = closes;

export const MORE = {
  // ---------------- moving averages ----------------
  hma: single('HMA', 'HMA – Hull Moving Average', 'Moving averages', [num('period', 'Period', 21)], (c, p) => J.hma(cl(c), p.period)),
  dema: single('DEMA', 'DEMA – Double Exponential MA', 'Moving averages', [num('period', 'Period', 20)], (c, p) => J.dema(cl(c), p.period)),
  tema: single('TEMA', 'TEMA – Triple Exponential MA', 'Moving averages', [num('period', 'Period', 20)], (c, p) => J.tema(cl(c), p.period)),
  zlema: single('ZLEMA', 'ZLEMA – Zero Lag EMA', 'Moving averages', [num('period', 'Period', 20)], (c, p) => J.zlema(cl(c), p.period)),
  kama: single('KAMA', 'KAMA – Kaufman Adaptive MA', 'Moving averages', [num('period', 'Period', 10), num('fast', 'Fast', 2), num('slow', 'Slow', 30)], (c, p) => J.kama(cl(c), p.period, p.fast, p.slow)),
  vwma: single('VWMA', 'VWMA – Volume Weighted MA', 'Moving averages', [num('period', 'Period', 20)], (c, p) => J.vwma(c, p.period)),
  smma: single('SMMA', 'SMMA – Smoothed MA (RMA)', 'Moving averages', [num('period', 'Period', 20)], (c, p) => I.rma(cl(c), p.period)),
  mcginley: single('McG', 'McGinley Dynamic', 'Moving averages', [num('period', 'Period', 14)], (c, p) => J.mcginley(cl(c), p.period)),
  ribbon: {
    label: 'EMA Ribbon (6 EMAs)',
    short: 'Ribbon',
    group: 'Moving averages',
    pane: 'main',
    params: [num('start', 'First period', 10), num('step', 'Step', 10), col('c1', 'Fast colour', B.sky), col('c2', 'Slow colour', B.navy)],
    compute: (c, p) => {
      const mix = (k) => {
        const h = (s) => parseInt(s, 16);
        const a = p.c1.replace('#', ''), b = p.c2.replace('#', '');
        const m = [0, 2, 4].map((o) => Math.round(h(a.slice(o, o + 2)) + ((h(b.slice(o, o + 2)) - h(a.slice(o, o + 2))) * k) / 5).toString(16).padStart(2, '0'));
        return `#${m.join('')}`;
      };
      return { series: Array.from({ length: 6 }, (_, k) => line(`EMA ${p.start + k * p.step}`, c, J.emaN(cl(c), p.start + k * p.step), mix(k), 1)) };
    },
  },
  alligator: {
    label: 'Williams Alligator',
    short: 'Alligator',
    group: 'Trend',
    pane: 'main',
    params: [col('cJaw', 'Jaw colour', B.navy), col('cTeeth', 'Teeth colour', B.blue), col('cLips', 'Lips colour', B.sky)],
    compute: (c, p) => {
      const a = J.alligator(c);
      return { series: [line('Jaw', c, a.jaw, p.cJaw, 1), line('Teeth', c, a.teeth, p.cTeeth, 1), line('Lips', c, a.lips, p.cLips, 1)] };
    },
  },
  // ---------------- trend / overlays ----------------
  keltner: {
    label: 'Keltner Channels',
    short: 'KC',
    group: 'Volatility',
    pane: 'main',
    params: [num('period', 'Length', 20), num('mult', 'Multiplier', 2, 0.1, 10, 0.1), num('atr', 'ATR length', 10), col('cUpper', 'Upper colour', B.navy), col('cMid', 'Basis colour', B.blue), col('cLower', 'Lower colour', B.sky)],
    compute: (c, p) => {
      const k = J.keltner(c, p.period, p.mult, p.atr);
      return { series: [line('KC upper', c, k.upper, p.cUpper, 1), line('KC basis', c, k.mid, p.cMid, 1), line('KC lower', c, k.lower, p.cLower, 1)] };
    },
  },
  donchian: {
    label: 'Donchian Channels',
    short: 'DC',
    group: 'Volatility',
    pane: 'main',
    params: [num('period', 'Length', 20), col('cUpper', 'Upper colour', B.navy), col('cMid', 'Middle colour', B.blue), col('cLower', 'Lower colour', B.sky)],
    compute: (c, p) => {
      const d = J.donchian(c, p.period);
      return { series: [line('DC upper', c, d.upper, p.cUpper, 1), line('DC middle', c, d.mid, p.cMid, 1), line('DC lower', c, d.lower, p.cLower, 1)] };
    },
  },
  envelope: {
    label: 'Moving Average Envelope',
    short: 'Env',
    group: 'Volatility',
    pane: 'main',
    params: [num('period', 'Length', 20), num('pct', 'Percent', 2.5, 0.1, 50, 0.1), col('cUpper', 'Upper colour', B.navy), col('cMid', 'Basis colour', B.blue), col('cLower', 'Lower colour', B.sky)],
    compute: (c, p) => {
      const m = I.sma(cl(c), p.period);
      return { series: [line('Env upper', c, m.map((x) => (ok(x) ? x * (1 + p.pct / 100) : null)), p.cUpper, 1), line('Env basis', c, m, p.cMid, 1), line('Env lower', c, m.map((x) => (ok(x) ? x * (1 - p.pct / 100) : null)), p.cLower, 1)] };
    },
  },
  psar: {
    label: 'Parabolic SAR',
    short: 'SAR',
    group: 'Trend',
    pane: 'main',
    params: [num('step', 'Start', 0.02, 0.001, 1, 0.001), num('inc', 'Increment', 0.02, 0.001, 1, 0.001), num('max', 'Maximum', 0.2, 0.01, 1, 0.01), col('cUp', 'Uptrend colour', B.blue), col('cDown', 'Downtrend colour', B.navy)],
    compute: (c, p) => {
      const s = J.psar(c, p.step, p.inc, p.max);
      return { series: [gapLine('SAR up', c, s.up, p.cUp, 2), gapLine('SAR down', c, s.dn, p.cDown, 2)] };
    },
  },
  ichimoku: {
    label: 'Ichimoku Cloud',
    short: 'Ichimoku',
    group: 'Trend',
    pane: 'main',
    params: [num('conv', 'Conversion', 9), num('base', 'Base', 26), num('spanB', 'Span B', 52), num('disp', 'Displacement', 26), col('cConv', 'Conversion colour', B.sky), col('cBase', 'Base colour', B.navy), col('cA', 'Span A colour', B.blue), col('cB', 'Span B colour', B.indigo), col('cLag', 'Lagging colour', B.slate)],
    compute: (c, p) => {
      const k = J.ichimoku(c, p.conv, p.base, p.spanB, p.disp);
      return { series: [line('Conversion', c, k.tenkan, p.cConv, 1), line('Base', c, k.kijun, p.cBase, 1), line('Span A', c, k.spanA, p.cA, 1), line('Span B', c, k.spanB, p.cB, 1), line('Lagging', c, k.lag, p.cLag, 1)] };
    },
  },
  linreg: {
    label: 'Linear Regression Channel',
    short: 'LinReg',
    group: 'Trend',
    pane: 'main',
    params: [num('period', 'Length', 50), num('mult', 'Deviation', 2, 0.1, 10, 0.1), col('cMid', 'Line colour', B.blue), col('cBand', 'Band colour', B.sky)],
    compute: (c, p) => {
      const m = J.linreg(cl(c), p.period), s = J.stdev(cl(c), p.period);
      return { series: [line('LinReg', c, m, p.cMid, 2), line('LR upper', c, m.map((x, i) => (ok(x) && ok(s[i]) ? x + p.mult * s[i] : null)), p.cBand, 1), line('LR lower', c, m.map((x, i) => (ok(x) && ok(s[i]) ? x - p.mult * s[i] : null)), p.cBand, 1)] };
    },
  },
  chandelier: {
    label: 'Chandelier Exit',
    short: 'CE',
    group: 'Trend',
    pane: 'main',
    params: [num('period', 'ATR period', 22), num('mult', 'Multiplier', 3, 0.5, 10, 0.5), col('cLong', 'Long stop colour', B.blue), col('cShort', 'Short stop colour', B.navy)],
    compute: (c, p) => {
      const e = J.chandelier(c, p.period, p.mult);
      return { series: [line('Long stop', c, e.long, p.cLong, 1), line('Short stop', c, e.short, p.cShort, 1)] };
    },
  },
  // ---------------- momentum (own pane) ----------------
  mfi: single('MFI', 'MFI – Money Flow Index', 'Momentum', [num('period', 'Period', 14, 2, 200)], (c, p) => J.mfi(c, p.period), { pane: 'sub', levels: [80, 50, 20], range: [0, 100] }),
  roc: single('ROC', 'ROC – Rate of Change', 'Momentum', [num('period', 'Period', 12, 1, 200)], (c, p) => J.rocArr(cl(c), p.period), { pane: 'sub', levels: [0] }),
  mom: single('MOM', 'Momentum', 'Momentum', [num('period', 'Period', 10, 1, 200)], (c, p) => cl(c).map((x, i) => (i >= p.period ? x - cl(c)[i - p.period] : null)), { pane: 'sub', levels: [0] }),
  cmo: single('CMO', 'CMO – Chande Momentum Oscillator', 'Momentum', [num('period', 'Period', 9, 2, 200)], (c, p) => J.cmo(cl(c), p.period), { pane: 'sub', levels: [50, 0, -50] }),
  dpo: single('DPO', 'DPO – Detrended Price Oscillator', 'Momentum', [num('period', 'Period', 20, 2, 200)], (c, p) => J.dpo(cl(c), p.period), { pane: 'sub', levels: [0] }),
  coppock: single('Copp', 'Coppock Curve', 'Momentum', [num('wma', 'WMA length', 10), num('roc1', 'Long ROC', 14), num('roc2', 'Short ROC', 11)], (c, p) => J.coppock(cl(c), p.wma, p.roc1, p.roc2), { pane: 'sub', levels: [0] }),
  uo: single('UO', 'Ultimate Oscillator', 'Momentum', [num('a', 'Fast', 7), num('b', 'Middle', 14), num('c', 'Slow', 28)], (c, p) => J.ultimate(c, p.a, p.b, p.c), { pane: 'sub', levels: [70, 50, 30], range: [0, 100] }),
  chop: single('CHOP', 'Choppiness Index', 'Momentum', [num('period', 'Period', 14, 2, 200)], (c, p) => J.choppiness(c, p.period), { pane: 'sub', levels: [61.8, 38.2], range: [0, 100] }),
  mass: single('Mass', 'Mass Index', 'Momentum', [num('period', 'Sum length', 25)], (c, p) => J.massIndex(c, p.period), { pane: 'sub', levels: [27, 26.5] }),
  eom: single('EOM', 'Ease of Movement', 'Volume', [num('period', 'Period', 14)], (c, p) => J.eom(c, p.period), { pane: 'sub', levels: [0] }),
  cmf: single('CMF', 'CMF – Chaikin Money Flow', 'Volume', [num('period', 'Period', 20)], (c, p) => J.cmf(c, p.period), { pane: 'sub', levels: [0.05, 0, -0.05] }),
  adl: single('A/D', 'Accumulation / Distribution', 'Volume', [], (c) => J.adl(c), { pane: 'sub' }),
  force: single('Force', 'Force Index', 'Volume', [num('period', 'Period', 13)], (c, p) => J.forceIndex(c, p.period), { pane: 'sub', levels: [0] }),
  stdev: single('StDev', 'Standard Deviation', 'Volatility', [num('period', 'Period', 20, 2, 200)], (c, p) => J.stdev(cl(c), p.period), { pane: 'sub' }),
  bbp: single('%B', 'Bollinger %B', 'Volatility', [num('period', 'Length', 20, 2, 200), num('mult', 'StdDev', 2, 0.1, 10, 0.1)], (c, p) => J.bbPercent(c, p.period, p.mult), { pane: 'sub', levels: [1, 0.5, 0] }),
  bbw: single('BBW', 'Bollinger Band Width', 'Volatility', [num('period', 'Length', 20, 2, 200), num('mult', 'StdDev', 2, 0.1, 10, 0.1)], (c, p) => J.bbWidth(c, p.period, p.mult), { pane: 'sub' }),
  hv: single('HV', 'Historical Volatility', 'Volatility', [num('period', 'Period', 10, 2, 200), num('annual', 'Bars per year', 252, 1, 100000)], (c, p) => J.histVol(c, p.period, p.annual), { pane: 'sub' }),
  volma: {
    label: 'Volume + Moving Average',
    short: 'Vol MA',
    group: 'Volume',
    pane: 'sub',
    params: [num('period', 'MA length', 20), col('cUp', 'Up volume', B.blue), col('cDown', 'Down volume', B.navy), col('cMa', 'MA colour', B.sky)],
    compute: (c, p) => {
      const v = c.map((x) => x.volume || 0);
      const up = c.map((x) => x.close >= x.open);
      return { series: [{ type: 'hist', name: 'Volume', color: p.cUp, data: c.map((x, i) => ({ time: x.time, value: v[i], color: up[i] ? p.cUp : p.cDown })) }, line('Vol MA', c, I.sma(v, p.period), p.cMa, 2)] };
    },
  },
  stochrsi: {
    label: 'Stochastic RSI',
    short: 'StochRSI',
    group: 'Momentum',
    pane: 'sub',
    params: [num('rsi', 'RSI length', 14), num('stoch', 'Stochastic length', 14), num('k', '%K smooth', 3), num('d', '%D smooth', 3), col('cK', '%K colour', B.blue), col('cD', '%D colour', B.navy)],
    compute: (c, p) => {
      const s = J.stochRsi(cl(c), p.rsi, p.stoch, p.k, p.d);
      return { series: [line('%K', c, s.k, p.cK, 2), line('%D', c, s.d, p.cD, 2)], levels: [80, 20], range: [0, 100] };
    },
  },
  aroon: {
    label: 'Aroon',
    short: 'Aroon',
    group: 'Trend',
    pane: 'sub',
    params: [num('period', 'Length', 14, 2, 200), col('cUp', 'Up colour', B.blue), col('cDown', 'Down colour', B.navy)],
    compute: (c, p) => {
      const a = J.aroon(c, p.period);
      return { series: [line('Aroon up', c, a.up, p.cUp, 2), line('Aroon down', c, a.dn, p.cDown, 2)], levels: [70, 50, 30], range: [0, 100] };
    },
  },
  vortex: {
    label: 'Vortex Indicator',
    short: 'VI',
    group: 'Trend',
    pane: 'sub',
    params: [num('period', 'Length', 14, 2, 200), col('cPlus', 'VI+ colour', B.blue), col('cMinus', 'VI- colour', B.navy)],
    compute: (c, p) => {
      const v = J.vortex(c, p.period);
      return { series: [line('VI+', c, v.plus, p.cPlus, 2), line('VI-', c, v.minus, p.cMinus, 2)], levels: [1] };
    },
  },
  trix: {
    label: 'TRIX',
    short: 'TRIX',
    group: 'Momentum',
    pane: 'sub',
    params: [num('period', 'Length', 15), num('signal', 'Signal', 9), col('cLine', 'TRIX colour', B.blue), col('cSig', 'Signal colour', B.navy)],
    compute: (c, p) => {
      const e3 = J.emaN(J.emaN(J.emaN(cl(c), p.period), p.period), p.period);
      const t = e3.map((x, i) => (i && ok(x) && ok(e3[i - 1]) && e3[i - 1] !== 0 ? (x / e3[i - 1] - 1) * 100 : null));
      return { series: [line('TRIX', c, t, p.cLine, 2), line('Signal', c, J.emaN(t, p.signal), p.cSig, 1)], levels: [0] };
    },
  },
  kst: {
    label: 'KST – Know Sure Thing',
    short: 'KST',
    group: 'Momentum',
    pane: 'sub',
    params: [col('cLine', 'KST colour', B.blue), col('cSig', 'Signal colour', B.navy)],
    compute: (c, p) => {
      const k = J.kst(cl(c));
      return { series: [line('KST', c, k.line, p.cLine, 2), line('Signal', c, k.signal, p.cSig, 1)], levels: [0] };
    },
  },
  tsi: {
    label: 'TSI – True Strength Index',
    short: 'TSI',
    group: 'Momentum',
    pane: 'sub',
    params: [num('long', 'Long', 25), num('short', 'Short', 13), num('signal', 'Signal', 13), col('cLine', 'TSI colour', B.blue), col('cSig', 'Signal colour', B.navy)],
    compute: (c, p) => {
      const t = J.tsi(cl(c), p.long, p.short, p.signal);
      return { series: [line('TSI', c, t.line, p.cLine, 2), line('Signal', c, t.signal, p.cSig, 1)], levels: [0] };
    },
  },
  fisher: {
    label: 'Fisher Transform',
    short: 'Fisher',
    group: 'Momentum',
    pane: 'sub',
    params: [num('period', 'Length', 9, 2, 200), col('cFish', 'Fisher colour', B.blue), col('cSig', 'Trigger colour', B.navy)],
    compute: (c, p) => {
      const f = J.fisher(c, p.period);
      return { series: [line('Fisher', c, f.fish, p.cFish, 2), line('Trigger', c, f.sig, p.cSig, 1)], levels: [1.5, 0, -1.5] };
    },
  },
  ppo: {
    label: 'PPO – Percentage Price Oscillator',
    short: 'PPO',
    group: 'Momentum',
    pane: 'sub',
    params: [num('fast', 'Fast', 12), num('slow', 'Slow', 26), num('signal', 'Signal', 9), col('cLine', 'PPO colour', B.blue), col('cSig', 'Signal colour', B.navy)],
    compute: (c, p) => {
      const o = J.ppo(cl(c), p.fast, p.slow, p.signal);
      return { series: [hist('Hist', c, o.hist, (v, pv) => (v >= 0 ? (pv == null || v >= pv ? B.blue : B.light) : pv == null || v <= pv ? B.navy : '#8da0c4')), line('PPO', c, o.line, p.cLine, 2), line('Signal', c, o.signal, p.cSig, 1)], levels: [0] };
    },
  },
  chaikin: {
    label: 'Chaikin Oscillator',
    short: 'ChaikinOsc',
    group: 'Volume',
    pane: 'sub',
    params: [num('fast', 'Fast', 3), num('slow', 'Slow', 10), col('cLine', 'Line colour', B.blue)],
    compute: (c, p) => {
      const a = J.adl(c);
      return { series: [line('Chaikin Osc', c, J.emaN(a, p.fast).map((x, i) => { const s = J.emaN(a, p.slow)[i]; return ok(x) && ok(s) ? x - s : null; }), p.cLine, 2)], levels: [0] };
    },
  },
  ao: {
    label: 'Awesome Oscillator',
    short: 'AO',
    group: 'Momentum',
    pane: 'sub',
    params: [num('fast', 'Fast', 5), num('slow', 'Slow', 34), col('cUp', 'Rising colour', B.blue), col('cDown', 'Falling colour', B.navy)],
    compute: (c, p) => {
      const m = J.hl2(c);
      const a = I.sma(m, p.fast), b = I.sma(m, p.slow);
      const v = a.map((x, i) => (ok(x) && ok(b[i]) ? x - b[i] : null));
      return { series: [hist('AO', c, v, (x, px) => (px == null || x >= px ? p.cUp : p.cDown))], levels: [0] };
    },
  },
  elder: {
    label: 'Elder Ray (Bull / Bear Power)',
    short: 'Elder',
    group: 'Momentum',
    pane: 'sub',
    params: [num('period', 'EMA length', 13), col('cBull', 'Bull colour', B.blue), col('cBear', 'Bear colour', B.navy)],
    compute: (c, p) => {
      const e = J.elder(c, p.period);
      return { series: [hist('Bull power', c, e.bull, () => p.cBull), hist('Bear power', c, e.bear, () => p.cBear)], levels: [0] };
    },
  },
  squeeze: {
    label: 'Squeeze Momentum',
    short: 'Squeeze',
    group: 'Momentum',
    pane: 'sub',
    params: [num('period', 'Length', 20, 2, 200), num('bb', 'BB multiplier', 2, 0.5, 5, 0.1), num('kc', 'KC multiplier', 1.5, 0.5, 5, 0.1), col('cUp', 'Rising colour', B.blue), col('cDown', 'Falling colour', B.navy)],
    compute: (c, p) => {
      const s = J.squeeze(c, p.period, p.bb, p.kc);
      const colorOf = (v, pv) => (v >= 0 ? (pv == null || v >= pv ? p.cUp : B.light) : pv == null || v <= pv ? p.cDown : '#8da0c4');
      const dots = { type: 'line', name: 'Squeeze', color: B.slate, width: 2, data: c.map((x, i) => ({ time: x.time, value: 0, color: s.on[i] ? B.navy : B.light })) };
      return { series: [hist('Momentum', c, s.val, colorOf), dots] };
    },
  },
  wavetrend: {
    label: 'WaveTrend Oscillator',
    short: 'WT',
    group: 'Momentum',
    pane: 'sub',
    params: [num('n1', 'Channel length', 10), num('n2', 'Average length', 21), col('c1', 'WT1 colour', B.blue), col('c2', 'WT2 colour', B.navy)],
    compute: (c, p) => {
      const w = J.waveTrend(c, p.n1, p.n2);
      return { series: [line('WT1', c, w.wt1, p.c1, 2), line('WT2', c, w.wt2, p.c2, 1)], levels: [60, 0, -60] };
    },
  },
};

// order of the groups in the indicator list
export const GROUP_ORDER = ['Trend', 'Moving averages', 'Momentum', 'Volatility', 'Volume'];
export const GROUP_OF = {
  sma: 'Moving averages', ema: 'Moving averages', wma: 'Moving averages', vwap: 'Volume', supertrend: 'Trend', bb: 'Volatility',
  rsi: 'Momentum', macd: 'Momentum', stoch: 'Momentum', adx: 'Trend', atr: 'Volatility', cci: 'Momentum', willr: 'Momentum', obv: 'Volume',
};
