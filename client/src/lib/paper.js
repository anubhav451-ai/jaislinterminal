// Money side of the strategies: (1) back-test with a starting capital, (2) demo / paper trading account.
import { backtest, dateStr, dayEnd, dayStart } from './backtest.js';
import { closedCandles } from './strategy.js';
import { nowIST } from './delay.js';

export const PERIODS = [
  ['1M', 30],
  ['2M', 60],
  ['3M', 90],
  ['6M', 180],
  ['1Y', 365],
];
export const daysAgo = (d) => dateStr(nowIST() - d * 86400);

export const money = (n) => {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  const s = a >= 1000 ? Math.round(a).toLocaleString('en-IN') : a.toFixed(2);
  return `${n < 0 ? '-' : ''}₹${s}`;
};

// ---------------------------------------------------------------- 1) portfolio back-test
// trades: [{ symbol, side, time, exitTime, entry, exit, open }] (all stocks together). One simulated account.
export function simulate(trades, { capital = 100000, mode = 'pct', value = 100, charges = 0 } = {}) {
  const ev = [];
  trades.forEach((t, k) => {
    ev.push({ at: t.time, kind: 0, k });
    ev.push({ at: t.exitTime ?? t.time, kind: 1, k });
  });
  ev.sort((a, b) => a.at - b.at || b.kind - a.kind); // at the same moment: exits first, then entries (kind 1 before 0)
  let cash = capital;
  const open = new Map();
  const done = [];
  let skipped = 0;
  const curve = [{ t: trades.length ? Math.min(...trades.map((t) => t.time)) : 0, v: capital }];
  const investedCost = () => [...open.values()].reduce((a, p) => a + p.cost, 0);
  for (const e of ev) {
    const t = trades[e.k];
    const dir = t.side === 'buy' ? 1 : -1;
    if (e.kind === 0) {
      const equity = cash + investedCost();
      let amount = mode === 'fixed' ? value : (equity * value) / 100;
      amount = Math.min(amount, cash / (1 + charges / 100));
      const qty = Math.floor(amount / t.entry);
      if (qty < 1) {
        skipped++;
        continue;
      }
      const cost = qty * t.entry;
      cash -= cost + (cost * charges) / 100;
      open.set(e.k, { qty, cost });
    } else {
      const p = open.get(e.k);
      if (!p) continue;
      open.delete(e.k);
      const gross = p.cost + dir * (t.exit - t.entry) * p.qty;
      const fees = (p.cost * charges) / 100 + (p.qty * t.exit * charges) / 100;
      cash += gross - (p.qty * t.exit * charges) / 100;
      done.push({ ...t, qty: p.qty, pnl: gross - p.cost - fees, retPct: ((gross - p.cost - fees) / p.cost) * 100 });
      curve.push({ t: e.at, v: cash + investedCost() });
    }
  }
  const finalValue = cash + investedCost();
  let peak = capital;
  let maxDD = 0;
  for (const c of curve) {
    peak = Math.max(peak, c.v);
    maxDD = Math.max(maxDD, ((peak - c.v) / peak) * 100);
  }
  const wins = done.filter((t) => t.pnl > 0).length;
  const bySym = {};
  for (const t of done) {
    const b = (bySym[t.symbol] ||= { symbol: t.symbol, n: 0, w: 0, pnl: 0 });
    b.n++;
    if (t.pnl > 0) b.w++;
    b.pnl += t.pnl;
  }
  return {
    capital,
    finalValue,
    pnl: finalValue - capital,
    retPct: ((finalValue - capital) / capital) * 100,
    trades: done,
    n: done.length,
    wins,
    winRate: done.length ? (wins / done.length) * 100 : null,
    maxDD,
    best: done.length ? Math.max(...done.map((t) => t.pnl)) : 0,
    worst: done.length ? Math.min(...done.map((t) => t.pnl)) : 0,
    skipped,
    curve,
    bySymbol: Object.values(bySym).sort((a, b) => b.pnl - a.pnl),
  };
}

// loads candles for every stock, back-tests the strategy on each and puts all trades into one account
export async function runPortfolioBacktest({ def, params, cfg, symbols, from, to, getCandles, sizing, capital, charges, onProgress, isCancelled }) {
  const now = nowIST();
  const all = [];
  let first = null;
  let last = null;
  let failed = 0;
  let doneN = 0;
  const queue = [...symbols];
  const worker = async () => {
    while (queue.length && !isCancelled?.()) {
      const symbol = queue.shift();
      try {
        const candles = await getCandles(symbol, params.interval);
        const r = backtest(candles, def, params, now, { cfg, from: dayStart(from), to: dayEnd(to) });
        if (r.error) throw new Error(r.error);
        const closed = closedCandles(candles, params.interval, now);
        const lastC = closed[closed.length - 1];
        for (const t of r.trades) {
          if (t.open) {
            if (!lastC) continue;
            all.push({ symbol, side: t.side, time: t.time, exitTime: lastC.time, entry: t.entry, exit: lastC.close, open: true });
          } else all.push({ symbol, side: t.side, time: t.time, exitTime: t.exitTime, entry: t.entry, exit: t.exit, open: false });
        }
        if (r.first != null) first = first == null ? r.first : Math.min(first, r.first);
        if (r.last != null) last = last == null ? r.last : Math.max(last, r.last);
      } catch {
        failed++;
      }
      doneN++;
      onProgress?.(doneN, symbols.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  all.sort((a, b) => a.time - b.time);
  const res = simulate(all, { capital, mode: sizing.mode, value: sizing.value, charges });
  return { ...res, failed, stocks: symbols.length, dataFrom: first, dataTo: last, openCount: all.filter((t) => t.open).length };
}

// ---------------------------------------------------------------- 2) demo (paper) account
export const newAccount = (capital = 100000, { name = 'Paper account', charges = 0 } = {}) => ({ id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name, capital, cash: capital, positions: [], closed: [], auto: {}, processed: [], charges, createdAt: Date.now() });

const dirOf = (side) => (side === 'buy' ? 1 : -1);
export const unrealized = (p, price) => (price == null ? 0 : dirOf(p.side) * (price - p.entry) * p.qty);
export const equityOf = (acc, priceOf) => acc.cash + acc.positions.reduce((a, p) => a + p.qty * p.entry + unrealized(p, priceOf(p.symbol)), 0);
export const investedOf = (acc) => acc.positions.reduce((a, p) => a + p.qty * p.entry, 0);

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

// returns { acc, error }
export function openPosition(acc, { symbol, side, price, amount, qty, stop = null, target = null, strategyId = null, source = 'manual', signalKey = null }) {
  if (!(price > 0)) return { acc, error: 'No price available for this stock yet.' };
  const q = qty != null ? Math.floor(qty) : Math.floor(Math.min(amount, acc.cash / (1 + (acc.charges || 0) / 100)) / price);
  if (!(q >= 1)) return { acc, error: acc.cash < price ? 'Not enough cash in the demo account.' : 'Amount is too small for even one share.' };
  const cost = q * price;
  const fee = (cost * (acc.charges || 0)) / 100;
  if (cost + fee > acc.cash + 1e-6) return { acc, error: 'Not enough cash in the demo account.' };
  const pos = { id: newId(), symbol, side, qty: q, entry: price, stop, target, strategyId, source, openedAt: Date.now(), signalKey };
  return { acc: { ...acc, cash: acc.cash - cost - fee, positions: [...acc.positions, pos] }, error: null };
}

export function closePosition(acc, id, price, reason) {
  const p = acc.positions.find((x) => x.id === id);
  if (!p || !(price > 0)) return acc;
  const gross = p.qty * p.entry + dirOf(p.side) * (price - p.entry) * p.qty;
  const fees = ((p.qty * p.entry + p.qty * price) * (acc.charges || 0)) / 100;
  const pnl = gross - p.qty * p.entry - fees;
  return {
    ...acc,
    cash: acc.cash + gross - (p.qty * price * (acc.charges || 0)) / 100,
    positions: acc.positions.filter((x) => x.id !== id),
    closed: [{ ...p, exit: price, closedAt: Date.now(), reason, pnl, retPct: (pnl / (p.qty * p.entry)) * 100 }, ...acc.closed].slice(0, 500),
  };
}

// closes positions whose stop-loss or target was touched by the latest price
export function checkExits(acc, priceOf) {
  let next = acc;
  for (const p of acc.positions) {
    const px = priceOf(p.symbol);
    if (!(px > 0)) continue;
    const long = p.side === 'buy';
    const stopHit = p.stop != null && (long ? px <= p.stop : px >= p.stop);
    const tpHit = p.target != null && (long ? px >= p.target : px <= p.target);
    if (stopHit) next = closePosition(next, p.id, p.stop, 'stop-loss');
    else if (tpHit) next = closePosition(next, p.id, p.target, 'target');
  }
  return next;
}

// opens demo positions for the strategy setups that appeared (only for strategies with auto demo-trading switched on)
// signals: { SYMBOL: [{ strategyId, side, price, stop, target, formedAt, time }] }
export function applySignals(acc, signals, { cfgOf, priceOf, includeOld = false }) {
  let next = acc;
  const processed = new Set(acc.processed);
  let touched = false;
  for (const [symbol, list] of Object.entries(signals || {})) {
    for (const s of list) {
      const auto = next.auto[s.strategyId];
      if (!auto?.on) continue;
      const key = `${s.strategyId}|${symbol}|${s.side}|${s.time}`;
      if (processed.has(key)) continue;
      if (!includeOld && s.formedAt < (auto.since ?? 0)) continue;
      processed.add(key);
      touched = true;
      const cfg = cfgOf(s.strategyId);
      const dir = s.side === 'buy' ? 1 : -1;
      let stop = cfg.own && s.stop != null ? s.stop : cfg.slOn ? s.price * (1 - (dir * cfg.sl) / 100) : null;
      let target = cfg.own && s.target != null ? s.target : cfg.tpOn ? s.price * (1 + (dir * cfg.tp) / 100) : null;
      // the opposite signal closes the demo position of the same strategy and stock
      const opp = next.positions.find((p) => p.strategyId === s.strategyId && p.symbol === symbol && p.side !== s.side);
      if (opp) next = closePosition(next, opp.id, priceOf(symbol) || s.price, 'opposite signal');
      if (next.positions.some((p) => p.strategyId === s.strategyId && p.symbol === symbol)) continue;
      const equity = equityOf(next, (x) => priceOf(x) ?? null);
      const r = openPosition(next, { symbol, side: s.side, price: s.price, amount: (equity * (auto.pct ?? 10)) / 100, stop, target, strategyId: s.strategyId, source: 'auto', signalKey: key });
      if (!r.error) next = r.acc;
    }
  }
  if (!touched) return acc;
  return { ...next, processed: [...processed].slice(-600) };
}
