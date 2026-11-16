// Builds bigger candles out of smaller ones (the data sources give 1m ... 1w; 4h is made from 1h).
import { bucketStart } from './time.js';

export function aggregate(candles, interval) {
  const out = [];
  let cur = null;
  for (const c of candles) {
    const b = bucketStart(c.time, interval);
    if (!cur || cur.time !== b) {
      cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 };
      out.push(cur);
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume || 0;
    }
  }
  return out;
}
