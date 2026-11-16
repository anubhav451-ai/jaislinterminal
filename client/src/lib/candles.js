import { apiJson } from './api.js';
import { aggregate } from './aggregate.js';

// One place that loads candles for any supported timeframe.
export async function fetchCandles(symbol, interval) {
  if (interval === '4h') {
    const j = await apiJson(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=1h`);
    return aggregate(j.candles, '4h');
  }
  const j = await apiJson(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`);
  return j.candles;
}
