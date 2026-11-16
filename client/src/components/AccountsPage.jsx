import React, { useEffect, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { equityOf, investedOf, money } from '../lib/paper.js';

const BALANCES = [
  ['₹10K', 10000],
  ['₹50K', 50000],
  ['₹1L', 100000],
  ['₹5L', 500000],
  ['₹10L', 1000000],
  ['₹25L', 2500000],
];
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
const pctText = (n) => (n == null || !Number.isFinite(n) ? '–' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// Form to open a paper-trading account: name, starting balance, charges
export function OpenAccountForm({ onCreate, onCancel, nextNo = 1, first = false }) {
  const [name, setName] = useState(`Paper account ${nextNo}`);
  const [bal, setBal] = useState('100000');
  const [charges, setCharges] = useState('0');
  const [err, setErr] = useState('');
  const submit = () => {
    const capital = num(bal, 0);
    if (!name.trim()) return setErr('Give the account a name.');
    if (!(capital >= 1000)) return setErr('Starting balance must be at least ₹1,000.');
    if (num(charges, 0) < 0 || num(charges, 0) > 5) return setErr('Charges per side must be between 0 and 5 %.');
    onCreate({ name: name.trim(), capital, charges: num(charges, 0) });
  };
  return (
    <section className="card dm-form acc-form">
      <h2>{first ? 'Open your paper trading account' : 'Open a new paper account'}</h2>
      <p className="muted small">Practise with virtual money at real market prices. No real order is ever placed. Pick a starting balance and open the account.</p>
      <label className="cd-f">
        <span>Account name</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="cd-f">
        <span>Starting balance (₹)</span>
        <div className="dm-chips" role="group" aria-label="Starting balance">
          {BALANCES.map(([l, v]) => (
            <button key={v} className={num(bal, 0) === v ? 'sel' : ''} onClick={() => setBal(String(v))}>
              {l}
            </button>
          ))}
        </div>
        <input type="number" inputMode="decimal" min="1000" value={bal} onChange={(e) => setBal(e.target.value)} aria-label="Custom starting balance" />
      </div>
      <label className="cd-f">
        <span>Charges per side (%) — brokerage, taxes (0 = none)</span>
        <input type="number" inputMode="decimal" min="0" max="5" step="0.01" value={charges} onChange={(e) => setCharges(e.target.value)} />
      </label>
      {err && (
        <p className="auth-err" role="alert">
          {err}
        </p>
      )}
      <div className="acc-actions">
        <button className="btn primary" onClick={submit}>
          Open account with {money(num(bal, 0))}
        </button>
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

export default function AccountsPage({ papers, feed, onCreate, onSelect, onDelete, onRename, onReset, onOpenPaper }) {
  const [, force] = useState(0);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);
  const priceOf = (s) => feed.quotes[s]?.p ?? null;
  const list = papers.accounts;
  const rows = list.map((a) => {
    const eq = equityOf(a, priceOf);
    return { a, eq, pl: eq - a.capital };
  });
  const totalEq = rows.reduce((s, r) => s + r.eq, 0);
  const totalPl = rows.reduce((s, r) => s + r.pl, 0);
  const totalCap = rows.reduce((s, r) => s + r.a.capital, 0);

  return (
    <div className="acc">
      <header className="acc-head">
        <div>
          <h1>Accounts</h1>
          <p className="muted small">Your paper trading (virtual money) accounts. Real orders are never placed.</p>
        </div>
        {list.length > 0 && !adding && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon d={ICONS.plus} size={14} /> Open new account
          </button>
        )}
      </header>

      {(adding || list.length === 0) && (
        <OpenAccountForm
          first={list.length === 0}
          nextNo={list.length + 1}
          onCancel={list.length ? () => setAdding(false) : null}
          onCreate={(v) => {
            onCreate(v);
            setAdding(false);
          }}
        />
      )}

      {list.length > 0 && (
        <section className="card acc-total">
          <div className="dm-stats">
            <div className="dm-stat">
              <span>Accounts</span>
              <b>{list.length}</b>
            </div>
            <div className="dm-stat">
              <span>Total value</span>
              <b>{money(totalEq)}</b>
            </div>
            <div className="dm-stat">
              <span>Total profit / loss</span>
              <b className={tone(totalPl)}>{money(totalPl)}</b>
              <small className={tone(totalPl)}>{pctText(totalCap ? (totalPl / totalCap) * 100 : null)}</small>
            </div>
          </div>
        </section>
      )}

      <div className="acc-grid">
        {rows.map(({ a, eq, pl }) => {
          const active = papers.active === a.id;
          const openPl = a.positions.reduce((s, p) => s + (priceOf(p.symbol) == null ? 0 : (p.side === 'buy' ? 1 : -1) * (priceOf(p.symbol) - p.entry) * p.qty), 0);
          return (
            <article key={a.id} className={`card acc-card ${active ? 'active' : ''}`}>
              <div className="acc-top">
                <b className="acc-name">{a.name}</b>
                {active && <span className="badge on">ACTIVE</span>}
              </div>
              <div className="dm-hero">
                <span className="muted small">Account value</span>
                <b className={tone(pl)}>{money(eq)}</b>
                <span className={`dm-pl ${tone(pl)}`}>
                  {pl >= 0 ? '+' : ''}
                  {money(pl)} ({pctText((pl / a.capital) * 100)}) since {money(a.capital)}
                </span>
              </div>
              <div className="acc-meta muted small">
                <span>Cash {money(a.cash)}</span>
                <span>In trades {money(investedOf(a))}</span>
                <span className={tone(openPl)}>Open P/L {money(openPl)}</span>
                <span>
                  {a.positions.length} open · {a.closed.length} closed
                </span>
                <span>Charges {a.charges || 0}% per side</span>
                <span>Opened {new Date(a.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
              <div className="acc-actions">
                <button
                  className="btn primary"
                  onClick={() => {
                    onSelect(a.id);
                    onOpenPaper();
                  }}
                >
                  Trade
                </button>
                {!active && (
                  <button className="btn" onClick={() => onSelect(a.id)}>
                    Make active
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => {
                    const n = window.prompt('Rename account', a.name);
                    if (n && n.trim()) onRename(a.id, n.trim());
                  }}
                >
                  Rename
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const v = window.prompt(`Reset "${a.name}" with a new starting balance (₹). All its positions and history will be cleared.`, String(a.capital));
                    if (v == null) return;
                    const c = num(v, 0);
                    if (c >= 1000) onReset(a.id, c);
                    else window.alert('Starting balance must be at least ₹1,000.');
                  }}
                >
                  Reset
                </button>
                <button
                  className="btn danger-btn"
                  onClick={() => {
                    if (window.confirm(`Delete "${a.name}"? All its positions and history will be lost.`)) onDelete(a.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
