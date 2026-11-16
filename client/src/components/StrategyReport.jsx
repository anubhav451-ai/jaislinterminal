import React, { useMemo, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { backtest, cfgLabel, dateStr, dayEnd, dayStart, normCfg, PERIODS } from '../lib/backtest.js';
import RiskFields from './RiskFields.jsx';
import { useNowShift } from '../lib/hooks.js';
import { fmtNum, fmtTime, INTERVALS } from '../lib/time.js';

const pct = (v, d = 2) => (v == null || !Number.isFinite(v) ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

function Equity({ points }) {
  if (points.length < 2) return <p className="ss-note">Not enough finished trades for a curve yet.</p>;
  const W = 300;
  const H = 90;
  const vs = points.map((p) => p.v);
  const lo = Math.min(0, ...vs);
  const hi = Math.max(0, ...vs);
  const span = hi - lo || 1;
  const x = (i) => (i / (points.length - 1)) * W;
  const y = (v) => H - 6 - ((v - lo) / span) * (H - 12);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  return (
    <svg className="rp-eq" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Total return after every finished trade">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="rp-zero" />
      <path d={line} className="rp-line" />
    </svg>
  );
}

// Full-screen review of one strategy on one stock (opened from the small panel on the chart).
export default function StrategyReport({ def, params, candles, symbol, stockName, sourceLabel, cfg, onCfg, onOpenInputs, onOpenDemo, onBack, onHidePanel }) {
  const now = useNowShift(60000);
  const c = normCfg(cfg);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [side, setSide] = useState('all'); // all | buy | sell
  const r = useMemo(() => backtest(candles, def, params, now, { cfg: c, from: dayStart(from), to: dayEnd(to) }), [candles, def, params, now, JSON.stringify(c), from, to]); // eslint-disable-line
  const tfLabel = INTERVALS.find((i) => i.id === params.interval)?.label || params.interval;
  const rows = useMemo(() => [...r.trades].reverse().filter((t) => side === 'all' || t.side === side), [r.trades, side]);
  const quick = (days) => {
    if (!days) {
      setFrom('');
      setTo('');
      return;
    }
    const end = r.last != null ? r.last : now;
    setTo(dateStr(end));
    setFrom(dateStr(end - days * 86400));
  };
  const hasBoth = r.buy.n > 0 && r.sell.n > 0;

  return (
    <div className="page" role="dialog" aria-label={`${def.name} report for ${symbol}`}>
      <header className="page-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back to chart">
          <Icon d={ICONS.back} />
        </button>
        <h1>
          {def.name} · {symbol}
        </h1>
        <button className="btn" onClick={onOpenDemo} title="Back-test with money and demo trading">
          Demo / Back-test
        </button>
        <button className="btn" onClick={onOpenInputs} title="Strategy inputs, indicators and colours">
          Inputs
        </button>
        <button className="btn" onClick={onHidePanel} title="Remove the small panel from the chart">
          Remove panel
        </button>
      </header>
      <div className="page-body rp">
        <p className="muted small" style={{ margin: 0 }}>
          {stockName || symbol} · {tfLabel} candles · data: {sourceLabel || 'live feed'}
        </p>

        <div className="card rp-settings">
          <h2>Test settings</h2>
          <p className="muted small" style={{ margin: '0 0 8px' }}>
            Accuracy uses: <b>{cfgLabel(c, !!def.levels)}</b>. Changes show on the chart panel too.
          </p>
          <label className="rf-own rp-pos">
            <input type="checkbox" checked={c.pos} onChange={(e) => onCfg({ pos: e.target.checked })} />
            <span>
              <b>Show Long / Short position on the chart</b>
              <small>Draws a box for every trade: green zone up to the target, red zone down to the stop-loss (like the TradingView position tool). BUY = Long, SELL = Short.</small>
            </span>
          </label>
          <RiskFields cfg={c} onCfg={onCfg} hasOwn={!!def.levels} />
          <div className="ss-filters" style={{ marginTop: 10 }}>
            <label>
              <span>From</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="ss-quick">
            <button onClick={() => quick(30)}>1M</button>
            <button onClick={() => quick(90)}>3M</button>
            <button onClick={() => quick(180)}>6M</button>
            <button onClick={() => quick(0)}>All</button>
          </div>
          <button className="btn wide" style={{ marginTop: 8 }} onClick={onOpenInputs}>
            Strategy inputs, indicators &amp; colours…
          </button>
        </div>

        {r.error ? (
          <div className="card">
            <p className="ss-note">Could not calculate: {r.error}</p>
          </div>
        ) : (
          <>
            <div className="card rp-hero">
              <div
                className="rp-ring"
                style={{ background: r.winRate == null ? 'var(--hover)' : `conic-gradient(var(--accent) ${r.winRate * 3.6}deg, var(--navy) 0)` }}
                aria-label={r.winRate == null ? 'No finished trades' : `Accuracy ${r.winRate.toFixed(1)} percent`}
              >
                <span>
                  <b>{r.winRate == null ? '–' : `${r.winRate.toFixed(0)}%`}</b>
                  <small>accuracy</small>
                </span>
              </div>
              <div className="rp-hero-text">
                <div className="ss-big">
                  {r.wins} <small>won</small> · {r.losses} <small>lost</small>
                </div>
                <div className="ss-sub">
                  out of {r.total} finished trades{r.open ? ` · ${r.open} still open` : ''}
                </div>
                <span className={`ss-verdict ${r.totalRet > 0 ? 'yes' : 'no'}`}>{r.total === 0 ? 'No trades' : r.totalRet > 0 ? 'Profitable' : 'Not profitable'}</span>
              </div>
            </div>

            <div className="card">
              <h2>Recent form</h2>
              <div className="rp-form">
                {[5, 10, 20].map((n) => {
                  const x = r.recent[n];
                  return (
                    <div key={n} className="rp-cell">
                      <small>Last {n} trades</small>
                      <b>{x.n ? `${x.w} / ${x.n} won` : '–'}</b>
                      <span>{x.n ? `${Math.round((x.w / x.n) * 100)}%` : ''}</span>
                    </div>
                  );
                })}
              </div>
              <div className="ss-last">
                <span className="ss-lab">Last {r.last10.length}:</span>
                {r.last10.map((w, i) => (
                  <i key={i} className={w ? 'w' : 'l'} title={w ? 'Won' : 'Lost'} />
                ))}
              </div>
              {r.streak && (
                <p className="ss-note">
                  Now on a {r.streak.n} trade {r.streak.win ? 'winning' : 'losing'} streak. Longest: {r.maxWinStreak} wins in a row, {r.maxLossStreak} losses in a row.
                </p>
              )}
            </div>

            <div className="card">
              <h2>Day, week and month</h2>
              <div className="rp-table" role="table">
                <div className="rp-tr rp-th" role="row">
                  <span>Period</span>
                  <span>Trades</span>
                  <span>Won</span>
                  <span>Lost</span>
                  <span>Return</span>
                </div>
                {PERIODS.map(({ id, label }) => {
                  const p = r.periods[id];
                  return (
                    <div key={id} className="rp-tr" role="row">
                      <span>{label}</span>
                      <span>
                        {p.trades}
                        {p.open ? <small> ({p.open} open)</small> : null}
                      </span>
                      <span className="up">{p.wins}</span>
                      <span className="dn">{p.losses}</span>
                      <span className={cls(p.ret)}>{p.closed ? pct(p.ret, 1) : '–'}</span>
                    </div>
                  );
                })}
              </div>
              <p className="ss-foot">A trade is counted in the period when it was entered. These rows ignore the date filter below.</p>
            </div>

            <div className="card">
              <h2>Profit and loss</h2>
              <div className="ss-grid rp-grid">
                <span>
                  Total return <b className={cls(r.totalRet)}>{pct(r.totalRet, 1)}</b>
                </span>
                <span>
                  Avg / trade <b className={cls(r.avgRet)}>{pct(r.avgRet)}</b>
                </span>
                <span>
                  Avg win <b className="up">{r.wins ? pct(r.avgWin) : '–'}</b>
                </span>
                <span>
                  Avg loss <b className="dn">{r.losses ? pct(r.avgLoss) : '–'}</b>
                </span>
                <span>
                  Best <b>{r.total ? pct(r.best) : '–'}</b>
                </span>
                <span>
                  Worst <b>{r.total ? pct(r.worst) : '–'}</b>
                </span>
                <span>
                  Profit factor <b>{r.pf != null ? r.pf.toFixed(2) : r.wins ? 'no losses' : '–'}</b>
                </span>
                {hasBoth && (
                  <span>
                    BUY {r.buy.w}/{r.buy.n} · SELL {r.sell.w}/{r.sell.n}
                  </span>
                )}
              </div>
              <h2 style={{ marginTop: 6 }}>Total return after each trade</h2>
              <Equity points={r.equity} />
            </div>
          </>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Trades ({rows.length})</h2>
            {hasBoth && (
              <div className="rp-seg" role="group" aria-label="Filter by side">
                {['all', 'buy', 'sell'].map((s) => (
                  <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>
                    {s === 'all' ? 'All' : s.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="ss-note">{r.bars < 3 ? 'Not enough candles loaded yet.' : 'No trades in this period.'}</p>
          ) : (
            <div className="rp-log">
              {rows.slice(0, 300).map((t, i) => (
                <div key={`${t.time}-${i}`} className={`rp-trade ${t.open ? 'open' : t.win ? 'won' : 'lost'}`}>
                  <span className={`badge ${t.side === 'sell' ? 'sell' : 'buy'}`}>{t.side === 'sell' ? 'SELL' : 'BUY'}</span>
                  <span className="rp-when">
                    <b>{fmtTime(t.time, params.interval)}</b>
                    <small>
                      in {fmtNum(t.entry)}
                      {t.open ? ' · still open' : ` → out ${fmtNum(t.exit)}`}
                    </small>
                  </span>
                  <span className={`rp-res ${t.open ? '' : t.win ? 'up' : 'dn'}`}>{t.open ? 'OPEN' : pct(t.ret)}</span>
                </div>
              ))}
              {rows.length > 300 && <p className="ss-note">Showing the newest 300 trades.</p>}
            </div>
          )}
        </div>

        <p className="ss-foot">
          {symbol}: {r.bars} candles{r.first != null ? ` (${dateStr(r.first)} to ${dateStr(r.last)})` : ''}. Every signal on a finished candle is a trade: entry at that candle's close, {cfgLabel(c, !!def.levels)} (or the opposite signal), one
          trade at a time, no brokerage or slippage. Only the candles the data source provides are used. Past results do not promise future profit.
        </p>
      </div>
    </div>
  );
}
