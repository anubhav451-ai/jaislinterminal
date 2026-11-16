import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as TA from './ta.js';
import { INTERVALS } from './utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(here, 'data');
const DIR = path.join(DATA, 'strategies');
const META = path.join(DATA, 'strategies.json');
const ta = { ...TA };
fs.mkdirSync(DIR, { recursive: true });

// The whole bar loop runs INSIDE the vm so one timeout covers the user's code.
const RUNNER = `(function (candles, ta, p, from) {
  var s = module.exports;
  var ind = typeof s.prepare === 'function' ? s.prepare(candles, ta, p) : {};
  var n = candles.length;
  var out = new Array(n).fill(null);
  for (var i = Math.max(0, from); i < n; i++) {
    var r = s.signal(i, candles, ind, p, ta);
    if (r === 'buy' || r === 'sell' || r === 'exit') out[i] = r;
  }
  return out;
})`;

export function compile(code) {
  const sandbox = {
    module: { exports: {} },
    console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Number, String, Array, Object, parseFloat, parseInt, isFinite, isNaN,
  };
  sandbox.exports = sandbox.module.exports;
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  try {
    new vm.Script(code, { filename: 'strategy.js' }).runInContext(ctx, { timeout: 1000 });
  } catch (e) {
    throw new Error(`Strategy file error: ${e.message}`);
  }
  const def = ctx.module.exports;
  if (!def || typeof def !== 'object' || typeof def.signal !== 'function') {
    throw new Error('File must do: module.exports = { name, interval, params, signal(i, candles, ind, p, ta) { ... } }');
  }
  if (def.prepare && typeof def.prepare !== 'function') throw new Error('prepare must be a function');
  ctx.__runner = new vm.Script(RUNNER).runInContext(ctx, { timeout: 1000 });
  const call = new vm.Script('__runner(__a.candles, __a.ta, __a.params, __a.from)');
  return {
    def,
    run(candles, params, from = 0) {
      ctx.__a = { candles, ta, params, from };
      try {
        return Array.from(call.runInContext(ctx, { timeout: 15000 }));
      } catch (e) {
        if (/timed out/i.test(e.message)) throw new Error('Strategy took too long (infinite loop?)');
        throw new Error(`Strategy error: ${e.message}`);
      }
    },
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function defaultsOf(def) {
  const params = {};
  for (const [k, v] of Object.entries(def.params || {})) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
  return {
    interval: INTERVALS.includes(def.interval) ? def.interval : '15m',
    params,
    slPct: Math.max(0, +def.slPct || 0),
    tpPct: Math.max(0, +def.tpPct || 0),
    longOnly: !!def.longOnly,
    validBars: clamp(parseInt(def.validBars, 10) || 2, 1, 20),
  };
}

function synthetic(n = 300) {
  let p = 100;
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    p = p * (1 + Math.sin(i / 9) * 0.01 + (((i * 7919) % 13) - 6) / 1000);
    return { time: 1700000000 + i * 900, open: o, high: Math.max(o, p) * 1.003, low: Math.min(o, p) * 0.997, close: p, volume: 1000 + i * 3 };
  });
}

const readMeta = () => {
  try {
    return JSON.parse(fs.readFileSync(META, 'utf8'));
  } catch {
    return {};
  }
};
const writeMeta = (m) => fs.writeFileSync(META, JSON.stringify(m, null, 2));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'strategy';
const fileOf = (id) => path.join(DIR, `${id}.js`);
const cache = new Map();

export function getStrategy(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error('Bad strategy id');
  const meta = readMeta()[id];
  if (!meta) throw new Error('Strategy not found');
  const file = fileOf(id);
  const mtime = fs.statSync(file).mtimeMs;
  let c = cache.get(id);
  if (!c || c.mtime !== mtime) {
    c = { mtime, compiled: compile(fs.readFileSync(file, 'utf8')) };
    cache.set(id, c);
  }
  const d = defaultsOf(c.compiled.def);
  const s = meta.settings || {};
  const settings = { ...d, ...s, params: { ...d.params, ...(s.params || {}) } };
  return { meta, compiled: c.compiled, settings, defaults: d };
}

export function describe(id) {
  try {
    const { meta, settings, defaults } = getStrategy(id);
    return { id, name: meta.name, enabled: !!meta.enabled, notify: meta.notify !== false, settings, defaults, createdAt: meta.createdAt };
  } catch (e) {
    const m = readMeta()[id] || {};
    return { id, name: m.name || id, enabled: false, notify: false, error: e.message };
  }
}

export const listStrategies = () => Object.keys(readMeta()).map(describe);
export const listEnabled = () => listStrategies().filter((s) => s.enabled && !s.error);
export const exampleCode = () => fs.readFileSync(path.join(here, 'examples', 'ema-rsi-strategy.js'), 'utf8');
export function readCode(id) {
  getStrategy(id);
  return fs.readFileSync(fileOf(id), 'utf8');
}

export function saveStrategy(code, filename = '', id = null) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('Strategy code is empty');
  if (code.length > 200000) throw new Error('Strategy file too large (max 200 KB)');
  const compiled = compile(code);
  const d = defaultsOf(compiled.def);
  compiled.run(synthetic(), d.params, 0); // dry run: catches runtime errors now, not at 9:30 am
  const meta = readMeta();
  if (id && !meta[id]) throw new Error('Strategy not found');
  const name = String(compiled.def.name || filename.replace(/\.js$/i, '') || 'Strategy').slice(0, 60);
  const sid = id || `${slug(name)}-${Date.now().toString(36).slice(-4)}`;
  fs.writeFileSync(fileOf(sid), code);
  meta[sid] = id ? { ...meta[id], name } : { id: sid, name, createdAt: Date.now(), enabled: false, notify: true, settings: {} };
  writeMeta(meta);
  cache.delete(sid);
  return describe(sid);
}

export function updateStrategy(id, patch = {}) {
  getStrategy(id);
  const meta = readMeta();
  const m = meta[id];
  if (typeof patch.enabled === 'boolean') m.enabled = patch.enabled;
  if (typeof patch.notify === 'boolean') m.notify = patch.notify;
  const s = patch.settings || {};
  m.settings = m.settings || {};
  if (INTERVALS.includes(s.interval)) m.settings.interval = s.interval;
  if (Number.isFinite(+s.slPct) && s.slPct !== '') m.settings.slPct = Math.max(0, +s.slPct);
  if (Number.isFinite(+s.tpPct) && s.tpPct !== '') m.settings.tpPct = Math.max(0, +s.tpPct);
  if (typeof s.longOnly === 'boolean') m.settings.longOnly = s.longOnly;
  if (Number.isFinite(+s.validBars)) m.settings.validBars = clamp(Math.round(+s.validBars), 1, 20);
  if (s.params && typeof s.params === 'object') {
    m.settings.params = { ...(m.settings.params || {}) };
    for (const [k, v] of Object.entries(s.params)) if (Number.isFinite(+v) && v !== '') m.settings.params[k] = +v;
  }
  writeMeta(meta);
  return describe(id);
}

export function removeStrategy(id) {
  getStrategy(id);
  const meta = readMeta();
  delete meta[id];
  writeMeta(meta);
  fs.rmSync(fileOf(id), { force: true });
  cache.delete(id);
}
