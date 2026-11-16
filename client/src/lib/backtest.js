// Quick back-test of a strategy on the candles that are loaded for ONE stock.
// Rules (shown to the user):
//  - every BUY / SELL signal on a CLOSED candle is a trade, entered at that candle's close
//  - exit: stop-loss % hit (loss), target % hit (win), or the opposite signal (closed at that candle's close)
//  - if stop and target are touched in the same candle, the stop counts first
//  - one trade at a time; no brokerage, slippage or taxes
import { closedCandles, runStrategy } from './strategy.js';
import { atr as atrCalc } from './indicators.js';

// Accuracy test rules (per strategy, set by the user): stop-loss % and target % from the entry price.
// Either one can be switched off. A trade also ends when the opposite signal comes (closed at that candle's close).
export const SL_CHIPS = [0.3, 0.5, 1, 2];
export const TP_CHIPS = [0.5, 1, 1.5, 2, 3];
export const DEFAULT_CFG = { slOn: true, sl: 0.5, tpOn: true, tp: 1, own: true, pos: false };
export const normCfg = (c) => {
  const x = { ...DEFAULT_CFG, ...(c || {}) };
  return { slOn: x.slOn !== false, sl: Number(x.sl) > 0 ? Number(x.sl) : 0.5, tpOn: x.tpOn !== false, tp: Number(x.tp) > 0 ? Number(x.tp) : 1, own: x.own !== false, pos: !!x.pos };
};
export const cfgLabel = (c, hasOwn = false) => {
  if (c.own && hasOwn) return `strategy's own SL & target${c.slOn || c.tpOn ? ' (else ' + [c.slOn ? `SL ${c.sl}%` : '', c.tpOn ? `Target ${c.tp}%` : ''].filter(Boolean).join(' · ') + ')' : ''}`;
  const parts = [];
  if (c.slOn) parts.push(`SL ${c.sl}%`);
  if (c.tpOn) parts.push(`Target ${c.tp}%`);
  return parts.length ? parts.join(' · ') : 'exit on opposite signal';
};

const EMPTY = { trades: [], total: 0, wins: 0, losses: 0, open: 0, winRate: null, avgRet: 0, totalRet: 0, best: 0, worst: 0, buy: { n: 0, w: 0 }, sell: { n: 0, w: 0 }, last10: [], bars: 0, first: null, last: null, error: null, periods: null, equity: [], pf: null, avgWin: 0, avgLoss: 0, maxWinStreak: 0, maxLossStreak: 0, streak: null, recent: { 5: { n: 0, w: 0 }, 10: { n: 0, w: 0 }, 20: { n: 0, w: 0 } } };

// Trades grouped by when they were ENTERED: today / last 7 days / last 30 days / last 90 days / everything loaded.
// (nowShift is on the candle clock: unix seconds + 5:30)
export const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'quarter', label: 'Last 90 days' },
  { id: 'all', label: 'All loaded data' },
];
export function periodStats(all, nowShift) {
  const day = Math.floor(nowShift / 86400) * 86400;
  const since = { today: day, week: nowShift - 7 * 86400, month: nowShift - 30 * 86400, quarter: nowShift - 90 * 86400, all: null };
  const out = {};
  for (const { id } of PERIODS) {
    const list = all.filter((t) => since[id] == null || t.time >= since[id]);
    const closed = list.filter((t) => !t.open);
    const wins = closed.filter((t) => t.win).length;
    out[id] = {
      trades: list.length,
      closed: closed.length,
      wins,
      losses: closed.length - wins,
      open: list.length - closed.length,
      winRate: closed.length ? (wins / closed.length) * 100 : null,
      ret: closed.reduce((a, t) => a + t.ret, 0),
    };
  }
  return out;
}

function extras(closed) {
  let maxW = 0;
  let maxL = 0;
  let run = 0;
  let runWin = null;
  let cum = 0;
  const equity = [];
  for (const t of closed) {
    if (runWin === t.win) run++;
    else {
      runWin = t.win;
      run = 1;
    }
    if (t.win) maxW = Math.max(maxW, run);
    else maxL = Math.max(maxL, run);
    cum += t.ret;
    equity.push({ time: t.exitTime, v: cum });
  }
  const w = closed.filter((t) => t.win);
  const l = closed.filter((t) => !t.win);
  const gain = w.reduce((a, t) => a + t.ret, 0);
  const loss = l.reduce((a, t) => a + t.ret, 0);
  const lastN = (n) => {
    const x = closed.slice(-n);
    return { n: x.length, w: x.filter((t) => t.win).length };
  };
  return {
    equity,
    pf: loss < 0 ? gain / -loss : null, // null = no losing trade (or no trade)
    avgWin: w.length ? gain / w.length : 0,
    avgLoss: l.length ? loss / l.length : 0,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    streak: closed.length ? { win: runWin, n: run } : null,
    recent: { 5: lastN(5), 10: lastN(10), 20: lastN(20) },
  };
}

export function backtest(candles, def, params, nowShift, { from = null, to = null, cfg = null } = {}) {
  const c = normCfg(cfg);
  let done;
  let buy;
  let sell;
  let lvStop = null;
  let lvTarget = null;
  try {
    done = closedCandles(candles, params.interval, nowShift);
    if (done.length < 3) return { ...EMPTY, bars: done.length, periods: periodStats([], nowShift) };
    ({ buy, sell, stop: lvStop, target: lvTarget } = runStrategy(def, done, params));
  } catch (e) {
    return { ...EMPTY, error: e.message, periods: periodStats([], nowShift) };
  }
  const all = [];
  let busyUntil = -1;
  for (let i = 0; i < done.length; i++) {
    if (i <= busyUntil) continue;
    const side = buy[i] ? 'buy' : sell[i] ? 'sell' : null;
    if (!side) continue;
    const entry = done[i].close;
    const dir = side === 'buy' ? 1 : -1;
    // the strategy's own stop-loss / target for this signal (when it has them), else the % from the settings
    const ownStop = c.own && lvStop ? lvStop[i] : null;
    const ownTarget = c.own && lvTarget ? lvTarget[i] : null;
    const stop = ownStop != null ? ownStop : c.slOn ? entry * (1 - (dir * c.sl) / 100) : null;
    const target = ownTarget != null ? ownTarget : c.tpOn ? entry * (1 + (dir * c.tp) / 100) : null;
    let exit = null;
    let j = i + 1;
    for (; j < done.length; j++) {
      const k = done[j];
      if (stop != null && (dir > 0 ? k.low <= stop : k.high >= stop)) {
        exit = stop; // stop is checked first: if both are touched in one candle the loss counts (pessimistic)
        break;
      }
      if (target != null && (dir > 0 ? k.high >= target : k.low <= target)) {
        exit = target;
        break;
      }
      if (dir > 0 ? sell[j] : buy[j]) {
        exit = k.close; // opposite signal = leave at the close
        break;
      }
    }
    if (exit == null) {
      all.push({ side, time: done[i].time, entry, open: true, stop, target }); // still running; later signals would overlap it
      break;
    }
    const ret = (dir * (exit - entry) / entry) * 100;
    all.push({ side, time: done[i].time, exitTime: done[j].time, entry, exit, ret, win: ret > 0, open: false, stop, target });
    busyUntil = j;
  }
  const inRange = (t) => (from == null || t >= from) && (to == null || t <= to);
  const trades = all.filter((t) => inRange(t.time));
  const closed = trades.filter((t) => !t.open);
  const wins = closed.filter((t) => t.win).length;
  const sum = closed.reduce((a, t) => a + t.ret, 0);
  const side = (s) => {
    const x = closed.filter((t) => t.side === s);
    return { n: x.length, w: x.filter((t) => t.win).length };
  };
  return {
    trades,
    total: closed.length,
    wins,
    losses: closed.length - wins,
    open: trades.length - closed.length,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    avgRet: closed.length ? sum / closed.length : 0,
    totalRet: sum,
    best: closed.length ? Math.max(...closed.map((t) => t.ret)) : 0,
    worst: closed.length ? Math.min(...closed.map((t) => t.ret)) : 0,
    buy: side('buy'),
    sell: side('sell'),
    last10: closed.slice(-10).map((t) => t.win),
    bars: done.length,
    first: done[0].time,
    last: done[done.length - 1].time,
    error: null,
    periods: periodStats(all, nowShift), // always on ALL trades, so Today / Week / Month stay right whatever date filter is set
    ...extras(closed),
  };
}

// candle times are "IST seconds": their UTC fields are the Indian wall-clock date
export const dateStr = (t) => (t == null ? '' : new Date(t * 1000).toISOString().slice(0, 10));
export const dayStart = (s) => (s ? Date.parse(`${s}T00:00:00Z`) / 1000 : null);
export const dayEnd = (s) => (s ? Date.parse(`${s}T23:59:59Z`) / 1000 : null);
