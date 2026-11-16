import React, { useMemo, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';

// Full-screen "which stocks?" page. The Apply button is pinned at the bottom so it can never be hidden.
export default function StockPicker({ symbols, initial, title, onSave, onCancel }) {
  const stocks = useMemo(() => symbols.filter((s) => !s.index), [symbols]);
  const [sel, setSel] = useState(() => new Set(initial));
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = stocks.filter((s) => !term || s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));

  const toggle = (sym) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(sym)) n.delete(sym);
      else n.add(sym);
      return n;
    });
  const setGroup = (g) => setSel(new Set(stocks.filter((s) => g === 'all' || s.groups?.includes(g)).map((s) => s.symbol)));
  const changed = sel.size !== initial.length || initial.some((x) => !sel.has(x));

  return (
    <div className="page" role="dialog" aria-label="Select stocks">
      <header className="page-top">
        <button className="icon-btn" onClick={onCancel} aria-label="Close">
          <Icon d={ICONS.close} />
        </button>
        <h1>{title || 'Select stocks'}</h1>
      </header>
      <div className="page-scroll">
        <p className="muted small picker-sub">Tick the stocks this strategy should watch.</p>
        <div className="picker-chips">
          <button className="chip" onClick={() => setGroup('all')}>
            All ({stocks.length})
          </button>
          <button className="chip" onClick={() => setGroup('nifty50')}>
            Nifty 50
          </button>
          <button className="chip" onClick={() => setGroup('banknifty')}>
            Bank Nifty
          </button>
          <button className="chip" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
        <input className="search" placeholder="Search stock…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stock" />
        <div className="picker-list">
          {shown.map((s) => (
            <label key={s.symbol} className={`picker-row ${sel.has(s.symbol) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.has(s.symbol)} onChange={() => toggle(s.symbol)} />
              <span className="pr-main">
                <b>{s.symbol}</b>
                <small>{s.name}</small>
              </span>
              <span className="muted small">{s.groups?.includes('banknifty') ? (s.groups.includes('nifty50') ? 'Nifty · Bank' : 'Bank Nifty') : 'Nifty 50'}</span>
            </label>
          ))}
          {!shown.length && <p className="empty">No stocks match.</p>}
        </div>
      </div>
      <footer className="page-foot">
        <span className="muted">{sel.size} selected</span>
        <span className="grow" />
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onSave([...sel])} disabled={!changed && sel.size === 0}>
          {sel.size ? `Apply to ${sel.size} stock${sel.size > 1 ? 's' : ''}` : initial.length ? 'Remove all' : 'Apply'}
        </button>
      </footer>
    </div>
  );
}
