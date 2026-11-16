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
  const [err, setErr] = useState('');
  const submit = () => {
    const capital = num(bal, 0);
    if (!name.trim()) return setErr('Give the account a name.');
    if (!(capital >= 1000)) return setErr('Starting balance must be at least ₹1,000.');
    onCreate({ name: name.trim(), capital, charges: 0 });
  };
  return (
    <section className="card dm-form acc-form">
      <h2>{first ? 'Open your paper trading account' : 'Open a new paper account'}</h2>
      <p className="muted small">Practise with virtual money at real market prices. No real order is ever placed. Give it a name, pick the balance and open it.</p>
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

function FundsBox({ acc, onFunds }) {
  const [amt, setAmt] = useState('');
  const [msg, setMsg] = useState('');
  const go = (kind) => {
    const e = onFunds(acc.id, kind, num(amt, 0));
    if (e) setMsg(e);
    else {
      setMsg(kind === 'add' ? 'Balance added.' : 'Balance withdrawn.');
      setAmt('');
    }
  };
  return (
    <div className="acc-funds">
      <input type="number" inputMode="decimal" min="1" placeholder="Amount (₹)" value={amt} onChange={(e) => { setAmt(e.target.value); setMsg(''); }} aria-label="Amount" />
      <button className="btn primary" onClick={() => go('add')}>
        Add balance
      </button>
      <button className="btn" onClick={() => go('withdraw')}>
        Withdraw
      </button>
      {msg && <small className="muted acc-msg">{msg}</small>}
    </div>
  );
}

// Accounts screen: only the paper accounts, their balance, opening a new one, adding and withdrawing balance
export default function AccountsPage({ papers, feed, onCreate, onSelect, onDelete, onFunds }) {
  const [, force] = useState(0);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);
  const priceOf = (s) => feed.quotes[s]?.p ?? null;
  const list = papers.accounts;

  return (
    <div className="acc">
      <header className="acc-head">
        <div>
          <h1>Accounts</h1>
          <p className="muted small">Paper trading accounts (virtual money, no real orders).</p>
        </div>
        {list.length > 0 && !adding && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon d={ICONS.plus} size={14} /> New account
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

      <div className="acc-grid">
        {list.map((a) => {
          const eq = equityOf(a, priceOf);
          const pl = eq - a.capital;
          const active = papers.active === a.id;
          return (
            <article key={a.id} className={`card acc-card ${active ? 'active' : ''}`} onClick={() => !active && onSelect(a.id)}>
              <div className="acc-top">
                <b className="acc-name">{a.name}</b>
                {active ? (
                  <span className="badge on">ACTIVE</span>
                ) : (
                  <button className="btn" onClick={() => onSelect(a.id)}>
                    Use this account
                  </button>
                )}
              </div>
              <div className="dm-hero">
                <span className="muted small">Balance</span>
                <b className={tone(pl)}>{money(eq)}</b>
                <span className={`dm-pl ${tone(pl)}`}>
                  {pl >= 0 ? '+' : ''}
                  {money(pl)} ({pctText((pl / a.capital) * 100)})
                </span>
              </div>
              <div className="acc-meta muted small">
                <span>Free cash {money(a.cash)}</span>
                <span>In trades {money(investedOf(a))}</span>
              </div>
              <FundsBox acc={a} onFunds={onFunds} />
              <button
                className="acc-del"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${a.name}"? All its positions and history will be lost.`)) onDelete(a.id);
                }}
              >
                Delete account
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
