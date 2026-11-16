// ============================================================
//  Example strategy: EMA crossover + RSI filter
//  Upload / paste a file like this in the app (Strategies tab).
// ============================================================
//
//  module.exports fields
//    name       shown in the app
//    interval   '1m' | '5m' | '15m' | '1h' | '1d' | '1w'
//    params     numbers you can edit later from the app (no code change)
//    slPct      stop-loss %  (0 = off)       tpPct  target %  (0 = off)
//    longOnly   true = ignore 'sell' as a short entry (only exits longs)
//    validBars  a signal stays highlighted for this many bars
//    prepare(candles, ta, p)     compute indicator arrays once (optional)
//    signal(i, candles, ind, p, ta)   called for every bar i, return:
//         'buy'  -> go long (also closes a short)
//         'sell' -> go short (also closes a long) / exit long if longOnly
//         'exit' -> close any open position
//         null   -> do nothing
//
//  candles[i] = { time, open, high, low, close, volume }
//  Only look at candles[0..i]  (never i+1 or later = no peeking at the future).
//  Orders fill at the NEXT bar's open in the backtest.
//
//  ta helpers: sma ema wma rsi macd bollinger vwap atr supertrend stochastic adx
//              cci obv williamsR heikinAshi highest lowest closes highs lows volumes
//              crossover(a, b, i)  crossunder(a, b, i)

module.exports = {
  name: 'EMA 9/21 cross + RSI filter',
  interval: '15m',
  params: { fast: 9, slow: 21, rsiLen: 14, rsiMin: 50 },
  slPct: 1,
  tpPct: 2,
  longOnly: true,
  validBars: 2,

  prepare(candles, ta, p) {
    const close = ta.closes(candles);
    return {
      fast: ta.ema(close, p.fast),
      slow: ta.ema(close, p.slow),
      rsi: ta.rsi(close, p.rsiLen),
    };
  },

  signal(i, candles, ind, p, ta) {
    if (ta.crossover(ind.fast, ind.slow, i) && ind.rsi[i] > p.rsiMin) return 'buy';
    if (ta.crossunder(ind.fast, ind.slow, i)) return 'exit';
    return null;
  },
};
