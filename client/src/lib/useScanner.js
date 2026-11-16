import { store } from './store.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCandles } from './candles.js';
import { loadPython } from './py.js';
import { nowIST } from './delay.js';
import { scan, strategyById } from './strategy.js';

// Candles are cached for a few minutes so re-scans and chart opens do not hammer the API.
const cache = new Map();
export async function getCandles(symbol, interval) {
  const key = `${symbol}|${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.candles;
  const list = await fetchCandles(symbol, interval);
  cache.set(key, { at: Date.now(), candles: list });
  return list;
}

const loadSeen = () => {
  try {
    return new Set(JSON.parse(store.getItem('n50.seen') || '[]'));
  } catch {
    return new Set();
  }
};
const saveSeen = (set) => {
  try {
    store.setItem('n50.seen', JSON.stringify([...set].slice(-600)));
  } catch {}
};

// applied: [{ strategyId, symbols: [...], params }]
// signals:  { SYMBOL: [{ strategyId, name, time, price }] }  (setups that are active right now)
export function useScanner(applied, onNew) {
  const [signals, setSignals] = useState({});
  const [history, setHistory] = useState({}); // { SYMBOL: [{ strategyId, name, interval, side, price, time, formedAt }] } newest first
  const [state, setState] = useState({ scanning: false, done: 0, total: 0, errors: 0, last: null });
  const runId = useRef(0);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const run = useCallback(async () => {
    const id = ++runId.current;
    const jobs = applied.flatMap((a) => a.symbols.map((symbol) => ({ a, symbol })));
    if (!jobs.length) {
      setSignals({});
      setHistory({});
      setState({ scanning: false, done: 0, total: 0, errors: 0, last: null });
      return;
    }
    setState({ scanning: true, done: 0, total: jobs.length, errors: 0, last: null });
    if (applied.some((a) => strategyById(a.strategyId)?.python)) {
      try {
        await loadPython(); // Python strategies need the engine first (downloaded once)
      } catch {
        setState({ scanning: false, done: 0, total: jobs.length, errors: jobs.length, last: null });
        return;
      }
      if (id !== runId.current) return;
    }
    const next = {};
    const hist = {};
    const fresh = [];
    const seen = loadSeen();
    let done = 0;
    let errors = 0;
    const queue = [...jobs];
    const nowShift = () => nowIST();

    const worker = async () => {
      while (queue.length && id === runId.current) {
        const { a, symbol } = queue.shift();
        try {
          const def = strategyById(a.strategyId);
          if (!def || def.error) throw new Error('strategy missing');
          const candles = await getCandles(symbol, a.params.interval);
          const r = scan(candles, def, a.params, nowShift());
          // remember the latest few setups (not only the active one) so the app can say "last setup 2 days ago"
          const recent = r.hits.slice(-80).reverse().map((h) => ({ strategyId: a.strategyId, name: def.name, interval: a.params.interval, side: h.side, price: h.price, time: h.time, formedAt: h.formedAt, stop: h.stop ?? null, target: h.target ?? null }));
          if (recent.length) hist[symbol] = [...(hist[symbol] || []), ...recent];
          if (r.active) {
            (next[symbol] = next[symbol] || []).push({ strategyId: a.strategyId, name: def.name, interval: a.params.interval, time: r.active.time, price: r.active.price, side: r.active.side, formedAt: r.active.formedAt, stop: r.active.stop ?? null, target: r.active.target ?? null });
            const key = `${a.strategyId}|${symbol}|${r.active.side}|${r.active.time}`;
            if (!seen.has(key)) {
              seen.add(key);
              fresh.push({ strategyId: a.strategyId, name: def.name, symbol, interval: a.params.interval, side: r.active.side, time: r.active.time, price: r.active.price });
            }
          }
        } catch {
          errors++;
        }
        done++;
        if (id === runId.current) {
          setState((s) => ({ ...s, done, errors }));
          setSignals({ ...next });
          setHistory({ ...hist });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (id !== runId.current) return;
    saveSeen(seen);
    setSignals({ ...next });
    setHistory({ ...hist });
    setState({ scanning: false, done, total: jobs.length, errors, last: Date.now() });
    if (fresh.length) onNewRef.current?.(fresh);
  }, [applied]);

  useEffect(() => {
    run();
    const t = setInterval(run, 10 * 60 * 1000);
    return () => {
      clearInterval(t);
      runId.current++;
    };
  }, [run]);

  return { signals, history, state, rescan: run };
}
