import React, { useState } from 'react';
import Logo from './Logo.jsx';
import { store } from '../lib/store.js';
import Icon, { ICONS } from './Icon.jsx';
import SetupsPage from './SetupsPage.jsx';
import { useTickRender, changeOf, useNowShift } from '../lib/hooks.js';
import { fmtNum, fmtVol, INTERVALS } from '../lib/time.js';
import { agoText, isFresh, strategyById } from '../lib/strategy.js';

const GROUPS = [
  ['nifty50', 'Nifty 50'],
  ['banknifty', 'Bank Nifty'],
  ['all', 'All'],
  ['watch', '★ Watchlist'],
];
const SORTS = [
  ['index', 'Default'],
  ['gain', 'Gainers'],
  ['loss', 'Losers'],
  ['name', 'A–Z'],
];

function load(k, d) {
  try {
    return store.getItem(k) || d;
  } catch {
    return d;
  }
}

const Star = ({ on, onClick, label }) => (
  <span
    role="button"
    tabIndex={0}
    className={`star ${on ? 'on' : ''}`}
    aria-label={label}
    aria-pressed={on}
    title={label}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }
    }}
  >
    <Icon d={ICONS.star} size={17} fill={on ? 'currentColor' : 'none'} />
  </span>
);

export default function Dashboard({ symbols, feed, status, health, signals, history, appliedList, hasStrategy, watch, onToggleWatch, onOpen, onOpenSetup, onOpenDemo }) {
  const now = useNowShift(30000);
  const [group, setGroup] = useState(() => load('n50.dgroup', 'nifty50'));
  const [sort, setSort] = useState('index');
  const [q, setQ] = useState('');
  const [setupsOpen, setSetupsOpen] = useState(false);
  const flash = useTickRender(feed);

  const pickGroup = (g) => {
    setGroup(g);
    try {
      store.setItem('n50.dgroup', g);
    } catch {}
  };

  const indices = symbols.filter((s) => s.index);
  const term = q.trim().toLowerCase();
  const pctOf = (s) => changeOf(feed.quotes[s.symbol]).pct ?? -Infinity;
  const hasSetup = (s) => !!signals?.[s.symbol]?.length;
  const newest = (s) => Math.max(0, ...(signals?.[s.symbol] || []).map((x) => x.formedAt || 0));
  const watched = new Set(watch || []);

  const tf = (id) => INTERVALS.find((i) => i.id === id)?.label || id;
  const nameOf = (sym) => symbols.find((s) => s.symbol === sym)?.name || '';

  // latest setup of a stock, even if it is not active any more
  const lastOf = (sym) => (history?.[sym] || []).slice().sort((a, b) => b.formedAt - a.formedAt)[0] || null;

  const inGroup = symbols.filter((s) => !s.index && (group === 'watch' ? watched.has(s.symbol) : group === 'all' || s.groups?.includes(group)));
  const setupCount = symbols.filter((s) => !s.index && hasSetup(s)).length;
  let rows = inGroup;
  if (term) rows = rows.filter((s) => s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));
  if (sort === 'gain') rows = [...rows].sort((a, b) => pctOf(b) - pctOf(a));
  if (sort === 'loss') rows = [...rows].sort((a, b) => pctOf(a) - pctOf(b));
  if (sort === 'name') rows = [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (hasStrategy) rows = [...rows].sort((a, b) => newest(b) - newest(a)); // newest setups float to the top (stable)

  let up = 0;
  let down = 0;
  for (const s of inGroup) {
    const { ch } = changeOf(feed.quotes[s.symbol]);
    if (ch == null) continue;
    if (ch >= 0) up++;
    else down++;
  }

  const live = status === 'live';
  return (
    <div className="dash">
      <header className="dash-head">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            <Logo />
          </span>
          <div>
          <h1>Jaislin Terminal</h1>
          <p className="muted small">
            <span className={`dot ${live ? 'live' : 'off'}`} />
            {!live ? 'Offline – reconnecting…' : health?.delayed ? 'Delayed 15 min' : 'Live'}
            {health?.label ? ` · ${health.label}` : ''}
          </p>
          </div>
        </div>
      </header>

      <section className="idx-cards" aria-label="Indices">
        {indices.map((s) => {
          const x = feed.quotes[s.symbol];
          const { ch, pct, dir } = changeOf(x);
          return (
            <button key={s.symbol} className="idx-card" onClick={() => onOpen(s.symbol)}>
              <span className="idx-name">{s.name}</span>
              <span className={`idx-price ${flash[s.symbol] ? 'flash-' + flash[s.symbol] : ''}`}>{fmtNum(x?.p)}</span>
              <span className={`idx-chg ${dir}`}>{ch == null ? '–' : `${ch >= 0 ? '+' : ''}${fmtNum(ch)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`}</span>
            </button>
          );
        })}
      </section>

      <div className="dash-controls">
        <div className="ctl-left">
          <div className="seg" role="tablist" aria-label="Group">
            {GROUPS.map(([id, label]) => (
              <button key={id} className={group === id ? 'on' : ''} onClick={() => pickGroup(id)}>
                {label}
              </button>
            ))}
          </div>
          <button className={`chip setup-chip ${setupCount ? 'on' : ''}`} onClick={() => setSetupsOpen(true)} title="Open setups: filter by strategy and time">
            <Icon d={ICONS.bell} size={14} /> Setups ({setupCount})
          </button>
        </div>
        <div className="breadth" title="Advancing / declining stocks">
          <span className="up">▲ {up}</span>
          <span className="down">▼ {down}</span>
        </div>
      </div>
      <div className="dash-controls">
        <label className="search-box">
          <Icon d={ICONS.search} size={16} />
          <input placeholder="Search stock…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stock" />
        </label>
        <div className="seg small" aria-label="Sort">
          {SORTS.map(([id, label]) => (
            <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="stock-grid">
        {rows.map((s) => {
          const x = feed.quotes[s.symbol];
          const { ch, pct, dir } = changeOf(x);
          const sig = [...(signals?.[s.symbol] || [])].sort((a, b) => b.formedAt - a.formedAt)[0];
          const past = !sig ? lastOf(s.symbol) : null;
          return (
            <button key={s.symbol} className={`stock-card ${sig ? (isFresh(sig, now) ? 'has-setup fresh' : 'has-setup') : ''}`} onClick={() => {
                if (sig) onOpenSetup({ symbol: s.symbol, strategyId: sig.strategyId, interval: sig.interval, time: sig.time });
                else onOpen(s.symbol);
              }} title={sig ? sig.name : undefined}>
              <span className="sc-main">
                <b>
                  {s.symbol} {sig && <span className={`badge ${sig.side === 'sell' ? 'sell' : 'buy'}`}>{sig.side === 'sell' ? 'SELL' : 'BUY'}</span>}
                </b>
                <small>{s.name}</small>
              </span>
              <span className="sc-price">
                <span className={`sc-last ${flash[s.symbol] ? 'flash-' + flash[s.symbol] : ''}`}>{fmtNum(x?.p)}</span>
                <span className={`sc-chg ${dir}`}>{pct == null ? '–' : `${ch >= 0 ? '+' : ''}${fmtNum(ch)}  ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span>
              </span>
              <Star on={watched.has(s.symbol)} onClick={() => onToggleWatch(s.symbol)} label={watched.has(s.symbol) ? `Remove ${s.symbol} from watchlist` : `Add ${s.symbol} to watchlist`} />
              {sig ? (
                <span className="sc-setup">
                  {strategyById(sig.strategyId)?.name || sig.name} · {tf(sig.interval)} · {agoText(now - sig.formedAt)}
                </span>
              ) : past ? (
                <span className="sc-setup past">
                  Last setup · {tf(past.interval)} · {agoText(now - past.formedAt)}
                </span>
              ) : (
                x?.v > 0 && <span className="sc-vol muted">Vol {fmtVol(x.v)}</span>
              )}
            </button>
          );
        })}
        {!symbols.length && Array.from({ length: 8 }, (_, i) => <div key={i} className="stock-card skel-card"><i className="skeleton" style={{ width: '50%' }} /><i className="skeleton" style={{ width: '80%' }} /></div>)}
        {!rows.length && symbols.length > 0 && <p className="empty">{!symbols.length ? 'Loading stocks…' : group === 'watch' && !term ? 'Your watchlist is empty. Tap the star on any stock to save it here.' : 'No stocks match your search.'}</p>}
      </div>
      {setupsOpen && (
        <SetupsPage
          symbols={symbols}
          signals={signals}
          history={history}
          appliedList={appliedList}
          onOpenSetup={(ctx) => {
            setSetupsOpen(false);
            onOpenSetup(ctx);
          }}
          onClose={() => setSetupsOpen(false)}
        />
      )}
    </div>
  );
}
