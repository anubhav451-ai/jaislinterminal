// Simple, honest backtester.
//  - signal on bar i  ->  order fills at the OPEN of bar i+1 (no look-ahead)
//  - stop-loss / target are checked on the bar's high/low; if both are hit in
//    the same bar the stop-loss is assumed first (pessimistic)
//  - full capital in every trade, profits compounded
//  - costPct is charged on each side (entry and exit)
export function runBacktest(candles, signals, { slPct = 0, tpPct = 0, costPct = 0.05, longOnly = false } = {}) {
  const trades = [];
  const equity = [];
  let eq = 1;
  let pos = null;
  let pending = null;

  const closePos = (price, time, reason, i) => {
    const ret = pos.dir * (price / pos.entry - 1) * 100 - 2 * costPct;
    eq *= 1 + ret / 100;
    trades.push({
      side: pos.dir === 1 ? 'long' : 'short',
      entryTime: pos.time,
      entryPrice: pos.entry,
      exitTime: time,
      exitPrice: price,
      pnlPct: ret,
      reason,
      bars: i - pos.idx,
      open: reason === 'open',
    });
    pos = null;
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (pending) {
      const a = pending;
      pending = null;
      if (a === 'exit') {
        if (pos) closePos(c.open, c.time, 'signal', i);
      } else if (a === 'buy') {
        if (pos && pos.dir === -1) closePos(c.open, c.time, 'signal', i);
        if (!pos) pos = { dir: 1, entry: c.open, time: c.time, idx: i };
      } else if (a === 'sell') {
        if (pos && pos.dir === 1) closePos(c.open, c.time, 'signal', i);
        if (!pos && !longOnly) pos = { dir: -1, entry: c.open, time: c.time, idx: i };
      }
    }
    if (pos) {
      if (pos.dir === 1) {
        const sl = pos.entry * (1 - slPct / 100);
        const tp = pos.entry * (1 + tpPct / 100);
        if (slPct && c.low <= sl) closePos(c.open <= sl ? c.open : sl, c.time, 'stop', i);
        else if (tpPct && c.high >= tp) closePos(c.open >= tp ? c.open : tp, c.time, 'target', i);
      } else {
        const sl = pos.entry * (1 + slPct / 100);
        const tp = pos.entry * (1 - tpPct / 100);
        if (slPct && c.high >= sl) closePos(c.open >= sl ? c.open : sl, c.time, 'stop', i);
        else if (tpPct && c.low <= tp) closePos(c.open <= tp ? c.open : tp, c.time, 'target', i);
      }
    }
    equity.push({ time: c.time, value: eq * (pos ? 1 + pos.dir * (c.close / pos.entry - 1) : 1) });
    if (signals[i] && i < candles.length - 1) pending = signals[i];
  }
  if (pos) {
    const last = candles[candles.length - 1];
    closePos(last.close, last.time, 'open', candles.length - 1);
    equity[equity.length - 1].value = eq;
  }
  return { trades, equity, stats: statsOf(trades, equity, candles) };
}

export function statsOf(trades, equity, candles) {
  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const grossP = wins.reduce((a, t) => a + t.pnlPct, 0);
  const grossL = Math.abs(losses.reduce((a, t) => a + t.pnlPct, 0));
  let peak = 1;
  let maxDD = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.value);
    maxDD = Math.max(maxDD, ((peak - e.value) / peak) * 100);
  }
  const finalEq = equity.length ? equity[equity.length - 1].value : 1;
  return {
    trades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    netPct: (finalEq - 1) * 100,
    profitFactor: grossL ? grossP / grossL : grossP ? null : 0, // null = no losing trade
    avgTradePct: trades.length ? trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length : 0,
    avgWinPct: wins.length ? grossP / wins.length : 0,
    avgLossPct: losses.length ? -grossL / losses.length : 0,
    bestPct: trades.length ? Math.max(...trades.map((t) => t.pnlPct)) : 0,
    worstPct: trades.length ? Math.min(...trades.map((t) => t.pnlPct)) : 0,
    maxDrawdownPct: maxDD,
    buyHoldPct: candles.length > 1 ? (candles[candles.length - 1].close / candles[0].close - 1) * 100 : 0,
  };
}

// Pool results of many stocks into one summary.
export function pool(rows) {
  const ok = rows.filter((r) => r.stats);
  const all = ok.flatMap((r) => r.trades || []);
  const wins = all.filter((t) => t.pnlPct > 0);
  const gp = wins.reduce((a, t) => a + t.pnlPct, 0);
  const gl = Math.abs(all.filter((t) => t.pnlPct <= 0).reduce((a, t) => a + t.pnlPct, 0));
  const sorted = [...ok].sort((a, b) => b.stats.netPct - a.stats.netPct);
  return {
    stocks: ok.length,
    trades: all.length,
    winRate: all.length ? (wins.length / all.length) * 100 : 0,
    avgTradePct: all.length ? all.reduce((a, t) => a + t.pnlPct, 0) / all.length : 0,
    profitFactor: gl ? gp / gl : gp ? null : 0,
    avgNetPct: ok.length ? ok.reduce((a, r) => a + r.stats.netPct, 0) / ok.length : 0,
    profitableStocks: ok.filter((r) => r.stats.netPct > 0).length,
    best: sorted[0]?.symbol,
    worst: sorted[sorted.length - 1]?.symbol,
  };
}
