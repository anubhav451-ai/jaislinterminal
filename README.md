# Jaislin Terminal

TradingView-style charting app for all Nifty 50 + Bank Nifty stocks and both indices.
React + `lightweight-charts` (TradingView's own open-source chart library) on the front, Node on the back.

## Screens (bottom navigation)
- **Dashboard** – Nifty 50 and Bank Nifty index cards, all stocks (Nifty 50 / Bank Nifty / All), live price, change, advancers/decliners, search, gainers/losers sort. Tap any stock to open its chart.
- **Chart** – remembers every chart you opened (tabs on top, tap x to close), last timeframe, chart type, indicators and drawings. The + button opens the stock list.
- **Strategy** – built-in strategies. Open one, set its inputs (same fields as TradingView's Bollinger dialog), tap *Apply strategy to stocks*, tick the stocks and Save. Stocks where the setup forms are highlighted on the Dashboard (BUY badge, setups float to the top, "Setups" filter) and get a notification; their chart shows a BUY arrow on every candle that formed the setup, plus the strategy's Bollinger Bands.
- **Settings** – dark/light theme, up/down colours, volume, indicator manager, default drawing colour/width/style, delete all drawings, reset.

## Chart features
- Chart types: Candles, Hollow candles, Heikin Ashi, Bars, Line, Area; timeframes 1m, 5m, 15m, 1H, 1D, 1W (IST axis)
- Indicators (editable params, multiple copies): SMA, EMA, WMA, Bollinger, VWAP, Supertrend on price; RSI, MACD, Stochastic, ADX/DMI, ATR, CCI, Williams %R, OBV in own panes
- Drawing tools: trend line, ray, horizontal line, vertical line, rectangle, Fib retracement, text note.
  Tap a drawing to select it: drag it to move, drag the round handles to resize, and use the toolbar to change colour,
  width, style (solid/dashed/dotted), segment/ray/extended, edit text, duplicate or delete (Delete key works too).
  Undo last / remove all are in the left tool rail. Drawings are saved per stock in the browser.

## 1. Run it (works right now, no keys needed)
```bash
npm run install:all
cp .env.example .env        # then fill the 4 Angel One keys
npm run dev                 # open http://localhost:5173
```

## 2. Go real-time with Angel One SmartAPI (free)
1. Log in at https://smartapi.angelone.in -> **My Apps -> Create App** (Market Feeds + Historical Data). You get the **API Key**.
2. Enable **TOTP** for your Angel account and save the **TOTP secret** (the text shown beside the QR code).
3. Put these in `.env` (never share them in chat, never commit `.env`):
```
ANGEL_API_KEY=...
ANGEL_CLIENT_ID=...      # your Angel client code
ANGEL_PIN=...            # your 4-digit login PIN
ANGEL_TOTP_SECRET=...
```
4. Restart `npm run dev`. The server logs in by itself (TOTP), downloads Angel's instrument list once to map symbols
   to tokens, loads history over REST and streams live ticks over WebSocket. It re-logins on its own during the day.

**Data priority (never fake data):** 1) Angel One, 2) Yahoo Finance (15 min delayed), 3) nothing - the app shows an error, it never invents prices.
If Angel One cannot log in the server keeps answering with Yahoo data and retries Angel One every 30 seconds; when it connects, Angel One data is used automatically (no reload). A thin blue strip says which source is active (you can hide it). While Yahoo is the source, strategies only use candles that were already finished 15 minutes ago.
Without any server (Netlify, or `npm run dev` with the backend stopped) `/api/*` is answered by `netlify/functions/api.mjs` / the Vite dev middleware with Yahoo data only.

## 3. Deploy (single server)
```bash
npm run start      # builds the client and serves everything from the Node server on PORT (default 8080)
```
Any VPS / Railway / Render works. Keep `.env` on the server only.

## Notes
- Nifty 50 and Bank Nifty are rebalanced regularly. Edit `server/symbols.js` if a stock is added or removed
  (TMPV = Tata Motors passenger vehicles after the demerger; verify the tickers once).
- Angel history limits per request: 1m = 30 days, 5m = 100, 15m = 200, 1H = 400, 1D = 2000. Weekly candles are built from daily.
- Angel allows ~3 REST calls/second; the server already throttles itself and caches candles for 15 s.
- Real-time exchange data is for your own personal use. Showing live NSE data to other people publicly needs an exchange data licence.
- Indicator maths (RSI, EMA, MACD, ATR, ADX...) follows the standard Wilder / textbook formulas.

## Layout
```
server/   index.js (HTTP + WS)  symbols.js  providers/angel.js
client/   src/App.jsx  components/{Chart,Watchlist,IndicatorModal}.jsx  lib/{indicators,registry,feed,time}.js
```

## Strategy: Bollinger Lower Band Close (built in)
- BUY when a candle CLOSES below the lower Bollinger Band on the 1-day timeframe (timeframe is changeable).
- The WHOLE candle must be below the band (open, close, high and low). If the wick touches the band there is no setup.
- Only closed candles are used (daily candle counts after 15:30 IST). BUY only, no sell or short trades.
- Defaults: Length 20, Basis SMA, Source close, StdDev 1.5, Offset 0 (your TradingView settings). Editable in the app.
- Setups are scanned in the browser when you apply the strategy, then every 10 minutes while the app is open.
  Browser notifications / toasts appear for new setups. Phone notifications while the app is closed (Telegram / ntfy) need the Node server and are the next step.

More strategies can be added in `client/src/lib/strategy.js` (the `STRATEGIES` list).
`server/strategies.js`, `backtest.js`, `notify.js`, `ta.js` are groundwork for server-side scanning, backtesting and phone notifications.

---
## What's new in this version
- **Add your own strategy (any logic):** Strategy tab -> *Add new strategy*. Tap *Copy AI prompt*, paste it into any AI, add your logic at the end, paste the JavaScript it returns, name it, *Test code*, *Add strategy*. It then works like the built-in one (apply to stocks, BUY/SELL marks, chart indicators, notifications). The app runs JavaScript in the browser, so ask the AI for JavaScript.
- **Strategy rows have a 3-dot menu:** Rename, Edit code, Remove from all stocks, Delete (custom only).
- **Per stock removal:** on a chart, the strategy bar has *Remove* – it removes the strategy marks and its indicators from that stock only.
- **Dashboard -> Strategy setups:** every active BUY/SELL setup, newest first, with "5 min ago". Fresh setups glow.
- **Strategy tab:** strategies first; open one to see its stocks (setups on top, highlighted, with time).
- **Watchlist:** star any stock (Dashboard card or chart list). Dashboard tab *Watchlist* and chart list tab *Mine*.
- **Drawing tools:** moving a drawing is now saved only on release (cannot vanish while dragging); tap-tap or press-drag-release creation; new tools: extended line, horizontal ray, cross line; *Stay in drawing mode* pin.


## Deploy on Netlify (no server needed, Yahoo data)
- Repo root = this folder. `netlify.toml` already sets build command, publish folder `client/dist`, the function `netlify/functions/api.mjs` and `VITE_POLL=1`.
- Netlify cannot run the Angel One server, so the site shows Yahoo Finance data (15 min delayed). To get Angel One data as well, run the Node server somewhere (Render / VPS / your own device) and set `VITE_API_BASE=https://your-server` in Netlify. The site then uses Angel One first, and if that server is down or asleep it falls back to its own Yahoo function.

## Deploy on Render (Web Service)
- Repo root = this folder (the one with `render.yaml`). Do NOT upload `node_modules`.
- Build Command: `npm run build:render`   Start Command: `node server/index.js`   Health Check Path: `/healthz`
- Env vars: `NODE_VERSION=20` and the Angel One keys + `APP_PASSWORD` (set in the Render dashboard).
- Why `build:render`: Render sets NODE_ENV=production, which makes a plain `npm install` skip Vite (a devDependency), so the build fails with "vite: not found". The script installs it explicitly.

## Python strategies
Strategy tab -> **Add strategy** -> upload a `.py` file (see `examples/ema_crossover.py`). The file defines `DESCRIPTION`, `DEFAULTS` (must include `interval`), optional `RULES`, `SIDE`, `indicators(p)`, and `evaluate(candles, p)` returning `{"buy": [bool...], "sell": [bool...]}` (same length as candles). `ta` helpers: sma ema rma wma stdev highest lowest rsi atr bbands crossover crossunder. numpy/pandas can be imported (downloaded on demand). Python runs in the browser through Pyodide (needs internet the first time).

## Indicators (62)
Trend, Moving averages, Momentum, Volatility, Volume groups. Open the chart -> Indicators. Includes Ichimoku, Parabolic SAR, Keltner/Donchian, HMA/DEMA/TEMA/KAMA, MFI, Stochastic RSI, Squeeze Momentum, WaveTrend, Vortex, TSI, KST and more. Python strategies can also call the same maths through `ta`.

## Strategy panel on the chart
Every strategy applied to the open stock shows a small panel on the chart: wins / losses and accuracy, last 10 trades (dots), and Day / Week / Month trade counts with wins and losses.
- Tap the panel -> full report screen: accuracy ring, last 5 / 10 / 20 trades, Today / 7 days / 30 days / 90 days / all table, profit and loss, profit factor, win and loss streaks, return curve, date filter, "exit after N candles", and the list of every trade (newest first, BUY / SELL filter).
- Arrow folds the panel, X removes it. A "+ <strategy> data" chip appears on the chart to bring it back (also in the strategy's 3-dot menu and in its settings).
- Rules: every signal on a finished candle is a trade, entry at that candle's close, exit after N candles, one trade at a time, no charges. Yahoo history is shorter than Angel's (5m/15m: 60 days, 1m: 7 days), so intraday stats cover less time on Yahoo.

## Strategy screens
Strategy tab -> list of strategies. Tap one -> only its stocks (setups on top). Gear icon (top right) -> settings page: name, inputs, indicator settings, source code, remove/delete. "Add strategy" and "Rename" open a full-screen page.

## Public link (Termux)
1. `.env` must contain `APP_PASSWORD=...` (anything strong), then `npm run build --prefix client`.
2. `bash start-public.sh` starts the server and a free Cloudflare quick tunnel and prints `https://....trycloudflare.com`.
3. The link changes every time. Keep the window open. The Node server (and your Angel One login) stay on your own device.

## Deploy on Cloudflare

The repository root must contain `client/`, `server/`, `worker/`, `functions/`, `wrangler.jsonc` and `package.json`.

**Workers Builds (the default "Create application" flow, deploy command `npx wrangler deploy`):**
- Root directory: empty
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- The `name` in `wrangler.jsonc` must be the same as the Worker name in the Cloudflare dashboard (change that one line if yours differs).
- `/api/*` is answered by `worker/index.js` (Yahoo Finance, 15 min delayed).

**Cloudflare Pages (Git import):**
- Build command: `npm run build`, Build output directory: `client/dist`, Root directory: empty
- `/api/*` is answered by `functions/api/[[path]].js`.

No environment variable is needed. The app detects `*.workers.dev`, `*.pages.dev` and `*.netlify.app` and polls prices there (no WebSocket).

## Accounts (Google sign-in) and cloud save

- Every user signs in / registers with **Continue with Google** (Firebase Authentication). Data is saved per account in Firestore (`users/{uid}/kv/...`).
- One-time Firebase setup:
  1. Authentication, Sign-in method: **Google** switched on.
  2. Authentication, Settings, **Authorized domains**: add your site address (the `*.netlify.app` / `*.pages.dev` / custom domain).
  3. Firestore Database, **Rules**: paste the content of `firestore.rules` and Publish.
