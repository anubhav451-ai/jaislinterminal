// The same /api/* answers as the Node server, but Yahoo Finance only. Used where there is no Node server:
//  - Netlify (netlify/functions/api.mjs)
//  - `vite` dev when the backend is not running (client/vite.config.js)
import { SYMBOLS } from './symbols.js';
import { INTERVALS } from './utils.js';
import { BY_SYMBOL } from './symbols.js';
import { YAHOO_LABEL, yahooCandles, yahooQuotes } from './yahoo.js';

export const yahooHealth = (angelError = 'Angel One server is not running on this host') => ({
  ok: true,
  provider: 'yahoo',
  source: 'yahoo',
  connected: false, // Angel One is not connected
  label: YAHOO_LABEL,
  delayed: true,
  error: angelError,
});

export async function handleApi(pathname, params) {
  try {
    if (pathname === '/api/health') return { status: 200, json: yahooHealth() };
    if (pathname === '/api/symbols') return { status: 200, json: SYMBOLS.map(({ symbol, name, index, groups }) => ({ symbol, name, index, groups })) };
    if (pathname === '/api/quotes') return { status: 200, json: await yahooQuotes() };
    if (pathname === '/api/candles') {
      const symbol = String(params.get('symbol') || '');
      const interval = String(params.get('interval') || '1d');
      if (!BY_SYMBOL[symbol]) return { status: 400, json: { error: 'Unknown symbol' } };
      if (!INTERVALS.includes(interval)) return { status: 400, json: { error: 'Bad interval' } };
      return { status: 200, json: { candles: await yahooCandles(symbol, interval), source: 'yahoo' } };
    }
    return { status: 404, json: { error: 'Not found' } };
  } catch (e) {
    return { status: 502, json: { error: `Yahoo Finance: ${e.message}` } };
  }
}
