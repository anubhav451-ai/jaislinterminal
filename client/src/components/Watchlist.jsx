import React, { useState } from 'react';
import { useTickRender, changeOf } from '../lib/hooks.js';
import { fmtNum } from '../lib/time.js';
import Icon, { ICONS } from './Icon.jsx';

const GROUPS = [
  ['nifty50', 'Nifty 50'],
  ['banknifty', 'Bank Nifty'],
  ['all', 'All'],
  ['watch', '★ Mine'],
];

export default function Watchlist({ symbols, feed, active, signals, watch, onToggleWatch, onSelect }) {
  const watched = new Set(watch || []);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('nifty50');
  const [sort, setSort] = useState('default');
  const flash = useTickRender(feed);

  const term = q.trim().toLowerCase();
  const pctOf = (s) => changeOf(feed.quotes[s.symbol]).pct ?? -Infinity;
  let rows = symbols.filter((s) => (group === 'watch' ? watched.has(s.symbol) : s.index || group === 'all' || s.groups?.includes(group)));
  rows = rows.filter((s) => !term || s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));
  const idx = rows.filter((s) => s.index);
  let stocks = rows.filter((s) => !s.index);
  if (sort === 'gain') stocks = [...stocks].sort((a, b) => pctOf(b) - pctOf(a));
  if (sort === 'loss') stocks = [...stocks].sort((a, b) => pctOf(a) - pctOf(b));
  if (sort === 'name') stocks = [...stocks].sort((a, b) => a.symbol.localeCompare(b.symbol));
  rows = [...idx, ...stocks];

  return (
    <aside className="watch">
      <div className="watch-head">
        <input className="search" placeholder="Search stock…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stock" />
        <div className="seg small">
          {GROUPS.map(([id, l]) => (
            <button key={id} className={group === id ? 'on' : ''} onClick={() => setGroup(id)}>
              {l}
            </button>
          ))}
        </div>
        <div className="seg small">
          {[
            ['default', 'Default'],
            ['gain', 'Gainers'],
            ['loss', 'Losers'],
            ['name', 'A–Z'],
          ].map(([id, l]) => (
            <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="watch-cols">
        <span>Symbol</span>
        <span>Last</span>
        <span>Chg%</span>
      </div>
      <div className="watch-list">
        {rows.map((s) => {
          const x = feed.quotes[s.symbol];
          const { pct, dir } = changeOf(x);
          return (
            <button key={s.symbol} className={`wrow ${active === s.symbol ? 'active' : ''} ${signals?.[s.symbol]?.length ? 'has-setup' : ''}`} onClick={() => onSelect(s.symbol)}>
              <span className="wsym">
                <b>
                  {s.symbol} {signals?.[s.symbol]?.length > 0 && <span className={`badge ${signals[s.symbol][0].side === 'sell' ? 'sell' : 'buy'}`}>{signals[s.symbol][0].side === 'sell' ? 'SELL' : 'BUY'}</span>}
                </b>
                <small>{s.name}</small>
              </span>
              <span className={`wlast ${flash[s.symbol] ? 'flash-' + flash[s.symbol] : ''}`}>{fmtNum(x?.p)}</span>
              <span className={`wchg ${dir}`}>{pct == null ? '–' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span>
              {!s.index && (
                <span
                  role="button"
                  tabIndex={0}
                  className={`star ${watched.has(s.symbol) ? 'on' : ''}`}
                  aria-label={watched.has(s.symbol) ? `Remove ${s.symbol} from watchlist` : `Add ${s.symbol} to watchlist`}
                  aria-pressed={watched.has(s.symbol)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWatch(s.symbol);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleWatch(s.symbol);
                    }
                  }}
                >
                  <Icon d={ICONS.star} size={15} fill={watched.has(s.symbol) ? 'currentColor' : 'none'} />
                </span>
              )}
            </button>
          );
        })}
        {!rows.length && <p className="empty">{group === 'watch' && !term ? 'Your list is empty. Tap the star on a stock to add it.' : 'No stocks match your search.'}</p>}
      </div>
    </aside>
  );
}
