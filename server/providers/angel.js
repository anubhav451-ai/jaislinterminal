import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYMBOLS, BY_SYMBOL } from '../symbols.js';
import { IST, STEP, aggregateWeekly, cleanCandles, isMarketHours, sleep } from '../utils.js';

let WebSocketV2 = null;
let authenticator = null;
// loaded when Angel One starts (kept lazy so a missing package gives a clear message instead of a crash)
async function loadDeps() {
  if (authenticator) return;
  try {
    const otp = await import('otplib');
    const sm = await import('smartapi-javascript');
    authenticator = (otp.default || otp).authenticator;
    WebSocketV2 = (sm.default || sm).WebSocketV2;
  } catch (e) {
    throw new Error(`Angel packages missing (${e.message}). Run: npm install --prefix server`);
  }
}
const BASE = 'https://apiconnect.angelone.in';
const SCRIP_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.cache');
const TOKEN_CACHE = path.join(CACHE_DIR, 'angel-tokens.json');

// Angel historical API: interval name + max days allowed per request.
const AMAP = {
  '1m': { iv: 'ONE_MINUTE', days: 30 },
  '5m': { iv: 'FIVE_MINUTE', days: 100 },
  '15m': { iv: 'FIFTEEN_MINUTE', days: 200 },
  '1h': { iv: 'ONE_HOUR', days: 400 },
  '1d': { iv: 'ONE_DAY', days: 2000 },
  '1w': { iv: 'ONE_DAY', days: 2000 }, // built from daily candles
};

const fmtIST = (ms) => new Date(ms + IST * 1000).toISOString().slice(0, 16).replace('T', ' ');

export class AngelProvider extends EventEmitter {
  constructor(env) {
    super();
    this.name = 'angel';
    this.label = 'Angel One SmartAPI (live)';
    this.delayed = false;
    this.apiKey = env.ANGEL_API_KEY;
    this.clientId = env.ANGEL_CLIENT_ID;
    this.pin = env.ANGEL_PIN;
    this.totpSecret = (env.ANGEL_TOTP_SECRET || '').replace(/\s/g, '');
    if (!this.apiKey || !this.clientId || !this.pin || !this.totpSecret) {
      throw new Error('Angel One keys missing in .env (ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_PIN, ANGEL_TOTP_SECRET)');
    }
    this.q = {};
    this.tokenToSym = {};
    this.symToToken = {};
    this.lastGap = 0;
    this.lastTickAt = Date.now();
    this.loginAt = 0;
  }

  // ---------- REST helpers ----------
  headers(auth) {
    const h = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': '127.0.0.1',
      'X-MACAddress': '00:00:00:00:00:00',
      'X-PrivateKey': this.apiKey,
    };
    if (auth) h.Authorization = `Bearer ${this.jwt}`;
    return h;
  }

  async login() {
    const totp = authenticator.generate(this.totpSecret);
    const res = await fetch(`${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
      method: 'POST',
      headers: this.headers(false),
      body: JSON.stringify({ clientcode: this.clientId, password: this.pin, totp }),
    });
    const json = await res.json();
    if (!json.status) throw new Error(`Angel login failed: ${json.message || json.errorcode}`);
    this.jwt = json.data.jwtToken;
    this.feedToken = json.data.feedToken;
    this.loginAt = Date.now();
    console.log('[angel] login ok');
  }

  // Angel allows ~3 requests/sec, keep a gap between calls.
  async throttle() {
    const wait = this.lastGap + 400 - Date.now();
    this.lastGap = Math.max(Date.now(), this.lastGap + 400);
    if (wait > 0) await sleep(wait);
  }

  async api(pathname, body, retry = true) {
    await this.throttle();
    const res = await fetch(`${BASE}${pathname}`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Angel HTTP ${res.status}`);
    }
    if (!json.status) {
      const msg = `${json.message || ''} ${json.errorcode || ''}`;
      if (retry && /token|session|AG800|AB10/i.test(msg)) {
        await this.login();
        return this.api(pathname, body, false);
      }
      throw new Error(`Angel API error: ${msg.trim()}`);
    }
    return json.data;
  }

  // ---------- symbol tokens ----------
  async loadTokens() {
    try {
      const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
      if (Date.now() - c.at < 7 * 86400000 && SYMBOLS.every((s) => c.map[s.symbol])) {
        this.setTokens(c.map);
        return;
      }
    } catch {}
    console.log('[angel] downloading instrument master (one time, ~weekly)...');
    const res = await fetch(SCRIP_URL, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Scrip master HTTP ${res.status}`);
    const list = await res.json();
    const want = new Map(SYMBOLS.filter((s) => !s.index).map((s) => [s.angel.symbol, s.symbol]));
    const map = Object.fromEntries(SYMBOLS.filter((s) => s.index).map((s) => [s.symbol, s.angel.token]));
    for (const it of list) {
      if (it.exch_seg === 'NSE' && want.has(it.symbol)) map[want.get(it.symbol)] = it.token;
    }
    const missing = SYMBOLS.filter((s) => !map[s.symbol]).map((s) => s.symbol);
    if (missing.length) console.warn('[angel] tokens not found (check symbols.js):', missing.join(', '));
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify({ at: Date.now(), map }));
    this.setTokens(map);
  }

  setTokens(map) {
    this.symToToken = map;
    this.tokenToSym = Object.fromEntries(Object.entries(map).map(([s, t]) => [String(t), s]));
  }

  // ---------- init ----------
  async init() {
    await loadDeps();
    await this.login();
    await this.loadTokens();
    await this.snapshot().catch((e) => console.warn('[angel] snapshot failed:', e.message));
    await this.connectWs();
    setInterval(() => this.watchdog(), 30000);
  }

  async snapshot() {
    const tokens = Object.values(this.symToToken);
    for (let i = 0; i < tokens.length; i += 50) {
      const data = await this.api('/rest/secure/angelbroking/market/v1/quote/', {
        mode: 'FULL',
        exchangeTokens: { NSE: tokens.slice(i, i + 50) },
      });
      for (const f of data.fetched || []) {
        const sym = this.tokenToSym[String(f.symbolToken)];
        if (!sym) continue;
        this.q[sym] = {
          p: f.ltp,
          pc: f.close,
          o: f.open,
          h: f.high,
          l: f.low,
          v: BY_SYMBOL[sym]?.index ? undefined : f.tradeVolume,
          t: Math.floor(Date.now() / 1000),
        };
      }
    }
    console.log(`[angel] snapshot for ${Object.keys(this.q).length} symbols`);
  }

  // ---------- live feed ----------
  async connectWs() {
    try {
      this.ws?.close?.();
    } catch {}
    this.ws = new WebSocketV2({
      jwttoken: this.jwt,
      apikey: this.apiKey,
      clientcode: this.clientId,
      feedtype: this.feedToken,
    });
    await this.ws.connect();
    this.ws.on('tick', (t) => this.onTick(t));
    this.ws.fetchData({
      correlationID: 'nifty50',
      action: 1, // subscribe
      mode: 2, // QUOTE: ltp + volume + ohlc
      exchangeType: 1, // NSE cash
      tokens: Object.values(this.symToToken),
    });
    this.lastTickAt = Date.now();
    console.log('[angel] websocket connected');
  }

  onTick(t) {
    if (!t || typeof t !== 'object') return;
    const token = String(t.token ?? '').replace(/"/g, '');
    const sym = this.tokenToSym[token];
    if (!sym || !t.last_traded_price) return;
    this.lastTickAt = Date.now();
    const prev = this.q[sym] || {};
    const q = {
      p: t.last_traded_price / 100,
      pc: t.closed_price ? t.closed_price / 100 : prev.pc,
      o: t.open_price_of_the_day ? t.open_price_of_the_day / 100 : prev.o,
      h: t.high_price_of_the_day ? t.high_price_of_the_day / 100 : prev.h,
      l: t.low_price_of_the_day ? t.low_price_of_the_day / 100 : prev.l,
      v: BY_SYMBOL[sym]?.index ? undefined : Number(t.volume_trade_for_the_day) || prev.v,
      t: Math.floor(Date.now() / 1000),
    };
    this.q[sym] = q;
    this.emit('tick', { s: sym, ...q });
  }

  async watchdog() {
    try {
      // fresh login every ~10h so the session never expires mid-day
      if (Date.now() - this.loginAt > 10 * 3600 * 1000) {
        await this.login();
        await this.connectWs();
        return;
      }
      // feed silent for 90s during market hours -> reconnect
      if (isMarketHours() && Date.now() - this.lastTickAt > 90000) {
        console.warn('[angel] feed silent, reconnecting...');
        await this.login();
        await this.connectWs();
      }
    } catch (e) {
      console.warn('[angel] watchdog error:', e.message);
    }
  }

  async quotes() {
    return this.q;
  }

  // ---------- history ----------
  async candles(symbol, interval) {
    const token = this.symToToken[symbol];
    if (!token) throw new Error('Unknown symbol');
    const cfg = AMAP[interval];
    const now = Date.now();
    const data = await this.api('/rest/secure/angelbroking/historical/v1/getCandleData', {
      exchange: 'NSE',
      symboltoken: token,
      interval: cfg.iv,
      fromdate: fmtIST(now - cfg.days * 86400000),
      todate: fmtIST(now),
    });
    let list = (data || []).map(([ts, o, h, l, c, v]) => {
      let time = Math.floor(Date.parse(ts) / 1000) + IST;
      if (interval === '1d' || interval === '1w') time = Math.floor(time / 86400) * 86400;
      return { time, open: +o, high: +h, low: +l, close: +c, volume: +v || 0 };
    });
    list = cleanCandles(list);
    return interval === '1w' ? aggregateWeekly(list) : list;
  }
}
