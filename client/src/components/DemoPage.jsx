import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { allStrategies, strategyById } from '../lib/strategy.js';
import { getCandles } from '../lib/useScanner.js';
import { cfgLabel, dateStr } from '../lib/backtest.js';
import { nowIST } from '../lib/delay.js';
import { closePosition, daysAgo, equityOf, investedOf, money, newAccount, openPosition, PERIODS, runPortfolioBacktest, unrealized } from '../lib/paper.js';

const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
const pctText = (n) => (n == null || !Number.isFinite(n) ? '–' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const dshort = (t) => dateStr(t).slice(2).split('-').reverse().join('/');

function Stat({ label, value, sub, cls = '' }) {
  return (
    <div className="dm-stat">
      <span>{label}</span>
      <b className={cls}>{value}</b>
      {sub && <small className={cls}>{sub}</small>}
    </div>
  );
}

// equity curve (account value after every finished trade)
function Curve({ curve, capital }) {
  if (!curve || curve.length < 2) return <p className="muted small">Not enough trades to draw the curve.</p>;
  const W = 640;
  const H = 170;
  const P = 6;
  const t0 = curve[0].t;
  const t1 = curve[curve.length - 1].t || t0 + 1;
  const vs = curve.map((c) => c.v).concat(capital);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const X = (t) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 2 * P);
  const pts = curve.map((c) => `${X(c.t).toFixed(1)},${Y(c.v).toFixed(1)}`).join(' ');
  const up = curve[curve.length - 1].v >= capital;
  return (
    <svg className="dm-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Account value over time">
      <line x1={P} x2={W - P} y1={Y(capital)} y2={Y(capital)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1" opacity="0.6" />
      <polygon points={`${X(t0)},${H - P} ${pts} ${X(t1)},${H - P}`} fill={up ? 'rgba(22,163,74,0.14)' : 'rgba(220,38,38,0.12)'} />
      <polyline points={pts} fill="none" stroke={up ? '#16a34a' : '#dc2626'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BacktestTab({ symbols, appliedList, paramsOf, cfgOf, preset }) {
  const strategies = useMemo(() => allStrategies().filter((s) => !s.error), []);
  const [stratId, setStratId] = useState(preset?.strategyId && strategyById(preset.strategyId) ? preset.strategyId : appliedList[0]?.strategyId || strategies[0]?.id);
  const [scope, setScope] = useState('one');
  const [sym, setSym] = useState(preset?.symbol || symbols[0]?.symbol || '');
  const [capital, setCapital] = useState('100000');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [mode, setMode] = useState('pct');
  const [val, setVal] = useState('100');
  const [charges, setCharges] = useState('0');
  const [busy, setBusy] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const cancel = useRef(false);
  useEffect(() => () => (cancel.current = true), []);

  const def = strategyById(stratId);
  const applied = appliedList.find((a) => a.strategyId === stratId);
  const list = scope === 'one' ? [sym] : scope === 'strategy' ? applied?.symbols || [] : symbols.map((s) => s.symbol);
  const nameOf = (s) => symbols.find((x) => x.symbol === s)?.name || '';

  const quick = (d) => {
    setFrom(daysAgo(d));
    setTo(daysAgo(0));
  };
  const run = async () => {
    setErr('');
    setRes(null);
    if (!def) return setErr('Choose a strategy.');
    if (!list.length) return setErr(scope === 'strategy' ? 'This strategy has no stocks yet. Add stocks to it first, or choose another stock list.' : 'Choose a stock.');
    const cap = num(capital, 0);
    if (!(cap > 0)) return setErr('Enter the starting capital.');
    if (from && to && from > to) return setErr('The From date is after the To date.');
    cancel.current = false;
    setBusy({ done: 0, total: list.length });
    try {
      const r = await runPortfolioBacktest({
        def,
        params: paramsOf(stratId),
        cfg: cfgOf(stratId),
        symbols: list,
        from,
        to,
        getCandles,
        sizing: { mode, value: num(val, mode === 'pct' ? 100 : cap) },
        capital: cap,
        charges: num(charges, 0),
        onProgress: (done, total) => setBusy({ done, total }),
        isCancelled: () => cancel.current,
      });
      if (!cancel.current) {
        setRes(r);
        if (r.failed === list.length) setErr('Could not load price data for the chosen stocks. Check the connection and try again.');
      }
    } catch (e) {
      setErr(e?.message || 'Back-test failed.');
    }
    setBusy(null);
  };

  const cfg = def ? cfgOf(stratId) : null;
  return (
    <div className="dm-grid">
      <section className="card dm-form">
        <h2>Back-test with money</h2>
        <p className="muted small">See what a starting amount would have become if every signal of the strategy had been traded in the chosen period.</p>
        <div className="dm-fields">
          <label className="cd-f dm-wide">
            <span>Strategy</span>
            <select value={stratId || ''} onChange={(e) => setStratId(e.target.value)}>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="cd-f">
            <span>Stocks</span>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setVal(e.target.value === 'one' ? '100' : '10');
              }}
            >
              <option value="one">One stock</option>
              <option value="strategy">Stocks added to this strategy ({applied?.symbols.length || 0})</option>
              <option value="all">All {symbols.length} stocks</option>
            </select>
          </label>
          {scope === 'one' && (
            <label className="cd-f">
              <span>Stock</span>
              <select value={sym} onChange={(e) => setSym(e.target.value)}>
                {symbols.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} · {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="cd-f">
            <span>Starting capital (₹)</span>
            <input type="number" inputMode="decimal" min="1" value={capital} onChange={(e) => setCapital(e.target.value)} />
          </label>
        </div>

        <div className="dm-chips" role="group" aria-label="Period">
          {PERIODS.map(([l, d]) => (
            <button key={l} className={from === daysAgo(d) && to === daysAgo(0) ? 'sel' : ''} onClick={() => quick(d)}>
              {l} ago
            </button>
          ))}
        </div>
        <div className="dm-fields">
          <label className="cd-f">
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="cd-f">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div className="dm-fields">
          <label className="cd-f">
            <span>Money per trade</span>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setVal(e.target.value === 'pct' ? (scope === 'one' ? '100' : '10') : String(Math.round(num(capital, 100000) / 10)));
              }}
            >
              <option value="pct">% of the account</option>
              <option value="fixed">Fixed ₹ amount</option>
            </select>
          </label>
          <label className="cd-f">
            <span>{mode === 'pct' ? 'Percent (%)' : 'Amount (₹)'}</span>
            <input type="number" inputMode="decimal" min="1" value={val} onChange={(e) => setVal(e.target.value)} />
          </label>
          <label className="cd-f">
            <span>Charges per side (%)</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={charges} onChange={(e) => setCharges(e.target.value)} />
          </label>
        </div>

        {cfg && def && (
          <p className="muted small">
            Exits: <b>{cfgLabel(cfg, !!def.levels)}</b>, or the opposite signal. Change them in the strategy's settings.
          </p>
        )}
        {err && (
          <p className="auth-err" role="alert">
            {err}
          </p>
        )}
        <button className="btn primary wide dm-run" onClick={run} disabled={!!busy}>
          {busy ? `Running… ${busy.done}/${busy.total}` : 'Run back-test'}
        </button>
      </section>

      <div className="dm-out">
        {res && (
          <>
            <section className="card">
              <h2>Result</h2>
              <div className="dm-hero">
                <span className="muted small">
                  {money(res.capital)} became
                </span>
                <b className={tone(res.pnl)}>{money(res.finalValue)}</b>
                <span className={`dm-pl ${tone(res.pnl)}`}>
                  {res.pnl >= 0 ? '+' : ''}
                  {money(res.pnl)} ({pctText(res.retPct)})
                </span>
              </div>
              <div className="dm-stats">
                <Stat label="Trades" value={res.n} sub={res.openCount ? `${res.openCount} still open (counted at the latest price)` : ''} />
                <Stat label="Win rate" value={res.winRate == null ? '–' : `${res.winRate.toFixed(0)}%`} sub={`${res.wins} won · ${res.n - res.wins} lost`} />
                <Stat label="Max drop" value={`-${res.maxDD.toFixed(1)}%`} sub="biggest fall from a peak" cls={res.maxDD > 0 ? 'neg' : ''} />
                <Stat label="Best trade" value={money(res.best)} cls="pos" />
                <Stat label="Worst trade" value={money(res.worst)} cls={res.worst < 0 ? 'neg' : ''} />
              </div>
              <Curve curve={res.curve} capital={res.capital} />
              <p className="muted small">
                Data used: {res.dataFrom ? `${dshort(res.dataFrom)} to ${dshort(res.dataTo)}` : 'none'}
                {res.dataFrom && from && dateStr(res.dataFrom) > from ? `. Price history starts after your From date, so the first part of the period had no data.` : '.'} {res.failed ? `${res.failed} stock(s) could not be loaded. ` : ''}
                {res.skipped ? `${res.skipped} signal(s) skipped (not enough cash for one share). ` : ''}Entry at the signal candle's close, one position per stock, no slippage.
              </p>
            </section>

            {scope !== 'one' && res.bySymbol.length > 0 && (
              <section className="card">
                <h2>By stock</h2>
                <div className="dm-table dm-sym">
                  {res.bySymbol.map((b) => (
                    <div key={b.symbol} className="dm-tr">
                      <b>{b.symbol}</b>
                      <span className="muted">{nameOf(b.symbol)}</span>
                      <span>
                        {b.w}/{b.n} won
                      </span>
                      <b className={tone(b.pnl)}>{money(b.pnl)}</b>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="card">
              <h2>Trades ({res.trades.length})</h2>
              {res.trades.length === 0 && <p className="muted small">No finished trades in this period. Try a longer period.</p>}
              <div className="dm-table dm-trades">
                {[...res.trades].reverse().slice(0, 300).map((t, i) => (
                  <div key={i} className={`dm-tr ${t.pnl > 0 ? 'w' : 'l'}`}>
                    <span className={`badge ${t.side === 'buy' ? 'buy' : 'sell'}`}>{t.side === 'buy' ? 'BUY' : 'SELL'}</span>
                    <b>{t.symbol}</b>
                    <span className="muted">
                      {dshort(t.time)} → {t.open ? 'open' : dshort(t.exitTime)}
                    </span>
                    <span className="muted">
                      {t.qty} × {t.entry.toFixed(2)} → {t.exit.toFixed(2)}
                    </span>
                    <b className={tone(t.pnl)}>
                      {money(t.pnl)} <small>({pctText(t.retPct)})</small>
                    </b>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function DemoTab({ symbols, appliedList, paper, setPaper, feed, onTakeSignals }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);
  const priceOf = (s) => feed.quotes[s]?.p ?? null;
  const equity = equityOf(paper, priceOf);
  const invested = investedOf(paper);
  const openPl = paper.positions.reduce((a, p) => a + unrealized(p, priceOf(p.symbol)), 0);
  const realized = paper.closed.reduce((a, c) => a + c.pnl, 0);
  const total = equity - paper.capital;

  // manual order
  const [sym, setSym] = useState(symbols[0]?.symbol || '');
  const [side, setSide] = useState('buy');
  const [amount, setAmount] = useState(String(Math.round(paper.capital / 10)));
  const [sl, setSl] = useState('0.5');
  const [tp, setTp] = useState('1');
  const [msg, setMsg] = useState('');
  const [newCap, setNewCap] = useState(String(paper.capital));
  const nameOf = (s) => symbols.find((x) => x.symbol === s)?.name || '';

  const place = () => {
    const px = priceOf(sym);
    const dir = side === 'buy' ? 1 : -1;
    const slV = num(sl, 0);
    const tpV = num(tp, 0);
    const r = openPosition(paper, { symbol: sym, side, price: px, amount: num(amount, 0), stop: slV > 0 && px ? px * (1 - (dir * slV) / 100) : null, target: tpV > 0 && px ? px * (1 + (dir * tpV) / 100) : null });
    if (r.error) return setMsg(r.error);
    setPaper(r.acc);
    setMsg(`Demo ${side === 'buy' ? 'BUY' : 'SELL'} placed: ${sym} at ${px.toFixed(2)}.`);
  };
  const setAuto = (id, patch) =>
    setPaper((acc) => {
      const cur = acc.auto[id] || { on: false, pct: 10, since: 0 };
      const next = { ...cur, ...patch };
      if (patch.on && !cur.on) next.since = nowIST(); // only setups that form from now on
      return { ...acc, auto: { ...acc.auto, [id]: next } };
    });

  return (
    <div className="dm-grid">
      <div className="dm-col">
        <section className="card">
          <h2>Demo account</h2>
          <div className="dm-hero">
            <span className="muted small">Account value</span>
            <b className={tone(total)}>{money(equity)}</b>
            <span className={`dm-pl ${tone(total)}`}>
              {total >= 0 ? '+' : ''}
              {money(total)} ({pctText((total / paper.capital) * 100)}) since the start of {money(paper.capital)}
            </span>
          </div>
          <div className="dm-stats">
            <Stat label="Cash" value={money(paper.cash)} />
            <Stat label="In trades" value={money(invested)} />
            <Stat label="Open profit/loss" value={money(openPl)} cls={tone(openPl)} />
            <Stat label="Booked profit/loss" value={money(realized)} cls={tone(realized)} />
          </div>
          <p className="muted small">Demo money only. Real prices (15 min delayed on Yahoo), no real orders are placed.</p>
        </section>

        <section className="card">
          <h2>Auto demo-trading</h2>
          <p className="muted small">Switch a strategy on and its new BUY / SELL setups are traded automatically in the demo account with the strategy's stop-loss and target. Keep the app open so prices are watched.</p>
          {appliedList.length === 0 && <p className="muted small">No strategy is added to any stock yet. Add one from the chart ("+ Strategy").</p>}
          {appliedList.map((a) => {
            const d = strategyById(a.strategyId);
            const au = paper.auto[a.strategyId] || { on: false, pct: 10 };
            return (
              <div key={a.strategyId} className={`dm-auto ${au.on ? 'on' : ''}`}>
                <label className="cd-on">
                  <input type="checkbox" checked={!!au.on} onChange={(e) => setAuto(a.strategyId, { on: e.target.checked })} />
                  <b>{d?.name || 'Strategy'}</b>
                  <small className="muted"> · {a.symbols.length} stocks</small>
                </label>
                <label className="dm-pct">
                  <span>% of account per trade</span>
                  <input type="number" inputMode="decimal" min="1" max="100" value={au.pct ?? 10} onChange={(e) => setAuto(a.strategyId, { pct: num(e.target.value, 10) })} />
                </label>
              </div>
            );
          })}
          {Object.values(paper.auto).some((x) => x.on) && (
            <button className="btn wide" onClick={onTakeSignals}>
              Also take the setups that are active right now
            </button>
          )}
        </section>

        <section className="card">
          <h2>Place a demo order</h2>
          <div className="dm-fields">
            <label className="cd-f dm-wide">
              <span>Stock</span>
              <select value={sym} onChange={(e) => setSym(e.target.value)}>
                {symbols.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="dm-side dm-wide" role="group" aria-label="Buy or sell">
              <button className={side === 'buy' ? 'on buy' : ''} onClick={() => setSide('buy')}>
                BUY
              </button>
              <button className={side === 'sell' ? 'on sell' : ''} onClick={() => setSide('sell')}>
                SELL
              </button>
            </div>
            <label className="cd-f">
              <span>Amount (₹)</span>
              <input type="number" inputMode="decimal" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="cd-f">
              <span>Stop-loss % (0 = none)</span>
              <input type="number" inputMode="decimal" min="0" step="0.1" value={sl} onChange={(e) => setSl(e.target.value)} />
            </label>
            <label className="cd-f">
              <span>Target % (0 = none)</span>
              <input type="number" inputMode="decimal" min="0" step="0.1" value={tp} onChange={(e) => setTp(e.target.value)} />
            </label>
          </div>
          <p className="muted small">
            Price now: <b>{priceOf(sym) ? priceOf(sym).toFixed(2) : 'waiting for price…'}</b>
          </p>
          {msg && <p className="muted small">{msg}</p>}
          <button className={`btn wide dm-place ${side}`} onClick={place}>
            Place demo {side === 'buy' ? 'BUY' : 'SELL'}
          </button>
        </section>
      </div>

      <div className="dm-col">
        <section className="card">
          <h2>Open positions ({paper.positions.length})</h2>
          {paper.positions.length === 0 && <p className="muted small">No open demo positions.</p>}
          {paper.positions.map((p) => {
            const px = priceOf(p.symbol);
            const pl = unrealized(p, px);
            return (
              <div key={p.id} className="dm-pos">
                <div className="dm-pos-top">
                  <span className={`badge ${p.side === 'buy' ? 'buy' : 'sell'}`}>{p.side === 'buy' ? 'BUY' : 'SELL'}</span>
                  <b>{p.symbol}</b>
                  <small className="muted">{nameOf(p.symbol)}</small>
                  <b className={`dm-pos-pl ${tone(pl)}`}>
                    {money(pl)} <small>({pctText((pl / (p.qty * p.entry)) * 100)})</small>
                  </b>
                </div>
                <div className="dm-pos-sub">
                  <span>
                    {p.qty} × {p.entry.toFixed(2)} → now {px ? px.toFixed(2) : '…'}
                  </span>
                  <span>
                    SL {p.stop != null ? p.stop.toFixed(2) : '–'} · TP {p.target != null ? p.target.toFixed(2) : '–'}
                  </span>
                  <span className="muted">{p.source === 'auto' ? `auto · ${strategyById(p.strategyId)?.name || ''}` : 'manual'}</span>
                  <button className="btn" onClick={() => px && setPaper(closePosition(paper, p.id, px, 'closed by you'))} disabled={!px}>
                    Close now
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        <section className="card">
          <h2>Closed trades ({paper.closed.length})</h2>
          {paper.closed.length === 0 && <p className="muted small">Nothing closed yet.</p>}
          <div className="dm-table dm-trades">
            {paper.closed.slice(0, 100).map((c) => (
              <div key={c.id} className={`dm-tr ${c.pnl > 0 ? 'w' : 'l'}`}>
                <span className={`badge ${c.side === 'buy' ? 'buy' : 'sell'}`}>{c.side === 'buy' ? 'BUY' : 'SELL'}</span>
                <b>{c.symbol}</b>
                <span className="muted">{c.reason}</span>
                <span className="muted">
                  {c.qty} × {c.entry.toFixed(2)} → {c.exit.toFixed(2)}
                </span>
                <b className={tone(c.pnl)}>
                  {money(c.pnl)} <small>({pctText(c.retPct)})</small>
                </b>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Start again</h2>
          <div className="dm-fields">
            <label className="cd-f">
              <span>Demo capital (₹)</span>
              <input type="number" inputMode="decimal" min="1" value={newCap} onChange={(e) => setNewCap(e.target.value)} />
            </label>
          </div>
          <button
            className="btn wide"
            onClick={() => {
              if (window.confirm('Reset the demo account? All demo positions and history are cleared.')) setPaper((acc) => ({ ...newAccount(num(newCap, 100000)), auto: Object.fromEntries(Object.entries(acc.auto).map(([k, v]) => [k, { ...v, since: nowIST() }])) }));
            }}
          >
            Reset demo account
          </button>
        </section>
      </div>
    </div>
  );
}

export default function DemoPage({ onClose, symbols, appliedList, paramsOf, cfgOf, paper, setPaper, feed, onTakeSignals, preset }) {
  const [tab, setTab] = useState(preset?.tab || 'backtest');
  return (
    <div className="page demo-page" role="dialog" aria-label="Demo trading and back-test">
      <header className="page-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back">
          <Icon d={ICONS.back || ICONS.chevL || ICONS.close} size={20} />
        </button>
        <h1>Demo &amp; Back-test</h1>
      </header>
      <div className="dm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'backtest'} className={tab === 'backtest' ? 'on' : ''} onClick={() => setTab('backtest')}>
          Back-test
        </button>
        <button role="tab" aria-selected={tab === 'demo'} className={tab === 'demo' ? 'on' : ''} onClick={() => setTab('demo')}>
          Demo trading
        </button>
      </div>
      <div className="page-scroll">
        {tab === 'backtest' ? <BacktestTab symbols={symbols} appliedList={appliedList} paramsOf={paramsOf} cfgOf={cfgOf} preset={preset} /> : <DemoTab symbols={symbols} appliedList={appliedList} paper={paper} setPaper={setPaper} feed={feed} onTakeSignals={onTakeSignals} />}
      </div>
    </div>
  );
}
