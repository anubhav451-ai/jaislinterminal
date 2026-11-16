// Python strategies. The browser runs Python through Pyodide (Python compiled to WebAssembly).
// It is downloaded from a CDN the first time a Python strategy is used (about 10 MB, then cached).
import { useEffect, useState } from 'react';

const PYODIDE_VERSION = '0.26.4';
const BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// Small indicator toolkit that every uploaded strategy can use as `ta`, written in plain Python.
const PRELUDE = String.raw`
import json, math

class _P(dict):
    __getattr__ = dict.get

def _nz(v):
    return v is not None and v == v

class _TA:
    @staticmethod
    def sma(v, n):
        out, s = [None] * len(v), 0.0
        for i, x in enumerate(v):
            s += x
            if i >= n: s -= v[i - n]
            if i >= n - 1: out[i] = s / n
        return out
    @staticmethod
    def ema(v, n):
        out, k, prev = [None] * len(v), 2.0 / (n + 1), None
        for i, x in enumerate(v):
            if x is None: continue
            prev = x if prev is None else x * k + prev * (1 - k)
            if i >= n - 1: out[i] = prev
        return out
    @staticmethod
    def rma(v, n):
        out, prev = [None] * len(v), None
        for i, x in enumerate(v):
            if i < n - 1: continue
            if prev is None: prev = sum(v[i - n + 1:i + 1]) / n
            else: prev = (prev * (n - 1) + x) / n
            out[i] = prev
        return out
    @staticmethod
    def wma(v, n):
        out, w = [None] * len(v), n * (n + 1) / 2.0
        for i in range(n - 1, len(v)):
            out[i] = sum(v[i - n + 1 + j] * (j + 1) for j in range(n)) / w
        return out
    @staticmethod
    def stdev(v, n):
        out = [None] * len(v)
        for i in range(n - 1, len(v)):
            w = v[i - n + 1:i + 1]; m = sum(w) / n
            out[i] = math.sqrt(sum((x - m) ** 2 for x in w) / n)
        return out
    @staticmethod
    def highest(v, n):
        return [max(v[i - n + 1:i + 1]) if i >= n - 1 else None for i in range(len(v))]
    @staticmethod
    def lowest(v, n):
        return [min(v[i - n + 1:i + 1]) if i >= n - 1 else None for i in range(len(v))]
    @staticmethod
    def rsi(v, n=14):
        up = [0.0] + [max(v[i] - v[i - 1], 0) for i in range(1, len(v))]
        dn = [0.0] + [max(v[i - 1] - v[i], 0) for i in range(1, len(v))]
        a, b = _TA.rma(up, n), _TA.rma(dn, n)
        return [None if (x is None or y is None) else (100.0 if y == 0 else 100 - 100 / (1 + x / y)) for x, y in zip(a, b)]
    @staticmethod
    def atr(high, low, close, n=14):
        tr = [high[0] - low[0]] + [max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1])) for i in range(1, len(close))]
        return _TA.rma(tr, n)
    @staticmethod
    def bbands(v, n=20, mult=2.0):
        m, s = _TA.sma(v, n), _TA.stdev(v, n)
        up = [None if a is None else a + mult * b for a, b in zip(m, s)]
        lo = [None if a is None else a - mult * b for a, b in zip(m, s)]
        return m, up, lo
    @staticmethod
    def crossover(a, b):
        return [i > 0 and _nz(a[i]) and _nz(b[i]) and _nz(a[i - 1]) and _nz(b[i - 1]) and a[i - 1] <= b[i - 1] and a[i] > b[i] for i in range(len(a))]
    @staticmethod
    def crossunder(a, b):
        return [i > 0 and _nz(a[i]) and _nz(b[i]) and _nz(a[i - 1]) and _nz(b[i - 1]) and a[i - 1] >= b[i - 1] and a[i] < b[i] for i in range(len(a))]

ta = _TA()

def __load(code):
    ns = {"ta": ta, "math": math, "__name__": "strategy"}
    exec(compile(code, "strategy.py", "exec"), ns)
    if not callable(ns.get("evaluate")):
        raise ValueError("The file must define  def evaluate(candles, p):")
    return ns

def __flat(x, n):
    if x is None: return [False] * n
    out = [bool(v) if _nz(v) else False for v in list(x)]
    return (out + [False] * n)[:n]

def __run(ns, candles_json, params_json):
    c = json.loads(candles_json)
    p = _P(json.loads(params_json))
    n = len(c["close"])
    r = ns["evaluate"](c, p)
    if isinstance(r, (tuple, list)) and len(r) == 2 and not isinstance(r[0], (bool, int, float)):
        r = {"buy": r[0], "sell": r[1]}
    elif not isinstance(r, dict):
        r = {"buy": r, "sell": None}
    return json.dumps({"buy": __flat(r.get("buy"), n), "sell": __flat(r.get("sell"), n)})

def __indicators(ns, params_json):
    f = ns.get("indicators") or ns.get("INDICATORS")
    if f is None: return "[]"
    p = _P(json.loads(params_json))
    return json.dumps(f(p) if callable(f) else f)

def __meta(ns):
    d = ns.get("DEFAULTS") or {}
    return json.dumps({
        "description": str(ns.get("DESCRIPTION") or ns.get("NAME") or ""),
        "rules": [str(x) for x in (ns.get("RULES") or [])],
        "defaults": {k: v for k, v in dict(d).items() if isinstance(v, (int, float, str, bool))},
        "side": str(ns.get("SIDE") or "both").lower(),
        "minBars": int(ns.get("MIN_BARS") or 2),
    })
`;

let pyodide = null;
let loading = null;
const listeners = new Set();
const nsCache = new Map();

export const pyIsReady = () => !!pyodide;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not download the Python engine (Pyodide). Check your internet connection and try again.'));
    document.head.appendChild(el);
  });
}

export function loadPython() {
  if (pyodide) return Promise.resolve(pyodide);
  if (!loading) {
    loading = (async () => {
      await loadScript(`${BASE}pyodide.js`);
      const py = await window.loadPyodide({ indexURL: BASE });
      py.runPython(PRELUDE);
      pyodide = py;
      listeners.forEach((f) => f());
      return py;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

// re-render when the Python engine has finished loading
export function usePyReady() {
  const [ready, setReady] = useState(pyIsReady());
  useEffect(() => {
    if (pyIsReady()) {
      setReady(true);
      return undefined;
    }
    const f = () => setReady(true);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return ready;
}

// shorten a Python traceback to the part that matters
const clean = (e) => {
  const lines = String(e?.message || e).trim().split('\n').filter(Boolean);
  return lines.slice(-3).join(' | ');
};

function nsFor(code) {
  let ns = nsCache.get(code);
  if (!ns) {
    ns = pyodide.globals.get('__load')(code);
    nsCache.set(code, ns);
  }
  return ns;
}

// Read the file once: checks it, returns its description / default inputs. Used when a file is uploaded.
export async function inspectPython(code) {
  try {
    const py = await loadPython();
    try {
      await py.loadPackagesFromImports(code); // numpy / pandas etc. are fetched only if the file imports them
    } catch {
      /* optional */
    }
    nsCache.delete(code);
    const ns = nsFor(code);
    const meta = JSON.parse(py.globals.get('__meta')(ns));
    return { ok: true, meta };
  } catch (e) {
    return { ok: false, error: clean(e) };
  }
}

export function pyEvaluate(code, candles, params) {
  if (!pyodide) throw new Error('Python engine is still loading');
  const cols = { time: [], open: [], high: [], low: [], close: [], volume: [] };
  for (const c of candles) {
    cols.time.push(c.time);
    cols.open.push(c.open);
    cols.high.push(c.high);
    cols.low.push(c.low);
    cols.close.push(c.close);
    cols.volume.push(c.volume || 0);
  }
  try {
    const out = pyodide.globals.get('__run')(nsFor(code), JSON.stringify(cols), JSON.stringify(params));
    return JSON.parse(out);
  } catch (e) {
    throw new Error(clean(e));
  }
}

const indCache = new Map();
export function pyIndicators(code, params) {
  if (!pyodide) return [];
  const key = code.length + '|' + JSON.stringify(params);
  if (indCache.has(key)) return indCache.get(key);
  try {
    const list = JSON.parse(pyodide.globals.get('__indicators')(nsFor(code), JSON.stringify(params)));
    indCache.set(key, list);
    return list;
  } catch {
    return [];
  }
}
