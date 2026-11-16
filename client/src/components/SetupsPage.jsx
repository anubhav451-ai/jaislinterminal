import { store } from '../lib/store.js';
import React, { useMemo, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { useNowShift } from '../lib/hooks.js';
import { agoText, isFresh, strategyById } from '../lib/strategy.js';
import { fmtNum, INTERVALS } from '../lib/time.js';

// time ranges (minutes). 'active' = setups that are still current, 'all' = every stock of the strategy with its last setup
const PRESETS = [
  ['active', 'Active now'],
  ['5', '5 min'],
  ['10', '10 min'],
  ['15', '15 min'],
  ['30', '30 min'],
  ['60', '1 hour'],
  ['600', '10 hours'],
  ['1440', '24 hours'],
  ['2880', '2 days'],
  ['4320', '3 days'],
  ['10080', '7 days'],
  ['21600', '15 days'],
  ['43200', '30 days'],
  ['all', 'All stocks · last setup'],
];

const winText = (w) => {
  const p = PRESETS.find(([id]) => id === w);
  if (p) return p[0] === 'active' || p[0] === 'all' ? p[1] : `last ${p[1]}`;
  const m = Number(w);
  if (m % 1440 === 0) return `last ${m / 1440} day${m / 1440 > 1 ? 's' : ''}`;
  if (m % 60 === 0) return `last ${m / 60} hour${m / 60 > 1 ? 's' : ''}`;
  return `last ${m} min`;
};

// Full-screen "Setups" section: filter by strategy and by how long ago the setup formed.
export default function SetupsPage({ symbols, signals, history, appliedList, onOpenSetup, onClose }) {
  const now = useNowShift(30000);
  const [win, setWin] = useState(() => {
    try {
      return store.getItem('n50.setupwin') || 'all';
    } catch {
      return 'all';
    }
  });
  const [stratId, setStratId] = useState(null);
  const [side, setSide] = useState('both'); // both | buy | sell
  const [q, setQ] = useState(''); // search box: symbol or company name
  const [showCustom, setShowCustom] = useState(false);
  const [cNum, setCNum] = useState('3');
  const [cUnit, setCUnit] = useState('1440');
  const pick = (w) => {
    setWin(w);
    try {
      store.setItem('n50.setupwin', w);
    } catch {}
  };
  const tf = (id) => INTERVALS.find((i) => i.id === id)?.label || id;
  const nameOf = (sym) => symbols.find((s) => s.symbol === sym)?.name || '';
  const strategies = (appliedList || []).map((a) => ({ id: a.strategyId, name: strategyById(a.strategyId)?.name || 'Strategy', count: a.symbols.length, interval: a.params.interval, symbols: a.symbols }));
  const sel = stratId && strategies.some((s) => s.id === stratId) ? stratId : null;
  const isPreset = PRESETS.some(([id]) => id === win);

  // Every stock of the chosen strategy(ies) is always listed. Stocks that have a setup (in the chosen time range / side)
  // come first and are highlighted (green = BUY, red = SELL); the rest follow as plain rows.
  const rows = useMemo(() => {
    const out = [];
    const qq = q.trim().toLowerCase();
    const sideOk = (x) => side === 'both' || x.side === side;
    const secs = win === 'active' || win === 'all' ? null : Number(win) * 60;
    for (const s of strategies) {
      if (sel && s.id !== sel) continue;
      for (const symbol of s.symbols) {
        if (qq && !symbol.toLowerCase().includes(qq) && !nameOf(symbol).toLowerCase().includes(qq)) continue;
        const mine = (history?.[symbol] || []).filter((x) => x.strategyId === s.id);
        let evs;
        if (win === 'active') evs = (signals?.[symbol] || []).filter((x) => x.strategyId === s.id && sideOk(x));
        else if (win === 'all') evs = mine.filter(sideOk);
        else evs = mine.filter((x) => sideOk(x) && x.formedAt <= now + 60 && now - x.formedAt <= secs);
        evs = [...evs].sort((a, b) => b.formedAt - a.formedAt);
        const ev = evs[0] || null;
        out.push({ symbol, strategyId: s.id, interval: s.interval, ev, count: evs.length, hit: !!ev });
      }
    }
    return out.sort((a, b) => Number(b.hit) - Number(a.hit) || (b.ev?.formedAt || 0) - (a.ev?.formedAt || 0) || a.symbol.localeCompare(b.symbol));
  }, [win, sel, side, q, signals, history, appliedList, now]); // eslint-disable-line

  const stocks = new Set(rows.filter((r) => r.hit).map((r) => r.symbol)).size;
  const applyCustom = () => {
    const n = Math.max(1, Math.round(Number(cNum) || 0));
    pick(String(n * Number(cUnit)));
  };

  return (
    <div className="page" role="dialog" aria-label="Setups">
      <header className="page-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back">
          <Icon d={ICONS.back} />
        </button>
        <h1>Setups</h1>
      </header>
      <div className="page-scroll">
        <section className="card filters">
          <label className="dd">
            <span>Strategy</span>
            <select value={sel || ''} onChange={(e) => setStratId(e.target.value || null)} aria-label="Strategy">
              <option value="">All strategies</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {tf(s.interval)} ({s.count} stocks)
                </option>
              ))}
            </select>
          </label>
          <label className="dd">
            <span>Time range</span>
            <select
              value={showCustom ? '__custom' : win}
              onChange={(e) => {
                if (e.target.value === '__custom') setShowCustom(true);
                else {
                  setShowCustom(false);
                  pick(e.target.value);
                }
              }}
              aria-label="Time range"
            >
              {PRESETS.map(([id, label]) => (
                <option key={id} value={id}>
                  {id === 'active' || id === 'all' ? label : `Last ${label}`}
                </option>
              ))}
              {!isPreset && <option value={win}>{`Custom: ${winText(win)}`}</option>}
              <option value="__custom">Custom…</option>
            </select>
          </label>
          <label className="dd dd-search">
            <span>Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stock name or symbol" aria-label="Search stocks" autoComplete="off" />
          </label>
          <label className="dd">
            <span>Buy / Sell</span>
            <select value={side} onChange={(e) => setSide(e.target.value)} aria-label="Buy or Sell">
              <option value="both">Both (Buy + Sell)</option>
              <option value="buy">Buy only</option>
              <option value="sell">Sell only</option>
            </select>
          </label>
          {!strategies.length && <p className="muted small">No strategy is applied to any stock yet. Open the Strategy tab, pick a strategy and add stocks to it.</p>}
          {showCustom && (
            <div className="custom-win">
              <span className="muted small">Last</span>
              <input type="number" min="1" inputMode="numeric" value={cNum} onChange={(e) => setCNum(e.target.value)} aria-label="Custom time range" />
              <select value={cUnit} onChange={(e) => setCUnit(e.target.value)} aria-label="Unit">
                <option value="1">minutes</option>
                <option value="60">hours</option>
                <option value="1440">days</option>
              </select>
              <button
                className="btn primary"
                onClick={() => {
                  applyCustom();
                  setShowCustom(false);
                }}
              >
                Set
              </button>
            </div>
          )}
        </section>

        <p className="muted small">
          {rows.length} stock{rows.length === 1 ? '' : 's'} · {stocks} with a setup ({winText(win)}
          {side !== 'both' ? ` · ${side.toUpperCase()} only` : ''}) · setups on top
        </p>

        <div className="setup-list">
          {rows.map((r) => {
            const d = strategyById(r.strategyId);
            const e = r.ev;
            return (
              <button key={`${r.strategyId}-${r.symbol}`} className={`setup-row ${r.hit && e ? (isFresh(e, now) ? 'fresh' : 'hit') : 'idle'} ${r.hit && e ? (e.side === 'sell' ? 'is-sell' : 'is-buy') : ''}`} onClick={() => onOpenSetup({ symbol: r.symbol, strategyId: r.strategyId, interval: r.interval, time: e?.time })}>
                {e ? <span className={`badge ${e.side === 'sell' ? 'sell' : 'buy'}`}>{e.side === 'sell' ? 'SELL' : 'BUY'}</span> : <span className="badge">–</span>}
                <span className="pr-main">
                  <b>{r.symbol}</b>
                  <small>
                    {d?.name || 'Strategy'} · {tf(r.interval)}
                    {win !== 'active' && r.count > 1 ? ` · ${r.count} setups` : ''}
                  </small>
                  <small>{nameOf(r.symbol)}</small>
                </span>
                <span className="setup-meta">
                  {e ? (
                    <>
                      <b>{fmtNum(e.price)}</b>
                      {e.stop != null && e.target != null && (
                        <small className="setup-lv">
                          SL {fmtNum(e.stop)} · TP {fmtNum(e.target)}
                        </small>
                      )}
                      <small className={isFresh(e, now) ? 'fresh-text' : ''}>{agoText(now - e.formedAt)}</small>
                    </>
                  ) : (
                    <small>{win === 'all' ? 'No setup yet' : `No setup · ${winText(win)}`}</small>
                  )}
                </span>
              </button>
            );
          })}
          {!rows.length && (
            <div className="empty-state">
              <Icon d={ICONS.bell} size={30} />
              <p>{q.trim() ? `No stock matches "${q.trim()}".` : 'No stocks are selected for this strategy yet.'}</p>
              <p className="muted small">Open the Strategy tab, pick a strategy and add stocks to it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
