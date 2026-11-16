import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart from './components/Chart.jsx';
import Watchlist from './components/Watchlist.jsx';
import Dashboard from './components/Dashboard.jsx';
import Settings from './components/Settings.jsx';
import BottomNav from './components/BottomNav.jsx';
import IndicatorModal from './components/IndicatorModal.jsx';
import StrategyTab from './components/StrategyTab.jsx';
import Toasts from './components/Toasts.jsx';
import Icon, { ICONS } from './components/Icon.jsx';
import { createFeed } from './lib/feed.js';
import { apiJson } from './lib/api.js';
import { fetchCandles } from './lib/candles.js';
import { INTERVALS, fmtNum, TF_LONG } from './lib/time.js';
import { nowIST, setDataDelay } from './lib/delay.js';
import { backtest, normCfg } from './lib/backtest.js';
import DemoPage from './components/DemoPage.jsx';
import { applySignals, checkExits, newAccount } from './lib/paper.js';
import { PALETTE, defaultParams } from './lib/registry.js';
import { TOOL_SPECS } from './lib/drawings.js';
import { changeOf } from './lib/hooks.js';
import { downloadPy, indicatorsFor, markersFor, setRegistry, strategyById } from './lib/strategy.js';
import { useScanner } from './lib/useScanner.js';
import { loadPython, usePyReady } from './lib/py.js';
import Logo from './components/Logo.jsx';
import { store } from './lib/store.js';
import { flushCloud } from './lib/cloud.js';
import StrategySheet from './components/StrategySheet.jsx';
import StrategySettings from './components/StrategySettings.jsx';
import StrategyStats from './components/StrategyStats.jsx';
import StrategyReport from './components/StrategyReport.jsx';

const load = (key, fallback) => {
  try {
    const v = store.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key, v) => {
  try {
    store.setItem(key, JSON.stringify(v));
  } catch {}
};

// one-time clean start: no indicators and no volume on the charts (the user asked for a clean chart)
const FRESH = !load('n50.clean2', false);
if (FRESH) save('n50.clean2', true);

const CHART_TYPES = [
  ['candles', 'Candles'],
  ['hollow', 'Hollow candles'],
  ['heikin', 'Heikin Ashi'],
  ['bars', 'Bars'],
  ['line', 'Line'],
  ['area', 'Area'],
];

const DEFAULT_SETTINGS = {
  theme: 'light',
  upColor: '#1a56db',
  downColor: '#0b2a6f',
  showVolume: false,
  drawColor: '#1a56db',
  drawWidth: 2,
  drawStyle: 'solid',
  magnet: false,
  keepTool: false,
};

function useQuote(feed, symbol) {
  const [q, setQ] = useState(feed.quotes[symbol]);
  useEffect(() => {
    setQ(feed.quotes[symbol]);
    let t = null;
    const off = feed.onTicks((ticks) => {
      if (t || !ticks.some((x) => x.s === symbol)) return;
      t = setTimeout(() => {
        t = null;
        setQ({ ...feed.quotes[symbol] });
      }, 500);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, [feed, symbol]);
  return q;
}

export default function App() {
  const feed = useMemo(() => createFeed(), []);
  const [symbols, setSymbols] = useState([]);
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [, setSnap] = useState(0);
  const [bannerOff, setBannerOff] = useState(false);

  const [tab, setTab] = useState('dashboard'); // always start on the Dashboard
  const [booting, setBooting] = useState(true); // short splash when the app opens
  const [switching, setSwitching] = useState(false); // short loader when changing tab
  const switchTimer = useRef(null);
  const [chartVisited, setChartVisited] = useState(false);

  const [settings, setSettings] = useState(() => {
    const legacy = {};
    const t = load('n50.theme', null);
    if (t) legacy.theme = t;
    const v = load('n50.vol', null);
    if (v != null) legacy.showVolume = v;
    const merged = { ...DEFAULT_SETTINGS, ...legacy, ...load('n50.settings', {}) };
    merged.theme = 'light'; // the app is white + blue only
    if (FRESH) merged.showVolume = false;
    if (merged.upColor === '#26a69a' && merged.downColor === '#ef5350') {
      merged.upColor = DEFAULT_SETTINGS.upColor; // old green/red default -> new blue palette
      merged.downColor = DEFAULT_SETTINGS.downColor;
    }
    if (merged.drawColor === '#2962ff') merged.drawColor = DEFAULT_SETTINGS.drawColor;
    return merged;
  });
  const patchSettings = useCallback((p) => setSettings((s) => ({ ...s, ...p })), []);

  const [symbol, setSymbol] = useState(() => load('n50.symbol', 'NIFTY50'));
  const [openCharts, setOpenCharts] = useState(() => {
    const o = load('n50.open', null);
    const s = load('n50.symbol', 'NIFTY50');
    const list = Array.isArray(o) && o.length ? o : [s];
    return list.includes(s) ? list : [...list, s];
  });
  const [interval, setInterval_] = useState(() => load('n50.interval', '5m'));
  const [chartType, setChartType] = useState(() => load('n50.type', 'candles'));
  const [indicators, setIndicators] = useState(() =>
    FRESH ? [] : load('n50.inds', [])
  );
  const [drawMap, setDrawMap] = useState(() => load('n50.draw', {}));
  const [applied, setApplied] = useState(() => load('n50.strat', []));
  const [customList, setCustomList] = useState(() => load('n50.custom', []));
  const [stratNames, setStratNames] = useState(() => load('n50.stratnames', {}));
  const [stratDefaults, setStratDefaults] = useState(() => load('n50.stratdef', {})); // inputs/indicator tweaks saved per strategy
  const [watch, setWatch] = useState(() => load('n50.wl', []));
  setRegistry(customList, stratNames); // strategies must be known before anything below renders
  // applied entries whose strategy no longer exists are ignored (never crash)
  const liveApplied = useMemo(() => applied.filter((a) => strategyById(a.strategyId)), [applied, customList]); // eslint-disable-line
  const [toasts, setToasts] = useState([]);
  const [tool, setTool] = useState('cursor');
  const [hideDrawings, setHideDrawings] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  // width of the stock list next to the chart; drag the divider (like TradingView). double-click = back to the default
  const [watchW, setWatchW] = useState(() => {
    const v = Number(load('n50.watchw', 290));
    return Number.isFinite(v) ? Math.min(640, Math.max(200, v)) : 290;
  });
  useEffect(() => save('n50.watchw', watchW), [watchW]);
  const splitDrag = useRef(null);
  const onSplitDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    splitDrag.current = { x: e.clientX, w: watchW };
    document.body.classList.add('split-dragging');
  };
  const onSplitMove = (e) => {
    const d = splitDrag.current;
    if (!d) return;
    const max = Math.min(640, Math.round(window.innerWidth * 0.7));
    setWatchW(Math.round(Math.min(max, Math.max(200, d.w + (d.x - e.clientX))))); // list sits on the right: dragging left makes it wider
  };
  const onSplitUp = () => {
    splitDrag.current = null;
    document.body.classList.remove('split-dragging');
  };
  const [indOpen, setIndOpen] = useState(false);

  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const quote = useQuote(feed, symbol);

  // ---------- toasts + strategy scanner ----------
  const pushToast = useCallback((t) => {
    const id = `${Date.now()}${Math.random()}`;
    setToasts((l) => [...l.slice(-3), { id, ...t }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 9000);
  }, []);
  const onNewSetups = useCallback(
    (list) => {
      const names = list.map((x) => x.symbol);
      const side = list.every((x) => x.side === 'sell') ? 'SELL' : list.every((x) => x.side !== 'sell') ? 'BUY' : 'BUY/SELL';
      const title = list.length === 1 ? `${side} setup: ${names[0]}` : `${list.length} new ${side} setups`;
      const text = names.slice(0, 6).join(', ') + (names.length > 6 ? ` +${names.length - 6} more` : '');
      pushToast({ kind: 'setup', title, text, symbol: names[0], interval: list[0].interval, strategyId: list[0].strategyId, setupTime: list[0].time });
      try {
        if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text });
      } catch {}
    },
    [pushToast]
  );
  const scanner = useScanner(liveApplied, onNewSetups);

  // Data source: Angel One first, Yahoo Finance (15 min delayed) when Angel One is not connected.
  // Ask the server every 20 s which one is active. When it switches, prices and candles reload (no page reload).
  const lastSource = useRef(null);
  const lastDelay = useRef(0);
  useEffect(() => {
    const delay = health?.delayed ? 900 : 0; // strategies must not treat a candle as finished before the delayed feed has it
    setDataDelay(delay);
    if (delay !== lastDelay.current) {
      lastDelay.current = delay;
      scanner.rescan?.();
    }
    const src = health?.source || null;
    if (src && lastSource.current && src !== lastSource.current) {
      feed.loadSnapshot(true).then(() => setSnap((n) => n + 1));
      setReloadKey((k) => k + 1);
      scanner.rescan?.();
    }
    if (src) lastSource.current = src;
  }, [health]); // eslint-disable-line
  useEffect(() => {
    const id = setInterval(() => {
      apiJson('/api/health')
        .then(setHealth)
        .catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, []);

  // ---------- startup ----------
  useEffect(() => {
    apiJson('/api/symbols')
      .then((j) => setSymbols(Array.isArray(j) ? j : []))
      .catch(() => setError("Can't reach the server. Is the backend running? (npm run dev)"));
    apiJson('/api/health')
      .then(setHealth)
      .catch(() => {});
    feed.loadSnapshot().then(() => setSnap((n) => n + 1));
    const off = feed.onStatus(setStatus);
    return () => {
      off();
      feed.close();
    };
  }, [feed]);

  // drop saved charts whose symbol no longer exists
  useEffect(() => {
    if (!symbols.length) return;
    const ok = new Set(symbols.map((s) => s.symbol));
    setOpenCharts((l) => {
      const f = l.filter((s) => ok.has(s));
      return f.length ? f : ['NIFTY50'];
    });
    setSymbol((s) => (ok.has(s) ? s : 'NIFTY50'));
  }, [symbols]);

  // ---------- persistence ----------
  useEffect(() => save('n50.symbol', symbol), [symbol]);
  useEffect(() => save('n50.open', openCharts), [openCharts]);
  // The timeframe you pick yourself is remembered. A timeframe that came from a strategy setup (or that you
  // change while looking at a setup) is only for that view and is never saved as your default.
  const [chartCtx, setChartCtx] = useState(null); // { symbol, strategyId, interval, time } when a stock was opened from a setup
  const chartCtxRef = useRef(null);
  chartCtxRef.current = chartCtx;
  const lockCtx = chartCtx && chartCtx.symbol === symbol ? chartCtx : null;
  useEffect(() => {
    if (!lockCtx) save('n50.interval', interval);
  }, [interval, lockCtx]);
  useEffect(() => save('n50.type', chartType), [chartType]);
  useEffect(() => save('n50.inds', indicators), [indicators]);
  useEffect(() => save('n50.settings', settings), [settings]);
  useEffect(() => save('n50.strat', applied), [applied]);
  useEffect(() => save('n50.custom', customList), [customList]);
  useEffect(() => save('n50.stratnames', stratNames), [stratNames]);
  useEffect(() => save('n50.stratdef', stratDefaults), [stratDefaults]);
  useEffect(() => save('n50.wl', watch), [watch]);
  const drawMapRef = useRef(drawMap);
  drawMapRef.current = drawMap;
  useEffect(() => {
    const id = setTimeout(() => save('n50.draw', drawMap), 150);
    return () => clearTimeout(id);
  }, [drawMap]);
  useEffect(() => {
    // never lose a drawing: write it out right before the page hides / closes
    const flush = () => save('n50.draw', drawMapRef.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = settings.theme;
    r.style.setProperty('--up', settings.upColor);
    r.style.setProperty('--down', settings.downColor);
  }, [settings.theme, settings.upColor, settings.downColor]);

  // ---------- candles for the active chart ----------
  useEffect(() => {
    if (!chartVisited) return undefined;
    let dead = false;
    setLoading(true);
    setError(null);
    setCandles([]);
    fetchCandles(symbol, interval)
      .then((list) => {
        if (dead) return;
        setCandles(list);
        setLoading(false);
        if (!list.length) setError('No data for this timeframe (market may be closed).');
      })
      .catch((e) => {
        if (dead) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [symbol, interval, reloadKey, chartVisited]);

  // ---------- navigation ----------
  const goTab = useCallback(
    (t) => {
      if (t === tab) return;
      setTab(t);
      if (t === 'chart') setChartVisited(true);
      // brief loading state, like a native app (longer the first time the chart opens)
      setSwitching(true);
      clearTimeout(switchTimer.current);
      switchTimer.current = setTimeout(() => setSwitching(false), t === 'chart' && !chartVisited ? 700 : 380);
    },
    [tab, chartVisited]
  );
  useEffect(() => {
    const id = setTimeout(() => setBooting(false), 900);
    return () => {
      clearTimeout(id);
      clearTimeout(switchTimer.current);
    };
  }, []);

  const openChart = useCallback((sym) => {
    if (chartCtxRef.current) {
      setInterval_(load('n50.interval', '5m')); // back to the timeframe the user normally uses
      setChartCtx(null);
    }
    setOpenCharts((l) => (l.includes(sym) ? l : [...l.slice(-9), sym]));
    setSymbol(sym);
    setTool('cursor');
    setWatchOpen(false);
  }, []);
  const openFromDashboard = useCallback(
    (sym) => {
      openChart(sym);
      goTab('chart');
    },
    [openChart, goTab]
  );
  // Opening a stock THROUGH a strategy setup: the chart starts on that strategy's own timeframe.
  const openSetup = useCallback(
    (ctx) => {
      if (!ctx?.symbol) return;
      openChart(ctx.symbol);
      if (ctx.interval) setInterval_(ctx.interval);
      setChartCtx(ctx.strategyId && ctx.interval ? ctx : null);
      goTab('chart');
    },
    [openChart, goTab]
  );
  // manual timeframe change: allowed, but warn when it differs from the strategy's timeframe
  const changeInterval = useCallback(
    (id) => {
      setInterval_(id);
      if (lockCtx && id !== lockCtx.interval)
        pushToast({
          kind: 'warn',
          title: 'Different timeframe',
          text: `Strategy timeframe is ${TF_LONG[lockCtx.interval] || lockCtx.interval}. Changing the chart timeframe may show candles that are different from the timeframe used to generate this setup.`,
        });
    },
    [lockCtx, pushToast]
  );

  // ---------- strategies ----------
  const applyStrategy = useCallback(
    (strategyId, cfg) => {
      if (!cfg) {
        setApplied((l) => l.filter((a) => a.strategyId !== strategyId)); // picker saved with no stocks
        return;
      }
      setApplied((l) => [...l.filter((a) => a.strategyId !== strategyId), { strategyId, symbols: cfg.symbols, params: cfg.params }]);
      pushToast({ kind: 'ok', title: 'Strategy applied', text: `${strategyById(strategyId)?.name || 'Strategy'} on ${cfg.symbols.length} stocks` });
      try {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      } catch {}
    },
    [pushToast]
  );
  const removeStrategy = useCallback((strategyId) => setApplied((l) => l.filter((a) => a.strategyId !== strategyId)), []);
  // take ONE stock out of a strategy (its marks + indicators leave that chart at once)
  const removeStrategyFromSymbol = useCallback(
    (strategyId, sym) =>
      setApplied((l) =>
        l
          .map((a) => (a.strategyId === strategyId ? { ...a, symbols: a.symbols.filter((x) => x !== sym) } : a))
          .filter((a) => a.symbols.length > 0)
      ),
    []
  );
  const saveCustom = useCallback((item) => {
    const id = item.id || `custom-${Date.now().toString(36)}`;
    const entry = { id, name: item.name, code: item.code, lang: item.lang, meta: item.meta, fileName: item.fileName };
    setCustomList((l) => (l.some((c) => c.id === id) ? l.map((c) => (c.id === id ? entry : c)) : [...l, entry]));
    setStratNames((m) => {
      if (!m[id]) return m;
      const { [id]: _drop, ...rest } = m; // the typed name replaces an old rename
      return rest;
    });
    return id;
  }, []);
  const deleteCustom = useCallback((id) => {
    setCustomList((l) => l.filter((c) => c.id !== id));
    setApplied((l) => l.filter((a) => a.strategyId !== id));
    setStratNames((m) => {
      const { [id]: _drop, ...rest } = m;
      return rest;
    });
  }, []);
  const renameStrategy = useCallback(
    (id, name) =>
      setStratNames((m) => {
        if (!name) {
          const { [id]: _drop, ...rest } = m;
          return rest;
        }
        return { ...m, [id]: name };
      }),
    []
  );
  const saveStrategyParams = useCallback((id, params) => {
    setStratDefaults((m) => ({ ...m, [id]: params }));
    setApplied((l) => l.map((a) => (a.strategyId === id ? { ...a, params } : a))); // re-scans automatically
  }, []);
  const [stratSheet, setStratSheet] = useState(false);
  const [statsOn, setStatsOn] = useState(() => load('n50.statson', {})); // strategy id -> show the accuracy panel on the chart
  useEffect(() => save('n50.statson', statsOn), [statsOn]);
  // the panel is shown by default for every strategy on the chart; false = the user removed it (can be brought back)
  const toggleStats = useCallback((id) => setStatsOn((m) => ({ ...m, [id]: m[id] === false })), []);
  const [report, setReport] = useState(null); // strategy id whose full report screen is open
  // accuracy-test settings per strategy (stop-loss % / target %) and panel place / size on the chart
  const [statCfg, setStatCfg] = useState(() => load('n50.statcfg', {}));
  useEffect(() => save('n50.statcfg', statCfg), [statCfg]);
  const cfgOf = (id) => normCfg(statCfg[id]);
  const patchCfg = useCallback((id, patch) => setStatCfg((m) => ({ ...m, [id]: { ...normCfg(m[id]), ...patch } })), []);
  const [statPos, setStatPos] = useState(() => load('n50.statpos', {})); // strategy id -> { x, y, w, h }
  useEffect(() => save('n50.statpos', statPos), [statPos]);
  const setPos = useCallback((id, l) => setStatPos((m) => { const n = { ...m }; if (l) n[id] = l; else delete n[id]; return n; }), []);
  const [chartStratId, setChartStratId] = useState(null); // strategy whose settings page is open on top of the chart
  // chart -> "Strategy": apply a saved strategy to the stock that is open
  const addStrategyToSymbol = useCallback(
    (id, sym) => {
      const d = strategyById(id);
      if (!d) return;
      setApplied((l) =>
        l.some((a) => a.strategyId === id)
          ? l.map((a) => (a.strategyId === id ? { ...a, symbols: a.symbols.includes(sym) ? a.symbols : [...a.symbols, sym] } : a))
          : [...l, { strategyId: id, symbols: [sym], params: { ...d.defaults, ...(stratDefaults[id] || {}) } }]
      );
      setStratSheet(false);
      pushToast({ kind: 'ok', title: 'Strategy added', text: `${d.name} on ${sym}` });
    },
    [stratDefaults, pushToast]
  );
  const toggleWatch = useCallback((sym) => setWatch((l) => (l.includes(sym) ? l.filter((x) => x !== sym) : [...l, sym])), []);

  const pyReady = usePyReady();
  useEffect(() => {
    if (customList.some((c) => c.lang === 'py')) loadPython().catch(() => {});
  }, [customList]);
  const stratHere = useMemo(() => liveApplied.filter((a) => a.symbols.includes(symbol)), [liveApplied, symbol]);
  const stratMatch = useMemo(() => stratHere.filter((a) => a.params.interval === interval), [stratHere, interval]);
  const stratOther = stratHere.find((a) => a.params.interval !== interval && !stratMatch.length);
  const markers = useMemo(() => {
    if (!candles.length || !stratMatch.length) return [];
    const now = nowIST();
    return stratMatch.flatMap((a) => {
      try {
        return markersFor(candles, strategyById(a.strategyId), a.params, now, settings.upColor, settings.downColor);
      } catch {
        return [];
      }
    });
  }, [candles, stratMatch, settings.upColor, settings.downColor, customList, pyReady]); // eslint-disable-line
  // ---------- demo (paper) trading account: saved with the user's other data ----------
  const [paper, setPaper] = useState(() => {
    const a = load('n50.paper', null);
    return a && typeof a.cash === 'number' && Array.isArray(a.positions) ? { ...newAccount(a.capital || 100000), ...a } : newAccount();
  });
  useEffect(() => save('n50.paper', paper), [paper]);
  const cfgOfRef = useRef(cfgOf);
  cfgOfRef.current = cfgOf;
  const priceOf = useCallback((s) => feed.quotes[s]?.p ?? null, [feed]);
  useEffect(() => {
    setPaper((acc) => applySignals(acc, scanner.signals, { cfgOf: (id) => cfgOfRef.current(id), priceOf }));
  }, [scanner.signals, priceOf]);
  useEffect(() => {
    const t = setInterval(() => setPaper((acc) => (acc.positions.length ? checkExits(acc, priceOf) : acc)), 5000);
    return () => clearInterval(t);
  }, [priceOf]);
  const takeSignals = useCallback(() => setPaper((acc) => applySignals(acc, scanner.signals, { cfgOf: (id) => cfgOfRef.current(id), priceOf, includeOld: true })), [scanner.signals, priceOf]);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoPreset, setDemoPreset] = useState(null);
  const paramsOf = useCallback(
    (id) => {
      const d = strategyById(id);
      const a = liveApplied.find((x) => x.strategyId === id);
      return { ...(d?.defaults || {}), ...(stratDefaults[id] || {}), ...(a?.params || {}) };
    },
    [liveApplied, stratDefaults] // eslint-disable-line
  );

  // Long / Short position boxes (entry, stop-loss, target) for the strategies that have "Show position boxes" ticked
  const positions = useMemo(() => {
    if (!candles.length || !stratMatch.length) return [];
    const now = nowIST();
    const lastT = candles[candles.length - 1].time;
    const out = [];
    for (const a of stratMatch) {
      const cfg = cfgOf(a.strategyId);
      const def = strategyById(a.strategyId);
      if (!cfg.pos || !def) continue;
      try {
        for (const t of backtest(candles, def, a.params, now, { cfg }).trades) {
          out.push({ side: t.side, t0: t.time, t1: t.exitTime ?? lastT, entry: t.entry, stop: t.stop ?? null, target: t.target ?? null, exit: t.exit ?? null, win: !!t.win, open: !!t.open, ret: t.ret ?? 0 });
        }
      } catch {}
    }
    return out;
  }, [candles, stratMatch, statCfg, customList, pyReady]); // eslint-disable-line
  const chartIndicators = useMemo(
    () => [...indicators, ...stratMatch.flatMap((a) => indicatorsFor(strategyById(a.strategyId), a.params).map((i) => ({ ...i, id: `${i.id}-${a.strategyId}` })))],
    [indicators, stratMatch, customList, pyReady] // eslint-disable-line
  );

  const closeChart = (sym) => {
    if (openCharts.length <= 1) return;
    const i = openCharts.indexOf(sym);
    const next = openCharts.filter((s) => s !== sym);
    setOpenCharts(next);
    if (sym === symbol) setSymbol(next[Math.max(0, i - 1)]);
  };

  // ---------- drawings ----------
  const drawings = drawMap[symbol] || [];
  const setDrawings = useCallback((list) => setDrawMap((m) => ({ ...m, [symbol]: list })), [symbol]);
  const toolDone = useCallback(() => setTool('cursor'), []);
  const drawn = useCallback(() => {
    if (!settings.keepTool) setTool('cursor'); // 'stay in drawing mode' keeps the tool active
  }, [settings.keepTool]);
  const removeInd = useCallback((id) => setIndicators((l) => l.filter((i) => i.id !== id)), []);
  const drawDefaults = { color: settings.drawColor, width: settings.drawWidth, style: settings.drawStyle };
  const patchDrawDefaults = useCallback(
    (p) =>
      patchSettings({
        ...(p.color ? { drawColor: p.color } : {}),
        ...(p.width ? { drawWidth: p.width } : {}),
        ...(p.style ? { drawStyle: p.style } : {}),
      }),
    [patchSettings]
  );
  const totalDrawings = Object.values(drawMap).reduce((n, l) => n + l.length, 0);

  const clearAllDrawings = () => {
    if (window.confirm('Delete every drawing on every stock?')) setDrawMap({});
  };
  const resetAll = async () => {
    if (!window.confirm('Reset all settings, open charts, indicators and drawings?')) return;
    try {
      store.keys().forEach((k) => store.removeItem(k));
      await Promise.race([flushCloud(), new Promise((r) => setTimeout(r, 4000))]);
    } catch {}
    location.reload();
  };

  const info = symbols.find((s) => s.symbol === symbol);
  const { ch, pct, dir } = changeOf(quote);
  const intervalLabel = INTERVALS.find((i) => i.id === interval)?.label;
  const nameOf = (s) => symbols.find((x) => x.symbol === s)?.name || s;

  return (
    <div className="app">
      {health?.connected === false && !bannerOff && (
        <div className="conn-banner info" role="status">
          <span className="cb-text">
            <b>Angel One is not connected.</b> Showing {health.label || 'Yahoo Finance (15 min delayed)'} data. Angel One data starts by itself when it connects.
          </span>
          <button className="cb-x" onClick={() => setBannerOff(true)} aria-label="Hide this message">
            <Icon d={ICONS.close} size={14} />
          </button>
        </div>
      )}
      {booting && (
        <div className="splash" role="status" aria-label="Loading">
          <div className="splash-logo">
            <Logo />
          </div>
          <b>Jaislin Terminal</b>
          <span className="spinner big" />
        </div>
      )}
      {!booting && switching && (
        <div className="tab-loader" role="status" aria-label="Loading">
          <span className="spinner big" />
          <div className="skel-stack">
            <i className="skeleton" style={{ width: '46%' }} />
            <i className="skeleton" style={{ width: '88%' }} />
            <i className="skeleton" style={{ width: '72%' }} />
            <i className="skeleton" style={{ width: '80%' }} />
          </div>
        </div>
      )}
      <section className={`screen ${tab === 'dashboard' ? '' : 'hidden'}`} aria-label="Dashboard">
        <Dashboard symbols={symbols} feed={feed} status={status} health={health} signals={scanner.signals} history={scanner.history} appliedList={liveApplied} hasStrategy={liveApplied.length > 0} watch={watch} onToggleWatch={toggleWatch} onOpen={openFromDashboard} onOpenSetup={openSetup} onOpenDemo={() => { setDemoPreset({ symbol }); setDemoOpen(true); }} />
      </section>

      {chartVisited && (
        <section className={`screen ${tab === 'chart' ? '' : 'hidden'}`} aria-label="Chart">
          <header className="topbar">
            <button className="icon-btn only-mobile" onClick={() => setWatchOpen((o) => !o)} aria-label="Stock list">
              <Icon d={ICONS.list} />
            </button>
            <div className="sym-block">
              <b>{symbol}</b>
              <span className="muted sym-name">{info?.name}</span>
            </div>
            <div className="price-block">
              <span className={`price ${dir}`}>{fmtNum(quote?.p)}</span>
              {pct != null && (
                <span className={`chg ${dir}`}>
                  {ch >= 0 ? '+' : ''}
                  {fmtNum(ch)} ({pct >= 0 ? '+' : ''}
                  {pct.toFixed(2)}%)
                </span>
              )}
            </div>
            <div className="sep" />
            <div className="seg tf" role="tablist" aria-label="Timeframe">
              {INTERVALS.map((i) => (
                <button key={i.id} className={interval === i.id ? 'on' : ''} onClick={() => changeInterval(i.id)}>
                  {i.label}
                </button>
              ))}
            </div>
            <select className="select" value={chartType} onChange={(e) => setChartType(e.target.value)} aria-label="Chart type">
              {CHART_TYPES.map(([id, l]) => (
                <option key={id} value={id}>
                  {l}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => setIndOpen(true)}>
              Indicators{indicators.length ? ` (${indicators.length})` : ''}
            </button>
            <button className="btn" onClick={() => setStratSheet(true)}>
              + Strategy{stratMatch.length ? ` (${stratMatch.length})` : ''}
            </button>
            <button className={`btn ${settings.showVolume ? 'on' : ''}`} onClick={() => patchSettings({ showVolume: !settings.showVolume })}>
              Volume
            </button>
          </header>

          <div className="chart-tabs" role="tablist" aria-label="Open charts">
            {openCharts.map((s) => (
              <div key={s} className={`ctab ${s === symbol ? 'on' : ''}`} role="tab" aria-selected={s === symbol}>
                <button className="ctab-name" onClick={() => openChart(s)} title={nameOf(s)}>
                  {s}
                </button>
                {openCharts.length > 1 && (
                  <button className="ctab-x" onClick={() => closeChart(s)} aria-label={`Close ${s} chart`}>
                    ×
                  </button>
                )}
              </div>
            ))}
            <button className="ctab-add" onClick={() => setWatchOpen(true)} aria-label="Open another stock" title="Open another stock">
              <Icon d={ICONS.plus} size={16} />
            </button>
          </div>

          <div className="body">
            <nav className="tools" aria-label="Drawing tools">
              {TOOL_SPECS.map((t) => (
                <button
                  key={t.id}
                  className={`icon-btn ${tool === t.id ? 'on' : ''}`}
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => {
                    setTool(t.id);
                    if (t.id !== 'cursor') setHideDrawings(false);
                  }}
                >
                  <Icon d={t.icon} />
                </button>
              ))}
              <div className="tools-gap" />
              <button className={`icon-btn ${settings.magnet ? 'on' : ''}`} title="Magnet: snap to candle open/high/low/close" aria-label="Magnet" aria-pressed={settings.magnet} onClick={() => patchSettings({ magnet: !settings.magnet })}>
                <Icon d={ICONS.magnet} />
              </button>
              <button className={`icon-btn ${settings.keepTool ? 'on' : ''}`} title="Stay in drawing mode after each drawing" aria-label="Stay in drawing mode" aria-pressed={settings.keepTool} onClick={() => patchSettings({ keepTool: !settings.keepTool })}>
                <Icon d={ICONS.pin} />
              </button>
              <button className={`icon-btn ${hideDrawings ? 'on' : ''}`} title={hideDrawings ? 'Show drawings' : 'Hide drawings'} aria-label={hideDrawings ? 'Show drawings' : 'Hide drawings'} aria-pressed={hideDrawings} onClick={() => setHideDrawings((h) => !h)}>
                <Icon d={hideDrawings ? ICONS.eyeOff : ICONS.eye} />
              </button>
              <button className="icon-btn" title="Undo last drawing" aria-label="Undo last drawing" disabled={!drawings.length} onClick={() => setDrawings(drawings.slice(0, -1))}>
                <Icon d={ICONS.undo} />
              </button>
              <button className="icon-btn" title="Remove all drawings on this stock" aria-label="Remove all drawings on this stock" disabled={!drawings.length} onClick={() => setDrawings([])}>
                <Icon d={ICONS.trash} />
              </button>
            </nav>

            <main className="center">
              <Chart
                symbol={symbol}
                interval={interval}
                intervalLabel={intervalLabel}
                candles={candles}
                chartType={chartType}
                indicators={chartIndicators}
                strategies={[
                  ...stratMatch.map((a) => ({ id: a.strategyId, name: strategyById(a.strategyId).name, note: `${markers.length} setup${markers.length === 1 ? '' : 's'}` })),
                  ...(stratOther && !stratMatch.length
                    ? [{ id: stratOther.strategyId, name: strategyById(stratOther.strategyId).name, note: `· set for ${INTERVALS.find((i) => i.id === stratOther.params.interval)?.label} – tap to switch`, action: () => setInterval_(stratOther.params.interval) }]
                    : []),
                ]}
                onRemoveStrategy={(id) => removeStrategyFromSymbol(id, symbol)}
                onOpenStrategy={setChartStratId}
                statsOn={statsOn}
                onToggleStats={toggleStats}
                overlay={
                  stratMatch.length ? (
                    <div className="stats-layer">
                      {(() => {
                        const panel = (a) => (
                          <StrategyStats
                            key={a.strategyId}
                            def={strategyById(a.strategyId)}
                            params={a.params}
                            candles={candles}
                            symbol={symbol}
                            cfg={cfgOf(a.strategyId)}
                            layout={statPos[a.strategyId] || null}
                            onLayout={(l) => setPos(a.strategyId, l)}
                            onOpen={() => setReport(a.strategyId)}
                            onClose={() => toggleStats(a.strategyId)}
                          />
                        );
                        const shown = stratMatch.filter((a) => statsOn[a.strategyId] !== false);
                        const hidden = stratMatch.filter((a) => statsOn[a.strategyId] === false);
                        return (
                          <>
                            <div className="stats-stack">
                              {shown.filter((a) => !(statPos[a.strategyId] && statPos[a.strategyId].x != null)).map(panel)}
                              {hidden.map((a) => (
                                <button key={a.strategyId} className="ss-restore" onClick={() => toggleStats(a.strategyId)} title="Show the strategy panel again">
                                  <Icon d={ICONS.plus} size={14} />
                                  <span>{strategyById(a.strategyId).name} data</span>
                                </button>
                              ))}
                            </div>
                            {shown.filter((a) => statPos[a.strategyId] && statPos[a.strategyId].x != null).map(panel)}
                          </>
                        );
                      })()}
                    </div>
                  ) : null
                }
                theme={settings.theme}
                showVolume={settings.showVolume}
                upColor={settings.upColor}
                downColor={settings.downColor}
                feed={feed}
                tool={tool}
                onToolDone={toolDone}
                onDrawn={drawn}
                drawings={drawings}
                onDrawingsChange={setDrawings}
                drawDefaults={drawDefaults}
                onDrawDefaults={patchDrawDefaults}
                magnet={settings.magnet}
                hideDrawings={hideDrawings}
                markers={markers}
                positions={positions}
                onRemoveIndicator={removeInd}
                onOpenIndicators={() => setIndOpen(true)}
              />
              {(loading || error) && (
                <div className="overlay">
                  {loading && <div className="spinner" aria-label="Loading" />}
                  {error && (
                    <div className="err">
                      <p>{error}</p>
                      <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
              {tool !== 'cursor' && <div className="hint">Draw mode: tap or click on the chart. Esc or Cursor to stop.</div>}
            </main>

            <div className={`watch-wrap ${watchOpen ? 'open' : ''}`} style={{ '--watch-w': `${watchW}px` }}>
              <div
                className="split-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to change the width of the stock list"
                title="Drag to resize · double-click to reset"
                onPointerDown={onSplitDown}
                onPointerMove={onSplitMove}
                onPointerUp={onSplitUp}
                onPointerCancel={onSplitUp}
                onDoubleClick={() => setWatchW(290)}
              >
                <i />
              </div>
              <Watchlist symbols={symbols} feed={feed} active={symbol} signals={scanner.signals} watch={watch} onToggleWatch={toggleWatch} onSelect={openChart} />
            </div>
            {watchOpen && <div className="scrim only-mobile" onClick={() => setWatchOpen(false)} />}
          </div>
        </section>
      )}

      <section className={`screen ${tab === 'strategy' ? '' : 'hidden'}`} aria-label="Strategy">
        <StrategyTab
          symbols={symbols}
          appliedList={liveApplied}
          signals={scanner.signals}
          scanState={scanner.state}
          customList={customList}
          names={stratNames}
          stratDefaults={stratDefaults}
          onSaveParams={saveStrategyParams}
          statsOn={statsOn}
          onToggleStats={toggleStats}
          cfgOf={cfgOf}
          onCfg={patchCfg}
          onApply={applyStrategy}
          onRemove={removeStrategy}
          onRemoveSymbol={removeStrategyFromSymbol}
          onRescan={scanner.rescan}
          onOpenSetup={openSetup}
          onSaveCustom={saveCustom}
          onDeleteCustom={deleteCustom}
          onRename={renameStrategy}
        />
      </section>

      <section className={`screen ${tab === 'settings' ? '' : 'hidden'}`} aria-label="Settings">
        <Settings
          settings={settings}
          onSettings={patchSettings}
          health={health}
          status={status}
          indicatorsCount={indicators.length}
          onOpenIndicators={() => setIndOpen(true)}
          drawingsCount={totalDrawings}
          onClearDrawings={clearAllDrawings}
          onResetAll={resetAll}
        />
      </section>

      <Toasts
        items={toasts}
        onClose={(id) => setToasts((l) => l.filter((x) => x.id !== id))}
        onClick={(t) => {
          setToasts((l) => l.filter((x) => x.id !== t.id));
          if (t.symbol) openSetup({ symbol: t.symbol, strategyId: t.strategyId, interval: t.interval, time: t.setupTime });
          else goTab('strategy');
        }}
      />
      <BottomNav tab={tab} onTab={goTab} badge={Object.keys(scanner.signals).length} />

      {report && (() => {
        const d = strategyById(report);
        const a = liveApplied.find((x) => x.strategyId === report && x.symbols.includes(symbol));
        if (!d || !a) return null;
        return (
          <StrategyReport
            def={d}
            params={a.params}
            candles={candles}
            symbol={symbol}
            stockName={nameOf(symbol)}
            sourceLabel={health?.label}
            cfg={cfgOf(report)}
            onCfg={(patch) => patchCfg(report, patch)}
            onOpenInputs={() => setChartStratId(report)}
            onOpenDemo={() => {
              setDemoPreset({ strategyId: report, symbol });
              setDemoOpen(true);
            }}
            onBack={() => setReport(null)}
            onHidePanel={() => {
              setStatsOn((m) => ({ ...m, [report]: false }));
              setReport(null);
            }}
          />
        );
      })()}
      {chartStratId && strategyById(chartStratId) && (() => {
        const d = strategyById(chartStratId);
        const a = liveApplied.find((x) => x.strategyId === d.id);
        return (
          <StrategySettings
            key={d.id}
            def={d}
            applied={a}
            baseParams={{ ...d.defaults, ...(stratDefaults[d.id] || {}), ...(a?.params || {}) }}
            menuActions={{
              download: () => downloadPy(d),
              removeAll: () => {
                if (window.confirm(`Remove "${d.name}" from all stocks?`)) {
                  removeStrategy(d.id);
                  setChartStratId(null);
                }
              },
            }}
            onSaveParams={(p) => saveStrategyParams(d.id, p)}
            statsOn={statsOn}
            onToggleStats={toggleStats}
            cfg={cfgOf(d.id)}
            onCfg={(patch) => patchCfg(d.id, patch)}
            onBack={() => setChartStratId(null)}
          />
        );
      })()}
      {demoOpen && <DemoPage onClose={() => setDemoOpen(false)} symbols={symbols} appliedList={liveApplied} paramsOf={paramsOf} cfgOf={cfgOf} paper={paper} setPaper={setPaper} feed={feed} onTakeSignals={takeSignals} preset={demoPreset} />}
      {stratSheet && <StrategySheet symbol={symbol} appliedList={liveApplied} onAdd={(id) => addStrategyToSymbol(id, symbol)} onClose={() => setStratSheet(false)} />}
      {indOpen && <IndicatorModal indicators={indicators} onChange={setIndicators} onClose={() => setIndOpen(false)} />}
    </div>
  );
}
